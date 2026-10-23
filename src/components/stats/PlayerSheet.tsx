import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useLeague } from '../../store/LeagueContext';
import { BottomSheet } from '../ui/BottomSheet';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { TeamLogo } from '../ui/TeamLogo';
import { Segmented } from '../ui/Segmented';
import { ErrorState, Skeleton } from '../ui/States';
import { inkOn } from '../gamecast/GameHero';
import { localeFor, seasonLabel } from '../../lib/format';
import { gameLine, usePlayer, type CareerRow, type GameLogRow, type PlayerDetail } from '../../lib/stats';
import { battingAdvanced, eraPlus, fmtDec, fmtPct, fmtRate, leagueLineOf, opsPlus, pitchingAdvanced } from '../../lib/advanced';
import { useTeamStats } from '../../lib/teamStats';
import { Compare, Percentiles, Postseason, RecentPitches, Situations } from './PlayerExtras';
import { useIsPro } from '../../lib/pro';
import { ProBadge } from '../pro/ProBadge';

interface PlayerSheetProps {
    id: number;
    name: string;
    /** Para pintar la cabecera mientras llega la ficha */
    team?: { id: number | null; logo?: string | null; color?: string | null } | null;
    season?: number;
    onClose: () => void;
    /** Al abrir un juego del juego a juego (por defecto se cierra la ficha con onClose) */
    onOpenGame?: () => void;
    /** Botón extra (p. ej. «Agregar a mi equipo» desde el fantasy) */
    action?: React.ReactNode;
}

/** «16 oct» (las fechas del juego a juego vienen como día, sin hora) */
const shortDay = (day: string, lang: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' });

const FANTASY_GRADIENT = 'linear-gradient(135deg, #1e4fd8 0%, #6d28d9 55%, #e11d48 100%)';

// Ficha del pelotero: quién es, cómo va en el fantasy, su temporada, juego a juego y su carrera en la liga.
export const PlayerSheet: React.FC<PlayerSheetProps> = ({ id, name, team, season: initialSeason, onClose, onOpenGame, action }) => {
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    const [season, setSeason] = useState<number | undefined>(initialSeason);
    const query = usePlayer(id, activeLeague, season);
    const player = query.data;
    const color = player?.team?.color || team?.color || '#2563eb';
    const ink = inkOn(color);

    return (
        <BottomSheet open onClose={onClose} title={player?.name || name} tall>
            <div className="space-y-4 pb-4">
                {/* Cabecera en el color del equipo */}
                <section className="relative overflow-hidden rounded-[28px] p-4" style={{ backgroundColor: color, color: ink }}>
                    <div className="flex items-center gap-4">
                        <PlayerPhoto personId={id} name={player?.name || name} size={96} background="rgba(255,255,255,0.25)" team={player?.team ? { id: player.team.id, logo: player.team.logo, color: player.team.color } : team} />
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold opacity-85">
                                {[player?.number ? `#${player.number}` : null, player?.pos, player?.team?.abbrev].filter(Boolean).join(' · ') || ' '}
                            </p>
                            <h3 className="font-display text-[26px] font-extrabold leading-[1.05] [text-wrap:balance]">{player?.name || name}</h3>
                            <p className="mt-0.5 truncate text-sm font-semibold opacity-85">{player?.team?.name || ' '}</p>
                        </div>
                    </div>
                    {player && <Bio player={player} />}
                </section>

                {action}

                {query.isPending ? (
                    <div className="space-y-3">
                        <Skeleton className="h-32 rounded-card" />
                        <Skeleton className="h-40 rounded-card" />
                    </div>
                ) : query.isError && !player ? (
                    <ErrorState error={query.error as Error} onRetry={() => query.refetch()} />
                ) : player ? (
                    <>
                        {player.currentSeason > 0 && (
                            <Segmented<string>
                                size="sm"
                                label={t('statsPage.season', { season: '' })}
                                value={String(player.season)}
                                onChange={(value) => setSeason(Number(value))}
                                options={[player.currentSeason, player.currentSeason - 1, player.currentSeason - 2].map((year) => ({ value: String(year), label: seasonLabel(year, activeLeague) }))}
                            />
                        )}
                        <FantasyCard player={player} />
                        {player.g > 0 ? (
                            <>
                                <SeasonGrid player={player} />
                                <AdvancedGrid player={player} />
                                <Percentiles player={player} league={activeLeague} />
                                <Situations player={player} />
                                <Postseason player={player} />
                                <RecentPitches player={player} league={activeLeague} />
                                <Compare player={player} league={activeLeague} />
                            </>
                        ) : (
                            player.season > player.currentSeason - 2 && (
                                <button type="button" onClick={() => setSeason(player.season - 1)} className="h-11 w-full rounded-full bg-surface text-sm font-bold shadow-card">
                                    {t('statsPage.seePrevious', { season: seasonLabel(player.season - 1, activeLeague) })}
                                </button>
                            )
                        )}
                        <GameLog player={player} onOpen={onOpenGame ?? onClose} />
                        <Career player={player} />
                    </>
                ) : null}
            </div>
        </BottomSheet>
    );
};

// ---------------------------------------------------------------- piezas

const Bio: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const side = (code: string | null) => (code ? t(`statsPage.side.${code}`, { defaultValue: code }) : null);
    const chips = [
        player.bats && player.throws ? t('statsPage.batsThrows', { bats: side(player.bats), throws: side(player.throws) }) : null,
        player.age ? t('statsPage.age', { age: player.age }) : null,
        player.birthPlace ? t('statsPage.born', { place: player.birthPlace }) : null,
        player.height && player.weight ? `${player.height} · ${player.weight} lb` : null
    ].filter(Boolean) as string[];
    if (!chips.length) return null;
    return (
        <ul className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
                <li key={chip} className="rounded-full bg-black/15 px-2.5 py-1 text-[12px] font-semibold">
                    {chip}
                </li>
            ))}
        </ul>
    );
};

