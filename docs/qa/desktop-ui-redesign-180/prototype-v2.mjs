// Three structural layouts for the approved desktop journeys, on the existing QA study route.
// State is an in-memory UI stub. This file never imports or writes a real campaign.
const data = await fetch('./study-data-v2.json').then(response => response.json());
const game = document.querySelector('#game');
const params = new URLSearchParams(location.search);
const variants = { A: 'Right inspector', B: 'Bottom task tray', C: 'Context and focus' };
const paths = {
    food: 'M12 21V4M12 7C5 8 4 3 5 2c4 0 7 1 7 5Zm0 5c7 0 8-4 7-6-4 0-7 2-7 6Zm0 5c-7 0-8-4-7-6 4 0 7 2 7 6Z',
    materials: 'm3 8 6-4 12 5-6 4L3 8Zm0 0v7l12 5 6-4V9M9 4v7m6 2v7M3 12l12 5 6-4',
    people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 7m1 3a6 6 0 0 1 4 6',
    cattle: 'M7 8 3 4 2 8l4 4m11-4 4-4 1 4-4 4M8 5V2m8 3V2M7 7l2-2h6l2 2 1 9-3 5H9l-3-5 1-9Zm2 9h6M9 11h.1M15 11h.1M10 18h.1M14 18h.1',
    home: 'm2 11 10-9 10 9M5 9v12h14V9M10 21v-8h4v8',
    tent: 'm2 21 10-18 10 18H2Zm10-18v18m0-10-5 10m5-10 5 10',
    farm: 'm2 10 7-7 7 7M4 9v12h10V9M8 21v-7h3v7m5-11 5 2v8h-5m2-7v2m-2 3h5',
    route: 'M5 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 16h5a4 4 0 0 0 0-8H8m1-3L6 8l3 3',
    book: 'M12 5C8 2 4 2 2 3v17c4-1 7 0 10 2 3-2 6-3 10-2V3c-2-1-6-1-10 2Zm0 0v17M5 7l4 1M5 11l4 1m6-4 4-1m-4 5 4-1',
    tree: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0v5M5 13h14M5 13v3m14-3v3M5 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    check: 'm4 12 5 5L20 6',
    close: 'm5 5 14 14M19 5 5 19',
    play: 'm7 3 14 9-14 9V3Z',
    pause: 'M7 3v18M17 3v18',
    menu: 'M4 5h16M4 12h16M4 19h16',
    alert: 'm12 2 10 19H2L12 2Zm0 6v6m0 3v.1',
    work: 'm4 20 12-12m-1-6 7 7-3 3-7-7 3-3ZM2 7l5-5m-3 2 16 16',
    circle: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0Z',
    target: 'M12 1v4m0 14v4M1 12h4m14 0h4M19 12a7 7 0 1 0-14 0 7 7 0 0 0 14 0Zm-7-3v6m-3-3h6',
};

let state;
let coverageFrame;
if (params.has('capture')) document.body.dataset.capture = 'true';

function h(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'style') Object.assign(node.style, value);
        else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'glyph');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[name] || paths.circle);
    svg.append(path);
    return svg;
}

function button(action, label, glyph, kind = 'secondary', extra = {}) {
    return h('button', { type: 'button', class: kind, 'data-action': action, ...extra },
        glyph && icon(glyph), label);
}

function fact(label, value) {
    return h('div', { class: 'fact' }, h('span', {}, label), h('strong', {}, value));
}

function heading(title, subtitle, glyph, eyebrow = 'Settlement') {
    return h('header', { class: 'panel-heading' },
        h('div', { class: 'emblem' }, icon(glyph)),
        h('div', { class: 'heading-text' }, h('p', { class: 'eyebrow' }, eyebrow),
            h('h2', {}, title), h('small', {}, subtitle)),
        button('close', '', 'close', 'close', { 'aria-label': 'Close management' }));
}

