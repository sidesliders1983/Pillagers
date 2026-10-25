import { icon } from './FjordIcons';

/** One navigation structure for the desktop bar and the compact mobile drawer. */
export function fjordNavigationHTML(): string {
    return `<nav id="fjord-navigation" aria-label="Settlement navigation">
        <button type="button" id="fjord-mobile-menu" aria-label="Settlement navigation"
            aria-expanded="false" aria-controls="fjord-navigation-drawer">${icon('menu')}</button>
        <div id="fjord-navigation-drawer">
            <button type="button" data-surface="settlement">${icon('home')}Settlement</button>
            <button type="button" id="fjord-book">${icon('book')}Clan Book</button>
            <button type="button" id="fjord-first-steps" aria-controls="fjord-first-steps-card">${icon('help')}Need help?</button>
        </div>
        <button type="button" data-surface="expeditions">${icon('route')}Expeditions</button>
    </nav>`;
}
