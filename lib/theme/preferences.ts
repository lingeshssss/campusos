import { z } from 'zod';

export const APPEARANCES = ['system', 'light', 'dark'] as const;
export const ACCENT_MODES = ['university', 'campusos'] as const;
export type Appearance = typeof APPEARANCES[number];

/**
 * Appearance preferences saved with the student's account (student_states.payload.preferences).
 *
 * Reconciliation between this device and the account:
 * 1. Before the account loads, the device's cached choice (localStorage, see runtime.ts) paints the first frame.
 * 2. Once the account loads, the account value wins. Accounts that never chose use the defaults
 *    (System appearance, University accent), so one student's choice never carries over to another account.
 * 3. A change made in Settings or the navigation applies immediately, is cached on the device and is saved to
 *    the account through the normal versioned state save (other student data is sent unchanged).
 * 4. Signing out keeps the device's appearance (so the sign-in screen does not flash) but forgets the school
 *    accent and the account it belonged to.
 */
export const preferencesSchema = z.object({
    appearance: z.enum(APPEARANCES),
    accent: z.enum(ACCENT_MODES),
    /** When the student last changed these settings; null means "never chosen" (defaults). */
    updatedAt: z.string().datetime().nullable(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const defaultPreferences = (): Preferences => ({ appearance: 'system', accent: 'university', updatedAt: null });

/** State field: missing (older accounts and exports) or unreadable values fall back to the defaults. */
export const preferencesField = preferencesSchema.catch(() => defaultPreferences()).default(defaultPreferences);

export function withChange(current: Preferences, change: Partial<Pick<Preferences, 'appearance' | 'accent'>>, now = new Date()): Preferences {
    return { ...current, ...change, updatedAt: now.toISOString() };
}
