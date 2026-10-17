import type { Appearance } from './preferences.ts';
import type { Mode } from './tokens.ts';

// Browser-side theme application, shared by the website and the iOS app. lib/theme/boot.ts does the same work
// before React loads; keep the two in step (tests/theme.test.mjs runs both against the same inputs).

export const THEME_STORAGE_KEY = 'campusos.theme.v1';

/** Device cache used to paint the first frame. Holds no student data beyond the colors and an account ID. */
export type ThemeCache = { appearance: Appearance; uid: string | null; accent: Record<string, string> | null };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Root = { setAttribute(n: string, v: string): void; getAttribute(n: string): string | null; removeAttribute(n: string): void; style: { setProperty(n: string, v: string): void; removeProperty(n: string): void; length: number; [i: number]: string } };

const ACCENT_PROPERTY = /^--a[ld]-[a-z-]+$/;
const HEX = /^#[0-9a-f]{6}$/i;

function storage(): StorageLike | null {
    try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function readThemeCache(store: StorageLike | null = storage()): ThemeCache | null {
    try {
        const raw = JSON.parse(store?.getItem(THEME_STORAGE_KEY) ?? 'null') as Partial<ThemeCache> | null;
        if (!raw || typeof raw !== 'object') return null;
        const appearance = raw.appearance === 'light' || raw.appearance === 'dark' ? raw.appearance : 'system';
        const accent = raw.accent && typeof raw.accent === 'object' ? Object.fromEntries(Object.entries(raw.accent).filter(([k, v]) => ACCENT_PROPERTY.test(k) && typeof v === 'string' && HEX.test(v))) : null;
        return { appearance, uid: typeof raw.uid === 'string' ? raw.uid : null, accent: accent && Object.keys(accent).length ? accent : null };
    } catch {
        return null;
    }
}

export function writeThemeCache(cache: ThemeCache, store: StorageLike | null = storage()) {
    try { store?.setItem(THEME_STORAGE_KEY, JSON.stringify(cache)); } catch { /* private mode or storage full: the account copy still applies */ }
}

export function resolveMode(appearance: Appearance, prefersDark: boolean): Mode {
    return appearance === 'system' ? (prefersDark ? 'dark' : 'light') : appearance;
}

export function prefersDark(): boolean {
    try { return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

function clearAccent(root: Root) {
    for (let i = root.style.length - 1; i >= 0; i--) {
        const name = root.style[i];
        if (name.startsWith('--a')) root.style.removeProperty(name);
    }
    root.removeAttribute('data-accent-uid');
}

/** Sets appearance and (optionally) a school palette on <html>. `accent: null` restores the CampusOS palette. */
export function applyTheme(root: Root, options: { appearance: Appearance; prefersDark: boolean; accent: Record<string, string> | null; uid?: string | null }) {
    root.setAttribute('data-appearance', options.appearance);
    root.setAttribute('data-theme', resolveMode(options.appearance, options.prefersDark));
    clearAccent(root);
    if (options.accent) {
        for (const [name, value] of Object.entries(options.accent)) if (ACCENT_PROPERTY.test(name) && HEX.test(value)) root.style.setProperty(name, value);
        root.setAttribute('data-accent-uid', options.uid ?? '');
    }
}

/**
 * Sign-out / account switch: forget the school accent and its account, keep the device's appearance.
 * Also clears the accent already painted on the page.
 */
export function forgetAccountTheme(root: Root | null = typeof document === 'undefined' ? null : document.documentElement, store: StorageLike | null = storage()) {
    const cache = readThemeCache(store);
    if (cache) writeThemeCache({ appearance: cache.appearance, uid: null, accent: null }, store);
    if (root) clearAccent(root);
}
