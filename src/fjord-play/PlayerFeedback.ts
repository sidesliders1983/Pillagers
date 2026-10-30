/** Public, owner-configured destination only. Never append campaign or user context. */
export function playerFeedbackLinkHTML(configuredURL =
    (globalThis as typeof globalThis & { __FJORD_FEEDBACK_URL__?: string }).__FJORD_FEEDBACK_URL__ ?? ''): string {
    let destination: URL;
    try { destination = new URL(configuredURL); }
    catch { return ''; }
    if (destination.protocol !== 'https:' || destination.username || destination.password) return '';
    const href = destination.href.replace(/[&<>"']/g,
        character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
    return `<a data-player-feedback href="${href}" target="_blank" rel="noopener noreferrer">Give feedback <span class="player-menu-link-note">(opens a new tab)</span></a>`;
}
