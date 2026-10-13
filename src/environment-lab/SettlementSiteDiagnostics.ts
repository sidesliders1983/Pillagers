import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments } from 'three';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { footprintBounds } from '../world-generation/PlanSettlement';
import type { Bounds2, WorldBlueprint } from '../world-generation/WorldBlueprint';

/** Native lines only; no additional terrain authority or rival buildings. */
export function createSettlementSiteOverlay(world: WorldBlueprint) {
    const group = new Group();
    const selection = world.siteSelection;
    if (!selection) return group;
    const surface = createBlueprintSurface(world);
    const line = (points: number[], color: number) => {
        if (!points.length) return;
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
        const mesh = new LineSegments(geometry, new LineBasicMaterial({ color, depthTest: false }));
        mesh.renderOrder = 11;
        group.add(mesh);
    };
    const rectangle = (b: Bounds2, color: number) => {
        const corners = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]];
        const points: number[] = [];
        for (let edge = 0; edge < 4; edge++) {
            const a = corners[edge], b = corners[(edge + 1) % 4];
            const steps = Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 2);
            for (let step = 0; step < steps; step++) for (const fraction of [step / steps, (step + 1) / steps]) {
                const x = a[0] + (b[0] - a[0]) * fraction, z = a[1] + (b[1] - a[1]) * fraction;
                points.push(x, surface.surfaceHeightAt(x, z) + .5, z);
            }
        }
        line(points, color);
    };
    selection.candidates.filter(c => c.foundations.length).forEach(c => {
        const { x, z } = c.center, y = surface.surfaceHeightAt(x, z) + .5;
        line([x - 2, y, z, x + 2, y, z, x, y, z - 2, x, y, z + 2], 0x667a89);
    });
    selection.buffers.forEach(bounds => rectangle(bounds, 0xe8c77b));
    if (selection.selected) rectangle(world.settlement.bounds, 0x52f5b0);
    if (world.rivalSite) rectangle(world.rivalSite.bounds, 0xf89cfa);
    for (const b of world.settlement.buildings) rectangle(footprintBounds(b), 0x52f5b0);
    for (const b of world.rivalSite?.foundations ?? []) rectangle(footprintBounds(b), 0xf89cfa);
    const route: number[] = [];
    for (let i = 1; i < selection.connection.length; i++) {
        for (const p of [selection.connection[i - 1], selection.connection[i]]) {
            route.push(p.x, surface.surfaceHeightAt(p.x, p.z) + .8, p.z);
        }
    }
    line(route, 0x74dfff);
    // All rays are measured/stored; a spread of 18 keeps the overlay legible.
    const stride = Math.max(1, Math.floor(selection.visibility.rays.length / 18));
    selection.visibility.rays.filter((_, i) => i % stride === 0).forEach(ray => {
        const a = ray.from, b = ray.blocker ?? ray.to;
        line([a.x, a.y, a.z, b.x, b.y, b.z], ray.visible ? 0xff503f : 0xffb34d);
        if (ray.blocker) line([b.x, b.y, b.z, ray.to.x, ray.to.y, ray.to.z], 0x717d84);
    });
    const berth = selection.harborBerth;
    if (berth) rectangle(footprintBounds({ ...berth.center, id: '', key: '', radius: 9,
        halfWidth: berth.halfBeam, halfDepth: berth.halfLength, rotation: berth.rotation }), 0x74dfff);
    return group;
}

