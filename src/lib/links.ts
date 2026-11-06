// Enlaces a la página de cada equipo y de cada pelotero, y lo que hace falta para ponerlos dentro de un texto: los
// nombres de una jugada («Juan Pérez batea sencillo…») y los huecos de una traducción («G: {{name}}»).
import type { AtBat, PersonRef } from '../types';

export const teamPath = (id: number) => `/equipo/${id}`;
/** Su página; con `season` abre esa temporada */
export const playerPath = (id: number, season?: number | null) => `/jugador/${id}${season ? `?temporada=${season}` : ''}`;

/** Un trozo de texto: texto suelto o el nombre de un pelotero con su id */
export type TextPart = string | { id: number; text: string };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parte un texto en trozos: cada nombre conocido (palabra completa, el más largo primero) con su id y lo demás como
 * texto. Sin lookbehind (Safari viejo no lo entiende): la letra de antes se captura y se devuelve al texto.
 */
export const splitByNames = (text: string, people: (PersonRef | null | undefined)[]): TextPart[] => {
    if (!text) return [];
    const ids = new Map<string, number>();
    for (const person of people) {
        const name = person?.name?.trim();
        if (person?.id && name && name.length >= 3 && !ids.has(name)) ids.set(name, person.id);
    }
    if (!ids.size) return [text];
    const names = [...ids.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${names.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
    const parts: TextPart[] = [];
    let last = 0;
    for (const match of text.matchAll(pattern)) {
        const start = (match.index ?? 0) + match[1].length;
        if (start > last) parts.push(text.slice(last, start));
        parts.push({ id: ids.get(match[2])!, text: match[2] });
        last = start + match[2].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
};

/** Los que salen en las jugadas de un juego (bateadores, lanzadores y los que entran o salen en un cambio) */
export const peopleOf = (atBats: AtBat[]): PersonRef[] => {
    const seen = new Map<number, PersonRef>();
    const add = (person: PersonRef | null | undefined) => {
        if (person?.id && person.name && !seen.has(person.id)) seen.set(person.id, { id: person.id, name: person.name });
    };
    for (const atBat of atBats) {
        add(atBat.batter);
        add(atBat.pitcher);
        for (const action of atBat.actions ?? []) {
            add(action.sub?.in);
            add(action.sub?.out);
        }
    }
    return [...seen.values()];
};

// Marcas de los huecos (caracteres de uso privado: no salen en los textos de la app)
const OPEN = '';
const CLOSE = '';

/** Lo que se pasa a `t()` en vez del valor: `t('card.win', { name: slot('name') })` */
export const slot = (name: string) => `${OPEN}${name}${CLOSE}`;

/** El texto traducido en trozos: texto suelto o el nombre del hueco que va ahí */
export const splitSlots = (text: string): (string | { slot: string })[] => {
    const parts: (string | { slot: string })[] = [];
    const pattern = new RegExp(`${OPEN}([^${CLOSE}]*)${CLOSE}`, 'g');
    let last = 0;
    for (const match of text.matchAll(pattern)) {
        const start = match.index ?? 0;
        if (start > last) parts.push(text.slice(last, start));
        parts.push({ slot: match[1] });
        last = start + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
};