function currentScene() { return data.scenes[state.scene]; }
function currentPerson() {
    return currentScene().people.find(person => person.id === state.personId) || currentScene().people[0];
}
function home() { return currentScene().people[0].home; }
function candidates() {
    return currentScene().people.filter(person => home().members.includes(person.id) && person.canFarm);
}
function selectedFarmer() {
    return candidates().find(person => person.id === state.farmerId) || candidates()[0];
}
function cattle() { return currentScene().cattle || []; }
function materials() { return currentScene().stocks.materials - state.spentMaterials; }
function food() { return currentScene().stocks.food - state.spentFood; }
function role(person) { return state.roles[person.id] || person.occupation || 'No occupation'; }

function reset(journey = 'farmyard') {
    const variant = variants[params.get('variant')] ? params.get('variant') : (state?.variant || 'A');
    state = {
        variant, journey,
        scene: journey === 'developed' ? 'developed' : journey === 'farmyard' ? 'funded' : 'blocked',
        screen: 'observe', selection: null, personId: 'founder-1',
        farmerId: data.farmyardResult.candidateId,
        cattleIds: data.scenes.funded.cattle.map(animal => animal.id),
        specialize: true, farmReady: false, roles: {},
        spentMaterials: 0, spentFood: 0, clicks: 0, keys: 0,
        groupCreated: false, members: [], expedition: 'home', targeting: false,
        running: false, bookTab: 'story', familyPerson: null, result: '',
    };
    params.set('journey', journey);
    params.set('variant', variant);
    history.replaceState(null, '', '?' + params);
    document.querySelector('#journey').value = journey;
    render();
}

function choice(action, name, subtitle, glyph, selected) {
    return button(action, [
        icon(glyph),
        h('span', { class: 'choice-copy' }, h('strong', {}, name), h('small', {}, subtitle)),
        icon(selected ? 'check' : 'circle'),
    ], null, 'choice', { 'aria-pressed': String(selected) });
}

function farmerSection() {
    return h('section', { class: 'field-section' },
        h('h3', { class: 'section-label' }, 'Who will farm here?'),
        h('div', { class: 'choices' }, candidates().map(person => choice('farmer:' + person.id,
            person.name, person.occupation + ' → farmer · ' + Math.round(person.farmerFit / 100) + '% fit',
            'people', state.farmerId === person.id))),
        h('p', { class: 'caption' }, 'Suggested resident. Changing their occupation assigns the career.'));
}

function livestockSection() {
    return h('section', { class: 'field-section' },
        h('h3', { class: 'section-label' }, 'Which animals will shelter here?'),
        button('all-cattle', [
            h('span', {}, 'Use all ' + cattle().length + ' available'),
            h('strong', {}, state.cattleIds.length + ' selected'),
        ], null, 'bulk'),
        h('div', { class: 'cattle-list' }, cattle().map(animal => choice('cattle:' + animal.id,
            animal.id.replace('cattle-', 'No. '), animal.sex === 'female' ? 'Cow' : 'Bull',
            'cattle', state.cattleIds.includes(animal.id)))),
        h('p', { class: 'caption' }, state.cattleIds.length + ' / ' + currentScene().capacity
            + ' sheltered · only unassigned cattle are suggested.'));
}

function farmReview() {
    const cost = currentScene().houseCost;
    const funded = materials() >= cost;
    return h('section', { class: 'review' },
        button('toggle-specialization',
            state.specialize ? 'Farming specialization included' : 'Include farming specialization',
            state.specialize ? 'check' : 'circle', 'bulk'),
        h('div', {}, fact('Build home', cost + ' Materials'),
            fact('Stock after', funded ? (materials() - cost) + ' Materials' : 'Unavailable')),
        h('p', { class: 'caption' }, 'Home + ' + selectedFarmer().name + ' as farmer + '
            + state.cattleIds.length + ' cattle. Career becomes assigned.'),
        !funded && h('p', { class: 'risk' }, (cost - materials()) + ' more Materials needed. No changes made.'),
        button('confirm-farmyard', 'Confirm farmyard', 'check', 'primary', { disabled: !funded }));
}

// Deliberately different compositions: a vertical inspector, a horizontal task, a focused brief.
export function VariantA() {
    return h('section', { class: 'task-shell right surface', 'data-overlay': 'farmyard' },
        heading('Set up farmyard', 'A permanent home, a farmer and shelter for your cattle.', 'farm'),
        h('div', { class: 'body' }, farmerSection(), livestockSection()),
        farmReview());
}

