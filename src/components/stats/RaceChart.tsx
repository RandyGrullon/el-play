// La carrera de la temporada (la misma de la web): juegos sobre .500 de cada equipo, día a día. El favorito (o el que
// se toque) va resaltado.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react-native';
import type { LeagueId } from '../../types';
import { useRace } from '../../lib/queries';
import { formatShortDate } from '../../lib/format';
import { usePreferences } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { fonts, radius } from '../../theme/tokens';
import { Card, Row, Txt } from '../ui';

const W = 320;
const H = 170;
const PAD = { top: 10, bottom: 18, left: 22, right: 30 };

export const RaceChart: React.FC<{ league: LeagueId }> = ({ league }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const race = useRace(league);
    const { favoriteTeamId } = usePreferences();
    const [picked, setPicked] = useState<number | null>(null);
    const data = race.data;
    if (!data || data.days.length < 2 || !data.teams.length) return null;
    const focus = picked ?? favoriteTeamId;
    const values = data.teams.flatMap((team) => team.points);
    const top = Math.max(2, ...values);
    const bottom = Math.min(-2, ...values);
    const x = (index: number) => PAD.left + (index / (data.days.length - 1)) * (W - PAD.left - PAD.right);
    const y = (value: number) => PAD.top + ((top - value) / (top - bottom)) * (H - PAD.top - PAD.bottom);
    const path = (points: number[]) => points.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    const ordered = [...data.teams].sort((a, b) => Number(a.id === focus) - Number(b.id === focus));
    const labels = [...data.teams].sort((a, b) => b.points[b.points.length - 1] - a.points[a.points.length - 1]).map((team) => ({ team, y: y(team.points[team.points.length - 1]) }));
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 11);
    const ticks = [top, 0, bottom].filter((value, index, list) => list.indexOf(value) === index);

    return (
        <Card style={{ gap: 8 }}>
            <Row gap={6}>
                <Activity size={14} color={colors.muted} />
                <Txt eyebrow accessibilityRole="header">
                    {t('race.title')}
                </Txt>
            </Row>
            <Txt size={12} tone="muted">
                {t('race.subtitle')}
            </Txt>
            <View accessible accessibilityLabel={t('race.aria', { teams: data.teams.map((team) => `${team.abbrev} ${team.points[team.points.length - 1]}`).join(', ') })}>
                <Svg width="100%" height={undefined} viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
                    {ticks.map((value) => (
                        <G key={value}>
                            <Line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} stroke={value === 0 ? colors.faint : colors.line} strokeDasharray={value === 0 ? '3 3' : undefined} strokeWidth={1} />
                            <SvgText fontFamily={fonts.bold} x={PAD.left - 4} y={y(value) + 3} fontSize={9} fontWeight="700" fill={colors.faint} textAnchor="end">
                                {value > 0 ? `+${value}` : String(value)}
                            </SvgText>
                        </G>
                    ))}
                    {[0, data.days.length - 1].map((index) => (
                        <SvgText fontFamily={fonts.bold} key={index} x={x(index)} y={H - 4} fontSize={9} fontWeight="700" fill={colors.faint} textAnchor={index ? 'end' : 'start'}>
                            {formatShortDate(`${data.days[index]}T16:00:00Z`, i18n.language)}
                        </SvgText>
                    ))}
                    {ordered.map((team) => (
                        <Path key={team.id} d={path(team.points)} fill="none" stroke={team.color} strokeWidth={team.id === focus ? 3 : 1.8} strokeLinejoin="round" strokeLinecap="round" opacity={focus && team.id !== focus ? 0.35 : 1} />
                    ))}
                    {labels.map(({ team, y: labelY }) => (
                        <SvgText fontFamily={fonts.bold} key={team.id} x={W - PAD.right + 4} y={labelY + 3} fontSize={9} fontWeight="800" fill={team.color} opacity={focus && team.id !== focus ? 0.5 : 1}>
                            {team.abbrev}
                        </SvgText>
                    ))}
                </Svg>
            </View>
            <Row gap={6} wrap>
                {data.teams.map((team) => {
                    const active = focus === team.id;
                    return (
                        <Pressable
                            key={team.id}
                            onPress={() => setPicked((current) => (current === team.id ? null : team.id))}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, borderRadius: radius.pill, paddingHorizontal: 10, backgroundColor: active ? colors.ink : colors.raised }}
                        >
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: team.color }} />
                            <Txt size={12} weight="bold" color={active ? colors.bg : colors.ink}>
                                {team.abbrev}
                            </Txt>
                        </Pressable>
                    );
                })}
            </Row>
            {data.isPreviousSeason && (
                <Txt size={11} tone="faint">
                    {t('race.previous')}
                </Txt>
            )}
        </Card>
    );
};