const FantasyCard: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    const recent = player.log.slice(0, 10).reverse();
    const max = Math.max(1, ...recent.map((game) => Math.abs(game.pts)));
    return (
        <section className="relative overflow-hidden rounded-card p-4 text-white shadow-float" style={{ background: FANTASY_GRADIENT }}>
            <Sparkles className="absolute -right-3 -top-3 h-20 w-20 opacity-15" aria-hidden="true" />
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-85">{t('statsPage.fantasyTitle', { season: seasonLabel(player.season, activeLeague) })}</p>
            <div className="mt-1 flex items-end gap-3">
                <span className="font-display text-[48px] font-extrabold leading-none tabular-nums">{player.pts}</span>
                <span className="pb-1 text-sm font-semibold opacity-90">{player.g ? t('statsPage.perGame', { ppg: player.ppg, count: player.g }) : t('statsPage.noGames')}</span>
            </div>
            {recent.length > 1 && (
                <div className="mt-4">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">{t('statsPage.lastGames')}</p>
                    <div className="flex h-16 items-end gap-1.5" role="img" aria-label={recent.map((game) => `${game.date}: ${game.pts}`).join(', ')}>
                        {recent.map((game) => (
                            <span key={game.gamePk} className="flex flex-1 flex-col items-center justify-end gap-1">
                                <span className="text-[10px] font-bold tabular-nums opacity-90">{game.pts}</span>
                                <span className={`w-full rounded-t-md ${game.pts < 0 ? 'bg-white/35' : 'bg-white/80'}`} style={{ height: `${Math.max(6, (Math.abs(game.pts) / max) * 40)}px` }} />
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
};

const Tile: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => (
    <div className={`rounded-2xl px-2 py-2.5 text-center ${strong ? 'bg-accent/10' : 'bg-raised'}`}>
        <p className={`font-display text-xl font-extrabold leading-none tabular-nums ${strong ? 'text-accent-ink' : ''}`}>{value}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
    </div>
);

const SeasonGrid: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const l = (key: string) => t(`statsPage.labels.${key}`);
    const h = player.hitting;
    const p = player.pitching;
    const tiles: [string, React.ReactNode, boolean?][] =
        player.role === 'P'
            ? p
                ? [
                      [l('era'), p.era, true],
                      [l('whip'), p.whip, true],
                      [l('ip'), p.ip],
                      [l('k'), p.k],
                      [l('wl'), `${p.w}-${p.l}`],
                      [l('sv'), p.sv],
                      [l('g'), p.g],
                      [l('gs'), p.gs],
                      [l('h'), p.h],
                      [l('bb'), p.bb],
                      [l('er'), p.er],
                      [l('hr'), p.hr]
                  ]
                : []
            : h
              ? [
                    [l('avg'), h.avg, true],
                    [l('ops'), h.ops, true],
                    [l('hr'), h.hr],
                    [l('rbi'), h.rbi],
                    [l('h'), h.h],
                    [l('r'), h.r],
                    [l('sb'), h.sb],
                    [l('bb'), h.bb],
                    [l('k'), h.k],
                    [l('d'), h.d],
                    [l('obp'), h.obp],
                    [l('g'), h.g]
                ]
              : [];
    return (
        <section aria-label={t('statsPage.seasonStats')}>
            <h4 className="eyebrow mb-2">{t('statsPage.seasonStats')}</h4>
            {tiles.length ? (
                <div className="grid grid-cols-4 gap-2">
                    {tiles.map(([label, value, strong]) => (
                        <Tile key={label} label={label} value={value} strong={strong} />
                    ))}
                </div>
            ) : (
                <p className="card px-4 py-5 text-center text-sm text-muted">{t('statsPage.noGames')}</p>
            )}
        </section>
    );
};

/** Modo PRO: métricas avanzadas de la temporada */
const AdvancedGrid: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const pro = useIsPro();
    const { activeLeague } = useLeague();
    // OPS+ y ERA+ contra la liga de esa temporada
    const teamStats = useTeamStats(activeLeague, player.season, pro);
    if (!pro) return null;
    const line = teamStats.data ? leagueLineOf(teamStats.data.teams) : null;
    const plus = (value: number | null) => (value === null ? '—' : String(value));
    const l = (key: string) => t(`pro.short.${key}`);
    let tiles: [string, string][] = [];
    if (player.role === 'P' && player.pitching) {
        const a = pitchingAdvanced(player.pitching);
        tiles = [
            [l('eraPlus'), plus(eraPlus(player.pitching, line))],
            [l('fip'), fmtDec(a.fip)],
            [l('k9'), fmtDec(a.k9)],
            [l('bb9'), fmtDec(a.bb9)],
            [l('kBb'), fmtDec(a.kBb)],
            [l('h9'), fmtDec(a.h9)],
            [l('hr9'), fmtDec(a.hr9)],
            [l('kPct'), fmtPct(a.kPct)]
        ];
    } else if (player.hitting) {
        const a = battingAdvanced(player.hitting);
        tiles = [
            [l('opsPlus'), plus(opsPlus(player.hitting, line))],
            [l('iso'), fmtRate(a.iso)],
            [l('babip'), fmtRate(a.babip)],
            [l('kPct'), fmtPct(a.kPct)],
            [l('bbPct'), fmtPct(a.bbPct)],
            [l('bbK'), fmtDec(a.bbK)],
            [l('abHr'), fmtDec(a.abHr, 1)],
            [l('xbh'), String(a.xbh)]
        ];
    }
    if (!tiles.length) return null;
    return (
        <section aria-label={t('pro.advanced')}>
            <h4 className="eyebrow mb-2 flex items-center gap-2">
                {t('pro.advanced')} <ProBadge />
            </h4>
            <div className="grid grid-cols-4 gap-2">
                {tiles.map(([label, value]) => (
                    <Tile key={label} label={label} value={value} />
                ))}
            </div>
        </section>
    );
};

const GameRow: React.FC<{ game: GameLogRow; role: 'B' | 'P'; onOpen: () => void }> = ({ game, role, onOpen }) => {
    const { t, i18n } = useTranslation();
    return (
        <li>
            <Link to={`/juego/${game.gamePk}`} onClick={onOpen} className="flex items-center gap-3 px-3 py-2.5" aria-label={t('statsPage.openGame', { date: shortDay(game.date, i18n.language) })}>
                <span className="w-12 shrink-0 text-xs font-bold text-muted">{shortDay(game.date, i18n.language)}</span>
                <span className="flex w-[72px] shrink-0 items-center gap-1.5">
                    <span className="text-[11px] font-bold text-muted">{game.isHome ? t('statsPage.vs') : t('statsPage.at')}</span>
                    {game.opponent && <TeamLogo team={{ ...game.opponent, name: game.opponent.abbrev }} size={22} />}
                    <span className="text-xs font-extrabold">{game.opponent?.abbrev}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{gameLine(game, role, t)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums ${game.pts > 0 ? 'bg-ball/15 text-ball' : game.pts < 0 ? 'bg-live/10 text-live' : 'bg-raised text-muted'}`}>{game.pts > 0 ? `+${game.pts}` : game.pts}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
            </Link>
        </li>
    );
};

const GameLog: React.FC<{ player: PlayerDetail; onOpen: () => void }> = ({ player, onOpen }) => {
    const { t } = useTranslation();
    const [all, setAll] = useState(false);
    if (!player.log.length) return null;
    const games = all ? player.log : player.log.slice(0, 8);
    return (
        <section aria-label={t('statsPage.gameLog')}>
            <h4 className="eyebrow mb-2">{t('statsPage.gameLog')}</h4>
            <ol className="card divide-y divide-line/10 overflow-hidden">
                {games.map((game) => (
                    <GameRow key={game.gamePk} game={game} role={player.role} onOpen={onOpen} />
                ))}
            </ol>
            {player.log.length > games.length && (
                <button type="button" onClick={() => setAll(true)} className="mt-2 h-10 w-full rounded-full bg-raised text-sm font-bold">
                    {t('statsPage.showMore', { count: player.log.length - games.length })}
                </button>
            )}
        </section>
    );
};

const rate3 = (value: number) => (Number.isFinite(value) ? value.toFixed(3).replace(/^0/, '') : '—');

/** Lo de todas sus temporadas en la liga (con más de una fila) */
const careerTotal = (player: PlayerDetail) => {
    if (player.career.length < 2) return null;
    if (player.role === 'P') {
        const sum = (key: 'g' | 'w' | 'l' | 'outs' | 'er' | 'k') => player.career.reduce((total, row) => total + (row.pitching?.[key] ?? 0), 0);
        const outs = sum('outs');
        return [sum('g'), `${sum('w')}-${sum('l')}`, outs ? ((sum('er') * 27) / outs).toFixed(2) : '—', `${Math.floor(outs / 3)}.${outs % 3}`, sum('k')];
    }
    const sum = (key: 'g' | 'ab' | 'h' | 'd' | 't' | 'hr' | 'rbi' | 'bb' | 'hbp') => player.career.reduce((total, row) => total + (row.hitting?.[key] ?? 0), 0);
    const sf = player.career.reduce((total, row) => total + (row.hitting?.sf ?? 0), 0);
    const ab = sum('ab');
    const h = sum('h');
    const tb = h + sum('d') + 2 * sum('t') + 3 * sum('hr');
    const obp = (h + sum('bb') + sum('hbp')) / (ab + sum('bb') + sum('hbp') + sf);
    return [sum('g'), rate3(h / ab), sum('hr'), sum('rbi'), rate3(obp + tb / ab)];
};

const Career: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    if (!player.career.length) return null;
    const l = (key: string) => t(`statsPage.labels.${key}`);
    const pitcher = player.role === 'P';
    const head = pitcher ? ['season', 'team', 'pts', 'g', 'wl', 'era', 'ip', 'k'] : ['season', 'team', 'pts', 'g', 'avg', 'hr', 'rbi', 'ops'];
    const cells = (row: CareerRow) =>
        pitcher
            ? [row.pitching?.g, `${row.pitching?.w ?? 0}-${row.pitching?.l ?? 0}`, row.pitching?.era, row.pitching?.ip, row.pitching?.k]
            : [row.hitting?.g, row.hitting?.avg, row.hitting?.hr, row.hitting?.rbi, row.hitting?.ops];
    return (
        <section aria-label={t('statsPage.career', { league: t(`leagues.${activeLeague}.name`) })}>
            <h4 className="eyebrow mb-2">{t('statsPage.career', { league: t(`leagues.${activeLeague}.name`) })}</h4>
            <div className="card overflow-x-auto">
                <table className="w-full whitespace-nowrap text-sm tabular-nums">
                    <thead>
                        <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-muted">
                            {head.map((key, index) => (
                                <th key={key} scope="col" className={`px-2.5 py-2 ${index > 1 ? 'text-right' : ''}`}>
                                    {l(key)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line/10">
                        {careerTotal(player) && (
                            <tr className="border-b-2 border-line/15 font-extrabold">
                                <td className="px-2.5 py-2">{t('playerMore.total')}</td>
                                <td className="px-2.5 py-2 text-muted">{t('playerMore.seasons', { count: new Set(player.career.map((row) => row.season)).size })}</td>
                                <td className="px-2.5 py-2 text-right text-accent-ink">{Math.round(player.career.reduce((sum, row) => sum + row.pts, 0) * 10) / 10}</td>
                                {careerTotal(player)!.map((value, index) => (
                                    <td key={index} className="px-2.5 py-2 text-right">
                                        {value}
                                    </td>
                                ))}
                            </tr>
                        )}
                        {player.career.map((row) => (
                            <tr key={`${row.season}-${row.team?.id}`} className={row.season === player.season ? 'bg-accent/5 font-bold' : ''}>
                                <td className="px-2.5 py-2 font-semibold">{seasonLabel(row.season, activeLeague)}</td>
                                <td className="px-2.5 py-2">
                                    <span className="flex items-center gap-1.5">
                                        {row.team && <TeamLogo team={{ ...row.team, name: row.team.abbrev }} size={18} />}
                                        {row.team?.abbrev}
                                    </span>
                                </td>
                                <td className="px-2.5 py-2 text-right font-extrabold text-accent-ink">{row.pts}</td>
                                {cells(row).map((value, index) => (
                                    <td key={index} className="px-2.5 py-2 text-right">
                                        {value ?? '—'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};