export function VariantB() {
    return h('section', { class: 'task-shell tray surface', 'data-overlay': 'farmyard' },
        heading('Make this a farmyard', 'One household. Review the people, livestock and commitment together.', 'farm'),
        h('div', { class: 'tray-columns' }, farmerSection(), livestockSection(), farmReview()));
}

export function VariantC() {
    return h('section', { class: 'task-shell focus surface', 'data-overlay': 'farmyard' },
        heading('A home for the herd', 'Set up a farmyard for ' + currentScene().people[0].name + '’s household.', 'farm'),
        h('div', { class: 'focus-columns' }, farmerSection(), livestockSection()),
        farmReview());
}

function layoutClass(compact = false) {
    if (state.variant === 'A') return 'right';
    if (state.variant === 'B') return 'tray';
    return compact ? 'anchor' : 'focus';
}

function selectionSummary() {
    const resident = state.selection === 'person';
    const expedition = state.selection === 'group';
    const person = currentPerson();
    const title = resident ? person.name : expedition ? 'Exploration group' : state.farmReady ? 'Farmyard ready' : 'A permanent home';
    const subtitle = resident ? person.age + ' Winters · ' + role(person) : expedition
        ? state.members.length + ' residents · ' + state.expedition
        : currentScene().people[0].name + '’s household';
    let content;
    if (resident) {
        content = h('div', { class: 'body' },
            h('p', { class: 'muted' }, person.home?.label || 'No household'),
            h('div', { class: 'actions' }, button('work', 'Change work', 'work'),
                button('personal-history', 'Personal history', 'book')));
    } else if (expedition) {
        content = h('div', { class: 'body' },
            h('p', { class: 'muted' }, state.running ? 'Destination assigned. Travel preview running.'
                : 'Clock paused. Press Start to travel.'),
            button('expeditions', 'Group details', 'route', 'primary'));
    } else if (state.farmReady) {
        content = h('div', { class: 'body' },
            h('div', { class: 'inline-status' }, icon('check'), state.cattleIds.length + ' / 4 sheltered'),
            h('p', { class: 'caption' }, selectedFarmer().name + ' · farmer · assigned career'),
            button('farm-details', 'View farmyard', 'farm'));
    } else {
        content = h('div', { class: 'body' },
            h('p', { class: 'muted' }, 'Replace the tent and organise farming in one task.'),
            button('set-up-farmyard', 'Set up farmyard', 'farm', 'primary'));
    }
    return h('section', { class: 'selection surface ' + layoutClass(true), 'data-overlay': 'selection' },
        heading(title, subtitle, resident ? 'people' : expedition ? 'route' : 'farm'),
        state.result && h('div', { class: 'body inline-status' }, icon('check'), state.result),
        content);
}

function panel(title, subtitle, glyph, content, className = '') {
    return h('section', { class: 'task-shell surface ' + layoutClass() + ' ' + className, 'data-overlay': 'panel' },
        heading(title, subtitle, glyph), h('div', { class: 'body' }, content));
}

