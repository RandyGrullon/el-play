import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { battingAdvanced, eraPlus, fmtDec, fmtPct, fmtRate, numOf, opsPlus, pitchingAdvanced } from '../../../lib/advanced';
import type { PlayerDetail, StatContext } from '../../../lib/stats';
import { ModuleHeader } from '../kit';
import { FichaTile, TileRows } from './SeasonTiles';

// Métricas avanzadas de la temporada (AdvancedGrid de la ficha PRO de la web): OPS+ o EFE+ contra la liga de esa
// temporada y las tasas de siempre. Sin la línea de la liga, OPS+, EFE+ y FIP quedan en «—».
export const AdvancedTiles: React.FC<{ player: PlayerDetail; ctx: StatContext | null }> = ({ player, ctx }) => {
    const { t } = useTranslation();
    const l = (key: string) => t(`pro.short.${key}`);
    const plus = (value: number | null) => (value === null || !Number.isFinite(value) ? '—' : String(Math.round(value)));
    let tiles: [string, string][] = [];
    if (player.role === 'P' && player.pitching) {
        const p = player.pitching;
        const a = pitchingAdvanced(p, ctx?.fipConstant ?? undefined);
        tiles = [
            [l('eraPlus'), plus(ctx ? eraPlus(numOf(p.era), ctx.era) : null)],
            [l('fip'), ctx?.fipConstant !== null && ctx?.fipConstant !== undefined ? fmtDec(a.fip) : '—'],
            [l('k9'), fmtDec(a.k9)],
            [l('bb9'), fmtDec(a.bb9)],
            [l('kBb'), fmtDec(a.kBb)],
            [l('h9'), fmtDec(a.h9)],
            [l('hr9'), fmtDec(a.hr9)],
            [l('kPct'), fmtPct(a.kPct)]
        ];
    } else if (player.hitting) {
        const h = player.hitting;
        const a = battingAdvanced(h);
        tiles = [
            [l('opsPlus'), plus(ctx ? opsPlus(numOf(h.obp), numOf(h.slg), ctx) : null)],
            [l('iso'), fmtRate(a.iso)],
            [l('babip'), fmtRate(a.babip)],
            [l('kPct'), fmtPct(a.kPct)],
            [l('bbPct'), fmtPct(a.bbPct)],
            [l('bbK'), fmtDec(a.bbK)],
            [l('abHr'), fmtDec(a.abHr, 1)],
            [l('xbh'), String(a.xbh)]
        ];
    }
    if (!tiles.length) return null;
    return (
        <View style={{ gap: 12 }} accessibilityLabel={t('pro.advanced')}>
            <ModuleHeader title={t('pro.advanced')} />
            <TileRows>
                {tiles.map(([label, value]) => (
                    <FichaTile key={label} value={value} label={label} />
                ))}
            </TileRows>
        </View>
    );
};
