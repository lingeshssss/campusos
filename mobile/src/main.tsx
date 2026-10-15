import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Browser } from '@capacitor/browser';
import '../../app/globals.css';
import './mobile.css';
import { config } from './config';
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

// Load the app only after stale Keychain items from a previous install are gone (the Supabase client
// reads the session from the Keychain as soon as it is used).
void clearKeychainAfterReinstall().finally(async () => {
    const { default: MobileApp } = await import('./app');
    createRoot(document.getElementById('root')!).render(<StrictMode><MobileApp /></StrictMode>);
});
