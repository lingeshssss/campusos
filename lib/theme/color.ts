// Color math for the theme system: hex parsing, OKLCH (perceptual lightness/chroma/hue), WCAG 2.x contrast,
// and contrast-targeted adjustments. Pure functions shared by the website, the iOS app and the tests.

export type Rgb = { r: number; g: number; b: number };
export type Oklch = { l: number; c: number; h: number };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: unknown): value is string {
    return typeof value === 'string' && HEX.test(value);
}

/** Parses #rgb or #rrggbb into 0–1 channels. Alpha is not accepted. */
export function parseHex(hex: string): Rgb {
    if (!isHex(hex)) throw Error(`Invalid hex color: ${hex}`);
    let h = hex.slice(1);
    if (h.length === 3) h = [...h].map(c => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}

export function toHex({ r, g, b }: Rgb): string {
    const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
    const { r, g, b } = parseHex(hex);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
}

export function toOklch(hex: string): Oklch {
    const { r, g, b } = parseHex(hex);
    const [R, G, B] = [toLinear(r), toLinear(g), toLinear(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const h = (Math.atan2(Bb, A) * 180) / Math.PI;
    return { l: L, c: Math.hypot(A, Bb), h: h < 0 ? h + 360 : h };
}

function oklchToLinear({ l, c, h }: Oklch): Rgb {
    const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
    const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return {
        r: 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
        g: -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
        b: -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
    };
}

const inGamut = (c: Rgb) => [c.r, c.g, c.b].every(v => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH → hex. Out-of-gamut colors keep lightness and hue and lose chroma until they fit (CSS Color 4 style). */
export function fromOklch(color: Oklch): string {
    const l = Math.min(1, Math.max(0, color.l));
    let lo = 0, hi = Math.max(0, color.c);
    if (!inGamut(oklchToLinear({ l, c: hi, h: color.h }))) {
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (inGamut(oklchToLinear({ l, c: mid, h: color.h }))) lo = mid; else hi = mid;
        }
        hi = lo;
    }
    const lin = oklchToLinear({ l, c: hi, h: color.h });
    return toHex({ r: fromLinear(Math.min(1, Math.max(0, lin.r))), g: fromLinear(Math.min(1, Math.max(0, lin.g))), b: fromLinear(Math.min(1, Math.max(0, lin.b))) });
}

/** Mixes two colors in OKLab. `t` = share of `b` (0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
    const ca = toOklch(a), cb = toOklch(b);
    const ab = (o: Oklch) => [o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)];
    const [a1, b1] = ab(ca), [a2, b2] = ab(cb);
    const A = a1 + (a2 - a1) * t, B = b1 + (b2 - b1) * t;
    const h = (Math.atan2(B, A) * 180) / Math.PI;
    return fromOklch({ l: ca.l + (cb.l - ca.l) * t, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h });
}

/** Same hue and chroma (gamut-permitting) at a new OKLCH lightness. */
export function withLightness(hex: string, l: number, maxChroma = Infinity): string {
    const o = toOklch(hex);
    return fromOklch({ l, c: Math.min(o.c, maxChroma), h: o.h });
}

/**
 * Moves `hex` along OKLCH lightness (keeping hue) by the smallest amount that reaches `min` contrast against
 * every color in `against`. Returns null when no lightness in that direction can satisfy the requirement.
 */
export function ensureContrast(hex: string, against: string[], min: number, direction: 'darker' | 'lighter'): string | null {
    const ok = (c: string) => against.every(bg => contrast(c, bg) >= min);
    if (ok(hex)) return hex;
    const start = toOklch(hex).l, end = direction === 'darker' ? 0 : 1;
    if (!ok(withLightness(hex, end))) return null;
    let lo = start, hi = end;
    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (ok(withLightness(hex, mid))) hi = mid; else lo = mid;
    }
    return withLightness(hex, hi);
}

/** The more readable of two text colors on `bg`. */
export function readableOn(bg: string, light = '#ffffff', dark = '#111614'): string {
    return contrast(light, bg) >= contrast(dark, bg) ? light : dark;
}
