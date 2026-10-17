// Design question: three structurally different mobile HUDs over the same captured game world.
// Throwaway reference only. No game imports, local/session storage, saves or simulation commands.
const fixtures = await fetch('./fixture.json').then(response => response.json());
const params = new URLSearchParams(location.search);
const variants = {
    A: { name: 'Horizon', note: 'One top strip, three thumb controls and a concise bottom sheet. Direct exploration access; details expand only when requested.' },
    B: { name: 'Field journal', note: 'Separate corner clusters, a thumb wheel and an edge sheet. More world at rest; navigation takes one extra tap.' },
    C: { name: 'Command ribbon', note: 'Progressive resource disclosure and a transient action ribbon. Most actions stay in one line; detailed reading uses a centred sheet.' },
};
const devices = { notched: [852,393,44,44,0,21], compact: [667,375,0,0,0,0],
    large: [932,430,44,44,0,21], tablet: [1024,636,0,0,0,0], portrait: [390,844,0,0,47,34] };
const scene = document.querySelector('#scene');
const initialJourney = params.get('journey') || 'default';
const state = { variant: variants[params.get('variant')] ? params.get('variant') : 'A',
    device: params.get('device') || (innerWidth < 1000 ? 'live' : 'notched'), journey: initialJourney,
    view: initialJourney, menu: false, paused: true, speed: 3, taps: 0, role: 'farmer', goal: 'house',
    expanded: false, flag: null, targeting: false, expedition: initialJourney === 'exploration', phase: 'Prepared',
    message: '', built: false, assigned: false, spent: 0, foodSpent: initialJourney === 'exploration' ? 4 : 0 };
const paths = {
    food: 'M12 21V4M12 7C5 8 4 3 5 2c4 0 7 1 7 5Zm0 5c7 0 8-4 7-6-4 0-7 2-7 6Zm0 5c-7 0-8-4-7-6 4 0 7 2 7 6Z',
    materials: 'm3 8 6-4 12 5-6 4L3 8Zm0 0v7l12 5 6-4V9M9 4v7m6 2v7M3 12l12 5 6-4',
    people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 7m1 3a6 6 0 0 1 4 6',
    home: 'm2 11 10-9 10 9M5 9v12h14V9M10 21v-8h4v8',
    cattle: 'M7 8 3 4 2 8l4 4m11-4 4-4 1 4-4 4M8 5V2m8 3V2M7 7l2-2h6l2 2 1 9-3 5H9l-3-5 1-9Zm2 9h6M9 11h.1M15 11h.1',
    work: 'm4 20 12-12m-1-6 7 7-3 3-7-7 3-3ZM2 7l5-5m-3 2 16 16',
    fisher: 'M3 12c5-8 12-8 16 0-4 8-11 8-16 0Zm16 0 3-4v8l-3-4ZM13 8v8m-6-5h.1',
    hunter: 'M5 3c18 5 18 13 0 18L5 3Zm0 9h17m-4-4 4 4-4 4',
    route: 'M5 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 16h5a4 4 0 0 0 0-8H8m1-3L6 8l3 3',
    book: 'M12 5C8 2 4 2 2 3v17c4-1 7 0 10 2 3-2 6-3 10-2V3c-2-1-6-1-10 2Zm0 0v17M5 7l4 1M5 11l4 1m6-4 4-1m-4 5 4-1',
    menu: 'M4 5h16M4 12h16M4 19h16', close: 'm5 5 14 14M19 5 5 19',
    play: 'm7 3 14 9-14 9V3Z', pause: 'M7 3v18M17 3v18',
    alert: 'm12 2 10 19H2L12 2Zm0 6v6m0 3v.1',
    flag: 'M5 22V3m0 1c5-5 9 5 15 0v11c-6 5-10-5-15 0',
    locate: 'M12 2v4m0 12v4M2 12h4m12 0h4M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    map: 'm2 5 7-3 6 3 7-3v17l-7 3-6-3-7 3V5Zm7-3v17m6-14v17',
    more: 'M5 12h.1M12 12h.1M19 12h.1', back: 'm10 5-7 7 7 7M3 12h18',
};
const glyph = name => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.work}"/></svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const label = role => ({ farmer:'Farmer', herder:'Herder', fisher:'Fisher', hunter:'Hunter', smith:'Smith',
    textileWorker:'Textile worker', woodworker:'Woodworker', boatbuilder:'Boatbuilder', trader:'Trader',
    leatherAndJewelleryMaker:'Leather & jewellery maker' })[role] || 'Unspecialized';
