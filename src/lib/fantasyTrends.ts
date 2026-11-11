// «Ideas para hoy» (Fantasy v3): en racha, gangas, suben y bajan de precio, lanzadores con mejor duelo y los más
// elegidos ayer, de /api/v2/fantasy/trends. Solo trae peloteros del día que no se han cerrado; agregarlos usa la misma
// regla del selector (canAdd) y, si no se puede, la misma razón. Opcional: con 404, 503 o error la sección no sale.
import { useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../types';
import { addPlayer, canAdd, type AddProblem, type DayEntry, type FantasyDay, type FantasyPlayer, type PlayerStatus } from './fantasy';
import { getJson, retry } from './fans';
import { last5Average } from './fantasyPicker';

export type MatchupEdge = 'good' | 'even' | 'tough';

export interface TrendItem {
    id: number;
    name: string;
    teamId: number;
    role: 'B' | 'P';
    price?: number;
    proj?: number;
    status?: PlayerStatus;
    estimated?: boolean;
    opp?: { id: number; abbrev: string; home: boolean } | null;
    last5?: number[];
    /** El número por el que está en su lista (cada lista manda el suyo) */
    avg?: number;
    value?: number;
    priceDelta?: number | null;
    matchup?: { oppOps: string | null; edge: MatchupEdge };
    /** % que lo eligió ayer */
    owned?: number;
}

export const TREND_LISTS = ['hot', 'bargains', 'risers', 'fallers', 'pitchers', 'popular'] as const;
export type TrendList = (typeof TREND_LISTS)[number];

export type FantasyTrends = { date: string } & Partial<Record<TrendList, TrendItem[]>>;

const fetchTrends = (league: LeagueId, date: string, signal?: AbortSignal) => getJson<FantasyTrends>(`/api/v2/fantasy/trends?league=${league}&date=${date}`, signal);

/** Las ideas del día (en el modo de prueba, armadas con los peloteros del día) */
export const useFantasyTrends = (day: FantasyDay | undefined, enabled: boolean, demo = false) =>
    useQuery({
        queryKey: ['fantasy-trends', day?.league, day?.date, demo ? 'demo' : 'api'],
        queryFn: async ({ signal }) => (demo ? (await import('./fantasyDemoData')).demoTrends(day!) : fetchTrends(day!.league, day!.date, signal)),
        enabled: enabled && !!day,
        staleTime: 5 * 60000,
        retry
    });

const validItem = (item: unknown): item is TrendItem => {
    const value = item as TrendItem | null;
    return !!value && typeof value.id === 'number' && typeof value.name === 'string' && (value.role === 'B' || value.role === 'P');
};

/** Las listas que traen algo, en su orden */
export const trendLists = (trends: FantasyTrends | null | undefined): { key: TrendList; items: TrendItem[] }[] =>
    TREND_LISTS.map((key) => ({ key, items: (Array.isArray(trends?.[key]) ? trends![key]! : []).filter(validItem) })).filter((group) => group.items.length > 0);

/** Lo que muestra cada lista de cada pelotero (lo que manda el servidor o, si falta, lo que se saca de lo que hay) */
export const trendMetric = (key: TrendList, item: TrendItem): number | MatchupEdge | null => {
    switch (key) {
        case 'hot':
            return typeof item.avg === 'number' ? item.avg : last5Average(item);
        case 'bargains':
            if (typeof item.value === 'number') return item.value;
            return typeof item.proj === 'number' && typeof item.price === 'number' && item.price > 0 ? Math.round((item.proj / item.price) * 100) / 100 : null;
        case 'risers':
        case 'fallers':
            return typeof item.priceDelta === 'number' ? item.priceDelta : null;
        case 'pitchers':
            return item.matchup?.edge ?? null;
        case 'popular':
            return typeof item.owned === 'number' ? item.owned : null;
    }
};

/** Una idea no se puede agregar si ya no está en el día ('missing') o por lo mismo que en el selector */
export type IdeaProblem = AddProblem | 'missing';

export interface IdeaState {
    player: FantasyPlayer | null;
    inTeam: boolean;
    reason: IdeaProblem;
}

/** Cómo está una idea con el equipo de ahora: el pelotero del día, si ya está y por qué no se puede agregar */
export const ideaState = (day: FantasyDay, entry: DayEntry, item: Pick<TrendItem, 'id'>, now = Date.now()): IdeaState => {
    const player = day.players.find((p) => p.id === item.id) ?? null;
    if (!player) return { player: null, inTeam: false, reason: 'missing' };
    const inTeam = entry.lineup.includes(player.id);
    return { player, inTeam, reason: inTeam ? 'already' : canAdd(day, entry, player, now) };
};

/** Agregar desde una idea: la misma regla del selector; devuelve si entró y, si no, por qué */
export const addIdea = (day: FantasyDay, entry: DayEntry, item: Pick<TrendItem, 'id'>, now = Date.now()): IdeaState & { added: boolean } => {
    const state = ideaState(day, entry, item, now);
    if (!state.player || state.reason) return { ...state, added: false };
    return { ...state, added: addPlayer(day, entry, state.player) };
};