function expeditionPanel() {
    if (!state.groupCreated) {
        return panel('Explore beyond home', 'Gather residents before choosing a destination.', 'route', [
            h('p', { class: 'muted' }, 'A group keeps its members between journeys. Each member needs provisions.'),
            button('create-group', 'Create group', 'people', 'primary'),
        ]);
    }
    if (state.expedition !== 'home') {
        return panel('Exploration group', state.expedition === 'prepared' ? 'Prepared at home' : state.expedition, 'route', [
            fact('Residents', state.members.length),
            fact('Food already supplied', state.spentFood + ' Food'),
            h('p', { class: 'notice' }, 'Destination changes use the same supplies. Preparation Food is not refunded.'),
            button('explore', 'Explore Area', 'target', 'primary'),
            state.expedition !== 'prepared' && button('recall', 'Return Home', 'home'),
        ]);
    }
    const names = ['founder-1', 'founder-4', 'founder-5'];
    const cost = state.members.length * 2;
    const roster = h('section', { class: 'field-section' },
        h('h3', { class: 'section-label' }, 'Choose residents'),
        h('div', { class: 'choices' }, names.map(id => {
            const person = currentScene().people.find(person => person.id === id);
            return choice('member:' + id, person.name, person.age + ' Winters · ' + role(person), 'people',
                state.members.includes(id));
        })));
    const commitment = h('section', { class: 'review' }, fact('Provisions', cost + ' Food · 2 per resident'),
            fact('Home stock after', (food() - cost) + ' Food'),
            h('p', { class: 'risk' }, 'Start spends these provisions now. Unused Food is not refunded.'),
            button('start-expedition', 'Start Expedition · ' + cost + ' Food', 'route', 'primary',
                { disabled: !state.members.length || cost > food() }));
    const explanation = h('section', { class: 'field-section' },
        h('h3', { class: 'section-label' }, 'Before departure'),
        h('p', { class: 'muted' }, 'Members are chosen here. Their home work stops while they are away.'),
        h('p', { class: 'caption' }, 'First prepare the group. Then choose Explore Area and a land destination.'));
    if (state.variant === 'B') {
        return h('section', { class: 'task-shell tray surface', 'data-overlay': 'expedition' },
            heading('Prepare an exploration group', 'People, home impact and provisions.', 'route'),
            h('div', { class: 'tray-columns' }, roster, explanation, commitment));
    }
    if (state.variant === 'C') {
        return h('section', { class: 'task-shell focus surface', 'data-overlay': 'expedition' },
            heading('Who will make the journey?', 'Choose the residents who will leave home.', 'route'),
            h('div', { class: 'focus-columns' }, roster, explanation), commitment);
    }
    return panel('Build your exploration group', 'Choose the residents who will leave home.', 'route',
        [roster, commitment]);
}

function bookPanel() {
    const person = currentScene().people.find(person => person.id === state.familyPerson) || currentPerson();
    const partner = currentScene().people.find(other => other.id === person.partner);
    const family = state.bookTab === 'family';
    const contents = family ? [
        h('p', { class: 'muted' }, 'Recorded partners and family. Select a person to inspect their identity.'),
        h('div', { class: 'family-nodes' }, [person, partner].filter(Boolean).map(relative =>
            choice('family:' + relative.id, relative.name, relative.age + ' Winters', 'people',
                state.familyPerson === relative.id))),
        state.familyPerson && h('div', { class: 'notice' }, h('strong', {}, person.name),
            h('p', { class: 'caption' }, role(person) + ' · ' + (person.home?.label || 'No household'))),
    ] : [
        h('p', { class: 'preview-label' }, 'Opening chapter from the frozen fixture'),
        ...data.chapter.split('\n\n').map(paragraph => h('p', { class: 'story' }, paragraph)),
    ];
    return h('section', { class: 'task-shell surface book ' + layoutClass(), 'data-overlay': 'book' },
        heading('Clan Book', 'Lives, relationships and recorded history.', 'book'),
        h('div', { class: 'tabs' },
            button('book-story', 'Story', null, '', { 'aria-pressed': String(!family) }),
            button('book-family', 'Family Tree', null, '', { 'aria-pressed': String(family) })),
        h('div', { class: 'body' }, contents));
}

