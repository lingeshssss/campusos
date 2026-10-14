import type { DesiredEvent, GoogleEvent, EventMap, SyncAction } from './google-events.ts';
import { comparableEvent, isOwnedEvent } from './google-events.ts';
export function buildSyncActions(desired: DesiredEvent[], map: EventMap, remote: Map<string, GoogleEvent>, owner: string, classes: boolean, deadlines: boolean) { const nextMap: EventMap = structuredClone(map), actions: SyncAction[] = []; let unchanged = 0; const desiredKeys = new Set(desired.map(x => x.key)); for (const d of desired) {
    let record = nextMap[d.key];
    let actual = record ? remote.get(record.id) : undefined;
    if (actual && actual.status === 'cancelled') {
        record = { ...record, tombstone: true };
        nextMap[d.key] = record;
        actual = undefined;
    }
    if (actual && !isOwnedEvent(actual, owner, d.key))
        throw Error('A mapped event no longer belongs to CampusOS. No changes were made.');
    if (!actual) {
        if (!record || record.tombstone || record.confirmed) {
            record = { id: crypto.randomUUID().replaceAll('-', ''), title: d.title, kind: d.kind, confirmed: false };
            nextMap[d.key] = record;
        }
        actions.push({ op: 'create', key: d.key, eventId: record.id, title: d.title, body: d.body });
        continue;
    }
    nextMap[d.key] = { ...record, title: d.title, confirmed: true };
    if (comparableEvent(actual) === comparableEvent(d.body)) {
        unchanged++;
        continue;
    }
    actions.push({ op: 'update', key: d.key, eventId: record.id, title: d.title, etag: actual.etag, body: d.body });
} for (const [key, record] of Object.entries(nextMap)) {
    if (desiredKeys.has(key) || record.tombstone || (record.kind === 'class' && !classes) || (record.kind === 'deadline' && !deadlines))
        continue;
    const actual = remote.get(record.id);
    if (!actual || actual.status === 'cancelled') {
        nextMap[key] = { ...record, tombstone: true };
        continue;
    }
    if (!isOwnedEvent(actual, owner, key))
        throw Error('A mapped event no longer belongs to CampusOS. No changes were made.');
    actions.push({ op: 'remove', key, eventId: record.id, title: record.title, etag: actual.etag });
} return { actions, map: nextMap, unchanged }; }
