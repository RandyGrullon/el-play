import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduleGame, ScheduleTeam } from '../../types';
import { teamDisplayName } from '../../lib/teams';
import { TeamLogo } from '../ui/TeamLogo';

type Status = 'live' | 'final' | 'later' | 'none';

const RING: Record<Status, string> = {
    live: 'rgb(var(--live))',
    final: 'rgb(var(--faint) / 0.6)',
    later: 'rgb(var(--accent))',
    none: 'transparent'
};

interface TeamStoriesProps {
    /** Todos los juegos cargados (para conocer los equipos de la liga) */
    allGames: ScheduleGame[];
    /** Juegos del día elegido (para el anillo de cada equipo) */
    dayGames: ScheduleGame[];
    selected: number | null;
    onSelect: (teamId: number | null) => void;
}

// Fila de "historias": un círculo por equipo; el anillo dice si juega en vivo, ya terminó o juega más tarde.
// Tocar uno filtra el feed a sus juegos.
export const TeamStories: React.FC<TeamStoriesProps> = ({ allGames, dayGames, selected, onSelect }) => {
    const { t, i18n } = useTranslation();
    const teams = new Map<number, ScheduleTeam>();
    for (const game of allGames) {
        teams.set(game.away.id, game.away);
        teams.set(game.home.id, game.home);
    }
    const status = (teamId: number): Status => {
        const game = dayGames.find((item) => item.away.id === teamId || item.home.id === teamId);
        if (!game) return 'none';
        return game.state === 'live' ? 'live' : game.state === 'final' ? 'final' : 'later';
    };
    const ordered = [...teams.values()].sort((a, b) => {
        const rank = { live: 0, later: 1, final: 2, none: 3 };
        return rank[status(a.id)] - rank[status(b.id)] || a.name.localeCompare(b.name);
    });
    if (!ordered.length) return null;

    return (
        <nav aria-label={t('stories.label')} className="flex gap-3 overflow-x-auto px-4 pb-1 pt-1 scrollbar-none">
            {ordered.map((team) => {
                const state = status(team.id);
                const active = selected === team.id;
                return (
                    <button
                        key={team.id}
                        type="button"
                        onClick={() => onSelect(active ? null : team.id)}
                        aria-pressed={active}
                        aria-label={`${teamDisplayName(team, i18n.language)} · ${t(`stories.${state}`)}`}
                        className={`flex w-[66px] shrink-0 flex-col items-center gap-1 ${state === 'none' && !active ? 'opacity-60' : ''}`}
                    >
                        <span
                            className="flex h-[62px] w-[62px] items-center justify-center rounded-full p-[3px] transition-transform"
                            style={{ boxShadow: `inset 0 0 0 ${active ? 4 : 3}px ${active ? 'rgb(var(--ink))' : RING[state]}`, transform: active ? 'scale(1.06)' : undefined }}
                        >
                            <span className="flex h-full w-full items-center justify-center rounded-full bg-surface">
                                <TeamLogo team={team} size={44} />
                            </span>
                        </span>
                        <span className={`max-w-full truncate text-[11px] ${active ? 'font-extrabold' : 'font-semibold'}`}>{team.abbrev}</span>
                    </button>
                );
            })}
        </nav>
    );
};
