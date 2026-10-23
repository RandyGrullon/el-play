import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStorage, writeStorage } from './storage';
import { isIOS, isStandalone } from '../lib/install';

export type AlertResult = 'on' | 'off' | 'blocked' | 'needs-install' | 'unsupported';

export type ThemePreference = 'system' | 'light' | 'dark';

interface Preferences {
    theme: ThemePreference;
    setTheme: (theme: ThemePreference) => void;
    cycleTheme: () => void;
    favoriteTeamId: number | null;
    toggleFavoriteTeam: (teamId: number) => void;
    subscribedGames: number[];
    toggleGameSubscription: (gamePk: number) => Promise<AlertResult>;
    /** Animaciones de jugada en el juego en vivo (hit, jonrón, ponche, fin de entrada) */
    playAnimations: boolean;
    animationMode: AnimationMode;
    setAnimationMode: (mode: AnimationMode) => void;
    /** Qué avisos quiere (todos encendidos al principio) */
    alertKinds: AlertKinds;
    setAlertKind: (kind: keyof AlertKinds, on: boolean) => void;
    /** Todo un poco más grande (letras, botones y tablas) */
    largeText: boolean;
    setLargeText: (on: boolean) => void;
}

/** soon: 10 min antes; start: playball; final: resultado; noHitter: juego sin hit en marcha; fantasy: tu equipo del Fantasy */
export interface AlertKinds {
    soon: boolean;
    start: boolean;
    final: boolean;
    noHitter: boolean;
    fantasy: boolean;
}
const ALERT_KINDS_KEY = 'el-play-alert-kinds';
const LARGE_TEXT_KEY = 'el-play-large-text';
const DEFAULT_KINDS: AlertKinds = { soon: true, start: true, final: true, noHitter: true, fantasy: true };

const PreferencesContext = createContext<Preferences | undefined>(undefined);

// Mismas claves que la versión anterior para no perder el favorito ni los avisos guardados
const FAVORITE_KEY = 'el-play-favorite-team';
const SUBSCRIBED_KEY = 'el-play-subscribed-games';
const THEME_KEY = 'el-play-theme';
const ANIMATIONS_KEY = 'el-play-play-animations';
const ANIMATION_MODE_KEY = 'el-play-animation-mode';

/** all: todas; smart: todas en los juegos de tu equipo y solo las grandes en los demás; off: ninguna */
export type AnimationMode = 'all' | 'smart' | 'off';

const applyTheme = (theme: ThemePreference) => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', dark ? '#0b0c10' : '#f6f6f9'));
};

export const PreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<ThemePreference>(() => readStorage<ThemePreference>(THEME_KEY, 'system'));
    const [favoriteTeamId, setFavorite] = useState<number | null>(() => {
        const stored = readStorage<number | string | null>(FAVORITE_KEY, null);
        return stored === null ? null : Number(stored) || null;
    });
    const [subscribedGames, setSubscribed] = useState<number[]>(() => readStorage<number[]>(SUBSCRIBED_KEY, []));
    // Antes era un interruptor (sí/no): quien las había apagado las sigue teniendo apagadas
    const [animationMode, setAnimationMode] = useState<AnimationMode>(() => readStorage<AnimationMode | null>(ANIMATION_MODE_KEY, null) ?? (readStorage<boolean>(ANIMATIONS_KEY, true) ? 'smart' : 'off'));
    const playAnimations = animationMode !== 'off';
    const [alertKinds, setAlertKinds] = useState<AlertKinds>(() => ({ ...DEFAULT_KINDS, ...readStorage<Partial<AlertKinds>>(ALERT_KINDS_KEY, {}) }));
    useEffect(() => writeStorage(ALERT_KINDS_KEY, alertKinds), [alertKinds]);
    const setAlertKind = useCallback((kind: keyof AlertKinds, on: boolean) => setAlertKinds((current) => ({ ...current, [kind]: on })), []);
    const [largeText, setLargeText] = useState<boolean>(() => readStorage<boolean>(LARGE_TEXT_KEY, false));
    useEffect(() => {
        writeStorage(LARGE_TEXT_KEY, largeText);
        document.documentElement.classList.toggle('text-large', largeText);
    }, [largeText]);

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
    useEffect(() => writeStorage(ANIMATION_MODE_KEY, animationMode), [animationMode]);

    const cycleTheme = useCallback(() => setTheme((current) => (current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system')), []);
    const toggleFavoriteTeam = useCallback((teamId: number) => setFavorite((current) => (current === teamId ? null : teamId)), []);

    /** 'on' / 'off' si cambió; si no, por qué no se pudo (la pantalla lo explica) */
    const toggleGameSubscription = useCallback(
        async (gamePk: number): Promise<AlertResult> => {
            if (subscribedGames.includes(gamePk)) {
                setSubscribed((current) => current.filter((id) => id !== gamePk));
                return 'off';
            }
            // iPhone: los avisos web solo existen con la app instalada en la pantalla de inicio
            if (!('Notification' in window)) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
            const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
            if (permission !== 'granted') return 'blocked';
            setSubscribed((current) => [...current.filter((id) => id !== gamePk), gamePk].slice(-30));
            return 'on';
        },
        [subscribedGames]
    );

    const value = useMemo(
        () => ({ theme, setTheme, cycleTheme, favoriteTeamId, toggleFavoriteTeam, subscribedGames, toggleGameSubscription, playAnimations, animationMode, setAnimationMode, alertKinds, setAlertKind, largeText, setLargeText }),
        [theme, cycleTheme, favoriteTeamId, toggleFavoriteTeam, subscribedGames, toggleGameSubscription, playAnimations, animationMode, alertKinds, setAlertKind, largeText]
    );

    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
    const context = useContext(PreferencesContext);
    if (!context) throw new Error('usePreferences must be used within PreferencesProvider');
    return context;
};
