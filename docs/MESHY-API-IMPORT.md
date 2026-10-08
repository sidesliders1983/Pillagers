# Meshy API import

The reusable Meshy adapter reads existing Image-to-3D tasks and imports an
explicitly confirmed successful task into scratch staging. It cannot create,
delete, regenerate, remesh, purchase, or publish an asset.

## Commands

Run from the repository root:

```powershell
node scripts/meshy-api.mjs list --page-num 1 --page-size 10 --sort-by -created_at
node scripts/meshy-api.mjs status --task-id EXACT_EXISTING_TASK_ID
node scripts/meshy-api.mjs download --task-id EXACT_EXISTING_TASK_ID --confirm-task-id EXACT_EXISTING_TASK_ID --out scratch/meshy-api/NEW_BUNDLE
```

An ID is supplied explicitly. A list result never automatically becomes a
download target. Download requires identical task ID and confirmation values,
a matching API task response, and status SUCCEEDED. Omitting --out produces a
stable task-derived directory under scratch/meshy-api; an existing directory
causes an error.

The supported operations use the documented
[Image-to-3D task list and retrieval API](https://docs.meshy.ai/en/api/image-to-3d):
GET https://api.meshy.ai/openapi/v1/image-to-3d and GET on its task-ID path.
Only the returned GLB is eligible for download.

## Credential handling

The server-side adapter uses MESHY_API_KEY from the process environment, or
.env.meshy.local at the workspace root when Git confirms that the file is
ignored. The local file must be a small regular file and may contain only one
MESHY_API_KEY assignment and comments. An optional export prefix and matching
single or double quotes are accepted.

The CLI has no credential argument. Never copy a key into source, a command
argument, a report, browser state, client code, or a VITE_ environment variable.
The current user configured the ignored local key file; inspecting or printing
its contents is unnecessary.

Bearer authorization goes only to api.meshy.ai. Asset requests carry no
authorization header, omit browser credentials and referrer information, and
accept only HTTPS GLB URLs on assets.meshy.ai without alternate ports, URL
credentials, or fragments. Redirects are blocked at Fetch and response checks;
they are never followed with credentials. API response bodies are limited to
4 MiB and GLB downloads to 512 MiB by default.

Success output includes task summaries and local file metadata. Error messages
omit remote response bodies, signed asset URLs, and credential values.
Provenance records the API and asset hosts while omitting the signed asset URL.

## Browser pilot visibility

On 2026-10-03 the authenticated first task-list request returned an empty array.
This confirms an accepted API credential and no tasks returned on that page.
Whether the existing browser-generated cream-tunic pilot can be retrieved by
its exact task ID remains UNKNOWN until an explicit status lookup succeeds.
An empty list does not establish browser/API library interoperability and does
not justify automatic regeneration or reuse of browser session credentials.

The user separately authorized one fallback regeneration. Any paid one-off
pilot belongs in a dedicated scratch script with fixed source hash and
parameters, a balance check, and an exclusive persisted creation journal.
An unknown creation outcome must be resolved from that journal rather than
automatically repeated. The reusable CLI and client remain GET-only.

## Staging and provenance

A download validates the full GLB before writing model.glb and provenance.json
into a temporary sibling directory, then commits the completed bundle under
scratch/meshy-api. Output must be a new subdirectory there. The adapter rejects
paths outside staging and ancestors that resolve through symlinks or junctions.
It never writes public assets, the character registry, or runtime files.

Structural validation checks GLB version and length, chunk order and sizes,
glTF 2.0 metadata, mesh primitives, a single embedded buffer, buffer-view
bounds, and the absence of external image or buffer URIs. This does not certify
appearance, anatomy, native segmentation, topology, rig compatibility, texture
quality, or the complete glTF schema. Those still require the Character Lab
quality review before any runtime promotion.

Provenance includes provider, task ID/type, import ID/time, task summary,
container version, byte count, and SHA-256. The source task ID is kept only
after matching the explicitly supplied ID; credential substrings are redacted.

## Offline verification

```powershell
node --test tests/meshy-api.test.mjs
```

All 20 tests use mock HTTP responses and fake credentials. Key-file fixtures
and import bundles are created only inside temporary workspaces. Coverage
includes GET-only surface, authorization confinement, opaque IDs, pagination,
redacted HTTP/network errors, redirect blocking, size limits, explicit task
confirmation, allowed asset URLs, staging and overwrite rejection, structural
GLB failures, safe key-file parsing, and CLI behavior. The suite makes no
Meshy requests and does not inspect the real local credential file.
