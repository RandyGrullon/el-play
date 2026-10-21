import React, { useEffect, useState } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { BatterLine, GameDetail } from '../../../../types';
import type { GamePro, ProBatter } from '../../../../lib/pro/juego';
import type { NameBook } from '../jugadas/model';
import { parseSubNote, seasonOf } from '../jugadas/model';
import { seasonLabel } from '../../../../lib/format';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { MOTION_EASE, MOTION_MS, ModuleHeader, useElementWidth, useMotion } from '../../kit';
import { RowIn, usePlayColors } from '../jugadas/parts';
import { ordinal } from '../jugadas/texts';

type Side = 'away' | 'home';

interface Row {
    line: BatterLine;
    pro?: ProBatter;
}

const COUNTS = ['ab', 'r', 'h', 'rbi', 'bb', 'k'] as const;
const EXTRAS = ['d', 't', 'sb', 'hbp', 'sf', 'lob'] as const;
const SEASON = ['obp', 'ops'] as const;
const EXTRA_WIDTH = 30;
const SEASON_WIDTH = 46;
const HEAD_HEIGHT = 36;

const num = (value: number | null | undefined) => (value === null || value === undefined ? '—' : value);

// Columna del modo Expandido: su ancho crece de 0 a su medida (300 ms) y se encoge al volver a Básico
const Reveal: React.FC<{ reveal: SharedValue<number>; width: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ reveal, width, children, style }) => {
    const animated = useAnimatedStyle(() => ({ width: reveal.get() * width, opacity: reveal.get() }));
    return (
        <Animated.View style={[{ overflow: 'hidden', alignSelf: 'stretch' }, animated]}>
            <View style={[{ width, flex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 4 }, style]}>{children}</View>
        </Animated.View>
    );
};

