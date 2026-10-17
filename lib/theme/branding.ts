import { isHex } from './color.ts';

/**
 * Curated university brand colors, keyed by the institution's domain exactly as it appears in
 * lib/universities.json (the university dataset has no IDs; its domains are unique).
 *
 * Rules for adding a record:
 * - Copy colors only from the institution's own brand or style-guide page, and link that page in `source`.
 * - `primary` and `secondary` are the raw official values. Never "fix" them here; lib/theme/palette.ts adapts
 *   them for contrast in each appearance.
 * - Match by exact domain only. Campus subdomains in the dataset (for example d.umn.edu or manoa.hawaii.edu)
 *   are separate institutions and must not inherit another entry's colors.
 * - Leave a school out rather than guessing; it then uses the CampusOS palette, which is never labeled official.
 */
export type UniversityBranding = {
    /** Canonical domain from the dataset, lowercase. */
    domain: string;
    /** Institution name as it appears in the dataset. */
    name: string;
    primary: { name: string; hex: string };
    secondary?: { name: string; hex: string };
    /** Official brand/style-guide URL the values were copied from. */
    source: string;
    /** Date the values were checked against `source` (YYYY-MM-DD). */
    verified: string;
};

const V = '2026-10-17';

export const UNIVERSITY_BRANDING: readonly UniversityBranding[] = [
    { domain: 'rutgers.edu', name: 'Rutgers University', primary: { name: 'Rutgers Red', hex: '#CC0033' }, source: 'https://communications.rutgers.edu/sites/default/files/rutgers_visual_identity_system_user_guide.pdf', verified: V },
    { domain: 'asu.edu', name: 'Arizona State University', primary: { name: 'ASU Maroon', hex: '#8C1D40' }, secondary: { name: 'ASU Gold', hex: '#FFC627' }, source: 'https://brandguide.asu.edu/brand-elements/design/color', verified: V },
    { domain: 'berkeley.edu', name: 'University of California, Berkeley', primary: { name: 'Berkeley Blue', hex: '#002676' }, secondary: { name: 'California Gold', hex: '#FDB515' }, source: 'https://brand.berkeley.edu/colors/', verified: V },
    { domain: 'cmu.edu', name: 'Carnegie Mellon University', primary: { name: 'Carnegie Red', hex: '#C41230' }, source: 'https://brand.cmu.edu/visual-identity/colors', verified: V },
    { domain: 'cornell.edu', name: 'Cornell University', primary: { name: 'Carnelian', hex: '#B31B1B' }, source: 'https://brand.cornell.edu/design-center/colors/', verified: V },
    { domain: 'duke.edu', name: 'Duke University', primary: { name: 'Duke Navy Blue', hex: '#012169' }, secondary: { name: 'Duke Royal Blue', hex: '#00539B' }, source: 'https://brand.duke.edu/colors/', verified: V },
    { domain: 'gatech.edu', name: 'Georgia Institute of Technology', primary: { name: 'Gold', hex: '#B39051' }, secondary: { name: 'Navy', hex: '#051E39' }, source: 'https://brand.gatech.edu/our-look/colors', verified: V },
    { domain: 'mit.edu', name: 'Massachusetts Institute of Technology', primary: { name: 'MIT Red', hex: '#750014' }, secondary: { name: 'Silver Gray', hex: '#8B959E' }, source: 'https://brand.mit.edu/color', verified: V },
    { domain: 'msu.edu', name: 'Michigan State University', primary: { name: 'Spartan Green', hex: '#18453B' }, source: 'https://brand.msu.edu/visual/color-palette', verified: V },
    { domain: 'nd.edu', name: 'University of Notre Dame', primary: { name: 'ND Blue', hex: '#0C2340' }, secondary: { name: 'ND Metallic Gold', hex: '#AE9142' }, source: 'https://onmessage.nd.edu/university-branding/colors/', verified: V },
    { domain: 'neu.edu', name: 'Northeastern University', primary: { name: 'NU Red', hex: '#C8102E' }, source: 'https://brand.northeastern.edu/design-and-experiences/design/color/', verified: V },
    { domain: 'northwestern.edu', name: 'Northwestern University', primary: { name: 'Northwestern Purple', hex: '#4E2A84' }, source: 'https://www.northwestern.edu/brand/visual-identity/color-palettes/', verified: V },
    { domain: 'pitt.edu', name: 'University of Pittsburgh', primary: { name: 'Pitt Royal Blue', hex: '#003594' }, secondary: { name: 'Pitt Gold', hex: '#FFB81C' }, source: 'https://www.brand.pitt.edu/brand-elements/color-palettes', verified: V },
    { domain: 'psu.edu', name: 'Pennsylvania State University', primary: { name: 'Nittany Navy', hex: '#001E44' }, source: 'https://brand.psu.edu/visual-identity-standards/color-and-the-mark', verified: V },
    { domain: 'stanford.edu', name: 'Stanford University', primary: { name: 'Cardinal Red', hex: '#8C1515' }, source: 'https://identity.stanford.edu/design-elements/color/primary-colors/', verified: V },
    { domain: 'ucla.edu', name: 'University of California, Los Angeles', primary: { name: 'UCLA Blue', hex: '#2774AE' }, secondary: { name: 'UCLA Gold', hex: '#FFD100' }, source: 'https://brand.ucla.edu/identity/colors', verified: V },
    { domain: 'umd.edu', name: 'University of Maryland, College Park', primary: { name: 'Maryland Red', hex: '#E21833' }, secondary: { name: 'Maryland Gold', hex: '#FFD200' }, source: 'https://brand.umd.edu/visual-identity/colors', verified: V },
    { domain: 'unc.edu', name: 'University of North Carolina at Chapel Hill', primary: { name: 'Carolina Blue', hex: '#4B9CD3' }, secondary: { name: 'Navy', hex: '#13294B' }, source: 'https://identity.unc.edu/brand/color/', verified: V },
    { domain: 'usc.edu', name: 'University of Southern California', primary: { name: 'USC Cardinal', hex: '#990000' }, secondary: { name: 'USC Gold', hex: '#FFCC00' }, source: 'https://identity.usc.edu/identity/color/', verified: V },
    { domain: 'utexas.edu', name: 'The University of Texas at Austin', primary: { name: 'Burnt Orange', hex: '#BF5700' }, source: 'https://umac.utexas.edu/brand-center/colors/', verified: V },
    { domain: 'uw.edu', name: 'University of Washington', primary: { name: 'Husky Purple', hex: '#32006E' }, secondary: { name: 'Husky Gold', hex: '#B7A57A' }, source: 'https://www.washington.edu/brand/brand-elements/colors/', verified: V },
    { domain: 'virginia.edu', name: 'University of Virginia, Charlottesville', primary: { name: 'UVA Blue', hex: '#232D4B' }, secondary: { name: 'UVA Orange', hex: '#E57200' }, source: 'https://brand.virginia.edu/design-assets/colors', verified: V },
    { domain: 'wisc.edu', name: 'University of Wisconsin - Madison', primary: { name: 'Badger Red', hex: '#C5050C' }, source: 'https://brand.wisc.edu/visual-identity/colors/', verified: V },
];

