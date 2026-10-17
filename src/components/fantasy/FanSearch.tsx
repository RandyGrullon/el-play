import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, UserX, X } from 'lucide-react';
import type { LeagueId } from '../../types';
import { ErrorState, OfflineState, Skeleton, waitingForNetwork } from '../ui/States';
import { formatTime, seasonLabel } from '../../lib/format';
import { useSession } from '../../lib/account';
import { MIN_SEARCH, SEASON_TOP, cleanSearch, useFanSearch, useSeasonRanking, withRanks, type SeasonRow } from '../../lib/fans';
import { FanAvatar, fanLabel } from './FanProfile';

const round = (value: number) => Math.round(value * 10) / 10;
const enough = (text: string) => Array.from(cleanSearch(text)).length >= MIN_SEARCH;

// ---------------------------------------------------------------- fila de un fanático

/** Abre el perfil; el nombre que ya se conoce sirve mientras carga */
export type OpenFan = (userId: string, name?: string | null) => void;

interface FanRowProps {
    userId: string;
    name: string | null;
    own: boolean;
    onOpen: OpenFan;
    rank?: number;
    points?: number;
    detail?: string;
}

/** Fila que abre el perfil: puesto, inicial, nombre (o «Tú») y puntos */
export const FanRow: React.FC<FanRowProps> = ({ userId, name, own, onOpen, rank, points, detail }) => {
    const { t } = useTranslation();
    const label = fanLabel(t, name, own);
    // El lector de pantalla oye todo lo de la fila, no solo el nombre
    const spoken = [own ? t('fantasy.fans.viewOwnProfile') : t('fantasy.fans.viewProfile', { name: label }), rank !== undefined ? `#${rank}` : null, points !== undefined ? `${round(points)} ${t('fantasy.fans.pts')}` : null, detail].filter(Boolean).join(', ');
    return (
        <button type="button" onClick={() => onOpen(userId, name)} className={`flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-raised/60 min-[360px]:gap-3 min-[360px]:px-4 ${own ? 'bg-accent/10' : ''}`} aria-label={spoken}>
            {rank !== undefined && <span className="w-6 shrink-0 text-center font-display text-lg font-extrabold text-muted">{rank}</span>}
            <FanAvatar name={name} size={36} />
            <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{label}</span>
                {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
            </span>
            {points !== undefined && <span className="font-display text-xl font-extrabold tabular-nums">{round(points)}</span>}
            {/* En 320 px el nombre necesita el espacio de la flecha */}
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-faint min-[360px]:block" aria-hidden="true" />
        </button>
    );
};

const RowsSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
    <div className="card divide-y divide-line/10 overflow-hidden" aria-busy="true">
        {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 flex-1 rounded-full" />
                <Skeleton className="h-5 w-10 rounded-full" />
            </div>
        ))}
    </div>
);

// ---------------------------------------------------------------- buscador

