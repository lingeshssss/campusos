import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Browser } from '@capacitor/browser';
import { GraduationCap } from 'lucide-react';
import '../../app/theme.css';
import '../../app/globals.css';
import './mobile.css';
import { config, configProblems } from './config';
import { clearKeychainAfterReinstall } from './secure';

// Links to other sites open in the in-app browser; app-internal links never reload the bundle.
document.addEventListener('click', event => {
    const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.hasAttribute('download')) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(href)) void Browser.open({ url: href });
    else if (href.startsWith('/')) void Browser.open({ url: config.apiOrigin + href });
}, true);

const root = createRoot(document.getElementById('root')!);

/** Shown instead of a blank screen when the build is misconfigured or the app fails to load. */
function StartupProblem({ title, details }: { title: string; details: readonly string[] }) {
    return <main className="loading startup-problem">
        <div className="brand"><span className="brand-icon"><GraduationCap /></span>Campus<span>OS</span></div>
        <h2>{title}</h2>
        <ul>{details.map(d => <li key={d}>{d}</li>)}</ul>
        <p>Fill in mobile/.env.production.local (see mobile/.env.example), run pnpm ios:sync, then build again in Xcode.</p>
    </main>;
}

// Load the app only after stale Keychain items from a previous install are gone (the Supabase client
// reads the session from the Keychain as soon as it is used).
if (configProblems.length) root.render(<StartupProblem title="This build isn’t configured yet." details={configProblems} />);
else void clearKeychainAfterReinstall().catch(() => undefined).then(async () => {
    try {
        const { default: MobileApp } = await import('./app');
        root.render(<StrictMode><MobileApp /></StrictMode>);
    } catch (e) {
        root.render(<StartupProblem title="CampusOS couldn’t start." details={[e instanceof Error ? e.message : String(e)]} />);
    }
});
