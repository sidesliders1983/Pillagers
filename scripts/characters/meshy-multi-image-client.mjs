// Server-side adapter for the gated outfit pipeline. No filesystem or credential loading.
import sharp from 'sharp';
import {MeshyApiError, validateGlb} from './meshy-api-client.mjs';

const API_URL = 'https://api.meshy.ai/openapi/v1/multi-image-to-3d';
const TASK_TYPE = 'multi-image-to-3d';
const VIEWS = ['front', 'back', 'left', 'right'];
const JSON_LIMIT = 4 * 1024 * 1024;
const IMAGE_LIMIT = 10 * 1024 * 1024;
const GLB_LIMIT = 512 * 1024 * 1024;
const IMAGE_PIXEL_LIMIT = 16 * 1024 * 1024;
const STATUSES = ['PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELED'];

// Keep the approved image appearance and initial geometry; fitting is a separate stage.
export const MESHY_MULTI_IMAGE_SETTINGS = Object.freeze({
  ai_model: 'meshy-7.1',
  geometry_resolution: 'standard',
  texture_resolution: '2k',
  image_enhancement: false,
  auto_size: false,
  pose_mode: '',
  should_texture: true,
  should_remesh: false,
  enable_pbr: false,
  remove_lighting: false,
  target_formats: Object.freeze(['glb']),
});

function fail(code, message) {
  throw new MeshyApiError(code, message);
}

function boundedInteger(value, minimum, maximum, message) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('invalid-options', message);
  }
}

function validateKey(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[^\x21-\x7e]/.test(value)) {
    fail('invalid-key', 'A nonempty Meshy API token without whitespace is required.');
  }
  return value;
}

function validateTaskId(value) {
  if (typeof value !== 'string' || !value || value.length > 512 ||
    /[\s\x00-\x1f\x7f/\\?#%]/u.test(value) || value === '.' || value === '..') {
    fail('invalid-task-id', 'Provide the exact Meshy task ID as one safe path segment.');
  }
  return value;
}

function assetUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('invalid-asset-url', 'The task did not return an allowed GLB asset URL.');
  }
  if (url.origin !== 'https://assets.meshy.ai' || url.username || url.password || url.hash ||
    !url.pathname.toLowerCase().endsWith('.glb')) {
    fail('invalid-asset-url', 'Only HTTPS GLB assets on assets.meshy.ai are allowed.');
  }
  return url;
}

function snapshotImage(image, expectedView) {
  if (!image || image.view !== expectedView || !(image.bytes instanceof Uint8Array)) {
    fail('invalid-images', 'Supply local image bytes in front, back, left, right order.');
  }
  if (!image.bytes.byteLength || image.bytes.byteLength > IMAGE_LIMIT) {
    fail('invalid-images', 'Each source image must contain between 1 byte and 10 MiB.');
  }
  return {view: image.view, format: image.format, bytes: Buffer.from(image.bytes)};
}

async function imageDataUri(image) {
  const {bytes} = image;
  let metadata;
  try {
    const decoded = sharp(bytes, {limitInputPixels: IMAGE_PIXEL_LIMIT});
    metadata = await decoded.metadata();
    if (!['png', 'jpeg'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) {
      fail('invalid-images', 'Source images must be single-frame PNG or JPEG images.');
    }
    await decoded.stats();
  } catch {
    fail('invalid-images', 'Source images must be decodable single-frame PNG or JPEG images.');
  }
  const format = image.format === 'jpg' ? 'jpeg' : image.format;
  if (format !== undefined && format !== metadata.format) {
    fail('invalid-images', 'The declared image format does not match its bytes.');
  }
  return 'data:image/' + metadata.format + ';base64,' + bytes.toString('base64');
}

async function creationBody(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
    Object.keys(options).some(key => key !== 'images') ||
    !Array.isArray(options.images) || options.images.length !== VIEWS.length) {
    fail('invalid-images', 'Creation requires exactly four approved cardinal images and no settings overrides.');
  }
  // Snapshot all caller-owned bytes before the first await, including later views.
  const images = VIEWS.map((view, index) => snapshotImage(options.images[index], view));
  const imageUrls = [];
  for (const image of images) {
    imageUrls.push(await imageDataUri(image));
  }
  return JSON.stringify({...MESHY_MULTI_IMAGE_SETTINGS, image_urls: imageUrls});
}

async function readLimited(response, limit) {
  const declared = response.headers?.get('content-length');
  if (declared !== null && declared !== undefined &&
    (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    fail('response-too-large', 'The Meshy response exceeds the allowed size.');
  }
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
    fail('invalid-response', 'The Meshy response did not contain a readable body.');
  }
  const iterator = response.body[Symbol.asyncIterator]();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      let chunk;
      try {
        chunk = await iterator.next();
      } catch {
        fail('request-failed', 'Reading the Meshy response failed; remote details are omitted.');
      }
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) {
        fail('invalid-response', 'The Meshy response body must contain bytes.');
      }
      size += chunk.value.byteLength;
      if (size > limit) fail('response-too-large', 'The Meshy response exceeds the allowed size.');
      chunks.push(Buffer.from(chunk.value));
    }
  } finally {
    // Release a canceled or oversized stream without surfacing provider diagnostics.
    try {
      if (typeof iterator.return === 'function') await iterator.return();
    } catch {
      // The request outcome is already known; cleanup diagnostics are not persisted.
    }
  }
  return Buffer.concat(chunks, size);
}

