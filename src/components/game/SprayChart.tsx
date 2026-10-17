import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { battedBalls, eventName, inningName, type BattedKind } from '../../lib/baseball';
import { useColors } from '../../theme/theme';
import { radius } from '../../theme/tokens';
import { Card, Row, Segmented, Txt } from '../ui';
import { Legend } from './StrikeZone';

// Mapa de batazos: dónde cayó cada bola puesta en juego. Coordenadas del cuadro de Gameday (250×250, home en
// ≈125,198, ~2,5 pies por unidad); el anotador las marca en todos los estadios, también en los que no tienen rastreo.
const HOME_X = 125.42;
const HOME_Y = 198.27;
// Jardín genérico: líneas de foul de ~330 pies, central de ~400
const POLE = 92;
const FENCE = `M0 0 L${-POLE} ${-POLE} Q0 -228 ${POLE} ${-POLE} Z`;
const DIRT = 'M0 0 L-38 -38 Q0 -84 38 -38 Z';
const INFIELD = 'M0 -5 L-21 -26 L0 -47 L21 -26 Z';
const BASES = [
    [25.5, -25.5],
    [0, -51],
    [-25.5, -25.5]
];
const VIEW = { x: -112, y: -182, w: 224, h: 198 };

type Filter = 'all' | 'away' | 'home';

export const SprayChart: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [filter, setFilter] = useState<Filter>('all');
    const [selected, setSelected] = useState<number | null>(null);
    const all = useMemo(() => battedBalls(game.atBats), [game.atBats]);
    const balls = filter === 'all' ? all : all.filter((ball) => ball.side === filter);
    const current = balls.find((ball) => ball.atBat.i === selected) ?? null;
    const count = (kind: BattedKind) => balls.filter((ball) => ball.kind === kind).length;
    const tint: Record<BattedKind, string> = { hr: colors.live, hit: colors.accent, out: colors.muted };

    if (!all.length) return null;

    const pick = (value: Filter) => {
        setFilter(value);
        setSelected(null);
    };

    return (
        <Card padded={false} style={{ overflow: 'hidden' }}>
            <Row justify="space-between" wrap style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <Txt eyebrow>{t('spray.title')}</Txt>
                <Segmented<Filter>
                    small
                    value={filter}
                    onChange={pick}
                    options={[
                        { value: 'all', label: t('spray.both') },
                        { value: 'away', label: game.away.abbrev },
                        { value: 'home', label: game.home.abbrev }
                    ]}
                />
            </Row>

            <View style={{ paddingHorizontal: 12, paddingTop: 8, alignItems: 'center' }}>
                <View style={{ width: '100%', maxWidth: 420, aspectRatio: VIEW.w / VIEW.h }} accessibilityRole="image" accessibilityLabel={t('spray.aria', { count: balls.length })}>
                    <Svg width="100%" height="100%" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}>
                        <Path d={FENCE} fill="#3f9b63" fillOpacity={0.2} stroke="#3f9b63" strokeOpacity={0.55} strokeWidth={1.2} />
                        <Path d={DIRT} fill="#c08a52" fillOpacity={0.3} />
                        <Path d={INFIELD} fill="#3f9b63" fillOpacity={0.28} />
                        <G stroke="#ffffff" strokeOpacity={0.9} strokeWidth={0.8}>
                            <Line x1={0} y1={0} x2={-POLE} y2={-POLE} />
                            <Line x1={0} y1={0} x2={POLE} y2={-POLE} />
                        </G>
                        {BASES.map(([x, y]) => (
                            <Rect key={`${x}${y}`} x={x - 1.8} y={y - 1.8} width={3.6} height={3.6} fill="#ffffff" transform={`rotate(45 ${x} ${y})`} />
                        ))}
                        <Path d="M-2 0.6 L2 0.6 L2 2.4 L0 4 L-2 2.4 Z" fill="#ffffff" />

                        {balls.map((ball) => {
                            const active = ball.atBat.i === selected;
                            const cx = ball.x - HOME_X;
                            const cy = ball.y - HOME_Y;
                            return (
                                <G key={ball.atBat.i} opacity={selected !== null && !active ? 0.35 : 1}>
                                    {active && <Circle cx={cx} cy={cy} r={8} fill="none" stroke={tint[ball.kind]} strokeWidth={1.5} />}
                                    <Circle cx={cx} cy={cy} r={ball.kind === 'hr' ? 4.6 : 3.8} fill={tint[ball.kind]} stroke={colors.surface} strokeWidth={1.1} />
                                </G>
                            );
                        })}
                    </Svg>
                    {/* Área para tocar más grande que el punto, encima del dibujo */}
                    {balls.map((ball) => (
                        <Pressable
                            key={`hit-${ball.atBat.i}`}
                            accessibilityRole="button"
                            accessibilityLabel={`${ball.atBat.batter.name} · ${eventName(ball.atBat, i18n.language)}`}
                            onPress={() => setSelected(ball.atBat.i === selected ? null : ball.atBat.i)}
                            style={{
                                position: 'absolute',
                                left: `${((ball.x - HOME_X - VIEW.x) / VIEW.w) * 100}%`,
                                top: `${((ball.y - HOME_Y - VIEW.y) / VIEW.h) * 100}%`,
                                width: 24,
                                height: 24,
                                marginLeft: -12,
                                marginTop: -12,
                                borderRadius: 12
                            }}
                        />
                    ))}
                </View>
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                {current ? (
                    <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12 }}>
                        <Txt size={14} weight="extrabold">
                            {current.atBat.batter.name} ·{' '}
                            <Txt size={14} weight="extrabold" color={tint[current.kind]}>
                                {eventName(current.atBat, i18n.language)}
                            </Txt>
                        </Txt>
                        <Txt size={14} tone="muted" style={{ marginTop: 2 }}>
                            {[
                                inningName({ n: current.atBat.inning, isTop: current.atBat.top }, i18n.language),
                                current.pitch.hit?.traj ? t(`spray.traj.${current.pitch.hit.traj}`, { defaultValue: current.pitch.hit.traj.replace(/_/g, ' ') }) : '',
                                current.pitch.hit?.hard ? t(`spray.hard.${current.pitch.hit.hard}`, { defaultValue: current.pitch.hit.hard }) : '',
                                current.pitch.hit?.ev ? t('zone.exitVelo', { mph: current.pitch.hit.ev }) : '',
                                current.pitch.hit?.dist && current.pitch.hit.dist > 30 ? t('spray.feet', { ft: current.pitch.hit.dist }) : ''
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </Txt>
                    </View>
                ) : (
                    <Row gap={12} wrap justify="center" style={{ rowGap: 4 }}>
                        <Legend color={tint.hit} label={t('spray.hits', { count: count('hit') })} />
                        <Legend color={tint.hr} label={t('spray.homeRuns', { count: count('hr') })} />
                        <Legend color={tint.out} label={t('spray.outs', { count: count('out') })} />
                        <Txt size={11} tone="faint">
                            {t('spray.tap')}
                        </Txt>
                    </Row>
                )}
            </View>
        </Card>
    );
};
