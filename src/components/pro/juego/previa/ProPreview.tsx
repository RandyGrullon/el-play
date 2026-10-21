import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { seasonLabel } from '../../../../lib/format';
import { useProCalendar, useProStandings } from '../../../../lib/pro/liga';
import { usePreviewExtras } from '../../../../lib/pro/pantallas';
import { Ballpark } from './Ballpark';
import { Countdown } from './Countdown';
import { HeadToHead } from './HeadToHead';
import { Lineups } from './Lineups';
import { Probables } from './Probables';
import { RecentForm } from './RecentForm';
import { SeasonSeries } from './SeasonSeries';
import { TeamStars } from './TeamStars';
import { BlockState } from './shared';
import { proMissing, rowsFor, sourceFromCalendar, useLiteSchedule, useLiteStandings } from './datos';
import { nextGameNumber, ordinal, phaseOf, sourceFromSchedule } from './logica';

export interface ProPreviewProps {
    game: GameDetail;
    /** Extras PRO del juego (useGamePro): clima en °C, viento, medidas del parque…; undefined si no hay */
    pro?: GamePro;
    /** Compartir de la pantalla (en la previa va en la cabecera: aquí no sale otro botón) */
    onShare: () => void;
}

// Antesala PRO, en el orden del diseño: cuenta regresiva → cara a cara → serie particular → forma reciente →
// abridores → alineaciones (si MLB las publicó) → figuras de cada equipo → estadio. Cada bloque carga solo y, si su
// dato no existe, no sale o lo dice; nunca se rellena. Si el servidor todavía no tiene las rutas PRO (producción),
// el cara a cara, la serie, la forma y las figuras salen con las rutas del Lite.
export const ProPreview: React.FC<ProPreviewProps> = ({ game, pro }) => {
    const { t, i18n } = useTranslation();
    const league = game.league;
    const phase = phaseOf(game);

    // Posiciones: las PRO (con splits y esperado) o las del Lite
    const standings = useProStandings(league);
    const standingsMissing = proMissing(standings, !!standings.data);
    const liteStandings = useLiteStandings(league, standingsMissing);
    const table = standings.data ?? liteStandings.data;
    const tableQuery = standingsMissing ? liteStandings : standings;

    // Calendario: el PRO de toda la temporada o el del Lite (unos diez días)
    const calendar = useProCalendar(league);
    const calendarMissing = proMissing(calendar, !!calendar.data);
    const schedule = useLiteSchedule(league, calendarMissing);
    const source = calendar.data ? sourceFromCalendar(calendar.data) : schedule.data ? sourceFromSchedule(schedule.data) : null;
    const sourceQuery = calendarMissing ? schedule : calendar;

    const season = table?.season ?? calendar.data?.season ?? null;
    const previous = useProCalendar(league, season ? season - 1 : undefined, league === 'lidom' && !!season && !calendarMissing);
    const extras = usePreviewExtras(game.gamePk, league).data;

    // «Serie regular · 2.º juego de cada uno», «Serie final · juego 3 de 7»
    const series = pro?.schedule?.series ?? game.series ?? null;
    const phaseName = league === 'lidom' && game.gameType ? t(`pro.kit.game.phase.${game.gameType}`, { defaultValue: '' }) : (series?.name ?? '');
    let phaseText: string | null = phaseName || null;
    if (series && series.total && series.total > 1 && series.game) phaseText = t('pro.kit.game.series', { name: phaseName || series.name, game: series.game, total: series.total });
    else if (phaseName && league === 'lidom') {
        const a = nextGameNumber(game.away.record);
        const b = nextGameNumber(game.home.record);
        if (a && b) phaseText = `${phaseName} · ${a === b ? t('pro.previa.phase.each', { n: ordinal(a, i18n.language) }) : t('pro.previa.phase.games', { away: game.away.abbrev, a: ordinal(a, i18n.language), home: game.home.abbrev, b: ordinal(b, i18n.language) })}`;
    }

    const teamGames = Math.max(game.away.record ? game.away.record.wins + game.away.record.losses : 0, game.home.record ? game.home.record.wins + game.home.record.losses : 0);
    const label = season ? seasonLabel(season, league) : '';
    const names: Record<number, string> = { [game.away.id]: game.away.name, [game.home.id]: game.home.name };
    for (const team of Object.values(source?.teams ?? {})) names[team.id] = team.name;
    const homeOf = (extras?.venue?.homeOf ?? []).map((id) => names[id]).filter(Boolean);
    const lineups = extras?.lineups && (extras.lineups.away?.length || extras.lineups.home?.length) ? extras.lineups : null;
    const lidomPhase = phase === 'regular' || phase === 'roundRobin' || phase === 'final' ? phase : undefined;
    const retryTable = () => {
        void standings.refetch();
        if (standingsMissing) void liteStandings.refetch();
    };
    const retrySource = () => {
        void calendar.refetch();
        if (calendarMissing) void schedule.refetch();
    };

    return (
        <>
            <Countdown game={game} phase={phaseText} />

            {table ? (
                <HeadToHead
                    game={game}
                    rows={rowsFor(table, game.away.id, lidomPhase)}
                    seasonLabel={label ? t('common.season', { season: label }) : ''}
                    dayNight={pro?.game.dayNight ?? null}
                    form={source?.form}
                />
            ) : (
                <BlockState title={t('pro.previa.h2h.title')} loading={tableQuery.isLoading || (standingsMissing && liteStandings.isPending)} error={tableQuery.error} height={420} onRetry={retryTable} />
            )}

            {source ? (
                <>
                    <SeasonSeries
                        game={game}
                        source={source}
                        previous={previous.data ? sourceFromCalendar(previous.data) : undefined}
                        phase={phase ?? 'regular'}
                        venues={extras?.venues ?? null}
                        seasonLabel={label}
                        previousLabel={season ? seasonLabel(season - 1, league) : null}
                    />
                    <RecentForm game={game} source={source} />
                </>
            ) : (
                <>
                    <BlockState title={t('pro.previa.series.title')} loading={sourceQuery.isLoading || (calendarMissing && schedule.isPending)} error={sourceQuery.error} height={220} onRetry={retrySource} />
                    <BlockState title={t('pro.previa.form.title')} loading={sourceQuery.isLoading || (calendarMissing && schedule.isPending)} error={sourceQuery.error} height={180} />
                </>
            )}

            <Probables game={game} />

            {lineups && <Lineups game={game} lineups={lineups} />}

            {season ? (
                <TeamStars game={game} season={season} teamGames={teamGames} fullSeason={standings.data?.pro.regularSeasonGames ?? 50} />
            ) : (
                <BlockState title={t('pro.previa.stars.title')} loading={tableQuery.isLoading || sourceQuery.isLoading || (standingsMissing && liteStandings.isPending)} error={tableQuery.error} height={380} onRetry={retryTable} />
            )}

            <Ballpark game={game} pro={pro} venue={extras?.venue ?? null} homeOf={homeOf} />
        </>
    );
};
