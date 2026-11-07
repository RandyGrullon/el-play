import { describe, it, expect } from 'vitest';
import { BASE_POINTS, BATTER_BOXES, FIELD_H, FIELD_W, ON_DECK_CIRCLES, SPOTS, SPOT_TAG, batterBox, fieldFaces, fieldNote, flipTransform, toPercent } from './field';
import type { GameField } from '../types';

// Datos inventados: ids y nombres de prueba
const person = (id: number, name: string) => ({ id, name });
const full: GameField = {
    defenseTeamId: 99992,
    offenseTeamId: 99991,
    defense: {
        pitcher: person(12345601, 'Pelotero Uno'),
        catcher: person(12345602, 'Pelotero Dos'),
        first: person(12345603, 'Pelotero Tres'),
        second: person(12345604, 'Pelotero Cuatro'),
        third: person(12345605, 'Pelotero Cinco'),
        shortstop: person(12345606, 'Pelotero Seis'),
        left: person(12345607, 'Pelotero Siete'),
        center: person(12345608, 'Pelotero Ocho'),
        right: person(12345609, 'Pelotero Nueve')
    },
    offense: {
        batter: person(87654301, 'Bateador Uno'),
        onDeck: person(87654302, 'Bateador Dos'),
        inHole: person(87654303, 'Bateador Tres'),
        first: person(87654304, 'Corredor Uno'),
        second: null,
        third: person(87654305, 'Corredor Tres')
    }
};

describe('vista del terreno: dónde va cada cara', () => {
    it('los nueve en su posición y en orden: lanzador, receptor, cuadro y jardines; después corredores, bateador y el que espera', () => {
        const faces = fieldFaces({ field: full, batSide: 'R', homeId: 99992 });
        expect(faces.map((face) => face.spot)).toEqual(['pitcher', 'catcher', 'first', 'second', 'shortstop', 'third', 'left', 'center', 'right', 'runner1', 'runner3', 'batter', 'onDeck']);
        expect(faces.filter((face) => face.side === 'defense').map((face) => SPOT_TAG[face.spot])).toEqual(['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF']);
        expect(faces.find((face) => face.spot === 'shortstop')).toMatchObject({ person: { id: 12345606 }, x: SPOTS.shortstop.x, y: SPOTS.shortstop.y, size: 'lg' });
        // El inHole no sale en el terreno
        expect(faces.some((face) => face.person.id === 87654303)).toBe(false);
    });

    it('cada uno en su lado del terreno: jardines arriba, receptor abajo, primera a la derecha y tercera a la izquierda', () => {
        expect(SPOTS.center.y).toBeLessThan(SPOTS.second.y);
        expect(SPOTS.catcher.y).toBeGreaterThan(SPOTS.pitcher.y);
        expect(SPOTS.first.x).toBeGreaterThan(SPOTS.pitcher.x);
        expect(SPOTS.third.x).toBeLessThan(SPOTS.pitcher.x);
        expect(SPOTS.right.x).toBeGreaterThan(SPOTS.left.x);
        for (const point of Object.values(SPOTS)) {
            expect(point.x).toBeGreaterThan(0);
            expect(point.x).toBeLessThan(FIELD_W);
            expect(point.y).toBeGreaterThan(0);
            expect(point.y).toBeLessThan(FIELD_H);
        }
    });

    it('los corredores al lado de su base, sin taparla', () => {
        const faces = fieldFaces({ field: { ...full, offense: { ...full.offense, second: person(87654306, 'Corredor Dos') } } });
        for (const [spot, base] of [['runner1', BASE_POINTS.first], ['runner2', BASE_POINTS.second], ['runner3', BASE_POINTS.third]] as const) {
            const face = faces.find((item) => item.spot === spot)!;
            const distance = Math.hypot(face.x - base.x, face.y - base.y);
            expect(distance).toBeGreaterThan(30);
            expect(distance).toBeLessThan(60);
            expect(face.size).toBe('md');
            expect(face.side).toBe('offense');
        }
    });

    it('el bateador en su caja según de qué lado batea (sin dato, como derecho)', () => {
        expect(batterBox('R')).toBe('left');
        expect(batterBox('L')).toBe('right');
        expect(batterBox(null)).toBe('left');
        expect(batterBox('S', 'R')).toBe('right');
        expect(batterBox('S', 'L')).toBe('left');
        const at = (batSide: string | null) => fieldFaces({ field: full, batSide }).find((face) => face.spot === 'batter')!;
        expect(at('L')).toMatchObject(BATTER_BOXES.right);
        expect(at(null)).toMatchObject(BATTER_BOXES.left);
    });

    it('el que espera, más pequeño y en el círculo del lado de su equipo', () => {
        const visitor = fieldFaces({ field: full, homeId: 99992 }).find((face) => face.spot === 'onDeck')!;
        expect(visitor).toMatchObject({ ...ON_DECK_CIRCLES.left, size: 'sm' });
        const home = fieldFaces({ field: { ...full, offenseTeamId: 99992, defenseTeamId: 99991 }, homeId: 99992 }).find((face) => face.spot === 'onDeck')!;
        expect(home).toMatchObject(ON_DECK_CIRCLES.right);
    });

    it('solo los que vienen: sin terreno no hay caras; sin id sale igual (con sus iniciales)', () => {
        expect(fieldFaces({ field: null })).toEqual([]);
        const partial: GameField = {
            ...full,
            defense: { ...full.defense, catcher: null, left: { id: 0, name: 'Sin Id' } },
            offense: { batter: null, onDeck: null, inHole: null, first: null, second: null, third: null }
        };
        const faces = fieldFaces({ field: partial });
        expect(faces).toHaveLength(8);
        expect(faces.find((face) => face.spot === 'left')?.key).toBe('left-Sin Id');
    });

    it('nota: entre entradas o sin defensa todavía', () => {
        expect(fieldNote({ field: full, inning: { n: 7, ordinal: '7th', isTop: true, state: 'Top' } })).toBeNull();
        expect(fieldNote({ field: full, inning: { n: 7, ordinal: '7th', isTop: true, state: 'Middle' } })).toBe('between');
        expect(fieldNote({ field: full, inning: { n: 7, ordinal: '7th', isTop: false, state: 'End' } })).toBe('between');
        const empty = { ...full, defense: Object.fromEntries(Object.keys(full.defense).map((key) => [key, null])) as GameField['defense'] };
        expect(fieldNote({ field: empty, inning: null })).toBe('empty');
        expect(fieldNote({ field: null, inning: null })).toBe('empty');
    });

    it('del dibujo a porcentaje del contenedor', () => {
        expect(toPercent({ x: 200, y: FIELD_H / 2 })).toEqual({ left: '50%', top: '50%' });
    });

    it('FLIP: el panel sale del diamante tocado (centro sobre centro, escala pareja)', () => {
        const origin = { left: 40, top: 300, width: 50, height: 40 };
        const target = { left: 0, top: 0, width: 400, height: 800 };
        const { transform, radius } = flipTransform(origin, target);
        // centro del diamante (65, 320) menos centro del panel (200, 400); escala por el ancho (50/400 > 40/800)
        expect(transform).toBe('translate(-135px, -80px) scale(0.125)');
        expect(radius).toBe(112);
    });
});
