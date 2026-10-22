"""Source geometry inspection only: orthographic atlas projections, not game captures."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

root = Path('output/warm-home-lighting-256/inspection')
manifest_path = Path('public/game-assets/houses/lights/manifest.json')
light_assets = json.loads(manifest_path.read_text())['assets'] if manifest_path.exists() else {}
for path in root.glob('*.json'):
    meshes = json.loads(path.read_text())
    points = []
    for mesh in meshes:
        vertices = np.array(mesh['positions']).reshape(-1, 3)
        matrix = np.array(mesh['matrix']).reshape(4, 4).T
        mesh['world'] = (np.c_[vertices, np.ones(len(vertices))] @ matrix.T)[:, :3]
        points.extend(mesh['world'])
    points = np.array(points)
    lo, hi = points.min(0), points.max(0)
    scale = 440 / max((hi - lo)[[0, 2]].max(), (hi - lo)[1])
    sheet = Image.new('RGB', (1000, 1000), '#cbd4d8')
    for side, (axis, sign) in enumerate([(2, 1), (0, 1), (2, -1), (0, -1)]):
        horizontal = 0 if axis == 2 else 2
        canvas = np.full((500, 500, 3), (203, 212, 216), dtype=np.uint8)
        depth = np.full((500, 500), -np.inf)
        for mesh_index, mesh in enumerate(meshes):
            vertices = mesh['world']
            uv = np.array(mesh['uv']).reshape(-1, 2)
            texture = np.array(Image.open(root / f'{path.stem}-{mesh["material"]}.png').convert('RGB'))
            mask_file = Path('public/game-assets/houses/lights') / f'{path.stem}.png'
            mask = np.array(Image.open(mask_file).convert('L').resize(
                (texture.shape[1], texture.shape[0]), Image.Resampling.BILINEAR)) if mask_file.exists() else None
            bindings = light_assets.get(path.stem, {}).get('bindings', [])
            allowed = set(bindings[mesh_index]['triangles']) if bindings else set()
            triangles = np.array(mesh['indices']).reshape(-1, 3)
            projected = np.c_[(vertices[:, horizontal] - (lo[horizontal] + hi[horizontal]) / 2) * scale * sign + 250,
                              465 - (vertices[:, 1] - lo[1]) * scale]
            for triangle_index, indices in enumerate(triangles):
                triangle = projected[indices]
                minimum = np.maximum(np.floor(triangle.min(0)).astype(int), 0)
                maximum = np.minimum(np.ceil(triangle.max(0)).astype(int), 499)
                if np.any(maximum < minimum):
                    continue
                x, y = np.meshgrid(np.arange(minimum[0], maximum[0] + 1), np.arange(minimum[1], maximum[1] + 1))
                a, b, c = triangle
                denominator = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
                if abs(denominator) < 1e-6:
                    continue
                wa = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1])) / denominator
                wb = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1])) / denominator
                wc = 1-wa-wb
                z = wa*vertices[indices[0],axis]*sign + wb*vertices[indices[1],axis]*sign + wc*vertices[indices[2],axis]*sign
                keep = (wa >= 0) & (wb >= 0) & (wc >= 0) & (z > depth[y,x])
                tex = wa[...,None]*uv[indices[0]] + wb[...,None]*uv[indices[1]] + wc[...,None]*uv[indices[2]]
                tx = np.clip((tex[:,:,0]*texture.shape[1]).astype(int), 0, texture.shape[1]-1)
                ty = np.clip((tex[:,:,1]*texture.shape[0]).astype(int), 0, texture.shape[0]-1)
                colors = texture[ty[keep],tx[keep]].copy()
                if mask is not None and triangle_index in allowed:
                    active = mask[ty[keep],tx[keep]] > 10
                    colors[active] = [255, 125, 25]
                canvas[y[keep],x[keep]] = colors
                depth[y[keep],x[keep]] = z[keep]
        image = Image.fromarray(canvas)
        ImageDraw.Draw(image).text((12,12), f'{path.stem} {"XYZ"[axis]} {sign:+}', fill='black')
        sheet.paste(image, ((side % 2)*500, (side // 2)*500))
    sheet.save(root / f'{path.stem}-views.png')
