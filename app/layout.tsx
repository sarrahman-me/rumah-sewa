// Root layout wraps application shell; formatting only, no behavior changes.
import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Rumah Sewa',
  description: 'Manajemen sewa & air keluarga',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen">
        <header className="border-b border-[var(--border)] bg-transparent">
          <Navbar />
        </header>
        <main className="container-page">{children}</main>
      </body>
    </html>
  );
}
