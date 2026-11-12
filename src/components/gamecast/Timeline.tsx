import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import type { AtBat, GameDetail, Pitch, PersonRef } from '../../types';
import { describePlay, eventName, eventTone, inningName, pitchCallName, pitchTypeName, type EventTone } from '../../lib/baseball';
import { timelineActions, type ActionKind } from '../../lib/liveGame';
import { peopleOf } from '../../lib/links';
import { replayActionOf, replayEventOf } from '../../lib/playEvents';
import { OVER_CARD } from '../ui/CardLink';
import { PlayerLink } from '../ui/PlayerLink';
import { TeamLink } from '../ui/TeamLink';
import { LinkedNames } from '../ui/TextLinks';

const TONES: Record<EventTone, string> = {
    hr: 'bg-gold/15 text-gold',
    hit: 'bg-inplay/15 text-inplay',
    walk: 'bg-ball/15 text-ball',
    k: 'bg-strike/15 text-strike',
    out: 'bg-raised text-muted',
    other: 'bg-raised text-muted'
};

const BUBBLE: Record<Pitch['r'], string> = {
    ball: 'bg-ball/15 text-ball',
    strike: 'bg-strike/15 text-strike',
    inplay: 'bg-inplay/15 text-inplay',
    hbp: 'bg-hbp/15 text-hbp'
};

const PitchBubble: React.FC<{ pitch: Pitch; last: boolean }> = ({ pitch, last }) => {
    const { t, i18n } = useTranslation();
    const kind = pitch.type || pitch.typeDesc ? ` · ${pitchTypeName(pitch, i18n.language)}` : '';
    const abs = pitch.abs ? ` · ${t(pitch.abs.inProgress ? 'zone.absChecking' : pitch.abs.overturned ? 'zone.absOverturned' : 'zone.absConfirmed')}` : '';
    const text = `${pitch.n ?? ''} · ${pitchCallName(pitch, i18n.language)}${kind}${pitch.mph ? ` ${pitch.mph.toFixed(1)}` : ''}${abs}`;
    const solid = { ball: 'bg-ball', strike: 'bg-strike', inplay: 'bg-inplay', hbp: 'bg-hbp' }[pitch.r];
    return <span className={`max-w-[85%] rounded-[18px] px-3.5 py-2 text-[13px] font-semibold ${last ? `${solid} rounded-br-md text-white` : BUBBLE[pitch.r]}`}>{text}</span>;
};

/** Tocar la jugada (o la acción) la repite; `locked`: hay una animación saliendo o corre la pausa entre repeticiones */
interface BubbleReplay {
    locked: boolean;
    onReplay: () => void;
}

