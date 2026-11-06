// Enlaces a las páginas de un equipo (/equipo/[id]) y de un pelotero (/jugador/[id]) desde donde se muestren. Lógica
// pura (sin React Native) para poder probarla en Node: scripts/probar-jugadas.js.

/** Un id que sirve para abrir una página: entero positivo. 0, null, NaN o «» no abren nada (la pieza se pinta igual) */
export const linkId = (id: number | string | null | undefined): number | null => {
    const value = typeof id === 'string' ? Number(id) : id;
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
};

/** Parámetros de /jugador/[id]: el nombre y el equipo pintan la cabecera mientras carga; la temporada, si no es la actual */
export const playerParams = (player: { id: number; name?: string | null; teamId?: number | null }, season?: number | null) => {
    const teamId = linkId(player.teamId);
    return {
        id: player.id,
        ...(player.name ? { name: player.name } : {}),
        ...(teamId ? { teamId } : {}),
        ...(season ? { season } : {})
    };
};

type Person = { id: number; name: string };
export type DecisionKey = 'win' | 'loss' | 'save';

/**
 * Los pitchers de la decisión en la línea de un juego terminado, en orden: el ganador y, si hubo, el del salvamento; si no,
 * el perdedor (la tarjeta tiene una sola línea). Sin ganador no hay línea.
 */
export const decisionParts = (decisions: { winner: Person | null; loser: Person | null; save: Person | null } | null | undefined): { key: DecisionKey; person: Person }[] => {
    if (!decisions?.winner) return [];
    const second = decisions.save ? { key: 'save' as const, person: decisions.save } : decisions.loser ? { key: 'loss' as const, person: decisions.loser } : null;
    return [{ key: 'win' as const, person: decisions.winner }, ...(second ? [second] : [])];
};

/** El equipo de una sigla entre los que se tienen a mano (las piezas que solo traen la sigla); sin coincidencia, null */
export const teamByAbbrev = <T extends { id: number; abbrev: string }>(teams: readonly (T | null | undefined)[], abbrev: string | null | undefined): T | null => {
    if (!abbrev) return null;
    const wanted = abbrev.trim().toUpperCase();
    return teams.find((team): team is T => !!team && team.abbrev.toUpperCase() === wanted) ?? null;
};

export type LinkPerson = { id: number; name: string; teamId?: number | null };

const LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ'’.-]/;

/**
 * Parte un texto (la descripción de una jugada, «Pelotero Uno batea sencillo…») en pedazos: los que son el nombre completo
 * de alguien de la lista llevan a esa persona (para abrir su ficha), lo demás va tal cual. Sirve igual con equipos (la
 * sigla como nombre: «de AAA a BBB»). Solo nombres enteros (no
 * «Ana» dentro de «Banana»); si dos se pisan gana el que empieza antes y, a la par, el más largo.
 */
export const nameSegments = (text: string, people: readonly (LinkPerson | null | undefined)[]): { text: string; person: LinkPerson | null }[] => {
    if (!text) return [];
    // La misma persona puede venir con varios nombres («Pelotero Uno», «P. Uno»): se repite solo el par id + nombre
    const seen = new Set<string>();
    const list = people.filter((person): person is LinkPerson => {
        const key = person ? `${person.id}|${person.name?.trim()}` : '';
        if (!person || !linkId(person.id) || !person.name || person.name.trim().length < 2 || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const matches: { start: number; end: number; person: LinkPerson }[] = [];
    for (const person of list) {
        const name = person.name.trim();
        for (let from = text.indexOf(name); from >= 0; from = text.indexOf(name, from + name.length)) {
            const before = from > 0 ? text[from - 1] : '';
            const after = text[from + name.length] ?? '';
            // El punto final de la oración sí puede ir pegado al nombre
            if ((before && LETTER.test(before)) || (after && after !== '.' && LETTER.test(after))) continue;
            matches.push({ start: from, end: from + name.length, person });
        }
    }
    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    const parts: { text: string; person: LinkPerson | null }[] = [];
    let cursor = 0;
    for (const match of matches) {
        if (match.start < cursor) continue;
        if (match.start > cursor) parts.push({ text: text.slice(cursor, match.start), person: null });
        parts.push({ text: text.slice(match.start, match.end), person: match.person });
        cursor = match.end;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), person: null });
    return parts;
};

type BoxSide = { batters: { id: number; name: string }[]; pitchers: { id: number; name: string }[]; bench?: { id: number; name: string }[]; bullpen?: { id: number; name: string }[] };

/** Todos los del juego (alineación, lanzadores, banca y bullpen de los dos) con su equipo, para enlazar nombres sueltos */
export const gamePeople = (game: { away: { id: number }; home: { id: number }; box?: { away?: BoxSide | null; home?: BoxSide | null } | null }): LinkPerson[] =>
    (['away', 'home'] as const).flatMap((side) => {
        const box = game.box?.[side];
        if (!box) return [];
        return [...box.batters, ...box.pitchers, ...(box.bench ?? []), ...(box.bullpen ?? [])].map((person) => ({ id: person.id, name: person.name, teamId: game[side].id }));
    });

/** Cada persona con sus otras formas del nombre (el corto «P. Uno» del PRO, el del box «Uno, P»), sin repetir */
export const nameForms = (people: readonly LinkPerson[], forms: (person: LinkPerson) => readonly (string | null | undefined)[]): LinkPerson[] =>
    people.flatMap((person) => {
        const names = [person.name, ...forms(person)].map((name) => name?.trim() ?? '').filter((name, index, list) => name && list.indexOf(name) === index);
        return names.map((name) => ({ ...person, name }));
    });
