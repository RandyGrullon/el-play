import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react-native';
import type { GameDetail, PitcherLine } from '../../types';
import type { GamePro, ProPitcher } from '../../lib/pro/juego';
import { trackingLevel } from '../../lib/pro/juego';
import { pitchTypeName } from '../../lib/baseball';
import { useColors } from '../../theme/theme';
import { alpha, shadow } from '../../theme/tokens';
import { TeamLogo, Txt } from '../ui';
import { Chip, Enter, GradientCard, GrowBar, LineChart, LiveDot, ModuleHeader, ProNote, ScatterChart, fmtPercent, fmtSigned, useChipInk, type ScatterPoint } from './kit';
import { fastballTrend, pitchItems, typeMix, type PitchItem, type TypeMixRow } from './juego/vivo/logic';
import { Avatar, fmtInches, fmtMph, ordinal } from './juego/vivo/parts';
import { TypeStack } from './juego/zona/ZoneCard';
import { pitchColor } from './juego/zona/ZoneField';

// Pestaña «Lanzadores» del juego PRO: todos los lanzadores que han tirado, de los dos equipos y sin tope. El que
// está lanzando va arriba en grande (línea, pitcheos, mezcla, velocidad de la recta y movimiento); los demás en
// tarjetas compactas por equipo (línea, mezcla, velocidad de la recta en miniatura) que se abren al tocarlas.

interface LiveProPanelProps {
    game: GameDetail;
    /** Extras PRO del juego (quiebres, box ampliado); sin ellos sale lo del Lite */
    pro?: GamePro;
}

interface PitcherEntry {
    id: number;
    name: string;
    hand: string | null;
    side: 'away' | 'home';
    items: PitchItem[];
    line: PitcherLine | null;
    box: ProPitcher | null;
    /** Primera y última entrada en que lanzó (del juego) */
    innings: [number, number] | null;
}

type T = (key: string, options?: Record<string, unknown>) => string;

const STATS = ['ip', 'h', 'r', 'er', 'bb', 'k'] as const;

const typeName = (row: Pick<TypeMixRow, 'type'>, lang: string) => pitchTypeName({ type: row.type === '??' ? null : row.type, typeDesc: null }, lang);

/** «Relevo · 4.ª a 6.ª», «Abridor» */
const roleLine = (t: T, entry: PitcherEntry, lang: string) => {
    const role = entry.box ? t(entry.box.starter ? 'pro.vivo.duel.starter' : 'pro.vivo.duel.reliever') : null;
    const innings = entry.innings ? (entry.innings[0] === entry.innings[1] ? ordinal(entry.innings[0], lang) : t('pro.vivo.pitchers.innings', { from: ordinal(entry.innings[0], lang), to: ordinal(entry.innings[1], lang) })) : null;
    return [role, innings].filter(Boolean).join(' · ');
};

/** «1.2 IP · 6 H · 4 C · 4 CL · 0 BB · 1 K · 1 HR» */
const lineText = (t: T, line: PitcherLine) =>
    [...STATS.map((key) => `${line[key]} ${t(`pro.vivo.stat.${key}.short`)}`), line.hr ? `${line.hr} ${t('pro.vivo.stat.hr.short')}` : null].filter(Boolean).join(' · ');

const lineAria = (t: T, line: PitcherLine) => STATS.map((key) => `${line[key]} ${t(`pro.vivo.stat.${key}.name`)}`).join(', ');

/** Chip con el cambio de velocidad de la recta desde su primera entrada */
const DeltaChip: React.FC<{ delta: number | null; inning: number; small?: boolean }> = ({ delta, inning }) => {
    const { t } = useTranslation();
    if (delta === null) return <Chip>{t('pro.vivo.pitchers.oneInning')}</Chip>;
    return <Chip tone={delta <= -1 ? 'down' : delta >= 1 ? 'up' : 'neutral'}>{t('pro.vivo.pitchers.delta', { value: fmtSigned(delta, 1), inning })}</Chip>;
};

/** Velocidad de la recta en miniatura (decorativa: el rango va escrito al lado) */
const Spark: React.FC<{ speeds: number[]; color: string }> = ({ speeds, color }) => {
    if (speeds.length < 2) return null;
    const min = Math.min(...speeds);
    const max = Math.max(...speeds);
    const w = 64;
    const h = 22;
    const points = speeds.map((mph, index) => `${((index / (speeds.length - 1)) * w).toFixed(1)},${(h - 2 - ((mph - min) / Math.max(0.1, max - min)) * (h - 4)).toFixed(1)}`).join(' ');
    return (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Svg width={w} height={h}>
                <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
        </View>
    );
};

