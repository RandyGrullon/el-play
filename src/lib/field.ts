import type { GameDetail, GameField, PersonRef } from '../types';

// Vista del terreno: quién está en cada lugar y dónde va su cara sobre el dibujo (lógica pura, la prueba
// scripts/probar-jugadas.js). El dibujo mide 100 × 112: home abajo al centro, el jardín central arriba.

export const FIELD_W = 100;
export const FIELD_H = 112;

export type DefenseSpot = keyof GameField['defense'];
export type FaceRole = 'defense' | 'runner' | 'batter' | 'onDeck';
export type FaceSize = 'md' | 'sm' | 'xs';

export interface FieldFace {
    /** Único en el terreno: 'pitcher', 'runner-first', 'batter'… */
    key: string;
    role: FaceRole;
    /** Lugar: la posición de la defensa, la base del corredor o 'batter' / 'onDeck' */
    spot: DefenseSpot | 'batter' | 'onDeck';
    person: PersonRef;
    /** Equipo de su aro: la defensa o el que batea */
    teamId: number | null;
    /** Etiqueta corta: P, C, 1B…; corredores 1B/2B/3B; 'batter' y 'onDeck' se traducen */
    tag: string;
    /** Centro de la cara sobre el dibujo (unidades de 100 × 112) */
    x: number;
    y: number;
    size: FaceSize;
    /** Turno de entrada (0, 1, 2…): lanzador, receptor, cuadro, jardines, corredores, bateador y el que sigue */
    order: number;
}

export interface FieldModel {
    defenseTeamId: number | null;
    offenseTeamId: number | null;
    faces: FieldFace[];
    /** Pausa entre entradas: lo que se ve es cómo sale a la defensa el equipo que viene */
    between: boolean;
    /** Hay por lo menos un defensor en el terreno */
    hasDefense: boolean;
    /** De dónde salió: `field` del juego, los extras PRO o nada (solo corredores y duelo) */
    source: 'field' | 'pro' | 'none';
}

// Puntos del dibujo (la cuenta de cada base está en FieldDrawing: home 50,90; bases a 26 de distancia)
export const PLATE = { x: 50, y: 90 };
export const BASE_POINTS = {
    first: { x: 68.4, y: 71.6 },
    second: { x: 50, y: 53.2 },
    third: { x: 31.6, y: 71.6 }
} as const;
export const MOUND = { x: 50, y: 72.5 };
export const ON_DECK = { left: { x: 13, y: 102 }, right: { x: 87, y: 102 } } as const;

const DEFENSE_SPOTS: { spot: DefenseSpot; tag: string; x: number; y: number }[] = [
    { spot: 'pitcher', tag: 'P', x: MOUND.x, y: MOUND.y - 2 },
    { spot: 'catcher', tag: 'C', x: 50, y: 101 },
    { spot: 'first', tag: '1B', x: 80, y: 61 },
    { spot: 'second', tag: '2B', x: 64, y: 47 },
    { spot: 'shortstop', tag: 'SS', x: 36, y: 47 },
    { spot: 'third', tag: '3B', x: 20, y: 61 },
    { spot: 'left', tag: 'LF', x: 20, y: 30 },
    { spot: 'center', tag: 'CF', x: 50, y: 16 },
    { spot: 'right', tag: 'RF', x: 80, y: 30 }
];

// El corredor va al lado de su base (no encima: la base se sigue viendo)
const RUNNER_SPOTS: { base: 'first' | 'second' | 'third'; tag: string; x: number; y: number }[] = [
    { base: 'first', tag: '1B', x: BASE_POINTS.first.x + 7, y: BASE_POINTS.first.y + 7 },
    { base: 'second', tag: '2B', x: BASE_POINTS.second.x, y: BASE_POINTS.second.y - 14 },
    { base: 'third', tag: '3B', x: BASE_POINTS.third.x - 7, y: BASE_POINTS.third.y + 7 }
];

type ProDefense = Partial<Record<DefenseSpot, PersonRef | null>> & { teamId?: number | null };
type ProOffense = Partial<Record<keyof GameField['offense'], PersonRef | null>> & { teamId?: number | null };

/** Los extras PRO del juego (lib/pro/juego.ts): mismos datos con el equipo adentro */
export interface ProFieldData {
    defense?: ProDefense | null;
    offense?: ProOffense | null;
}

type FieldGame = Pick<GameDetail, 'away' | 'home' | 'inning' | 'runners' | 'matchup'> & { field?: GameField | null; dueUp?: GameDetail['dueUp'] };

const valid = (person: PersonRef | null | undefined): person is PersonRef => !!person && !!person.name;

