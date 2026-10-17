import { contrast, ensureContrast, mix, toOklch, withLightness } from './color.ts';
import { NEUTRALS, type Mode } from './tokens.ts';
import { brandingFor, type UniversityBranding } from './branding.ts';

/** The tokens a university (or the CampusOS default) palette controls. Everything else is fixed per mode. */
export const ACCENT_TOKENS = ['accent', 'accent-hover', 'on-accent', 'accent-text', 'accent-subtle', 'accent-border', 'focus-ring', 'highlight', 'on-highlight', 'brand-deep', 'on-brand', 'on-brand-muted', 'on-brand-accent'] as const;
export type AccentToken = typeof ACCENT_TOKENS[number];
export type AccentTokens = Record<AccentToken, string>;
export type AccentPalette = { light: AccentTokens; dark: AccentTokens };

/** CampusOS's own colors: deep green with a lime highlight. Used before a school is chosen and as the fallback. */
export const CAMPUSOS_PRIMARY = '#1f5143';
export const CAMPUSOS_SECONDARY = '#d1ef95';

const WHITE = '#ffffff';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Picks a button fill and its label color. Keeps the official color when it already works. */
function fill(primary: string, mode: Mode): { fill: string; on: string } {
    const n = NEUTRALS[mode];
    if (mode === 'light') {
        // White labels need 4.5:1; that also keeps the button clearly visible against white surfaces.
        return { fill: ensureContrast(primary, [WHITE], 4.5, 'darker')!, on: WHITE };
    }
    // Dark mode: the fill must stand out from dark surfaces (3:1) and keep a 4.5:1 label.
    const surfaces = [n.surface, n.bg, n['surface-raised']];
    if (contrast(primary, WHITE) >= 4.5) {
        const lifted = ensureContrast(primary, surfaces, 3, 'lighter');
        if (lifted && contrast(lifted, WHITE) >= 4.5) return { fill: lifted, on: WHITE };
    }
    // Otherwise use a lighter version of the color with dark text.
    return { fill: ensureContrast(primary, [n.ink], 4.5, 'lighter')!, on: n.ink };
}

/** Derives one mode's accent tokens from official colors. Every text pairing meets WCAG AA (verified in tests). */
export function deriveAccent(primary: string, secondary: string | undefined, mode: Mode): AccentTokens {
    const n = NEUTRALS[mode];
    const dark = mode === 'dark';
    const { fill: accent, on } = fill(primary, mode);
    let hover = withLightness(accent, toOklch(accent).l + (dark ? 0.05 : -0.06));
    if (contrast(hover, on) < 4.5) hover = withLightness(accent, toOklch(accent).l + (dark ? -0.05 : 0.06));
    if (contrast(hover, on) < 4.5) hover = accent;

    const subtle = mix(n.surface, primary, dark ? 0.16 : 0.09);
    const textBackgrounds = [n.surface, n.bg, n['surface-muted'], n['surface-hover'], n['surface-raised'], subtle];
    const accentText = ensureContrast(primary, textBackgrounds, 4.5, dark ? 'lighter' : 'darker')!;

    // Highlight chips come from the secondary color when it has a real hue; otherwise from the primary.
    const source = secondary && toOklch(secondary).c >= 0.04 ? secondary : primary;
    const highlight = withLightness(source, dark ? 0.34 : 0.92, dark ? 0.08 : 0.11);
    const onHighlight = ensureContrast(withLightness(source, dark ? 0.9 : 0.33, 0.1), [highlight], 4.5, dark ? 'lighter' : 'darker')!;

    // Large brand panels (sign-in side panel, dashboard hero, toasts): a deep, low-chroma version of the primary.
    const lp = toOklch(primary).l;
    const brandDeep = withLightness(primary, dark ? clamp(lp - 0.1, 0.22, 0.27) : clamp(lp, 0.27, 0.37), dark ? 0.07 : 0.1);
    const onBrand = ensureContrast('#f7f9f4', [brandDeep], 4.5, 'lighter')!;
    const onBrandMuted = ensureContrast(mix(brandDeep, onBrand, 0.72), [brandDeep], 4.5, 'lighter')!;
    const onBrandAccent = ensureContrast(withLightness(source, 0.88, 0.12), [brandDeep], 4.5, 'lighter')!;

    const tokens: AccentTokens = {
        accent,
        'accent-hover': hover,
        'on-accent': on,
        'accent-text': accentText,
        'accent-subtle': subtle,
        'accent-border': mix(n.surface, accentText, dark ? 0.45 : 0.35),
        'focus-ring': accentText,
        highlight,
        'on-highlight': onHighlight,
        'brand-deep': brandDeep,
        'on-brand': onBrand,
        'on-brand-muted': onBrandMuted,
        'on-brand-accent': onBrandAccent,
    };
    for (const t of ACCENT_TOKENS) tokens[t] = tokens[t].toLowerCase();
    return tokens;
}

export function derivePalette(primary: string, secondary?: string): AccentPalette {
    return { light: deriveAccent(primary, secondary, 'light'), dark: deriveAccent(primary, secondary, 'dark') };
}

export const CAMPUSOS_PALETTE: AccentPalette = derivePalette(CAMPUSOS_PRIMARY, CAMPUSOS_SECONDARY);

export type AccentMode = 'university' | 'campusos';

/**
 * What the accent should be for a student's choice and school:
 * - 'university': a verified school palette is in use;
 * - 'fallback':   University was chosen but this school has no verified palette, so CampusOS colors are used;
 * - 'campusos':   the student chose the CampusOS default (or no school is selected yet).
 */
export type AccentSelection = { kind: 'university' | 'fallback' | 'campusos'; branding: UniversityBranding | null; palette: AccentPalette };

const cache = new Map<string, AccentPalette>();

export function accentSelection(mode: AccentMode, domain: string | null | undefined): AccentSelection {
    if (mode === 'campusos' || !domain?.trim()) return { kind: 'campusos', branding: null, palette: CAMPUSOS_PALETTE };
    const branding = brandingFor(domain);
    if (!branding) return { kind: 'fallback', branding: null, palette: CAMPUSOS_PALETTE };
    let palette = cache.get(branding.domain);
    if (!palette) {
        palette = derivePalette(branding.primary.hex, branding.secondary?.hex);
        cache.set(branding.domain, palette);
    }
    return { kind: 'university', branding, palette };
}