/** Lista de tipos con su uso, velocidad media y máxima y giro */
const MixRows: React.FC<{ rows: TypeMixRow[] }> = ({ rows }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    return (
        <View style={{ gap: 2 }}>
            {rows.map((row) => (
                <View key={row.type} accessible style={{ minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pitchColor({ type: row.type, r: 'strike' }, true, colors) }} />
                    <Txt size={13} weight="extrabold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {typeName(row, lang)}{' '}
                        <Txt size={12} weight="semibold" tone="muted">
                            {fmtPercent(row.share, 0, lang)}
                        </Txt>
                    </Txt>
                    {fmtMph(row.avgMph, lang) ? (
                        <Txt condensed size={16} tabular>
                            {fmtMph(row.avgMph, lang)}
                            <Txt size={11} weight="semibold" tone="muted">{` ${t('pro.vivo.pitchers.max', { value: fmtMph(row.maxMph, lang) })}`}</Txt>
                        </Txt>
                    ) : (
                        <Txt size={12} tone="muted">
                            {t('pro.zona.pitches', { count: row.count })}
                        </Txt>
                    )}
                    {row.avgSpin !== null && (
                        <Txt size={12} tone="muted" tabular style={{ width: 64, textAlign: 'right' }}>
                            {Math.round(row.avgSpin)} rpm
                        </Txt>
                    )}
                </View>
            ))}
        </View>
    );
};

/** Velocidad de la recta pitcheo a pitcheo con el promedio de su primera entrada */
const SpeedTrend: React.FC<{ entry: PitcherEntry }> = ({ entry }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const trend = fastballTrend(entry.items);
    if (!trend || trend.points.length < 3) return null;
    const speeds = trend.points.map((point) => point.mph);
    const color = pitchColor({ type: trend.type, r: 'strike' }, true, colors);
    const type = pitchTypeName({ type: trend.type, typeDesc: null }, lang);
    return (
        <View style={{ gap: 6 }}>
            <ModuleHeader title={t('pro.vivo.pitchers.trendTitle')} aside={<DeltaChip delta={trend.delta} inning={trend.firstInning} />} />
            <LineChart
                height={130}
                label={t('pro.vivo.pitchers.trendAria', { name: entry.name, type, first: fmtMph(speeds[0], lang), last: fmtMph(speeds[speeds.length - 1], lang) })}
                yDomain={[Math.floor(Math.min(...speeds) - 1), Math.ceil(Math.max(...speeds) + 1)]}
                xDomain={[1, Math.max(2, entry.items.length)]}
                formatY={(value) => String(value)}
                reference={typeof trend.firstAvg === 'number' ? { y: trend.firstAvg } : undefined}
                series={[{ id: trend.type, name: type, color, points: trend.points.map((point) => ({ x: point.n, y: point.mph })), endDot: true }]}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                    <Txt size={11} weight="semibold" tone="muted">
                        {type}
                    </Txt>
                </View>
                {typeof trend.firstAvg === 'number' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 14, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }} />
                        <Txt size={11} weight="semibold" tone="muted">
                            {t('pro.vivo.pitchers.firstAvg', { inning: ordinal(trend.firstInning, lang) })}
                        </Txt>
                    </View>
                )}
                <Txt size={11} weight="semibold" tone="muted">
                    {t('pro.vivo.pitchers.byNumber')}
                </Txt>
            </View>
        </View>
    );
};