function genericPanel() {
    if (state.screen === 'expedition') return expeditionPanel();
    if (state.screen === 'book') return bookPanel();
    if (state.screen === 'farm-details') {
        return panel('Farmyard', selectedFarmer().name + '’s household', 'farm', [
            fact('Sheltered cattle', state.cattleIds.length + ' / 4'),
            fact('Farmer', selectedFarmer().name),
            fact('Building specialization', state.specialize ? 'Farming' : 'None'),
            h('p', { class: 'muted' }, 'A living farmer in the permanent household home activates the farmyard.'),
        ]);
    }
    if (state.screen === 'work') {
        return panel('Choose an occupation', currentPerson().name, 'work', [
            h('p', { class: 'muted' }, 'An explicit assignment replaces career autonomy. The chosen resident keeps their identity and history.'),
            h('div', { class: 'choices' }, ['farmer', 'fisher', 'hunter', 'woodworker'].map(occupation =>
                choice('occupation:' + occupation, occupation[0].toUpperCase() + occupation.slice(1),
                    occupation === role(currentPerson()) ? 'Current occupation' : 'Assign this occupation',
                    occupation === 'farmer' ? 'food' : 'work', occupation === role(currentPerson())))),
        ]);
    }
    if (state.screen === 'occupation-risk') {
        return panel('Review household impact', currentPerson().name, 'alert', [
            h('p', { class: 'risk' }, 'This is the last farmer in the household. '
                + 'Changing their occupation removes its farmyard function.'),
            fact('Cattle losing shelter', state.atRiskCattle),
            fact('Proposed occupation', state.pendingOccupation),
            h('p', { class: 'muted' }, 'Animals become unassigned. They are not silently moved to another farmyard.'),
            button('confirm-occupation', 'Confirm occupation change', 'check', 'primary'),
            button('work', 'Keep current occupation', 'people'),
        ]);
    }
    if (state.screen === 'personal-history') {
        return panel('Personal history', currentPerson().name, 'book', [
            fact('Recorded occupation', currentPerson().occupation),
            fact('Age', currentPerson().age + ' Winters'),
            h('p', { class: 'muted' }, 'This prototype links to the actual opening chapter. Full event paging remains in the existing game.'),
            button('book', 'Read in Clan Book', 'book', 'primary'),
        ]);
    }
    if (state.screen === 'settlement') {
        return panel('Settlement', currentScene().people.length + ' named residents', 'home', [
            h('h3', { class: 'section-label' }, 'Residents'),
            h('div', { class: 'choices' }, currentScene().people.slice(0, 5).map(person =>
                choice('person:' + person.id, person.name, person.age + ' Winters · ' + role(person), 'people', false))),
            h('p', { class: 'caption' }, 'First five shown for layout review. The production list will retain access to every resident and historical identity.'),
            button('future', 'Community and future capabilities', 'tree'),
        ], 'list-panel');
    }
    if (state.screen === 'future') {
        return panel('Room for the clan to grow', 'Future capability placement', 'tree', [
            h('p', { class: 'preview-label' }, 'Planned gameplay · no live effects'),
            fact('Community', 'Gatherings and occasions'),
            fact('Occupation details', 'Mentors and apprentices'),
            fact('Expedition preparation', 'Longship, horse and wagon'),
            fact('Known clan details', 'Relations and trade'),
            h('p', { class: 'muted' }, 'Relationships and life events stay autonomous. Costs, eligibility and benefits require their gameplay rules.'),
        ]);
    }
    if (state.screen === 'notifications') {
        return panel('Needs attention', 'Information linked to its subjects.', 'alert', [
            button('home', 'Household shelter', 'tent', 'choice'),
            h('p', { class: 'caption' }, state.farmReady ? 'The selected household now has a permanent home.'
                : 'Residents in the founding snapshot live in tents.'),
            button('book', 'Recorded clan history', 'book', 'choice'),
        ]);
    }
    if (state.screen === 'menu') {
        return panel('Fjordside', 'Game menu', 'menu', [
            h('p', { class: 'muted' }, 'Campaign, quality, help and developer tools live here. This study never loads or saves campaigns.'),
            fact('Study layout', variants[state.variant]),
            fact('World', 'Actual captured scene'),
            fact('Actions', 'Local UI drafts only'),
        ]);
    }
    return panel(state.screen === 'materials' ? 'Materials' : 'Food', 'Actual snapshot stock and local commitments.',
        state.screen === 'materials' ? 'materials' : 'food', [
            fact('Available', state.screen === 'materials' ? materials() : food()),
            h('p', { class: 'muted' }, state.screen === 'materials'
                ? 'Housing, upgrades and campfire fuel use Materials. Woodworkers contribute to stock.'
                : 'Residents and cattle consume Food. Farmers, fishers and hunters contribute to stock.'),
            h('p', { class: 'caption' }, 'No unsupported annual-income figure or survival forecast is shown.'),
            button('settlement', 'Review residents', 'people', 'primary'),
        ]);
}

