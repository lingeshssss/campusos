'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { accentSelection, type AccentSelection } from '../../lib/theme/palette';
import { paletteProperties } from '../../lib/theme/css';
import { applyTheme, prefersDark, resolveMode, writeThemeCache } from '../../lib/theme/runtime';
import type { Appearance, Preferences } from '../../lib/theme/preferences';

function subscribeSystem(onChange: () => void) {
    if (typeof matchMedia !== 'function') return () => undefined;
    const query = matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}

/** Whether the operating system is in dark mode, kept up to date. */
export function useSystemDark() {
    return useSyncExternalStore(subscribeSystem, prefersDark, () => false);
}

/**
 * Applies the student's appearance and school palette to the whole document and caches it on this device.
 * `domain` is the school currently shown (a draft during onboarding or Settings, so choices preview instantly).
 * `userId` ties the cached palette to this account; pass null while signed out.
 */
export function useCampusTheme({ preferences, domain, userId, enabled = true }: { preferences: Preferences; domain: string | null | undefined; userId: string | null; enabled?: boolean }): AccentSelection {
    const selection = useMemo(() => accentSelection(preferences.accent, domain), [preferences.accent, domain]);
    const systemDark = useSystemDark();
    useEffect(() => {
        if (!enabled || typeof document === 'undefined') return;
        const accent = selection.kind === 'university' ? paletteProperties(selection.palette) : null;
        applyTheme(document.documentElement, { appearance: preferences.appearance, prefersDark: systemDark, accent, uid: userId });
        writeThemeCache({ appearance: preferences.appearance, uid: userId, accent });
    }, [enabled, preferences.appearance, selection, systemDark, userId]);
    return selection;
}

const OPTIONS: { value: Appearance; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
];
const NEXT: Record<Appearance, Appearance> = { system: 'light', light: 'dark', dark: 'system' };

/** Compact control for the top bar: cycles Light → Dark → System. */
export function ThemeToggle({ appearance, onChange, disabled }: { appearance: Appearance; onChange: (a: Appearance) => void; disabled?: boolean }) {
    const systemDark = useSystemDark();
    const current = OPTIONS.find(o => o.value === appearance)!, next = OPTIONS.find(o => o.value === NEXT[appearance])!;
    const Icon = current.icon;
    const now = appearance === 'system' ? `System (currently ${resolveMode('system', systemDark)})` : current.label;
    const label = `Appearance: ${now}. Switch to ${next.label}.`;
    return <button type="button" className="icon theme-toggle" aria-label={label} title={label} disabled={disabled} onClick={() => onChange(next.value)}><Icon size={18} aria-hidden="true" /></button>;
}

/** Settings → Appearance: theme, accent source and a live palette preview. */
export function AppearanceSettings({ preferences, selection, university, onChange, busy }: { preferences: Preferences; selection: AccentSelection; university: string; onChange: (change: Partial<Pick<Preferences, 'appearance' | 'accent'>>) => void; busy: boolean }) {
    const systemDark = useSystemDark();
    const b = selection.branding;
    const note = selection.kind === 'university' && b
        ? <>Using {b.name}’s official {b.secondary ? `${b.primary.name} and ${b.secondary.name}` : b.primary.name}, adjusted where needed so text stays readable. <a href={b.source} target="_blank" rel="noreferrer">Source</a> · checked {b.verified}.</>
        : selection.kind === 'fallback'
            ? <>We haven’t verified official colors for {university || 'your school'} yet, so CampusOS is using its own colors. These aren’t your school’s colors.</>
            : preferences.accent === 'campusos' ? <>Using the CampusOS colors.</> : <>Choose your school in your profile to use its colors.</>;
    return <section className="panel appearance-panel" aria-labelledby="appearance-title">
        <h2 id="appearance-title">Appearance</h2>
        <p className="helper">Saved to your account, so it follows you to other devices.</p>
        <fieldset className="choice-group" disabled={busy}>
            <legend>Theme</legend>
            <div className="segmented">{OPTIONS.map(({ value, label, icon: Icon }) => <label key={value} className={preferences.appearance === value ? 'selected' : ''}>
                <input type="radio" name="appearance" value={value} checked={preferences.appearance === value} onChange={() => onChange({ appearance: value })} />
                <Icon size={16} aria-hidden="true" />{label}
            </label>)}</div>
            <small>{preferences.appearance === 'system' ? `Follows your device. It’s ${systemDark ? 'dark' : 'light'} right now.` : `Always ${preferences.appearance}, whatever your device uses.`}</small>
        </fieldset>
        <fieldset className="choice-group" disabled={busy}>
            <legend>Accent colors</legend>
            <div className="segmented">
                <label className={preferences.accent === 'university' ? 'selected' : ''}><input type="radio" name="accent" value="university" checked={preferences.accent === 'university'} onChange={() => onChange({ accent: 'university' })} />University</label>
                <label className={preferences.accent === 'campusos' ? 'selected' : ''}><input type="radio" name="accent" value="campusos" checked={preferences.accent === 'campusos'} onChange={() => onChange({ accent: 'campusos' })} />CampusOS default</label>
            </div>
        </fieldset>
        <div className="palette-preview">
            <div className="palette-swatches" aria-hidden="true"><span className="sw-accent" /><span className="sw-text" /><span className="sw-highlight" /><span className="sw-deep" /></div>
            <div><strong>{selection.kind === 'university' && b ? b.name : selection.kind === 'fallback' ? `${university} · CampusOS colors` : 'CampusOS'}</strong><p className="helper">{note}</p></div>
        </div>
        <div className="palette-sample" aria-hidden="true"><span className="primary">Primary</span><span className="text-button">Link</span><span className="tiny-pill">Highlight</span></div>
    </section>;
}
