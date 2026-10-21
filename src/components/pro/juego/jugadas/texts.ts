// Textos armados de la jugada a jugada PRO (con i18n): nombre de cada media entrada, la línea corta de cada
// jugada, los chips de eventos, los retos ABS y el resumen de una media entrada cerrada (igual que la web).
import type { TFunction } from 'i18next';
import type { AtBat, GameDetail, PitcherLine } from '../../../../types';
import type { Base, Bases, Challenge, HalfInning, NameBook, PlayDetail, PlayEvent, PlayItem } from './model';
import { BASES, basesCount, lastOf, narrate } from './model';
import { eventName } from '../../../../lib/baseball';

type Game = Pick<GameDetail, 'away' | 'home' | 'state'>;

/** «1.ª» / «1st» */
export const ordinal = (n: number, lang: string) => {
    if (!lang.startsWith('en')) return `${n}.ª`;
    const tens = n % 100;
    const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
    return `${n}${suffix}`;
};

/** «5.º pitcheo» / «5th» (pitcheo es masculino en español) */
export const pitchOrdinal = (n: number, lang: string) => (lang.startsWith('en') ? ordinal(n, lang) : `${n}.º`);

/** Base en palabras cortas: «2.ª», «home» */
export const baseText = (t: TFunction, base: string | null | undefined) => (base ? t(`pro.jugadas.base.${base === 'score' ? 'score' : base}`, { defaultValue: base }) : '');

/** «▲ 1.ª · LIC 1 C, 1 H» (la flecha va aparte, decorativa) */
export const halfTitle = (t: TFunction, half: HalfInning, game: Game, lang: string) =>
    t('pro.jugadas.half.title', { inning: ordinal(half.inning, lang), team: game[half.side].abbrev, runs: half.runs, hits: half.hits });

/** Para el lector: «Alta de la 1.ª: LIC, 1 carrera y 1 hit» */
export const halfAria = (t: TFunction, half: HalfInning, game: Game, lang: string) =>
    t('pro.jugadas.half.aria', {
        half: t(half.top ? 'pro.jugadas.half.top' : 'pro.jugadas.half.bottom'),
        inning: ordinal(half.inning, lang),
        team: game[half.side].abbrev,
        runs: t('pro.jugadas.half.runs', { count: half.runs }),
        hits: t('pro.jugadas.half.hits', { count: half.hits })
    });

/** «87 turnos · 352 pitcheos» con singular y plural */
export const totalsText = (t: TFunction, plays: number, pitches: number) => t('pro.jugadas.totals', { plays: t('pro.jugadas.count.plays', { count: plays }), pitches: t('pro.jugadas.line.pitches', { count: pitches }) });

/** «vs Rhoades, Espada · 8 turnos» */
export const halfVs = (t: TFunction, half: HalfInning, names: NameBook) =>
    t('pro.jugadas.half.vs', { pitchers: half.pitchers.map((id) => names.label(id)).join(', '), count: half.plays.filter((item) => item.atBat.complete).length });

const pitchingChanges = (half: HalfInning) => half.plays.flatMap((item) => item.events.filter((event) => event.kind === 'pitching_change'));

/** Resumen de una media entrada cerrada: «1-2-3 de Medina con 6 pitcheos», «Rally de 3 C; entra Armstrong» */
export const halfSummary = (t: TFunction, half: HalfInning, names: NameBook, lang: string) => {
    const parts: string[] = [];
    const entering = pitchingChanges(half).map((event) => names.label(event.player));
    if (half.oneTwoThree) {
        if (entering.length) return `${t('pro.jugadas.summary.enters', { name: entering[0] })}; 1-2-3`;
        return t('pro.jugadas.summary.oneTwoThree', { pitcher: names.label(half.pitchers[0]), count: half.pitches });
    }
    if (half.runs >= 3) parts.push(t('pro.jugadas.summary.rally', { runs: half.runs }));
    else if (half.runs > 0) {
        const scoring = half.plays.filter((item) => item.scoring && item.atBat.complete);
        const best = scoring.reduce<PlayItem | null>((top, item) => (!top || item.atBat.rbi > top.atBat.rbi || (item.atBat.rbi === top.atBat.rbi && item.atBat.event === 'home_run') ? item : top), null);
        if (best) {
            const event = eventName(best.atBat, lang);
            const name = names.label(best.atBat.batter.id, best.atBat.batter.name);
            parts.push(best.atBat.rbi > 1 ? t('pro.jugadas.summary.rbi', { event, name, count: best.atBat.rbi }) : t('pro.jugadas.summary.play', { event, name }));
        }
    }
    if (entering.length) parts.push(t('pro.jugadas.summary.enters', { name: entering.join(', ') }));
    if (!half.runs && half.lob) parts.push(t('pro.jugadas.summary.stranded', { count: half.lob }));
    if (!parts.length) parts.push(t('pro.jugadas.summary.quiet'));
    const text = parts.slice(0, 2).join('; ');
    return text.charAt(0).toUpperCase() + text.slice(1);
};

