import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { PlayerDetail } from '../../../lib/stats';
import { numOf } from '../../../lib/advanced';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, radius, shadow } from '../../../theme/tokens';
import type { HotColdMap, PlayerPro } from '../../../types/pro-liga';
import { Txt } from '../../ui';
import { FadeG, HeatGrid, ModuleHeader, ProSegmented, arcPath, heatColor, polar, useChartBox, type HeatCell } from '../kit';
import { pullSide } from '../estadisticas/logic';

const SECTORS = ['lf', 'lcf', 'cf', 'rcf', 'rf'] as const;

// Métricas de las zonas que se pueden elegir (si MLB las manda): bateo AVG y velocidad de salida; pitcheo lo que le
// batean y dónde lanza
const ZONE_METRICS = { B: ['battingAverage', 'exitVelocity', 'onBasePlusSlugging'], P: ['battingAverage', 'numberOfPitches', 'onBasePlusSlugging'] } as const;

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const colors = useColors();
    return <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16 }, shadow('card')]}>{children}</View>;
};

// Batazos y zonas: el abanico del terreno con los 5 sectores sombreados por % (solo bateadores) y la zona 3 × 3 con
// las 4 esquinas de zonas calientes, con selector de métrica. Si MLB no manda un bloque, no sale.
export const SprayZones: React.FC<{ player: PlayerDetail; pro: PlayerPro }> = ({ player, pro }) => {
    const { t } = useTranslation();
    const pitcher = player.role === 'P';
    const spray = !pitcher ? pro.sprayChart : null;
    const maps = (pro.hotColdZones ?? []).filter((map) => (ZONE_METRICS[player.role] as readonly string[]).includes(map.metric) && map.zones.some((zone) => numOf(zone.value) !== null));
    if (!spray && !maps.length) return null;
    const inPlay = typeof pro.advanced?.ballsInPlay === 'number' ? (pro.advanced.ballsInPlay as number) : null;
    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t(pitcher ? 'pro.ficha.zones.titleP' : 'pro.ficha.zones.titleB')} />
            {spray && <SprayFan spray={spray} bats={player.bats} inPlay={inPlay} />}
            {maps.length > 0 && <Zones maps={maps} role={player.role} />}
        </View>
    );
};

