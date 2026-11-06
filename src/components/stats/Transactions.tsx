// Movimientos de los equipos en los últimos 30 días: firmas, cambios, bajas y altas.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight } from 'lucide-react';
import type { LeagueId } from '../../types';
import { useTransactions } from '../../lib/stats';
import { formatShortDate } from '../../lib/format';
import { slot } from '../../lib/links';
import { TeamLogo } from '../ui/TeamLogo';
import { TeamLink } from '../ui/TeamLink';
import { PlayerLink } from '../ui/PlayerLink';
import { withNodes } from '../ui/TextLinks';

const KNOWN = new Set(['SFA', 'SGN', 'REL', 'TR', 'ASG', 'OPT', 'CU', 'SC', 'DES', 'OUT', 'CLW', 'RET', 'SU', 'NUM', 'LON']);
const PAGE = 8;

/** Cada pelotero abre su página (en `season` si es otra temporada) y cada equipo, la suya */
export const TransactionsCard: React.FC<{ league: LeagueId; teamId?: number; season?: number | null }> = ({ league, teamId, season }) => {
    const { t, i18n } = useTranslation();
    const query = useTransactions(league);
    const [limit, setLimit] = useState(PAGE);
    // En la página de un equipo, solo los suyos (los que llegan y los que se van)
    const list = (query.data?.transactions ?? []).filter((item) => !teamId || item.team.id === teamId || item.other?.id === teamId);
    if (!list.length) return null;
    const es = !i18n.language.startsWith('en');

    return (
        <section className="card p-4" aria-labelledby="transactions">
            <h2 id="transactions" className="eyebrow mb-3 flex items-center gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                {t('moves.title')}
            </h2>
            <ul className="divide-y divide-line/10">
                {list.slice(0, limit).map((item) => (
                    <li key={item.id} className="flex items-start gap-3 py-2.5">
                        <TeamLink id={item.team.id} decorative className="flex shrink-0">
                            <TeamLogo team={item.team} size={26} />
                        </TeamLink>
                        <div className="min-w-0 flex-1 text-sm">
                            <p className="font-semibold">
                                <span className="mr-1.5 rounded-md bg-raised px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">{t(`moves.type.${item.type && KNOWN.has(item.type) ? item.type : 'other'}`)}</span>
                                <PlayerLink id={item.person.id} season={season} className="font-bold">
                                    {item.person.name}
                                </PlayerLink>
                            </p>
                            <p className="truncate text-xs text-muted">
                                {item.other
                                    ? withNodes(t('moves.between', { from: slot('from'), to: slot('to') }), {
                                          from: <TeamLink id={item.other.id}>{item.other.abbrev}</TeamLink>,
                                          to: <TeamLink id={item.team.id}>{item.team.abbrev}</TeamLink>
                                      })
                                    : <TeamLink id={item.team.id}>{item.team.name}</TeamLink>}
                                {item.date ? ` · ${formatShortDate(`${item.date}T16:00:00Z`, i18n.language)}` : ''}
                            </p>
                            {/* El detalle viene en inglés: en español solo se muestra en inglés si no hay tipo conocido */}
                            {(!es || !item.type || !KNOWN.has(item.type)) && item.description && <p className="mt-0.5 text-xs text-faint">{item.description}</p>}
                        </div>
                    </li>
                ))}
            </ul>
            {list.length > limit && (
                <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="mt-2 h-10 w-full rounded-full bg-raised text-sm font-bold">
                    {t('moves.more', { count: list.length - limit })}
                </button>
            )}
        </section>
    );
};
