// Probabilidad de victoria antes del juego (estimación de El Play: MLB no la da para LIDOM antes de empezar).
// - Fuerza de cada equipo: la mitad su porcentaje de victorias y la mitad el que «merece» por carreras anotadas y
//   permitidas (expectativa pitagórica), acercada a .500 cuando ha jugado poco (20 juegos de peso a favor de .500).
// - Los dos se enfrentan con log5 (la probabilidad de que A le gane a B sabiendo lo que gana cada uno contra la liga).
// - Jugar en casa suma (en el béisbol el local gana ~54 %); los abridores, si se saben, mueven un poco por su EFE.
// - Nunca pasa de 80-20: antes del juego nadie es seguro.

export interface TeamForm {
    w: number;
    l: number;
    /** Carreras anotadas y permitidas en la temporada (null si no se saben) */
    scored: number | null;
    allowed: number | null;
}

export interface WinProbability {
    /** De 0 a 1 */
    home: number;
    away: number;
    /** Pocos juegos todavía: la estimación pesa poco */
    early: boolean;
    /** Los abridores movieron la estimación */
    starters: boolean;
}

const PRIOR_GAMES = 20;
const HOME_EDGE = 0.16; // en logit: ~54 % en un juego parejo
const ERA_WEIGHT = 0.06; // logit por carrera de diferencia en la EFE de los abridores
const ERA_CAP = 0.25;
const LIMIT = 0.8;

const logit = (p: number) => Math.log(p / (1 - p));
const fromLogit = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Porcentaje que «merece» por carreras (exponente 1.83, como en Estadísticas) */
const pythagoreanPct = (scored: number, allowed: number) => {
    const rs = scored ** 1.83;
    const ra = allowed ** 1.83;
    return rs + ra > 0 ? rs / (rs + ra) : 0.5;
};

/** Fuerza del equipo contra la liga (0 a 1), acercada a .500 si ha jugado poco */
export const teamStrength = (form: TeamForm, priorGames = PRIOR_GAMES) => {
    const games = form.w + form.l;
    if (!games) return 0.5;
    const winPct = form.w / games;
    const deserved = form.scored !== null && form.allowed !== null && form.scored + form.allowed > 0 ? pythagoreanPct(form.scored, form.allowed) : winPct;
    const blended = (winPct + deserved) / 2;
    return 0.5 + (blended - 0.5) * (games / (games + priorGames));
};

/** log5: probabilidad de que A le gane a B */
export const log5 = (a: number, b: number) => {
    const den = a * (1 - b) + b * (1 - a);
    return den > 0 ? (a * (1 - b)) / den : 0.5;
};

const eraOf = (era: string | null | undefined) => {
    const value = parseFloat(String(era ?? ''));
    return Number.isFinite(value) ? value : null;
};

export const winProbability = (home: TeamForm, away: TeamForm, starters: { homeEra?: string | null; awayEra?: string | null } = {}, priorGames = PRIOR_GAMES): WinProbability => {
    let x = logit(clamp(log5(teamStrength(home, priorGames), teamStrength(away, priorGames)), 0.01, 0.99)) + HOME_EDGE;
    const homeEra = eraOf(starters.homeEra);
    const awayEra = eraOf(starters.awayEra);
    const withStarters = homeEra !== null && awayEra !== null;
    if (withStarters) x += clamp((awayEra - homeEra) * ERA_WEIGHT, -ERA_CAP, ERA_CAP);
    const p = clamp(fromLogit(x), 1 - LIMIT, LIMIT);
    return { home: p, away: 1 - p, early: home.w + home.l + away.w + away.l < 20, starters: withStarters };
};

/** Porcentajes enteros que suman 100 */
export const percents = (probability: WinProbability) => {
    const home = Math.round(probability.home * 100);
    return { home, away: 100 - home };
};
