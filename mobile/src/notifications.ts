import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import type { State } from '../../lib/model';
import { planReminders } from '../../lib/reminders';
import { isAndroid } from './device';

// Android: two user-visible channels (Settings → Apps → CampusOS → Notifications) and a monochrome status-bar
// icon (android/app/src/main/res/drawable/ic_stat_campusos.xml). Reminders are inexact alarms that may fire
// while the phone idles (Doze): Android can delay them by several minutes, and CampusOS deliberately does not
// request the restricted exact-alarm permission. Nothing here is guaranteed to the minute.
const CHANNELS = { deadline: 'campusos-deadlines', timer: 'campusos-timer' } as const;
let channels: Promise<void> | null = null;
function ensureChannels() {
    if (!isAndroid) return Promise.resolve();
    channels ??= Promise.all([
        LocalNotifications.createChannel({ id: CHANNELS.deadline, name: 'Deadline reminders', description: 'Exams, papers and other deadlines you saved', importance: 3, visibility: 0 }),
        LocalNotifications.createChannel({ id: CHANNELS.timer, name: 'Focus timer', description: 'When a focus or break timer ends', importance: 4, visibility: 0 }),
    ]).then(() => undefined).catch(() => { channels = null; });
    return channels;
}

// On-device reminders (no server push): deadline alerts and the end of a running focus/break timer.
// Off until the student turns them on in Settings, which is when the phone asks for permission
// (iOS; Android 13+ POST_NOTIFICATIONS). Turning them on is the only time permission is requested.
export type ReminderPrefs = { deadlines: boolean; timer: boolean };
const PREFS = 'reminders';

export async function reminderPrefs(): Promise<ReminderPrefs> {
    const { value } = await Preferences.get({ key: PREFS });
    try {
        const p = JSON.parse(value ?? '') as Partial<ReminderPrefs>;
        return { deadlines: p.deadlines === true, timer: p.timer === true };
    } catch {
        return { deadlines: false, timer: false };
    }
}

export async function permission(): Promise<'granted' | 'denied' | 'prompt'> {
    const { display } = await LocalNotifications.checkPermissions();
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
}

/** Saves preferences, asking iOS for permission when turning something on. Returns the effective permission. */
export async function setReminderPrefs(prefs: ReminderPrefs, state: State | null) {
    let status = await permission();
    if ((prefs.deadlines || prefs.timer) && status === 'prompt') status = (await LocalNotifications.requestPermissions()).display === 'granted' ? 'granted' : 'denied';
    await Preferences.set({ key: PREFS, value: JSON.stringify(prefs) });
    if (state) await syncReminders(state);
    return status;
}

let queue: Promise<void> = Promise.resolve();

/** Replaces all scheduled CampusOS reminders with the current plan. Serialized; safe to call often. */
export function syncReminders(state: State): Promise<void> {
    queue = queue.then(async () => {
        const prefs = await reminderPrefs();
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
        if ((!prefs.deadlines && !prefs.timer) || await permission() !== 'granted') return;
        const plan = planReminders(state, new Date(), prefs);
        if (!plan.length) return;
        await ensureChannels();
        await LocalNotifications.schedule({ notifications: plan.map(r => ({
            id: r.id, title: r.title, body: r.body, extra: { kind: r.kind },
            schedule: { at: r.at, allowWhileIdle: true },
            ...(isAndroid ? { channelId: CHANNELS[r.kind], smallIcon: 'ic_stat_campusos', iconColor: '#1f5143', isExactNotification: false } : {}),
        })) });
    }).catch(() => undefined);
    return queue;
}

/** Removes every scheduled reminder and the preferences (sign-out / account deletion). */
export async function clearReminders() {
    await queue;
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) }).catch(() => undefined);
    await LocalNotifications.removeAllDeliveredNotifications().catch(() => undefined);
    await Preferences.remove({ key: PREFS });
}
