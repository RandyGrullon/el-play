// Volver al terreno después de la ficha de un pelotero (lógica pura; la usa components/game/field/launcher.tsx): al tocar
// una cara del terreno se recuerda qué juego estaba abierto y en qué pantalla (sus claves de ruta desde la raíz de la
// navegación). Con cada cambio de la navegación se mira dónde quedó esa pantalla: debajo de la ficha (y de lo que se
// abra desde ahí), de vuelta a la vista o en ningún lado (se fue a otra pestaña u otra pantalla tomó su lugar). Solo la
// primera vuelta atrás abre el terreno otra vez.

/** Lo que hace falta del estado de la navegación (los de adentro pueden venir a medias) */
export interface NavTree {
    index?: number;
    type?: string;
    routes: readonly { key?: string; state?: NavTree }[];
}

/** Las claves de las rutas desde la raíz hasta la de `key` (null si no está) */
export const navChainTo = (tree: NavTree | undefined, key: string): string[] | null => {
    for (const route of tree?.routes ?? []) {
        if (!route.key) continue;
        if (route.key === key) return [route.key];
        const below = navChainTo(route.state, key);
        if (below) return [route.key, ...below];
    }
    return null;
};

export type HostPlace = 'here' | 'away' | 'gone';

/**
 * Dónde está la pantalla (`chain`: sus claves desde la raíz) en la navegación de ahora: «here» = es la que se ve;
 * «away» = sigue en su pila, debajo de otra que se abrió encima; «gone» = ya no está o se fue a otra parte (otra pestaña,
 * otra pantalla en su lugar).
 */
export const hostPlace = (root: NavTree | undefined, chain: readonly string[]): HostPlace => {
    let tree = root;
    for (const key of chain) {
        if (!tree?.routes.length) return 'gone';
        const focused = tree.index ?? tree.routes.length - 1;
        const at = tree.routes.findIndex((route) => route.key === key);
        if (at < 0) return 'gone';
        if (at !== focused) return at < focused && tree.type !== 'tab' ? 'away' : 'gone';
        tree = tree.routes[at].state;
    }
    return 'here';
};

/** Lo que se recuerda para volver al terreno */
export interface FieldReturn {
    gamePk: number;
    /** La pantalla que tenía abierto el terreno (sus claves desde la raíz) */
    chain: string[];
    /** Ya se fue a la ficha */
    away: boolean;
    /** Ya volvió: si se va otra vez sin que salga el terreno, se olvida (solo cuenta la primera vuelta) */
    returned: boolean;
    /** Si para entonces no se fue (la ficha no se abrió), se olvida */
    until: number;
}

/** Cuánto se espera a que se abra la ficha */
export const FIELD_LEAVE_MS = 3000;

export const fieldReturnOf = (gamePk: number, chain: string[], now: number): FieldReturn => ({ gamePk, chain, away: false, returned: false, until: now + FIELD_LEAVE_MS });

/** Lo que queda después de un cambio de la navegación (null = se olvida) */
export const fieldReturnStep = (ticket: FieldReturn, place: HostPlace, now: number): FieldReturn | null => {
    if (place === 'here') {
        if (ticket.away) return ticket.returned ? ticket : { ...ticket, returned: true };
        return now > ticket.until ? null : ticket;
    }
    if (place === 'gone' || ticket.returned) return null;
    return ticket.away ? ticket : { ...ticket, away: true };
};
