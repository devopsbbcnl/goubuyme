import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dark, light, Theme } from '@/theme';

type ThemeCtx = { theme: Theme; isDark: boolean; toggleTheme: () => void };

const ThemeContext = createContext<ThemeCtx>({ theme: dark, isDark: true, toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('gbm_dark').then(v => {
      if (v !== null) setIsDark(v === 'true');
    });
  }, []);

  const toggleTheme = () => {
    setIsDark(prev => {
      AsyncStorage.setItem('gbm_dark', String(!prev));
      return !prev;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme: isDark ? dark : light, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
