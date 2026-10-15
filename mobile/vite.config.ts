import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
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

// %VITE_*% placeholders in index.html (the Content-Security-Policy) are filled from mobile/.env.* files.
export default defineConfig({
    root,
    envDir: root,
    // Shares public/ with the website so the PDF.js assets (and their licenses) ship inside the app.
    publicDir: fileURLToPath(new URL('../public', import.meta.url)),
    plugins: [react(), stripRemoteFonts()],
    build: { outDir: 'dist', emptyOutDir: true, target: 'safari16', sourcemap: false, assetsInlineLimit: 0 },
    server: { port: 5174, strictPort: true },
});
