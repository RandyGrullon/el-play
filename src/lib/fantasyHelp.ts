// «Cómo se juega»: el contenido de la ayuda armado con las reglas del día (rules). Ningún número está escrito a mano:
// los pasos, la tabla de puntos, los ejemplos y las respuestas salen de rulesOf(day). Mismo orden en la web y en la app.
import type { DayRules, FantasyScoring } from './fantasy';

/** Las preguntas, en el orden en que salen */
export const HELP_FAQ = ['lock', 'postponed', 'noPlay', 'prices', 'cantPick', 'perTeam', 'doubleheader', 'captain', 'picks', 'win', 'changeAfter', 'visibility', 'leagues', 'projection', 'account'] as const;
export type HelpQuestion = (typeof HELP_FAQ)[number];
export const HELP_SECTIONS = ['steps', 'points', 'examples', 'faq'] as const;
export type HelpTopic = HelpQuestion | (typeof HELP_SECTIONS)[number];

/** Dónde abre cada «?»: Créditos → precios, Capitán → capitán, Pronósticos → pronósticos, Tabla → cómo se gana */
export const HELP_FOR = { credits: 'prices', captain: 'captain', picks: 'picks', table: 'win' } as const satisfies Record<string, HelpQuestion>;

export const isHelpTopic = (value: unknown): value is HelpTopic => (HELP_FAQ as readonly unknown[]).includes(value) || (HELP_SECTIONS as readonly unknown[]).includes(value);

/** Letras del código de una liga privada (lo genera la base) */
export const LEAGUE_CODE_LENGTH = 6;

const round1 = (value: number) => Math.round(value * 10) / 10;

export interface HelpStep {
    key: 's1' | 's2' | 's2NoCap' | 's3' | 's4' | 's5';
    values: Record<string, number>;
}

/** Los 5 pasos con sus números (sin tope de créditos el paso 2 lo dice) */
export const helpSteps = (rules: DayRules): HelpStep[] => [
    { key: 's1', values: { batters: rules.batters, count: rules.pitchers } },
    rules.budget === null ? { key: 's2NoCap', values: {} } : { key: 's2', values: { budget: rules.budget } },
    { key: 's3', values: { captain: rules.captain } },
    { key: 's4', values: { picks: rules.picks } },
    { key: 's5', values: {} }
];

/** Orden de la tabla de puntos (el de las reglas) */
const ORDER: Record<keyof FantasyScoring, string[]> = {
    batter: ['single', 'double', 'triple', 'homeRun', 'run', 'rbi', 'walk', 'hbp', 'stolenBase', 'strikeout'],
    pitcher: ['out', 'strikeout', 'win', 'save', 'earnedRun', 'hit', 'walk']
};

export const scoringRows = (rules: DayRules, role: keyof FantasyScoring) =>
    ORDER[role].filter((key) => typeof rules.scoring[role][key] === 'number').map((key) => ({ key, points: rules.scoring[role][key] }));

/** La salida del ejemplo del lanzador: 6 entradas, 7 ponches, 2 carreras limpias, 5 hits, 1 base por bolas y gana */
export const PITCHER_EXAMPLE = { ip: 6, outs: 18, k: 7, er: 2, h: 5, bb: 1 };

/** Los tres ejemplos, calculados con la tabla de puntos del día */
export const helpExamples = (rules: DayRules) => {
    const b = rules.scoring.batter;
    const p = rules.scoring.pitcher;
    const soloHr = round1(b.homeRun + b.run + b.rbi);
    const line = PITCHER_EXAMPLE;
    const parts = {
        outsPts: round1(line.outs * p.out),
        kPts: round1(line.k * p.strikeout),
        erPts: round1(line.er * p.earnedRun),
        hPts: round1(line.h * p.hit),
        bbPts: round1(line.bb * p.walk),
        winPts: round1(p.win)
    };
    return {
        soloHr: { hr: b.homeRun, run: b.run, rbi: b.rbi, total: soloHr, captain: round1(soloHr * rules.captain) },
        double: { double: b.double, rbi: b.rbi, total: round1(b.double + 2 * b.rbi) },
        pitcher: { ...line, ...parts, total: round1(Object.values(parts).reduce((sum, value) => sum + value, 0)) }
    };
};

/** Los números de cada respuesta */
export const helpAnswerValues = (rules: DayRules): Partial<Record<HelpQuestion, Record<string, number>>> => ({
    // seasonWeights trae la temporada actual y las anteriores que cuentan
    prices: { past: Math.max(0, rules.prices.seasonWeights.length - 1), min: rules.prices.min, max: rules.prices.max },
    cantPick: { perTeam: rules.perTeam },
    perTeam: { perTeam: rules.perTeam },
    captain: { captain: rules.captain },
    picks: { picks: rules.picks },
    leagues: { code: LEAGUE_CODE_LENGTH }
});
