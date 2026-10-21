import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro, WinProb } from '../../../../lib/pro/juego';
import { useGamePro } from '../../../../lib/pro/juego';
import { isRouteMissing } from '../../../../lib/pro/http';
import { ProNote } from '../../kit';
import { buildHalves, fillChallengesLeft, nameBook } from './model';
import { PlaysSheet } from './PlaysSheet';
import { PlaysTab } from './PlaysTab';

export interface ProPlaysProps {
    game: GameDetail;
    /** Extras PRO del juego (useGamePro); undefined mientras carga o si la ruta no existe todavía */
    pro?: GamePro;
    /** Probabilidad de ganar por jugada (useWinProb); undefined mientras carga o si no existe */
    winProb?: WinProb;
    /** tab: pestaña «Jugadas» del detalle (en vivo); sheet: hoja «Jugadas y box score» completa */
    place: 'tab' | 'sheet';
    /** En la pestaña: abre la hoja con todas las jugadas */
    onOpenAll?: () => void;
    /**
     * En la hoja: la lista lleva su propio desplazamiento (virtualizada, con los encabezados de cada media entrada
     * pegajosos). Para eso la hoja va con `scroll={false}`; sin esto la lista va seguida dentro del ScrollView de la hoja.
     */
    fill?: boolean;
}

// Jugada a jugada PRO. Con lo del Lite (atBats) ya se ve la cronología; los extras PRO agregan los corredores,
// los chips de eventos y los retos, y la probabilidad agrega el cambio por jugada, la presión y el filtro «Clave».
export const ProPlays: React.FC<ProPlaysProps> = ({ game, pro, winProb, place, onOpenAll, fill = false }) => {
    const { t } = useTranslation();
    // Misma consulta que ya hace ProGame (react-query no la repite): solo para saber si carga o falló
    const status = useGamePro(game.gamePk ?? undefined, !pro);
    const halves = useMemo(() => fillChallengesLeft(buildHalves(game, pro, winProb), pro, game.scheduledInnings), [game, pro, winProb]);
    const names = useMemo(() => nameBook(game, pro), [game, pro]);

    // Sin los extras se ve lo básico; la ruta que todavía no existe en el servidor no es un error que avisar
    const failed = status.isError && !isRouteMissing(status.error);
    const loading = status.isPending && status.fetchStatus === 'fetching';
    const note =
        !pro && halves.length > 0 && (loading || failed) ? (
            <ProNote tone={failed ? 'warn' : 'pending'}>{t(failed ? 'pro.jugadas.proError' : 'pro.jugadas.proLoading')}</ProNote>
        ) : null;

    if (place === 'tab')
        return (
            <View style={{ gap: 12 }}>
                {note}
                <PlaysTab game={game} pro={pro} halves={halves} names={names} onOpenAll={onOpenAll} />
            </View>
        );
    return <PlaysSheet game={game} pro={pro} winProb={winProb} halves={halves} names={names} note={note} fill={fill} />;
};
