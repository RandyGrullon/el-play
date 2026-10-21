// Escenas de «Ver las animaciones en acción» (Más › Preferencias PRO) con las jugadas REALES de un juego terminado:
// se rehace el juego como si se estuviera viendo en vivo (una lectura antes y otra después de la jugada) y se sacan
// los eventos con la misma regla del juego en vivo (newPlayEvents con { pro: true }). Lógica pura (la misma de la web,
// el-play/src/components/pro/animaciones/showcase.ts). Lo que no pasó en ese juego no se inventa: la escena sale deshabilitada.
import type { AtBat, GameDetail } from '../../../types';
import { missedSummary, newPlayEvents, type MissedSummary, type PlayEvent, type PlayKind } from '../../../lib/playEvents';

export type SceneId =
    | 'hr'
    | 'double'
    | 'single'
    | 'out'
    | 'k'
    | 'run'
    | 'inning'
    | 'steal'
    | 'wildPitch'
    | 'walk'
    | 'error'
    | 'pitchingChange'
    | 'pinchHitter'
    | 'noHitter'
    | 'final'
    | 'missed';

export const SCENE_IDS: SceneId[] = ['hr', 'double', 'single', 'out', 'k', 'run', 'inning', 'steal', 'wildPitch', 'walk', 'error', 'pitchingChange', 'pinchHitter', 'noHitter', 'final', 'missed'];

/** Las que el Lite no anima */
export const NEW_SCENES: SceneId[] = ['run', 'steal', 'wildPitch', 'walk', 'error', 'pitchingChange', 'noHitter', 'missed'];

const HITS = ['single', 'double', 'triple', 'home_run'];

/** El juego como se vería en vivo con los primeros `count` turnos terminados (y, si se pide, el siguiente a medias) */
export const snapshotUpTo = (game: GameDetail, count: number, partial?: { actions: number } | null): GameDetail => {
    const done = game.atBats.slice(0, count);
    const atBats: AtBat[] = done.map((atBat) => ({ ...atBat, complete: true }));
    const next = game.atBats[count];
    if (partial && next) atBats.push({ ...next, complete: false, event: null, eventLabel: null, desc: '', rbi: 0, away: null, home: null, outs: null, pitches: [], actions: next.actions.slice(0, partial.actions) });
    const last = [...done].reverse().find((atBat) => atBat.away !== null && atBat.home !== null);
    const hits = (top: boolean) => done.filter((atBat) => atBat.top === top && HITS.includes(atBat.event ?? '')).length;
    const current = partial && next ? next : done[done.length - 1];
    return {
        ...game,
        state: 'live',
        atBats,
        currentAtBat: atBats.length ? atBats[atBats.length - 1].i : null,
        away: { ...game.away, runs: last?.away ?? 0, hits: hits(true), isWinner: false },
        home: { ...game.home, runs: last?.home ?? 0, hits: hits(false), isWinner: false },
        inning: current ? { n: current.inning, ordinal: '', isTop: current.top, state: current.top ? 'Top' : 'Bottom' } : null
    };
};

const pick = (events: PlayEvent[], kinds: PlayKind[]) => events.find((event) => kinds.includes(event.kind)) ?? null;

/** Evento del resultado del turno en la posición `index` */
const resultEvent = (game: GameDetail, index: number, kinds: PlayKind[]) => {
    const before = snapshotUpTo(game, index, { actions: game.atBats[index].actions.length });
    const after = snapshotUpTo(game, index + 1);
    // Al cerrar el turno sigue la misma media entrada (si no, el fin de entrada sale aparte)
    const atBat = game.atBats[index];
    after.inning = { n: atBat.inning, ordinal: '', isTop: atBat.top, state: atBat.top ? 'Top' : 'Bottom' };
    return pick(newPlayEvents(before, after, { pro: true }), kinds);
};

/** Evento de la acción `action` (robo, WP, cambio, emergente) dentro del turno en la posición `index` */
const actionEvent = (game: GameDetail, index: number, action: number, kinds: PlayKind[]) =>
    pick(newPlayEvents(snapshotUpTo(game, index, { actions: action }), snapshotUpTo(game, index, { actions: action + 1 }), { pro: true }), kinds);

const findResult = (game: GameDetail, test: (atBat: AtBat) => boolean) => game.atBats.findIndex((atBat) => atBat.complete && test(atBat));

const findAction = (game: GameDetail, test: (action: AtBat['actions'][number]) => boolean) => {
    for (let index = 0; index < game.atBats.length; index++) {
        const action = game.atBats[index].actions.findIndex(test);
        if (action >= 0) return { index, action };
    }
    return null;
};

/** Último turno de cada media entrada: dónde termina */
const halfEnds = (game: GameDetail) =>
    game.atBats
        .map((atBat, index) => ({ atBat, index }))
        .filter(({ atBat, index }) => {
            const next = game.atBats[index + 1];
            return next && (next.inning !== atBat.inning || next.top !== atBat.top);
        });

const hitDist = (atBat: AtBat) => [...atBat.pitches].reverse().find((pitch) => pitch.hit?.dist)?.hit?.dist ?? 0;