const TRAJ = new Set(['ground_ball', 'fly_ball', 'line_drive', 'popup', 'bunt_grounder', 'bunt_popup']);

/** Lo que va después del nombre: «al lanzador», «cantado», «Lake out», «deja 3» */
export const detailText = (t: TFunction, detail: PlayDetail, item: PlayItem, names: NameBook, withTraj = false) => {
    if (!detail) return null;
    switch (detail.kind) {
        case 'lob':
            return t('pro.jugadas.detail.lob', { count: detail.count });
        case 'runnerOut':
            return t('pro.jugadas.detail.runnerOut', { name: names.label(detail.id) });
        case 'loaded':
            return t('pro.jugadas.detail.loaded');
        case 'advance':
            return t('pro.jugadas.detail.advance', { name: names.label(detail.id), base: baseText(t, detail.base) });
        case 'strikeout':
            return t(detail.called ? 'pro.jugadas.detail.called' : 'pro.jugadas.detail.swinging');
        case 'walk':
            return t('pro.jugadas.detail.walk', { count: detail.pitches });
        case 'reach':
            return t('pro.jugadas.detail.reach', { base: baseText(t, detail.base) });
        case 'direction': {
            const where = t(`pro.jugadas.detail.dir.${detail.pos}`);
            const traj = item.atBat.pitches[item.atBat.pitches.length - 1]?.hit?.traj;
            return withTraj && traj && TRAJ.has(traj) ? t('pro.jugadas.detail.trajDir', { traj: t(`pro.jugadas.detail.traj.${traj}`), where }) : where;
        }
    }
};

/** «; » después de nombre si el detalle es de otro pelotero (corredor), «, » si es del bateador */
export const detailJoiner = (detail: PlayDetail) => (detail && ['runnerOut', 'advance', 'lob', 'loaded'].includes(detail.kind) ? '; ' : ', ');

const runnersText = (t: TFunction, bases: Bases | null) => {
    if (!bases) return null;
    const count = basesCount(bases);
    if (count === 3) return t('pro.jugadas.bases.loaded');
    if (count === 0) return t('pro.jugadas.bases.empty');
    return t('pro.jugadas.bases.on', { count });
};

