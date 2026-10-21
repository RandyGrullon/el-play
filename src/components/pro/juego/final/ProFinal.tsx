import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';
import type { GameDetail, TopPerformer } from '../../../../types';
import type { GamePro, WinProb } from '../../../../lib/pro/juego';
import { useGamePro, useWinProb } from '../../../../lib/pro/juego';
import { useProCalendar } from '../../../../lib/pro/liga';
import { isPermanent } from '../../../../lib/pro/http';
import { radius } from '../../../../theme/tokens';
import { Skeleton } from '../../../ui';
import { ProButton, ProNote, ProSection } from '../../kit';
import { gamesBetween, phaseOf, seasonSeries, sourceFromSchedule, type SeriesSource } from '../previa/logica';
import { isOffline, proMissing, sourceFromCalendar, useLiteSchedule } from '../previa/datos';
import { Confetti } from './Confetti';
import { Figures } from './Figures';
import { GameFacts } from './GameFacts';
import { LineScore } from './LineScore';
import { PitchingReport } from './PitchingReport';
import { Records } from './Records';
import { ScoreChart } from './ScoreChart';
import { ShareBlock } from './ShareBlock';
import { ProStory } from './Story';
import { WinProbBlock } from './WinProbBlock';

export interface ProFinalProps {
    game: GameDetail;
    /** Extras PRO del juego (useGamePro); undefined mientras carga o si la ruta no existe todavía */
    pro?: GamePro;
    /** Probabilidad de ganar por jugada (useWinProb); undefined mientras carga o si no existe */
    winProb?: WinProb;
    onShare: () => void;
    onSharePerformer: (performer: TopPerformer) => void;
    /** Abre la hoja «Jugadas y box score» */
    onOpenPlays: () => void;
    /**
     * Pinta al final «Jugada a jugada» y «Compartir» (true por defecto). El diseño los pone DESPUÉS de las pestañas
     * del detalle: ProGame puede pasar false y pintar <ProFinalEnd> debajo de las pestañas.
     */
    withEnd?: boolean;
}

export type ProFinalEndProps = Pick<ProFinalProps, 'game' | 'pro' | 'winProb' | 'onShare' | 'onOpenPlays'>;

// Juego terminado (PRO), en el orden del diseño (debajo del marcador): serie y ficha del juego → pizarra completa →
// historia interactiva → probabilidad de ganar → gráfica del marcador → figuras → informe de pitcheo → récords →
// jugada a jugada → compartir. Lo que depende de los extras PRO espera a que lleguen; si el servidor todavía no
// tiene esas rutas (producción), cada bloque sale con lo que da el detalle del Lite o dice que no hay.

const Pending: React.FC<{ title: string; height: number; error?: unknown; failed: boolean }> = ({ title, height, error, failed }) => {
    const { t } = useTranslation();
    const offline = isOffline(error);
    return (
        <ProSection title={title}>
            {failed ? (
                <ProNote tone={offline ? 'neutral' : 'warn'} title={offline ? t('pro.previa.offline.title') : t('pro.previa.error.title')}>
                    {offline ? t('pro.previa.offline.body') : t('pro.previa.error.body')}
                </ProNote>
            ) : (
                <View accessible accessibilityLabel={t('pro.previa.loading', { name: title })} accessibilityState={{ busy: true }}>
                    <Skeleton height={height} round={radius.tile} />
                </View>
            )}
        </ProSection>
    );
};

/** Serie particular de la temporada con el calendario PRO o, si no existe, el del Lite */
const useSeriesSource = (game: GameDetail): SeriesSource | null => {
    const calendar = useProCalendar(game.league);
    const missing = proMissing(calendar, !!calendar.data);
    const schedule = useLiteSchedule(game.league, missing);
    return calendar.data ? sourceFromCalendar(calendar.data) : schedule.data ? sourceFromSchedule(schedule.data) : null;
};

