// Comparar desde el botón flotante (no es una página aparte): se elige el rival y sale lado a lado, cada número con
// una barra partida en el color de cada uno (el mejor se lleva más barra y va en negrita).
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Search } from 'lucide-react';
import type { LeagueId, ScheduleGame, Standings } from '../../types';
import { BottomSheet } from '../ui/BottomSheet';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { TeamLogo } from '../ui/TeamLogo';
import { TeamLink } from '../ui/TeamLink';
import { PlayerLink } from '../ui/PlayerLink';
import { withNodes } from '../ui/TextLinks';
import { slot } from '../../lib/links';
import { inkOn } from '../gamecast/GameHero';
import { formatShortDate } from '../../lib/format';
import { normalize, usePlayers, type HittingLine, type PitchingLine, type PlayerDetail } from '../../lib/stats';
import { TEAM_SORTS, recordOf, type TeamRow } from '../../lib/teamStats';
import { headToHead, standingOf, type TeamResult } from '../../lib/team';
import { COMPARE_HITTING, COMPARE_PITCHING } from '../stats/PlayerExtras';

interface Side {
    name: string;
    color: string;
}

/** Cuánta barra le toca a cada uno: el mejor más (en lo que menos es mejor se invierte) */
export const compareShares = (a: number | null, b: number | null, higher: boolean): [number, number] | null => {
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    const [x, y] = higher ? [Math.abs(a), Math.abs(b)] : [Math.abs(b), Math.abs(a)];
    if (x + y === 0) return [50, 50];
    const left = Math.min(96, Math.max(4, (x / (x + y)) * 100));
    return [left, 100 - left];
};

const CompareRow: React.FC<{ label: string; a: number | null; b: number | null; show: (value: number) => string; higher: boolean; left: Side; right: Side }> = ({ label, a, b, show, higher, left, right }) => {
    const better = a === null || b === null || a === b ? null : (higher ? a > b : a < b) ? 'a' : 'b';
    const shares = compareShares(a, b, higher);
    return (
        <li className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-2 text-[15px] tabular-nums">
                <span className={better === 'a' ? 'font-extrabold' : 'font-semibold text-muted'}>{a === null ? '—' : show(a)}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
                <span className={better === 'b' ? 'font-extrabold' : 'font-semibold text-muted'}>{b === null ? '—' : show(b)}</span>
            </div>
            <div className="cmp-bar mt-1.5" aria-hidden="true">
                <span style={{ width: `${shares?.[0] ?? 50}%`, backgroundColor: left.color, opacity: shares ? (better === 'b' ? 0.45 : 1) : 0.25 }} />
                <span style={{ width: `${shares?.[1] ?? 50}%`, backgroundColor: right.color, opacity: shares ? (better === 'a' ? 0.45 : 1) : 0.25 }} />
            </div>
            <span className="sr-only">{better ? `${(better === 'a' ? left : right).name}` : ''}</span>
        </li>
    );
};

/** Cabecera de los dos lado a lado, cada mitad en su color */
const Faceoff: React.FC<{ left: React.ReactNode; right: React.ReactNode; leftColor: string; rightColor: string; onSwap?: () => void }> = ({ left, right, leftColor, rightColor, onSwap }) => {
    const { t } = useTranslation();
    return (
        <div className="relative grid grid-cols-2 overflow-hidden rounded-[24px] shadow-card">
            <div className="flex min-w-0 flex-col items-center gap-1.5 px-3 pb-4 pt-5 text-center" style={{ backgroundColor: leftColor, color: inkOn(leftColor) }}>
                {left}
            </div>
            <div className="flex min-w-0 flex-col items-center gap-1.5 px-3 pb-4 pt-5 text-center" style={{ backgroundColor: rightColor, color: inkOn(rightColor) }}>
                {right}
            </div>
            <span className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink font-display text-sm font-extrabold text-bg shadow-float">vs</span>
            {onSwap && (
                <button type="button" onClick={onSwap} className="absolute bottom-2 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1 rounded-full bg-black/25 px-3 text-xs font-bold text-white" aria-label={t('compare.change')}>
                    <ArrowLeftRight className="h-3.5 w-3.5" /> {t('compare.change')}
                </button>
            )}
        </div>
    );
};

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section aria-label={title}>
        <h3 className="eyebrow mb-2">{title}</h3>
        <ul className="card divide-y divide-line/10 overflow-hidden">{children}</ul>
    </section>
);

