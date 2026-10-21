import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ScheduleGame, ScheduleTeam } from '../../types';
import { isNotPlayed } from '../../lib/baseball';
import { teamDisplayName } from '../../lib/teams';
import { useColors } from '../../theme/theme';
import { alpha } from '../../theme/tokens';
import { TeamLogo, Txt } from '../ui';

type Status = 'live' | 'final' | 'later' | 'none';

interface TeamStoriesProps {
    /** Todos los juegos cargados (para conocer los equipos de la liga) */
    allGames: ScheduleGame[];
    /** Juegos del día elegido (para el anillo de cada equipo) */
    dayGames: ScheduleGame[];
    selected: number | null;
    onSelect: (teamId: number | null) => void;
}

// Fila de "historias": un círculo por equipo; el anillo dice si juega en vivo, ya terminó o juega más tarde.
// Tocar uno filtra los juegos a los suyos.
export const TeamStories: React.FC<TeamStoriesProps> = ({ allGames, dayGames, selected, onSelect }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const ring: Record<Status, string> = { live: colors.live, final: alpha(colors.faint, 0.6), later: colors.accent, none: 'transparent' };
    const teams = new Map<number, ScheduleTeam>();
    for (const game of allGames) {
        teams.set(game.away.id, game.away);
        teams.set(game.home.id, game.home);
    }
    const rank = { live: 0, later: 1, final: 2, none: 3 };
    // En doble cartelera manda el juego que más importa ahora (en vivo, luego el que falta); pospuestos y cancelados no cuentan
    const status = (teamId: number): Status =>
        dayGames
            .filter((item) => (item.away.id === teamId || item.home.id === teamId) && !isNotPlayed(item.detailedState))
            .map((item): Status => (item.state === 'live' ? 'live' : item.state === 'final' ? 'final' : 'later'))
            .reduce<Status>((best, item) => (rank[item] < rank[best] ? item : best), 'none');
    const ordered = [...teams.values()].sort((a, b) => rank[status(a.id)] - rank[status(b.id)] || a.name.localeCompare(b.name));
    if (!ordered.length) return null;

    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingVertical: 4 }} accessibilityLabel={t('stories.label')}>
            {ordered.map((team) => {
                const state = status(team.id);
                const active = selected === team.id;
                return (
                    <Pressable
                        key={team.id}
                        onPress={() => onSelect(active ? null : team.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${teamDisplayName(team, i18n.language)} · ${t(`stories.${state}`)}`}
                        style={{ width: 66, alignItems: 'center', gap: 4, opacity: state === 'none' && !active ? 0.6 : 1 }}
                    >
                        <View
                            style={{
                                width: 62,
                                height: 62,
                                borderRadius: 31,
                                borderWidth: active ? 4 : 3,
                                borderColor: active ? colors.ink : ring[state],
                                alignItems: 'center',
                                justifyContent: 'center',
                                transform: [{ scale: active ? 1.06 : 1 }]
                            }}
                        >
                            <View style={{ width: '100%', height: '100%', borderRadius: 31, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                                <TeamLogo team={team} size={44} />
                            </View>
                        </View>
                        <Txt size={11} weight={active ? 'extrabold' : 'semibold'} numberOfLines={1}>
                            {team.abbrev}
                        </Txt>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
};
