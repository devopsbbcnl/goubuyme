import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { dark, light, Theme } from '@/theme';

type ThemeCtx = { theme: Theme; isDark: boolean; toggleTheme: () => void };

const ThemeContext = createContext<ThemeCtx>({ theme: dark, isDark: true, toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const systemIsDark = systemScheme !== 'light';
  const [isDark, setIsDark] = useState(systemIsDark);
  const [hasUserPref, setHasUserPref] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('gbm_dark').then(v => {
      if (v !== null) {
        setIsDark(v === 'true');
        setHasUserPref(true);
      } else {
        setIsDark(systemIsDark);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasUserPref) {
      setIsDark(systemIsDark);
    }
  }, [systemScheme, hasUserPref, systemIsDark]);

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem('gbm_dark', String(next));
      return next;
    });
    setHasUserPref(true);
  };

  return (
    <ThemeContext.Provider value={{ theme: isDark ? dark : light, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
