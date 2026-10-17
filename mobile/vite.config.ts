import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));

// The website loads its fonts from Google Fonts in app/globals.css; the app bundles them instead (fonts.css).
function stripRemoteFonts(): Plugin {
    return {
        name: 'campusos-strip-remote-fonts',
        enforce: 'pre',
        transform(code, id) {
            if (id.endsWith('app/globals.css')) return code.replace(/@import url\('https:\/\/fonts\.googleapis\.com[^']*'\);?/, '');
        },
    };
}

// A build without these would install fine and then show only a configuration screen on the iPhone.
function requireEnv(mode: string): Plugin {
    return {
        name: 'campusos-require-env',
        apply: 'build',
        buildStart() {
            const env = loadEnv(mode, root, 'VITE_');
            const missing = ['VITE_API_ORIGIN', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(k => !env[k] || /YOUR-|REPLACE_ME/.test(env[k]));
            if (missing.length) this.error(`Missing ${missing.join(', ')}. Copy mobile/.env.example to mobile/.env.production.local and fill it in.`);
        },
    };
}

// %VITE_*% placeholders in index.html (the Content-Security-Policy) are filled from mobile/.env.* files.
export default defineConfig(({ mode }) => ({
    root,
    envDir: root,
    // Shares public/ with the website so the PDF.js assets (and their licenses) ship inside the app.
    publicDir: fileURLToPath(new URL('../public', import.meta.url)),
    plugins: [react(), stripRemoteFonts(), requireEnv(mode)],
    // The bundle loads from the device, not the network, so one larger app chunk costs nothing to download.
    build: { outDir: 'dist', emptyOutDir: true, target: 'safari16', sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
    server: { port: 5174, strictPort: true },
}));
