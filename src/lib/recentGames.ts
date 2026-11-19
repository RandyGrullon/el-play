// Lo que bateó en sus últimos juegos, sumado: turnos, hits y promedio («22 turnos, 2 hits, .091»).
// Cuántos juegos se miden lo escoge cada quien (8 si no ha tocado nada; 0 = toda la temporada) y vale para todos los
// peloteros: el perfil y la tarjeta del bateador en vivo. Se recuerda en este navegador.
import { useSyncExternalStore } from 'react';
import type { GameLogRow, HittingLine } from './stats';

export interface RecentHitting {
    /** Juegos en que bateó */
    games: number;
    ab: number;
    h: number;
    /** «.091» (null sin turnos) */
    avg: string | null;
}

const average = (h: number, ab: number) => (ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : null);

/** Suma líneas de bateo (de juegos o de temporadas); las vacías no cuentan */
export const sumHitting = (lines: (Pick<HittingLine, 'ab' | 'h'> | null | undefined)[]): RecentHitting => {
    const played = lines.filter((line): line is Pick<HittingLine, 'ab' | 'h'> => !!line);
    const ab = played.reduce((total, line) => total + (line.ab ?? 0), 0);
    const h = played.reduce((total, line) => total + (line.h ?? 0), 0);
    return { games: played.length, ab, h, avg: average(h, ab) };
};

export const recentHitting = (games: Pick<GameLogRow, 'hitting'>[]): RecentHitting => sumHitting(games.map((game) => game.hitting));

/** Sus últimos `count` juegos (0 = todos); con `gamePk`, sin ese (el de hoy ya sale aparte como «Hoy») */
export const lastGames = <T extends Pick<GameLogRow, 'gamePk'>>(log: T[], count: number, gamePk?: number | null) => {
    const games = gamePk == null ? log : log.filter((game) => game.gamePk !== gamePk);
    return count > 0 ? games.slice(0, count) : games;
};

// ------------------------------------------------------------------ Cuántos juegos medir

export const DEFAULT_RECENT = 8;
/** Lo más que deja escribir (una temporada larga) */
export const MAX_RECENT = 200;
const KEY = 'el-play-recent-games';

const read = () => {
    try {
        const stored = window.localStorage.getItem(KEY);
        if (stored === null) return DEFAULT_RECENT;
        const value = Number(stored);
        return Number.isInteger(value) && value >= 0 && value <= MAX_RECENT ? value : DEFAULT_RECENT;
    } catch {
        return DEFAULT_RECENT;
    }
};

let current: number | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= typeof window === 'undefined' ? DEFAULT_RECENT : read());

/** 0 = toda la temporada */
export const setRecentCount = (count: number) => {
    const value = Math.max(0, Math.min(MAX_RECENT, Math.round(count)));
    current = value;
    try {
        window.localStorage.setItem(KEY, String(value));
    } catch {
        /* sin almacenamiento: dura mientras la página esté abierta */
    }
    listeners.forEach((listener) => listener());
};

export const useRecentCount = () =>
    useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        snapshot,
        () => DEFAULT_RECENT
    );
