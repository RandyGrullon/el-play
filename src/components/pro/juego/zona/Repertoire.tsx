import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AtBat, LeagueId } from '../../../../types';
import { pitchTypeName } from '../../../../lib/baseball';
import { seasonLabel } from '../../../../lib/format';
import { useColors } from '../../../../theme/theme';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { Enter, GrowBar, ModuleHeader, ProSection, fmtPercent } from '../../kit';
import { arsenalSeason, isStrike, isSwing, isWhiff, typeMix, useArsenal, useSeasonContext, usageByCount, type PitchItem, type TypeMixRow } from '../vivo/logic';
import { fmtInches, fmtMph } from '../vivo/parts';
import { TypeStack, seenSentence } from './ZoneCard';
import { pitchColor } from './ZoneField';

// Repertorio del juego en tarjetas, una por tipo: uso, velocidad media y máxima, giro, abanicados (una sola regla:
// swings sin contacto entre swings) y quiebres; más el uso por conteo (primer pitcheo y con 2 strikes).

interface RepertoireProps {
    items: PitchItem[];
    /** Turnos del lanzador (para el uso por conteo); sin ellos no sale ese bloque */
    atBats?: AtBat[];
    title: string;
    /** «a 9 bateadores» o «de 3 lanzadores» */
    against: string;
    /** Lanzador del repertorio: con él sale su temporada (MLB pitchArsenal) al lado de lo de hoy */
    pitcherId?: number | null;
    league?: LeagueId;
    gamePk?: number | null;
}

const pct = (part: number, total: number, lang: string) => (total ? fmtPercent(part / total, 0, lang) : '—');

const Tile: React.FC<{ value: string; label: string }> = ({ value, label }) => {
    const colors = useColors();
    return (
        <View accessible accessibilityLabel={`${value} ${label}`} style={{ flex: 1, flexBasis: 0, minWidth: 0, borderRadius: 12, backgroundColor: colors.raised, paddingHorizontal: 8, paddingVertical: 8 }}>
            <Txt condensed size={20} tabular numberOfLines={1} style={{ lineHeight: 22 }}>
                {value}
            </Txt>
            <Txt size={10} weight="semibold" tone="muted" style={{ marginTop: 2, lineHeight: 12 }}>
                {label}
            </Txt>
        </View>
    );
};

