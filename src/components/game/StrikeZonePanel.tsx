import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AtBat, GameDetail } from '../../types';
import { arsenal, atBatForZone, battersFaced, eventName, inningBreak, isWhiff, pitchTypeColor, pitchesByPitcher } from '../../lib/baseball';
import { lastName } from '../../lib/format';
import { useColors } from '../../theme/theme';
import { alpha, radius } from '../../theme/tokens';
import { Card, Row, Segmented, Txt } from '../ui';
import { StrikeZone } from './StrikeZone';
import { uniformColors } from './BatterFigure';
import { PitchList } from './PitchList';
import { InningBreak } from './InningBreak';

type Mode = 'atBat' | 'pitcher';

const BatterChip: React.FC<{ active: boolean; onPress: () => void; label: string; live?: boolean }> = ({ active, onPress, label, live }) => {
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: active ? colors.ink : colors.raised }}
        >
            <Txt size={12} weight="semibold" color={active ? colors.bg : colors.muted}>
                {label}
            </Txt>
            {live && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live }} />}
        </Pressable>
    );
};

// Zona completa: el turno pitcheo a pitcheo, o todos los pitcheos del lanzador (por bateador o todos) con su repertorio
export const StrikeZonePanel: React.FC<{ game: GameDetail; atBat?: AtBat | null }> = ({ game, atBat: forced }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [mode, setMode] = useState<Mode>('atBat');
    const { atBat: automatic, isPrevious } = atBatForZone(game);
    const atBat = forced ?? automatic;
    // Tras el tercer out y hasta el primer bateador de la otra mitad: espera animada en vez del último turno
    const pause = forced ? null : inningBreak(game);

    // El pitcheo marcado vale para ese turno y esa vista; al cambiar de turno se limpia solo
    const [selection, setSelection] = useState<{ key: string; index: number | null }>({ key: '', index: null });
    const selectionKey = `${atBat?.i ?? ''}-${mode}`;
    const selected = selection.key === selectionKey ? selection.index : null;
    const setSelected = (index: number | null) => setSelection({ key: selectionKey, index });

    // Vista del lanzador: sigue al bateador del turno (null) o al que se eligió; 'all' = todos
    const [pick, setPick] = useState<{ atBat: number | null; batter: number | 'all' | null }>({ atBat: null, batter: null });
    const batterPick = pick.atBat === (atBat?.i ?? null) ? pick.batter : null;
    const setBatterPick = (batter: number | 'all' | null) => setPick({ atBat: atBat?.i ?? null, batter });

    const pitcher = atBat?.pitcher ?? null;
    const batters = useMemo(() => battersFaced(game.atBats, pitcher?.id), [game.atBats, pitcher?.id]);
    const batterId = batterPick === 'all' ? null : batterPick ?? atBat?.batter.id ?? null;
    const pitcherPitches = useMemo(() => pitchesByPitcher(game.atBats, pitcher?.id, batterId), [game.atBats, pitcher?.id, batterId]);
    const rows = useMemo(() => arsenal(pitcherPitches, i18n.language), [pitcherPitches, i18n.language]);
    // Sin rastreo no hay tipos de pitcheo: el resumen sale de los resultados, que siempre vienen
    const typed = pitcherPitches.some((pitch) => pitch.type);
    const located = pitcherPitches.some((pitch) => pitch.x !== null && pitch.z !== null);
    const summary = useMemo(() => {
        const count = (test: (code: string | null, r: string) => boolean) => pitcherPitches.filter((p) => test(p.code, p.r)).length;
        const strikes = count((_, r) => r === 'strike' || r === 'inplay');
        return [
            { label: t('zone.sumPitches'), value: String(pitcherPitches.length) },
            { label: t('zone.sumStrikes'), value: pitcherPitches.length ? `${strikes} · ${Math.round((strikes / pitcherPitches.length) * 100)}%` : '0' },
            { label: t('zone.sumBalls'), value: String(count((_, r) => r === 'ball' || r === 'hbp')) },
            { label: t('zone.whiffs'), value: String(pitcherPitches.filter(isWhiff).length) },
            { label: t('zone.sumFouls'), value: String(count((code) => code === 'F' || code === 'T' || code === 'L' || code === 'O' || code === 'R')) },
            { label: t('zone.inPlay'), value: String(count((_, r) => r === 'inplay')) }
        ];
    }, [pitcherPitches, t]);

    if (!atBat) {
        return (
            <Card>
                <Txt eyebrow>{t('zone.title')}</Txt>
                <Txt size={14} tone="muted" center style={{ paddingVertical: 40 }}>
                    {t('zone.empty')}
                </Txt>
            </Card>
        );
    }

    const status = !atBat.complete ? t('zone.currentAtBat') : isPrevious && !forced ? t('zone.previousAtBat', { result: eventName(atBat, i18n.language) }) : eventName(atBat, i18n.language);
    const orderedBatters = [...batters.filter((b) => b.id === atBat.batter.id), ...batters.filter((b) => b.id !== atBat.batter.id).reverse()];

    return (
        <Card padded={false} style={{ overflow: 'hidden' }}>
            <Row justify="space-between" wrap style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <Txt eyebrow>{t('zone.title')}</Txt>
                <Segmented<Mode>
                    small
                    value={mode}
                    onChange={setMode}
                    options={[
                        { value: 'atBat', label: t('zone.modeAtBat') },
                        { value: 'pitcher', label: t('zone.modePitcher') }
                    ]}
                />
            </Row>

            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                {mode === 'atBat' && pause ? (
                    <Row gap={8} wrap>
                        <Txt size={14} weight="semibold">
                            {t(pause.endedTop ? 'anim.inningEnd_top' : 'anim.inningEnd_bottom', { n: pause.inning })}
                        </Txt>
                        <Row gap={4} style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.raised }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: pause.next.color }} />
                            <Txt size={11} weight="semibold" tone="muted">
                                {t('zone.breakStatus')}
                            </Txt>
                        </Row>
                    </Row>
                ) : mode === 'atBat' ? (
                    <Row gap={8} wrap>
                        <Txt size={14}>
                            <Txt size={14} weight="semibold">
                                {atBat.batter.name}
                            </Txt>
                            <Txt size={14} tone="muted">
                                {' '}
                                {t('zone.facing')}{' '}
                            </Txt>
                            <Txt size={14} weight="semibold">
                                {atBat.pitcher.name}
                            </Txt>
                        </Txt>
                        <View style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: atBat.complete ? colors.raised : alpha(colors.live, 0.1) }}>
                            <Txt size={11} weight="semibold" color={atBat.complete ? colors.muted : colors.live}>
                                {status}
                            </Txt>
                        </View>
                    </Row>
                ) : (
                    <>
                        <Txt size={14}>
                            <Txt size={14} weight="semibold">
                                {pitcher?.name}
                            </Txt>
                            <Txt size={14} tone="muted">
                                {' · '}
                                {batterId === null
                                    ? t('zone.pitchesToday', { count: pitcherPitches.length })
                                    : t('zone.pitchesTo', { count: pitcherPitches.length, batter: batters.find((b) => b.id === batterId)?.name ?? atBat.batter.name })}
                            </Txt>
                        </Txt>
                        {/* Por bateador: el actual primero, luego los demás que ha enfrentado (el más reciente antes) y «Todos» */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 8 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 4 }} accessibilityLabel={t('zone.byBatter')}>
                            {orderedBatters.map((batter) => (
                                <BatterChip
                                    key={batter.id}
                                    active={batterId === batter.id}
                                    onPress={() => setBatterPick(batter.id === atBat.batter.id ? null : batter.id)}
                                    label={lastName(batter.name)}
                                    live={batter.id === atBat.batter.id && !atBat.complete}
                                />
                            ))}
                            <BatterChip active={batterId === null} onPress={() => setBatterPick('all')} label={t('zone.allBatters')} />
                        </ScrollView>
                    </>
                )}
            </View>

            {mode === 'atBat' && pause ? (
                <InningBreak pause={pause} />
            ) : mode === 'atBat' ? (
                <View style={{ padding: 16, gap: 16 }}>
                    <StrikeZone pitches={atBat.pitches} batterSide={atBat.batter.side} uniform={uniformColors(atBat.top ? game.away : game.home, !atBat.top)} selected={selected} onSelect={setSelected} />
                    <PitchList pitches={atBat.pitches} selected={selected} onSelect={setSelected} />
                </View>
            ) : !typed ? (
                <View style={{ padding: 16, gap: 12 }}>
                    {located && <StrikeZone pitches={pitcherPitches} mode="types" />}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {summary.map((item) => (
                            <View key={item.label} style={{ flexBasis: '30%', flexGrow: 1, backgroundColor: colors.raised, borderRadius: radius.tile, padding: 12, alignItems: 'center' }}>
                                <Txt size={20} weight="bold" tabular style={{ lineHeight: 22 }}>
                                    {item.value}
                                </Txt>
                                <Txt size={11} weight="semibold" tone="muted" style={{ marginTop: 4 }}>
                                    {item.label}
                                </Txt>
                            </View>
                        ))}
                    </View>
                    <Txt size={11} tone="faint" center>
                        {t('zone.untrackedPitcher')}
                    </Txt>
                </View>
            ) : (
                <View style={{ padding: 16, gap: 16 }}>
                    <StrikeZone pitches={pitcherPitches} mode="types" />
                    <View accessibilityLabel={t('zone.arsenal')}>
                        <Row gap={0} style={{ paddingBottom: 8 }}>
                            <Txt size={11} weight="semibold" tone="faint" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                {t('zone.pitchType')}
                            </Txt>
                            {[['%', 40], [t('zone.avgMph'), 52], [t('zone.whiffs'), 72]].map(([head, width]) => (
                                <Txt key={head} size={11} weight="semibold" tone="faint" style={{ width: width as number, textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                    {head}
                                </Txt>
                            ))}
                        </Row>
                        {rows.map((row) => (
                            <Row key={row.type} gap={0} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
                                <Row gap={8} style={{ flex: 1 }}>
                                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pitchTypeColor(row.type) }} />
                                    <Txt size={14} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
                                        {row.name}
                                    </Txt>
                                </Row>
                                <Txt size={14} tabular style={{ width: 40, textAlign: 'right' }}>
                                    {Math.round(row.share * 100)}
                                </Txt>
                                <Txt size={14} tabular style={{ width: 52, textAlign: 'right' }}>
                                    {row.avgMph ? row.avgMph.toFixed(1) : '—'}
                                </Txt>
                                <Txt size={14} tabular style={{ width: 72, textAlign: 'right' }}>
                                    {row.whiffs}
                                </Txt>
                            </Row>
                        ))}
                    </View>
                </View>
            )}
        </Card>
    );
};
