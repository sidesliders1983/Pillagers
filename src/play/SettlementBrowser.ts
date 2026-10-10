import { SharedSettlement, activeSettlementKey } from './SharedSettlement';
import type { SettlementView } from './SharedSettlement';
export function openSettlement(view: SettlementView, seed = 32) {
    let warning = '';
    try {
        const stored = sessionStorage.getItem(activeSettlementKey);
        if (stored)
            return { campaign: SharedSettlement.restore(stored, view), warning };
    }
    catch (error) {
        warning = 'Stored campaign could not be restored: ' + String(error);
    }
    return { campaign: new SharedSettlement(seed), warning };
}
export function persistSettlement(campaign: SharedSettlement, say: (message: string) => void) {
    if (campaign.transferring)
        return;
    try {
        sessionStorage.setItem(activeSettlementKey, campaign.persist());
    }
    catch {
        say('Session storage unavailable. Save or export before leaving this view.');
    }
}
export function bindViewSwitch(root: HTMLElement, campaign: SharedSettlement, say: (message: string) => void) {
    // A cached outgoing page no longer owns the campaign; restore the current checkpoint.
    window.addEventListener('pageshow', event => {
        if (event.persisted)
            location.reload();
    });
    root.addEventListener('click', event => {
        const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-settlement-view]');
        if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
            return;
        const pace = campaign.session.pacing();
        try {
            sessionStorage.setItem(activeSettlementKey, campaign.handoff(link.dataset.settlementView as SettlementView));
        }
        catch (error) {
            event.preventDefault();
            campaign.transferring = false;
            campaign.session.restorePacing(pace);
            say('View switch cancelled; campaign could not be transferred. ' + String(error));
        }
    });
}
