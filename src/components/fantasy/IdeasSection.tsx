// «Ideas para hoy» (Fantasy v3) en Mi equipo: carruseles de peloteros del día que no se han cerrado (en racha, gangas,
// suben y bajan de precio, lanzadores con mejor duelo y los más elegidos ayer). Cada tarjeta tiene su foto, su estado,
// su rival, su precio, su proyección, sus últimos 5 y «Agregar» con la misma regla (y la misma razón) del selector.
// Se puede plegar (se acuerda en este navegador). Sin el servidor nuevo (404, 503 o error) no sale.
import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Lightbulb, Lock, Plus } from 'lucide-react';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { PlayerLink } from '../ui/PlayerLink';
import { TeamLink } from '../ui/TeamLink';
import { showToast } from '../../lib/toast';
import { isLocked, isPostponed, type DayEntry, type FantasyDay } from '../../lib/fantasy';
import { opponentOf, statusOf } from '../../lib/fantasyPicker';
import { addIdea, ideaState, trendLists, trendMetric, useFantasyTrends, type MatchupEdge, type TrendItem, type TrendList } from '../../lib/fantasyTrends';
import { Sparkline, reasonText } from './PlayerPicker';
import { StatusBadge, credits, useFantasyDemo, valueText } from './fantasyUi';

type T = (key: string, options?: Record<string, unknown>) => string;
const KEY = 'el-play-fantasy-ideas-closed';

