import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro, WinProb } from '../../../../lib/pro/juego';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { Enter, ProNote, ProSection, WinProbChart, fmtSigned, lastName, useProColors } from '../../kit';
import { inningLabel } from '../previa/logica';
import { floorAfter, inningStarts, keySwings, peakFor, type Side } from './logica';
import { headlineOf, resultText } from './text';

// Probabilidad de ganar completa (MLB, por turno): área en los dos colores con las 3 jugadas clave que se pueden
// tocar (en la gráfica o en los botones de abajo), el pico del que perdió y desde cuándo el ganador no bajó de
// cierto número.

export const WinProbBlock: React.FC<{ game: GameDetail; pro?: GamePro; winProb: WinProb }> = ({ game, pro, winProb }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const lang = i18n.language;
    const swings = keySwings(winProb, game.atBats);
    const [selected, setSelected] = useState(0);
    const winner: Side = game.home.isWinner ? 'home' : 'away';
    const loser: Side = winner === 'away' ? 'home' : 'away';
    const last = winProb.last;
    const final = last ? (winner === 'home' ? last.home : last.away) : null;
    const peak = peakFor(winProb, loser);
    const first = swings[0];
    const floor = first && first.side === winner ? floorAfter(winProb, winner, first.play.i) : null;
    const starts = inningStarts(winProb.plays);
    const points = winProb.plays.map((play, x) => ({ x, top: 100 - play.home }));

    if (!winProb.plays.length) {
        return (
            <ProSection title={t('pro.final.wp.title')} aside={t('pro.final.wp.aside')}>
                <ProNote tone="neutral">{t('pro.final.wp.none')}</ProNote>
            </ProSection>
        );
    }

    const markers = swings.map((swing, index) => {
        const x = winProb.plays.findIndex((play) => play.i === swing.play.i);
        return {
            x,
            top: 100 - swing.play.home,
            badge: String(index + 1),
            name: t('pro.final.wp.marker', { n: index + 1, name: headlineOf(swing.atBat, t, lang), gain: fmtSigned(swing.gain, 1), team: game[swing.side].abbrev }),
            onPress: () => setSelected(index),
            active: selected === index
        };
    });
    const current = swings[Math.min(selected, swings.length - 1)];
    const result = current ? resultText(game, pro, current.atBat, t) : '';

    return (
        <ProSection title={t('pro.final.wp.title')} aside={t('pro.final.wp.aside')}>
            <View style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                {final !== null ? (
                    <View accessible accessibilityLabel={`${Math.round(final)} %, ${t('pro.final.wp.atEnd', { team: game[winner].abbrev })}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                            <TeamLogo team={game[winner]} size={21} />
                        </View>
                        <View>
                            <Txt condensed size={28} tabular style={{ lineHeight: 30 }}>{`${Math.round(final)} %`}</Txt>
                            <Txt size={11} weight="semibold" tone="muted">
                                {t('pro.final.wp.atEnd', { team: game[winner].abbrev })}
                            </Txt>
                        </View>
                    </View>
                ) : null}
                {peak && peak.value > 50 ? (
                    <View accessible accessibilityLabel={`${t('pro.final.wp.peak', { team: game[loser].abbrev })}: ${peak.value.toFixed(1)} %${peak.play.inning !== null ? `, ${inningLabel(peak.play.inning, peak.play.top, lang)}` : ''}`} style={{ alignItems: 'flex-end' }}>
                        <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                            {t('pro.final.wp.peak', { team: game[loser].abbrev })}
                        </Txt>
                        <Txt condensed size={22} tabular color={proColors.down} style={{ lineHeight: 24 }}>{`${peak.value.toFixed(1)} %`}</Txt>
                        {peak.play.inning !== null ? (
                            <Txt size={11} weight="semibold" tone="muted">
                                {inningLabel(peak.play.inning, peak.play.top, lang)}
                            </Txt>
                        ) : null}
                    </View>
                ) : null}
            </View>
            {floor !== null && first ? (
                <Txt size={12} tone="muted" style={{ marginBottom: 10, lineHeight: 16 }}>
                    {t('pro.final.wp.floor', { play: headlineOf(first.atBat, t, lang, true), team: game[winner].abbrev, value: floor.toFixed(1) })}
                </Txt>
            ) : null}

            <WinProbChart
                points={points}
                topTeam={game.away}
                bottomTeam={game.home}
                height={176}
                xDomain={[0, Math.max(1, points.length - 1)]}
                xTicks={starts.map((start) => ({ value: start.index, label: String(start.inning) }))}
                markers={markers}
                label={t('pro.final.wp.aria', {
                    away: game.away.abbrev,
                    home: game.home.abbrev,
                    winner: game[winner].abbrev,
                    final: final !== null ? Math.round(final) : '—',
                    peakTeam: game[loser].abbrev,
                    peak: peak ? peak.value.toFixed(1) : '—'
                })}
            />

            {swings.length > 0 ? (
                <>
                    <View accessibilityLabel={t('pro.final.wp.keys')} style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
                        {swings.map((swing, index) => {
                            const active = selected === index;
                            return (
                                <Pressable
                                    key={swing.play.i}
                                    onPress={() => setSelected(index)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={markers[index].name}
                                    style={({ pressed }) => ({
                                        flex: 1,
                                        flexBasis: 0,
                                        minWidth: 0,
                                        minHeight: 44,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                        borderRadius: radius.tile,
                                        paddingHorizontal: 8,
                                        paddingVertical: 8,
                                        backgroundColor: active ? alpha(colors.gold, 0.16) : colors.raised,
                                        borderWidth: 1,
                                        borderColor: active ? colors.gold : 'transparent',
                                        opacity: pressed ? 0.85 : 1
                                    })}
                                >
                                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
                                        <Txt size={10} weight="extrabold" color="#14151a">
                                            {index + 1}
                                        </Txt>
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Txt size={12} weight="extrabold" numberOfLines={1}>
                                            {lastName(swing.atBat.batter.name)}
                                        </Txt>
                                        <Txt condensed size={13} tabular numberOfLines={1}>{`${fmtSigned(swing.gain, 1)} %`}</Txt>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                    {current ? (
                        <Enter key={current.play.i} accessibilityLiveRegion="polite" style={{ marginTop: 10, gap: 4, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 14, paddingVertical: 12 }}>
                            <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                                {[inningLabel(current.atBat.inning, current.atBat.top, lang), current.play.li !== null ? t('pro.final.wp.pressure', { value: current.play.li.toFixed(2) }) : null].filter(Boolean).join(' · ')}
                            </Txt>
                            <Txt size={14} weight="bold" style={{ lineHeight: 19 }}>
                                {headlineOf(current.atBat, t, lang)}
                                {result ? `: ${result}` : ''}
                            </Txt>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: game[current.side].color }} />
                                <Txt condensed size={15} tabular>
                                    {t('pro.final.wp.change', { team: game[current.side].abbrev, from: current.before.toFixed(1), to: current.after.toFixed(1) })}
                                </Txt>
                            </View>
                        </Enter>
                    ) : null}
                </>
            ) : null}
        </ProSection>
    );
};
