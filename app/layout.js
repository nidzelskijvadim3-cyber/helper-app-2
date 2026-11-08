import './globals.css';
export const metadata = { title: 'Мой помощник', manifest: '/manifest.json', appleWebApp: { capable: true, title: 'Помощник' } };
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }) {
  return (<html lang="ru"><body>{children}</body></html>);
}
