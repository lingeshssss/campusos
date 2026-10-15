import type { State } from './model.ts';
import { ConflictError, OfflineError, type Loaded, type Saved, type StateStore } from '../shared/platform.ts';

// Offline-aware state store for the iOS app. Reads fall back to the last synced copy on the device.
// Edits made while offline are queued against the server version they were based on. Syncing sends them
// with that version, so if the server changed meanwhile the result is an explicit conflict for the
// student to resolve; nothing is overwritten silently.

export type Pending = { state: State; baseVersion: number; editedAt: string };
export type Snapshot = { userId: string; server: Loaded | null; pending: Pending | null; lastSynced: string | null };
export type SyncStatus = {
    mode: 'online' | 'offline' | 'syncing' | 'conflict';
    pending: boolean;
    lastSynced: string | null;
    /** Server copy shown in the conflict dialog. */
    server?: Loaded;
    message?: string;
};

export type OfflineDeps = {
    userId: string;
    remote: { load(): Promise<Loaded>; save(state: State, version: number): Promise<Saved> };
    cache: { read(): Promise<Snapshot | null>; write(snapshot: Snapshot): Promise<void> };
    now?: () => Date;
};

export type OfflineStore = StateStore & {
    subscribe(listener: (loaded: Loaded) => void): () => void;
    status(): SyncStatus;
    onStatus(listener: (s: SyncStatus) => void): () => void;
    /** Pushes queued offline edits, if any. Safe to call at any time (reconnect, app resume). */
    sync(): Promise<void>;
    /** 'server' discards the queued edits; 'mine' replaces the newer server copy with them. */
    resolveConflict(choice: 'server' | 'mine'): Promise<void>;
    pending(): Pending | null;
};

export function createOfflineStore(deps: OfflineDeps): OfflineStore {
    const now = deps.now ?? (() => new Date());
    let snap: Snapshot = { userId: deps.userId, server: null, pending: null, lastSynced: null };
    let status: SyncStatus = { mode: 'online', pending: false, lastSynced: null };
    let syncing: Promise<void> | null = null;
    const stateListeners = new Set<(l: Loaded) => void>(), statusListeners = new Set<(s: SyncStatus) => void>();

    const setStatus = (next: Partial<SyncStatus>) => {
        status = { ...status, ...next, pending: !!snap.pending, lastSynced: snap.lastSynced };
        if (status.mode !== 'conflict') delete status.server;
        statusListeners.forEach(l => l(status));
    };
    const persist = () => deps.cache.write(snap);
    const visible = (): Loaded | null => snap.pending ? { state: snap.pending.state, version: snap.pending.baseVersion } : snap.server;
    const emit = () => { const v = visible(); if (v) stateListeners.forEach(l => l(v)); };
    const synced = async (loaded: Loaded) => {
        snap = { ...snap, server: loaded, lastSynced: now().toISOString() };
        await persist();
    };

    async function pushPending(): Promise<void> {
        if (!snap.pending) return;
        const pending = snap.pending;
        setStatus({ mode: 'syncing', message: undefined });
        try {
            const saved = await deps.remote.save(pending.state, pending.baseVersion);
            // Edits made while this request was in flight stay queued on top of the new version.
            const newer = snap.pending !== pending ? snap.pending : null;
            snap = { ...snap, pending: newer ? { ...newer, baseVersion: saved.version } : null };
            await synced({ state: pending.state, version: saved.version });
            setStatus({ mode: 'online' });
            emit();
            if (newer) await pushPending();
        } catch (e) {
            if (e instanceof ConflictError) {
                let server: Loaded | undefined;
                try {
                    server = await deps.remote.load();
                    await synced(server);
                } catch { /* keep the previous server copy */ }
                setStatus({ mode: 'conflict', server: server ?? snap.server ?? undefined, message: 'CampusOS changed on another device while this iPhone had unsynced edits.' });
            } else if (e instanceof OfflineError) {
                setStatus({ mode: 'offline' });
            } else {
                setStatus({ mode: 'offline', message: e instanceof Error ? e.message : 'Sync failed. Your edits are still on this iPhone.' });
                throw e;
            }
        }
    }

    const store: OfflineStore = {
        async load() {
            const cached = await deps.cache.read().catch(() => null);
            if (cached && cached.userId === deps.userId) snap = cached;
            try {
                const loaded = await deps.remote.load();
                await synced(loaded);
                setStatus({ mode: 'online' });
                if (snap.pending) await store.sync();
            } catch (e) {
                if (!(e instanceof OfflineError)) throw e;
                if (!visible()) throw new OfflineError('You’re offline and this iPhone doesn’t have a saved copy yet. Connect once to download your data.');
                setStatus({ mode: 'offline' });
            }
            return visible()!;
        },
        async save(next, version) {
            if (status.mode === 'conflict' || snap.pending) {
                snap = { ...snap, pending: { state: next, baseVersion: snap.pending?.baseVersion ?? version, editedAt: now().toISOString() } };
                await persist();
                setStatus({});
                if (status.mode === 'conflict') return { version: snap.pending!.baseVersion, queued: true };
                await store.sync();
                return snap.pending ? { version: snap.pending.baseVersion, queued: true } : { version: snap.server!.version };
            }
            try {
                const saved = await deps.remote.save(next, version);
                await synced({ state: next, version: saved.version });
                setStatus({ mode: 'online' });
                return saved;
            } catch (e) {
                if (!(e instanceof OfflineError)) throw e;
                snap = { ...snap, pending: { state: next, baseVersion: version, editedAt: now().toISOString() } };
                await persist();
                setStatus({ mode: 'offline' });
                return { version, queued: true };
            }
        },
        subscribe(listener) {
            stateListeners.add(listener);
            return () => { stateListeners.delete(listener); };
        },
        status: () => status,
        onStatus(listener) {
            statusListeners.add(listener);
            listener(status);
            return () => { statusListeners.delete(listener); };
        },
        async sync() {
            if (status.mode === 'conflict' || !snap.pending) return;
            syncing ??= pushPending().finally(() => { syncing = null; });
            return syncing;
        },
        async resolveConflict(choice) {
            if (!snap.pending) return setStatus({ mode: 'online' });
            setStatus({ mode: 'syncing' });
            try {
                const server = await deps.remote.load();
                if (choice === 'server') {
                    snap = { ...snap, pending: null };
                    await synced(server);
                } else {
                    const saved = await deps.remote.save(snap.pending.state, server.version);
                    const mine = snap.pending.state;
                    snap = { ...snap, pending: null };
                    await synced({ state: mine, version: saved.version });
                }
                setStatus({ mode: 'online', message: undefined });
                emit();
            } catch (e) {
                setStatus({ mode: e instanceof OfflineError ? 'offline' : 'conflict', server: snap.server ?? undefined, message: e instanceof Error ? e.message : 'Could not resolve the conflict. Try again.' });
            }
        },
        pending: () => snap.pending,
    };
    return store;
}
