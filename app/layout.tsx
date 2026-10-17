import type { Metadata, Viewport } from 'next';
import './theme.css';
import './globals.css';
import { BOOT_SCRIPT } from '@/lib/theme/boot';
import { NEUTRALS } from '@/lib/theme/tokens';

export const metadata: Metadata = { title: 'CampusOS — Your day, in focus', description: 'Your classes, your campus, your daily rhythm. A personal college companion.', icons: { icon: '/favicon.svg' } };
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    colorScheme: 'light dark',
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: NEUTRALS.light.bg },
        { media: '(prefers-color-scheme: dark)', color: NEUTRALS.dark.bg },
    ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    // The boot script sets data-theme/data-appearance and the cached school palette on <html> before the first
    // paint, so React must not treat those attributes as a hydration mismatch.
    return <html lang="en" suppressHydrationWarning>
        <head><script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} /></head>
        <body>{children}</body>
    </html>;
}
