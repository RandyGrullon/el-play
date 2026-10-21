import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Radar, ShieldCheck } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { atBatForZone, pitchTypeName } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { uniformColors } from '../../../game/BatterFigure';
import { Chip, ProSection, lastName, readableInk, shortName, useElementWidth, useProColors } from '../../kit';
import { ZoneField, pitchColor } from '../zona/ZoneField';
import { SpringUp, absLine } from '../zona/PitchCard';
import { countBefore, hbView, pitchItems, typeMix } from './logic';
import { CountDots, RunnerDiamond, absOf, callText, fmtInches, fmtMph, heightText, isBetween, ordinal, placeText } from './parts';

// Situación PRO: diamante grande con los corredores, el conteo y los outs; la zona con el bateador uniformado y
// los pitcheos del turno del color de su tipo; la lista del turno y la ficha del último pitcheo (o del elegido),
// con su lugar en palabras, el rastreo que haya y el reto ABS.

interface SituationBlockProps {
    game: GameDetail;
    pro?: GamePro;
    onOpenZone: () => void;
}

export const SituationBlock: React.FC<SituationBlockProps> = ({ game, pro, onOpenZone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const lang = i18n.language;
    const { atBat } = atBatForZone(game);
    // El pitcheo elegido es del turno en que se eligió: con otro turno se vuelve al último
    const [picked, setPicked] = useState<{ turn: number; k: number } | null>(null);
    const items = useMemo(() => (atBat ? pitchItems([atBat], pro) : []), [atBat, pro]);
    const selected = picked && picked.turn === atBat?.i && picked.k < items.length ? picked.k : null;
    const toggle = (k: number) => setPicked(selected === k ? null : atBat ? { turn: atBat.i, k } : null);

    const batting = game.inning?.isTop ? game.away : game.home;
    const between = isBetween(game);
    const typed = items.some(({ pitch }) => pitch.type);
    const mix = typeMix(items);
    const index = selected ?? items.length - 1;
    const item = items[index];
    // A 320 px el diamante se achica para que quepan el conteo y los puntos
    const { width, onLayout } = useElementWidth(340);
    const narrow = width < 300;
    const twoCols = width >= 320;
    const reviews = (pro?.plays ?? []).flatMap((play) => play.pitches.filter((pitch) => absOf(pitch)).map((pitch) => ({ play, pitch })));

    const zoneLink = (
        <Pressable onPress={onOpenZone} accessibilityRole="button" accessibilityLabel={t('pro.kit.game.openZone')} hitSlop={8} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, marginVertical: -12 }}>
            <Txt size={13} weight="bold" color={colors.accentInk}>
                {t('pro.kit.game.fullZone')}
            </Txt>
            <ChevronRight size={16} color={colors.accentInk} />
        </Pressable>
    );

    const resultInk = (r: string) => (r === 'ball' || r === 'hbp' ? proColors.up : r === 'inplay' ? colors.accentInk : proColors.down);

    return (
        <ProSection title={t('pro.kit.game.situation')} aside={zoneLink} bodyStyle={{ gap: 12 }}>
            <View onLayout={onLayout} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <RunnerDiamond runners={between ? { first: null, second: null, third: null } : game.runners} color={batting.color} size={narrow ? 104 : 128} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ alignItems: 'center' }}>
                        <Txt condensed size={narrow ? 42 : 52} tabular style={{ lineHeight: narrow ? 42 : 52 }}>
                            {between ? '—' : `${game.count.balls}-${game.count.strikes}`}
                        </Txt>
                        <Txt size={11} weight="semibold" tone="muted">
                            {between ? t('pro.vivo.between') : t('pro.vivo.count')}
                        </Txt>
                    </View>
                    {!between && <CountDots balls={game.count.balls} strikes={game.count.strikes} outs={game.count.outs} />}
                </View>
            </View>

            {atBat && !between && (
                <>
                    <View style={{ borderRadius: 20, backgroundColor: alpha(colors.raised, 0.6), paddingHorizontal: 8, paddingBottom: 8, paddingTop: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 }}>
                            <View accessibilityLabel={t('pro.zona.types')} style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                                {typed &&
                                    mix.map((row) => (
                                        <View key={row.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pitchColor({ type: row.type, r: 'strike' }, true, colors) }} />
                                            <Txt size={12} weight="extrabold">
                                                {pitchTypeName({ type: row.type === '??' ? null : row.type, typeDesc: null }, lang)}
                                            </Txt>
                                        </View>
                                    ))}
                            </View>
                            <Txt size={11} weight="semibold" tone="muted" style={{ flexShrink: 0 }}>
                                {t('pro.vivo.catcherView')}
                            </Txt>
                        </View>
                        <ZoneField
                            items={items}
                            inner="number"
                            batterSide={atBat.batter.side}
                            uniform={uniformColors(batting, !atBat.top)}
                            selected={selected}
                            onSelect={toggle}
                            label={t('pro.vivo.zoneAria', { batter: atBat.batter.name, pitcher: atBat.pitcher.name, count: items.length })}
                        />
                        {!items.length && (
                            <Txt size={12} weight="semibold" tone="muted" center style={{ paddingBottom: 8 }}>
                                {t('pro.vivo.waiting', { name: lastName(atBat.batter.name) })}
                            </Txt>
                        )}
                    </View>

                    {items.length > 0 && (
                        <View accessibilityLabel={t('pro.vivo.pitchList')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {items.map(({ pitch }, k) => {
                                const color = pitchColor(pitch, typed, colors);
                                const active = index === k;
                                const mph = fmtMph(pitch.mph, lang);
                                const call = `${callText(pitch, lang)}${pitch.b !== null && pitch.s !== null && pitch.r !== 'inplay' ? ` · ${t('pro.vivo.leaves', { value: `${pitch.b}-${pitch.s}` })}` : ''}`;
                                return (
                                    <Pressable
                                        key={k}
                                        onPress={() => toggle(k)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: selected === k }}
                                        accessibilityLabel={`${k + 1}: ${pitchTypeName(pitch, lang)}${mph ? ` ${mph} mph` : ''}, ${call}`}
                                        style={{
                                            width: twoCols ? (width - 6) / 2 : '100%',
                                            minHeight: 44,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 8,
                                            borderRadius: 12,
                                            paddingHorizontal: 8,
                                            paddingVertical: 6,
                                            backgroundColor: active ? alpha(proColors.warn, 0.14) : alpha(colors.raised, 0.7),
                                            borderWidth: 1,
                                            borderColor: active ? alpha(proColors.warn, 0.35) : 'transparent'
                                        }}
                                    >
                                        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                                            <Txt size={11} weight="extrabold" color={readableInk(color)} style={{ lineHeight: 13 }}>
                                                {k + 1}
                                            </Txt>
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Txt size={13} weight="extrabold" numberOfLines={1}>
                                                {pitchTypeName(pitch, lang)}
                                                {mph ? ` · ${mph} mph` : ''}
                                            </Txt>
                                            <Txt size={11} weight="bold" color={resultInk(pitch.r)} numberOfLines={1}>
                                                {call}
                                            </Txt>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}

                    {item && (
                        <SpringUp key={`${atBat.i}-${index}`}>
                            <View accessibilityLiveRegion="polite" style={{ borderRadius: radius.tile, backgroundColor: colors.raised, padding: 14, gap: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                                        {selected === null ? t('pro.vivo.lastPitch', { n: ordinal(index + 1, lang) }) : t('pro.vivo.pitchN', { n: ordinal(index + 1, lang) })}
                                    </Txt>
                                    <Chip tone={item.pitch.r === 'ball' || item.pitch.r === 'hbp' ? 'up' : item.pitch.r === 'inplay' ? 'accent' : 'down'}>
                                        {callText(item.pitch, lang) +
                                            (item.pitch.r !== 'inplay' && item.pitch.b !== null && item.pitch.s !== null
                                                ? ` · ${t(countBefore(atBat.pitches, index).balls === item.pitch.b && countBefore(atBat.pitches, index).strikes === item.pitch.s ? 'pro.vivo.stays' : 'pro.vivo.leaves', { value: `${item.pitch.b}-${item.pitch.s}` })}`
                                                : '')}
                                    </Chip>
                                </View>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}>
                                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pitchColor(item.pitch, typed, colors), alignSelf: 'center' }} />
                                    <Txt size={17} weight="extrabold">
                                        {pitchTypeName(item.pitch, lang)}
                                    </Txt>
                                    {fmtMph(item.pitch.mph, lang) && (
                                        <Txt condensed size={28} tabular style={{ lineHeight: 30 }}>
                                            {fmtMph(item.pitch.mph, lang)} mph
                                        </Txt>
                                    )}
                                    {fmtMph(item.pro?.end, lang) && (
                                        <Txt size={14} weight="semibold" tone="muted">
                                            → {fmtMph(item.pro?.end, lang)}
                                        </Txt>
                                    )}
                                    {typeof item.pitch.spin === 'number' && (
                                        <Txt size={14} tone="muted">
                                            · {item.pitch.spin} rpm
                                        </Txt>
                                    )}
                                </View>
                                {(typeof item.pro?.ivb === 'number' || typeof item.pro?.hb === 'number') && (
                                    <Txt size={14} tone="muted">
                                        {[typeof item.pro?.ivb === 'number' ? `IVB ${fmtInches(item.pro.ivb, lang)}` : null, typeof item.pro?.hb === 'number' ? `HB ${fmtInches(hbView(item.pro), lang)}` : null].filter(Boolean).join(' · ')}
                                    </Txt>
                                )}
                                {(() => {
                                    const place = placeText(t, item.pitch, atBat.batter.side);
                                    const height = heightText(t, item.pitch.z, lang);
                                    return place || height ? (
                                        <Txt size={14}>
                                            {t('pro.vivo.location')} <Txt size={14} weight="extrabold">{place ?? ''}</Txt>
                                            {place && height ? ', ' : ''}
                                            {height}
                                            {item.pitch.est ? ` ${t('pro.vivo.estimated')}` : ''}
                                        </Txt>
                                    ) : null;
                                })()}
                                {typeof item.pro?.end !== 'number' && typeof item.pro?.ivb !== 'number' && (
                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                                        <Radar size={14} color={colors.muted} style={{ marginTop: 2 }} />
                                        <Txt size={12} tone="muted" style={{ flexShrink: 1 }}>
                                            {t('pro.vivo.noTrackingPitch')}
                                        </Txt>
                                    </View>
                                )}
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                                    <ShieldCheck size={14} color={colors.muted} style={{ marginTop: 2 }} />
                                    <Txt size={12} tone="muted" style={{ flexShrink: 1 }}>
                                        {absLine(t, item, pro) ?? t('pro.vivo.abs.none')}
                                    </Txt>
                                </View>
                                {reviews.length > 0 && (
                                    <View style={{ marginTop: 2, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingTop: 8, gap: 4 }}>
                                        <Txt size={12} weight="bold" tone="muted">
                                            {t('pro.vivo.abs.today', { count: reviews.length })}
                                        </Txt>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                                            {reviews.map(({ play, pitch }, k) => {
                                                const who = pitch.rev?.player ? pro?.players?.[String(pitch.rev.player)]?.name : null;
                                                return (
                                                    <Txt key={`${play.i}-${k}`} size={12} weight="semibold">
                                                        <Txt size={12} weight="extrabold" color={pitch.rev?.over ? proColors.up : proColors.down}>
                                                            {pitch.rev?.over ? '✓ ' : '✗ '}
                                                        </Txt>
                                                        {who ? shortName(who) : t('pro.vivo.abs.someone')}, {t(pitch.rev?.over ? 'pro.vivo.abs.overturned' : 'pro.vivo.abs.confirmed')}
                                                    </Txt>
                                                );
                                            })}
                                        </View>
                                    </View>
                                )}
                            </View>
                        </SpringUp>
                    )}
                </>
            )}
        </ProSection>
    );
};
