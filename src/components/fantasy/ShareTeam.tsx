// Compartir mi equipo como imagen (igual que la web): la hoja de compartir de siempre (historia o post, tres estilos y
// foto propia) con las 6 fotos, la corona del capitán, el precio de cada uno, los créditos usados y, cuando ya hay
// juegos, los puntos (antes, la proyección). Sin imagen (la web de la app), el texto con el enlace.
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Share2 } from 'lucide-react-native';
import { LEAGUES } from '../../lib/leagues';
import { budgetOf, dayPoints, entryCost, gameStarted, playerScore, rulesOf, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import { projectedPoints } from '../../lib/fantasyBest';
import { formatShortDate } from '../../lib/format';
import { useColors } from '../../theme/theme';
import { IconButton } from '../ui';
import { shortName } from '../pro/kit';
import { useShare, type ShareRequest } from '../share/ShareSheet';
import type { FantasyPost } from '../share/subjects';
import { formatCredits } from './shared';

/** El contenido de la imagen; null sin peloteros */
export const fantasyPost = (day: FantasyDay, entry: DayEntry, counted: DayEntry, t: TFunction, lang: string): FantasyPost | null => {
    const players = entry.lineup.map((id) => day.players.find((player) => player.id === id)).filter((player): player is FantasyPlayer => !!player);
    if (!players.length) return null;
    const rules = rulesOf(day);
    const started = (player: FantasyPlayer) => {
        const game = day.games.find((item) => item.gamePk === player.gamePk);
        return !!game && gameStarted(game);
    };
    const anyStarted = players.some(started);
    const budget = budgetOf(day);
    const totals = dayPoints(day, entry, counted);
    const projected = players.some((player) => player.proj !== undefined) ? projectedPoints(day, entry.lineup, entry.captain) : null;
    const league = LEAGUES.find((item) => item.id === day.league);
    return {
        kind: 'fantasy',
        league: t(`leagues.${day.league}.name`),
        title: t('fantasyIdeas.share.title'),
        dateLabel: formatShortDate(`${day.date}T16:00:00Z`, lang),
        color: league?.color ?? '#2563eb',
        slots: players.map((player) => {
            const team = day.teams[player.teamId];
            return {
                id: player.id,
                name: shortName(player.name),
                teamId: player.teamId,
                abbrev: team?.abbrev ?? '',
                logo: team?.logo ?? null,
                color: team?.color ?? '#2563eb',
                price: budget !== null && player.price !== undefined ? t('fantasyIdeas.share.price', { price: formatCredits(player.price, lang) }) : null,
                // Después de su juego, sus puntos en el equipo que cuenta (con la corona)
                points: started(player) ? t('fantasyIdeas.share.points', { pts: formatCredits(counted.lineup.includes(player.id) ? playerScore(counted, player, rules.captain) : 0, lang) }) : null,
                captain: entry.captain === player.id
            };
        }),
        credits: budget === null ? t('fantasyIdeas.share.noCap') : t('fantasyIdeas.share.credits', { spent: formatCredits(entryCost(day, entry), lang), budget: formatCredits(budget, lang) }),
        captain: t('fantasyIdeas.share.captain', { x: formatCredits(rules.captain, lang) }),
        total: anyStarted ? t('fantasyIdeas.share.points', { pts: formatCredits(totals.total, lang) }) : projected !== null ? t('fantasyIdeas.share.points', { pts: formatCredits(projected, lang) }) : null,
        totalLabel: anyStarted ? t('fantasyIdeas.share.total') : t('fantasyIdeas.share.projected'),
        picks: totals.picks > 0 ? t('fantasyIdeas.share.picks', { pts: formatCredits(totals.picks, lang) }) : null
    };
};

/** Lo que se manda: la imagen y, sin ella, el texto de siempre con el enlace */
export const fantasyShareRequest = (day: FantasyDay, entry: DayEntry, counted: DayEntry, t: TFunction, lang: string): ShareRequest | null => {
    const data = fantasyPost(day, entry, counted, t, lang);
    if (!data) return null;
    const rules = rulesOf(day);
    const names = entry.lineup
        .map((id) => day.players.find((player) => player.id === id))
        .filter((player): player is FantasyPlayer => !!player)
        .map((player) => `${entry.captain === player.id ? '👑 ' : ''}${player.name} (${formatCredits(counted.lineup.includes(player.id) ? playerScore(counted, player, rules.captain) : 0, lang)})`)
        .join(', ');
    return { data, fileName: `el-play-fantasy-${day.date}`, text: t('fantasy.shareText', { points: dayPoints(day, entry, counted).total, names }), path: '/fantasy' };
};

export const ShareTeam: React.FC<{ day: FantasyDay; entry: DayEntry; counted: DayEntry }> = ({ day, entry, counted }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const { share, sheet } = useShare();
    const open = () => {
        const request = fantasyShareRequest(day, entry, counted, t, i18n.language);
        if (request) share(request);
    };
    return (
        <>
            <IconButton label={t('fantasy.share')} onPress={open}>
                <Share2 size={20} color={colors.ink} />
            </IconButton>
            {sheet}
        </>
    );
};
