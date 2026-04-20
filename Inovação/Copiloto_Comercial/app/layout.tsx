import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Premium Agent Chat',
  description: 'Multi-workflow OpenAI Agent Builder interface powered by ChatKit.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
