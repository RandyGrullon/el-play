// Lo que viaja a la Live Activity (iPhone) y a la notificación fija (Android). Todo en texto ya armado:
// la vista corre aparte (directiva 'widget') y no puede importar nada ni formatear.

export interface LiveTeam {
    abbrev: string;
    name: string;
    /** Color del equipo (#RRGGBB) y el texto que se lee encima */
    color: string;
    ink: string;
    runs: string;
    /** PRO: el color del equipo aclarado para leerlo sobre negro (y oscurecido para fondo claro) */
    light: string;
    dark: string;
    /** PRO: logo ya descargado (file://…png en widgetsDirectory); vacío si no hay: va la sigla */
    logo: string;
    /** PRO: nombre corto («Tigres», «Leones»; el país en las selecciones) */
    short: string;
}

/** PRO: una jugada con su etiqueta («SENCILLO») y el tono de la etiqueta */
export interface LivePlay {
    label: string;
    text: string;
    /** hit · hr · out · k · walk · other (colores de la etiqueta) */
    tone: string;
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

    // ---------------------------------------------------------------- Solo PRO (en el Lite van vacíos)

    /** Modo PRO: la vista pinta logos, duelo, últimas jugadas y probabilidad de ganar */
    pro: boolean;
    /** «▲ 7.ª» (pantalla bloqueada) */
    inningMark: string;
    /** Quién va ganando: away · home · '' (empate) */
    leader: string;
    /** Rótulos: «Al bate», «Lanzando», «B:», «L:» */
    batterLabel: string;
    pitcherLabel: string;
    batterTag: string;
    pitcherTag: string;
    /** «E. Florial», «hoy 2-3», «Florial» */
    batterName: string;
    batterToday: string;
    batterLast: string;
    /** «I. Armstrong», «43 pitcheos», «Armstrong» */
    pitcherName: string;
    pitcherPitches: string;
    pitcherLast: string;
    /** Último pitcheo del turno: «95.3 mph Sinker · foul» */
    pitch: string;
    /** Apellido del corredor en cada base (vacío si no se sabe) */
    firstName: string;
    secondName: string;
    thirdName: string;
    /** Tono de la última jugada (lastLabel) */
    lastTone: string;
    /** Las 3 últimas jugadas, la más nueva primero */
    plays: LivePlay[];
    /** Probabilidad de ganar del visitante (0-100); -1 si no hay */
    wpAway: number;
    /** «LIC 99.9 %», «ESC 0.1 %» y el del que va arriba */
    wpAwayText: string;
    wpHomeText: string;
    wpLeadText: string;
    /** «Prob. de ganar» */
    wpLabel: string;
    /** Probabilidad del visitante turno a turno (0-100), muestreada: la gráfica de Android */
    wpSeries: number[];
    /** Para el lector de pantalla: «Licey 11, Escogido 1, alta de la 7.ª, 2 outs» */
    summary: string;
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

/** Un equipo cuyo logo hace falta en la actividad (id y URL del logo de MLB) */
export interface LogoTeam {
    id: number;
    logo: string;
}

/** Lo que cada sistema sabe hacer (iPhone: Live Activity; Android: notificación fija) */
export interface LiveSurface {
    /** ask: false = sin pedir permisos (cuando empieza sola para tu equipo) */
    start: (props: LiveGameProps, options?: { ask?: boolean }) => Promise<LiveStart>;
    /** false si ya no existe (el usuario la quitó o el sistema la terminó) */
    update: (id: string, props: LiveGameProps) => Promise<boolean>;
    /** Con props: final del juego (queda un rato con el marcador). Sin props: quitarla ya */
    end: (id: string, props: LiveGameProps | null) => Promise<void>;
    active: () => Promise<LiveHandle[]>;
    /** Android: «Dejar de seguir» desde la notificación con la app abierta */
    onStop: (listener: (id: string) => void) => () => void;
    /** PRO: baja los logos (PNG) a la carpeta que comparte con la actividad; devuelve id → file:// de los que hay */
    logos?: (teams: LogoTeam[]) => Promise<Record<number, string>>;
}
