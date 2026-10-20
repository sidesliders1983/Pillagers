import type { SharedSettlement } from '../play/SharedSettlement';
import type { WildlifeRecord } from './WildlifeHistory';
import { wildlifeLabel } from './WildlifeHistory';
import './wildlife-book.css';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const date = (record: WildlifeRecord) => 'Year ' + record.time.winter + ' · tick ' + record.time.tick;
export function wildlifeEventLink(record: WildlifeRecord, epoch: number, label = 'View wildlife encounter') {
    return '<button type="button" data-wildlife-event="' + escape(record.eventId) +
        '" data-wildlife-epoch="' + epoch + '">' + escape(label) + '</button>';
}
export function recentGroupWildlife(owner: { wildlifeHistory: SharedSettlement['session']['wildlifeHistory']; personalHistoryEpoch: number }, groupId: string) {
    const records = owner.wildlifeHistory().group(groupId);
    return records.length ? '<section class="wildlife-group-history" aria-label="Recent wildlife sightings"><h4>Recent wildlife sightings</h4><ul>' +
        records.map(record => '<li>' + wildlifeEventLink(record, owner.personalHistoryEpoch,
            wildlifeLabel(record.sighting.speciesId) + ' · ' + date(record)) + '</li>').join('') + '</ul></section>' : '';
}
export interface WildlifeNavigation {
    witness?: (id: string) => void;
    group?: (id: string) => void;
}

