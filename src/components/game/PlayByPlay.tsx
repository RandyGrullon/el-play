import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react-native';
import type { AtBat, GameDetail } from '../../types';
import { describePlay, eventName, eventTone, inningName } from '../../lib/baseball';
import { useColors } from '../../theme/theme';
import { alpha } from '../../theme/tokens';
import { Card, Row, Segmented, Txt } from '../ui';
import { StrikeZone } from './StrikeZone';
import { uniformColors } from './BatterFigure';
import { PitchList } from './PitchList';
import { toneColors } from './colors';

interface PlayByPlayProps {
    game: GameDetail;
    limit?: number;
    /** Solo los últimos turnos, sin filtro ni agrupación */
    compact?: boolean;
}

// Jugada a jugada, de la más reciente a la más vieja, agrupada por media entrada; al tocar una se ve su zona
export const PlayByPlay: React.FC<PlayByPlayProps> = ({ game, limit, compact = false }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [filter, setFilter] = useState<'all' | 'scoring'>('all');
    const [open, setOpen] = useState<number | null>(null);

    // Más reciente primero; el turno en curso solo si ya tiene pitcheos
    const plays = useMemo(() => {
        let list = game.atBats.filter((atBat) => atBat.complete || atBat.pitches.length > 0).slice().reverse();
        if (filter === 'scoring') list = list.filter((atBat) => atBat.scoring);
        return limit ? list.slice(0, limit) : list;
    }, [game.atBats, filter, limit]);

    const groups = useMemo(() => {
        const result: { key: string; label: string; plays: AtBat[] }[] = [];
        for (const atBat of plays) {
            const key = `${atBat.inning}-${atBat.top}`;
            const last = result[result.length - 1];
            if (last?.key === key) last.plays.push(atBat);
            else result.push({ key, label: inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language), plays: [atBat] });
        }
        return result;
    }, [plays, i18n.language]);

    const row = (atBat: AtBat, position: number) => {
        const expanded = open === atBat.i;
        const team = atBat.top ? game.away : game.home;
        const tone = atBat.complete ? toneColors(colors, eventTone(atBat.event)) : { bg: alpha(colors.live, 0.1), ink: colors.live };
        return (
            <View key={atBat.i} style={{ borderTopWidth: position ? 1 : 0, borderTopColor: colors.line }}>
                <Pressable
                    onPress={() => setOpen(expanded ? null : atBat.i)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? alpha(colors.raised, 0.5) : 'transparent' })}
                >
                    <View style={{ marginTop: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: team.color }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Row gap={8} wrap>
                            <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: tone.bg }}>
                                <Txt size={11} weight="bold" color={tone.ink} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {atBat.complete ? eventName(atBat, i18n.language) : t('plays.inProgress')}
                                </Txt>
                            </View>
                            {atBat.scoring && atBat.away !== null && (
                                <Txt size={12} weight="semibold" tabular>
                                    {game.away.abbrev} {atBat.away} · {game.home.abbrev} {atBat.home}
                                </Txt>
                            )}
                            {compact && (
                                <Txt size={11} tone="faint">
                                    {inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language, true)}
                                </Txt>
                            )}
                        </Row>
                        <Txt size={14} style={{ marginTop: 4, lineHeight: 19 }}>
                            {atBat.complete ? describePlay(atBat.desc, i18n.language) : t('plays.atBatNow', { batter: atBat.batter.name, pitcher: atBat.pitcher.name })}
                        </Txt>
                        {atBat.actions.length > 0 && (
                            <Txt size={12} tone="muted" style={{ marginTop: 4 }}>
                                {atBat.actions.map((action) => describePlay(action.desc, i18n.language)).join(' ')}
                            </Txt>
                        )}
                    </View>
                    <Row gap={4}>
                        {atBat.pitches.length > 0 && (
                            <Txt size={12} tone="faint">
                                {t('plays.pitches', { count: atBat.pitches.length })}
                            </Txt>
                        )}
                        <ChevronDown size={16} color={colors.faint} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
                    </Row>
                </Pressable>
                {expanded && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
                        <StrikeZone pitches={atBat.pitches} batterSide={atBat.batter.side} uniform={uniformColors(team, !atBat.top)} maxWidth={280} />
                        <PitchList pitches={atBat.pitches} newestFirst={false} />
                    </View>
                )}
            </View>
        );
    };

    if (compact) return <View>{plays.map(row)}</View>;

    return (
        <Card padded={false} style={{ overflow: 'hidden' }}>
            <Row justify="space-between" style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <Txt eyebrow>{t('plays.title')}</Txt>
                <Segmented
                    small
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: t('plays.all') },
                        { value: 'scoring', label: t('plays.scoring') }
                    ]}
                />
            </Row>
            {groups.length === 0 ? (
                <Txt size={14} tone="muted" center style={{ paddingHorizontal: 16, paddingVertical: 40 }}>
                    {filter === 'scoring' ? t('plays.noScoring') : t('plays.none')}
                </Txt>
            ) : (
                groups.map((group) => (
                    <View key={group.key}>
                        <View style={{ backgroundColor: colors.raised, paddingHorizontal: 16, paddingVertical: 6 }}>
                            <Txt size={12} weight="bold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                {group.label}
                            </Txt>
                        </View>
                        {group.plays.map(row)}
                    </View>
                ))
            )}
        </Card>
    );
};