/**
 * Caja de bateo en el dibujo (visto desde atrás del receptor): el derecho se para del lado de tercera (a la izquierda
 * del plato), el zurdo del de primera; el ambidiestro, contra la mano del lanzador. Igual que batterBox de la web.
 */
export const batterBox = (side: string | null | undefined, pitcherHand?: string | null): 'left' | 'right' => {
    const bats = side === 'S' ? (pitcherHand === 'L' ? 'R' : 'L') : side;
    return bats === 'L' ? 'right' : 'left';
};

/**
 * Quién va en cada lugar del terreno. Sale de `field` del juego; sin él, de los extras PRO; sin ninguno, solo los
 * corredores y el duelo del juego. Entre entradas no van corredores (ya no hay) y el bateador es el que abre.
 */
export const fieldModel = (game: FieldGame, pro?: ProFieldData | null): FieldModel => {
    const field = game.field ?? null;
    const proDefense = pro?.defense ?? null;
    const proOffense = pro?.offense ?? null;
    const source: FieldModel['source'] = field ? 'field' : proDefense || proOffense ? 'pro' : 'none';
    const between = game.inning?.state === 'Middle' || game.inning?.state === 'End';
    // En la pausa del medio batea el de casa; al final de la entrada, el visitante
    const battingHome = game.inning?.state === 'Middle' ? true : game.inning?.state === 'End' ? false : !game.inning?.isTop;
    const fallbackOffense = game.inning ? (battingHome ? game.home.id : game.away.id) : null;
    const fallbackDefense = game.inning ? (battingHome ? game.away.id : game.home.id) : null;
    const defenseTeamId = field?.defenseTeamId ?? proDefense?.teamId ?? fallbackDefense;
    const offenseTeamId = field?.offenseTeamId ?? proOffense?.teamId ?? fallbackOffense;

    const defense: Partial<Record<DefenseSpot, PersonRef | null>> = field?.defense ?? proDefense ?? {};
    // Sin ninguno: los corredores y el duelo del juego (en la pausa, los que abren la otra mitad)
    const dueUp = game.dueUp?.batters ?? [];
    const offense: Partial<Record<keyof GameField['offense'], PersonRef | null>> = field?.offense ??
        proOffense ??
        (between
            ? { batter: dueUp[0] ?? null, onDeck: dueUp[1] ?? null }
            : { batter: game.matchup?.batter ?? null, onDeck: game.matchup?.onDeck ?? null, first: game.runners.first, second: game.runners.second, third: game.runners.third });

    const faces: FieldFace[] = [];
    const push = (face: Omit<FieldFace, 'order'>) => faces.push({ ...face, order: faces.length });

    for (const spot of DEFENSE_SPOTS) {
        const person = defense[spot.spot];
        if (valid(person)) push({ key: spot.spot, role: 'defense', spot: spot.spot, person: { id: person.id, name: person.name }, teamId: defenseTeamId, tag: spot.tag, x: spot.x, y: spot.y, size: 'md' });
    }
    const hasDefense = faces.length > 0;
    if (!between) {
        for (const spot of RUNNER_SPOTS) {
            const person = offense[spot.base];
            if (valid(person)) push({ key: `runner-${spot.base}`, role: 'runner', spot: spot.base, person: { id: person.id, name: person.name }, teamId: offenseTeamId, tag: spot.tag, x: spot.x, y: spot.y, size: 'sm' });
        }
    }
    const batter = offense.batter;
    if (valid(batter)) {
        // El lado es el del duelo de ahora (si es el mismo bateador)
        const duel = game.matchup && game.matchup.batter.id === batter.id ? game.matchup : null;
        const box = batterBox(duel?.batter.side, duel?.pitcher.hand);
        push({ key: 'batter', role: 'batter', spot: 'batter', person: { id: batter.id, name: batter.name }, teamId: offenseTeamId, tag: 'batter', x: box === 'left' ? PLATE.x - 13 : PLATE.x + 13, y: PLATE.y - 2, size: 'md' });
    }
    const onDeck = offense.onDeck;
    if (valid(onDeck)) {
        // El que sigue espera en el círculo de su lado: el visitante por tercera, el de casa por primera
        const circle = offenseTeamId !== null && offenseTeamId === game.home.id ? ON_DECK.right : ON_DECK.left;
        push({ key: 'onDeck', role: 'onDeck', spot: 'onDeck', person: { id: onDeck.id, name: onDeck.name }, teamId: offenseTeamId, tag: 'onDeck', x: circle.x, y: circle.y, size: 'xs' });
    }
    return { defenseTeamId, offenseTeamId, faces, between, hasDefense, source };
};