function worldPoint(x, y) {
    const scale = Math.max(game.clientWidth / 1440, game.clientHeight / 900);
    return {
        left: (x * scale + (game.clientWidth - 1440 * scale) / 2) + 'px',
        top: (y * scale + (game.clientHeight - 900 * scale) / 2) + 'px',
    };
}

function hotspot(action, label, glyph, x, y) {
    return button(action, [h('span', { class: 'label', 'data-overlay': 'marker' }, icon(glyph), label),
        h('span', { class: 'ring' })], null, 'hotspot', { style: worldPoint(x, y) });
}

function render() {
    const focusedAction = document.activeElement?.dataset.action;
    const scene = currentScene();
    const world = button('world', h('img', {
        src: scene.backdrop, alt: 'Actual Fjordside settlement captured from the existing game.',
    }), null, 'world-surface', { 'aria-label': state.targeting ? 'Choose a land destination' : 'World view' });
    const nodes = [
        world,
        h('div', { class: 'shade' }),
        h('div', { class: 'brand surface', 'data-overlay': 'brand' },
            h('img', { src: 'fjordside-mark.png', alt: '' }),
            h('div', {}, h('strong', {}, 'FJORDSIDE'), h('small', {}, 'Summer ' + scene.year))),
        h('div', { class: 'resources surface', 'data-overlay': 'resources', 'aria-label': 'Resources and community' },
            [['food', food(), 'Food'], ['materials', materials(), 'Materials'],
                ['people', scene.people.length, 'Residents'],
                ['cattle', scene.cattleCount ?? cattle().length, 'Cattle']].map(([name, value, label]) =>
                button(name === 'people' || name === 'cattle' ? 'settlement' : name,
                    [icon(name), h('span', {}, h('strong', {}, value.toLocaleString('en-GB')), h('small', {}, label))],
                    null, 'resource', { 'aria-label': label + ': ' + value }))),
        h('div', { class: 'clock surface', 'data-overlay': 'clock' },
            button('clock', '', state.running ? 'pause' : 'play', '', {
                'aria-label': state.running ? 'Pause simulation preview' : 'Start simulation preview',
            }),
            button('pace', [h('span', {}, state.running ? 'Running' : 'Paused'),
                h('small', {}, state.expedition === 'home' ? '3 min / year' : '10 min / year')], null, 'pace'),
            button('menu', '', 'menu', '', { 'aria-label': 'Game menu' })),
        h('nav', { class: 'nav surface', 'data-overlay': 'navigation', 'aria-label': 'Settlement navigation' },
            [['settlement', 'Settlement', 'home'], ['expeditions', 'Expeditions', 'route'], ['book', 'Clan Book', 'book']]
                .map(([action, label, glyph]) => button(action, label, glyph, '', {
                    'aria-pressed': String(state.screen === ({ expeditions: 'expedition', book: 'book' }[action] || action)),
                }))),
        button('notifications', [icon('alert'), h('span', {}, 'Attention'), h('small', {}, '2')],
            null, 'attention surface', { 'data-overlay': 'attention' }),
    ];
    if (!state.targeting) {
        if (['farmyard', 'blocked'].includes(state.journey) && state.screen === 'observe') {
            nodes.push(hotspot('home', state.farmReady ? 'Farmyard' : 'Household', state.farmReady ? 'farm' : 'tent', 338, 555));
        } else if (['resident', 'history', 'developed'].includes(state.journey) && state.screen === 'observe') {
            nodes.push(hotspot('person:founder-1', scene.people[0].name, 'people', 313, 447));
        }
        if (state.screen === 'compact' && state.selection === 'home') {
            nodes.push(hotspot('home', state.farmReady ? 'Farmyard selected' : 'Household selected',
                state.farmReady ? 'farm' : 'tent', 338, 555));
        }
    }
    if (state.targeting) {
        nodes.push(h('div', { class: 'destination surface', 'data-overlay': 'target' },
            h('strong', {}, 'Choose a land destination'),
            h('small', {}, 'Using the same carried supplies. The clock stays paused until you start it.'),
            button('cancel-target', 'Cancel target', 'close')));
    } else if (state.screen === 'compact' && state.selection) {
        nodes.push(selectionSummary());
    } else if (state.screen === 'farmyard') {
        nodes.push(({ A: VariantA, B: VariantB, C: VariantC }[state.variant])());
    } else if (state.screen !== 'observe') {
        nodes.push(genericPanel());
    }
    if (state.expedition === 'travelling') {
        nodes.push(h('div', { class: 'route-dot', 'aria-label': 'Expedition destination' }, icon('target')));
    }
    game.dataset.variant = state.variant;
    game.dataset.screen = state.screen;
    game.dataset.clicks = state.clicks;
    game.replaceChildren(...nodes);
    if (focusedAction) {
        [...game.querySelectorAll('[data-action]')]
            .find(node => node.dataset.action === focusedAction)?.focus({ preventScroll: true });
    }
    document.querySelector('#variant-name').textContent = state.variant + ' · ' + variants[state.variant];
    document.querySelector('#scenario-source').textContent = scene.provenance.note
        || 'Frozen fixture: ' + scene.provenance.fixture + '. No resource overrides.';
    document.querySelector('#state-dump').textContent = JSON.stringify({
        ...state, stocks: { food: food(), materials: materials() }, source: scene.provenance,
    }, null, 2);
    cancelAnimationFrame(coverageFrame);
    coverageFrame = requestAnimationFrame(measureCoverage);
}