export interface Scene {
    id: SceneId;
    event: PlayEvent | null;
    /** «Te lo perdiste»: lo que pasó en los últimos turnos */
    missed?: MissedSummary | null;
}

/** Todas las escenas con la jugada real de este juego que le toca a cada una (null si no pasó) */
export const showcaseScenes = (game: GameDetail): Scene[] => {
    const result = (id: SceneId, test: (atBat: AtBat) => boolean, kinds: PlayKind[]): Scene => {
        const index = findResult(game, test);
        return { id, event: index >= 0 ? resultEvent(game, index, kinds) : null };
    };
    const action = (id: SceneId, test: (item: AtBat['actions'][number]) => boolean, kinds: PlayKind[]): Scene => {
        const found = findAction(game, test);
        return { id, event: found ? actionEvent(game, found.index, found.action, kinds) : null };
    };
    // Out: el elevado más largo (se ve mejor el vuelo); si no hay, el primero
    const outs = game.atBats.map((atBat, index) => ({ atBat, index })).filter(({ atBat }) => atBat.complete && atBat.event === 'field_out');
    const longOut = [...outs].sort((a, b) => hitDist(b.atBat) - hitDist(a.atBat))[0];
    // Fin de entrada: la del jonrón si hubo, si no la primera
    const ends = halfEnds(game);
    const hr = game.atBats.findIndex((atBat) => atBat.event === 'home_run');
    const end = ends.find(({ index }) => index >= hr) ?? ends[0];
    // Sin hit: una media entrada desde la 5.ª en que el equipo al bate no llevaba hits
    const noHit = ends.find(({ atBat, index }) => atBat.inning >= 5 && snapshotUpTo(game, index + 1)[atBat.top ? 'away' : 'home'].hits === 0);
    const halfEvent = (found: { atBat: AtBat; index: number } | undefined, kind: PlayKind) => {
        if (!found) return null;
        const before = snapshotUpTo(game, found.index, { actions: found.atBat.actions.length });
        const after = snapshotUpTo(game, found.index + 1);
        after.inning = { n: found.atBat.inning, ordinal: '', isTop: found.atBat.top, state: found.atBat.top ? 'Middle' : 'End' };
        return pick(newPlayEvents(before, after, { pro: true }), [kind]);
    };
    const finalEvent = () => {
        if (game.state !== 'final' || !game.atBats.length) return null;
        const count = game.atBats.length;
        const before = snapshotUpTo(game, count - 1, { actions: game.atBats[count - 1].actions.length });
        return pick(newPlayEvents(before, game, { pro: true }), ['win', 'champion']);
    };
    // «Te lo perdiste»: los últimos 6 turnos (como si se hubiera ido del juego un rato)
    const missedFrom = Math.max(0, game.atBats.length - 6);
    const missed = game.atBats.length > 1 ? missedSummary(snapshotUpTo(game, missedFrom), game.state === 'final' ? game : snapshotUpTo(game, game.atBats.length)) : null;

    return [
        result('hr', (atBat) => atBat.event === 'home_run', ['hr']),
        result('double', (atBat) => atBat.event === 'double', ['double']),
        result('single', (atBat) => atBat.event === 'single', ['single']),
        { id: 'out', event: longOut ? resultEvent(game, longOut.index, ['out']) : null },
        result('k', (atBat) => atBat.event === 'strikeout', ['k']),
        // Carrera: el primer hit (no jonrón) con el que entra carrera
        result('run', (atBat) => ['single', 'double', 'triple'].includes(atBat.event ?? '') && atBat.rbi > 0, ['single', 'double', 'triple']),
        { id: 'inning', event: halfEvent(end, 'inning') },
        action('steal', (item) => /^(stolen_base|caught_stealing)_/.test(item.event ?? ''), ['steal']),
        action('wildPitch', (item) => item.event === 'wild_pitch' || item.event === 'passed_ball', ['wildPitch']),
        result('walk', (atBat) => ['walk', 'intent_walk', 'hit_by_pitch'].includes(atBat.event ?? ''), ['walk']),
        result('error', (atBat) => atBat.event === 'field_error', ['error']),
        action('pitchingChange', (item) => item.event === 'pitching_substitution', ['pitchingChange']),
        action('pinchHitter', (item) => item.sub?.pos === 'PH' || item.sub?.pos === 'PR', ['pinchHitter', 'pinchRunner']),
        { id: 'noHitter', event: halfEvent(noHit, 'noHitter') },
        { id: 'final', event: finalEvent() },
        { id: 'missed', event: null, missed }
    ];
};

/** Batazos con su punto real (hit.x/y) de todos los que fueron en juego */
export const battedWithSpot = (game: GameDetail) => {
    const inPlay = game.atBats.flatMap((atBat) => atBat.pitches.filter((pitch) => pitch.r === 'inplay'));
    return { total: inPlay.length, withSpot: inPlay.filter((pitch) => pitch.hit && pitch.hit.x !== null && pitch.hit.x !== undefined && pitch.hit.y !== null && pitch.hit.y !== undefined).length };
};
