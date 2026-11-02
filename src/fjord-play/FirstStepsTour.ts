import { updateView } from '../gameplay-lab/updateView';
import type { OrientationObjective } from './JourneyProgress';
import './first-steps-tour.css';

export interface BasicsCallout {
    step: OrientationObjective;
    phase?: string;
    title: string;
    text: string;
    done: number;
    anchor: HTMLElement | null;
    fallbackAnchor?: HTMLElement | null;
    next?: string;
    back?: boolean;
    complete?: boolean;
}

const escape = (value: string) => value.replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const control = (action: string, label: string, disabled = false) =>
    `<button type="button" data-basics="${action}" ${disabled ? 'disabled' : ''}>${escape(label)}</button>`;
type Bounds = { left: number; top: number; right: number; bottom: number };
const area = (a: Bounds, b: Bounds) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const clamp = (value: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(value, Math.max(minimum, maximum)));

/** Chapter 0's single anchored hint. It owns no world input, progress or simulation. */
export class FirstStepsTour {
    readonly root = document.createElement('div');
    private callout = document.createElement('section');
    private chip = document.createElement('button');
    private halo = document.createElement('div');
    private arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    private abort = new AbortController();
    private model?: BasicsCallout;
    private frame = 0;
    private html = '';
    private sizes?: ResizeObserver;
    private views?: MutationObserver;
    private additions?: MutationObserver;
    private observedViews: HTMLElement[] = [];
    private observedChildren: Element[] = [];
    private target?: HTMLElement;
    private measuredTarget?: HTMLElement;
    private resolveAgain = false;