const readClosed = () => {
    try {
        return localStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
};
const writeClosed = (closed: boolean) => {
    try {
        if (closed) localStorage.setItem(KEY, '1');
        else localStorage.removeItem(KEY);
    } catch {
        /* sin almacenamiento: vale mientras la app esté abierta */
    }
};

const EDGE_TONE: Record<MatchupEdge, string> = {
    good: 'bg-ball/15 text-ink',
    even: 'bg-raised text-muted',
    tough: 'bg-live/10 text-live'
};

/** El número de su lista: «Prom. 14», «1,45 pts/crédito», «Subió 1», «48 % lo eligió» o el chip del duelo */
const MetricChip: React.FC<{ list: TrendList; item: TrendItem }> = ({ list, item }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const metric = trendMetric(list, item);
    if (metric === null) return null;
    if (list === 'pitchers') {
        const edge = metric as MatchupEdge;
        return (
            <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${EDGE_TONE[edge] ?? EDGE_TONE.even}`} title={item.matchup?.oppOps ? t('fantasyIdeas.metric.oppOps', { ops: item.matchup.oppOps }) : undefined}>
                {t(`fantasyIdeas.edge.${edge}`)}
            </span>
        );
    }
    const value = metric as number;
    const text =
        list === 'hot'
            ? t('fantasyIdeas.metric.avg', { pts: credits(value, lang) })
            : list === 'bargains'
              ? t('fantasyIdeas.metric.value', { v: valueText(value, lang) })
              : list === 'popular'
                ? t('fantasyIdeas.metric.owned', { pct: credits(value, lang) })
                : t(value >= 0 ? 'fantasyIdeas.metric.up' : 'fantasyIdeas.metric.down', { delta: credits(Math.abs(value), lang) });
    const tone = list === 'risers' ? 'bg-ball/15 text-ink' : list === 'fallers' ? 'bg-live/10 text-live' : 'bg-accent/10 text-accent-ink';
    return <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${tone}`}>{text}</span>;
};

/** Por qué no se puede agregar una idea (lo mismo que el selector; «No juega hoy» si ya no está en el día) */
export const ideaReason = (t: T, lang: string, day: FantasyDay, entry: DayEntry, item: TrendItem, now = Date.now()) => {
    const state = ideaState(day, entry, item, now);
    if (!state.reason || state.reason === 'already') return null;
    if (state.reason === 'missing' || !state.player) return t('fantasyIdeas.notToday');
    return reasonText(t, lang, day, entry, state.player, state.reason);
};

const IdeaCard: React.FC<{ day: FantasyDay; entry: DayEntry; list: TrendList; item: TrendItem; now: number }> = ({ day, entry, list, item, now }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const reasonId = useId();
    const state = ideaState(day, entry, item, now);
    const player = state.player;
    const team = day.teams[player?.teamId ?? item.teamId];
    const status = player ? statusOf(day, player, now) : item.status ? (item.status === 'probable' && item.estimated ? 'rotation' : item.status) : null;
    const opp = player ? opponentOf(day, player) : item.opp ?? null;
    const price = player?.price ?? item.price;
    const proj = player?.proj ?? item.proj;
    const last5 = Array.isArray(item.last5) && item.last5.length ? item.last5 : Array.isArray(player?.last5) ? player!.last5! : [];
    const reason = ideaReason(t, lang, day, entry, item, now);
    const blocked = !!reason;
    const add = () => {
        const result = addIdea(day, entry, item);
        if (result.added) showToast(t('fantasyIdeas.added', { name: item.name }));
        else {
            const why = ideaReason(t, lang, day, entry, item);
            if (why) showToast(why);
        }
    };
    return (
        <li className="flex w-[172px] shrink-0 snap-start flex-col gap-2 rounded-[20px] bg-surface p-3 shadow-card">
            <div className="flex items-start gap-2">
                <PlayerLink id={item.id} decorative className="flex shrink-0">
                    <PlayerPhoto personId={item.id} name={item.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                </PlayerLink>
                <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-extrabold leading-tight">
                        <PlayerLink id={item.id}>{item.name}</PlayerLink>
                    </p>
                    <p className="truncate text-[11px] font-semibold text-muted">
                        <TeamLink id={team?.id}>{team?.abbrev}</TeamLink>
                        {opp ? (
                            <>
                                {` ${opp.home ? 'vs' : '@'} `}
                                <TeamLink id={opp.id}>{opp.abbrev}</TeamLink>
                            </>
                        ) : null}
                    </p>
                </div>
            </div>
            <div className="flex min-h-[18px] flex-wrap items-center gap-1">
                {status && status !== 'dnp' && <StatusBadge status={status} />}
                <MetricChip list={list} item={item} />
            </div>
            <div className="flex items-end justify-between gap-2">
                <div className="min-w-0 text-[11px] font-semibold leading-tight text-muted">
                    {price !== undefined && <span className="block font-extrabold text-ink tabular-nums">{t('fantasy.credits.price', { price: credits(price, lang) })}</span>}
                    {proj !== undefined && <span className="block text-accent-ink tabular-nums">{t('fantasy.smart.proj', { pts: credits(proj, lang) })}</span>}
                </div>
                {last5.length > 0 && <Sparkline values={last5} label={t('fantasyHelp.picker.last5', { list: last5.map((value) => credits(value, lang)).join(', ') })} />}
            </div>
            {reason && (
                <p id={reasonId} className={`text-[11px] font-bold leading-tight ${state.reason === 'budget' || state.reason === 'missing' ? 'text-live' : 'text-faint'}`}>
                    {reason}
                </p>
            )}
            {state.inTeam ? (
                <span className="mt-auto flex h-9 items-center justify-center gap-1.5 rounded-full bg-ball/15 text-xs font-extrabold">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {t('fantasyIdeas.inTeam')}
                </span>
            ) : (
                <button
                    type="button"
                    onClick={add}
                    disabled={blocked}
                    aria-label={t('fantasy.add', { name: item.name })}
                    aria-describedby={blocked ? reasonId : undefined}
                    className="mt-auto flex h-9 items-center justify-center gap-1.5 rounded-full bg-accent text-xs font-extrabold text-white disabled:bg-raised disabled:text-muted"
                >
                    {state.reason === 'locked' ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                    {t('fantasyIdeas.add')}
                </button>
            )}
        </li>
    );
};

const IdeaList: React.FC<{ day: FantasyDay; entry: DayEntry; list: TrendList; items: TrendItem[]; now: number }> = ({ day, entry, list, items, now }) => {
    const { t } = useTranslation();
    const titleId = useId();
    return (
        <div className="space-y-1.5">
            <div className="px-0.5">
                <h3 id={titleId} className="text-sm font-extrabold">
                    {t(`fantasyIdeas.lists.${list}`)}
                </h3>
                <p className="text-xs text-muted">{t(`fantasyIdeas.why.${list}`)}</p>
            </div>
            <ul className="snap-row -mx-4 px-4 pb-1" aria-labelledby={titleId}>
                {items.map((item) => (
                    <IdeaCard key={`${list}-${item.id}`} day={day} entry={entry} list={list} item={item} now={now} />
                ))}
            </ul>
        </div>
    );
};

export const IdeasSection: React.FC<{ day: FantasyDay; entry: DayEntry; now: number }> = ({ day, entry, now }) => {
    const { t } = useTranslation();
    const demo = useFantasyDemo();
    const bodyId = useId();
    const [open, setOpen] = useState(() => !readClosed());
    const anyOpen = day.players.some((player) => !isLocked(day, player, now) && !isPostponed(day, player));
    const query = useFantasyTrends(day, anyOpen, demo);
    // Una respuesta de otro día (la caché del servidor) no sirve
    const lists = useMemo(() => (query.data && (!query.data.date || query.data.date === day.date) ? trendLists(query.data) : []), [query.data, day.date]);
    if (!anyOpen || !lists.length) return null;
    const toggle = () =>
        setOpen((value) => {
            writeClosed(value);
            return !value;
        });
    return (
        <section className="card space-y-3 p-4" aria-label={t('fantasyIdeas.title')}>
            <h2>
                <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId} className="flex w-full items-center gap-2 text-left">
                    <Lightbulb className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                    <span className="eyebrow min-w-0 flex-1">{t('fantasyIdeas.title')}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
            </h2>
            <div id={bodyId} hidden={!open} className="space-y-4">
                <p className="text-xs text-muted">{t('fantasyIdeas.hint')}</p>
                {lists.map(({ key, items }) => (
                    <IdeaList key={key} day={day} entry={entry} list={key} items={items} now={now} />
                ))}
            </div>
        </section>
    );
};
