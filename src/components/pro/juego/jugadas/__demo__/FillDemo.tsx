import React, { useState } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../../types';
import { useGamePro, useWinProb } from '../../../../../lib/pro/juego';
import { Sheet } from '../../../../ui';
import { ProSegmented } from '../../../kit';
import { ProBox } from '../../box/ProBox';
import { countPlays } from '../model';
import { ProPlays } from '../ProPlays';

// Prueba (solo en desarrollo y en la web): la hoja «Jugadas y box score» como la propone esta parte para ProGame
// (Sheet con scroll={false}, insignia con el número de jugadas y la lista con su propio desplazamiento).
// Se abre sola con localStorage 'el-play-jb-demo' = 'plays' | 'box'.
const demoView = (): 'plays' | 'box' | null => {
    if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return null;
    try {
        const value = window.localStorage?.getItem('el-play-jb-demo');
        return value === 'plays' || value === 'box' ? value : null;
    } catch {
        return null;
    }
};

export const FillDemo: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const [first] = useState(demoView);
    const [open, setOpen] = useState(first !== null);
    const [view, setView] = useState<'plays' | 'box'>(first ?? 'plays');
    const pro = useGamePro(game.gamePk ?? undefined, first !== null).data;
    const winProb = useWinProb(game.gamePk ?? undefined, game.currentAtBat, first !== null).data;
    if (first === null) return null;
    return (
        <Sheet open={open} onClose={() => setOpen(false)} title={t('pro.kit.game.playsSheet')} scroll={false}>
            <ProSegmented
                value={view}
                onChange={setView}
                label={t('pro.kit.game.playsSwitch')}
                options={[
                    { value: 'plays', label: t('pro.kit.game.playsView'), badge: undefined, accessibilityLabel: `${t('pro.kit.game.playsView')}: ${countPlays(game)}` },
                    { value: 'box', label: t('pro.kit.game.boxView') }
                ]}
            />
            {view === 'plays' ? <ProPlays game={game} pro={pro} winProb={winProb} place="sheet" fill /> : <ProBox game={game} pro={pro} place="sheet" fill />}
        </Sheet>
    );
};
