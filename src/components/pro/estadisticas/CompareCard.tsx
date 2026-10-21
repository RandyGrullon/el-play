import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, ImageDown, RotateCcw } from 'lucide-react-native';
import type { PlayerRow, StatContext, StatsTeam } from '../../../lib/stats';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, alpha, fonts, radius } from '../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../ui';
import { ChipButton, CountUp, GrowBar, ModuleHeader, ProButton, ProSegmented, teamInk, useInView } from '../kit';
import { columnOf, columnStandings, duelOf, sortPool, type Duel, type Role, type Standing } from './logic';
import { ShareImageSheet, type CardNode } from './share';

/** Métricas del cara a cara (las del diseño): ganan por percentil contra el grupo */
export const COMPARE_KEYS: Record<Role, string[]> = {
    B: ['avg', 'obp', 'slg', 'opsPlus', 'hr', 'sb', 'bbPct', 'kPct', 'pts'],
    P: ['era', 'eraPlus', 'whip', 'kPct', 'bbPct', 'k9', 'fip', 'ip', 'pts']
};

interface CompareCardProps {
    role: Role;
    pool: PlayerRow[];
    teams: Record<string, StatsTeam>;
    names: Map<number, string>;
    match: PlayerRow | null;
    ctx: StatContext | null;
    season: string;
    league: string;
}

const FALLBACK_A = '#2563eb';
const FALLBACK_B = '#e11d48';

