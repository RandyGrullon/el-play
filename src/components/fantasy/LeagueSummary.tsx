// Una liga privada del Fantasy: su código para invitar, el campeón de la semana, la racha más larga, compartir el
// resumen del día y salir de la liga.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Flame, LogOut, Share2, Trophy } from 'lucide-react';
import type { LeagueId } from '../../types';
import { leaveLeague, type PrivateLeague } from '../../lib/account';
import { useSeasonRanking } from '../../lib/fans';
import { showToast } from '../../lib/toast';
import { fanLabel } from './FanProfile';

const round = (value: number) => Math.round(value * 10) / 10;

export const LeagueSummary: React.FC<{
    league: PrivateLeague;
    fantasyLeague: LeagueId;
    dayName: string;
    ownId: string;
    /** La tabla del día dentro de la liga (ya ordenada) */
    day: { userId: string; name: string | null; points: number }[];
    onLeft: () => void;
}> = ({ league, fantasyLeague, dayName, ownId, day, onLeft }) => {
    const { t } = useTranslation();
    const season = useSeasonRanking(fantasyLeague, league.members);
    const [leaving, setLeaving] = useState(false);
    const rows = season.data?.ranking ?? [];
    const champion = rows.filter((row) => (row.week ?? 0) > 0).sort((a, b) => (b.week ?? 0) - (a.week ?? 0))[0];
    const streaker = rows.filter((row) => (row.streak ?? 0) > 1).sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0))[0];
    const label = (userId: string, name: string | null | undefined) => fanLabel(t, name, userId === ownId);

    const copy = async (text: string, done: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(done);
        } catch {
            showToast(text, undefined, 8000);
        }
    };

    const share = async () => {
        const lines = day.slice(0, 10).map((row, index) => `${index + 1}. ${label(row.userId, row.name)} · ${round(row.points)}`);
        const text = [
            t('leagueSummary.shareTitle', { league: league.name, day: dayName }),
            ...lines,
            champion ? t('leagueSummary.shareChampion', { name: label(champion.userId, champion.name), pts: round(champion.week ?? 0) }) : null,
            t('leagueSummary.shareJoin', { code: league.code })
        ]
            .filter(Boolean)
            .join('\n');
        const url = `${window.location.origin}/fantasy`;
        try {
            if (navigator.share) await navigator.share({ title: league.name, text, url });
            else await copy(`${text}\n${url}`, t('leagueSummary.copied'));
        } catch {
            /* cerró la lista de apps */
        }
    };

    return (
        <section className="card space-y-3 p-4" aria-label={league.name}>
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold">{league.name}</p>
                    <p className="text-xs text-muted">{t('leagueSummary.members', { count: league.members.length })}</p>
                </div>
                <button type="button" onClick={() => copy(league.code, t('leagueSummary.codeCopied'))} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-raised px-3 font-mono text-sm font-extrabold tracking-widest" aria-label={t('leagueSummary.copyCode', { code: league.code })}>
                    {league.code}
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-gold/15 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gold">
                        <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {t('leagueSummary.week')}
                    </p>
                    <p className="mt-1 truncate font-extrabold">{champion ? label(champion.userId, champion.name) : '—'}</p>
                    {champion && <p className="text-xs font-semibold text-muted">{t('leagueSummary.pts', { pts: round(champion.week ?? 0) })}</p>}
                </div>
                <div className="rounded-2xl bg-live/10 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-live">
                        <Flame className="h-3.5 w-3.5" aria-hidden="true" /> {t('leagueSummary.streak')}
                    </p>
                    <p className="mt-1 truncate font-extrabold">{streaker ? label(streaker.userId, streaker.name) : '—'}</p>
                    {streaker && <p className="text-xs font-semibold text-muted">{t('leagueSummary.days', { count: streaker.streak })}</p>}
                </div>
            </div>

            <div className="flex gap-2">
                <button type="button" onClick={share} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-sm font-bold text-bg">
                    <Share2 className="h-4 w-4" /> {t('leagueSummary.share')}
                </button>
                {leaving ? (
                    <button
                        type="button"
                        onClick={async () => {
                            const ok = await leaveLeague(league.id).then(() => true).catch(() => false);
                            showToast(ok ? t('leagueSummary.left', { league: league.name }) : t('account.errors.unknown'));
                            setLeaving(false);
                            if (ok) onLeft();
                        }}
                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-live px-4 text-sm font-bold text-white"
                    >
                        {t('leagueSummary.confirmLeave')}
                    </button>
                ) : (
                    <button type="button" onClick={() => setLeaving(true)} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-raised px-4 text-sm font-bold" aria-label={t('leagueSummary.leave')}>
                        <LogOut className="h-4 w-4" />
                    </button>
                )}
            </div>
        </section>
    );
};