/** Only recorded species enter this view. The registry is never an undiscovered-animal directory. */
export class WildlifeBookView {
    private selected = '';
    private offset = 0;
    private epoch = -1;
    private target = '';
    private rendered = '';
    constructor(private root: HTMLElement, private owner: SharedSettlement,
        private changed: () => void, private navigation: WildlifeNavigation = {}) {
        root.addEventListener('click', this.click);
    }
    open(eventId?: string) {
        this.update();
        const record = eventId ? this.owner.session.wildlifeHistory().encounter(eventId) : null;
        this.selected = record?.sighting.speciesId ?? '';
        this.offset = record ? this.owner.session.wildlifeHistory().pageFor(record.eventId) : 0;
        this.target = record?.eventId ?? '';
        if (record) this.readSpecies(record.sighting.speciesId);
        this.update();
        if (record) this.root.querySelector<HTMLElement>('[data-wildlife-target]')?.focus();
    }
    private readSpecies(speciesId: string) {
        const first = this.owner.session.wildlifeHistory().species(speciesId)?.first;
        if (first) { this.owner.fjord.markAttentionRead([first.eventId]); this.changed(); }
    }
    update() {
        if (this.epoch !== this.owner.session.personalHistoryEpoch) {
            this.epoch = this.owner.session.personalHistoryEpoch;
            this.selected = ''; this.offset = 0; this.target = '';
        }
        const state = this.owner.session.readSnapshot(), index = this.owner.session.wildlifeHistory();
        let html = '<h3>Creatures of the Fjord</h3>';
        if (!state.wildlife) {
            html += '<p>This campaign has no wildlife sighting history. Earlier encounters are not inferred.</p>' +
                (state.discovery ? '<button type="button" data-wildlife-enable>Start recording wildlife sightings</button>' :
                    '<p>Physical island exploration is required to record sightings.</p>');
        } else if (!index.summaries().length) {
            html += '<p>No wildlife has been recorded by an expedition yet.</p><p>Travel with a group to discover the island’s wildlife.</p>';
        } else {
            const species = this.selected ? index.species(this.selected, this.offset) : null;
            if (!species) {
                html += '<ul class="wildlife-species-list">' + index.summaries().map(summary =>
                    '<li><button type="button" data-wildlife-species="' + escape(summary.speciesId) + '"><strong>' +
                    escape(summary.label) + '</strong><span>Sighted · ' + summary.count + ' encounter' +
                    (summary.count === 1 ? '' : 's') + '</span><small>First sighting: ' + date(summary.first) +
                    '</small></button></li>').join('') + '</ul>';
            } else {
                html += '<button type="button" data-wildlife-back>All recorded species</button><h4>' +
                    escape(species.label) + ' · Sighted</h4><p>First sighting: ' + date(species.first) + ' · ' +
                    escape(species.first.sighting.groupName) + '</p><p>' + species.count + ' recorded encounter' +
                    (species.count === 1 ? '' : 's') + '.</p><ol class="wildlife-records">' +
                    species.encounters.map(record => this.record(record)).join('') + '</ol><nav aria-label="Wildlife history pages">' +
                    '<button type="button" data-wildlife-page="' + Math.max(0, this.offset - 20) + '"' +
                    (this.offset === 0 ? ' disabled' : '') + '>Newer encounters</button><span>' +
                    (this.offset + 1) + '–' + Math.min(species.count, this.offset + 20) + ' of ' + species.count +
                    '</span><button type="button" data-wildlife-page="' + (this.offset + 20) + '"' +
                    (this.offset + 20 >= species.count ? ' disabled' : '') + '>Older encounters</button></nav>';
            }
        }
        if (this.rendered !== html) {
            this.root.innerHTML = html;
            this.rendered = html;
        }
    }
    private record(record: WildlifeRecord) {
        const d = record.sighting, state = this.owner.session.readSnapshot();
        const groupAvailable = !!state.world?.groups[d.expeditionGroupId];
        const witnesses = d.witnessPersonaIds.map(id => {
            const name = record.people.find(person => person.id === id)?.name ?? 'Name not recorded';
            const available = state.personas[id] || state.personaArchive?.[id];
            return '<li>' + (available && this.navigation.witness ? '<button type="button" data-wildlife-person="' +
                escape(id) + '" data-wildlife-witness-event="' + escape(record.eventId) + '">' + escape(name) + '</button>' :
                escape(name)) + '</li>';
        }).join('');
        return '<li id="wildlife-encounter-' + escape(record.eventId) + '" tabindex="-1"' +
            (this.target === record.eventId ? ' data-wildlife-target' : '') + '><h5>' + date(record) +
            (d.firstForClan ? ' · First clan sighting' : '') + '</h5><p>Expedition: ' + escape(d.groupName) +
            (groupAvailable && this.navigation.group ? ' <button type="button" data-wildlife-group="' +
                escape(d.expeditionGroupId) + '">Open current group</button>' : ' · Historical group record') +
            '</p><p>' + escape(d.habitat.replaceAll('_', ' ')) + ' · recorded location ' +
            d.position.x.toFixed(0) + ', ' + d.position.z.toFixed(0) + '</p><h6>Expedition witnesses</h6>' +
            '<p>Recorded group participants; no individual spotter was assigned.</p>' +
            (witnesses ? '<ul>' + witnesses + '</ul>' : '<p>Participant identities were not recorded.</p>') +
            '<details><summary>Source record</summary><p>' + escape(record.eventId) + ' · ' + escape(d.encounterKey) +
            '<br>Wildlife instance: ' + escape(d.wildlifeInstanceId) + '<br>Witness IDs: ' +
            d.witnessPersonaIds.map(escape).join(', ') + '</p></details></li>';
    }
    private click = (event: MouseEvent) => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!button || this.owner.transferring) return;
        const species = button.dataset.wildlifeSpecies;
        if (species && this.owner.session.wildlifeHistory().species(species)) {
            this.selected = species; this.offset = 0; this.target = ''; this.readSpecies(species);
        } else if (button.hasAttribute('data-wildlife-back')) this.selected = '';
        else if (button.hasAttribute('data-wildlife-page')) {
            const offset = Number(button.dataset.wildlifePage);
            const record = this.owner.session.wildlifeHistory().species(this.selected);
            if (!record || !Number.isSafeInteger(offset) || offset < 0 || offset >= record.count) return;
            this.offset = offset; this.target = '';
        } else if (button.hasAttribute('data-wildlife-enable')) {
            this.owner.session.initializeWildlife(); this.changed();
        } else if (button.dataset.wildlifePerson) {
            const record = this.owner.session.wildlifeHistory().encounter(button.dataset.wildlifeWitnessEvent ?? '');
            if (record?.sighting.witnessPersonaIds.includes(button.dataset.wildlifePerson))
                this.navigation.witness?.(button.dataset.wildlifePerson);
        } else if (button.dataset.wildlifeGroup && this.owner.session.readSnapshot().world?.groups[button.dataset.wildlifeGroup]) {
            this.navigation.group?.(button.dataset.wildlifeGroup);
        }
        this.update();
    };
    dispose() { this.root.removeEventListener('click', this.click); }
}
