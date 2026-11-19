import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

// Стиль C · Фокус: текст — Inter (є кирилиця), заголовки — Space Grotesk 700.
// Space Grotesk не має кирилиці: українські заголовки браузер домальовує Inter 700 (так само, як у макеті).
const inter = Inter({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--ff-inter' });
const grotesk = Space_Grotesk({ subsets: ['latin', 'latin-ext'], weight: ['500', '600', '700'], display: 'swap', variable: '--ff-display' });

export const metadata = { title: 'Мій помічник', manifest: '/manifest.json', icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/apple-touch-icon.png' }, appleWebApp: { capable: true, title: 'Помічник', statusBarStyle: 'black-translucent' } };
// Без maximumScale: користувач має змогу збільшувати сторінку (WCAG 1.4.4). Поля вводу 16px, тож iOS не зумить при фокусі.
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#121316' };
export default function RootLayout({ children }) {
  return (<html lang="uk" className={inter.variable + ' ' + grotesk.variable}><body>{children}</body></html>);
}