const roleIcon = role => ({ farmer:'food', herder:'cattle', fisher:'fisher', hunter:'hunter' })[role] || 'work';
const button = (action, text, icon, extra = '') => `<button type="button" data-action="${action}" ${extra}>${icon ? glyph(icon) : ''}${text ? `<span>${text}</span>` : ''}</button>`;
const iconButton = (action, text, icon) => button(action, '', icon, `class="icon-only" aria-label="${escape(text)}" title="${escape(text)}"`);
const compactNumber = value => new Intl.NumberFormat('en', { notation:'compact',maximumFractionDigits:1 }).format(value);
const dataKey = () => ['build','work','review','success'].includes(state.journey) ? 'starting' :
    ['map','exploration'].includes(state.journey) ? 'exploration' : 'developed';
const fixture = () => fixtures[dataKey()];
const campaign = () => ({ ...fixture().campaign, materials: fixture().campaign.materials - state.spent,
    food: fixture().campaign.food - state.foodSpent });
const meter = (name, amount) => `<div><div class="meter-label"><span>${escape(name)}</span><span class="value">${amount.toFixed(1)}%</span></div><div class="meter"><i style="width:${Math.max(0, Math.min(100,amount))}%"></i></div></div>`;
const actionButtons = () => button('settlement','Settlement','home') + button('expeditions','Expeditions','route') +
    button('map','Island map','map') + button('alerts','Attention & chronicle','alert') + button('book','Clan Book','book');

