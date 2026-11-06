import { describe, expect, it } from 'vitest';
import { peopleOf, playerPath, slot, splitByNames, splitSlots, teamPath } from './links';
import type { AtBat } from '../types';

// Peloteros inventados
const UNO = { id: 12345678, name: 'Pelotero Uno' };
const DOS = { id: 87654321, name: 'Pelotero Dos Jr.' };
const TRES = { id: 11223344, name: 'Uno' };

describe('rutas de equipos y peloteros', () => {
    it('la página del equipo y la del pelotero (con la temporada si se pide)', () => {
        expect(teamPath(99999)).toBe('/equipo/99999');
        expect(playerPath(12345678)).toBe('/jugador/12345678');
        expect(playerPath(12345678, null)).toBe('/jugador/12345678');
        expect(playerPath(12345678, 2025)).toBe('/jugador/12345678?temporada=2025');
    });
});

describe('splitByNames: los nombres de una jugada', () => {
    it('cada nombre conocido sale con su id y el resto queda como texto', () => {
        expect(splitByNames('Pelotero Uno batea sencillo. Pelotero Dos Jr. anota.', [UNO, DOS])).toEqual([
            { id: UNO.id, text: 'Pelotero Uno' },
            ' batea sencillo. ',
            { id: DOS.id, text: 'Pelotero Dos Jr.' },
            ' anota.'
        ]);
    });

    it('el nombre más largo gana y solo cuenta la palabra completa', () => {
        expect(splitByNames('Pelotero Uno y Unos más', [TRES, UNO])).toEqual([{ id: UNO.id, text: 'Pelotero Uno' }, ' y Unos más']);
        expect(splitByNames('Uno, luego Uno.', [TRES])).toEqual([{ id: TRES.id, text: 'Uno' }, ', luego ', { id: TRES.id, text: 'Uno' }, '.']);
    });

    it('nombres con tildes y signos de expresiones regulares', () => {
        const raro = { id: 22334455, name: 'Peloterú (Cuatro)' };
        expect(splitByNames('Out de Peloterú (Cuatro).', [raro])).toEqual(['Out de ', { id: raro.id, text: 'Peloterú (Cuatro)' }, '.']);
        expect(splitByNames('Peloteroñ Uno', [UNO])).toEqual(['Peloteroñ Uno']);
    });

    it('sin gente, sin id o con nombres muy cortos el texto queda igual', () => {
        expect(splitByNames('Pelotero Uno', [])).toEqual(['Pelotero Uno']);
        expect(splitByNames('Pelotero Uno', [{ id: 0, name: 'Pelotero Uno' }, null, undefined])).toEqual(['Pelotero Uno']);
        expect(splitByNames('Al bate: Yo', [{ id: 33445566, name: 'Yo' }])).toEqual(['Al bate: Yo']);
        expect(splitByNames('', [UNO])).toEqual([]);
    });
});

describe('peopleOf: los de las jugadas del juego', () => {
    it('bateadores, lanzadores y los cambios, una vez cada uno', () => {
        const atBat = (batter: { id: number; name: string }, pitcher: { id: number; name: string }, sub?: { in: { id: number; name: string }; out: { id: number; name: string } | null }) =>
            ({ batter: { ...batter, side: 'R' }, pitcher: { ...pitcher, hand: 'R' }, actions: sub ? [{ event: 'Defensive Sub', desc: '', sub: { pos: null, ...sub } }] : [] }) as unknown as AtBat;
        const CINCO = { id: 55667788, name: 'Pelotero Cinco' };
        expect(peopleOf([atBat(UNO, DOS), atBat(TRES, DOS, { in: CINCO, out: UNO })]).map((person) => person.id)).toEqual([UNO.id, DOS.id, TRES.id, CINCO.id]);
    });
});

describe('slot y splitSlots: huecos de una traducción', () => {
    it('separa el texto de cada hueco', () => {
        expect(splitSlots(`G: ${slot('name')}`)).toEqual(['G: ', { slot: 'name' }]);
        expect(splitSlots(`${slot('batter')} al bate contra ${slot('pitcher')}`)).toEqual([{ slot: 'batter' }, ' al bate contra ', { slot: 'pitcher' }]);
        expect(splitSlots('Sin huecos')).toEqual(['Sin huecos']);
    });
});
