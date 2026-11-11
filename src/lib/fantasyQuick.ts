// Fantasy v3 en «Mi equipo» (igual que la web): «Copiar mi equipo de ayer», las tarjetas de «Ideas para hoy» (con el
// mismo «por qué no» del selector) y la guía de la primera vez. Lógica pura más lo que guarda el teléfono.
import { EMPTY_ENTRY, canAdd, entryKey, getStore, isLocked, playerPostponed, putLineup, type DayEntry, type FantasyDay, type FantasyPlayer } from './fantasy';
import { reasonFrom, type PickReason } from './fantasyPicker';
import type { TrendItem } from './fantasyStats';
import type { LeagueId } from '../types';
import { getItem, setItem } from './storage';

// ---------------------------------------------------------------- copiar el equipo de ayer

/** Por qué no se copió uno: los del selector o que hoy no juega */
export type CopyReason = PickReason | { kind: 'notPlaying' };

export interface CopySkip {
    id: number;
    /** El nombre (del día de hoy o del día que se copia); null si no se sabe */
    name: string | null;
    reason: CopyReason;
}

export interface CopyPlan {
    lineup: number[];
    captain: number | null;
    /** Los que entraron, en el orden del equipo copiado */
    added: number[];
    skipped: CopySkip[];
    /** La corona del equipo copiado quedó en el de hoy */
    captainCopied: boolean;
}

const DAY_MS = 86400000;

/**
 * Lo que queda al copiar `from` sobre el equipo de hoy: entra cada uno de los copiados que juega hoy y no se ha cerrado,
 * en su orden, respetando cupos por rol, el máximo por equipo y los créditos (canAdd, lo mismo del selector). Los que ya
 * estaban se quedan. La corona pasa si su dueño quedó en el equipo y ni él ni el capitán de hoy se han cerrado.
 */
export const copyPlan = (day: FantasyDay, entry: Pick<DayEntry, 'lineup' | 'captain' | 'picks' | 'savedAt'>, from: Pick<DayEntry, 'lineup' | 'captain'>, nameOf: (id: number) => string | null | undefined = () => null, now = Date.now()): CopyPlan => {
    let current: DayEntry = { lineup: [...entry.lineup], captain: entry.captain, picks: entry.picks ?? {}, savedAt: entry.savedAt ?? 0 };
    const added: number[] = [];
    const skipped: CopySkip[] = [];
    for (const id of from.lineup) {
        if (current.lineup.includes(id)) continue;
        const player = day.players.find((p) => p.id === id);
        if (!player) {
            skipped.push({ id, name: nameOf(id) ?? null, reason: { kind: 'notPlaying' } });
            continue;
        }
        const problem = canAdd(day, current, player, now);
        if (problem === null) {
            current = { ...current, lineup: [...current.lineup, id] };
            added.push(id);
            continue;
        }
        const reason = reasonFrom(day, current, player, problem);
        if (reason) skipped.push({ id, name: player.name, reason });
    }
    const find = (id: number | null) => (id === null ? undefined : day.players.find((p) => p.id === id));
    const lockedNow = (id: number | null) => {
        const player = find(id);
        return !!player && isLocked(day, player, now);
    };
    const candidate = from.captain;
    const currentCaptain = current.captain !== null && current.lineup.includes(current.captain) ? current.captain : null;
    const captainCopied = candidate !== null && current.lineup.includes(candidate) && !lockedNow(candidate) && !lockedNow(currentCaptain) && candidate !== currentCaptain;
    return { lineup: current.lineup, captain: captainCopied ? candidate : currentCaptain, added, skipped, captainCopied };
};

/** El último día antes de `date` (hasta `maxDays` atrás) en que tuviste equipo: el que se ofrece copiar */
export const previousEntry = (store: Record<string, DayEntry>, league: LeagueId, date: string, maxDays = 7): { date: string; entry: DayEntry } | null => {
    const first = new Date(Date.parse(`${date}T12:00:00Z`) - maxDays * DAY_MS).toISOString().slice(0, 10);
    const found = Object.entries(store)
        .filter(([key, entry]) => key.startsWith(`${league}:`) && entry.lineup.length > 0)
        .map(([key, entry]) => ({ date: key.slice(league.length + 1), entry }))
        .filter((item) => item.date < date && item.date >= first)
        .sort((a, b) => b.date.localeCompare(a.date));
    return found[0] ?? null;
};

/** Hay algo que se podría copiar: un día anterior con equipo y cupo libre hoy con alguien abierto */
export const canOfferCopy = (day: FantasyDay, entry: Pick<DayEntry, 'lineup'>, from: Pick<DayEntry, 'lineup'> | null | undefined, now = Date.now()) =>
    !!from?.lineup.length && from.lineup.some((id) => !entry.lineup.includes(id)) && day.players.some((player) => !isLocked(day, player, now) && !playerPostponed(day, player));

/** Copia sobre el equipo de hoy (con su deshacer) y dice qué pasó */
export const copyIntoDay = (day: FantasyDay, from: Pick<DayEntry, 'lineup' | 'captain'>, nameOf?: (id: number) => string | null | undefined, now = Date.now()): CopyPlan => {
    const current = getStore()[entryKey(day.league, day.date)] ?? EMPTY_ENTRY;
    const plan = copyPlan(day, current, from, nameOf, now);
    if (plan.added.length || plan.captain !== current.captain) putLineup(day, plan.lineup, plan.captain, 'copy');
    return plan;
};

// ---------------------------------------------------------------- ideas para hoy

export interface IdeaRow {
    item: TrendItem;
    /** El pelotero en el día (lo de hoy manda: precio, estado y cierre) */
    player: FantasyPlayer;
    inTeam: boolean;
    /** Por qué no se puede agregar (el mismo texto del selector); null si se puede o ya está */
    reason: PickReason | null;
}

/** La tarjeta de una idea; null si ya no sirve hoy (no sale en el día, ya se cerró o su juego se pospuso) */
export const ideaRow = (day: FantasyDay, entry: DayEntry, item: TrendItem, now = Date.now()): IdeaRow | null => {
    const player = day.players.find((p) => p.id === item.id);
    if (!player || playerPostponed(day, player) || isLocked(day, player, now)) return null;
    const inTeam = entry.lineup.includes(player.id);
    return { item, player, inTeam, reason: inTeam ? null : reasonFrom(day, entry, player, canAdd(day, entry, player, now)) };
};

export const ideaRows = (day: FantasyDay, entry: DayEntry, items: TrendItem[], now = Date.now()) => items.map((item) => ideaRow(day, entry, item, now)).filter((row): row is IdeaRow => !!row);

// ---------------------------------------------------------------- guía de la primera vez

const GUIDE_KEY = 'el-play-fantasy-guide-v1';

export const guideDismissed = () => {
    try {
        return getItem(GUIDE_KEY) === '1';
    } catch {
        return false;
    }
};

export const dismissGuide = () => {
    try {
        setItem(GUIDE_KEY, '1');
    } catch {
        /* sin almacenamiento: vuelve a salir la próxima vez */
    }
};

/** Sale en el día de hoy mientras no tengas equipo y no la hayas cerrado */
export const showGuide = (dismissed: boolean, isToday: boolean, entry: Pick<DayEntry, 'lineup'>) => !dismissed && isToday && entry.lineup.length === 0;
