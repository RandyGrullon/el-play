// Avisos jugada a jugada con la app abierta (o en segundo plano): se comparan dos lecturas seguidas del calendario de
// un juego en vivo (carreras y hits de cada equipo). Con la app cerrada los manda el servidor con el detalle de cada
// jugada (server/services/pushAlerts.js), que además sabe quién bateó y si fue jonrón.

export interface ScoreSnap {
    away: number;
    home: number;
    awayHits: number;
    homeHits: number;
}

export type LeadTurn = 'ahead' | 'comeback' | 'tie';

export interface PlayAlert {
    kind: 'lead' | 'runs' | 'hits';
    /** El equipo que anotó o dio el hit */
    side: 'away' | 'home';
    lead?: LeadTurn;
}

export interface PlayAlertKinds {
    runs: boolean;
    lead: boolean;
    hits: boolean;
}

/** Cómo cambió quién va ganando cuando anota un equipo (null si no cambió) */
export const leadTurn = (before: { away: number; home: number }, after: { away: number; home: number }, side: 'away' | 'home'): LeadTurn | null => {
    const other = side === 'away' ? 'home' : 'away';
    const was = before[side] - before[other];
    const is = after[side] - after[other];
    if (is === 0 && was < 0) return 'tie';
    if (is > 0 && was < 0) return 'comeback';
    if (is > 0 && was === 0) return 'ahead';
    return null;
};

/**
 * Lo que toca avisar entre dos lecturas (uno solo, el más importante de los encendidos: cambio de ventaja > carrera >
 * hit). Sin lectura anterior no se avisa nada: al abrir la app no se cuenta lo que ya había pasado.
 */
export const playAlertOf = (before: ScoreSnap | undefined, after: ScoreSnap, kinds: PlayAlertKinds): PlayAlert | null => {
    if (!before) return null;
    const runs = { away: after.away - before.away, home: after.home - before.home };
    if (runs.away > 0 || runs.home > 0) {
        // Si anotaron los dos entre una lectura y otra, cuenta el que anotó más (el último no se sabe)
        const side = runs.home > runs.away ? 'home' : 'away';
        const lead = runs.away > 0 && runs.home > 0 ? null : leadTurn(before, after, side);
        if (lead && kinds.lead) return { kind: 'lead', side, lead };
        if (kinds.runs) return { kind: 'runs', side };
        // Con carreras y ventaja apagadas, el hit que las remolcó se avisa como hit (igual que el servidor y la app)
        if (kinds.hits && after[`${side}Hits`] > before[`${side}Hits`]) return { kind: 'hits', side };
        return null;
    }
    if (!kinds.hits) return null;
    if (after.awayHits > before.awayHits) return { kind: 'hits', side: 'away' };
    if (after.homeHits > before.homeHits) return { kind: 'hits', side: 'home' };
    return null;
};
