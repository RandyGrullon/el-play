// Frases del final PRO armadas con datos reales (turno, corredores, marcador, probabilidad): nada se inventa,
// cada parte sale solo si el dato existe.
import type { TFunction } from 'i18next';
import type { AtBat, GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { eventName } from '../../../../lib/baseball';
import { inningLabel } from '../previa/logica';
import { leadChange, scoreBefore, scorersOf, situationBefore, type Side } from './logica';

/** Nombre de un pelotero del juego: el de MLB (gameData.players), el del box o el de los turnos del Lite */
export const nameOf = (game: GameDetail, pro: GamePro | undefined, id: number | null | undefined, fallback = '') => {
    if (!id) return fallback;
    const fromPro = pro?.players?.[String(id)]?.name;
    if (fromPro) return fromPro;
    for (const side of ['away', 'home'] as const) {
        const line = game.box[side].pitchers.find((item) => item.id === id) ?? game.box[side].batters.find((item) => item.id === id);
        if (line) return line.name;
    }
    for (const atBat of game.atBats) {
        if (atBat.batter.id === id) return atBat.batter.name;
        if (atBat.pitcher.id === id) return atBat.pitcher.name;
    }
    return fallback;
};

/** Lado de un pelotero del juego (por el box del Lite) */
export const sideOfPlayer = (game: GameDetail, pro: GamePro | undefined, id: number | null | undefined): Side | null => {
    if (!id) return null;
    const teamId = pro?.players?.[String(id)]?.teamId;
    if (teamId === game.away.id) return 'away';
    if (teamId === game.home.id) return 'home';
    for (const side of ['away', 'home'] as const) {
        if (game.box[side].pitchers.some((line) => line.id === id) || game.box[side].batters.some((line) => line.id === id)) return side;
    }
    return null;
};

/** «Sencillo de Francisco Mejía» (con `lower`, «sencillo de…» para dentro de una frase) */
export const headlineOf = (atBat: AtBat, t: TFunction, lang: string, lower = false) => {
    const event = eventName(atBat, lang) || t('pro.final.play.play');
    return t('pro.final.play.headline', { event: lower ? event.charAt(0).toLowerCase() + event.slice(1) : event, batter: atBat.batter.name });
};

/** Lista «A, B y C» */
export const joinNames = (names: string[], t: TFunction) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t('pro.final.and')} ${names[names.length - 1]}` : (names[0] ?? ''));

/** Corredores en base antes del turno: «corredores en 1.ª y 2.ª», «bases llenas», «bases limpias» */
export const basesText = (bases: { first: boolean; second: boolean; third: boolean } | null, t: TFunction) => {
    if (!bases) return null;
    const on = (['first', 'second', 'third'] as const).filter((base) => bases[base]);
    if (on.length === 0) return t('pro.final.bases.empty');
    if (on.length === 3) return t('pro.final.bases.loaded');
    return t(on.length === 1 ? 'pro.final.bases.one' : 'pro.final.bases.many', { list: joinNames(on.map((base) => t(`pro.final.bases.${base}`)), t) });
};

/** «anota Kevin Alcántara y LIC pasa al frente 2-1» */
export const resultText = (game: GameDetail, pro: GamePro | undefined, atBat: AtBat, t: TFunction) => {
    const batting: Side = atBat.top ? 'away' : 'home';
    const team = game[batting].abbrev;
    const scorers = scorersOf(pro?.plays.find((play) => play.i === atBat.i)).map((id) => nameOf(game, pro, id));
    const change = leadChange(scoreBefore(game.atBats, atBat.i), atBat, batting);
    const own = batting === 'away' ? atBat.away : atBat.home;
    const other = batting === 'away' ? atBat.home : atBat.away;
    const parts: string[] = [];
    if (scorers.length) parts.push(t(scorers.length === 1 ? 'pro.final.play.scores' : 'pro.final.play.scoreMany', { names: joinNames(scorers, t) }));
    if (change && own !== null && other !== null) parts.push(t(`pro.final.play.change.${change}`, { team, own, other }));
    return parts.join(parts.length > 1 ? ` ${t('pro.final.and')} ` : '');
};

/** «▲ 2.ª · 1 out · corredores en 1.ª y 2.ª» */
export const contextText = (game: GameDetail, pro: GamePro | undefined, atBat: AtBat, t: TFunction, lang: string) => {
    const situation = situationBefore(game.atBats, pro?.plays, atBat.i);
    return [inningLabel(atBat.inning, atBat.top, lang), situation ? t('pro.kit.game.outs', { count: situation.outs }) : null, basesText(situation?.bases ?? null, t)].filter(Boolean).join(' · ');
};
