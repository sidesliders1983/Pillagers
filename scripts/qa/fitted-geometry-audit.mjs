// QA only: inspect the final equipped geometry buffers, never change their fit.
export function inspectFittedGeometry(geometry, readPosition) {
  const position = geometry.attributes.position;
  const used = new Set();
  let invalidIndexEntries = 0;
  if (geometry.index) {
    for (let row = 0; row < geometry.index.count; row++) {
      const index = geometry.index.getX(row);
      if (!Number.isInteger(index) || index < 0 || index >= position.count) invalidIndexEntries++;
      else used.add(index);
    }
  } else {
    for (let row = 0; row < position.count; row++) used.add(row);
  }
  const entries = Object.entries(geometry.attributes);
  for (const [name, morphs] of Object.entries(geometry.morphAttributes ?? {})) {
    for (const [index, attribute] of morphs.entries()) entries.push([`morph:${name}:${index}`, attribute]);
  }
  const attributes = entries.map(([name, attribute]) => {
    let referencedRows = 0;
    for (const index of used) if (index < attribute.count) referencedRows++;
    return {name, rows: attribute.count, referencedRows,
      unusedRows: attribute.count - referencedRows,
      missingReferencedRows: used.size - referencedRows};
  });
  // Inspect the actual posed coordinates when supplied by the browser mesh.
  // A valid source buffer can still collapse a face during fitting or skinning.
  const coordinates = new Map();
  let nonFinitePositionRows = 0, degenerateTriangles = 0;
  for (const index of used) {
    const point = readPosition ? readPosition(index)
      : [position.getX(index), position.getY(index), position.getZ(index)];
    if (point.length !== 3 || !point.every(Number.isFinite)) nonFinitePositionRows++;
    coordinates.set(index, point);
  }
  const count = geometry.index?.count ?? position.count;
  for (let row = 0; row + 2 < count; row += 3) {
    const ids = [0, 1, 2].map(offset => geometry.index?.getX(row + offset) ?? row + offset);
    const points = ids.map(index => coordinates.get(index));
    if (points.some(point => !point || point.length !== 3 || !point.every(Number.isFinite))) continue;
    const [a, b, c] = points, u = b.map((v, axis) => v - a[axis]), v = c.map((value, axis) => value - a[axis]);
    const area2 = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    if (area2 < 1e-12) degenerateTriangles++;
  }
  return {unusedPositionRows: position.count - used.size,
    unusedAttributeRows: attributes.reduce((total, a) => total + a.unusedRows, 0),
    missingAttributeRows: attributes.reduce((total, a) => total + a.missingReferencedRows, 0),
    invalidIndexEntries, nonFinitePositionRows, degenerateTriangles, attributes};
}

export function runtimeTriangleBudget(asset) {
  return asset.type === 'garment'
    ? Math.min(4400, asset.budgets.runtimeTriangles)
    : asset.budgets.runtimeTriangles;
}