    constructor(private parent: HTMLElement, private action: (action: string) => void,
        private changed?: () => void) {
        this.root.id = 'fjord-basics-tour';
        this.root.hidden = true;
        this.callout.id = 'fjord-basics-callout';
        this.callout.setAttribute('role', 'region');
        this.callout.setAttribute('aria-labelledby', 'fjord-basics-title');
        this.chip.id = 'fjord-basics-chip';
        this.chip.type = 'button';
        this.chip.dataset.basics = 'browse';
        this.halo.className = 'basics-target-halo';
        this.halo.setAttribute('aria-hidden', 'true');
        this.arrow.classList.add('basics-target-arrow');
        this.arrow.setAttribute('aria-hidden', 'true');
        this.arrow.setAttribute('preserveAspectRatio', 'none');
        this.arrow.setAttribute('hidden', '');
        this.arrow.innerHTML = '<defs><marker id="basics-arrow-tip" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8"/></marker></defs><path data-basics-arrow marker-end="url(#basics-arrow-tip)"/>';
        this.root.append(this.halo, this.arrow, this.chip, this.callout);
        this.parent.append(this.root);
        for (const element of [this.callout, this.chip]) {
            for (const type of ['pointerdown', 'pointerup', 'wheel', 'click'])
                element.addEventListener(type, event => event.stopPropagation(), { signal: this.abort.signal });
            // Handle actions here because world handlers must not receive callout clicks.
            element.addEventListener('click', event => {
                const target = (event.target as Element).closest<HTMLButtonElement>('[data-basics]');
                if (!target || target.disabled) return;
                const focused = document.activeElement;
                this.action(target.dataset.basics!);
                // Only an action in this callout can move focus after replacing its control.
                if (focused === target && (!target.isConnected || !target.getClientRects().length) && !this.root.hidden) {
                    if (!this.focusTarget()) this.focus();
                }
            }, { signal: this.abort.signal });
            element.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.key === 'Escape') { event.preventDefault(); this.action('skip'); }
            }, { signal: this.abort.signal });
        }
        const options = { signal: this.abort.signal };
        window.addEventListener('resize', this.schedule, options);
        document.addEventListener('scroll', this.schedule, { ...options, capture: true });
        document.addEventListener('fjord-layout-change', this.schedule, options);
        window.visualViewport?.addEventListener('resize', this.schedule, options);
        window.visualViewport?.addEventListener('scroll', this.schedule, options);
        if (typeof window.ResizeObserver !== 'undefined') this.sizes = new window.ResizeObserver(() => this.queue(false));
        if (typeof window.MutationObserver !== 'undefined') {
            this.views = new window.MutationObserver(this.viewChanged);
            this.additions = new window.MutationObserver(this.viewChanged);
        }
    }

    show(model: BasicsCallout) {
        this.model = model;
        this.root.hidden = false;
        this.callout.hidden = false;
        const step = ['ui-camera', 'ui-resident', 'ui-connections', 'ui-home', 'ui-time', 'ui-navigation'].indexOf(model.step) + 1;
        this.chip.textContent = model.complete ? 'Basics complete · Open journey' : `Basics · Step ${step}/6 · Journey`;
        this.callout.dataset.step = model.step;
        this.callout.dataset.phase = model.phase ?? 'entry';
        this.callout.dataset.complete = String(!!model.complete);
        const html = `<div class="basics-callout-heading"><span role="status">${model.complete ? 'Basics complete' : `Step ${step}/6`}</span>${control('skip', 'Skip tour')}</div>
            <h2 id="fjord-basics-title">${escape(model.title)}</h2><p>${escape(model.text)}</p>
            <p class="basics-fallback-note" data-basics-fallback-note hidden></p>
            <div class="basics-actions">${control('back', 'Back', !model.back)}${control('show', 'Show me')}${model.next ? control('next', model.next) : ''}</div>`;
        if (html !== this.html) { updateView(this.callout, html); this.html = html; }
        this.observeViews();
        this.position();
    }

    private schedule = () => this.queue(true);

    private queue(resolve: boolean) {
        this.resolveAgain ||= resolve;
        if (this.root.hidden || this.frame) return;
        this.frame = window.requestAnimationFrame(() => {
            this.frame = 0;
            if (this.root.hidden) return;
            if (this.resolveAgain) {
                this.resolveAgain = false;
                this.observeViews();
                this.changed?.();
            }
            this.position();
        });
    }

    private viewChanged = (records: MutationRecord[]) => {
        const owned = (node: Node) => node === this.root || this.root.contains(node);
        if (records.some(record => !owned(record.target) && (record.type !== 'childList' ||
            [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => !owned(node))))) this.queue(true);
    };

    private observeViews() {
        if (this.root.hidden) return;
        const elements = ['entity-panel', 'fjord-directory', 'fjord-workspace', 'fjord-menu', 'clan-book-reader']
            .map(id => document.getElementById(id)).filter((element): element is HTMLElement => !!element);
        if (elements.length !== this.observedViews.length || elements.some((element, i) => element !== this.observedViews[i])) {
            this.views?.disconnect();
            for (const element of elements) this.views?.observe(element, {
                subtree: true, childList: true, attributes: true,
                attributeFilter: ['hidden', 'open', 'aria-expanded'],
            });
            this.observedViews = elements;
        }
        const children = Array.from(this.parent.children).filter(element => element !== this.root);
        if (children.length !== this.observedChildren.length || children.some((element, i) => element !== this.observedChildren[i])) {
            this.additions?.disconnect();
            this.additions?.observe(this.parent, { childList: true });
            for (const element of children) this.additions?.observe(element, {
                attributes: true, attributeFilter: ['hidden', 'open', 'aria-expanded'],
            });
            this.observedChildren = children;
        }
    }

    private viewport(): Bounds {
        const viewport = window.visualViewport;
        return { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
            right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth),
            bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) };
    }

    private modal() {
        return Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).reverse().find(dialog => {
            try { return dialog.matches(':modal'); }
            catch { return dialog.id === 'fjord-island-map' && this.parent.classList.contains('fjord-mobile'); }
        });
    }

    private visibleRect(element: HTMLElement | null | undefined, viewport: Bounds): DOMRect | undefined {
        if (!element?.isConnected || element.closest('[hidden], [inert]') || this.root.contains(element)) return;
        const modal = this.modal();
        if (modal && !modal.contains(element)) return;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || !element.getClientRects().length) return;
        const clipped: Bounds = { left: Math.max(rect.left, viewport.left), top: Math.max(rect.top, viewport.top),
            right: Math.min(rect.right, viewport.right), bottom: Math.min(rect.bottom, viewport.bottom) };
        for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
            const style = window.getComputedStyle(ancestor);
            if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return;
            if (ancestor instanceof HTMLDetailsElement && !ancestor.open &&
                !ancestor.querySelector(':scope > summary')?.contains(element)) return;
            if (ancestor === element) continue;
            const box = ancestor.getBoundingClientRect();
            if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) {
                clipped.left = Math.max(clipped.left, box.left + ancestor.clientLeft);
                clipped.right = Math.min(clipped.right, box.left + ancestor.clientLeft + ancestor.clientWidth);
            }
            if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) {
                clipped.top = Math.max(clipped.top, box.top + ancestor.clientTop);
                clipped.bottom = Math.min(clipped.bottom, box.top + ancestor.clientTop + ancestor.clientHeight);
            }
        }
        if (clipped.right <= clipped.left || clipped.bottom <= clipped.top) return;
        // A partially clipped control is a misleading target; use its visible entry instead.
        if (element.id !== 'fjord-canvas' && (clipped.left > rect.left + 1 || clipped.top > rect.top + 1 ||
            clipped.right < rect.right - 1 || clipped.bottom < rect.bottom - 1)) return;
        return rect;
    }

    private markTarget(target?: HTMLElement) {
        if (this.target !== target) this.target?.removeAttribute('data-basics-target');
        this.target = target;
        if (target && !target.hasAttribute('data-basics-target')) target.setAttribute('data-basics-target', '');
        if (this.measuredTarget !== target) {
            this.sizes?.disconnect();
            this.sizes?.observe(this.callout);
            if (target) this.sizes?.observe(target);
            this.measuredTarget = target;
        }
    }

    private place(width: number, height: number, bounds: Bounds, anchor: Bounds | undefined, avoid: Bounds[], cornersFirst = false) {
        const viewport = this.viewport();
        const header = this.visibleRect(document.getElementById('fjord-header'), viewport);
        const belowHeader = Math.max(bounds.top, (header?.bottom ?? bounds.top - 12) + 12);
        const panels = anchor && !cornersFirst ? ['#fjord-management', '#fjord-workspace', '#clan-book-reader',
            '#fjord-menu[open]', '#fjord-island-map[open]']
            .map(selector => this.visibleRect(document.querySelector<HTMLElement>(selector), viewport))
            .filter((panel): panel is DOMRect => !!panel && area(panel, anchor) > 0) : [];
        const points = anchor && !cornersFirst ? [
            { x: anchor.left - width - 14, y: (anchor.top + anchor.bottom - height) / 2 },
            { x: anchor.right + 14, y: (anchor.top + anchor.bottom - height) / 2 },
            { x: (anchor.left + anchor.right - width) / 2, y: anchor.bottom + 14 },
            { x: (anchor.left + anchor.right - width) / 2, y: anchor.top - height - 14 },
            { x: (anchor.left + anchor.right - width) / 2, y: belowHeader },
            { x: anchor.right + 14, y: Math.max(anchor.top, belowHeader) },
            { x: anchor.left - width - 14, y: Math.max(anchor.top, belowHeader) },
        ] : [];
        if (anchor && !cornersFirst) {
            for (const panel of panels) {
                const y = Math.max(belowHeader, anchor.top);
                points.push({ x: panel.right + 14, y }, { x: panel.left - width - 14, y },
                    { x: (anchor.left + anchor.right - width) / 2, y: panel.bottom + 14 });
            }
        }
        if (cornersFirst) points.push({ x: bounds.right - width, y: bounds.top }, { x: bounds.left, y: bounds.top });
        points.push({ x: bounds.right - width, y: bounds.bottom - height },
            { x: bounds.left, y: bounds.bottom - height }, { x: bounds.right - width, y: bounds.top },
            { x: bounds.left, y: bounds.top });
        const important = ['#entity-panel [data-ui="close-card"]', '#fjord-workspace [data-ui="close-workspace"]',
            '#clan-book-close', '#fjord-menu [data-menu-close]', '#fjord-island-map [data-map-close]']
            .map(selector => this.visibleRect(document.querySelector<HTMLElement>(selector), viewport))
            .filter((control): control is DOMRect => !!control);
        if (header) important.push(header);
        const positions = points.map(point => {
            const x = clamp(point.x, bounds.left, bounds.right - width);
            const y = clamp(point.y, bounds.top, bounds.bottom - height);
            const box = { left: x, top: y, right: x + width, bottom: y + height };
            const distance = anchor && !cornersFirst ? Math.hypot(
                Math.max(0, box.left - anchor.right, anchor.left - box.right),
                Math.max(0, box.top - anchor.bottom, anchor.top - box.bottom)) : 0;
            // Panel obstruction is a bounded preference, so a tiny overlap cannot
            // send a hint across the scene. Actual targets and Close/HUD stay clear.
            const obstruction = avoid.reduce((sum, region, i) =>
                sum + Math.min(1, area(box, region) / Math.max(1, width * height)) * (i === 0 ? 600 : 220), 0);
            return { x, y, overlap: anchor ? area(box, anchor) : 0,
                controls: important.reduce((sum, region) => sum + area(box, region), 0),
                coversOwner: panels.some(panel => area(box, panel) > 0),
                proximity: distance + obstruction };
        });
        // Keep the card being explained readable when adjacent space exists. If
        // every candidate overlaps its owner, retain the bounded narrow-view fallback.
        positions.sort((a, b) => a.overlap - b.overlap || a.controls - b.controls ||
            Number(a.coversOwner) - Number(b.coversOwner) || a.proximity - b.proximity);
        return positions[0];
    }

    private position() {
        if (this.root.hidden || !this.model) return;
        const viewport = this.viewport();
        const primary = this.visibleRect(this.model.anchor, viewport);
        let target = primary ? this.model.anchor! : this.model.fallbackAnchor ?? undefined;
        const rect = primary ?? this.visibleRect(target, viewport);
        if (!rect) target = undefined;
        const menu = document.querySelector<HTMLDetailsElement>('#fjord-menu[open]');
        // Keep the callout in the actual top-layer/menu owner, so it remains reachable
        // and the menu's outside-pointer handler does not dismiss its own guidance.
        const host = target?.closest<HTMLDialogElement>('dialog[open]') ?? this.modal() ?? menu ?? this.parent;
        if (this.root.parentElement !== host) host.append(this.root);
        const origin = this.root.getBoundingClientRect();
        const style = window.getComputedStyle(this.root);
        const inset = (side: string) => Number.parseFloat(style.getPropertyValue('padding-' + side)) || 0;
        const bounds = { left: viewport.left + inset('left') + 12, top: viewport.top + inset('top') + 12,
            right: viewport.right - inset('right') - 12, bottom: viewport.bottom - inset('bottom') - 12 };
        const width = Math.min(target ? 292 : 260, bounds.right - bounds.left);
        this.callout.style.width = `${width}px`;
        this.callout.style.maxHeight = `${bounds.bottom - bounds.top}px`;
        this.chip.style.width = `${Math.min(210, bounds.right - bounds.left)}px`;
        // A canvas occupies the world. Point at its edge and leave the drag area open.
        const anchor = rect && target?.id === 'fjord-canvas' ? {
            left: Math.min(bounds.right, rect.right) - 20, right: Math.min(bounds.right, rect.right) - 4,
            top: clamp(rect.top + rect.height / 2, bounds.top, bounds.bottom - 24),
            bottom: clamp(rect.top + rect.height / 2, bounds.top, bounds.bottom - 24) + 24,
        } : rect;
        const avoid = ['#fjord-header', '#fjord-management', '#fjord-workspace', '#clan-book-reader', '#fjord-menu[open]']
            .map(selector => document.querySelector<HTMLElement>(selector))
            .map(element => this.visibleRect(element, viewport)).filter((box): box is DOMRect => !!box);
        const chipBox = this.chip.getBoundingClientRect();
        const header = this.visibleRect(document.getElementById('fjord-header'), viewport);
        const chipBounds = { ...bounds, top: clamp((header?.bottom ?? bounds.top - 8) + 8,
            bounds.top, bounds.bottom - chipBox.height) };
        const chipPosition = this.place(chipBox.width, chipBox.height, chipBounds, anchor, avoid, true);
        this.chip.style.left = `${chipPosition.x - origin.left}px`;
        this.chip.style.top = `${chipPosition.y - origin.top}px`;
        const chipRegion = { left: chipPosition.x, top: chipPosition.y,
            right: chipPosition.x + chipBox.width, bottom: chipPosition.y + chipBox.height };
        const fallback = !primary;
        this.callout.dataset.fallback = String(fallback);
        const note = this.callout.querySelector<HTMLElement>('[data-basics-fallback-note]')!;
        note.hidden = !fallback;
        const notice = target ? 'Use the highlighted entry to find this control.' :
            'This control is not visible. Use Show me to find an available entry, or return later.';
        if (note.textContent !== notice) note.textContent = notice;
        const box = this.callout.getBoundingClientRect();
        const height = box.height;
        const position = this.place(width, height, bounds, anchor, [chipRegion, ...avoid]);
        this.callout.style.left = `${position.x - origin.left}px`;
        this.callout.style.top = `${position.y - origin.top}px`;
        this.callout.dataset.anchor = target ? target.id || target.dataset.ui || target.tagName.toLowerCase() : 'fallback';
        if (target) this.callout.dataset.anchorSource = '[data-basics-target]';
        else delete this.callout.dataset.anchorSource;
        this.markTarget(target);
        this.halo.hidden = !anchor;
        if (!anchor) { this.arrow.setAttribute('hidden', ''); return; }
        Object.assign(this.halo.style, {
            left: `${anchor.left - origin.left - 3}px`, top: `${anchor.top - origin.top - 3}px`,
            width: `${anchor.right - anchor.left + 6}px`, height: `${anchor.bottom - anchor.top + 6}px`,
        });
        const x = (anchor.left + anchor.right) / 2 - origin.left;
        const y = (anchor.top + anchor.bottom) / 2 - origin.top;
        const startX = clamp(x, position.x - origin.left + 8, position.x - origin.left + width - 8);
        const startY = clamp(y, position.y - origin.top + 8, position.y - origin.top + height - 8);
        this.arrow.setAttribute('viewBox', `0 0 ${origin.width} ${origin.height}`);
        this.arrow.querySelector('[data-basics-arrow]')!.setAttribute('d', `M${startX} ${startY} L${x} ${y}`);
        this.arrow.removeAttribute('hidden');
    }

    hide() {
        this.root.hidden = true;
        this.model = undefined;
        this.markTarget();
        this.sizes?.disconnect();
        this.views?.disconnect();
        this.additions?.disconnect();
        this.observedViews = [];
        this.observedChildren = [];
        this.measuredTarget = undefined;
        this.resolveAgain = false;
        if (this.frame) window.cancelAnimationFrame(this.frame);
        this.frame = 0;
    }

    focus() { this.callout.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }

    get anchorElement() {
        return !this.root.hidden && this.visibleRect(this.target, this.viewport()) ? this.target : undefined;
    }

    focusTarget(): boolean {
        if (this.root.hidden) return false;
        this.position();
        const target = this.target;
        if (!target) return false;
        if (!target.matches('button, input, select, textarea, summary, a[href], [tabindex]')) {
            target.setAttribute('tabindex', '-1');
            target.addEventListener('blur', () => {
                if (target.getAttribute('tabindex') === '-1') target.removeAttribute('tabindex');
            }, { once: true, signal: this.abort.signal });
        }
        target.focus({ preventScroll: true });
        return document.activeElement === target;
    }

    dispose() { this.hide(); this.abort.abort(); this.root.remove(); }
}
