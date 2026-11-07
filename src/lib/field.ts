import type { GameDetail, GameField, PersonRef } from '../types';

// Vista del terreno: dónde va cada cara en el dibujo (visto desde arriba, home abajo y el jardín central arriba).
// El dibujo no va a escala: el cuadro va más grande que el jardín para que quepan las nueve caras sin taparse.

export const FIELD_W = 400;
export const FIELD_H = 476;

export interface Point {
    x: number;
    y: number;
}

export const HOME: Point = { x: 200, y: 380 };
export const BASE_POINTS = { first: { x: 285, y: 295 }, second: { x: 200, y: 210 }, third: { x: 115, y: 295 } } as const;
export const MOUND: Point = { x: 200, y: 300 };
/** Postes de foul y la cerca: un arco que pasa por los dos postes y llega arriba a y = 36 */
export const POLES = { left: { x: 22, y: 202 }, right: { x: 378, y: 202 } } as const;
export const FENCE_RADIUS = 178.43;
export const FENCE_CENTER: Point = { x: 200, y: 214.43 };
/** Círculos de espera: el del visitante del lado de tercera y el de casa del de primera */
export const ON_DECK_CIRCLES = { left: { x: 58, y: 424 }, right: { x: 342, y: 424 } } as const;

export type DefenseSpot = keyof GameField['defense'];
export type FieldSpot = DefenseSpot | 'runner1' | 'runner2' | 'runner3' | 'batter' | 'onDeck';
export type FieldSide = 'defense' | 'offense';

/** Orden en que salen las caras: lanzador, receptor, cuadro, jardines; después corredores, bateador y el que espera */
export const DEFENSE_ORDER: DefenseSpot[] = ['pitcher', 'catcher', 'first', 'second', 'shortstop', 'third', 'left', 'center', 'right'];

export const SPOTS: Record<Exclude<FieldSpot, 'batter' | 'onDeck'>, Point> = {
    pitcher: { x: 200, y: 294 },
    catcher: { x: 200, y: 420 },
    first: { x: 322, y: 256 },
    second: { x: 262, y: 204 },
    shortstop: { x: 138, y: 204 },
    third: { x: 78, y: 256 },
    left: { x: 80, y: 128 },
    center: { x: 200, y: 74 },
    right: { x: 320, y: 128 },
    // Los corredores al lado de su base (sin taparla): primera y tercera hacia afuera, segunda detrás
    runner1: { x: 320, y: 338 },
    runner2: { x: 200, y: 152 },
    runner3: { x: 80, y: 338 }
};

/** Caja de bateo: el derecho se para del lado de tercera (a la izquierda del plato, visto desde atrás del receptor) */
export const BATTER_BOXES = { left: { x: 140, y: 364 }, right: { x: 260, y: 364 } } as const;

/** Etiqueta corta de la posición (los corredores, la base en que están) */
export const SPOT_TAG: Partial<Record<FieldSpot, string>> = {
    pitcher: 'P',
    catcher: 'C',
    first: '1B',
    second: '2B',
    third: '3B',
    shortstop: 'SS',
    left: 'LF',
    center: 'CF',
    right: 'RF',
    runner1: '1B',
    runner2: '2B',
    runner3: '3B'
};

export interface FieldFace {
    /** Clave estable (posición + pelotero): si cambia el pelotero, la cara sale de nuevo */
    key: string;
    spot: FieldSpot;
    side: FieldSide;
    person: PersonRef;
    x: number;
    y: number;
    /** lg: los nueve y el bateador; md: corredores; sm: el que espera */
    size: 'lg' | 'md' | 'sm';
}

/** De qué lado del plato batea: 'L' → caja de la derecha; 'R' (o sin dato) → la de la izquierda; ambidiestro, contra la mano del lanzador */
export const batterBox = (side: string | null | undefined, pitcherHand?: string | null): 'left' | 'right' => {
    const bats = side === 'S' ? (pitcherHand === 'L' ? 'R' : 'L') : side;
    return bats === 'L' ? 'right' : 'left';
};

interface FacesInput {
    field: GameField | null | undefined;
    batSide?: string | null;
    pitcherHand?: string | null;
    /** El equipo de casa: si es el que batea, su círculo de espera es el de primera */
    homeId?: number | null;
}

/** Las caras del terreno en el orden en que aparecen, con su lugar en el dibujo; solo los que vienen en los datos */
export const fieldFaces = ({ field, batSide, pitcherHand, homeId }: FacesInput): FieldFace[] => {
    if (!field) return [];
    const faces: FieldFace[] = [];
    const add = (spot: FieldSpot, side: FieldSide, person: PersonRef | null | undefined, point: Point, size: FieldFace['size']) => {
        if (!person || (!person.id && !person.name)) return;
        faces.push({ key: `${spot}-${person.id || person.name}`, spot, side, person, x: point.x, y: point.y, size });
    };
    for (const spot of DEFENSE_ORDER) add(spot, 'defense', field.defense?.[spot], SPOTS[spot], 'lg');
    add('runner1', 'offense', field.offense?.first, SPOTS.runner1, 'md');
    add('runner2', 'offense', field.offense?.second, SPOTS.runner2, 'md');
    add('runner3', 'offense', field.offense?.third, SPOTS.runner3, 'md');
    add('batter', 'offense', field.offense?.batter, BATTER_BOXES[batterBox(batSide, pitcherHand)], 'lg');
    const homeBats = homeId != null && field.offenseTeamId === homeId;
    add('onDeck', 'offense', field.offense?.onDeck, ON_DECK_CIRCLES[homeBats ? 'right' : 'left'], 'sm');
    return faces;
};

/** Nota bajo el terreno: entre entradas, o si todavía no llegó la defensa */
export const fieldNote = (game: Pick<GameDetail, 'inning' | 'field'>): 'between' | 'empty' | null => {
    const defense = game.field?.defense;
    if (!defense || !Object.values(defense).some((person) => person?.id || person?.name)) return 'empty';
    if (game.inning?.state === 'Middle' || game.inning?.state === 'End') return 'between';
    return null;
};

interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * FLIP: la transformación que pone el panel (en su tamaño final) encima del diamante que se tocó, para animarlo de ahí
 * a su lugar. Escala pareja (sin deformar) y el radio de las esquinas para que se vea redondeado aun estando chico.
 */
export const flipTransform = (origin: Box, target: Box) => {
    const scale = Math.max(origin.width / target.width, origin.height / target.height);
    const dx = origin.left + origin.width / 2 - (target.left + target.width / 2);
    const dy = origin.top + origin.height / 2 - (target.top + target.height / 2);
    return { transform: `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${Number(scale.toFixed(4))})`, radius: Math.round(Math.min(400, 14 / Math.max(scale, 0.01))) };
};

/** Del dibujo a porcentaje del contenedor (las caras van en HTML encima del SVG) */
export const toPercent = (point: Point) => ({ left: `${(point.x / FIELD_W) * 100}%`, top: `${(point.y / FIELD_H) * 100}%` });