/** Cierre del final: «Jugada a jugada y box completo ›» y el bloque «Compartir» con la imagen PRO */
export const ProFinalEnd: React.FC<ProFinalEndProps> = ({ game, pro, winProb, onShare, onOpenPlays }) => {
    const { t } = useTranslation();
    // Las mismas consultas de ProGame (react-query las comparte): por si se monta sin los datos
    const proQuery = useGamePro(game.gamePk ?? undefined, !pro);
    const wpQuery = useWinProb(game.gamePk ?? undefined, game.currentAtBat, !winProb);
    const extras = pro ?? proQuery.data;
    const probability = winProb ?? wpQuery.data;
    const source = useSeriesSource(game);
    const playoff = extras?.schedule?.series ?? game.series ?? null;
    const season = source ? seasonSeries(gamesBetween(source, game.away.id, game.home.id, phaseOf(game)), game.away.id, game.home.id, game.gamePk) : null;
    let seriesText: string | null = null;
    if (playoff && playoff.total && playoff.total > 1) {
        const leader = playoff.leaderId === game.away.id ? game.away : playoff.leaderId === game.home.id ? game.home : null;
        seriesText = leader ? t('pro.final.share.series', { team: leader.abbrev, wins: playoff.wins, losses: playoff.losses }) : null;
    } else if (season?.leaderId) {
        const leader = season.leaderId === game.away.id ? game.away : game.home;
        const other = leader === game.away ? game.home : game.away;
        seriesText = t('pro.final.share.series', { team: leader.abbrev, wins: season.wins[leader.id] ?? 0, losses: season.wins[other.id] ?? 0 });
    }

    return (
        <>
            <ProButton block size="lg" label={t('pro.kit.game.allPlays')} accessibilityLabel={t('pro.kit.game.openPlays')} icon={(color) => <ChevronRight size={16} color={color} />} iconEnd onPress={onOpenPlays} />
            <ShareBlock game={game} pro={extras} winProb={probability} series={seriesText} onShare={onShare} />
        </>
    );
};

export const ProFinal: React.FC<ProFinalProps> = ({ game, pro, winProb, onShare, onSharePerformer, onOpenPlays, withEnd = true }) => {
    const { t } = useTranslation();
    // Mismas consultas que ProGame (react-query las comparte): aquí solo para saber si cargan o fallaron
    const proQuery = useGamePro(game.gamePk ?? undefined);
    const wpQuery = useWinProb(game.gamePk ?? undefined, game.currentAtBat, true);
    const extras = pro ?? proQuery.data;
    const probability = winProb ?? wpQuery.data;
    const source = useSeriesSource(game);
    const proLoading = !extras && proQuery.isLoading;
    const wpLoading = !probability && wpQuery.isLoading;
    const wpMissing = !probability && wpQuery.isError && isPermanent(wpQuery.error);
    const winner = game.home.isWinner ? game.home : game.away;
    const playoff = extras?.schedule?.series ?? game.series ?? null;
    const champion = !!playoff?.championship && playoff.over && playoff.leaderId === winner.id;

    return (
        <>
            {champion && <Confetti colors={[winner.color, winner.color2 || '#ffffff', '#ffffff', '#f2b84b']} gameKey={String(game.gamePk ?? `${game.away.id}-${game.home.id}`)} />}
            <GameFacts game={game} pro={extras} source={source} />
            <LineScore game={game} pro={extras} />
            {proLoading || wpLoading ? <Pending title={t('pro.final.story.title')} height={420} failed={false} /> : <ProStory game={game} pro={extras} winProb={probability} />}
            {probability ? (
                <WinProbBlock game={game} pro={extras} winProb={probability} />
            ) : wpMissing ? (
                <ProSection title={t('pro.final.wp.title')} aside={t('pro.final.wp.aside')}>
                    <ProNote tone="neutral">{t('pro.final.wp.missing')}</ProNote>
                </ProSection>
            ) : (
                <Pending title={t('pro.final.wp.title')} height={260} failed={!wpLoading && wpQuery.isError} error={wpQuery.error} />
            )}
            <ScoreChart game={game} pro={extras} />
            <Figures game={game} pro={extras} onSharePerformer={onSharePerformer} />
            {proLoading ? (
                <>
                    <Pending title={t('pro.final.report.title')} height={360} failed={false} />
                    <Pending title={t('pro.final.records.title')} height={260} failed={false} />
                </>
            ) : (
                <>
                    <PitchingReport game={game} pro={extras} />
                    <Records game={game} pro={extras} />
                </>
            )}
            {withEnd && <ProFinalEnd game={game} pro={extras} winProb={probability} onShare={onShare} onOpenPlays={onOpenPlays} />}
        </>
    );
};
