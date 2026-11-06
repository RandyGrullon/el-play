// Estadísticas colectivas (igual que components/stats/TeamStats.tsx de la web): bateo y pitcheo de cada equipo. Tarjetas
// con los mejores de la liga, ranking con barras en el color de cada equipo (con el promedio de la liga) y diferencia de
// carreras con el récord pitagórico; cada equipo abre su página.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { pythagorean } from '../../lib/advanced';
import { TEAM_HIGHLIGHTS, TEAM_SORTS, leagueAverage, rankTeams, recordOf, teamSort, type TeamGroup, type TeamRow } from '../../lib/teamStats';
import { useColors } from '../../theme/theme';
import { inkOn, radius, shadow } from '../../theme/tokens';
import { Card, Row, Segmented, TeamLogo, Txt } from '../ui';
import { ChipRow } from './common';

/** «AVG», «Jonrones», «EFE»… (las mismas claves de la página del equipo) */
const sortLabel = (t: TFunction, group: TeamGroup, key: string) => t(`team.sort.${group}.${key}`);

/** «+12», «-3», «0» */
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

export const TeamStatsView: React.FC<{ teams: TeamRow[]; onOpenTeam: (teamId: number) => void }> = ({ teams, onOpenTeam }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [group, setGroup] = useState<TeamGroup>('bat');
    const [key, setKey] = useState('avg');
    const sort = teamSort(group, key);
    const ranked = useMemo(() => rankTeams(teams, sort), [teams, sort]);
    const average = leagueAverage(teams, sort);
    const values = ranked.map((item) => item.value).filter((value): value is number => value !== null);
    const [min, max] = [Math.min(...values), Math.max(...values)];
    // La barra: el mejor llena, el peor deja un 18 % para que se vea (en los que menos es mejor, al revés)
    const share = (value: number) => (max === min ? 1 : 0.18 + 0.82 * (sort.asc ? (max - value) / (max - min) : (value - min) / (max - min)));
    const highlights = TEAM_HIGHLIGHTS[group]
        .map((highlightKey) => {
            const highlight = teamSort(group, highlightKey);
            const best = rankTeams(teams, highlight)[0];
            return best && best.value !== null ? { highlightKey, highlight, team: best.team, value: best.value } : null;
        })
        .filter((item) => item !== null);

    return (
        <View style={{ gap: 16 }}>
            <Segmented<TeamGroup>
                value={group}
                onChange={(value) => {
                    setGroup(value);
                    setKey(TEAM_SORTS[value][0].key);
                }}
                options={[
                    { value: 'bat', label: t('statsPage.teamBat') },
                    { value: 'pitch', label: t('statsPage.teamPitch') }
                ]}
            />

            {/* Los mejores de la liga en lo que más se mira */}
            <View accessibilityLabel={t('statsPage.teamLeaders')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {highlights.map(({ highlightKey, highlight, team, value }) => {
                    const ink = inkOn(team.color);
                    const label = sortLabel(t, group, highlightKey);
                    return (
                        <Pressable
                            key={highlightKey}
                            onPress={() => onOpenTeam(team.id)}
                            accessibilityRole="button"
                            accessibilityLabel={t('statsPage.teamBest', { stat: label, team: team.name, value: highlight.show(value) })}
                            style={({ pressed }) => [{ flexBasis: '45%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 22, padding: 12, backgroundColor: team.color, opacity: pressed ? 0.9 : 1 }, shadow('card')]}
                        >
                            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
                                <TeamLogo team={team} size={30} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt size={11} weight="bold" color={ink} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.85 }}>
                                    {label}
                                </Txt>
                                <Txt size={24} weight="extrabold" color={ink} tabular numberOfLines={1} style={{ lineHeight: 26 }}>
                                    {highlight.show(value)}
                                </Txt>
                                <Txt size={12} weight="bold" color={ink} numberOfLines={1} style={{ opacity: 0.85 }}>
                                    {team.abbrev}
                                </Txt>
                            </View>
                        </Pressable>
                    );
                })}
            </View>

            <ChipRow label={t('statsPage.sortBy')}>
                {TEAM_SORTS[group].map((option) => {
                    const active = option.key === sort.key;
                    return (
                        <Pressable
                            key={option.key}
                            onPress={() => setKey(option.key)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                            style={{ height: 36, borderRadius: radius.pill, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: active ? colors.accent : colors.raised }}
                        >
                            <Txt size={13} weight="bold" color={active ? '#fff' : colors.muted}>
                                {sortLabel(t, group, option.key)}
                            </Txt>
                        </Pressable>
                    );
                })}
            </ChipRow>

            <Card padded={false} style={{ overflow: 'hidden' }}>
                <View accessibilityLabel={t('statsPage.teamRanking', { stat: sortLabel(t, group, sort.key) })}>
                    {ranked.map(({ team, value }, index) => {
                        const record = recordOf(team);
                        return (
                            <Pressable
                                key={team.id}
                                onPress={() => onOpenTeam(team.id)}
                                accessibilityRole="button"
                                accessibilityLabel={t('statsPage.teamOpen', { team: team.name })}
                                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: pressed ? colors.raised : undefined }, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
                            >
                                <Txt size={16} weight="extrabold" tone="muted" center style={{ width: 20 }}>
                                    {value === null ? '·' : index + 1}
                                </Txt>
                                <TeamLogo team={team} size={36} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Row justify="space-between" align="baseline" gap={8}>
                                        <Txt size={15} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                            {team.name}
                                        </Txt>
                                        <Txt size={20} weight="extrabold" tabular style={{ lineHeight: 22 }}>
                                            {value === null ? '—' : sort.show(value)}
                                        </Txt>
                                    </Row>
                                    <View style={{ marginTop: 6, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.raised }}>
                                        <View style={{ height: '100%', width: `${value === null ? 0 : share(value) * 100}%`, borderRadius: 4, backgroundColor: team.color }} />
                                    </View>
                                    <Txt size={12} tone="muted" style={{ marginTop: 4 }}>
                                        {t('team.record', { w: record.w, l: record.l })}
                                        {record.diff !== null ? ` · ${t('team.diff', { diff: signed(record.diff) })}` : ''}
                                    </Txt>
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
                {average !== null && (
                    <Txt size={12} weight="semibold" tone="muted" style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 16, paddingVertical: 10 }}>
                        {t('statsPage.leagueAverage', { stat: sortLabel(t, group, sort.key), value: sort.show(average) })}
                        {sort.asc ? ` · ${t('statsPage.lowerIsBetter')}` : ''}
                    </Txt>
                )}
            </Card>

            <RunDifferential teams={teams} onOpen={onOpenTeam} />
        </View>
    );
};

/** Carreras anotadas contra permitidas de cada equipo y el récord que «debería» tener (expectativa pitagórica) */
export const RunDifferential: React.FC<{ teams: TeamRow[]; onOpen: (id: number) => void }> = ({ teams, onOpen }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const rows = teams
        .map((team) => ({ team, record: recordOf(team) }))
        .filter((row) => row.record.diff !== null)
        .sort((a, b) => (b.record.diff ?? 0) - (a.record.diff ?? 0));
    if (!rows.length) return null;
    const widest = Math.max(1, ...rows.map((row) => Math.abs(row.record.diff ?? 0)));
    return (
        <Card>
            <Txt eyebrow accessibilityRole="header">
                {t('statsPage.runDiff')}
            </Txt>
            <Txt size={12} tone="muted" style={{ marginTop: 2 }}>
                {t('statsPage.runDiffHint')}
            </Txt>
            <View style={{ marginTop: 12, gap: 10 }}>
                {rows.map(({ team, record }) => {
                    const diff = record.diff ?? 0;
                    const expected = pythagorean(record.scored, record.allowed, record.games);
                    const tint = diff > 0 ? colors.ball : diff < 0 ? colors.live : colors.muted;
                    return (
                        <Pressable key={team.id} onPress={() => onOpen(team.id)} accessibilityRole="button" accessibilityLabel={t('statsPage.teamOpen', { team: team.name })} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                            <Row gap={8}>
                                <TeamLogo team={team} size={22} />
                                <Txt size={14} weight="bold">
                                    {team.abbrev}
                                </Txt>
                                <Txt size={12} tone="muted" tabular numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                    {t('statsPage.runsFor', { scored: record.scored, allowed: record.allowed })}
                                    {expected ? ` · ${t('statsPage.expected', { w: expected.wins, l: expected.losses })}` : ''}
                                </Txt>
                                <Txt size={16} weight="extrabold" tabular color={tint} style={{ textAlign: 'right' }}>
                                    {signed(diff)}
                                </Txt>
                            </Row>
                            {/* Barra que sale del centro: a la derecha si anota más de lo que permite */}
                            <View style={{ marginTop: 4, height: 6, borderRadius: 3, backgroundColor: colors.raised }}>
                                <View style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: colors.line }} />
                                <View
                                    style={[
                                        { position: 'absolute', top: 0, bottom: 0, borderRadius: 3, backgroundColor: diff >= 0 ? colors.ball : colors.live },
                                        diff >= 0 ? { left: '50%', width: `${(diff / widest) * 50}%` } : { right: '50%', width: `${(-diff / widest) * 50}%` }
                                    ]}
                                />
                            </View>
                        </Pressable>
                    );
                })}
            </View>
        </Card>
    );
};
