// Pronósticos: quién gana cada juego (+puntos por acierto, de rules), cerrados al empezar cada juego. Un juego pospuesto
// no se puede pronosticar.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { TeamLogo } from '../ui/TeamLogo';
import { formatTime } from '../../lib/format';
import { accountEnabled } from '../../lib/account';
import { useFantasyOwners } from '../../lib/fans';
import { gameStarted, isPostponedGame, pickResult, rulesOf, setPick, type DayEntry, type FantasyDay, type FantasyGame } from '../../lib/fantasy';
import { HelpButton, StatusBadge, credits } from './fantasyUi';
import { SaveStatus } from './TeamTab';

export const PicksTab: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const started = day.games.some((game) => gameStarted(game));
    const owners = useFantasyOwners(day.league, day.date, accountEnabled() && started);
    const points = rulesOf(day).picks;
    return (
        <section className="space-y-2.5" aria-label={t('fantasy.picks')}>
            <div className="flex items-start justify-between gap-3">
                <p className="flex min-w-0 items-start gap-0.5 text-sm text-muted">
                    <span>{t('fantasy.picksHint', { pts: credits(points, i18n.language) })}</span>
                    <HelpButton topic="picks" className="-mt-1" />
                </p>
                <SaveStatus day={day} />
            </div>
            {day.games.map((game: FantasyGame) => {
                const pick = entry.picks[game.gamePk];
                const result = pickResult(game, entry);
                const postponed = isPostponedGame(game);
                // Se cierra a su hora aunque el servidor todavía diga «previa»
                const locked = gameStarted(game) || postponed;
                const split = owners.data?.picks[game.gamePk];
                return (
                    <div key={game.gamePk} className="card p-3">
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
                            {postponed ? (
                                <StatusBadge status="postponed" />
                            ) : (
                                <span>{game.state === 'preview' ? formatTime(game.date, i18n.language) : game.state === 'final' ? t('fantasy.final') : t('fantasy.liveNow')}</span>
                            )}
                            {result === 'win' && <span className="font-extrabold text-ball">+{credits(points, i18n.language)}</span>}
                            {result === 'loss' && <span className="font-extrabold text-live">0</span>}
                            {locked && !postponed && !pick && <span>{t('fantasy.noPick')}</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {[game.away, game.home].map((side) => {
                                const chosen = pick === side.id;
                                return (
                                    <button
                                        key={side.id}
                                        type="button"
                                        disabled={locked}
                                        onClick={() => setPick(day, game, side.id)}
                                        aria-pressed={chosen}
                                        className={`flex items-center gap-2 rounded-2xl p-2.5 text-left transition-colors ${chosen ? 'text-white' : 'bg-raised'} ${locked && !chosen ? 'opacity-60' : ''}`}
                                        style={chosen ? { backgroundColor: side.color } : undefined}
                                    >
                                        <TeamLogo team={side} size={32} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-extrabold">{side.abbrev}</span>
                                            {game.state !== 'preview' && !postponed && <span className="block text-xs font-bold opacity-80">{side.score ?? 0}</span>}
                                        </span>
                                        {locked && chosen && <Lock className="h-3.5 w-3.5 opacity-80" />}
                                    </button>
                                );
                            })}
                        </div>
                        {locked && split && (
                            <div className="mt-2">
                                <div className="flex h-1.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={t('fantasy.smart.picksSplit', { away: game.away.abbrev, a: split[game.away.id] ?? 0, home: game.home.abbrev, h: split[game.home.id] ?? 0 })}>
                                    <span style={{ width: `${split[game.away.id] ?? 0}%`, backgroundColor: game.away.color }} />
                                    <span style={{ width: `${split[game.home.id] ?? 0}%`, backgroundColor: game.home.color }} />
                                </div>
                                <p className="mt-1 flex justify-between text-[11px] font-semibold text-muted">
                                    <span>{t('fantasy.smart.picksPct', { pct: credits(split[game.away.id] ?? 0, i18n.language) })}</span>
                                    <span>{t('fantasy.smart.picksPct', { pct: credits(split[game.home.id] ?? 0, i18n.language) })}</span>
                                </p>
                            </div>
                        )}
                    </div>
                );
            })}
        </section>
    );
};
