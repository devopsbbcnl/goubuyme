import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import './globals.css';

const font = Plus_Jakarta_Sans({
	subsets: ['latin'],
	weight: ['400', '500', '600', '700', '800'],
	variable: '--font-jakarta',
});

export const metadata: Metadata = {
	title: 'GoBuyMe Admin',
	description: 'GoBuyMe Admin Console',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className={font.variable}>
			<body
				style={{ margin: 0, fontFamily: 'var(--font-jakarta), sans-serif' }}
			>
				<ThemeProvider><AuthProvider>{children}</AuthProvider></ThemeProvider>
			</body>
		</html>
	);
}
