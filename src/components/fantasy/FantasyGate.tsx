// Portada del Fantasy sin cuenta: cómo se juega (con las reglas del día), entrar, y quién va sumando hoy.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Crown, HelpCircle, Info, Radio, Sparkles, Trophy, Users } from 'lucide-react';
import { AccountCard } from '../account/AccountCard';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { TeamLogo } from '../ui/TeamLogo';
import { TeamLink } from '../ui/TeamLink';
import { CardLink, OVER_CARD } from '../ui/CardLink';
import { Skeleton } from '../ui/States';
import { formatTime } from '../../lib/format';
import { playerPath } from '../../lib/links';
import { withRanks } from '../../lib/fans';
import { helpRules, helpSteps } from '../../lib/fantasyHelp';
import { gameStarted, isPostponedGame, lineText, type FantasyDay } from '../../lib/fantasy';
import { StatusBadge, credits, useOpenHelp } from './fantasyUi';

const STEP_ICONS = { s1: Users, s2: Coins, s2NoCap: Coins, s3: Crown, s4: Trophy, s5: Radio };

export const FantasyGate: React.FC<{ day?: FantasyDay; loading: boolean }> = ({ day, loading }) => {
    const { t, i18n } = useTranslation();
    const openHelp = useOpenHelp();
    const rules = helpRules(day);
    const started = !!day?.games.some((game) => gameStarted(game));
    const top = withRanks(day && started ? day.players.filter((p) => p.played).sort((a, b) => b.points - a.points).slice(0, 5) : []);
    // Los mismos pasos de «Cómo se juega», con los números del día
    const steps = helpSteps(rules).slice(0, 4);

    return (
        <>
            <section className="relative overflow-hidden rounded-card p-5 text-white shadow-float" style={{ background: 'linear-gradient(135deg, #1e4fd8 0%, #6d28d9 55%, #e11d48 100%)' }}>
                <Sparkles className="absolute -right-4 -top-4 h-28 w-28 opacity-15" aria-hidden="true" />
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-85">{t('fantasy.gate.eyebrow')}</p>
                <h2 className="mt-1 max-w-[18ch] font-display text-[28px] font-extrabold leading-[1.1] [text-wrap:balance]">{t('fantasy.gate.title')}</h2>
                <p className="mt-2 max-w-[42ch] text-sm opacity-90">{t('fantasy.gate.lead')}</p>
                <ol className="mt-4 space-y-2.5">
                    {steps.map((step) => {
                        const Icon = STEP_ICONS[step.key];
                        const values = Object.fromEntries(Object.entries(step.values).map(([key, value]) => [key, key === 'count' ? value : credits(value, i18n.language)]));
                        return (
                            <li key={step.key} className="flex items-start gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="pt-1.5 text-sm font-semibold leading-snug">{t(`fantasyHelp.steps.${step.key}`, values)}</span>
                            </li>
                        );
                    })}
                </ol>
                {openHelp && (
                    <button type="button" onClick={() => openHelp()} className="mt-4 flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-[#1e4fd8]">
                        <HelpCircle className="h-4 w-4" aria-hidden="true" />
                        {t('fantasyHelp.open')}
                    </button>
                )}
            </section>

            <AccountCard purpose="fantasy" />

            {loading ? (
                <Skeleton className="h-40 rounded-card" />
            ) : top.length > 0 ? (
                <section aria-label={t('fantasy.gate.topToday')}>
                    <h2 className="eyebrow mb-2">{t('fantasy.gate.topToday')}</h2>
                    <ol className="card divide-y divide-line/10 overflow-hidden">
                        {top.map((player) => {
                            const team = day?.teams[player.teamId];
                            const line = lineText(player, t);
                            return (
                                // Toda la fila abre su página; la sigla, la de su equipo
                                <li key={player.id} className="relative isolate flex w-full items-center gap-3 px-3 py-2.5 text-left">
                                    <CardLink to={playerPath(player.id)} label={t('statsPage.viewPlayer', { name: player.name })} />
                                    <span className="w-5 text-center font-display text-lg font-extrabold text-muted">{player.rank}</span>
                                    <PlayerPhoto personId={player.id} name={player.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-extrabold">{player.name}</span>
                                        <span className="block truncate text-xs text-muted">
                                            <TeamLink id={team?.id} className={OVER_CARD}>
                                                {team?.abbrev}
                                            </TeamLink>{' '}
                                            · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')}
                                            {line ? ` · ${line}` : ''}
                                        </span>
                                    </span>
                                    <span className="font-display text-xl font-extrabold tabular-nums">{credits(player.points, i18n.language)}</span>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            ) : day && day.games.length > 0 ? (
                <section aria-label={t('fantasy.gate.playingToday')}>
                    <h2 className="eyebrow mb-2">{t('fantasy.gate.playingToday')}</h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {day.games.map((game) => (
                            <div key={game.gamePk} className="card flex items-center gap-2 p-3">
                                <TeamLink id={game.away.id} className="flex items-center gap-2">
                                    <TeamLogo team={game.away} size={30} />
                                    <span className="text-sm font-extrabold">{game.away.abbrev}</span>
                                </TeamLink>
                                <span className="flex flex-1 justify-center text-xs font-semibold text-muted">{isPostponedGame(game) ? <StatusBadge status="postponed" /> : formatTime(game.date, i18n.language)}</span>
                                <TeamLink id={game.home.id} className="flex items-center gap-2">
                                    <span className="text-sm font-extrabold">{game.home.abbrev}</span>
                                    <TeamLogo team={game.home} size={30} />
                                </TeamLink>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* La tabla de puntos vive en «Cómo se juega» */}
            {openHelp && (
                <button type="button" onClick={() => openHelp('points')} className="flex items-center gap-2 text-sm font-semibold text-accent-ink">
                    <Info className="h-4 w-4" aria-hidden="true" />
                    {t('fantasy.howPoints')}
                </button>
            )}
        </>
    );
};
