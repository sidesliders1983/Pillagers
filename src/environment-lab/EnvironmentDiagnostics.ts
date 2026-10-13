import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
export { environmentOverlays } from '../world/EnvironmentOverlay';

export function renderEnvironmentDiagnostics(container: HTMLElement, world: WorldBlueprint) {
    const zones = world.environment;
    container.hidden = !zones;
    container.replaceChildren();
    if (!zones) return;
    const summary = document.createElement('summary');
    summary.textContent = 'Environment zoning · coverage and legend';
    const description = document.createElement('p');
    description.textContent = 'Ground: green grass, pale sand, brown mud, grey bedrock, blue water. Dark edges mark region boundaries. Scalar overlays: dark = 0, bright = 1; slope saturates at 1 m/m (45°). Aspect: hue follows downhill direction, 0° = north (+Z), 90° = east (+X); flat ground uses 0°. Snow potential is metadata, not rendered snow.';
    const climate = document.createElement('p');
    const config = world.config.environment!;
    climate.textContent = 'Climate calibration: ' + config.meanAnnualTemperatureC + ' °C annual sea-level mean; ' +
        config.lapseRateCPerKm + ' °C/km lapse; wind from ' + config.windFromDegrees + '°. This is stored potential only; no snow is rendered by zoning.';
    const coverage = document.createElement('p');
    coverage.textContent = Object.entries(zones.coverage).map(([ground, count]) =>
        ground + ' ' + (count / zones.primary.length * 100).toFixed(1) + '%').join(' · ') +
        '. Forest is an overlay, not an additional substrate. Mud material blending follows separately.';
    const regions = document.createElement('details'), title = document.createElement('summary'), data = document.createElement('pre');
    title.textContent = zones.regions.length + ' connected ground regions · approximate sampled areas';
    data.style.cssText = 'max-height:12rem;overflow:auto;white-space:pre-wrap';
    data.textContent = zones.regions.map(region => 'Region ' + region.id + ' · ' + region.ground +
        ' · ≈' + region.area + ' m² · neighbors: ' + region.neighbors.join(', ')).join('\n');
    regions.append(title, data);
    container.append(summary, description, climate, coverage, regions);
}