/** All candidate and pair diagnostics are reachable without a huge expanded menu. */
export function renderSettlementSiteDiagnostics(container: HTMLElement, world: WorldBlueprint) {
    container.replaceChildren();
    const selection = world.siteSelection;
    container.hidden = !selection;
    if (!selection) return;
    const summary = document.createElement('summary');
    summary.textContent = 'Settlement placement diagnostics';
    container.append(summary);
    const introduction = document.createElement('p');
    introduction.textContent = `Minimum center distance ${selection.rules.minimumCenterDistance}m · ` +
        `neutral gap ${selection.rules.minimumBufferDistance}m · landing route ${selection.rules.minimumLandingRoute}m. ` +
        'Green: player. Pink: reserved rival, no population. Gold: buffers. Cyan: access. Orange: blocked sightlines.';
    container.append(introduction);
    if (selection.compartments) {
        const coverage = document.createElement('details');
        const title = document.createElement('summary');
        title.textContent = 'Geographical compartment coverage';
        const description = document.createElement('pre');
        description.style.whiteSpace = 'pre-wrap';
        description.textContent = selection.compartments.map(c =>
            `${c.id}: ${c.area}m� lowland; ${c.coreArea}m� broad core; ` +
            `${c.candidateIds.length}/${c.eligibleAnchors} anchors evaluated; ${c.sixParcelFits} six-parcel fits. ` +
            c.reasons.join(' ')).join('\n');
        coverage.append(title, description);
        container.append(coverage);
    }
    const candidates = document.createElement('details');
    const candidateSummary = document.createElement('summary');
    candidateSummary.textContent = selection.candidates.length + ' candidate sites: dimensions, scores and buildability';
    candidates.append(candidateSummary);
    const candidateList = document.createElement('pre');
    candidateList.textContent = selection.candidates.map(c => `${c.id} (${c.compartmentId ?? 'legacy coverage'}) at ${c.center.x},${c.center.z}: ` +
        `score ${c.score}; area ${c.area}m²; mean/max slope ${c.meanSlope.toFixed(3)}/${c.maximumSlope.toFixed(3)}; ` +
        `elevation ${c.elevation.toFixed(1)}m; coast ${c.coastDistance.toFixed(1)}m; ` +
        `bounds X ${c.bounds.minX.toFixed(1)}…${c.bounds.maxX.toFixed(1)}, Z ${c.bounds.minZ.toFixed(1)}…${c.bounds.maxZ.toFixed(1)}; ` +
        `foundations ${c.foundations.length}/6. ` + (c.fitSearch ?
            `Search: ${c.fitSearch.attempts} layouts/orders, ${c.fitSearch.nodes} placements tried, ` +
            `${c.fitSearch.orientationCount} rotations; best partial ${c.fitSearch.maximumPlaced}/6. ` : '') +
        c.reasons.join(' ')).join('\n');
    candidateList.style.whiteSpace = 'pre-wrap';
    candidates.append(candidateList);
    container.append(candidates);
    const label = document.createElement('label');
    label.textContent = 'Candidate pair ';
    const picker = document.createElement('select');
    picker.id = 'world-site-pair';
    selection.pairs.forEach((pair, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = `${pair.playerId} → ${pair.rivalId} · score ${pair.score}`;
        option.selected = pair === selection.selected || selection.selected?.playerId === pair.playerId &&
            selection.selected.rivalId === pair.rivalId;
        picker.append(option);
    });
    label.append(picker);
    const evidence = document.createElement('pre');
    evidence.style.whiteSpace = 'pre-wrap';
    const display = () => {
        const pair = selection.pairs[Number(picker.value)];
        evidence.textContent = pair ?
            `Center distance ${pair.centerDistance.toFixed(1)}m · neutral gap ${pair.bufferDistance.toFixed(1)}m\n` +
            `Landing route ${pair.routeLength ? pair.routeLength + 'm' : 'not evaluated'} · ` +
            `exposed rays ${pair.visibilityComplete === false ? 'at least ' : ''}${pair.exposedRays ?? 'not evaluated'}\n` +
            (pair.visibilityComplete === false ? `Stopped after ${pair.visibilitySamples} samples: exposure already proves rejection.\n` : '') +
            (pair.reasons.length ? pair.reasons.join('\n') : 'Accepted: terrain-hidden and connected.') : selection.reasons.join('\n');
    };
    picker.addEventListener('change', display);
    container.append(label, evidence);
    display();
    const note = document.createElement('p');
    note.textContent = `${selection.visibility.rays.length} exact terrain sightlines checked for the selected pair; ` +
        'the overlay shows a representative subset. Complete rays and candidate evidence are included in Export world. ' +
        'Starting-view hiddenness does not imply fog of war or concealment from an unrestricted overview camera.';
    container.append(note);
}
