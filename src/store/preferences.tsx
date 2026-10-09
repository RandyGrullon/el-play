import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStorage, writeStorage } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';

interface Preferences {
    theme: ThemePreference;
    cycleTheme: () => void;
    favoriteTeamId: number | null;
    toggleFavoriteTeam: (teamId: number) => void;
    subscribedGames: number[];
    toggleGameSubscription: (gamePk: number) => Promise<boolean>;
}

const PreferencesContext = createContext<Preferences | undefined>(undefined);

// Mismas claves que la versión anterior para no perder el favorito ni los avisos guardados
const FAVORITE_KEY = 'el-play-favorite-team';
const SUBSCRIBED_KEY = 'el-play-subscribed-games';
const THEME_KEY = 'el-play-theme';

const applyTheme = (theme: ThemePreference) => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#090c11' : '#f4f2ed');
};

export const PreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<ThemePreference>(() => readStorage<ThemePreference>(THEME_KEY, 'system'));
    const [favoriteTeamId, setFavorite] = useState<number | null>(() => {
        const stored = readStorage<number | string | null>(FAVORITE_KEY, null);
        return stored === null ? null : Number(stored) || null;
    });
    const [subscribedGames, setSubscribed] = useState<number[]>(() => readStorage<number[]>(SUBSCRIBED_KEY, []));

    useEffect(() => {
        applyTheme(theme);
        writeStorage(THEME_KEY, theme);
        if (theme !== 'system' || !window.matchMedia) return;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => applyTheme('system');
        media.addEventListener?.('change', onChange);
        return () => media.removeEventListener?.('change', onChange);
    }, [theme]);

    useEffect(() => writeStorage(FAVORITE_KEY, favoriteTeamId), [favoriteTeamId]);
    useEffect(() => writeStorage(SUBSCRIBED_KEY, subscribedGames), [subscribedGames]);

    const cycleTheme = useCallback(() => setTheme((current) => (current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system')), []);
    const toggleFavoriteTeam = useCallback((teamId: number) => setFavorite((current) => (current === teamId ? null : teamId)), []);

    const toggleGameSubscription = useCallback(
        async (gamePk: number) => {
            if (subscribedGames.includes(gamePk)) {
                setSubscribed((current) => current.filter((id) => id !== gamePk));
                return false;
            }
            if (!('Notification' in window)) return false;
            const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
            if (permission !== 'granted') return false;
            setSubscribed((current) => [...current.filter((id) => id !== gamePk), gamePk].slice(-30));
            return true;
        },
        [subscribedGames]
    );

    const value = useMemo(
        () => ({ theme, cycleTheme, favoriteTeamId, toggleFavoriteTeam, subscribedGames, toggleGameSubscription }),
        [theme, cycleTheme, favoriteTeamId, toggleFavoriteTeam, subscribedGames, toggleGameSubscription]
    );

    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
    const context = useContext(PreferencesContext);
    if (!context) throw new Error('usePreferences must be used within PreferencesProvider');
    return context;
};
