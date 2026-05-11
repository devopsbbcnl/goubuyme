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
		setMounted(true);
	}, []);

	const toggleTheme = () => {
		setIsDark((prev) => !prev);
	};

	// Avoid hydration mismatch by not rendering theme until mounted
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
