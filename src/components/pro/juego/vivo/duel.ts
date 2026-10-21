// Datos del duelo bateador contra lanzador: todo de GameDetail (box del Lite) y de los extras PRO del juego.
import type { AtBat, BatterLine, GameDetail, PersonRef, PitcherLine } from '../../../../types';
import type { GamePro, ProBatter, ProPitcher, ProPlayer } from '../../../../lib/pro/juego';
import { paCode, paTone } from './logic';

type Team = GameDetail['away'];

export interface BatterSide {
    ref: PersonRef;
    side: string | null;
    team: Team;
    player: ProPlayer | null;
    /** Línea de hoy (box del Lite) */
    line: BatterLine | null;
    /** Box PRO: posición, número y temporada con hoy */
    box: ProBatter | null;
    /** Turnos de hoy ya terminados: código corto y tono */
    pas: { i: number; code: string | null; tone: 'hit' | 'walk' | 'out'; event: string | null }[];
}

export interface PitcherSide {
    ref: PersonRef;
    hand: string | null;
    team: Team;
    player: ProPlayer | null;
    line: PitcherLine | null;
    box: ProPitcher | null;
    /** Pitcheos y strikes de hoy contados del juego (llegan antes que el box) */
    pitches: number;
    strikes: number;
    /** Entrada en que entró */
    since: number | null;
}

const findBatter = (game: GameDetail, id: number) => [...game.box.away.batters, ...game.box.home.batters].find((row) => row.id === id) ?? null;
const findPitcher = (game: GameDetail, id: number) => [...game.box.away.pitchers, ...game.box.home.pitchers].find((row) => row.id === id) ?? null;
const findProBatter = (pro: GamePro | undefined, id: number) => (pro ? [...pro.box.away.batters, ...pro.box.home.batters].find((row) => row.id === id) ?? null : null);
const findProPitcher = (pro: GamePro | undefined, id: number) => (pro ? [...pro.box.away.pitchers, ...pro.box.home.pitchers].find((row) => row.id === id) ?? null : null);

export const batterSide = (game: GameDetail, pro: GamePro | undefined, ref: PersonRef & { side?: string | null }, team: Team, hbp: string): BatterSide => {
    const plays = new Map((pro?.plays ?? []).map((play) => [play.i, play]));
    const pas = game.atBats
        .filter((atBat) => atBat.batter.id === ref.id && atBat.complete)
        .map((atBat) => ({ i: atBat.i, code: paCode(atBat, plays.get(atBat.i), hbp), tone: paTone(atBat.event), event: atBat.event }));
    return {
        ref,
        side: ref.side ?? pro?.players?.[String(ref.id)]?.bats ?? null,
        team,
        player: pro?.players?.[String(ref.id)] ?? null,
        line: findBatter(game, ref.id),
        box: findProBatter(pro, ref.id),
        pas
    };
};

export const pitcherSide = (game: GameDetail, pro: GamePro | undefined, ref: PersonRef & { hand?: string | null }, team: Team): PitcherSide => {
    const atBats = game.atBats.filter((atBat: AtBat) => atBat.pitcher.id === ref.id);
    const pitches = atBats.flatMap((atBat) => atBat.pitches);
    return {
        ref,
        hand: ref.hand ?? pro?.players?.[String(ref.id)]?.throws ?? null,
        team,
        player: pro?.players?.[String(ref.id)] ?? null,
        line: findPitcher(game, ref.id),
        box: findProPitcher(pro, ref.id),
        pitches: pitches.length,
        strikes: pitches.filter((pitch) => pitch.r === 'strike' || pitch.r === 'inplay').length,
        since: atBats[0]?.inning ?? null
    };
};

/** Bateador en la cola (en espera, en el hoyo) con su línea de hoy */
export const queueLine = (game: GameDetail, id: number) => {
    const line = findBatter(game, id);
    return line ? { h: line.h, ab: line.ab } : null;
};