/** Nube de movimiento IVB vs HB por tipo (con rastreo) o la nota honesta */
const Movement: React.FC<{ entry: PitcherEntry; rows: TypeMixRow[] }> = ({ entry, rows }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const moved = rows.filter((row) => row.ivb !== null && row.hb !== null);
    const limit = Math.max(20, ...moved.map((row) => Math.ceil(Math.max(Math.abs(row.ivb as number), Math.abs(row.hb as number)) / 5) * 5 + 5));
    const inches = (value: number) => (value ? `${value < 0 ? '−' : ''}${Math.abs(value)}″` : '0');
    if (!moved.length) {
        return entry.items.some((item) => item.pitch.type) ? (
            <ProNote tone="pending" title={t('pro.zona.move.title')}>
                {t('pro.vivo.pitchers.moveNone')}
            </ProNote>
        ) : null;
    }
    const points: ScatterPoint[] = moved.map((row) => ({
        id: row.type,
        x: row.hb as number,
        y: row.ivb as number,
        color: pitchColor({ type: row.type, r: 'strike' }, true, colors),
        name: `${typeName(row, lang)}: IVB ${fmtInches(row.ivb, lang)}, HB ${fmtInches(row.hb, lang)}`,
        label: row.type,
        r: 6,
        halo: row.spread ? Math.max(9, Math.min(30, row.spread * 3)) : undefined
    }));
    return (
        <View style={{ gap: 6 }}>
            <ModuleHeader title={t('pro.zona.move.title')} />
            <ScatterChart
                points={points}
                height={200}
                xDomain={[-limit, limit]}
                yDomain={[-limit, limit]}
                refX={{ value: 0 }}
                refY={{ value: 0 }}
                formatX={inches}
                formatY={inches}
                xLabel={t('pro.zona.move.x')}
                yLabel="IVB"
                label={t('pro.zona.move.aria', { name: entry.name, list: points.map((point) => point.name).join('; ') })}
            />
        </View>
    );
};

