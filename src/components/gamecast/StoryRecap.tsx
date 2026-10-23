import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import type { Decision, GameDetail, TopPerformer } from '../../types';
import { keyPlayOf } from '../../lib/baseball';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { StrikeZone } from '../game/StrikeZone';
import { uniformColors } from '../game/BatterFigure';
import { inkOn } from './GameHero';

type Slide = 'key' | 'stars' | 'score' | 'decisions';

const shortName = (name: string) => (name.includes(',') ? name.split(',').reverse().join(' ').trim() : name);

// Resumen de un juego terminado como historia: jugada clave, figuras, marcador y decisiones.
// Se avanza tocando los lados (o con las flechas).
export const StoryRecap: React.FC<{ game: GameDetail; onSharePerformer: (performer: TopPerformer) => void }> = ({ game, onSharePerformer }) => {
    const { t, i18n } = useTranslation();
    const winner = game.home.isWinner ? game.home : game.away;
    const ink = inkOn(winner.color);
    const soft = ink === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(20,21,26,0.08)';
    const key = useMemo(() => keyPlayOf(game.atBats, i18n.language), [game.atBats, i18n.language]);
    const slides: Slide[] = [...(key ? (['key'] as const) : []), ...(game.topPerformers.length ? (['stars'] as const) : []), 'score', ...(game.decisions.winner ? (['decisions'] as const) : [])];
    const [index, setIndex] = useState(0);
    const slide = slides[Math.min(index, slides.length - 1)];
    const go = (step: number) => setIndex((current) => Math.max(0, Math.min(slides.length - 1, current + step)));
    // Un toque en el tercio izquierdo vuelve y en el derecho avanza (como las historias); los botones de adentro no
    const tapSide = (event: React.MouseEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest('button, a')) return;
        const box = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width;
        if (x < 1 / 3) go(-1);
        else if (x > 2 / 3) go(1);
    };

    const loser = winner === game.home ? game.away : game.home;
    const decision = (tag: string, person: Decision | null, extra: string, team: typeof winner) =>
        person && (
            <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: soft }}>
                <PlayerPhoto personId={person.id} name={person.name} size={48} background="rgba(255,255,255,0.85)" team={team} />
                <span className="flex-1">
                    <span className="block text-xs font-bold opacity-80">{tag}</span>
                    <span className="block font-extrabold">{person.name}</span>
                </span>
                <span className="text-sm font-bold tabular-nums opacity-90">{extra}</span>
            </li>
        );

    return (
        <section className="relative overflow-hidden rounded-card shadow-float" style={{ backgroundColor: winner.color, color: ink }} aria-roledescription={t('recap.story')} aria-label={t('recap.title')}>
            <div className="flex gap-1 px-4 pt-4" role="tablist" aria-label={t('recap.slides')}>
                {slides.map((item, position) => (
                    <button
                        key={item}
                        type="button"
                        role="tab"
                        aria-selected={position === index}
                        aria-label={t(`recap.${item}`)}
                        onClick={() => setIndex(position)}
                        className="h-1.5 flex-1 rounded-full"
                        style={{ background: position <= index ? ink : soft }}
                    />
                ))}
            </div>

            <div className="relative min-h-[460px] px-5 pb-20 pt-5" onClick={tapSide}>
                {slide === 'key' && key && (
                    <div className="animate-fade-up">
                        <span className="pill px-3 py-1.5 text-[13px]" style={{ background: soft }}>{t('share.keyPlay')}</span>
                        <h2 className="mt-3 text-[40px] font-extrabold leading-[1.02]">{key.headline}</h2>
                        <p className="mt-2 text-base font-semibold opacity-85">{key.detail}</p>
                        <div className="light-scope mt-4 rounded-3xl bg-white/90 p-3 text-[#14151a]">
                            <StrikeZone pitches={key.atBat.pitches} batterSide={key.atBat.batter.side} uniform={uniformColors(key.atBat.top ? game.away : game.home, !key.atBat.top)} showLegend={false} className="mx-auto max-w-[240px]" />
                        </div>
                    </div>
                )}

                {slide === 'stars' && (
                    <div className="animate-fade-up">
                        <span className="pill px-3 py-1.5 text-[13px]" style={{ background: soft }}>{t('summary.topPerformers')}</span>
                        <ul className="mt-4 flex flex-col gap-3">
                            {game.topPerformers.map((player) => (
                                <li key={`${player.kind}-${player.id}`} className="flex items-center gap-3 rounded-3xl px-3 py-3" style={{ background: soft }}>
                                    <PlayerPhoto personId={player.id} name={player.name} size={64} background="rgba(255,255,255,0.85)" team={player.teamId === game.home.id ? game.home : game.away} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-lg font-extrabold">{shortName(player.name)}</span>
                                        <span className="block text-sm font-semibold opacity-85">
                                            {player.kind === 'pitcher'
                                                ? `${player.ip} IP · ${player.k} K · ${player.er} ${t('stats.er')}`
                                                : [`${player.h}-${player.ab}`, player.hr ? `${player.hr} HR` : '', player.rbi ? `${player.rbi} ${t('stats.rbi')}` : ''].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <button type="button" onClick={() => onSharePerformer(player)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#14151a]" aria-label={t('share.sharePlayer', { name: shortName(player.name) })}>
                                        <Share2 className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {slide === 'score' && (
                    <div className="animate-fade-up">
                        <span className="pill px-3 py-1.5 text-[13px]" style={{ background: soft }}>{t('lineScore.title')}</span>
                        <div className="light-scope mt-4 overflow-x-auto rounded-3xl bg-white/90 p-3 text-[#14151a] scrollbar-none">
                            <table className="w-full min-w-[320px] text-center text-sm tabular-nums">
                                <caption className="sr-only">{t('lineScore.title')}</caption>
                                <thead>
                                    <tr className="text-xs text-[#6b6f7b]">
                                        <th scope="col" className="py-1 text-left" />
                                        {game.linescore.map((inning) => <th key={inning.n} scope="col">{inning.n}</th>)}
                                        <th scope="col" className="font-extrabold text-[#14151a]">{t('lineScore.runs')}</th>
                                        <th scope="col">{t('lineScore.hits')}</th>
                                        <th scope="col">{t('lineScore.errors')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(['away', 'home'] as const).map((side) => (
                                        <tr key={side} className="border-t border-black/5">
                                            <th scope="row" className="py-2 text-left font-extrabold">{game[side].abbrev}</th>
                                            {game.linescore.map((inning, position) => (
                                                <td key={inning.n}>{inning[side] ?? (side === 'home' && position === game.linescore.length - 1 ? 'x' : '')}</td>
                                            ))}
                                            <td className="text-base font-extrabold">{game[side].runs}</td>
                                            <td>{game[side].hits}</td>
                                            <td>{game[side].errors}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-4 text-[44px] font-extrabold leading-none">
                            {game.away.abbrev} {game.away.runs} · {game.home.abbrev} {game.home.runs}
                        </p>
                    </div>
                )}

                {slide === 'decisions' && (
                    <div className="animate-fade-up">
                        <span className="pill px-3 py-1.5 text-[13px]" style={{ background: soft }}>{t('summary.decisions')}</span>
                        <ul className="mt-4 flex flex-col gap-2.5">
                            {decision(t('recap.win'), game.decisions.winner, game.decisions.winner?.wins !== null ? `${game.decisions.winner?.wins}-${game.decisions.winner?.losses ?? 0} · ${game.decisions.winner?.era ?? ''}` : '', winner)}
                            {decision(t('recap.loss'), game.decisions.loser, game.decisions.loser?.wins !== null ? `${game.decisions.loser?.wins}-${game.decisions.loser?.losses ?? 0} · ${game.decisions.loser?.era ?? ''}` : '', loser)}
                            {decision(t('recap.save'), game.decisions.save, game.decisions.save?.saves !== null && game.decisions.save?.saves !== undefined ? t('summary.saves', { count: game.decisions.save.saves }) : '', winner)}
                        </ul>
                    </div>
                )}

                <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label={t('recap.previous')} className="absolute bottom-4 left-4 flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30" style={{ background: soft }}>
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => go(1)} disabled={index >= slides.length - 1} aria-label={t('recap.next')} className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30" style={{ background: soft }}>
                    <ChevronRight className="h-5 w-5" />
                </button>
            </div>
        </section>
    );
};