function clan() {
    const c = campaign();
    return button('time', `<strong>${escape(c.name)}</strong><small>${escape(c.season)} ${c.year}</small>`, 'home',
        `class="clan" title="${escape(c.name)} · ${c.season} ${c.year}" aria-label="${escape(c.name)}, ${c.season} ${c.year}; time and calendar"`);
}
function counter(resource) {
    const c = campaign();
    return button('resources', `<strong>${compactNumber(c[resource])}</strong>`, resource,
        `class="counter" aria-label="${resource === 'food' ? 'Food' : 'Materials'}: ${c[resource]}; open resources"`);
}
function population() {
    const c = campaign();
    return button('resources', `<span class="population-pair">${glyph('people')}<small>${c.people}</small>${glyph('cattle')}<small>${c.cattle}</small></span>`, null,
        `aria-label="${c.people} residents, ${c.cattle} livestock; open resources"`);
}
function clock() { return iconButton('clock', state.paused ? 'Resume simulation' : 'Pause simulation', state.paused ? 'play' : 'pause'); }
function attentionButton() {
    const count=fixture().conditions.reduce((total,condition)=>total+condition.count,0);
    return button('alerts',count ? `<b class="attention-badge">${count}</b>` : '', 'alert',
        `class="icon-only has-badge" aria-label="Attention: ${count} conditions and recent events"`);
}
function VariantA() {
    return `<header class="horizon-hud panel" data-chrome>${clan()}${counter('food')}${counter('materials')}${population()}${clock()}${iconButton('settings','Game menu','menu')}</header>
        <nav class="thumb-navigation panel" aria-label="Thumb navigation" data-chrome>${iconButton('navigation','Settlement and map','home')}${iconButton('expeditions','Expeditions','route')}${attentionButton()}</nav>
        ${state.menu ? `<nav class="nav-drawer panel" aria-label="Navigation">${actionButtons()}</nav>` : ''}`;
}
function VariantB() {
    return `<div class="journal-clan panel" data-chrome>${clan()}</div>
        <div class="journal-resources panel" data-chrome>${counter('food')}${counter('materials')}${iconButton('resources','All resources and population','more')}</div>
        <div class="journal-clock panel" data-chrome>${clock()}${iconButton('settings','Game menu','menu')}</div>
        ${button('navigation','', 'menu','class="thumb-wheel" aria-label="Open clan actions" data-chrome')}
        ${state.menu ? `<nav class="journal-drawer panel" aria-label="Clan actions">${actionButtons()}</nav>` : ''}`;
}
function VariantC() {
    return `<div class="ribbon-status panel" data-chrome>${clan()}${counter('food')}${iconButton('resources','Materials, residents and livestock','more')}</div>
        <div class="journal-clock panel" data-chrome>${clock()}${iconButton('settings','Game menu','menu')}</div>
        ${!['person','home','details','specialize','occupation'].includes(state.view) ? `<nav class="ribbon-launcher panel" data-chrome>${button('navigation','Clan actions','home')}${attentionButton()}</nav>` : ''}
        ${state.menu ? `<nav class="ribbon-tray panel" aria-label="Clan actions">${actionButtons()}</nav>` : ''}`;
}
function sheet(title, subtitle, icon, content, compact = false) {
    const placement = state.variant === 'B' ? 'edge-sheet' : state.variant === 'C' ? 'lens-sheet' : compact ? 'bottom-sheet compact' : 'full-sheet';
    return `<section class="sheet panel ${placement}" aria-label="${escape(title)}"><header><span class="emblem">${glyph(icon)}</span>
        <div><h2>${escape(title)}</h2><small>${escape(subtitle)}</small></div>${iconButton('close','Close panel','close')}</header><div class="sheet-content">${content}</div></section>`;
}
function commandRibbon(title, subtitle, actions) {
    return `<section class="command-ribbon panel" aria-label="Context actions"><div><strong>${escape(title)}</strong><small>${escape(subtitle)}</small></div>${actions}${iconButton('close','Clear selection','close')}</section>`;
}
function personSheet(detailed = false) {
    const p = fixture().person;
    const stats = `<div class="stat-pair">${meter('Productivity',p.work.productivity)}${meter('Occupation fit',p.work.aptitude)}</div>`;
    const actions = button('occupation','Change work','work') + button(detailed ? 'person' : 'details', detailed ? 'Summary' : 'Life & traits','book');
    if (state.variant === 'C' && !detailed) return commandRibbon(p.name, `${p.age} Winters · ${label(p.occupation)}`, actions);
    const details = detailed ? `<h3>Inherited traits</h3>${Object.entries(p.traits).map(([key,value]) => meter(key[0].toUpperCase()+key.slice(1),value*100)).join('')}
        <h3>Family</h3><dl><div><dt>Partner</dt><dd>${escape(p.partner)}</dd></div><div><dt>Children</dt><dd>${p.children.map(escape).join(', ') || 'None recorded'}</dd></div></dl>
        <details><summary>Heritage</summary>${Object.entries(p.heritage).filter(([,v]) => v>0).map(([k,v]) => meter(k,v*100)).join('')}</details>` : '';
    return sheet(p.name, `${p.age} Winters · ${label(p.occupation)}`, 'people',
        `${detailed ? stats + details : `<p class="muted">${p.work.reason ? escape(p.work.reason.replaceAll('-',' ')) : 'Working · '+escape(p.work.resource || 'occupation')}</p>${state.variant === 'B' ? stats : ''}`}
        <div class="sheet-actions">${actions}</div>`, !detailed);
}
function homeSheet() {
    const h = fixture().home;
    const actions = button('specialize','Specialization','work') + button('upgrade',`Upgrade ${['I','II','III'][h.level] || ''} · ${h.cost ?? '—'} Materials`,'home',`class="primary" ${h.cost === null ? 'disabled' : ''}`);
    if (state.variant === 'C') return commandRibbon(`Home · ${h.id}`, `${label(h.specialization)} · Level ${h.level}`, actions);
    return sheet('Home', `${h.id} · ${h.residents.length} residents`, 'home',
        `<div class="scroll-cue"><strong>${escape(label(h.specialization))}</strong><span class="value">Level ${h.level}</span></div>
        <p class="muted">+${h.bonus}% matching-work bonus · upkeep ${h.upkeep} Materials/year</p>
        <div class="sheet-actions">${actions}</div><details><summary>Residents & upkeep details</summary>
        ${h.residents.map(person => `<p>${escape(person.name)} · ${escape(label(person.occupation))}</p>`).join('')}
        <p>Changing specialization keeps occupations and upgrade level.</p></details>`, true);
}
function buildSheet() {
    return sheet(state.built ? 'Permanent home' : 'Household in a tent', `${fixture().home.household} · housing and work are separate`, 'home',
        `<p>${state.built ? 'The existing home can support a workplace.' : 'Build a permanent home for these residents. Their occupations stay unchanged.'}</p>
        <div class="sheet-actions">${button('build-house',`Build house · ${fixture().houseCost} Materials`,'home',`class="primary" ${state.built ? 'disabled' : ''}`)}${button('work','Manage work','work')}</div>`, true);
}
function workSheet() {
    return sheet('Household work','Choose a purpose; farming is optional','work',
        `<div class="choices">${fixture().occupations.map(role => button('choose-work',`<strong>${label(role.id)}</strong><small>${role.output ? 'Produces '+role.output : 'No production output in Alpha'}</small>`,roleIcon(role.id),`data-role="${role.id}"`)).join('')}
        ${button('farmyard','<strong>Set up farmyard</strong><small>Home, farmer & selected livestock</small>','cattle')}</div>`);
}
function reviewSheet() {
    const quote = fixture().plans[state.goal === 'farmyard' ? 'farmyard' : state.role];
    return sheet(state.goal === 'farmyard' ? 'Set up farmyard' : 'Set up '+label(state.role), 'One review for the whole household task', roleIcon(state.role),
        `<p><strong>${escape(quote.worker || fixture().person.name)}</strong> · ${escape(label(quote.from))} → ${escape(label(state.role))}</p>
        <p class="muted">${state.built ? 'Reuse the permanent home.' : 'Build a home and specialize it for the selected work.'}</p>
        ${quote.farmyard ? `<p>${quote.farmyard.occupants}/${quote.farmyard.capacity} livestock sheltered · other households are unchanged.</p>` : ''}
        <div class="cost-review"><strong>${quote.materials ?? '—'} Materials</strong><p>${quote.upkeep ?? '—'} Materials/year upkeep. ${quote.unsheltered?.length ? quote.unsheltered.length+' livestock would lose shelter.' : 'Other residents keep their occupations.'}</p></div>
        ${quote.reason ? `<p>${escape(quote.reason)}</p>` : ''}
        <div class="sheet-actions">${button('confirm-work','Confirm setup','work',`class="primary" ${quote.allowed ? '' : 'disabled'}`)}${button('work','Back','back')}</div>`);
}
function occupationSheet(specialize) {
    return sheet(specialize ? 'Specialization' : 'Change work', specialize ? 'Occupations and upgrade level stay unchanged' : fixture().person.name, 'work',
        `<div class="choices">${fixture().occupations.map(role => button(specialize ? 'apply-specialize' : 'apply-occupation',
            `<strong>${label(role.id)}</strong><small>${specialize ? 'No Materials cost' : role.aptitude.toFixed(1)+'% occupation fit'}${!role.output ? ' · no production output' : ''}</small>`,roleIcon(role.id),`data-role="${role.id}"`)).join('')}</div>`);
}
function mapOverlay() {
    const map = fixtures.exploration.map;
    const cells = map.cells.map(cell => `<rect x="${cell.x}" y="${cell.y}" width="1.05" height="1.05" fill="${cell.water ? '#426b7a' : '#889776'}"/>`).join('');
    return `<section class="island-map panel" aria-label="Island discovery concept"><div class="map-canvas"><span>ISLAND · KNOWN LAND ONLY</span>
        <svg viewBox="0 0 ${map.columns} ${map.rows}" aria-label="Actual player discovery cells"><rect width="100%" height="100%" fill="#14252c"/>${cells}
            <circle cx="${map.home.x}" cy="${map.home.y}" r="2" fill="#edcf91"/><text x="${map.home.x+4}" y="${map.home.y+1}" font-size="4" fill="#eee8dc">Home</text></svg></div>
        <div class="map-legend">${iconButton('close','Close island map','close')}<h2>The island</h2><p>Known coast and home. Unexplored land stays concealed.</p>
            <p class="map-proposal">Proposed map view</p>
            ${button('exploration','Explore from the world','route','class="primary"')}<p class="muted">Close to return to the 3D scene. Routes are confirmed on the world.</p></div></section>`;
}
function alertsSheet() {
    return sheet('Attention & chronicle','Conditions first; stories stay one tap away','alert',
        `${fixture().conditions.length ? fixture().conditions.map(condition => `<article class="condition"><strong>${escape(condition.label)}</strong><p>${escape(condition.detail)}</p></article>`).join('') :
            `<p class="empty-condition">${glyph('home')}No urgent condition in this captured village.</p>`}<h3>Recent recorded events</h3>
        ${fixture().events.slice(-3).map(event => `<article class="condition"><small>Winter ${event.winter}</small><p>${escape(event.text)}</p></article>`).join('')}
        <div class="sheet-actions">${button('book','Clan Book','book')}</div>`);
}
function resourcesSheet() {
    const c = campaign();
    return sheet('Clan resources','Exact values behind the compact counters','materials',
        `<dl>${[['Food',c.food],['Materials',c.materials],['Residents',c.people],['Livestock',c.cattle]].map(([key,value]) => `<div><dt>${key}</dt><dd class="value">${value.toLocaleString('en')}</dd></div>`).join('')}</dl>
        <p class="muted">${c.benchmarkStocks ? 'This developed QA save has high benchmark stocks. These are not starting balance values.' : 'Normal founding resources; values copied from the QA campaign.'}</p>
        <div class="sheet-actions">${button('settlement','Residents & homes','people')}</div>`,true);
}
function expeditionSheet() {
    if (state.expedition) return sheet('Group 1',state.phase+' · one carried pack','route',
        `<p>Two residents · the same supplies cover travel, exploration and the return.</p>${button('back-to-exploration','Back to the world','route','class="primary"')}`,true);
    return sheet('Explore the island','Group 1 · two eligible founders','route',
        `<p>Choose a group and review its crew before packing.</p><div class="chips"><span>MaelColuim</span><span>Kauppi</span></div>
        <div class="cost-review"><strong>4 Food</strong><p>2 per resident · packed once for travel, exploration and the return.</p></div>
        <div class="sheet-actions">${button('pack-review','Prepare expedition','route','class="primary"')}</div>`);
}
function explorationBar() {
    const heading = state.targeting ? state.flag ? 'Confirm destination' : 'Choose land on the world' : 'Group 1 · '+state.phase;
    const controls = state.targeting ? button('send',state.phase === 'Prepared' ? 'Send group' : 'Confirm route','flag',`class="primary" ${!state.flag ? 'disabled' : ''}`) + button('cancel-target','Cancel','close') :
        state.phase === 'Prepared' ? button('choose-target','Choose destination','flag','class="primary"') :
        button('choose-target','','flag','aria-label="Change destination" title="Change destination"') +
        button('locate','','locate','aria-label="Show group" title="Show group"') +
        button('return','Return home','home',state.phase === 'Returning' ? 'disabled' : '');
    return `<section class="exploration-bar panel" aria-label="Active exploration"><div class="exploration-line">${glyph('route')}
        <span><strong>${heading}</strong><small>One carried pack · ${state.paused ? 'clock paused' : 'clock running'}</small></span>
        ${iconButton('expedition-details','Crew and supplies','more')}</div><div class="sheet-actions">${controls}</div></section>
        ${state.flag ? `<span class="destination-flag" style="left:${state.flag.x}%;top:${state.flag.y}%">${glyph('flag')}</span>` : ''}`;
}
function timeSheet() {
    return sheet('Time & season',`${campaign().season} ${campaign().year} · ${state.paused ? 'Paused' : 'Running'}`,'play',
        `<div class="sheet-actions">${button('clock',state.paused ? 'Resume simulation' : 'Pause simulation',state.paused ? 'play' : 'pause','class="primary"')}</div>
        <h3>Year length</h3><div class="choices">${[1,3,5].map(speed => button('speed',`${speed} min per year`,null,`data-speed="${speed}" ${state.expedition ? 'disabled' : ''}`)).join('')}</div>
        <p class="muted">${state.expedition ? 'Expedition pace is controlled by the existing simulation rules. +1 Year is unavailable.' : 'Opening a panel does not pause or resume the clock.'}</p>`,true);
}
function settlementSheet() {
    return sheet('Settlement','Find an identity without precision tapping','home',
        `<div class="choices">${button('person',`<strong>${escape(fixture().person.name)}</strong><small>Residents</small>`,'people')}
            ${button('home',`<strong>${escape(fixture().home.id)}</strong><small>Homes</small>`,'home')}${button('livestock','<strong>Livestock</strong><small>Current herd</small>','cattle')}
            ${button('vehicles','<strong>Vehicles</strong><small>Existing vehicle directory</small>','route')}</div>`);
}
function panel() {
    switch (state.view) {
        case 'person': return personSheet();
        case 'details': return personSheet(true);
        case 'home': return homeSheet();
        case 'build': return buildSheet();
        case 'work': return workSheet();
        case 'review': return reviewSheet();
        case 'occupation': return occupationSheet(false);
        case 'specialize': return occupationSheet(true);
        case 'map': return mapOverlay();
        case 'alerts': return alertsSheet();
        case 'resources': return resourcesSheet();
        case 'time': return timeSheet();
        case 'settlement': return settlementSheet();
        case 'expeditions': return expeditionSheet();
        case 'pack-review': return sheet('Pack supplies','Group 1 · Food is spent once','food',`<div class="cost-review"><strong>4 Food</strong><p>Unused supplies are discarded when the expedition ends.</p></div><div class="sheet-actions">${button('pack','Pack supplies','food','class="primary"')}${button('expeditions','Back','back')}</div>`,true);
        case 'expedition-details': return sheet('Group 1','Prepared exploration reference','route','<p>Two residents · one shared supply budget for travel, discovery and return. Redirecting does not refill or charge again.</p><p>Supply depletion and phase changes require the real simulation. This prototype only previews the interface states.</p>',true);
        case 'book': return sheet('Clan Book',fixture().book?.title || 'Recorded history','book',`<p>${escape(fixture().book?.excerpt || 'No chapter in this fixture.')}</p>`,false);
        case 'livestock': return sheet('Livestock',`${campaign().cattle} living animals in this fixture`,'cattle',`<p>Inspect an animal, then assign shelter through the household task. Additional species remain future gameplay.</p>${button('build','Household work','home')}`,true);
        case 'vehicles': return sheet('Vehicles','Active vehicles','route',fixture().vehicles.length ? fixture().vehicles.map(vehicle => `<p>${escape(vehicle.id)} · ${vehicle.type}</p>`).join('') : '<p>No active vehicles in this captured campaign.</p>',true);
        case 'settings': return sheet('Game menu','Quiet controls, available when needed','menu',`<div class="choices">${button('time','Time & season','play')}${button('map','Island map','map')}${button('book','Clan Book','book')}</div><p class="muted">Save/load, render quality, effects and camera help remain available in the implemented game menu. This read-only reference never accesses your saves.</p>`);
        default: return '';
    }
}
function hotspots() {
    const points = fixtures[dataKey() === 'developed' ? 'developed' : 'starting'].hotspots;
    return ['person','home','cattle'].map(kind => {
        const point = points[kind];
        if (!point || point.x < 5 || point.x > 95 || point.y < 20 || point.y > 82) return '';
        return button(kind === 'cattle' ? 'livestock' : kind === 'home' && dataKey() !== 'developed' ? 'build' : kind,'',kind === 'cattle' ? 'cattle' : kind === 'person' ? 'people' : 'home',
            `class="world-hotspot" style="left:${point.x}%;top:${point.y}%" aria-label="Select ${kind === 'person' ? escape(fixture().person.name) : kind}"`);
    }).join('');
}
function sizeScene() {
    const live = state.device === 'live';
    document.body.classList.toggle('live',live);
    document.body.classList.toggle('capture',params.get('capture') === '1');
    document.querySelector('#exit-live').hidden = !live;
    const [width,height,left,right,top,bottom] = live ? [innerWidth,Math.max(240,innerHeight-62),0,0,0,0] : devices[state.device] || devices.notched;
    scene.style.width = width+'px'; scene.style.height = height+'px';
    for (const [key,value] of Object.entries({ l:left,r:right,t:top,b:bottom })) scene.style.setProperty('--safe-'+key,
        live ? `env(safe-area-inset-${{l:'left',r:'right',t:'top',b:'bottom'}[key]},0px)` : value+'px');
    scene.classList.toggle('unnotched',live || !left);
    scene.classList.toggle('portrait',height > width);
}
function render() {
    sizeScene();
    const backdrop = dataKey() === 'developed' ? 'developed' : 'starting';
    scene.style.backgroundImage = `url("world-${backdrop}.jpg")`;
    scene.dataset.variant = state.variant;
    scene.dataset.view = state.view;
    scene.innerHTML = hotspots() + ({ A:VariantA,B:VariantB,C:VariantC })[state.variant]() + panel() +
        (state.expedition && ['default','exploration'].includes(state.view) ? explorationBar() : '') +
        (state.message ? `<div class="prototype-feedback" role="status">${escape(state.message)}</div>` : '');
    const variant = variants[state.variant];
    document.querySelector('#variant-label').textContent = state.variant+' · '+variant.name;
    document.querySelector('#variant-name').textContent = state.variant+' · '+variant.name;
    document.querySelector('#design-note').textContent = variant.note;
    document.querySelector('#tap-count').textContent = state.taps+' taps';
    document.querySelector('#device').value = state.device;
    document.querySelector('#journey').value = state.journey;
    document.querySelector('#prototype-state').textContent = JSON.stringify({ ...state,
        source: '5060331 / '+dataKey(), shownCampaign: campaign(), sourcePerson: fixture().person,
        currentCapabilities: ['Core identity/work/traits/family','home specializations/upgrades','stocks','chronicle','physical discovery/expeditions'],
        proposedOnly: ['mobile layouts and map overlay','new touch pan/rotate mapping','all mutations in this reference'],
        missingLiveValues: ['Health','Mood','discrete skill levels'], storageAccess: false },null,2);
    params.set('variant',state.variant); params.set('device',state.device); params.set('journey',state.journey);
    history.replaceState(null,'','?'+params);
}
function setJourney(journey) {
    Object.assign(state,{ journey,view:journey,taps:0,menu:false,expanded:false,flag:null,targeting:false,
        expedition:journey === 'exploration',phase:'Prepared',message:'',built:false,spent:0,
        foodSpent:journey === 'exploration' ? 4 : 0 });
    state.built=fixture().home.kind === 'house';
    render();
}
scene.addEventListener('click',event => {
    const control = event.target.closest('button[data-action]');
    if (state.targeting && (!control || control.classList.contains('world-hotspot'))) {
        const box = scene.getBoundingClientRect();
        state.flag = { x:(event.clientX-box.x)/box.width*100,y:(event.clientY-box.y)/box.height*100 };
        state.taps++; state.message=''; render(); return;
    }
    if (!control || control.disabled) return;
    state.taps++; state.message='';
    const action = control.dataset.action;
    if (action === 'navigation') state.menu = !state.menu;
    else if (action === 'close') { state.view='default'; state.menu=false; }
    else if (action === 'clock') state.paused=!state.paused;
    else if (action === 'speed') { state.speed=Number(control.dataset.speed); state.view='default'; }
    else if (action === 'choose-work' || action === 'farmyard') {
        state.role=action === 'farmyard' ? 'farmer' : control.dataset.role;
        state.goal=action === 'farmyard' ? 'farmyard' : 'work'; state.view='review';
    } else if (action === 'build-house' || action === 'confirm-work') {
        if (!state.built) state.spent+=fixture().houseCost;
        state.built=true; state.view='build'; state.message='Prototype preview confirmed · your game is unchanged';
    } else if (action === 'apply-specialize' || action === 'apply-occupation' || action === 'upgrade') {
        state.view=action === 'apply-occupation' ? 'person' : 'home';
        state.message='Prototype selection confirmed · your game is unchanged';
    } else if (action === 'expeditions' || action === 'exploration') {
        state.journey='exploration'; state.view='expeditions'; state.menu=false;
    } else if (action === 'back-to-exploration') state.view='exploration';
    else if (action === 'pack') {
        state.expedition=true; state.journey='exploration'; state.view='exploration'; state.targeting=true; state.foodSpent=4;
    } else if (action === 'choose-target') { state.targeting=true; state.flag=null; state.view='exploration'; }
    else if (action === 'cancel-target') { state.targeting=false; state.flag=null; }
    else if (action === 'send') { state.targeting=false; state.phase='Travelling'; }
    else if (action === 'return') { state.phase='Returning'; state.flag=null; }
    else if (action === 'locate') state.message='Camera focus control · the captured world is a still image';
    else { state.view=action; state.menu=false; state.targeting=false; }
    render();
});
const cycle = direction => {
    const keys=Object.keys(variants); state.variant=keys[(keys.indexOf(state.variant)+direction+keys.length)%keys.length]; render();
};
document.querySelector('#previous').addEventListener('click',()=>cycle(-1));
document.querySelector('#next').addEventListener('click',()=>cycle(1));
document.querySelector('#reset').addEventListener('click',()=>setJourney(state.journey));
document.querySelector('#journey').addEventListener('change',event=>setJourney(event.target.value));
document.querySelector('#device').addEventListener('change',event=>{state.device=event.target.value;render();});
document.querySelector('#live').addEventListener('click',()=>{state.device='live';render();});
document.querySelector('#exit-live').addEventListener('click',()=>{state.device='notched';render();});
document.addEventListener('keydown',event=>{
    if (event.target.closest('input,select,textarea,[contenteditable]')) return;
    if (event.key==='ArrowLeft') cycle(-1);
    if (event.key==='ArrowRight') cycle(1);
    if (event.key==='Escape') { state.targeting=false;state.flag=null;state.view='default';state.menu=false;render(); }
});
window.addEventListener('resize',()=>{if(state.device==='live') render();});
state.built=fixture().home.kind === 'house';
render();
