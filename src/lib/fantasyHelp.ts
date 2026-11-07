// «Cómo se juega» del Fantasy (igual que la web): los números de los pasos, la tabla de puntos, los ejemplos y las
// preguntas salen de las reglas del día (rules), nunca escritos a mano. Los textos son fantasyHelp.* (los mismos de la
// web). Lógica pura: la pantalla solo los pinta.
import { SCORING_ORDER, type FantasyRules } from './fantasy';

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Las preguntas, en el orden de la ayuda (fantasyHelp.faq.<clave>) */
export const HELP_QUESTIONS = ['lock', 'postponed', 'noPlay', 'prices', 'cantPick', 'perTeam', 'doubleheader', 'captain', 'picks', 'win', 'changeAfter', 'visibility', 'leagues', 'projection', 'account'] as const;
export type HelpQuestion = (typeof HELP_QUESTIONS)[number];

/** Los «?» de cada parte abren la ayuda en su pregunta (fantasyHelp.topic.<parte> dice de qué es la ayuda) */
export const HELP_TOPICS = { credits: 'prices', captain: 'captain', picks: 'picks', table: 'win' } as const satisfies Record<string, HelpQuestion>;
export type HelpTopic = keyof typeof HELP_TOPICS;

export const isHelpQuestion = (value: unknown): value is HelpQuestion => typeof value === 'string' && (HELP_QUESTIONS as readonly string[]).includes(value);

/** Letras del código de una liga privada */
export const LEAGUE_CODE_LENGTH = 6;

/** Los números que usan los textos («Escoge {{batters}} bateadores…», «Hasta {{perTeam}}», «de {{min}} a {{max}}») */
export const helpNumbers = (rules: FantasyRules) => ({
    batters: rules.roster.batters,
    pitchers: rules.roster.pitchers,
    budget: rules.budget,
    captain: rules.captain,
    picks: rules.picks.points,
    perTeam: rules.perTeam,
    min: rules.prices.min,
    max: rules.prices.max,
    /** Temporadas anteriores que cuentan en el precio (además de la actual) */
    past: Math.max(0, rules.prices.seasonWeights.length - 1),
    code: LEAGUE_CODE_LENGTH
});

/** La clave del texto de cada jugada en la ayuda (fantasyHelp.points.<rol>.<clave>): la web usa hbp y strikeout */
export const helpScoringKey = (key: string) => (key === 'hitByPitch' ? 'hbp' : key === 'strikeOut' ? 'strikeout' : key);

/** Filas de la tabla de puntos, en el orden de la ayuda (las claves que no vengan no salen) */
export const scoringRows = (rules: FantasyRules, role: 'batter' | 'pitcher') =>
    SCORING_ORDER[role].filter((key) => typeof rules.scoring[role][key] === 'number').map((key) => ({ key, label: helpScoringKey(key), points: rules.scoring[role][key] }));

/**
 * Los ejemplos de la ayuda con la puntuación del día: jonrón solitario (jonrón + carrera + impulsada, y de capitán),
 * doble que impulsa a dos y un lanzador de 6 entradas (18 outs), 7 ponches, 2 carreras limpias, 5 hits, 1 base por
 * bolas y la victoria. Las cantidades (ip, outs, k…) y los puntos (outsPts, kPts…) son los de fantasyHelp.examples.
 */
export const helpExamples = (rules: FantasyRules) => {
    const b = rules.scoring.batter;
    const p = rules.scoring.pitcher;
    const get = (group: Record<string, number>, key: string) => group[key] ?? 0;
    const hr = get(b, 'homeRun');
    const run = get(b, 'run');
    const rbi = get(b, 'rbi');
    const soloTotal = round1(hr + run + rbi);
    const double = get(b, 'double');
    const counts = { ip: 6, outs: 18, k: 7, er: 2, h: 5, bb: 1 };
    const pitcher = {
        ...counts,
        outsPts: round1(counts.outs * get(p, 'out')),
        kPts: round1(counts.k * get(p, 'strikeOut')),
        erPts: round1(counts.er * get(p, 'earnedRun')),
        hPts: round1(counts.h * get(p, 'hit')),
        bbPts: round1(counts.bb * get(p, 'walk')),
        winPts: get(p, 'win')
    };
    return {
        solo: { hr, run, rbi, total: soloTotal, captain: round1(soloTotal * rules.captain) },
        double: { double, rbi, total: round1(double + 2 * rbi) },
        pitcher: { ...pitcher, total: round1(pitcher.outsPts + pitcher.kPts + pitcher.erPts + pitcher.hPts + pitcher.bbPts + pitcher.winPts) }
    };
};
