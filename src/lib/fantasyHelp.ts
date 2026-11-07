// «Cómo se juega» del Fantasy (igual que la web): los números de los pasos, la tabla de puntos, los ejemplos y las
// preguntas salen de las reglas del día (rules), nunca escritos a mano. Lógica pura: la pantalla solo los pinta.
import { SCORING_ORDER, type FantasyRules } from './fantasy';

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Las preguntas, en el orden de la ayuda */
export const HELP_QUESTIONS = ['lock', 'postponed', 'noPlay', 'prices', 'cantPick', 'perTeam', 'doubleheader', 'captain', 'picks', 'win', 'cheat', 'visible', 'leagues', 'projection', 'account'] as const;
export type HelpQuestion = (typeof HELP_QUESTIONS)[number];

/** Los «?» de cada parte abren la ayuda en su pregunta */
export const HELP_TOPICS = { credits: 'prices', captain: 'captain', picks: 'picks', table: 'win' } as const satisfies Record<string, HelpQuestion>;
export type HelpTopic = keyof typeof HELP_TOPICS;

export const isHelpQuestion = (value: unknown): value is HelpQuestion => typeof value === 'string' && (HELP_QUESTIONS as readonly string[]).includes(value);

/** Los números que usan los textos («Escoge {{batters}} bateadores…», «Hasta {{perTeam}}», «de {{min}} a {{max}}») */
export const helpNumbers = (rules: FantasyRules) => ({
    batters: rules.roster.batters,
    pitchers: rules.roster.pitchers,
    budget: rules.budget,
    captain: rules.captain,
    picks: rules.picks.points,
    perTeam: rules.perTeam,
    min: rules.prices.min,
    max: rules.prices.max
});

/** Filas de la tabla de puntos, en el orden de la ayuda (las claves que no vengan no salen) */
export const scoringRows = (rules: FantasyRules, role: 'batter' | 'pitcher') =>
    SCORING_ORDER[role].filter((key) => typeof rules.scoring[role][key] === 'number').map((key) => ({ key, points: rules.scoring[role][key] }));

/**
 * Los ejemplos de la ayuda con la puntuación del día: jonrón solitario (jonrón + carrera + impulsada, y de capitán),
 * doble que impulsa a dos y un lanzador de 6 entradas (18 outs), 7 ponches, 2 carreras limpias, 5 hits, 1 base por
 * bolas y la victoria.
 */
export const helpExamples = (rules: FantasyRules) => {
    const b = rules.scoring.batter;
    const p = rules.scoring.pitcher;
    const get = (group: Record<string, number>, key: string) => group[key] ?? 0;
    const solo = { homeRun: get(b, 'homeRun'), run: get(b, 'run'), rbi: get(b, 'rbi') };
    const soloTotal = round1(solo.homeRun + solo.run + solo.rbi);
    const double = { double: get(b, 'double'), rbi: round1(2 * get(b, 'rbi')) };
    const pitcher = {
        outs: round1(18 * get(p, 'out')),
        strikeOuts: round1(7 * get(p, 'strikeOut')),
        earnedRuns: round1(2 * get(p, 'earnedRun')),
        hits: round1(5 * get(p, 'hit')),
        walks: round1(get(p, 'walk')),
        win: get(p, 'win')
    };
    return {
        solo: { ...solo, total: soloTotal, captain: round1(soloTotal * rules.captain) },
        double: { ...double, total: round1(double.double + double.rbi) },
        pitcher: { ...pitcher, total: round1(pitcher.outs + pitcher.strikeOuts + pitcher.earnedRuns + pitcher.hits + pitcher.walks + pitcher.win) }
    };
};
