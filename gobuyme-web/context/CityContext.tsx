'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const STORAGE_KEY = 'gbm_city';

export const SUPPORTED_CITIES = [
  { name: 'Port Harcourt', state: 'Rivers' },
  { name: 'Lagos',         state: 'Lagos' },
  { name: 'Abuja',         state: 'FCT' },
  { name: 'Enugu',         state: 'Enugu' },
  { name: 'Owerri',        state: 'Imo' },
  { name: 'Aba',           state: 'Abia' },
  { name: 'Uyo',           state: 'Akwa Ibom' },
  { name: 'Calabar',       state: 'Cross River' },
  { name: 'Benin City',    state: 'Edo' },
  { name: 'Warri',         state: 'Delta' },
  { name: 'Onitsha',       state: 'Anambra' },
];

interface CityCtx {
  selectedCity: string | null;
  setSelectedCity: (city: string | null) => void;
  cityLoaded: boolean;
}

const Ctx = createContext<CityCtx>({ selectedCity: null, setSelectedCity: () => {}, cityLoaded: false });

export function CityProvider({ children }: { children: ReactNode }) {
  const [selectedCity, setSelectedCityState] = useState<string | null>(null);
  const [cityLoaded, setCityLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setSelectedCityState(saved);
    setCityLoaded(true);
  }, []);

  const setSelectedCity = (city: string | null) => {
    setSelectedCityState(city);
    if (city) localStorage.setItem(STORAGE_KEY, city);
    else localStorage.removeItem(STORAGE_KEY);
  };

  return <Ctx.Provider value={{ selectedCity, setSelectedCity, cityLoaded }}>{children}</Ctx.Provider>;
}

export const useCity = () => useContext(Ctx);