function parseJson(bytes) {
  try {
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } catch {
    fail('invalid-json', 'The Meshy API response is not valid JSON.');
  }
}

function validateTask(task, expectedId) {
  if (!task || typeof task !== 'object' || Array.isArray(task) || task.type !== TASK_TYPE) {
    fail('invalid-task-response', 'The API did not return a Multi-Image-to-3D task.');
  }
  validateTaskId(task.id);
  if (task.id !== expectedId) fail('task-id-mismatch', 'The returned task ID does not match the requested task.');
  if (!STATUSES.includes(task.status)) fail('invalid-task-response', 'The API returned an unknown task status.');
  return task;
}

function safeSummary(task, key) {
  const summary = {
    id: task.id.split(key).join('[REDACTED]'),
    type: TASK_TYPE,
    status: task.status,
    progress: Number.isFinite(task.progress) && task.progress >= 0 && task.progress <= 100 ?
      task.progress : null,
  };
  for (const name of ['created_at', 'started_at', 'finished_at', 'expires_at']) {
    if (Number.isFinite(task[name])) summary[name] = task[name];
  }
  try {
    summary.hasGlb = Boolean(assetUrl(task.model_urls?.glb));
  } catch {
    summary.hasGlb = false;
  }
  return summary;
}

/**
 * The caller must verify human approval and reserve a submission in its durable ledger first.
 * create() makes one POST only; any failure after dispatch may have created a paid task.
 * Never retry automatically. status()/download() operate only on an explicitly supplied task ID.
 */
export function createMeshyMultiImageClient({
  apiKey,
  fetchImpl = globalThis.fetch,
  maxDownloadBytes = GLB_LIMIT,
  requestTimeoutMs = 30000,
  downloadTimeoutMs = 120000,
} = {}) {
  const key = validateKey(apiKey);
  if (typeof fetchImpl !== 'function') fail('missing-fetch', 'A Fetch implementation is required.');
  boundedInteger(maxDownloadBytes, 20, GLB_LIMIT, 'The GLB size limit must be between 20 bytes and 512 MiB.');
  boundedInteger(requestTimeoutMs, 1, 120000, 'The API timeout must be between 1 and 120000 milliseconds.');
  boundedInteger(downloadTimeoutMs, 1, 300000, 'The download timeout must be between 1 and 300000 milliseconds.');

  async function request(url, {method = 'GET', body, asset = false} = {}) {
    const headers = asset ? {Accept: 'model/gltf-binary, application/octet-stream'} :
      {Accept: 'application/json', Authorization: 'Bearer ' + key};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        ...(body === undefined ? {} : {body}),
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: AbortSignal.timeout(asset ? downloadTimeoutMs : requestTimeoutMs),
      });
    } catch {
      fail('request-failed', 'The Meshy request failed; credentials and remote details are omitted.');
    }
    if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
      fail('invalid-response', 'The Meshy response status is invalid.');
    }
    if (response.redirected || response.status >= 300 && response.status < 400 ||
      response.url && response.url !== url) {
      fail('redirect-blocked', 'Meshy redirects and changed response URLs are blocked.');
    }
    if (!response.ok) {
      fail('http-error', 'The Meshy ' + (asset ? 'asset' : 'API') +
        ' request failed with HTTP ' + response.status + '.');
    }
    return readLimited(response, asset ? maxDownloadBytes : JSON_LIMIT);
  }

  async function rawTask(id) {
    const requested = validateTaskId(id);
    const bytes = await request(API_URL + '/' + encodeURIComponent(requested));
    return validateTask(parseJson(bytes), requested);
  }

  return Object.freeze({
    async create(options) {
      const body = await creationBody(options);
      const result = parseJson(await request(API_URL, {method: 'POST', body}));
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        fail('invalid-create-response', 'The Meshy creation response is missing its task ID.');
      }
      const id = validateTaskId(result.result);
      // A credential-shaped ID cannot be persisted safely or used for reliable resumption.
      if (id.includes(key)) fail('invalid-create-response', 'The Meshy creation response contains an unsafe task ID.');
      return {taskId: id, type: TASK_TYPE};
    },
    async status(id) {
      return safeSummary(await rawTask(id), key);
    },
    async download(id) {
      const task = await rawTask(id);
      if (task.status !== 'SUCCEEDED') {
        fail('task-not-succeeded', 'The Multi-Image-to-3D task has not succeeded.');
      }
      const url = assetUrl(task.model_urls?.glb);
      const bytes = await request(url.href, {asset: true});
      return {bytes, validation: validateGlb(bytes), task: safeSummary(task, key)};
    },
  });
}
