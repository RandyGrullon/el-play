import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';
import { readJson, writeJson } from '../lib/storage';
import { useLeague } from '../state/league';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeValue {
    colors: Palette;
    isDark: boolean;
    preference: ThemePreference;
    setPreference: (value: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const KEY = 'el-play-theme';

/** Tema claro/oscuro (el del sistema o el escogido en «Más»); el acento es el color de la liga activa */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const system = useColorScheme();
    const { leagueConfig } = useLeague();
    const [preference, setPreferenceState] = useState<ThemePreference>(() => readJson<ThemePreference>(KEY, 'system'));
    const isDark = preference === 'dark' || (preference === 'system' && system === 'dark');
    const value = useMemo<ThemeValue>(() => {
        const base = isDark ? dark : light;
        return {
            colors: { ...base, accent: leagueConfig.color, accentInk: isDark ? leagueConfig.inkDark : leagueConfig.inkLight },
            isDark,
            preference,
            setPreference: (next) => {
                setPreferenceState(next);
                writeJson(KEY, next);
            }
        };
    }, [isDark, preference, leagueConfig]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const value = useContext(ThemeContext);
    if (!value) throw new Error('useTheme fuera de ThemeProvider');
    return value;
};

export const useColors = () => useTheme().colors;