/** Lista de bases ocupadas: «1.ª y 2.ª» */
export const occupiedText = (t: TFunction, occupied: Base[]) => {
    const list = occupied.map((base) => baseText(t, base));
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} ${t('pro.jugadas.and')} ${list[list.length - 1]}` : list[0] ?? '';
};

/** Quién atrapó en el turno (para la bola pasada que no trae texto): el receptor que hizo el out o el de la descripción */
const catcherOf = (item: PlayItem, names: NameBook, desc: string) => {
    const fromDesc = desc.match(/by catcher ([^.]+?)\./i)?.[1];
    if (fromDesc) return lastOf(fromDesc);
    const credit = item.pro?.runners.flatMap((runner) => runner.credits ?? []).find((entry) => entry.pos === 2 && entry.id);
    return credit?.id ? names.label(credit.id) : null;
};

const pitcherOf = (item: PlayItem, names: NameBook, desc: string) => {
    const fromDesc = desc.match(/by pitcher ([^.]+?)\./i)?.[1];
    return fromDesc ? lastOf(fromDesc) : names.label(item.atBat.pitcher.id, item.atBat.pitcher.name);
};

/** Título y texto de un chip de evento: «Robo de base» · «González se roba la 3.ª (1)» */
export const eventText = (t: TFunction, event: PlayEvent, item: PlayItem, names: NameBook, game: Game, lang: string) => {
    const title = t(`pro.jugadas.event.${event.kind}`);
    const runner = event.runner ? names.label(event.runner.id) : names.label(event.player);
    const to = event.runner?.to ?? null;
    const parts: string[] = [];
    // Sin el corredor (sin los extras PRO y sin poder leerlo): la narración de MLB, o solo el título
    const told = () => {
        const text = narrate(event.desc, lang).replace(/\.\s*$/, '');
        if (text) parts.push(text);
    };
    switch (event.kind) {
        case 'stolen_base':
            if (!runner || !to) told();
            else parts.push(t(to === 'score' ? 'pro.jugadas.event.stealHome' : 'pro.jugadas.event.steal', { name: runner, base: baseText(t, to) }) + (event.count ? ` (${event.count})` : ''));
            break;
        case 'caught_stealing':
        case 'pickoff':
            if (!runner || !to) told();
            else parts.push(event.runner?.out ? t('pro.jugadas.event.outAt', { name: runner, base: baseText(t, to) }) : t('pro.jugadas.event.safeAt', { name: runner, base: baseText(t, to) }));
            break;
        case 'wild_pitch':
        case 'balk':
        case 'passed_ball': {
            const who = event.kind === 'passed_ball' ? catcherOf(item, names, event.desc) : pitcherOf(item, names, event.desc);
            if (who) parts.push(event.k === -1 ? t('pro.jugadas.event.onLastPitch', { name: who }) : who);
            if (event.runner && runner) parts.push(t(to === 'score' ? 'pro.jugadas.event.scores' : 'pro.jugadas.event.to', { name: runner, base: baseText(t, to) }));
            break;
        }
        case 'mound_visit': {
            const team = game[event.fielding].abbrev;
            const on = runnersText(t, event.bases);
            parts.push(on ? `${team}, ${on}` : team);
            break;
        }
        case 'pinch_hitter':
        case 'pinch_runner':
        case 'defense': {
            const name = names.label(event.player);
            const out = names.label(event.replaced);
            if (name && out) parts.push(t('pro.jugadas.event.for', { name, out }));
            else if (name) parts.push(name);
            else told();
            break;
        }
        default:
            told();
    }
    return { title, text: parts.filter(Boolean).join(' · ') };
};

/** Texto del reto ABS: «Francisco Mejía (LIC) · bola cantada en el 5.º pitcheo; pasó a strike 3» */
export const challengeText = (t: TFunction, challenge: Challenge, names: NameBook, game: Game, lang: string) => {
    const team = challenge.side ? game[challenge.side].abbrev : '';
    const name = names.full(challenge.player) || names.label(challenge.player);
    const original = challenge.original ? t(`pro.jugadas.abs.${challenge.original}`) : t('pro.jugadas.abs.call');
    let result = t('pro.jugadas.abs.kept');
    if (challenge.over && challenge.call === 'strike') result = t(challenge.strikeThree ? 'pro.jugadas.abs.toStrike3' : 'pro.jugadas.abs.toStrike');
    else if (challenge.over && challenge.call === 'ball') result = t(challenge.ballFour ? 'pro.jugadas.abs.toBall4' : 'pro.jugadas.abs.toBall');
    else if (challenge.over) result = t('pro.jugadas.abs.overturned');
    const pitch = pitchOrdinal(challenge.k + 1, lang);
    return {
        who: team ? t('pro.jugadas.abs.who', { name, team }) : name,
        what: t('pro.jugadas.abs.what', { call: original, pitch, result }),
        left: challenge.left !== null && team ? t('pro.jugadas.abs.left', { team, count: challenge.left }) : null
    };
};

/** «vs Rhoades · 2 pitcheos · conteo 0-1 · 1 out» */
export const playLine = (t: TFunction, atBat: AtBat, names: NameBook, count: { balls: number; strikes: number } | null) => {
    const parts = [t('pro.jugadas.line.vs', { pitcher: names.label(atBat.pitcher.id, atBat.pitcher.name) }), t('pro.jugadas.line.pitches', { count: atBat.pitches.length })];
    if (count && atBat.pitches.length > 1) parts.push(t('pro.jugadas.line.count', count));
    if (atBat.outs !== null) parts.push(t('pro.kit.game.outs', { count: atBat.outs }));
    return parts.join(' · ');
};

/** Bases ocupadas en orden */
export const occupied = (bases: Bases | null) => (bases ? BASES.filter((base) => bases[base] !== null) : []);

/** Línea del lanzador en el box: «2.1 IP · 6 H · 6 C (5 CL) · 1 BB · 2 K · 59 P» */
export const pitcherLineText = (t: TFunction, line: PitcherLine) => {
    const base = t(line.er !== line.r ? 'pro.jugadas.change.lineEr' : 'pro.jugadas.change.line', { ip: line.ip, h: line.h, r: line.r, er: line.er, bb: line.bb, k: line.k });
    return line.np !== null ? `${base} · ${t('pro.jugadas.change.pitches', { count: line.np })}` : base;
};