// ---------------------------------------------------------------- equipos

interface TeamCompareProps {
    team: TeamRow;
    teams: TeamRow[];
    standings?: Standings;
    /** Juegos del equipo de la página: de aquí sale cómo les ha ido entre ellos y cuándo se vuelven a ver */
    results: TeamResult[];
    games: ScheduleGame[];
    onClose: () => void;
}

export const TeamCompareSheet: React.FC<TeamCompareProps> = ({ team, teams, standings, results, games, onClose }) => {
    const { t, i18n } = useTranslation();
    const [otherId, setOtherId] = useState<number | null>(null);
    const other = teams.find((row) => row.id === otherId) ?? null;
    const rivals = teams.filter((row) => row.id !== team.id);
    const left: Side = { name: team.name, color: team.color };
    // Récord y carreras de las posiciones (lo oficial); si no están, de las estadísticas del equipo
    const recordFor = (row: TeamRow) => {
        const standing = standingOf(standings, row.id)?.row;
        const stats = recordOf(row);
        return standing ? { w: standing.wins, l: standing.losses, scored: standing.runsScored ?? stats.scored, allowed: standing.runsAllowed ?? stats.allowed } : stats;
    };

    if (!other) {
        return (
            <BottomSheet open onClose={onClose} title={t('compare.teamTitle', { team: team.abbrev })}>
                <p className="mb-3 text-sm text-muted">{t('compare.pickTeam')}</p>
                <ul className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3">
                    {rivals.map((row) => (
                        <li key={row.id}>
                            <button type="button" onClick={() => setOtherId(row.id)} className="flex w-full items-center gap-2.5 rounded-[20px] p-3 text-left shadow-card" style={{ backgroundColor: row.color, color: inkOn(row.color) }}>
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/90">
                                    <TeamLogo team={row} size={30} />
                                </span>
                                <span className="min-w-0">
                                    <span className="line-clamp-2 text-sm font-extrabold leading-tight">{row.name}</span>
                                    <span className="block text-xs font-bold opacity-80 tabular-nums">{t('statsPage.teamRecord', { w: recordFor(row).w, l: recordFor(row).l })}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </BottomSheet>
        );
    }

    const right: Side = { name: other.name, color: other.color };
    const a = recordFor(team);
    const b = recordFor(other);
    const pct = (w: number, l: number) => (w + l ? w / (w + l) : null);
    const lastTen = (id: number) => standingOf(standings, id)?.row.lastTen?.wins ?? null;
    const h2h = headToHead(results, other.id);
    const next = games.filter((game) => game.state !== 'final' && [game.away.id, game.home.id].includes(other.id)).sort((x, y) => x.date.localeCompare(y.date))[0];
    const rate3 = (value: number) => value.toFixed(3).replace(/^0(?=\.)/, '');
    const whole = (value: number) => String(Math.round(value));
    const label = (group: 'bat' | 'pitch', key: string) => t(`statsPage.teamSort.${group}.${key}`);
    // Los dos abren su página (y la hoja se cierra: la página del equipo sigue abierta debajo)
    const side = (row: TeamRow, record: { w: number; l: number }) => (
        <>
            <TeamLink id={row.id} decorative onClick={onClose} className="grid h-14 w-14 place-items-center rounded-full bg-white/90">
                <TeamLogo team={row} size={42} />
            </TeamLink>
            <TeamLink id={row.id} onClick={onClose} className="max-w-full truncate text-sm font-extrabold">
                {row.name}
            </TeamLink>
            <span className="font-display text-2xl font-extrabold tabular-nums">{record.w}-{record.l}</span>
        </>
    );

    return (
        <BottomSheet open onClose={onClose} title={t('compare.teamTitle', { team: team.abbrev })} tall>
            <div className="space-y-4 pb-2">
                <Faceoff
                    leftColor={team.color}
                    rightColor={other.color}
                    onSwap={() => setOtherId(null)}
                    left={side(team, a)}
                    right={side(other, b)}
                />

                {/* Entre ellos esta temporada y cuándo se vuelven a ver */}
                <div className="card px-4 py-3 text-sm">
                    <p className="eyebrow">{t('compare.headToHead')}</p>
                    {h2h ? (
                        <p className="mt-1 font-semibold">
                            <b className="font-display text-xl tabular-nums">
                                {withNodes(t('compare.h2hLine', { a: slot('a'), w: h2h.w, l: h2h.l, b: slot('b') }), {
                                    a: <TeamLink id={team.id} onClick={onClose}>{team.abbrev}</TeamLink>,
                                    b: <TeamLink id={other.id} onClick={onClose}>{other.abbrev}</TeamLink>
                                })}
                            </b>
                            <span className="ml-2 text-muted tabular-nums">{t('compare.h2hRuns', { rs: h2h.rs, ra: h2h.ra })}</span>
                        </p>
                    ) : (
                        <p className="mt-1 text-muted">{t('compare.h2hNone')}</p>
                    )}
                    {next && <p className="mt-1 text-xs font-semibold text-muted">{t('compare.nextMeeting', { date: formatShortDate(next.date, i18n.language) })}</p>}
                </div>

                <Group title={t('compare.season')}>
                    <CompareRow label={t('compare.winPct')} a={pct(a.w, a.l)} b={pct(b.w, b.l)} show={rate3} higher left={left} right={right} />
                    <CompareRow label={t('compare.runsFor')} a={a.scored} b={b.scored} show={whole} higher left={left} right={right} />
                    <CompareRow label={t('compare.runsAgainst')} a={a.allowed} b={b.allowed} show={whole} higher={false} left={left} right={right} />
                    {lastTen(team.id) !== null && lastTen(other.id) !== null && <CompareRow label={t('compare.lastTen')} a={lastTen(team.id)} b={lastTen(other.id)} show={whole} higher left={left} right={right} />}
                </Group>
                {(['bat', 'pitch'] as const).map((group) => (
                    <Group key={group} title={group === 'bat' ? t('statsPage.teamBat') : t('statsPage.teamPitch')}>
                        {TEAM_SORTS[group].map((sort) => (
                            <CompareRow key={sort.key} label={label(group, sort.key)} a={sort.value(team)} b={sort.value(other)} show={sort.show} higher={!sort.asc} left={left} right={right} />
                        ))}
                    </Group>
                ))}
            </div>
        </BottomSheet>
    );
};

// ---------------------------------------------------------------- peloteros

export const PlayerCompareSheet: React.FC<{ player: PlayerDetail; league: LeagueId; onClose: () => void }> = ({ player, league, onClose }) => {
    const { t } = useTranslation();
    const players = usePlayers(league, player.season);
    const [search, setSearch] = useState('');
    const [otherId, setOtherId] = useState<number | null>(null);
    const list = players.data?.players ?? [];
    const teams = players.data?.teams ?? {};
    const other = list.find((row) => row.id === otherId) ?? null;
    const pitcher = player.role === 'P';
    // Sin buscar: los de su misma posición que más puntos llevan
    const matches = useMemo(() => {
        const text = normalize(search.trim());
        return list
            .filter((row) => row.role === player.role && row.id !== player.id && (!text || normalize(row.name).includes(text)))
            .sort((a, b) => b.pts - a.pts)
            .slice(0, text ? 12 : 8);
    }, [list, search, player.role, player.id]);
    const myColor = player.team?.color || '#2563eb';

    if (!other) {
        return (
            <BottomSheet open onClose={onClose} title={t('compare.playerTitle', { name: player.name })} tall>
                <label className="flex h-12 items-center gap-2 rounded-2xl bg-raised px-3">
                    <Search className="h-4 w-4 text-muted" aria-hidden="true" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('compare.searchPlayer')} className="min-w-0 flex-1 bg-transparent text-base outline-none" autoFocus enterKeyHint="search" />
                </label>
                <p className="mb-1 mt-3 eyebrow">{search.trim() ? t('compare.results') : t(pitcher ? 'compare.suggestPitchers' : 'compare.suggestBatters')}</p>
                <ul className="divide-y divide-line/10 pb-2">
                    {matches.map((row) => {
                        const team = row.teamId ? teams[row.teamId] : undefined;
                        return (
                            <li key={row.id}>
                                <button type="button" onClick={() => setOtherId(row.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                                    <PlayerPhoto personId={row.id} name={row.name} size={40} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-bold">{row.name}</span>
                                        <span className="block text-xs text-muted">{[team?.abbrev, row.pos].filter(Boolean).join(' · ')}</span>
                                    </span>
                                    <span className="font-display text-lg font-extrabold tabular-nums text-accent-ink">{row.pts}</span>
                                </button>
                            </li>
                        );
                    })}
                    {!matches.length && <li className="py-6 text-center text-sm text-muted">{players.isPending ? t('compare.loading') : t('playerMore.compareNone')}</li>}
                </ul>
            </BottomSheet>
        );
    }

    const otherTeam = other.teamId ? teams[other.teamId] : undefined;
    // Si son del mismo equipo, el segundo va en gris para que se distingan
    const otherColor = otherTeam?.color && otherTeam.color.toLowerCase() !== myColor.toLowerCase() ? otherTeam.color : '#64748b';
    const left: Side = { name: player.name, color: myColor };
    const right: Side = { name: other.name, color: otherColor };
    const mine = pitcher ? player.pitching : player.hitting;
    const theirs = pitcher ? other.pitching : other.hitting;
    const metrics = pitcher ? COMPARE_PITCHING : COMPARE_HITTING;
    const valueOf = (metric: (typeof metrics)[number], line: HittingLine | PitchingLine | null) => (line ? (metric.value as (l: HittingLine & PitchingLine) => number | null)(line as HittingLine & PitchingLine) : null);
    // Los dos abren su página y su equipo, la del equipo (la hoja se cierra al irse)
    const face = (id: number, name: string, team: { id: number; logo: string; color: string; abbrev: string } | null | undefined, pos: string | null | undefined) => (
        <>
            <PlayerLink id={id} decorative onClick={onClose} className="flex shrink-0">
                <PlayerPhoto personId={id} name={name} size={64} background="rgba(255,255,255,0.3)" team={team ?? null} />
            </PlayerLink>
            <PlayerLink id={id} onClick={onClose} className="max-w-full truncate text-sm font-extrabold">
                {name}
            </PlayerLink>
            <span className="text-xs font-bold opacity-80">
                {team ? (
                    <>
                        <TeamLink id={team.id} onClick={onClose}>{team.abbrev}</TeamLink>
                        {pos ? ` · ${pos}` : ''}
                    </>
                ) : (
                    pos
                )}
            </span>
        </>
    );

    return (
        <BottomSheet open onClose={onClose} title={t('compare.playerTitle', { name: player.name })} tall>
            <div className="space-y-4 pb-2">
                <Faceoff
                    leftColor={myColor}
                    rightColor={otherColor}
                    onSwap={() => setOtherId(null)}
                    left={face(player.id, player.name, player.team, player.pos)}
                    right={face(other.id, other.name, otherTeam, other.pos)}
                />
                <Group title={t('compare.fantasy')}>
                    <CompareRow label={t('compare.points')} a={player.pts} b={other.pts} show={(value) => String(Math.round(value * 10) / 10)} higher left={left} right={right} />
                    <CompareRow label={t('compare.perGame')} a={player.ppg} b={other.ppg} show={(value) => value.toFixed(1)} higher left={left} right={right} />
                </Group>
                <Group title={pitcher ? t('statsPage.pitchers') : t('statsPage.batters')}>
                    {metrics.map((metric) => (
                        <CompareRow
                            key={metric.key}
                            label={t(`playerMore.metrics.${metric.key}`, { defaultValue: t(`statsPage.labels.${metric.key}`) })}
                            a={valueOf(metric, mine)}
                            b={valueOf(metric, theirs)}
                            show={metric.show}
                            higher={metric.higher}
                            left={left}
                            right={right}
                        />
                    ))}
                </Group>
            </div>
        </BottomSheet>
    );
};