// Cara a cara de dos peloteros del grupo: cabeceras en el color de cada equipo, barras en espejo con su percentil,
// el ganador de cada métrica resaltado, el marcador de métricas ganadas y la imagen para compartir.
export const CompareCard: React.FC<CompareCardProps> = ({ role, pool, teams, names, match, ctx, season, league }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const keys = COMPARE_KEYS[role];
    const ranking = useMemo(() => sortPool(pool, columnOf(role, role === 'B' ? 'ops' : 'eraPlus'), false, ctx), [pool, role, ctx]);
    const [pair, setPair] = useState<[number, number] | null>(null);
    const [slot, setSlot] = useState<'a' | 'b'>('a');
    const [picking, setPicking] = useState(false);
    const [replay, setReplay] = useState(0);
    const [sharing, setSharing] = useState(false);

    // Otro rol: vuelve al par por defecto. El buscado entra en lugar del primero (se ajusta en el render)
    const [shownRole, setShownRole] = useState(role);
    if (shownRole !== role) {
        setShownRole(role);
        setPair(null);
    }
    const [lastMatch, setLastMatch] = useState<number | null>(match?.id ?? null);
    if ((match?.id ?? null) !== lastMatch) {
        setLastMatch(match?.id ?? null);
        if (match && pair && ranking.some((row) => row.id === match.id) && pair[0] !== match.id) setPair([match.id, pair[1] === match.id ? pair[0] : pair[1]]);
    }

    // Por defecto: el buscado (o el mejor) contra el mejor de su misma posición
    const fallback = useMemo((): [number, number] | null => {
        if (ranking.length < 2) return null;
        const a = match && ranking.some((row) => row.id === match.id) ? match : ranking[0];
        const b = ranking.find((row) => row.id !== a.id && row.pos === a.pos && role === 'B') ?? ranking.find((row) => row.id !== a.id)!;
        return [a.id, b.id];
    }, [ranking, match, role]);

    const ids = pair && pair.every((id) => pool.some((row) => row.id === id)) ? pair : fallback;
    const standings = useMemo(() => {
        const out: Record<string, Map<number, Standing>> = {};
        for (const key of keys) out[key] = columnStandings(pool, columnOf(role, key), ctx);
        return out;
    }, [pool, keys, role, ctx]);
    if (!ids) return null;
    const a = pool.find((row) => row.id === ids[0])!;
    const b = pool.find((row) => row.id === ids[1])!;
    // Las métricas sin cifra para ninguno de los dos (OPS+ sin los promedios de la liga) no se comparan
    const shownKeys = keys.filter((key) => standings[key].has(a.id) || standings[key].has(b.id));
    const sideMap = (row: PlayerRow) => new Map(shownKeys.map((key) => [key, standings[key].get(row.id) ?? null]));
    const duel = duelOf(shownKeys, sideMap(a), sideMap(b));
    const teamA = a.teamId ? teams[a.teamId] : undefined;
    const teamB = b.teamId ? teams[b.teamId] : undefined;
    const colorA = teamA?.color || FALLBACK_A;
    const colorB = teamB?.color || FALLBACK_B;
    const nameA = names.get(a.id) ?? a.name;
    const nameB = names.get(b.id) ?? b.name;
    const label = (key: string) => (key === 'pts' ? t('pro.estadisticas.compare.fantasy') : t(`pro.estadisticas.cols.${key}.short`));
    const verdict =
        duel.winsA === duel.winsB
            ? t('pro.estadisticas.compare.tie', { count: duel.winsA })
            : t('pro.estadisticas.compare.wins', { name: duel.winsA > duel.winsB ? nameA : nameB, count: Math.max(duel.winsA, duel.winsB), total: shownKeys.length });
    const showOf = (row: PlayerRow, key: string) => columnOf(role, key).show(row, ctx);

    const choose = (id: number) => {
        const next: [number, number] = slot === 'a' ? [id, ids[1] === id ? ids[0] : ids[1]] : [ids[0] === id ? ids[1] : ids[0], id];
        setPair(next);
        setReplay((now) => now + 1);
    };
    const candidates = [...(match && pool.some((row) => row.id === match.id) ? [match] : []), ...ranking].filter((row, index, list) => list.indexOf(row) === index && row.id !== a.id && row.id !== b.id).slice(0, 8);
    const sides = { a: { row: a, team: teamA, color: colorA, name: nameA }, b: { row: b, team: teamB, color: colorB, name: nameB } };

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.estadisticas.compare.title')} aside={t('pro.estadisticas.compare.aside')} />
            <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ borderRadius: radius.card + 1, padding: 1 }}>
                <View style={{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }}>
                    <View accessible accessibilityLabel={t('pro.estadisticas.compare.aria', { a: a.name, b: b.name })} style={{ flexDirection: 'row' }}>
                        <Side {...sides.a} />
                        <Side {...sides.b} />
                        <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: 52, marginLeft: -20, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                            <Txt size={13} weight="black">
                                VS
                            </Txt>
                        </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: alpha(colors.line, 0.08), paddingHorizontal: 16, paddingVertical: 12 }}>
                        <View accessible accessibilityLabel={t('pro.estadisticas.compare.scoreAria', { a: nameA, wa: duel.winsA, b: nameB, wb: duel.winsB })} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                            <Txt condensed size={30} tabular style={{ lineHeight: 32 }}>{`${duel.winsA} – ${duel.winsB}`}</Txt>
                            {duel.ties > 0 && (
                                <Txt size={12} weight="semibold" tone="muted">
                                    {`· ${t('pro.estadisticas.compare.ties', { count: duel.ties })}`}
                                </Txt>
                            )}
                        </View>
                        <Txt size={12} tone="muted" style={{ flex: 1, minWidth: 0, lineHeight: 16 }}>
                            {verdict}
                        </Txt>
                        <Pressable
                            onPress={() => setReplay((now) => now + 1)}
                            accessibilityRole="button"
                            accessibilityLabel={t('pro.estadisticas.compare.replay')}
                            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
                        >
                            <RotateCcw size={16} color={colors.ink} />
                        </Pressable>
                    </View>
                    <View key={`${ids.join('-')}-${replay}`}>
                        {duel.rows.map((row, index) => (
                            <DuelRow
                                key={row.key}
                                index={index}
                                count={row.key !== 'ip'}
                                label={label(row.key)}
                                long={t(`pro.estadisticas.cols.${row.key}.long`)}
                                a={showOf(a, row.key)}
                                b={showOf(b, row.key)}
                                duel={row}
                                colorA={colorA}
                                colorB={colorB}
                                nameA={nameA}
                                nameB={nameB}
                                last={index === duel.rows.length - 1}
                            />
                        ))}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
                        <ProButton label={t('pro.estadisticas.compare.change')} onPress={() => setPicking((now) => !now)} accessibilityState={{ expanded: picking }} icon={(c) => <ArrowLeftRight size={16} color={c} />} style={{ flexGrow: 1, flexBasis: 140 }} />
                        <ProButton label={t('pro.estadisticas.compare.share')} variant="gradient" onPress={() => setSharing(true)} icon={(c) => <ImageDown size={16} color={c} />} style={{ flexGrow: 1, flexBasis: 140 }} />
                    </View>
                    {picking && (
                        <View style={{ gap: 12, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08), padding: 12 }}>
                            <ProSegmented
                                value={slot}
                                onChange={setSlot}
                                label={t('pro.estadisticas.compare.slot')}
                                options={[
                                    { value: 'a', label: nameA },
                                    { value: 'b', label: nameB }
                                ]}
                            />
                            <Txt size={12} tone="muted">
                                {t('pro.estadisticas.compare.pickHint', { name: slot === 'a' ? nameA : nameB })}
                            </Txt>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {candidates.map((row) => (
                                    <ChipButton key={row.id} active={false} onPress={() => choose(row.id)} accessibilityLabel={t('pro.estadisticas.compare.pickAria', { name: row.name, other: slot === 'a' ? nameA : nameB })}>
                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: (row.teamId && teams[row.teamId]?.color) || '#64748b' }} />
                                        <Txt size={13} weight="bold">
                                            {names.get(row.id) ?? row.name}
                                        </Txt>
                                    </ChipButton>
                                ))}
                            </View>
                            <ProButton label={t('pro.estadisticas.compare.done')} variant="ghost" block onPress={() => setPicking(false)} />
                        </View>
                    )}
                </View>
            </LinearGradient>
            <ShareImageSheet
                open={sharing}
                onClose={() => setSharing(false)}
                title={t('pro.estadisticas.compare.sheetTitle')}
                fileName={`cara-a-cara-${a.id}-${b.id}`}
                text={t('pro.estadisticas.compare.shareText', { a: a.name, b: b.name, season, score: `${duel.winsA}-${duel.winsB}` })}
                path="/estadisticas"
                width={320}
                renderCard={(ref) => (
                    <CompareImage
                        ref={ref}
                        title={t('pro.estadisticas.compare.imageTitle')}
                        subtitle={`${league} · ${season}`}
                        verdict={verdict}
                        score={`${duel.winsA} – ${duel.winsB}`}
                        a={{ ...sides.a, sub: [teamA?.abbrev, a.pos].filter(Boolean).join(' · ') }}
                        b={{ ...sides.b, sub: [teamB?.abbrev, b.pos].filter(Boolean).join(' · ') }}
                        rows={duel.rows.map((row) => ({ key: row.key, label: label(row.key), a: showOf(a, row.key), b: showOf(b, row.key), pa: row.a?.pct ?? null, pb: row.b?.pct ?? null, winner: row.winner }))}
                        footer={t('pro.estadisticas.compare.imageFooter')}
                    />
                )}
            />
        </View>
    );
};

