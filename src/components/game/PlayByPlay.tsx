import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Play } from 'lucide-react';
import type { AtBat, GameDetail } from '../../types';
import { describePlay, eventName, eventTone, inningName, type EventTone } from '../../lib/baseball';
import { replayEventOf } from '../../lib/playEvents';
import { peopleOf, slot } from '../../lib/links';
import { Segmented } from '../ui/Segmented';
import { PlayerLink } from '../ui/PlayerLink';
import { TeamLink } from '../ui/TeamLink';
import { OVER_CARD } from '../ui/CardLink';
import { LinkedNames, withNodes } from '../ui/TextLinks';
import { StrikeZone } from './StrikeZone';
import { uniformColors } from './BatterFigure';
import { PitchList } from './PitchList';

const TONES: Record<EventTone, string> = {
    hr: 'bg-gold/15 text-gold',
    hit: 'bg-inplay/15 text-inplay',
    walk: 'bg-ball/15 text-ball',
    k: 'bg-strike/15 text-strike',
    out: 'bg-raised text-muted',
    other: 'bg-raised text-muted'
};

interface PlayByPlayProps {
    game: GameDetail;
    limit?: number;
    /** Solo los últimos turnos, sin filtro ni agrupación (tarjeta "Últimas jugadas") */
    compact?: boolean;
    /** Repetir la animación de una jugada terminada (sin esto, las filas no ofrecen repetir); `locked`: hay una saliendo o en la pausa */
    replay?: { locked: boolean; onReplay: (atBatIndex: number) => void };
}