/** Lowercases and trims a domain and drops a leading "www." and trailing dot. No other normalization. */
export function canonicalDomain(domain: string | null | undefined): string {
    return (domain ?? '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/** Problems with a branding record, or an empty list when it is usable. */
export function brandingProblems(record: unknown): string[] {
    const r = record as Partial<UniversityBranding> | null;
    const out: string[] = [];
    if (!r || typeof r !== 'object') return ['not an object'];
    if (typeof r.domain !== 'string' || r.domain !== canonicalDomain(r.domain) || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(r.domain)) out.push('domain must be a canonical lowercase domain');
    if (typeof r.name !== 'string' || !r.name.trim()) out.push('name is required');
    if (!r.primary || !isHex(r.primary.hex) || !r.primary.name) out.push('primary needs a name and a #rrggbb hex');
    if (r.secondary !== undefined && (!isHex(r.secondary.hex) || !r.secondary.name)) out.push('secondary needs a name and a #rrggbb hex');
    let url: URL | null = null;
    try { url = new URL(String(r.source)); } catch { /* reported below */ }
    if (!url || url.protocol !== 'https:') out.push('source must be an https URL');
    if (typeof r.verified !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.verified) || Number.isNaN(Date.parse(r.verified))) out.push('verified must be a YYYY-MM-DD date');
    return out;
}

/** Builds the lookup, skipping (and reporting) invalid or duplicate records instead of failing the app. */
export function brandingIndex(records: readonly unknown[], warn: (message: string) => void = () => undefined): ReadonlyMap<string, UniversityBranding> {
    const index = new Map<string, UniversityBranding>();
    for (const record of records) {
        const problems = brandingProblems(record);
        const domain = (record as { domain?: unknown })?.domain;
        if (problems.length) { warn(`Skipping branding for ${String(domain)}: ${problems.join('; ')}`); continue; }
        const r = record as UniversityBranding;
        if (index.has(r.domain)) { warn(`Skipping duplicate branding for ${r.domain}`); continue; }
        index.set(r.domain, r);
    }
    return index;
}

const INDEX = brandingIndex(UNIVERSITY_BRANDING);

/** Verified branding for a school domain, or null (exact canonical-domain match only; never by name). */
export function brandingFor(domain: string | null | undefined, index: ReadonlyMap<string, UniversityBranding> = INDEX): UniversityBranding | null {
    const key = canonicalDomain(domain);
    return key ? index.get(key) ?? null : null;
}

export const VERIFIED_BRANDING_COUNT = INDEX.size;
