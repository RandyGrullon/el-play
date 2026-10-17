// Lo que viaja a la Live Activity (iPhone) y a la notificación fija (Android). Todo en texto ya armado:
// la vista corre aparte (directiva 'widget') y no puede importar nada ni formatear.

export interface LiveTeam {
    abbrev: string;
    name: string;
    /** Color del equipo (#RRGGBB) y el texto que se lee encima */
    color: string;
    ink: string;
    runs: string;
}

export interface LiveGameProps {
    gamePk: number;
    live: boolean;
    away: LiveTeam;
    home: LiveTeam;
    /** «Alta de la 7.ª», «Final», «Final/10» */
    inning: string;
    /** «▲ 7», «Mit 7», «F» */
    inningShort: string;
    /** Entre entradas no hay conteo ni corredores */
    between: boolean;
    outs: number;
    balls: number;
    strikes: number;
    first: boolean;
    second: boolean;
    third: boolean;
    /** «2-2»; vacío entre entradas */
    count: string;
    /** «2 outs» */
    outsText: string;
    /** «Al bate E. Florial · 2-3» */
    batter: string;
    /** «Lanza I. Armstrong · 43 lanz.» */
    pitcher: string;
    /** «ELEVADO DE OUT» y la jugada en una línea */
    lastLabel: string;
    lastText: string;
    /** «Actualizado 9:40 p. m.» */
    updated: string;
    /** Textos fijos en el idioma de la app */
    staleText: string;
    openText: string;
    stopText: string;
    stoppedText: string;
    /** Android: el botón «Dejar de seguir» de la notificación lo pone en true */
    stopped: boolean;
}

/** Una actividad o notificación viva: id del sistema y el juego */
export interface LiveHandle {
    id: string;
    gamePk: number | null;
    /** Android: el usuario tocó «Dejar de seguir» con la app cerrada */
    stopped: boolean;
    /** Android: ya muestra el marcador final (no es fija y se va sola en un rato) */
    final: boolean;
}

export type LiveStart = { ok: true; id: string } | { ok: false; reason: 'blocked' | 'error' };

/** Lo que cada sistema sabe hacer (iPhone: Live Activity; Android: notificación fija) */
export interface LiveSurface {
    start: (props: LiveGameProps) => Promise<LiveStart>;
    /** false si ya no existe (el usuario la quitó o el sistema la terminó) */
    update: (id: string, props: LiveGameProps) => Promise<boolean>;
    /** Con props: final del juego (queda un rato con el marcador). Sin props: quitarla ya */
    end: (id: string, props: LiveGameProps | null) => Promise<void>;
    active: () => Promise<LiveHandle[]>;
    /** Android: «Dejar de seguir» desde la notificación con la app abierta */
    onStop: (listener: (id: string) => void) => () => void;
}