function act(action) {
    if (action === 'home') {
        state.selection = 'home';
        state.screen = 'compact';
        state.result = '';
    } else if (action.startsWith('person:')) {
        state.personId = action.slice(7);
        state.selection = 'person';
        state.screen = 'compact';
        state.result = '';
    } else if (action === 'set-up-farmyard') state.screen = 'farmyard';
    else if (action.startsWith('farmer:')) state.farmerId = action.slice(7);
    else if (action.startsWith('cattle:')) {
        const id = action.slice(7);
        state.cattleIds = state.cattleIds.includes(id) ? state.cattleIds.filter(other => other !== id) : [...state.cattleIds, id];
    } else if (action === 'all-cattle') state.cattleIds = cattle().map(animal => animal.id);
    else if (action === 'toggle-specialization') state.specialize = !state.specialize;
    else if (action === 'confirm-farmyard' && !state.farmReady && materials() >= currentScene().houseCost) {
        state.farmReady = true;
        state.spentMaterials = currentScene().houseCost;
        state.roles[state.farmerId] = 'farmer';
        state.selection = 'home';
        state.result = 'Home built · farmer assigned · ' + state.cattleIds.length + ' cattle sheltered';
        state.screen = 'compact';
    } else if (action === 'close') {
        state.screen = state.selection ? 'compact' : 'observe';
        if (state.screen === 'compact' && game.dataset.screen === 'compact') state.screen = 'observe';
    } else if (action === 'world') {
        if (state.targeting) {
            state.targeting = false;
            state.expedition = 'travelling';
            state.selection = 'group';
            state.screen = 'compact';
            state.result = 'Destination assigned · same carried provisions';
        } else {
            state.screen = 'observe';
            state.selection = null;
        }
    } else if (action === 'clock') state.running = !state.running;
    else if (action === 'expeditions') {
        state.screen = 'expedition';
        state.result = '';
    } else if (action === 'create-group') state.groupCreated = true;
    else if (action.startsWith('member:')) {
        const id = action.slice(7);
        state.members = state.members.includes(id) ? state.members.filter(other => other !== id) : [...state.members, id];
    } else if (action === 'start-expedition' && state.expedition === 'home' && state.members.length) {
        state.spentFood = state.members.length * 2;
        state.expedition = 'prepared';
    } else if (action === 'explore') state.targeting = true;
    else if (action === 'cancel-target') state.targeting = false;
    else if (action === 'recall') {
        state.expedition = 'returning';
        state.screen = 'compact';
        state.selection = 'group';
    } else if (action === 'book') {
        state.screen = 'book';
        state.bookTab = 'story';
    } else if (action === 'book-family') state.bookTab = 'family';
    else if (action === 'book-story') state.bookTab = 'story';
    else if (action.startsWith('family:')) state.familyPerson = action.slice(7);
    else if (action.startsWith('occupation:')) {
        const occupation = action.slice(11);
        const resident = currentPerson();
        const activeYard = currentScene().farmyards?.find(yard => yard.householdId === resident.home?.id);
        const farmers = currentScene().people.filter(person => resident.home?.members.includes(person.id)
            && role(person) === 'farmer');
        if (activeYard && role(resident) === 'farmer' && occupation !== 'farmer' && farmers.length === 1) {
            state.pendingOccupation = occupation;
            state.atRiskCattle = activeYard.occupants;
            state.screen = 'occupation-risk';
        } else {
            state.roles[state.personId] = occupation;
            state.result = 'Occupation assigned · career autonomy replaced';
            state.screen = 'compact';
        }
    } else if (action === 'confirm-occupation') {
        state.roles[state.personId] = state.pendingOccupation;
        state.result = 'Occupation changed · household cattle become unassigned';
        state.screen = 'compact';
    } else if (action === 'pace') state.screen = 'menu';
    else state.screen = action;
    render();
}

