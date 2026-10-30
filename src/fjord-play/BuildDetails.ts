import { buildDetailsText, formatBuildLabel } from '../build/BuildInfo';

const escape = (text: string) => text.replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

/** Read-only identity in the existing About/support surfaces; never appended to a feedback URL. */
export function buildDetailsHTML(): string {
    return '<div class="fjord-build-details"><p data-build-label>' + escape(formatBuildLabel()) +
        '</p><pre>' + escape(buildDetailsText()) + '</pre></div>';
}
