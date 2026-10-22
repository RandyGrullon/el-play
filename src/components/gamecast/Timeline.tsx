import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AtBat, GameDetail, Pitch } from '../../types';
import { describePlay, eventName, eventTone, inningName, pitchCallName, pitchTypeName, type EventTone } from '../../lib/baseball';

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

const PlayBubble: React.FC<{ atBat: AtBat; game: GameDetail }> = ({ atBat, game }) => {
    const { i18n } = useTranslation();
    const team = atBat.top ? game.away : game.home;
    return (
        <div className="max-w-[88%] rounded-[22px] rounded-bl-md bg-surface px-4 py-3 shadow-card">
            <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`pill px-2 py-0.5 text-[11px] uppercase ${TONES[eventTone(atBat.event)]}`}>{eventName(atBat, i18n.language)}</span>
                {atBat.scoring && atBat.away !== null && (
                    <span className="text-xs font-bold tabular-nums">
                        {game.away.abbrev} {atBat.away} · {game.home.abbrev} {atBat.home}
                    </span>
                )}
                <span className="ml-auto h-2 w-2 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
            </div>
            <p className="text-sm leading-snug">{describePlay(atBat.desc, i18n.language)}</p>
        </div>
    );
};

// Cronología tipo chat: el turno de ahora con sus lanzamientos (el último resaltado) y debajo las jugadas
// anteriores, de la más reciente a la más vieja, con separadores por entrada.
export const Timeline: React.FC<{ game: GameDetail; limit?: number; onMore?: () => void }> = ({ game, limit = 12, onMore }) => {
    const { t, i18n } = useTranslation();
    const current = game.state === 'live' ? game.atBats.find((atBat) => atBat.i === game.currentAtBat && !atBat.complete) : undefined;
    const past = game.atBats.filter((atBat) => atBat.complete).reverse();
    const shown = past.slice(0, limit);

    let lastHalf = '';
    return (
        <section aria-label={t('plays.title')} className="flex flex-col gap-2.5">
            {current && (
                <>
                    <div className="max-w-[88%] rounded-[22px] rounded-bl-md bg-surface px-4 py-3 shadow-card">
                        <p className="text-sm">
                            {t('timeline.atBat')} <b>{current.batter.name}</b> <span className="text-muted">{t('zone.facing')}</span> <b>{current.pitcher.name}</b>
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        {current.pitches.length === 0 ? (
                            <span className="rounded-[18px] bg-raised px-3.5 py-2 text-[13px] font-semibold text-muted">{t('zone.waiting')}</span>
                        ) : (
                            current.pitches.map((pitch, index) => <PitchBubble key={index} pitch={pitch} last={index === current.pitches.length - 1} />)
                        )}
                    </div>
                </>
            )}
            {shown.map((atBat) => {
                const half = inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language);
                const separator = half !== lastHalf;
                lastHalf = half;
                return (
                    <React.Fragment key={atBat.i}>
                        {separator && <p className="mt-2 self-center text-xs font-bold text-muted">{half}</p>}
                        <PlayBubble atBat={atBat} game={game} />
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
