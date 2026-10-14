import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'CampusOS — Your day, in focus', description: 'Your classes, your campus, your daily rhythm. A personal college companion.', icons: { icon: '/favicon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return <html lang="en"><body>{children}</body></html>;
}
