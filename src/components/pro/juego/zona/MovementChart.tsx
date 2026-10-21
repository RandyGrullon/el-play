import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Hand } from 'lucide-react-native';
import { pitchTypeName } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { ProNote, ProSection, ScatterChart, useElementWidth, type ScatterPoint } from '../../kit';
import { hbView, typeMix, type PitchItem } from '../vivo/logic';
import { fmtInches } from '../vivo/parts';
import { pitchColor } from './ZoneField';

// Nube de movimiento: subida inducida (IVB) contra quiebre horizontal (HB) de cada pitcheo, vista del receptor,
// con un círculo en el promedio de cada tipo y su dispersión punteada. Sin rastreo no hay quiebres: nota honesta.

interface MovementChartProps {
    items: PitchItem[];
    subtitle: string;
    /** Nombre del lanzador (para el lector) */
    title: string;
    /** Mano del lanzador: R o L (cambia de qué lado queda el brazo) */
    hand: string | null;
}

const PAD_X = 56;

const inches = (value: number) => (value ? `${value < 0 ? '−' : ''}${Math.abs(value)}″` : '0');

export const MovementChart: React.FC<MovementChartProps> = ({ items, title, subtitle, hand }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const { width, onLayout } = useElementWidth(320);
    const moved = items.filter((item) => typeof item.pro?.ivb === 'number' && typeof item.pro?.hb === 'number');
    const rows = typeMix(moved).filter((row) => row.ivb !== null && row.hb !== null);
    const limit = Math.max(24, ...moved.map((item) => Math.ceil(Math.max(Math.abs(item.pro!.ivb as number), Math.abs(hbView(item.pro) as number)) / 6) * 6));
    const pxPerInch = Math.max(1, (width - PAD_X) / (limit * 2));
    const points: ScatterPoint[] = [
        ...moved.map((item, index) => ({
            id: `p${index}`,
            x: hbView(item.pro) as number,
            y: item.pro!.ivb as number,
            color: pitchColor(item.pitch, true, colors),
            name: `${pitchTypeName(item.pitch, lang)}: IVB ${fmtInches(item.pro!.ivb, lang)}, HB ${fmtInches(hbView(item.pro), lang)}`,
            r: 2.5,
            muted: true
        })),
        ...rows.map((row) => ({
            id: row.type,
            x: row.hb as number,
            y: row.ivb as number,
            color: pitchColor({ type: row.type, r: 'strike' }, true, colors),
            name: pitchTypeName({ type: row.type, typeDesc: null }, lang),
            label: row.type,
            r: 8,
            halo: row.spread ? Math.max(12, Math.min(48, row.spread * pxPerInch)) : undefined
        }))
    ];
    // Para un derecho el lado del brazo es la izquierda del receptor (hacia tercera); para un zurdo, al revés
    const armLeft = hand !== 'L';
    const ticks = [-limit, -limit / 2, 0, limit / 2, limit];
    const aria = t('pro.zona.move.aria', {
        name: title,
        list: rows.map((row) => `${pitchTypeName({ type: row.type, typeDesc: null }, lang)} IVB ${fmtInches(row.ivb, lang)} HB ${fmtInches(row.hb, lang)}`).join('; ')
    });

    return (
        <ProSection title={t('pro.zona.move.title')} bodyStyle={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={13} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                    {subtitle}
                </Txt>
                {hand && (
                    <View style={{ height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 12 }}>
                        <Hand size={14} color={colors.ink} />
                        <Txt size={12} weight="extrabold">
                            {t(`pro.vivo.hand.throws.${hand}`, { defaultValue: hand })}
                        </Txt>
                    </View>
                )}
            </View>
            {rows.length ? (
                <>
                    <View onLayout={onLayout}>
                        <ScatterChart
                            points={points}
                            label={aria}
                            xDomain={[-limit, limit]}
                            yDomain={[-limit, limit]}
                            xTicks={ticks}
                            yTicks={ticks}
                            formatX={inches}
                            formatY={inches}
                            xLabel={t('pro.zona.move.x')}
                            yLabel={t('pro.zona.move.y')}
                            refX={{ value: 0 }}
                            refY={{ value: 0 }}
                            height={Math.min(320, Math.max(240, width))}
                        />
                    </View>
                    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Txt size={11} weight="bold" tone="muted">
                            ← {t(armLeft ? 'pro.zona.move.arm' : 'pro.zona.move.glove')}
                        </Txt>
                        <Txt size={11} weight="bold" tone="muted">
                            {t(armLeft ? 'pro.zona.move.glove' : 'pro.zona.move.arm')} →
                        </Txt>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {rows.map((row) => (
                            <View key={row.type} style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 10, paddingVertical: 6 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pitchColor({ type: row.type, r: 'strike' }, true, colors) }} />
                                <Txt size={12} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                    {pitchTypeName({ type: row.type, typeDesc: null }, lang)}{' '}
                                    <Txt size={12} tone="muted">
                                        {fmtInches(row.ivb, lang)} · {fmtInches(row.hb, lang)}
                                    </Txt>
                                </Txt>
                            </View>
                        ))}
                    </View>
                    <Txt size={12} tone="muted">
                        {t('pro.zona.move.note')}
                    </Txt>
                </>
            ) : (
                <ProNote tone="pending">{`${t('pro.kit.game.noTracking')} ${t('pro.zona.move.none')}`}</ProNote>
            )}
        </ProSection>
    );
};
