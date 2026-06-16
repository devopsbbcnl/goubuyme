import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@gobuyme:selected_city';

export interface SupportedCity {
  name: string;
  state: string;
}

export const SUPPORTED_CITIES: SupportedCity[] = [
  { name: 'Port Harcourt', state: 'Rivers' },
  { name: 'Lagos',         state: 'Lagos' },
  { name: 'Owerri',        state: 'Imo' },
  { name: 'Abuja',         state: 'FCT' },
  { name: 'Enugu',         state: 'Enugu' },
  { name: 'Uyo',           state: 'Akwa Ibom' },
  { name: 'Calabar',       state: 'Cross River' },
  { name: 'Benin City',    state: 'Edo' },
  { name: 'Warri',         state: 'Delta' },
  { name: 'Onitsha',       state: 'Anambra' },
  { name: 'Aba',           state: 'Abia' },
];

interface CityContextValue {
  selectedCity: string | null;
  setSelectedCity: (city: string) => Promise<void>;
  cityLoaded: boolean;
}

const CityContext = createContext<CityContextValue>({
  selectedCity: null,
  setSelectedCity: async () => {},
  cityLoaded: false,
});

export function CityProvider({ children }: { children: React.ReactNode }) {
  const [selectedCity, setSelectedCityState] = useState<string | null>(null);
  const [cityLoaded, setCityLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => { if (val) setSelectedCityState(val); })
      .finally(() => setCityLoaded(true));
  }, []);

  const setSelectedCity = useCallback(async (city: string) => {
    setSelectedCityState(city);
    await AsyncStorage.setItem(STORAGE_KEY, city);
  }, []);

  return (
    <CityContext.Provider value={{ selectedCity, setSelectedCity, cityLoaded }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCity() {
  return useContext(CityContext);
}
