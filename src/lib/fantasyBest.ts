// El mejor equipo posible con las reglas del día (5 bateadores y 1 lanzador, máximo por equipo y créditos): el
// sugerido antes de los juegos (con las proyecciones) y el ideal del día (con los puntos de verdad), como el «optimal
// lineup» de los fantasy. Búsqueda con poda (ramificación y acotamiento) que ya cuenta al capitán ×1,5: exacta para
// los tamaños de LIDOM.
import { RULES, isLocked, perTeamLimit, type FantasyDay, type FantasyPlayer } from './fantasy';

export interface BestLineup {
    lineup: number[];
    captain: number | null;
    /** Puntos (proyectados o reales) con el capitán ×1,5 */
    total: number;
    cost: number;
}

interface Options {
    /** Qué se maximiza: la proyección o los puntos que ya hizo */
    metric: 'proj' | 'points';
    /** Peloteros que se quedan sí o sí (los ya cerrados, o todo el equipo al completar) */
    keep?: number[];
    /** Capitán que no se cambia (ya cerrado, o el que escogió al completar); tiene que estar en `keep` */
    captain?: number | null;
    /** Sin cierres: el ideal del día mira a todos, aunque sus juegos ya hayan empezado */
    ignoreLocks?: boolean;
    now?: number;
}

const value = (player: FantasyPlayer, metric: Options['metric']) => (metric === 'proj' ? player.proj ?? 0 : player.points);
const priceOf = (player: FantasyPlayer) => (Number.isFinite(player.price) ? player.price! : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
// Lo que suma el capitán además de sus puntos (la mitad otra vez)
const BONUS = RULES.captain - 1;

// Cuántos candidatos se miran por rol (los de más valor): de sobra para los rosters de LIDOM
const MAX_BATTERS = 45;
const MAX_PITCHERS = 20;
const NODE_LIMIT = 400000;

export const bestLineup = (day: FantasyDay, options: Options): BestLineup | null => {
    const { metric, ignoreLocks = false, now = Date.now() } = options;
    const byId = new Map(day.players.map((player) => [player.id, player]));
    const kept = (options.keep ?? []).map((id) => byId.get(id)).filter((player): player is FantasyPlayer => !!player);
    const budget = day.credits ? day.credits.budget : Infinity;
    const perTeam = perTeamLimit(day);
    const keptIds = new Set(kept.map((player) => player.id));
    const needB = RULES.batters - kept.filter((player) => player.role === 'B').length;
    const needP = RULES.pitchers - kept.filter((player) => player.role === 'P').length;
    if (needB < 0 || needP < 0) return null;
    const fixed = options.captain !== undefined && options.captain !== null && keptIds.has(options.captain) ? byId.get(options.captain)! : null;

    const usable = (player: FantasyPlayer) => !keptIds.has(player.id) && (ignoreLocks || !isLocked(day, player, now)) && (metric === 'points' ? player.played : true) && value(player, metric) > 0;
    const sorted = (role: 'B' | 'P', limit: number) =>
        day.players
            .filter((player) => player.role === role && usable(player))
            .sort((a, b) => value(b, metric) - value(a, metric) || priceOf(a) - priceOf(b))
            .slice(0, limit);
    const batters = sorted('B', MAX_BATTERS);
    const pitchers = sorted('P', MAX_PITCHERS);

    const keptCost = kept.reduce((sum, player) => sum + priceOf(player), 0);
    const keptValue = kept.reduce((sum, player) => sum + value(player, metric), 0);
    const keptTop = kept.reduce((top, player) => Math.max(top, value(player, metric)), 0);
    const baseTeams = new Map<number, number>();
    kept.forEach((player) => baseTeams.set(player.teamId, (baseTeams.get(player.teamId) ?? 0) + 1));
    if (keptCost > budget + 1e-9) return null;

    // Lo que suma el capitán: el fijo, o el de más valor del equipo
    const bonusOf = (top: number) => (fixed ? value(fixed, metric) : top) * BONUS;
    let best: { picks: FantasyPlayer[]; score: number } | null = null;
    let nodes = 0;

    // Bateadores: de mayor a menor valor, con la cota de lo mejor que todavía podría sumar (capitán incluido)
    const chooseBatters = (start: number, left: number, chosen: FantasyPlayer[], score: number, cost: number, teams: Map<number, number>, top: number) => {
        if (++nodes > NODE_LIMIT) return;
        if (left === 0) {
            const total = score + bonusOf(top);
            if (!best || total > best.score) best = { picks: [...chosen], score: total };
            return;
        }
        let bound = score;
        for (let i = start, taken = 0; i < batters.length && taken < left; i++, taken++) bound += value(batters[i], metric);
        // El de más valor que queda es el primero (están ordenados)
        bound += bonusOf(Math.max(top, start < batters.length ? value(batters[start], metric) : 0));
        if (best && bound <= best.score) return;
        for (let i = start; i <= batters.length - left; i++) {
            const player = batters[i];
            const price = priceOf(player);
            if (cost + price > budget + 1e-9) continue;
            if ((teams.get(player.teamId) ?? 0) >= perTeam) continue;
            const points = value(player, metric);
            teams.set(player.teamId, (teams.get(player.teamId) ?? 0) + 1);
            chosen.push(player);
            chooseBatters(i + 1, left - 1, chosen, score + points, cost + price, teams, Math.max(top, points));
            chosen.pop();
            teams.set(player.teamId, (teams.get(player.teamId) ?? 1) - 1);
        }
    };

    const pitcherOptions: (FantasyPlayer | null)[] = needP ? pitchers : [null];
    for (const pitcher of pitcherOptions) {
        const teams = new Map(baseTeams);
        let cost = keptCost;
        let score = keptValue;
        let top = keptTop;
        const chosen: FantasyPlayer[] = [];
        if (pitcher) {
            if (cost + priceOf(pitcher) > budget + 1e-9 || (teams.get(pitcher.teamId) ?? 0) >= perTeam) continue;
            teams.set(pitcher.teamId, (teams.get(pitcher.teamId) ?? 0) + 1);
            cost += priceOf(pitcher);
            score += value(pitcher, metric);
            top = Math.max(top, value(pitcher, metric));
            chosen.push(pitcher);
        }
        chooseBatters(0, needB, chosen, score, cost, teams, top);
    }
    if (!best) return null;
    const found = best as { picks: FantasyPlayer[]; score: number };
    const lineup = [...kept, ...found.picks];
    const captain = fixed ?? lineup.reduce<FantasyPlayer | null>((top, player) => (!top || value(player, metric) > value(top, metric) ? player : top), null);
    const total = lineup.reduce((sum, player) => sum + value(player, metric), 0) + (captain ? value(captain, metric) * BONUS : 0);
    return {
        lineup: lineup.map((player) => player.id),
        captain: captain?.id ?? null,
        total: round1(total),
        cost: round1(lineup.reduce((sum, player) => sum + priceOf(player), 0))
    };
};

/** Proyección de un equipo (capitán ×1,5) */
export const projectedPoints = (day: FantasyDay, lineup: number[], captain: number | null) =>
    round1(
        lineup.reduce((sum, id) => {
            const player = day.players.find((p) => p.id === id);
            if (!player) return sum;
            return sum + (player.proj ?? 0) * (captain === id ? RULES.captain : 1);
        }, 0)
    );

/** Puntos por crédito (el «valor» de los fantasy): cuánto se espera por cada crédito que cuesta */
export const valueOf = (player: Pick<FantasyPlayer, 'proj' | 'price'>) => (player.proj !== undefined && player.price ? Math.round((player.proj / player.price) * 100) / 100 : null);
