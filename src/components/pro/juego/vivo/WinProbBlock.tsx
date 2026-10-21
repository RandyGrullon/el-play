import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Flame } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro, WinProb } from '../../../../lib/pro/juego';
import { describePlay, eventName } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { Chip, CountUp, ProNote, ProSection, WinProbChart, fmtPercent, lastName, useChipInk, type WinProbMarker } from '../../kit';
import { PRESSURE_MIN, basesBefore, highPressure, keyPlays, probBefore, winProbPoints } from './logic';
import { halfInning } from './parts';

// Probabilidad de ganar (MLB, por turno): área partida en el 50 % con el color de cada equipo, las 3 jugadas que
// más la movieron (se tocan para leerlas) y el chip de presión cuando el índice de presión llega a 2.

interface WinProbBlockProps {
    game: GameDetail;
    pro?: GamePro;
    winProb?: WinProb;
}

const fmtLi = (value: number) => `×${value.toFixed(2)}`;

export const WinProbBlock: React.FC<WinProbBlockProps> = ({ game, pro, winProb }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const liveInk = useChipInk('live');
    const narrow = useWindowDimensions().width < 360;
    const lang = i18n.language;
    const [picked, setPicked] = useState<number | null>(null);
    const live = game.state === 'live';
    const plays = winProb?.plays ?? [];
    const key = keyPlays(winProb, game.atBats);
    const selected = key.find((play) => play.i === picked) ?? key[0] ?? null;

    if (!plays.length) {
        return (
            <ProSection title={t('pro.vivo.wp.title')}>
                <ProNote tone="pending">{winProb ? t('pro.vivo.wp.none') : t('pro.vivo.wp.loading')}</ProNote>
            </ProSection>
        );
    }

    const { points, xOf } = winProbPoints(winProb);
    const lastPlay = plays[plays.length - 1];
    const last = winProb?.last ?? { home: lastPlay.home, away: 100 - lastPlay.home, li: lastPlay.li };
    const leader = last.away >= last.home ? 'away' : 'home';
    const innings = Math.max(game.scheduledInnings || 9, ...plays.map((play) => play.inning ?? 0));
    const maxLi = plays.reduce<{ li: number; i: number } | null>((best, play) => (typeof play.li === 'number' && (!best || play.li > best.li) ? { li: play.li, i: play.i } : best), null);
    const maxPlay = maxLi ? game.atBats.find((atBat) => atBat.i === maxLi.i) : null;
    const nowLi = live ? last.li : null;
    const pct = (value: number) => fmtPercent(value, 1, lang, true);

    const markers: WinProbMarker[] = key.map((play) => ({
        x: xOf.get(play.i) ?? 0,
        top: play.top,
        badge: String(play.rank),
        name: t('pro.vivo.wp.markerAria', {
            rank: play.rank,
            event: play.atBat ? eventName(play.atBat, lang) : '',
            name: play.atBat ? lastName(play.atBat.batter.name) : '',
            gain: pct(play.gain),
            team: game[play.side].abbrev
        }),
        onPress: () => setPicked(play.i),
        active: selected?.i === play.i
    }));

    const detail = selected?.atBat ?? null;
    const bases = detail ? basesBefore(pro?.plays.find((play) => play.i === detail.i)) : [];
    const before = selected ? probBefore(winProb, selected.i, selected.side) : null;
    const after = selected ? (selected.side === 'away' ? selected.top : 100 - selected.top) : null;

    return (
        <ProSection title={t('pro.vivo.wp.title')} bodyStyle={{ gap: 12 }}>
            {/* Visitante a la izquierda y local a la derecha, como la cabecera; el que va arriba en grande */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                {(['away', 'home'] as const).map((side) => {
                    const lead = side === leader;
                    return (
                        <View key={side} accessible accessibilityLabel={`${game[side].abbrev} ${pct(last[side])}`} style={{ flexDirection: side === 'home' ? 'row-reverse' : 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 }}>
                            <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: game[side].color, alignSelf: 'center' }} />
                            <Txt size={14} weight="extrabold" color={lead ? colors.ink : colors.muted}>
                                {game[side].abbrev}
                            </Txt>
                            {lead ? (
                                <Txt condensed size={narrow ? 34 : 40} tabular style={{ lineHeight: narrow ? 36 : 42 }}>
                                    <CountUp value={last[side]} format={pct} />
                                </Txt>
                            ) : (
                                <Txt condensed size={narrow ? 20 : 24} tone="muted" tabular>
                                    {pct(last[side])}
                                </Txt>
                            )}
                        </View>
                    );
                })}
            </View>
            <WinProbChart
                points={points}
                topTeam={game.away}
                bottomTeam={game.home}
                xDomain={[0, innings]}
                xTicks={Array.from({ length: innings }, (_, index) => ({ value: index + 0.5, label: String(index + 1), strong: live && game.inning?.n === index + 1 }))}
                markers={markers}
                live={live}
                height={168}
                label={t('pro.vivo.wp.aria', { away: game.away.abbrev, home: game.home.abbrev, awayPct: pct(last.away), homePct: pct(last.home), count: plays.length })}
            />

            {key.length > 0 && (
                <View accessibilityLabel={t('pro.vivo.wp.keyPlays')} style={{ flexDirection: narrow ? 'column' : 'row', gap: 8 }}>
                    {key.map((play) => {
                        const active = selected?.i === play.i;
                        return (
                            <Pressable
                                key={play.i}
                                onPress={() => setPicked(play.i)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={markers.find((marker) => marker.badge === String(play.rank))?.name}
                                style={{
                                    flex: narrow ? undefined : 1,
                                    flexBasis: narrow ? undefined : 0,
                                    minWidth: 0,
                                    minHeight: narrow ? 44 : 64,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                    borderRadius: radius.tile,
                                    paddingHorizontal: 6,
                                    paddingVertical: 8,
                                    backgroundColor: active ? alpha(colors.accent, 0.15) : colors.raised,
                                    borderWidth: 1,
                                    borderColor: active ? alpha(colors.accent, 0.4) : 'transparent'
                                }}
                            >
                                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, backgroundColor: active ? colors.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                                    <Txt size={11} weight="extrabold" color={active ? colors.bg : colors.ink} style={{ lineHeight: 13 }}>
                                        {play.rank}
                                    </Txt>
                                </View>
                                <View style={{ minWidth: 0, flexShrink: 1, flexDirection: narrow ? 'row' : 'column', alignItems: narrow ? 'baseline' : 'flex-start', gap: narrow ? 8 : 0 }}>
                                    <Txt condensed size={16} tabular numberOfLines={1}>
                                        +{pct(play.gain)}
                                    </Txt>
                                    <Txt size={11} weight="bold" tone="muted" numberOfLines={1}>
                                        {play.atBat ? lastName(play.atBat.batter.name) : game[play.side].abbrev}
                                    </Txt>
                                    {play.atBat && (
                                        <Txt size={11} tone="muted" numberOfLines={1}>
                                            {halfInning(play.atBat.inning, play.atBat.top, lang)}
                                        </Txt>
                                    )}
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            )}

            {selected && detail && (
                <View accessibilityLiveRegion="polite" style={{ borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12, gap: 6 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <Txt size={12} weight="extrabold" color={colors.accentInk} style={{ flex: 1, minWidth: '55%', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            {halfInning(detail.inning, detail.top, lang)} · {eventName(detail, lang)}
                            {bases.length > 0 ? ` ${t('pro.vivo.wp.withRunners', { count: bases.length, bases: bases.map((base) => t(`pro.vivo.base.${base}`)).join(t('pro.zona.and')) })}` : ''}
                        </Txt>
                        {highPressure(selected.li) && (
                            <Chip tone="live" icon={<Flame size={14} color={liveInk} />}>
                                {t('pro.vivo.wp.pressure', { value: fmtLi(selected.li as number) })}
                            </Chip>
                        )}
                    </View>
                    <Txt size={15} weight="semibold" style={{ lineHeight: 20 }}>
                        {describePlay(detail.desc, lang)}
                    </Txt>
                    {before !== null && after !== null && (
                        <Txt size={12} tone="muted">
                            {t('pro.vivo.wp.moved', { team: game[selected.side].abbrev, from: pct(before), to: pct(after) })}
                        </Txt>
                    )}
                </View>
            )}

            <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                {t('pro.vivo.wp.source', { min: PRESSURE_MIN })}
                {maxLi && maxPlay ? ` ${t('pro.vivo.wp.maxLi', { value: fmtLi(maxLi.li), event: eventName(maxPlay, lang).toLowerCase(), name: lastName(maxPlay.batter.name) })}` : ''}
                {typeof nowLi === 'number' ? ` ${t(highPressure(nowLi) ? 'pro.vivo.wp.nowHigh' : 'pro.vivo.wp.nowLi', { value: fmtLi(nowLi) })}` : ''}
            </Txt>
        </ProSection>
    );
};
