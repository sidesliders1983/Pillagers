import { attentionLimits, eventOrdinal } from './AttentionHistory';
import type { AttentionAlert, AttentionRecord } from './AttentionHistory';
import type { SimulationState } from '../simulation/SimulationCore';

export interface AttentionMetadata {
    version: 1;
    readThrough: number;
    readIds: string[];
    alerts: { id: string; since: number; acknowledged: boolean }[];
}
export const createAttentionMetadata = (head: number): AttentionMetadata =>
    ({ version: 1, readThrough: head, readIds: [], alerts: [] });
export function validateAttentionMetadata(value: AttentionMetadata, state: SimulationState) {
    if (!value || value.version !== 1 || !Number.isSafeInteger(value.readThrough) || value.readThrough < 0 ||
        value.readThrough > state.events.length || !Array.isArray(value.readIds) || value.readIds.length > attentionLimits.inbox ||
        new Set(value.readIds).size !== value.readIds.length || !Array.isArray(value.alerts) || value.alerts.length > attentionLimits.alerts ||
        new Set(value.alerts.map(alert => alert.id)).size !== value.alerts.length)
        throw new Error('Invalid Attention metadata.');
    for (const id of value.readIds) {
        if (typeof id !== 'string' || eventOrdinal(id) <= value.readThrough || state.events[eventOrdinal(id) - 1]?.id !== id)
            throw new Error('Invalid Attention read reference.');
    }
    for (const alert of value.alerts) {
        if (!['food-empty', 'housing', 'livestock-shelter'].includes(alert.id) && !/^stranded:explore-[1-9][0-9]*$/.test(alert.id) ||
            typeof alert.acknowledged !== 'boolean' || !Number.isSafeInteger(alert.since) || alert.since < 0 || alert.since > state.events.length)
            throw new Error('Invalid Attention acknowledgement.');
    }
}
export function reconcileAttention(metadata: AttentionMetadata, records: readonly AttentionRecord[],
    alerts: readonly AttentionAlert[], head: number) {
    const retained = new Set(records.map(record => record.eventId));
    metadata.readIds = metadata.readIds.filter(id => retained.has(id) && eventOrdinal(id) > metadata.readThrough);
    metadata.alerts = alerts.map(alert => metadata.alerts.find(saved => saved.id === alert.id) ??
        { id: alert.id, since: head, acknowledged: false });
}
export const attentionRead = (metadata: AttentionMetadata, eventId: string) =>
    eventOrdinal(eventId) <= metadata.readThrough || metadata.readIds.includes(eventId);
export function readAttentionEvents(metadata: AttentionMetadata, records: readonly AttentionRecord[], ids: readonly string[]) {
    const actual = new Set(records.map(record => record.eventId));
    for (const id of ids) {
        if (actual.has(id) && !attentionRead(metadata, id)) metadata.readIds.push(id);
    }
}
export function acknowledgeAttention(metadata: AttentionMetadata, id: string, since: number) {
    const alert = metadata.alerts.find(alert => alert.id === id && alert.since === since);
    if (alert) alert.acknowledged = true;
}
export interface AttentionGroup {
    id: string;
    canonicalType: string;
    category: AttentionRecord['category'];
    year: number;
    unread: number;
    records: AttentionRecord[];
}
export function attentionGroups(records: readonly AttentionRecord[], metadata: AttentionMetadata, unreadOnly: boolean) {
    const groups = new Map<string, AttentionGroup>();
    for (const record of records.slice().reverse()) {
        const unread = !attentionRead(metadata, record.eventId);
        if (unreadOnly && !unread) continue;
        const id = record.canonicalType + ':' + record.time.winter;
        const group = groups.get(id) ?? { id, canonicalType: record.canonicalType, category: record.category,
            year: record.time.winter, unread: 0, records: [] };
        group.records.push(record);
        if (unread) group.unread++;
        groups.set(id, group);
    }
    return [...groups.values()];
}
