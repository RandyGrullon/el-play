import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro, WinProb } from '../../../../lib/pro/juego';
import { trackingLevel } from '../../../../lib/pro/juego';
import { ProNote } from '../../kit';
import { DuelBlock } from './DuelBlock';
import { LiveBoard } from './LiveBoard';
import { SituationBlock } from './SituationBlock';
import { WinProbBlock } from './WinProbBlock';

export interface ProLiveProps {
    game: GameDetail;
    /** Extras PRO del juego (useGamePro); undefined mientras carga o si la ruta no existe todavía */
    pro?: GamePro;
    /** Probabilidad de ganar por jugada (useWinProb); undefined mientras carga o si no existe */
    winProb?: WinProb;
    /** Abre la hoja de la zona completa */
    onOpenZone: () => void;
}

// Juego en vivo PRO, entre la cabecera y las pestañas: pizarra por entradas, probabilidad de ganar, situación
// (diamante, conteo, zona y último pitcheo), el aviso honesto si falta el rastreo y el duelo con la cola.
// Lo que MLB no manda no sale.
export const ProLive: React.FC<ProLiveProps> = ({ game, pro, winProb, onOpenZone }) => {
    const { t } = useTranslation();
    const tracking = trackingLevel(pro);
    return (
        <>
            <LiveBoard game={game} pro={pro} />
            <WinProbBlock game={game} pro={pro} winProb={winProb} />
            <SituationBlock game={game} pro={pro} onOpenZone={onOpenZone} />
            {pro && tracking !== 'full' && (
                <ProNote tone="pending" title={t('pro.kit.game.noTracking')}>
                    {t(tracking === 'none' ? 'pro.vivo.trackingNone' : 'pro.vivo.trackingPartial')}
                </ProNote>
            )}
            <DuelBlock game={game} pro={pro} />
        </>
    );
};