const SprayFan: React.FC<{ spray: NonNullable<PlayerPro['sprayChart']>; bats: string | null; inPlay: number | null }> = ({ spray, bats, inPlay }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { setNode, onLayout, width, seen } = useChartBox(300);
    const size = Math.min(width, 340);
    const cx = size / 2;
    const r = size * 0.48;
    const cy = r + 8;
    const height = cy + 16;
    const max = Math.max(1, ...SECTORS.map((key) => spray[key]));
    const pull = pullSide(bats);
    const fill = heatColor(1, 'heat');
    // De la raya del jardín izquierdo (−45°) a la del derecho (+45°), 18° por sector; 0° es el centro
    const wedge = (index: number) => {
        const from = -45 + index * 18;
        const to = from + 18;
        const [x0, y0] = polar(cx, cy, r, from);
        return `M${cx} ${cy} L${x0} ${y0} ${arcPath(cx, cy, r, from, to).replace(/^M[^A]+/, '')} Z`;
    };
    const summary = SECTORS.map((key) => `${t(`pro.ficha.zones.sectors.${key}`)} ${spray[key]} %`).join(', ');
    const [x1, y1] = polar(cx, cy, r * 0.3, -45);
    const [x2, y2] = polar(cx, cy, r * 0.42, 0);
    const [x3, y3] = polar(cx, cy, r * 0.3, 45);
    return (
        <Card>
            <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    {t('pro.ficha.zones.sprayTitle')}
                </Txt>
                {inPlay !== null && (
                    <Txt size={12} weight="semibold" tone="muted">
                        {t('pro.ficha.zones.inPlay', { count: inPlay })}
                    </Txt>
                )}
            </View>
            <View ref={setNode} onLayout={onLayout} style={{ alignItems: 'center' }}>
                <View accessible accessibilityRole="image" accessibilityLabel={t('pro.ficha.zones.sprayAria', { list: summary })}>
                    <Svg width={size} height={height}>
                        {SECTORS.map((key, index) => (
                            <FadeG key={key} seen={seen} index={index} step={60} duration={500} opacity={0.12 + 0.78 * (spray[key] / max)}>
                                <Path d={wedge(index)} fill={fill} stroke={colors.surface} strokeWidth={2} />
                            </FadeG>
                        ))}
                        <Polyline points={`${cx},${cy} ${x1},${y1} ${x2},${y2} ${x3},${y3} ${cx},${cy}`} fill="none" stroke={colors.ink} strokeOpacity={0.75} strokeWidth={1.5} />
                        {[
                            [x1, y1],
                            [x2, y2],
                            [x3, y3],
                            [cx, cy]
                        ].map(([x, y], index) => (
                            <Rect key={index} x={x - 4} y={y - 4} width={8} height={8} fill={colors.ink} transform={`rotate(45 ${x} ${y})`} />
                        ))}
                        {SECTORS.map((key, index) => {
                            const [x, y] = polar(cx, cy, r * 0.74, -36 + index * 18);
                            const label = (stroke: boolean) => (
                                <>
                                    <SvgText x={x} y={y - 3} textAnchor="middle" fontFamily={fonts.extrabold} fontSize={12} fill={stroke ? 'none' : colors.ink} stroke={stroke ? colors.surface : undefined} strokeWidth={stroke ? 3 : undefined}>
                                        {t(`pro.ficha.zones.sectorsShort.${key}`)}
                                    </SvgText>
                                    <SvgText x={x} y={y + 12} textAnchor="middle" fontFamily={fonts.extrabold} fontSize={12} fill={stroke ? 'none' : colors.ink} stroke={stroke ? colors.surface : undefined} strokeWidth={stroke ? 3 : undefined}>
                                        {`${spray[key]} %`}
                                    </SvgText>
                                </>
                            );
                            return (
                                <React.Fragment key={key}>
                                    {label(true)}
                                    {label(false)}
                                </React.Fragment>
                            );
                        })}
                    </Svg>
                </View>
            </View>
            <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Txt size={11} tone="muted">
                    {t('pro.ficha.zones.moreColor')}
                </Txt>
                {pull && (
                    <Txt size={11} tone="muted" style={{ textAlign: 'right', flexShrink: 1 }}>
                        {t(`pro.ficha.zones.pull_${pull}`)}
                    </Txt>
                )}
            </View>
        </Card>
    );
};

const Zones: React.FC<{ maps: HotColdMap[]; role: 'B' | 'P' }> = ({ maps, role }) => {
    const { t } = useTranslation();
    const order = ZONE_METRICS[role] as readonly string[];
    const available = [...maps].sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric));
    const [metric, setMetric] = useState(available[0].metric);
    const map = available.find((item) => item.metric === metric) ?? available[0];
    const cells: HeatCell[] = map.zones.map((zone) => ({ zone: Number(zone.zone), value: numOf(zone.value), display: zone.value ?? '—' }));
    const label = (key: string) => t(`pro.ficha.zones.metrics.${key}`, { defaultValue: key });
    return (
        <Card>
            <View style={{ marginBottom: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    {t(role === 'P' ? 'pro.ficha.zones.hotP' : 'pro.ficha.zones.hotB')}
                </Txt>
                {available.length > 1 && (
                    <ProSegmented value={map.metric} onChange={setMetric} label={t('pro.ficha.zones.metricLabel')} fill={false} options={available.map((item) => ({ value: item.metric, label: label(item.metric) }))} />
                )}
            </View>
            <HeatGrid
                key={map.metric}
                cells={cells}
                scale="heat"
                maxSize={260}
                label={t('pro.ficha.zones.gridAria', { metric: label(map.metric), list: cells.map((cell) => `${cell.zone}: ${cell.display}`).join(', ') })}
                legend={{ low: t('pro.ficha.zones.cold'), high: t('pro.ficha.zones.hot') }}
            />
            <Txt size={11} tone="muted" center style={{ marginTop: 8 }}>
                {`${t(`pro.ficha.zones.metricNote.${map.metric}`, { defaultValue: '' })} ${t('pro.ficha.zones.catcherView')}`.trim()}
            </Txt>
        </Card>
    );
};
