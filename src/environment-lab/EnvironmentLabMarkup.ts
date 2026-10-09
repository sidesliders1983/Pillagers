/** Controls remain mounted while native details collapse; preview state is preserved. */
export function environmentLabMarkup(seed: number): string {
    return `<main>
        <header>
            <h1>Environment Lab · Ground v0.4</h1>
            <a href="/">Fjordside</a>
            <a href="/character-lab">Character Lab</a>
            <a href="/play">Settlement</a>
        </header>
        <nav aria-label="Preview controls">
            <label>Camera
                <select id="environment-camera">
                    <option value="shore">Shore</option>
                    <option value="village">Village</option>
                    <option value="forest">Forest edge</option>
                    <option value="overview">Overview</option>
                    <option value="landscape">High overlook</option>
                    <option value="water">Water level</option>
                    <option value="close">House &amp; resident close</option>
                </select>
            </label>
            <label>Lighting
                <select id="environment-light">
                    <option value="day">Current day</option>
                    <option value="sun10">Low sun · 10°</option>
                    <option value="sun20">Low sun · 20°</option>
                    <option value="sun30">Low sun · 30°</option>
                    <option value="sun20-front">Low sun · 20° front light</option>
                    <option value="night">Night</option>
                </select>
            </label>
            <label>Quality
                <select id="environment-quality">
                    <option value="standard">Standard</option>
                    <option value="low">Low</option>
                    <option value="legacy">Compatibility fallback</option>
                </select>
            </label>
            <label><input id="environment-pause" type="checkbox">Pause waves &amp; wind</label>
        </nav>
        <details id="environment-settings">
            <summary>Settings</summary>
            <div class="environment-settings-content">
                <fieldset>
                    <legend>World generation &amp; sand study</legend>
                    <div id="environment-world-settings"></div>
                </fieldset>
                <fieldset>
                    <legend>Lighting study</legend>
                    <div class="environment-control-group">
                        <label>Low-sun sky fill<input id="environment-fill" aria-label="Low-sun sky fill" type="number" min="0" max="3" step="0.05" value="0.65" disabled></label>
                        <label>Low-sun exposure<input id="environment-exposure" aria-label="Low-sun exposure" type="number" min="0.5" max="2" step="0.05" value="1.05" disabled></label>
                        <label>PCF shadow radius<input id="environment-shadow-radius" aria-label="PCF shadow radius" type="number" min="0.5" max="4" step="0.5" value="4" disabled></label>
                        <label><input id="environment-hdr" type="checkbox">HDR material lighting</label>
                    </div>
                </fieldset>
                <fieldset>
                    <legend>Scenery &amp; materials</legend>
                    <div class="environment-control-group">
                        <label>Reference seed<input value="${seed}" readonly aria-label="Fixed scene seed"></label>
                        <label>Conifers
                            <select id="environment-conifers" aria-label="Conifers">
                                <option value="ez-tree">EZ-Tree Large · varied heights</option>
                                <option value="kaykit">KayKit FREE conifers</option>
                            </select>
                        </label>
                        <label>Ground materials
                            <select id="environment-material">
                                <option value="regional">Sourced regional maps</option>
                                <option value="baseline">Previous ground v0.2</option>
                            </select>
                        </label>
                        <label><input id="environment-ground" type="checkbox" checked>Ground</label>
                        <label><input id="environment-nature" type="checkbox" checked>Nature</label>
                        <label><input id="environment-village" type="checkbox" checked>Meshy village</label>
                        <label><input id="environment-water" type="checkbox" checked>Water</label>
                        <label><input id="environment-grass" type="checkbox">Optional GrassField</label>
                        <label><input id="environment-fog" type="checkbox" checked>Atmospheric fog</label>
                    </div>
                </fieldset>
            </div>
        </details>
        <canvas id="environment-canvas" aria-label="Fjord environment preview"></canvas>
        <p>Drag to orbit · scroll to zoom. Open Settings for world generation and material studies.</p>
        <p id="environment-status" role="status">Loading required authored scenery…</p>
        <details class="environment-diagnostics">
            <summary>Diagnostics &amp; sources</summary>
            <p id="environment-conifers-status" role="status"></p>
            <p id="environment-lighting-status" role="status"></p>
            <p id="environment-hdr-status" role="status"></p>
            <pre id="environment-metrics"></pre>
            <p>Renderer statistics are indicative, not GPU memory measurements. Preview awaiting reference review; distant cliffs and geometry reflections are not included.</p>
        </details>
    </main>`;
}