/** El ▶ que dice que esa jugada se puede volver a ver (el toque lo recibe toda la burbuja) */
const ReplayMark: React.FC<{ locked: boolean; small?: boolean }> = ({ locked, small }) => (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full text-ink transition-opacity ${small ? 'h-5 w-5 bg-surface' : 'h-6 w-6 bg-raised'} ${locked ? 'opacity-40' : ''}`}>
        <Play className={`${small ? 'h-2.5 w-2.5' : 'h-3 w-3'} ml-px fill-current`} />
    </span>
);

/** Botón invisible que cubre toda la burbuja: los nombres y los equipos van por encima (OVER_CARD) y abren su página */
const ReplayCover: React.FC<{ replay: BubbleReplay; label: string; className: string }> = ({ replay, label, className }) => {
    const { t } = useTranslation();
    return <button type="button" onClick={replay.onReplay} aria-label={t('timeline.replayPlay', { play: label })} aria-disabled={replay.locked} className={`absolute inset-0 z-[1] w-full ${className}`} />;
};

const PlayBubble: React.FC<{ atBat: AtBat; game: GameDetail; people: PersonRef[]; replay: BubbleReplay | null }> = ({ atBat, game, people, replay }) => {
    const { i18n } = useTranslation();
    const team = atBat.top ? game.away : game.home;
    const name = eventName(atBat, i18n.language);
    const over = replay ? OVER_CARD : undefined;
    return (
        <div className={`relative isolate max-w-[88%] rounded-[22px] rounded-bl-md bg-surface px-4 py-3 shadow-card ${replay ? 'transition-colors hover:bg-raised/60' : ''}`}>
            {replay && <ReplayCover replay={replay} label={name} className="rounded-[22px] rounded-bl-md" />}
            <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`pill px-2 py-0.5 text-[11px] uppercase ${TONES[eventTone(atBat.event)]}`}>{name}</span>
                {atBat.scoring && atBat.away !== null && (
                    <span className="text-xs font-bold tabular-nums">
                        <TeamLink id={game.away.id} className={over}>{game.away.abbrev}</TeamLink> {atBat.away} · <TeamLink id={game.home.id} className={over}>{game.home.abbrev}</TeamLink> {atBat.home}
                    </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                    {replay && <ReplayMark locked={replay.locked} />}
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
                </span>
            </div>
            <p className="text-sm leading-snug">
                <LinkedNames text={describePlay(atBat.desc, i18n.language)} people={people} linkClassName={over} />
            </p>
        </div>
    );
};

const ACTION_TONE: Partial<Record<ActionKind, string>> = {
    steal: 'text-ball',
    caught: 'text-strike',
    pickoff: 'text-strike',
    wildPitch: 'text-gold',
    passedBall: 'text-gold',
    balk: 'text-gold',
    pitchingChange: 'text-accent-ink',
    injury: 'text-live',
    ejection: 'text-live'
};

/** Una acción del juego (robo, cambio de lanzador, visita al montículo…) como aviso pequeño en medio de la charla */
const ActionLine: React.FC<{ kind: ActionKind; desc: string; people: PersonRef[]; replay?: BubbleReplay | null }> = ({ kind, desc, people, replay }) => {
    const { t, i18n } = useTranslation();
    const label = t(`timeline.actions.${kind}`);
    const text = describePlay(desc, i18n.language);
    // «Visita al montículo. · Visita al montículo»: si la descripción no dice más que la etiqueta, va sola
    const same = text.replace(/[.\s]+$/, '').toLowerCase() === label.toLowerCase();
    return (
        <p className={`relative isolate max-w-[92%] self-center rounded-full bg-raised px-3 py-1.5 text-center text-xs text-muted ${replay ? 'flex items-center gap-1.5 hover:bg-raised/70' : ''}`}>
            {replay && <ReplayCover replay={replay} label={label} className="rounded-full" />}
            {replay && <ReplayMark locked={replay.locked} small />}
            <span>
                <b className={`font-extrabold uppercase tracking-wide ${ACTION_TONE[kind] ?? 'text-ink'}`}>{label}</b>
                {same ? null : (
                    <>
                        {' · '}
                        <LinkedNames text={text} people={people} linkClassName={replay ? OVER_CARD : undefined} />
                    </>
                )}
            </span>
        </p>
    );
};

/** Repetir desde la cronología: el turno (su `i`) y, si es una acción (robo, cambio de lanzador…), cuál dentro del turno */
export interface TimelineReplay {
    locked: boolean;
    onReplay: (atBatIndex: number, actionIndex?: number) => void;
}

// Cronología tipo chat: el turno de ahora con sus lanzamientos (el último resaltado) y debajo las jugadas
// anteriores, de la más reciente a la más vieja, con separadores por entrada. Con `replay`, tocar una jugada (o un
// robo, un cambio de lanzador, un emergente) repite su animación, la misma que salió en vivo.
export const Timeline: React.FC<{ game: GameDetail; limit?: number; onMore?: () => void; replay?: TimelineReplay }> = ({ game, limit = 12, onMore, replay }) => {
    const { t, i18n } = useTranslation();
    const current = game.state === 'live' ? game.atBats.find((atBat) => atBat.i === game.currentAtBat && !atBat.complete) : undefined;
    const past = game.atBats.filter((atBat) => atBat.complete).reverse();
    const shown = past.slice(0, limit);
    // Los nombres de las jugadas abren la página de cada pelotero
    const people = useMemo(() => peopleOf(game.atBats), [game.atBats]);
    // Lo que se puede repetir (lo que tiene animación) de lo que se ve
    const offersReplay = !!replay;
    const replayable = useMemo(() => {
        const atBats = new Set<number>();
        const actions = new Set<string>();
        if (!offersReplay) return { atBats, actions };
        for (const atBat of current ? [current, ...shown] : shown) {
            if (atBat.complete && replayEventOf(game, atBat.i)) atBats.add(atBat.i);
            atBat.actions.forEach((_action, index) => {
                if (replayActionOf(game, atBat.i, index)) actions.add(`${atBat.i}-${index}`);
            });
        }
        return { atBats, actions };
    }, [game, offersReplay, limit]); // eslint-disable-line react-hooks/exhaustive-deps
    const playReplay = (atBat: AtBat): BubbleReplay | null => (replay && replayable.atBats.has(atBat.i) ? { locked: replay.locked, onReplay: () => replay.onReplay(atBat.i) } : null);
    const actionReplay = (atBat: AtBat, index: number): BubbleReplay | null =>
        replay && replayable.actions.has(`${atBat.i}-${index}`) ? { locked: replay.locked, onReplay: () => replay.onReplay(atBat.i, index) } : null;
    const hint = replayable.atBats.size > 0 || replayable.actions.size > 0;

    let lastHalf = '';
    return (
        <section aria-label={t('plays.title')} className="flex flex-col gap-2.5">
            {current && (
                <>
                    <div className="max-w-[88%] rounded-[22px] rounded-bl-md bg-surface px-4 py-3 shadow-card">
                        <p className="text-sm">
                            {t('timeline.atBat')}{' '}
                            <b>
                                <PlayerLink id={current.batter.id}>{current.batter.name}</PlayerLink>
                            </b>{' '}
                            <span className="text-muted">{t('zone.facing')}</span>{' '}
                            <b>
                                <PlayerLink id={current.pitcher.id}>{current.pitcher.name}</PlayerLink>
                            </b>
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        {current.pitches.length === 0 && !timelineActions(current).length ? (
                            <span className="rounded-[18px] bg-raised px-3.5 py-2 text-[13px] font-semibold text-muted">{t('zone.waiting')}</span>
                        ) : (
                            // Los pitcheos con las acciones donde pasaron (un robo entre el 2.º y el 3.º, por ejemplo)
                            [...current.pitches.map((pitch, index) => ({ at: index, pitch, action: null })), ...timelineActions(current).map((action) => ({ at: (action.at ?? current.pitches.length) - 0.5, pitch: null, action }))]
                                .sort((a, b) => a.at - b.at)
                                .map((item, index) =>
                                    item.pitch ? (
                                        <PitchBubble key={`p${index}`} pitch={item.pitch} last={item.at === current.pitches.length - 1} />
                                    ) : (
                                        <ActionLine key={`a${index}`} kind={item.action!.kind!} desc={item.action!.desc} people={people} replay={actionReplay(current, item.action!.index)} />
                                    )
                                )
                        )}
                    </div>
                </>
            )}
            {hint && shown.length > 0 && (
                <p className="mt-1 flex items-center gap-1.5 self-center text-[11px] font-semibold text-faint">
                    <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                    {t('timeline.replayHint')}
                </p>
            )}
            {shown.map((atBat) => {
                const half = inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language);
                const separator = half !== lastHalf;
                lastHalf = half;
                return (
                    <React.Fragment key={atBat.i}>
                        {separator && <p className="mt-2 self-center text-xs font-bold text-muted">{half}</p>}
                        <PlayBubble atBat={atBat} game={game} people={people} replay={playReplay(atBat)} />
                        {/* De la más nueva a la más vieja: lo que pasó durante el turno va debajo de su resultado */}
                        {timelineActions(atBat)
                            .reverse()
                            .map((action) => (
                                <ActionLine key={action.index} kind={action.kind!} desc={action.desc} people={people} replay={actionReplay(atBat, action.index)} />
                            ))}
                    </React.Fragment>
                );
            })}
            {past.length === 0 && !current && <p className="py-6 text-center text-sm text-muted">{t('plays.none')}</p>}
            {past.length > limit && onMore && (
                <button type="button" onClick={onMore} className="mt-1 self-center rounded-full bg-surface px-4 py-2 text-sm font-bold shadow-card">
                    {t('timeline.more', { count: past.length - limit })}
                </button>
            )}
        </section>
    );
};
