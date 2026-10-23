// Piezas del juego en vivo: el lanzador en el montículo con su cansancio, los detalles del juego, el aviso de datos
// detenidos y el juego sin hit.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Flame, Info } from 'lucide-react';
import type { GameDetail } from '../../types';
import { inkOn } from '../gamecast/GameHero';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { fatigueOf, hoursMinutes, noHitterOf, staleMinutes, umpireRole, velocityTrend, windText, type Fatigue } from '../../lib/liveGame';
import { stateName, weatherName, weatherTemp } from '../../lib/baseball';
import { formatTime } from '../../lib/format';
import { useNow } from '../../hooks/useNow';


const FATIGUE_TONE: Record<Fatigue, string> = {
    fresh: 'bg-ball',
    normal: 'bg-inplay',
    tired: 'bg-gold',
    limit: 'bg-live'
};

export const PitcherCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const pitcher = game.matchup?.pitcher;
    if (!pitcher?.id || !game.inning) return null;
    const side = game.inning.isTop ? 'home' : 'away';
    const team = game[side];
    const lines = game.box[side].pitchers;
    const line = lines.find((item) => item.id === pitcher.id);
    const starter = lines[0]?.id === pitcher.id;
    const pitches = line?.np ?? pitcher.pitches ?? 0;
    const fatigue = fatigueOf(pitches, starter);
    const trend = velocityTrend(game, pitcher.id);

    return (
        <section className="card p-4" aria-labelledby="pitcher-now">
            <div className="flex items-center gap-3">
                <PlayerPhoto personId={pitcher.id} name={pitcher.name} size={56} background={`${team.color}33`} team={team} />
                <div className="min-w-0 flex-1">
                    <h2 id="pitcher-now" className="eyebrow">
                        {t('pitcherNow.title')} · {team.abbrev}
                    </h2>
                    <p className="truncate text-lg font-extrabold leading-tight">{pitcher.name}</p>
                    <p className="text-xs text-muted">
                        {[pitcher.hand ? t(`game.throws${pitcher.hand}`, { defaultValue: pitcher.hand }) : null, t(starter ? 'pitcherNow.starter' : 'pitcherNow.reliever'), pitcher.era ? t('game.seasonEra', { era: pitcher.era }) : null].filter(Boolean).join(' · ')}
                    </p>
                </div>
            </div>

            {line && (
                <dl className="mt-3 grid grid-cols-6 gap-1 text-center">
                    {(
                        [
                            ['ip', line.ip],
                            ['h', line.h],
                            ['r', line.r],
                            ['bb', line.bb],
                            ['k', line.k],
                            ['pitches', line.np !== null ? `${line.np}${line.st !== null ? `-${line.st}` : ''}` : '—']
                        ] as const
                    ).map(([key, value]) => (
                        <div key={key} className={`rounded-lg bg-raised px-0.5 py-1.5 ${key === 'pitches' ? 'col-span-1' : ''}`}>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-faint">{t(`stats.${key}`)}</dt>
                            <dd className="num text-[15px] font-bold leading-tight">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            <div className="mt-3">
                <div className="flex items-center justify-between text-xs font-bold">
                    <span className="inline-flex items-center gap-1.5">
                        <Flame className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                        {t('pitcherNow.fatigue')}: {t(`pitcherNow.level.${fatigue.level}`)}
                    </span>
                    <span className="tabular-nums text-muted">{t('pitcherNow.pitches', { count: pitches })}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fatigue.share * 100)} aria-label={t('pitcherNow.fatigue')}>
                    <div className={`h-full rounded-full transition-[width] duration-500 ${FATIGUE_TONE[fatigue.level]}`} style={{ width: `${Math.max(4, fatigue.share * 100)}%` }} />
                </div>
                {trend && (
                    <p className="mt-2 text-xs text-muted">
                        {t('pitcherNow.velocity', { first: trend.first.toFixed(1), last: trend.last.toFixed(1) })}{' '}
                        <b className={trend.change <= -1.5 ? 'text-live' : 'text-ink'}>({trend.change > 0 ? '+' : ''}{trend.change.toFixed(1)})</b>
                    </p>
                )}
            </div>
        </section>
    );
};

export const GameDetails: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const now = useNow(60000);
    const info = game.info;
    const rows: { label: string; value: string }[] = [];
    if (game.venue) rows.push({ label: t('details.venue'), value: game.venue });
    if (game.weather) {
        const temp = weatherTemp(game.weather.temp, i18n.language);
        rows.push({ label: t('details.weather'), value: `${weatherName(game.weather.condition, i18n.language)}${temp ? ` · ${temp}` : ''}` });
    }
    const wind = windText(info?.wind, i18n.language);
    if (wind) rows.push({ label: t('details.wind'), value: wind });
    if (info?.firstPitch) rows.push({ label: t('details.firstPitch'), value: formatTime(info.firstPitch, i18n.language) });
    if (info?.durationMin) rows.push({ label: t('details.duration'), value: hoursMinutes(info.durationMin) });
    else if (game.state === 'live' && info?.firstPitch) {
        const elapsed = (now - Date.parse(info.firstPitch)) / 60000;
        if (elapsed > 0 && elapsed < 600) rows.push({ label: t('details.elapsed'), value: hoursMinutes(elapsed) });
    }
    if (/delay|suspend/i.test(game.detailedState)) rows.push({ label: t('details.status'), value: `${stateName(game.detailedState, i18n.language)}${game.reason ? ` · ${game.reason}` : ''}` });
    else if (info?.delayMin) rows.push({ label: t('details.delay'), value: t('details.minutes', { count: info.delayMin }) });
    if (info?.attendance) rows.push({ label: t('details.attendance'), value: info.attendance.toLocaleString(i18n.language.startsWith('en') ? 'en-US' : 'es-DO') });
    const umpires = info?.umpires ?? [];
    if (!rows.length && !umpires.length) return null;

    return (
        <section className="card p-4" aria-labelledby="game-details">
            <h2 id="game-details" className="eyebrow mb-3 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                {t('details.title')}
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                {rows.map((row) => (
                    <div key={row.label} className="min-w-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">{row.label}</dt>
                        <dd className="break-words font-semibold leading-snug">{row.value}</dd>
                    </div>
                ))}
            </dl>
            {umpires.length > 0 && (
                <div className="mt-3 border-t border-line/10 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{t('details.umpires')}</p>
                    <ul className="mt-1.5 grid gap-x-4 gap-y-1 text-sm min-[420px]:grid-cols-2">
                        {umpires.map((umpire) => (
                            <li key={`${umpire.type}-${umpire.name}`} className="min-w-0">
                                <span className="text-muted">{umpireRole(umpire.type, i18n.language)}:</span> <b className="font-semibold">{umpire.name}</b>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
};

/** Aviso cuando el juego en vivo lleva un rato sin pitcheos ni acciones nuevas (fuera de las pausas entre entradas) */
export const StaleNotice: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const now = useNow(30000);
    const minutes = staleMinutes(game, now);
    if (minutes === null) return null;
    return (
        <div className="flex items-start gap-2.5 rounded-2xl bg-gold/15 px-3.5 py-3 text-sm" role="status">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <p>
                <b>{t('stale.title', { count: minutes })}</b> <span className="text-muted">{t('stale.body')}</span>
            </p>
        </div>
    );
};

/** «Sin hit» en marcha (desde la 5.ª) o terminado; si nadie se ha embasado, juego perfecto */
export const NoHitterBanner: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const list = noHitterOf(game);
    if (!list.length) return null;
    return (
        <>
            {list.map((item) => (
                <div key={item.pitching.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: item.pitching.color, color: inkOn(item.pitching.color) }} role="status">
                    <span className="text-2xl" aria-hidden="true">
                        {item.perfect ? '💎' : '🔥'}
                    </span>
                    <p className="text-sm">
                        <b className="block text-base font-extrabold">{t(item.final ? (item.perfect ? 'noHitter.perfectDone' : 'noHitter.done') : item.perfect ? 'noHitter.perfect' : 'noHitter.live', { team: item.pitching.abbrev })}</b>
                        {t('noHitter.detail', { team: item.batting.abbrev, count: item.innings })}
                    </p>
                </div>
            ))}
        </>
    );
};