// Bateo del equipo: primera columna fija (nombre y posición), Básico (VB C H CI BB K AVG) o Expandido
// (+ 2B 3B BR GP ES LOB y OBP/OPS de la temporada, que se deslizan de lado). Emergentes con su letra y la nota de
// MLB en español. La vista básica cabe sin deslizar: los números tienen ancho fijo y el nombre se lleva el resto;
// a 320 px las cifras van condensadas y la posición baja debajo del nombre.
export const BattingCard: React.FC<{ game: GameDetail; pro?: GamePro; side: Side; expanded: boolean; names: NameBook }> = ({ game, pro, side, expanded, names }) => {
    const { t, i18n } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const motion = useMotion();
    const { width, onLayout } = useElementWidth(358);
    const tableWidth = width - 24; // 16 px de relleno de la tarjeta; la tabla sale 4 px a cada lado
    const narrow = tableWidth < 290;
    const countWidth = narrow ? 20 : 24;
    const avgWidth = narrow ? 38 : 44;
    const nameWidth = Math.max(96, Math.min(170, tableWidth - COUNTS.length * countWidth - avgWidth));
    const twoLines = nameWidth < 128;
    const rowHeight = twoLines ? 44 : 40;

    // Las columnas del Expandido se montan al abrir y se desmontan al terminar de cerrarse
    const want = expanded && !!pro;
    const [mounted, setMounted] = useState(want);
    if (want && !mounted) setMounted(true);
    const reveal = useSharedValue(want ? 1 : 0);
    useEffect(() => {
        if (!motion.animate) {
            reveal.set(want ? 1 : 0);
            return;
        }
        reveal.set(withTiming(want ? 1 : 0, { duration: MOTION_MS.flip, easing: MOTION_EASE }));
        if (want) return;
        const timer = setTimeout(() => setMounted(false), MOTION_MS.flip);
        return () => clearTimeout(timer);
    }, [want, motion.animate, reveal]);
    const showExtra = motion.animate ? mounted : want;

    const team = game[side];
    const box = game.box[side];
    const proBox = pro?.box[side];
    const rows: Row[] = box.batters.map((line) => ({ line, pro: proBox?.batters.find((entry) => entry.id === line.id) }));
    const line = { borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) };
    const digits = (value: React.ReactNode, tone: 'ink' | 'muted' = 'ink', strong = false) => (
        <Txt size={narrow ? 15 : 13} condensed={narrow} weight={strong ? 'extrabold' : 'semibold'} tone={tone} tabular numberOfLines={1}>
            {value}
        </Txt>
    );
    const headText = (text: string) => (
        <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {text}
        </Txt>
    );
    const box2 = (cellWidth: number, height: number, content: React.ReactNode, key: string) => (
        <View key={key} style={{ width: cellWidth, height, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: narrow ? 3 : 4 }}>
            {content}
        </View>
    );

    const countCell = (row: Row, key: (typeof COUNTS)[number]) => {
        const value = row.line[key];
        return digits(value, value ? 'ink' : 'muted', key === 'h' && value > 0);
    };
    const extraValue = (row: Row, key: (typeof EXTRAS)[number]) => num(row.pro?.[key]);

    // Lo que oye el lector en cada fila (la parte que se desliza queda oculta para él)
    const rowAria = (row: Row) => {
        const pos = (row.pro?.pos ?? row.line.pos ?? '').split('-').pop();
        const parts = [
            `${row.pro?.note ? `${row.pro.note}- ` : ''}${names.full(row.line.id, row.line.name)}${pos ? `, ${pos}` : ''}${row.line.hr ? `, ${t('pro.box.bat.hrAria', { count: row.line.hr })}` : ''}`,
            ...COUNTS.map((key) => `${t(`pro.box.bat.${key}Title`)} ${row.line[key]}`),
            ...(want ? EXTRAS.map((key) => `${t(`pro.box.bat.${key}Title`)} ${extraValue(row, key)}`) : []),
            `${t('pro.box.bat.avgTitle')} ${row.line.avg ?? '—'}`,
            ...(want ? SEASON.map((key) => `${t(`pro.box.bat.${key}Title`)} ${row.pro?.season[key] ?? '—'}`) : [])
        ];
        return parts.join(', ');
    };

    const nameCell = (row: Row) => {
        const sub = row.pro?.order ? row.pro.order % 100 !== 0 : row.line.sub;
        // «PH-SS» → «SS»: la posición en la que quedó (que entró de emergente ya lo dice la letra)
        const pos = (row.pro?.pos ?? row.line.pos ?? '').split('-').pop();
        const hr = row.line.hr > 0 && (
            <View style={{ borderRadius: 4, backgroundColor: alpha(colors.gold, 0.15), paddingHorizontal: 4 }}>
                <Txt size={9.5} weight="extrabold" color={paint.tone(paint.pro.warn)} style={{ lineHeight: 14 }}>
                    HR{row.line.hr > 1 ? ` ${row.line.hr}` : ''}
                </Txt>
            </View>
        );
        const name = (
            <>
                {row.pro?.note ? (
                    <Txt size={twoLines ? 12.5 : 13} weight="extrabold">
                        {row.pro.note}-
                    </Txt>
                ) : null}
                {names.label(row.line.id, row.line.name)}
            </>
        );
        return (
            <View accessible accessibilityLabel={rowAria(row)} style={{ height: rowHeight, justifyContent: 'center', paddingLeft: sub ? (twoLines ? 8 : 14) : 4, paddingRight: 4 }}>
                {twoLines ? (
                    <>
                        <Txt size={12.5} weight="bold" numberOfLines={1} style={{ lineHeight: 16 }}>
                            {name}
                        </Txt>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Txt size={10} weight="semibold" tone="muted" style={{ lineHeight: 14 }}>
                                {pos}
                            </Txt>
                            {hr}
                        </View>
                    </>
                ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
                        <Txt size={13} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {name}
                        </Txt>
                        <Txt size={10.5} weight="semibold" tone="muted">
                            {pos}
                        </Txt>
                        {hr}
                    </View>
                )}
            </View>
        );
    };

    const totals = box.totals;
    const proTotals = proBox?.totals;
    const extraTotal = (key: (typeof EXTRAS)[number]) => (key === 'lob' ? num(totals.lob) : num(proTotals?.[key]));

    // Notas de emergentes («a- Ponchado como emergente por Made en la 8.ª»), en español si se entienden
    const notes = (proBox?.notes ?? []).map((note) => {
        const parsed = parseSubNote(note);
        const verb = parsed.verb && parsed.inning && !i18n.language.startsWith('en') ? (parsed.verb === 'ran' ? 'ran' : t(`pro.box.sub.verb.${parsed.verb}`, { defaultValue: '' })) : '';
        if (!verb) return { letter: parsed.letter, text: names.replace(parsed.text) };
        const who = names.replace(parsed.who ?? '');
        const inning = ordinal(parsed.inning as number, i18n.language);
        return { letter: parsed.letter, text: verb === 'ran' ? t('pro.box.sub.ran', { who, inning }) : t('pro.box.sub.text', { verb, who, inning }) };
    });
    const season = seasonOf(game.date, game.league);
    const games = team.record ? team.record.wins + team.record.losses : null;
    const teamLob = proTotals?.lob ?? null;
    const foot = [teamLob !== null ? t('pro.box.bat.teamLob', { count: teamLob }) : null, season && game.league === 'lidom' ? t(games ? 'pro.box.bat.seasonGames' : 'pro.box.bat.season', { season: seasonLabel(season, game.league), count: games ?? 0 }) : null]
        .filter(Boolean)
        .join(' · ');

    return (
        <View onLayout={onLayout} style={[{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16, paddingBottom: 12 }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <TeamLogo team={team} size={18} />
                </View>
                <ModuleHeader title={t('pro.box.bat.title', { team: team.name })} style={{ flex: 1 }} />
            </View>
            {rows.length === 0 ? (
                <Txt size={14} tone="muted" center style={{ paddingVertical: 24 }}>
                    {t('pro.box.noLineup')}
                </Txt>
            ) : (
                <View accessibilityLabel={t('pro.box.bat.caption', { team: team.name })} style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                    {/* Columna fija: el bateador */}
                    <View style={{ width: nameWidth }}>
                        <View style={{ height: HEAD_HEIGHT, justifyContent: 'center', paddingLeft: 4 }}>{headText(t('pro.box.bat.batter'))}</View>
                        {rows.map((row, index) => (
                            <RowIn key={row.line.id} index={index} play style={line}>
                                {nameCell(row)}
                            </RowIn>
                        ))}
                        <View
                            accessible
                            accessibilityLabel={t('pro.box.bat.totalsAria', { ab: num(totals.ab), r: num(totals.r), h: num(totals.h), rbi: num(totals.rbi), bb: num(totals.bb), k: num(totals.k), avg: totals.avg ?? '—' })}
                            style={{ height: 40, justifyContent: 'center', paddingLeft: 4, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.2) }}
                        >
                            <Txt size={13} weight="extrabold">
                                {t('pro.box.totals')}
                            </Txt>
                        </View>
                    </View>
                    {/* Las cifras: en Básico caben; en Expandido se deslizan de lado */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }} aria-hidden>
                        <View>
                            <View style={{ flexDirection: 'row', height: HEAD_HEIGHT }}>
                                {COUNTS.map((key) => box2(countWidth, HEAD_HEIGHT, headText(t(`pro.box.bat.${key}`)), key))}
                                {showExtra &&
                                    EXTRAS.map((key) => (
                                        <Reveal key={key} reveal={reveal} width={EXTRA_WIDTH}>
                                            {headText(t(`pro.box.bat.${key}`))}
                                        </Reveal>
                                    ))}
                                {box2(avgWidth, HEAD_HEIGHT, headText(t('pro.box.bat.avg')), 'avg')}
                                {showExtra &&
                                    SEASON.map((key) => (
                                        <Reveal key={key} reveal={reveal} width={SEASON_WIDTH}>
                                            {headText(t(`pro.box.bat.${key}`))}
                                        </Reveal>
                                    ))}
                            </View>
                            {rows.map((row, index) => (
                                <RowIn key={row.line.id} index={index} play style={[line, { flexDirection: 'row', height: rowHeight + 1 }]}>
                                    {COUNTS.map((key) => box2(countWidth, rowHeight, countCell(row, key), key))}
                                    {showExtra &&
                                        EXTRAS.map((key) => {
                                            const value = extraValue(row, key);
                                            return (
                                                <Reveal key={key} reveal={reveal} width={EXTRA_WIDTH}>
                                                    {digits(value, value ? 'ink' : 'muted')}
                                                </Reveal>
                                            );
                                        })}
                                    {box2(avgWidth, rowHeight, digits(row.line.avg ?? '—', 'muted'), 'avg')}
                                    {showExtra &&
                                        SEASON.map((key) => (
                                            <Reveal key={key} reveal={reveal} width={SEASON_WIDTH}>
                                                {digits(row.pro?.season[key] ?? '—', 'muted')}
                                            </Reveal>
                                        ))}
                                </RowIn>
                            ))}
                            <View style={{ flexDirection: 'row', height: 40, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.2) }}>
                                {COUNTS.map((key) => box2(countWidth, 39, digits(num(totals[key]), 'ink', true), key))}
                                {showExtra &&
                                    EXTRAS.map((key) => (
                                        <Reveal key={key} reveal={reveal} width={EXTRA_WIDTH}>
                                            {digits(extraTotal(key), 'ink', true)}
                                        </Reveal>
                                    ))}
                                {box2(avgWidth, 39, digits(totals.avg ?? '', 'ink', true), 'avg')}
                                {showExtra &&
                                    SEASON.map((key) => (
                                        <Reveal key={key} reveal={reveal} width={SEASON_WIDTH}>
                                            {digits(proTotals?.[key] ?? '', 'ink', true)}
                                        </Reveal>
                                    ))}
                            </View>
                        </View>
                    </ScrollView>
                </View>
            )}
            {(notes.length > 0 || foot) && (
                <View style={{ marginTop: 8, gap: 6 }}>
                    {notes.length > 0 && (
                        <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                            {notes.map((note) => (
                                <Txt key={note.letter} size={12} tone="muted">
                                    <Txt size={12} weight="extrabold">
                                        {note.letter}-
                                    </Txt>{' '}
                                    {note.text}{' '}
                                </Txt>
                            ))}
                        </Txt>
                    )}
                    {foot ? (
                        <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                            {foot}
                        </Txt>
                    ) : null}
                </View>
            )}
        </View>
    );
};