game.addEventListener('click', event => {
    const target = event.target.closest('button[data-action]');
    if (!target || target.disabled) return;
    state.clicks += 1;
    act(target.dataset.action);
});

function measureCoverage() {
    const root = game.getBoundingClientRect();
    const rectangles = [...game.querySelectorAll('[data-overlay]')].map(node => {
        const box = node.getBoundingClientRect();
        return {
            left: Math.max(0, box.left - root.left), right: Math.min(root.width, box.right - root.left),
            top: Math.max(0, box.top - root.top), bottom: Math.min(root.height, box.bottom - root.top),
        };
    }).filter(box => box.right > box.left && box.bottom > box.top);
    const edges = [...new Set(rectangles.flatMap(box => [box.left, box.right]))].sort((a, b) => a - b);
    let covered = 0;
    for (let index = 1; index < edges.length; index += 1) {
        const left = edges[index - 1], right = edges[index];
        const intervals = rectangles.filter(box => box.left < right && box.right > left)
            .map(box => [box.top, box.bottom]).sort((a, b) => a[0] - b[0]);
        let height = 0, end = -1;
        for (const [top, bottom] of intervals) {
            height += Math.max(0, bottom - Math.max(top, end));
            end = Math.max(end, bottom);
        }
        covered += (right - left) * height;
    }
    game.dataset.worldPercent = (100 * (1 - covered / (root.width * root.height))).toFixed(1);
    document.querySelector('#trial-metrics').textContent = state.clicks + ' clicks · '
        + game.dataset.worldPercent + '% world visible · local draft';
}

function changeVariant(delta) {
    const keys = Object.keys(variants);
    state.variant = keys[(keys.indexOf(state.variant) + delta + keys.length) % keys.length];
    params.set('variant', state.variant);
    history.replaceState(null, '', '?' + params);
    render();
}

document.querySelector('#previous-variant').addEventListener('click', () => changeVariant(-1));
document.querySelector('#next-variant').addEventListener('click', () => changeVariant(1));
document.querySelector('#reset').addEventListener('click', () => reset(state.journey));
document.querySelector('#journey').addEventListener('change', event => reset(event.target.value));
addEventListener('resize', render);
addEventListener('keydown', event => {
    if (event.target.closest('input, textarea, select, [contenteditable=true]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        changeVariant(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'Escape') {
        state.keys += 1;
        if (state.targeting) state.targeting = false;
        else state.screen = state.selection ? 'compact' : 'observe';
        render();
    }
});

// Read-only inspection for review and browser captures; no command or persistence bridge.
window.fjordUiStudy = { snapshot: () => structuredClone(state), source: () => structuredClone(data) };
if (import.meta.env.PROD) {
    document.querySelector('#variant-switcher').hidden = true;
    game.replaceChildren(h('p', { class: 'loading' }, 'This UI study is available in development only.'));
} else reset(params.get('journey') || 'farmyard');