const Side: React.FC<{ row: PlayerRow; team?: StatsTeam; color: string; name: string }> = ({ row, team, color, name }) => {
    const ink = teamInk(color);
    return (
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', paddingHorizontal: 8, paddingTop: 16, paddingBottom: 12, backgroundColor: color }}>
            {ink === '#ffffff' && <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']} locations={[0.3, 1]} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />}
            <PlayerPhoto personId={row.id} name={row.name} size={72} background="rgba(255,255,255,0.22)" team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
            <Txt size={17} weight="black" color={ink} numberOfLines={1} style={{ marginTop: 8, alignSelf: 'stretch', textAlign: 'center' }}>
                {name}
            </Txt>
            <Txt size={12} weight="bold" color={ink} style={{ opacity: 0.85 }}>
                {[team?.abbrev, row.pos].filter(Boolean).join(' · ')}
            </Txt>
        </View>
    );
};

/** Cifra que cuenta si es un número («.316», «15.3%», «136»); si no, tal cual */
const Counted: React.FC<{ text: string; count: boolean; seen: boolean }> = ({ text, count, seen }) => {
    const clean = text.replace('%', '');
    const value = parseFloat(clean);
    if (!count || !Number.isFinite(value) || !/^-?\d*\.?\d+%?$/.test(text)) return <>{text}</>;
    const decimals = (clean.split('.')[1] ?? '').length;
    return <CountUp value={value} seen={seen} format={(n) => `${text.startsWith('.') ? n.toFixed(decimals).replace(/^0/, '') : n.toFixed(decimals)}${text.endsWith('%') ? '%' : ''}`} />;
};

interface DuelRowProps {
    index: number;
    /** Las entradas (49.2) no cuentan: no son decimales */
    count: boolean;
    label: string;
    long: string;
    a: string;
    b: string;
    duel: Duel;
    colorA: string;
    colorB: string;
    nameA: string;
    nameB: string;
    last: boolean;
}

const DuelRow: React.FC<DuelRowProps> = ({ index, count, label, long, a, b, duel, colorA, colorB, nameA, nameB, last }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    const pa = duel.a?.pct ?? null;
    const pb = duel.b?.pct ?? null;
    const winner = duel.winner;
    const chip = (pct: number | null, wins: boolean) => (
        <View style={{ borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: wins ? colors.ink : colors.raised }}>
            <Txt size={10} weight="extrabold" tabular color={wins ? colors.bg : colors.muted}>
                {pct === null ? 'P—' : `P${pct}`}
            </Txt>
        </View>
    );
    const aria = `${long}: ${nameA} ${a} (${t('pro.estadisticas.compare.percentile', { pct: pa ?? '—' })}), ${nameB} ${b} (${t('pro.estadisticas.compare.percentile', { pct: pb ?? '—' })})${winner ? `, ${t('pro.estadisticas.compare.winner', { name: winner === 'a' ? nameA : nameB })}` : `, ${t('pro.estadisticas.compare.even')}`}`;
    const number = (text: string, wins: boolean) => (
        <Txt style={{ fontFamily: fonts.condensed, fontSize: 22, lineHeight: 24, color: wins ? colors.ink : colors.muted, fontVariant: ['tabular-nums'] }}>
            <Counted text={text} count={count} seen={seen} />
        </Txt>
    );
    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityLabel={aria} style={[{ paddingHorizontal: 16, paddingVertical: 10 }, !last && { borderBottomWidth: 1, borderBottomColor: alpha(colors.line, 0.08) }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {number(a, winner === 'a')}
                    {chip(pa, winner === 'a')}
                </View>
                <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {label}
                </Txt>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    {chip(pb, winner === 'b')}
                    {number(b, winner === 'b')}
                </View>
            </View>
            <View style={{ marginTop: 6, flexDirection: 'row', gap: 4 }}>
                <View style={{ flex: 1, opacity: winner === 'a' ? 1 : 0.38 }}>
                    <GrowBar value={Math.max(0.04, (pa ?? 0) / 100)} color={colorA} origin="right" index={index} seen={seen} />
                </View>
                <View style={{ flex: 1, opacity: winner === 'b' ? 1 : 0.38 }}>
                    <GrowBar value={Math.max(0.04, (pb ?? 0) / 100)} color={colorB} origin="left" index={index} seen={seen} />
                </View>
            </View>
        </View>
    );
};

// ---------------------------------------------------------------- imagen para compartir (colores fijos de noche)

interface ImageSide {
    row: PlayerRow;
    team?: StatsTeam;
    color: string;
    name: string;
    sub: string;
}

interface CompareImageProps {
    ref?: React.Ref<CardNode>;
    title: string;
    subtitle: string;
    verdict: string;
    score: string;
    a: ImageSide;
    b: ImageSide;
    rows: { key: string; label: string; a: string; b: string; pa: number | null; pb: number | null; winner: 'a' | 'b' | null }[];
    footer: string;
}

// La imagen va siempre en noche (no depende del tema de quien la comparte): fondo oscuro y textos claros
const NIGHT = { bg: '#0b0c10', panel: '#16171d', ink: '#f1f2f6', muted: '#9a9db0', line: 'rgba(255,255,255,0.08)' };

const CompareImage: React.FC<CompareImageProps> = ({ ref, title, subtitle, verdict, score, a, b, rows, footer }) => (
    <View ref={ref} collapsable={false} style={{ backgroundColor: NIGHT.bg, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt size={11} weight="extrabold" color={NIGHT.muted} style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
                {title}
            </Txt>
            <Txt size={11} weight="bold" color={NIGHT.muted}>
                {subtitle}
            </Txt>
        </View>
        <View style={{ flexDirection: 'row', borderRadius: 16, overflow: 'hidden' }}>
            {[a, b].map((side) => (
                <View key={side.row.id} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, backgroundColor: side.color }}>
                    <PlayerPhoto personId={side.row.id} name={side.row.name} size={56} background="rgba(255,255,255,0.22)" team={side.team ? { id: side.team.id, logo: side.team.logo, color: side.team.color } : null} />
                    <Txt size={15} weight="black" color={teamInk(side.color)} numberOfLines={1} style={{ marginTop: 6 }}>
                        {side.name}
                    </Txt>
                    <Txt size={11} weight="bold" color={teamInk(side.color)} style={{ opacity: 0.85 }}>
                        {side.sub}
                    </Txt>
                </View>
            ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt condensed size={28} color={NIGHT.ink} tabular>
                {score}
            </Txt>
            <Txt size={12} color={NIGHT.muted} style={{ flex: 1 }}>
                {verdict}
            </Txt>
        </View>
        <View style={{ borderRadius: 14, backgroundColor: NIGHT.panel, paddingHorizontal: 12 }}>
            {rows.map((row, index) => (
                <View key={row.key} style={[{ paddingVertical: 7 }, index > 0 && { borderTopWidth: 1, borderTopColor: NIGHT.line }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Txt condensed size={17} color={row.winner === 'a' ? NIGHT.ink : NIGHT.muted} tabular style={{ flex: 1 }}>{`${row.a}  P${row.pa ?? '—'}`}</Txt>
                        <Txt size={10} weight="extrabold" color={NIGHT.muted} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                            {row.label}
                        </Txt>
                        <Txt condensed size={17} color={row.winner === 'b' ? NIGHT.ink : NIGHT.muted} tabular style={{ flex: 1, textAlign: 'right' }}>{`P${row.pb ?? '—'}  ${row.b}`}</Txt>
                    </View>
                    <View style={{ marginTop: 4, flexDirection: 'row', gap: 3 }}>
                        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: NIGHT.line, alignItems: 'flex-end', overflow: 'hidden' }}>
                            <View style={{ width: `${Math.max(4, row.pa ?? 0)}%`, height: 4, borderRadius: 2, backgroundColor: a.color, opacity: row.winner === 'a' ? 1 : 0.4 }} />
                        </View>
                        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: NIGHT.line, overflow: 'hidden' }}>
                            <View style={{ width: `${Math.max(4, row.pb ?? 0)}%`, height: 4, borderRadius: 2, backgroundColor: b.color, opacity: row.winner === 'b' ? 1 : 0.4 }} />
                        </View>
                    </View>
                </View>
            ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt size={10} color={NIGHT.muted}>
                {footer}
            </Txt>
            <Txt size={10} weight="extrabold" color={NIGHT.ink}>
                elplay.grullonb.com
            </Txt>
        </View>
    </View>
);