export const PlayByPlay: React.FC<PlayByPlayProps> = ({ game, limit, compact = false, replay }) => {
    const { t, i18n } = useTranslation();
    const [filter, setFilter] = useState<'all' | 'scoring'>('all');
    const [open, setOpen] = useState<number | null>(null);
    const uid = useId();
    // Los nombres de las jugadas abren la página de cada pelotero
    const people = useMemo(() => peopleOf(game.atBats), [game.atBats]);
    // Los turnos cuyo resultado tiene animación (los mismos que salen en vivo) se pueden repetir
    const offersReplay = !!replay;
    const replayable = useMemo(
        () => new Set(offersReplay ? game.atBats.filter((atBat) => replayEventOf(game, atBat.i)).map((atBat) => atBat.i) : []),
        [game, offersReplay]
    );

    // Más reciente primero; el turno en curso solo si ya tiene pitcheos
    const plays = useMemo(() => {
        let list = game.atBats.filter((atBat) => atBat.complete || atBat.pitches.length > 0).slice().reverse();
        if (filter === 'scoring') list = list.filter((atBat) => atBat.scoring);
        return limit ? list.slice(0, limit) : list;
    }, [game.atBats, filter, limit]);

    const groups = useMemo(() => {
        const result: { key: string; label: string; plays: AtBat[] }[] = [];
        for (const atBat of plays) {
            const key = `${atBat.inning}-${atBat.top}`;
            const last = result[result.length - 1];
            if (last?.key === key) last.plays.push(atBat);
            else result.push({ key, label: inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language), plays: [atBat] });
        }
        return result;
    }, [plays, i18n.language]);

    const battingTeam = (atBat: AtBat) => (atBat.top ? game.away : game.home);

    const row = (atBat: AtBat) => {
        const expanded = open === atBat.i;
        const tone = eventTone(atBat.event);
        const team = battingTeam(atBat);
        const labelId = `${uid}-${atBat.i}`;
        const canReplay = !!replay && replayable.has(atBat.i);
        const person = (who: { id: number; name: string }) => (
            <PlayerLink id={who.id} className={OVER_CARD}>
                {who.name}
            </PlayerLink>
        );
        return (
            <li key={atBat.i} className="border-b border-line/10 last:border-0">
                {/* Toda la fila abre los pitcheos (el botón va por encima del contenido); los equipos y los peloteros que
                    nombra la jugada van encima del botón y abren su página */}
                <div className="relative isolate flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-raised/50">
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(expanded ? null : atBat.i);
                            if (canReplay) replay.onReplay(atBat.i);
                        }}
                        aria-expanded={expanded}
                        aria-labelledby={labelId}
                        className="absolute inset-0 z-[1] w-full"
                    />
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
                    <span id={labelId} className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${atBat.complete ? TONES[tone] : 'bg-live/10 text-live'}`}>
                                {atBat.complete ? eventName(atBat, i18n.language) : t('plays.inProgress')}
                            </span>
                            {atBat.scoring && atBat.away !== null && (
                                <span className="num text-xs font-semibold">
                                    <TeamLink id={game.away.id} className={OVER_CARD}>{game.away.abbrev}</TeamLink> {atBat.away} · <TeamLink id={game.home.id} className={OVER_CARD}>{game.home.abbrev}</TeamLink> {atBat.home}
                                </span>
                            )}
                            {compact && <span className="text-[11px] text-faint">{inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language, true)}</span>}
                        </span>
                        <span className="mt-1 block text-sm leading-snug">
                            {atBat.complete ? (
                                <LinkedNames text={describePlay(atBat.desc, i18n.language)} people={people} linkClassName={OVER_CARD} />
                            ) : (
                                withNodes(t('plays.atBatNow', { batter: slot('batter'), pitcher: slot('pitcher') }), { batter: person(atBat.batter), pitcher: person(atBat.pitcher) })
                            )}
                        </span>
                        {atBat.actions.length > 0 && (
                            <span className="mt-1 block text-xs text-muted">
                                <LinkedNames text={atBat.actions.map((action) => describePlay(action.desc, i18n.language)).join(' ')} people={people} linkClassName={OVER_CARD} />
                            </span>
                        )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-faint">
                        {atBat.pitches.length > 0 && t('plays.pitches', { count: atBat.pitches.length })}
                        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </span>
                    {/* Repetir la animación (también al tocar la fila); mientras sale una o en la pausa, apagado */}
                    {canReplay && (
                        <button
                            type="button"
                            onClick={() => replay.onReplay(atBat.i)}
                            aria-label={t('plays.replay')}
                            aria-describedby={labelId}
                            aria-disabled={replay.locked}
                            title={t('plays.replay')}
                            className={`relative z-[2] -my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raised text-ink transition-opacity ${replay.locked ? 'cursor-default opacity-40' : ''}`}
                        >
                            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        </button>
                    )}
                </div>
                {expanded && (
                    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:items-start">
                        <StrikeZone pitches={atBat.pitches} batterSide={atBat.batter.side} uniform={uniformColors(team, !atBat.top)} className="mx-auto w-full max-w-[280px]" />
                        <PitchList pitches={atBat.pitches} newestFirst={false} />
                    </div>
                )}
            </li>
        );
    };

    if (compact) {
        return <ul>{plays.map(row)}</ul>;
    }

    return (
        <section className="card overflow-hidden" aria-label={t('plays.title')}>
            <header className="flex items-center justify-between gap-2 border-b border-line/10 px-4 py-3">
                <h2 className="eyebrow">{t('plays.title')}</h2>
                <Segmented
                    size="sm"
                    label={t('plays.filter')}
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: t('plays.all') },
                        { value: 'scoring', label: t('plays.scoring') }
                    ]}
                />
            </header>
            {groups.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">{filter === 'scoring' ? t('plays.noScoring') : t('plays.none')}</p>
            ) : (
                groups.map((group) => (
                    <div key={group.key}>
                        <h3 className="sticky top-[var(--sticky-offset,0px)] z-[1] bg-raised/95 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted backdrop-blur">
                            {group.label}
                        </h3>
                        <ul>{group.plays.map(row)}</ul>
                    </div>
                ))
            )}
        </section>
    );
};
