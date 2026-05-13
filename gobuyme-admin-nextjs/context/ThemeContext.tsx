'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { dark, light, Theme } from '@/theme';

type ThemeContextType = {
	theme: Theme;
	isDark: boolean;
	toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
	theme: dark,
	isDark: true,
	toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [isDark, setIsDark] = useState(true);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const stored = localStorage.getItem('gbm_dark');
		if (stored !== null) {
			setIsDark(stored === 'true');
		} else {
			setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
		}
		setMounted(true);

		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const handleChange = (e: MediaQueryListEvent) => {
			if (localStorage.getItem('gbm_dark') === null) {
				setIsDark(e.matches);
			}
		};
		mq.addEventListener('change', handleChange);
		return () => mq.removeEventListener('change', handleChange);
	}, []);

	const toggleTheme = () => {
		setIsDark((prev) => {
			const next = !prev;
			localStorage.setItem('gbm_dark', String(next));
			return next;
		});
	};

	if (!mounted) {
		return (
			<ThemeContext.Provider value={{ theme: dark, isDark: true, toggleTheme }}>
				{children}
			</ThemeContext.Provider>
		);
	}

	return (
		<ThemeContext.Provider
			value={{ theme: isDark ? dark : light, isDark, toggleTheme }}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export const useTheme = () => useContext(ThemeContext);