/** Tarjeta grande: el que está lanzando (o una compacta abierta) */
const FullCard: React.FC<{ game: GameDetail; entry: PitcherEntry; current: boolean; onCollapse?: () => void }> = ({ game, entry, current, onCollapse }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const liveInk = useChipInk('live');
    const lang = i18n.language;
    const team = game[entry.side];
    const mix = typeMix(entry.items);
    const typed = entry.items.some((item) => item.pitch.type);
    const line = entry.line;
    const box = entry.box;
    const pitches = line?.np ?? entry.items.length;
    const strikes = line?.st ?? entry.items.filter((item) => item.pitch.r === 'strike' || item.pitch.r === 'inplay').length;
    const hand = entry.hand ? t(`pro.vivo.hand.throws.${entry.hand}`, { defaultValue: entry.hand }) : null;
    const sub = [team.abbrev, box?.number ? `#${box.number}` : null, hand, entry.innings ? t('pro.vivo.pitchers.entered', { inning: ordinal(entry.innings[0], lang) }) : null].filter(Boolean).join(' · ');
    const extras = box
        ? [
              box.bf !== null ? t('pro.vivo.pitchers.bf', { count: box.bf }) : null,
              box.go !== null && box.ao !== null ? t('pro.vivo.pitchers.goao', { go: box.go, ao: box.ao }) : null,
              box.ir ? t('pro.vivo.pitchers.inherited', { ir: box.ir, irs: box.irs }) : null,
              box.hld ? t('pro.vivo.pitchers.hold') : null,
              box.gs !== null && box.starter ? t('pro.vivo.pitchers.gameScore', { value: box.gs }) : null
          ].filter(Boolean)
        : [];

    const header = (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Avatar person={{ id: entry.id, name: entry.name }} team={team} size={46} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={17} weight="black" numberOfLines={1} accessibilityRole="header">
                    {entry.name}
                </Txt>
                <Txt size={12} tone="muted" numberOfLines={2}>
                    {sub}
                </Txt>
            </View>
            {current ? (
                <Chip tone="live" icon={<LiveDot size={6} color={liveInk} />}>
                    {t('pro.vivo.pitchers.nowChip')}
                </Chip>
            ) : onCollapse ? (
                <Pressable onPress={onCollapse} accessibilityRole="button" accessibilityLabel={t('pro.vivo.pitchers.collapse', { name: entry.name })} hitSlop={8} style={{ width: 44, height: 44, marginTop: -8, marginRight: -8, alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronDown size={20} color={colors.muted} style={{ transform: [{ rotate: '180deg' }] }} />
                </Pressable>
            ) : null}
        </View>
    );

    const body = (
        <View style={{ gap: 14 }}>
            {header}
            {line && (
                <View accessible accessibilityLabel={lineAria(t, line)} style={{ flexDirection: 'row', gap: 6 }}>
                    {STATS.map((key) => (
                        <View key={key} style={{ flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', borderRadius: 12, backgroundColor: colors.raised, paddingVertical: 8 }}>
                            <Txt condensed size={20} tabular style={{ lineHeight: 22 }}>
                                {line[key]}
                            </Txt>
                            <Txt size={10} weight="bold" tone="muted">
                                {t(`pro.vivo.stat.${key}.short`)}
                            </Txt>
                        </View>
                    ))}
                </View>
            )}
            {extras.length > 0 && (
                <Txt size={11} tone="muted" center>
                    {extras.join(' · ')}
                </Txt>
            )}
            <View accessible accessibilityLabel={`${t('pro.zona.pitches', { count: pitches })}, ${t('pro.vivo.pitchers.strikesPct', { count: strikes, pct: pitches ? fmtPercent(strikes / pitches, 0, lang) : '—' })}`} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <Txt size={13} weight="extrabold">
                        {t('pro.zona.pitches', { count: pitches })}
                    </Txt>
                    <Txt size={12} weight="semibold" tone="muted">
                        {t('pro.vivo.pitchers.strikesPct', { count: strikes, pct: pitches ? fmtPercent(strikes / pitches, 0, lang) : '—' })}
                    </Txt>
                </View>
                <GrowBar value={Math.min(1, pitches / 100)} color={colors.strike} height={8} />
            </View>
            {typed && entry.items.length > 0 && (
                <View style={{ gap: 8 }}>
                    <ModuleHeader title={t('pro.vivo.pitchers.mixTitle')} />
                    <TypeStack rows={mix} total={entry.items.length} label={t('pro.vivo.pitchers.mixAria', { list: mix.map((row) => `${typeName(row, lang)} ${row.count}`).join(', ') })} />
                    <MixRows rows={mix} />
                </View>
            )}
            <SpeedTrend entry={entry} />
            <Movement entry={entry} rows={mix} />
        </View>
    );

    return current ? (
        <GradientCard accessibilityLabel={entry.name} innerStyle={{ padding: 16 }}>
            {body}
        </GradientCard>
    ) : (
        <View accessibilityLabel={entry.name} style={[{ borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16 }, shadow('card')]}>
            {body}
        </View>
    );
};

/** Tarjeta compacta: línea, mezcla, recta en miniatura y cambio de velocidad. Se abre al tocarla. */
const CompactCard: React.FC<{ game: GameDetail; entry: PitcherEntry; onExpand: () => void }> = ({ game, entry, onExpand }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const team = game[entry.side];
    const mix = typeMix(entry.items);
    const typed = entry.items.some((item) => item.pitch.type);
    const trend = fastballTrend(entry.items);
    const speeds = trend?.points.map((point) => point.mph) ?? [];
    const line = entry.line;
    const pitches = line?.np ?? entry.items.length;
    const strikes = line?.st ?? entry.items.filter((item) => item.pitch.r === 'strike' || item.pitch.r === 'inplay').length;
    return (
        <Pressable
            onPress={onExpand}
            accessibilityRole="button"
            accessibilityLabel={`${entry.name}, ${roleLine(t, entry, lang)}. ${t('pro.zona.pitches', { count: pitches })}. ${line ? lineAria(t, line) : ''}`}
            accessibilityHint={t('pro.vivo.pitchers.expand')}
            style={({ pressed }) => [{ borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 14, gap: 10, opacity: pressed ? 0.9 : 1 }, shadow('card')]}
        >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Avatar person={{ id: entry.id, name: entry.name }} team={team} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={15} weight="black" numberOfLines={1}>
                        {entry.name}
                    </Txt>
                    <Txt size={12} tone="muted" numberOfLines={1}>
                        {roleLine(t, entry, lang)}
                    </Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Txt condensed size={24} tabular style={{ lineHeight: 26 }}>
                        {pitches}
                    </Txt>
                    <Txt size={10} weight="bold" tone="muted">
                        {t('pro.vivo.pitchers.strikesShort', { count: strikes })}
                    </Txt>
                </View>
            </View>
            {line && (
                <Txt condensed size={15} tabular numberOfLines={2}>
                    {lineText(t, line)}
                </Txt>
            )}
            {typed && entry.items.length > 0 && (
                <>
                    <View style={{ height: 8, flexDirection: 'row', borderRadius: 4, overflow: 'hidden', backgroundColor: alpha(colors.line, 0.1) }}>
                        {mix.map((row, index) => (
                            <View key={row.type} style={{ width: `${row.share * 100}%`, backgroundColor: pitchColor({ type: row.type, r: 'strike' }, row.type !== '??', colors), borderLeftWidth: index ? 2 : 0, borderLeftColor: colors.surface }} />
                        ))}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 }}>
                            {mix.map((row) => (
                                <View key={row.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pitchColor({ type: row.type, r: 'strike' }, true, colors) }} />
                                    <Txt size={11} weight="semibold" tone="muted">
                                        {`${typeName(row, lang)} ${fmtPercent(row.share, 0, lang)}${fmtMph(row.avgMph, lang) ? ` · ${fmtMph(row.avgMph, lang)}` : ''}`}
                                    </Txt>
                                </View>
                            ))}
                        </View>
                        {trend && speeds.length > 1 && (
                            <View style={{ alignItems: 'flex-end' }}>
                                <Spark speeds={speeds} color={colors.ink} />
                                <Txt size={10} weight="semibold" tone="muted" tabular>
                                    {t('pro.vivo.pitchers.range', { type: pitchTypeName({ type: trend.type, typeDesc: null }, lang).toLowerCase(), min: fmtMph(Math.min(...speeds), lang), max: fmtMph(Math.max(...speeds), lang) })}
                                </Txt>
                            </View>
                        )}
                    </View>
                </>
            )}
            {trend && speeds.length > 1 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <DeltaChip delta={trend.delta} inning={trend.firstInning} />
                    <ChevronDown size={18} color={colors.muted} />
                </View>
            )}
        </Pressable>
    );
};