export const Repertoire: React.FC<RepertoireProps> = ({ items, atBats, title, against, pitcherId, league = 'lidom', gamePk = null }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    // Temporada del lanzador: si hoy es su primer juego, la anterior (la vigente sería solo lo de hoy)
    const context = useSeasonContext(pitcherId, league, gamePk, !!pitcherId);
    const arsenal = useArsenal(league, pitcherId, arsenalSeason(context), !!pitcherId && !!context).data;
    const seasonName = arsenal?.season ? seasonLabel(arsenal.season, league) : null;
    const withToday = !!arsenal?.season && context?.season === arsenal.season;
    const seasonLine = (type: string) => {
        if (!arsenal?.season || !seasonName) return null;
        const row = arsenal.types.find((entry) => entry.type === type);
        return row ? t('pro.zona.rep.seasonType', { season: seasonName, pct: row.pct !== null ? fmtPercent(row.pct, 1, lang, true) : '—', mph: fmtMph(row.mph, lang) ?? '—' }) : t('pro.zona.rep.seasonNone', { season: seasonName });
    };
    const rows = typeMix(items);
    const typed = items.some((item) => item.pitch.type);
    if (!items.length) return null;
    const strikes = items.filter((item) => isStrike(item.pitch)).length;
    const swings = items.filter((item) => isSwing(item.pitch)).length;
    const whiffs = items.filter((item) => isWhiff(item.pitch)).length;
    const big = rows.filter((row) => row.count > 1);
    const small = rows.filter((row) => row.count === 1);
    const usage = atBats ? usageByCount(atBats) : null;
    const name = (row: Pick<TypeMixRow, 'type'>) => pitchTypeName({ type: row.type === '??' ? null : row.type, typeDesc: null }, lang);
    const seasonOnly = typed && arsenal?.season && seasonName ? arsenal.types.filter((entry) => !rows.some((row) => row.type === entry.type)) : [];

    return (
        <ProSection title={title} bodyStyle={{ gap: 12 }}>
            <Txt size={12} tone="muted">
                {t('pro.zona.rep.summary', { count: items.length, against, strikes, whiffs, swings })}
            </Txt>
            {!typed && (
                <Txt size={12} tone="muted">
                    {t('pro.zona.rep.noTypes')}
                </Txt>
            )}
            {typed &&
                big.map((row, index) => {
                    const color = pitchColor({ type: row.type, r: 'strike' }, true, colors);
                    const move = [row.ivb !== null ? `IVB ${fmtInches(row.ivb, lang)}` : null, row.hb !== null ? `HB ${fmtInches(row.hb, lang)}` : null, t('pro.zona.rep.strikesPct', { value: pct(row.strikes, row.count, lang) })].filter(Boolean);
                    const line = seasonLine(row.type);
                    return (
                        <Enter key={row.type} index={index} style={[{ borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 14 }, shadow('card')]}>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                <View style={{ marginTop: 6, width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
                                <Txt size={17} weight="black" style={{ flex: 1, minWidth: 0, lineHeight: 22 }}>
                                    {name(row)}{' '}
                                    <Txt size={12} weight="bold" tone="muted">
                                        {t('pro.zona.rep.typeCount', { code: row.type, count: row.count })}
                                    </Txt>
                                </Txt>
                                <View accessible accessibilityLabel={`${fmtMph(row.share * 100, lang)} ${t('pro.zona.rep.usePct')}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                                    <Txt condensed size={30} tabular style={{ lineHeight: 32 }}>
                                        {fmtMph(row.share * 100, lang)}
                                    </Txt>
                                    <Txt size={11} weight="bold" tone="muted">
                                        {t('pro.zona.rep.usePct')}
                                    </Txt>
                                </View>
                            </View>
                            <GrowBar value={row.share} color={color} index={index} style={{ marginTop: 8 }} />
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                                <Tile value={fmtMph(row.avgMph, lang) ?? '—'} label={t('pro.zona.rep.avgMph')} />
                                <Tile value={fmtMph(row.maxMph, lang) ?? '—'} label={t('pro.zona.rep.maxMph')} />
                                <Tile value={row.avgSpin !== null ? String(Math.round(row.avgSpin)) : '—'} label="rpm" />
                                <Tile value={pct(row.whiffs, row.swings, lang)} label={t('pro.zona.rep.whiffOf', { whiffs: row.whiffs, swings: row.swings })} />
                            </View>
                            <Txt size={12} tone="muted" style={{ marginTop: 8 }}>
                                {move.join(' · ')}
                            </Txt>
                            {line && (
                                <Txt size={12} weight="semibold" color={colors.accentInk} style={{ marginTop: 4 }}>
                                    {line}
                                </Txt>
                            )}
                        </Enter>
                    );
                })}
            {typed &&
                small.map((row) => {
                    const item = items.find((entry) => (entry.pitch.type || '??') === row.type)!;
                    const color = pitchColor({ type: row.type, r: 'strike' }, true, colors);
                    const line = seasonLine(row.type);
                    const parts = [
                        fmtMph(item.pitch.mph, lang) ? `${fmtMph(item.pitch.mph, lang)} mph` : null,
                        typeof item.pitch.spin === 'number' ? `${item.pitch.spin} rpm` : null,
                        item.pitch.call ? (isSwing(item.pitch) ? (isWhiff(item.pitch) ? t('pro.zona.rep.oneWhiff') : t('pro.zona.rep.oneContact')) : t('pro.zona.rep.oneTake')) : null,
                        row.ivb !== null ? `IVB ${fmtInches(row.ivb, lang)}` : null,
                        row.hb !== null ? `HB ${fmtInches(row.hb, lang)}` : null
                    ].filter(Boolean);
                    return (
                        <View key={row.type} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12 }}>
                            <View style={{ marginTop: 4, width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt size={12} tone="muted" style={{ lineHeight: 18 }}>
                                    <Txt size={15} weight="black">
                                        {name(row)}
                                    </Txt>{' '}
                                    <Txt size={12} weight="bold" tone="muted">
                                        {t('pro.zona.rep.single', { code: row.type, pct: fmtPercent(row.share, 1, lang) })}
                                    </Txt>
                                </Txt>
                                <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                                    {parts.join(' · ')}
                                </Txt>
                                {line && (
                                    <Txt size={12} weight="semibold" color={colors.accentInk}>
                                        {line}
                                    </Txt>
                                )}
                            </View>
                        </View>
                    );
                })}

            {typed && usage && usage.first.total > 0 && (
                <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12, gap: 10 }}>
                    <ModuleHeader title={t('pro.zona.rep.byCount')} />
                    {(['first', 'twoStrikes'] as const).map((key) =>
                        usage[key].total ? (
                            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={{ width: 96 }}>
                                    <Txt size={13} weight="extrabold">
                                        {t(`pro.zona.rep.${key}`)}
                                    </Txt>
                                    <Txt size={12} tone="muted">
                                        {t(`pro.zona.rep.${key}Sub`, { count: usage[key].total })}
                                    </Txt>
                                </View>
                                <TypeStack rows={usage[key].types} total={usage[key].total} label={`${t(`pro.zona.rep.${key}`)}: ${seenSentence(t, usage[key].types, (type) => name({ type }))}`} style={{ flex: 1, width: undefined }} />
                            </View>
                        ) : null
                    )}
                </View>
            )}
            {/* Tipos que tiró en la temporada y hoy no */}
            {seasonOnly.length > 0 && seasonName ? (
                <Txt size={12} tone="muted">
                    {t('pro.zona.rep.seasonOnly', {
                        season: seasonName,
                        list: seasonOnly.map((entry) => `${name(entry)} ${entry.pct !== null ? fmtPercent(entry.pct, 1, lang, true) : ''}`.trim()).join(', ')
                    })}
                </Txt>
            ) : null}
            {arsenal?.season && seasonName ? (
                <Txt size={12} tone="muted">
                    {t(withToday ? 'pro.zona.rep.seasonNoteToday' : 'pro.zona.rep.seasonNote', { season: seasonName, count: arsenal.total ?? 0 })}
                </Txt>
            ) : null}
            <Txt size={12} tone="muted">
                {t('pro.zona.rep.whiffRule')}
            </Txt>
        </ProSection>
    );
};