// Pestaña «Fanáticos»: buscar a otros por su nombre; sin texto, los que más suman en la temporada
export const FanSearch: React.FC<{ league: LeagueId; onOpen: OpenFan }> = ({ league, onOpen }) => {
    const { t } = useTranslation();
    const session = useSession();
    const inputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState('');
    const [q, setQ] = useState('');
    // Se busca cuando se deja de escribir 300 ms
    useEffect(() => {
        const timer = setTimeout(() => setQ(text), 300);
        return () => clearTimeout(timer);
    }, [text]);

    const search = useFanSearch(q);
    const season = useSeasonRanking(league);
    const ranked = useMemo(() => withRanks(season.data?.ranking ?? []), [season.data]);
    const byId = useMemo(() => new Map(ranked.map((row) => [row.userId, row])), [ranked]);
    // Con menos de 2 letras vuelven las sugerencias enseguida (sin esperar la pausa)
    const searching = enough(q) && enough(text);
    const settling = enough(text) && cleanSearch(text) !== cleanSearch(q);
    const results = search.data ?? [];

    // La tabla trae solo el top 200: quien no sale en una tabla llena puede tener puntos igual
    const detailOf = (userId: string) => {
        const row = byId.get(userId);
        if (row) return t('fantasy.fans.rankDetail', { rank: row.rank, count: row.days });
        return (season.data?.ranking.length ?? 0) >= SEASON_TOP ? t('fantasy.fans.outsideTop', { n: SEASON_TOP }) : t('fantasy.fans.noSeason');
    };

    return (
        <section className="space-y-3" aria-label={t('fantasy.fans.tab')}>
            <div className="space-y-1.5">
                <label className="flex h-12 items-center gap-2 rounded-2xl bg-surface px-4 shadow-card">
                    <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="sr-only">{t('fantasy.fans.search')}</span>
                    <input
                        ref={inputRef}
                        type="search"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder={t('fantasy.fans.search')}
                        enterKeyHint="search"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={40}
                        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none [&::-webkit-search-cancel-button]:hidden"
                    />
                    {text && (
                        <button
                            type="button"
                            onClick={() => {
                                // La X desaparece: el foco vuelve al buscador
                                setText('');
                                inputRef.current?.focus();
                            }}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-muted"
                            aria-label={t('fantasy.fans.clear')}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </label>
                {text.trim() && !enough(text) && <p className="px-1 text-xs font-semibold text-muted">{t('fantasy.fans.minChars', { n: MIN_SEARCH })}</p>}
            </div>

            {searching || settling ? (
                <div className="space-y-2">
                    <h2 className="eyebrow">{t('fantasy.fans.results')}</h2>
                    {waitingForNetwork(search) ? (
                        <OfflineState />
                    ) : settling || search.isPending ? (
                        <RowsSkeleton rows={3} />
                    ) : search.isError ? (
                        <ErrorState error={search.error} onRetry={() => search.refetch()} compact />
                    ) : results.length ? (
                        <ul className="card divide-y divide-line/10 overflow-hidden">
                            {results.map((fan) => (
                                <li key={fan.id}>
                                    <FanRow userId={fan.id} name={fan.name} own={fan.id === session?.user.id} onOpen={onOpen} detail={detailOf(fan.id)} />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="card flex flex-col items-center gap-2 px-6 py-8 text-center">
                            <UserX className="h-7 w-7 text-faint" aria-hidden="true" />
                            <p className="font-semibold [overflow-wrap:anywhere]">{t('fantasy.fans.noResults', { q: cleanSearch(q) })}</p>
                            <p className="text-sm text-muted">{t('fantasy.fans.noResultsHint')}</p>
                        </div>
                    )}
                    <p className="sr-only" aria-live="polite">
                        {searching && !settling && search.isSuccess ? t('fantasy.fans.resultsCount', { count: results.length }) : ''}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    <h2 className="eyebrow">{t('fantasy.fans.topSeason')}</h2>
                    <SeasonList query={season} rows={ranked.slice(0, 10)} ownId={session?.user.id} onOpen={onOpen} />
                </div>
            )}
        </section>
    );
};

// ---------------------------------------------------------------- tabla de la temporada

type SeasonQuery = ReturnType<typeof useSeasonRanking>;

const SeasonList: React.FC<{ query: SeasonQuery; rows: (SeasonRow & { rank: number })[]; ownId?: string; onOpen: OpenFan; empty?: string }> = ({ query, rows, ownId, onOpen, empty }) => {
    const { t } = useTranslation();
    if (waitingForNetwork(query)) return <OfflineState />;
    if (query.isPending) return <RowsSkeleton />;
    if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} compact />;
    if (!rows.length) return <p className="card px-4 py-6 text-center text-sm text-muted">{empty ?? t('fantasy.fans.emptySeason')}</p>;
    return (
        <ol className="card divide-y divide-line/10 overflow-hidden">
            {rows.map((row) => (
                <li key={row.userId}>
                    <FanRow userId={row.userId} name={row.name} own={row.userId === ownId} onOpen={onOpen} rank={row.rank} points={row.points} detail={t('fantasy.fans.days', { count: row.days })} />
                </li>
            ))}
        </ol>
    );
};

const PAGE = 50;

/** Tabla de la temporada (de todos o de los miembros de una liga privada, aunque no entren en el top 200) */
export const SeasonTable: React.FC<{ league: LeagueId; members?: string[]; onOpen: OpenFan }> = ({ league, members, onOpen }) => {
    const { t, i18n } = useTranslation();
    const session = useSession();
    const query = useSeasonRanking(league, members);
    const [limit, setLimit] = useState(PAGE);
    // Con `members` el servidor ya trae solo la liga: los puestos se cuentan dentro de ella
    const ranked = useMemo(() => withRanks(query.data?.ranking ?? []), [query.data]);
    useEffect(() => setLimit(PAGE), [members]);
    const mine = ranked.findIndex((row) => row.userId === session?.user.id);
    const data = query.data;

    return (
        <div className="space-y-2">
            {mine >= limit && (
                <p className="rounded-2xl bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent-ink">{t('fantasy.fans.yourRank', { rank: ranked[mine].rank, pts: round(ranked[mine].points) })}</p>
            )}
            <SeasonList query={query} rows={ranked.slice(0, limit)} ownId={session?.user.id} onOpen={onOpen} empty={members ? t('fantasy.fans.emptyLeague') : undefined} />
            {ranked.length > limit && (
                <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="h-11 w-full rounded-full bg-surface text-sm font-bold shadow-card">
                    {t('fantasy.fans.seeMore')}
                </button>
            )}
            {data && (
                <p className="px-1 text-xs text-muted">
                    {t('common.season', { season: seasonLabel(data.season, league) })} · {t('fantasy.fans.updated', { time: formatTime(data.updatedAt, i18n.language) })}
                    {data.partial ? ` · ${t('fantasy.fans.partial')}` : ''}
                </p>
            )}
        </div>
    );
};