export const LiveProPanel: React.FC<LiveProPanelProps> = ({ game, pro }) => {
    const { t } = useTranslation();
    const currentId = game.state === 'live' ? (game.matchup?.pitcher.id ?? null) : null;
    const [open, setOpen] = useState<number[]>([]);

    // Lanzadores en el orden en que entraron, con sus pitcheos del juego (y su ficha PRO si llegó)
    const entries = useMemo(() => {
        const list: PitcherEntry[] = [];
        for (const atBat of game.atBats) {
            const id = atBat.pitcher.id;
            if (!id || list.some((entry) => entry.id === id)) continue;
            const side = atBat.top ? 'home' : 'away';
            const innings = game.atBats.filter((item) => item.pitcher.id === id).map((item) => item.inning);
            const box = pro?.box[side].pitchers.find((row) => row.id === id) ?? null;
            list.push({
                id,
                name: atBat.pitcher.name,
                hand: atBat.pitcher.hand,
                side,
                items: pitchItems(game.atBats, pro, (item) => item.pitcher.id === id),
                line: game.box[side].pitchers.find((row) => row.id === id) ?? null,
                box,
                innings: box?.inn ?? (innings.length ? [Math.min(...innings), Math.max(...innings)] : null)
            });
        }
        return list;
    }, [game.atBats, game.box, pro]);

    if (!entries.length) return <ProNote tone="neutral">{t('pro.vivo.pitchers.none')}</ProNote>;

    const current = entries.find((entry) => entry.id === currentId) ?? null;
    const toggle = (id: number) => setOpen((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
    // El equipo del que lanza va primero, como en el diseño
    const order: ('away' | 'home')[] = current?.side === 'home' ? ['home', 'away'] : ['away', 'home'];

    return (
        <View style={{ gap: 16 }}>
            {pro && trackingLevel(pro) === 'none' && <ProNote tone="pending">{t('pro.vivo.pitchers.noTracking')}</ProNote>}
            {current && <FullCard game={game} entry={current} current />}
            {order.map((side) => {
                const list = entries.filter((entry) => entry.side === side && entry.id !== currentId).reverse();
                const all = entries.filter((entry) => entry.side === side);
                if (!list.length) return null;
                const total = all.reduce((sum, entry) => sum + (entry.line?.np ?? entry.items.length), 0);
                return (
                    <View key={side} accessibilityLabel={game[side].name} style={{ gap: 10 }}>
                        <ModuleHeader
                            title={
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                                    <TeamLogo team={game[side]} size={20} />
                                    <Txt size={14} weight="extrabold" accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1 }}>
                                        {game[side].teamName || game[side].name}
                                    </Txt>
                                </View>
                            }
                            aside={t('pro.vivo.pitchers.teamTotal', { count: all.length, pitches: total })}
                        />
                        {list.map((entry, index) => (
                            <Enter key={entry.id} index={index}>
                                {open.includes(entry.id) ? <FullCard game={game} entry={entry} current={false} onCollapse={() => toggle(entry.id)} /> : <CompactCard game={game} entry={entry} onExpand={() => toggle(entry.id)} />}
                            </Enter>
                        ))}
                    </View>
                );
            })}
        </View>
    );
};
