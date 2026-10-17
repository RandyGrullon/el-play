import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Gauge } from 'lucide-react-native';
import type { GameDetail } from '../../types';
import { arsenal, atBatForZone, battedBalls, eventName, pitchCallName, pitchTypeName, pitchesByPitcher } from '../../lib/baseball';
import { useColors } from '../../theme/theme';
import { radius } from '../../theme/tokens';
import { Card, ProBadge, Row, Txt } from '../ui';

// Panel del modo PRO en el juego: último pitcheo (tipo, velocidad, efecto, zona), el turno pitcheo a pitcheo,
// el repertorio de cada lanzador y los batazos más duros. En estadios sin rastreo MLB no manda velocidad ni efecto.

const Tile: React.FC<{ label: string; value: React.ReactNode; small?: boolean }> = ({ label, value, small }) => {
    const colors = useColors();
    return (
        <View style={{ flex: 1, minWidth: 0, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 6, paddingVertical: 10, alignItems: 'center' }}>
            <Txt size={small ? 14 : 20} weight="extrabold" tabular numberOfLines={1} style={{ lineHeight: small ? 20 : 22 }}>
                {value}
            </Txt>
            <Txt size={11} weight="bold" tone="muted" style={{ marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {label}
            </Txt>
        </View>
    );
};

/** Tabla sencilla con desplazamiento lateral: columnas de ancho fijo, la primera alineada a la izquierda */
const Table: React.FC<{ heads: { label: string; width: number; left?: boolean }[]; rows: { key: string; cells: { value: React.ReactNode; bold?: boolean; muted?: boolean }[] }[] }> = ({ heads, rows }) => {
    const colors = useColors();
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: '100%', paddingHorizontal: 4 }}>
                <View style={{ flexDirection: 'row', paddingVertical: 8 }}>
                    {heads.map((head) => (
                        <Txt key={head.label} size={11} weight="bold" tone="muted" style={{ width: head.width, paddingHorizontal: 6, textAlign: head.left ? 'left' : 'right', textTransform: 'uppercase' }}>
                            {head.label}
                        </Txt>
                    ))}
                </View>
                {rows.map((row) => (
                    <View key={row.key} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
                        {row.cells.map((cell, index) => (
                            <Txt
                                key={index}
                                size={13}
                                tabular
                                numberOfLines={1}
                                weight={cell.bold ? 'bold' : index === 1 && heads[1]?.left ? 'semibold' : 'regular'}
                                tone={cell.muted ? 'muted' : 'ink'}
                                style={{ width: heads[index].width, paddingHorizontal: 6, textAlign: heads[index].left ? 'left' : 'right' }}
                            >
                                {cell.value}
                            </Txt>
                        ))}
                    </View>
                ))}
            </View>
        </ScrollView>
    );
};

export const LiveProPanel: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const { atBat } = atBatForZone(game);
    const live = game.state === 'live';
    const pitches = atBat?.pitches ?? [];
    const last = live ? pitches[pitches.length - 1] : undefined;
    const tracked = game.atBats.some((item) => item.pitches.some((pitch) => typeof pitch.mph === 'number'));

    // Repertorio de los lanzadores que han tirado (el actual primero)
    const current = game.matchup?.pitcher.id;
    const pitchers = useMemo(() => {
        const ids: { id: number; name: string; top: boolean }[] = [];
        for (const item of game.atBats) {
            if (item.pitcher.id && !ids.some((p) => p.id === item.pitcher.id)) ids.push({ id: item.pitcher.id, name: item.pitcher.name, top: item.top });
        }
        return ids.sort((a, b) => Number(b.id === current) - Number(a.id === current)).slice(0, 4);
    }, [game.atBats, current]);

    const hardest = useMemo(
        () =>
            battedBalls(game.atBats)
                .filter((ball) => typeof ball.pitch.hit?.ev === 'number')
                .sort((a, b) => (b.pitch.hit!.ev as number) - (a.pitch.hit!.ev as number))
                .slice(0, 5),
        [game.atBats]
    );

    return (
        <Card style={{ gap: 20 }}>
            <Row gap={8}>
                <Gauge size={20} color={colors.accentInk} />
                <Txt weight="extrabold">{t('pro.live.title')}</Txt>
                <ProBadge />
            </Row>
            {!tracked && (
                <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Txt size={12} tone="muted">
                        {t('pro.live.noTracking')}
                    </Txt>
                </View>
            )}

            {last && (
                <View>
                    <Txt eyebrow style={{ marginBottom: 8 }}>
                        {t('pro.live.lastPitch')}
                    </Txt>
                    {/* El tipo va en su propia fila: «Recta 4 costuras» no cabe en un cuarto de pantalla */}
                    <View style={{ gap: 8 }}>
                        <Row>
                            <Tile label={t('pro.live.type')} value={pitchTypeName(last, lang) || '—'} small />
                        </Row>
                        <Row gap={8} align="stretch">
                            <Tile label="mph" value={last.mph ?? '—'} />
                            <Tile label="rpm" value={last.spin ?? '—'} />
                            <Tile label={t('pro.live.zone')} value={last.zone ?? '—'} />
                        </Row>
                    </View>
                </View>
            )}

            {live && pitches.length > 0 && (
                <View>
                    <Txt eyebrow style={{ marginBottom: 8 }}>
                        {t('pro.live.thisAtBat', { batter: atBat?.batter.name ?? '' })}
                    </Txt>
                    <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, overflow: 'hidden' }}>
                        <Table
                            heads={[
                                { label: '#', width: 32, left: true },
                                { label: t('pro.live.type'), width: 120, left: true },
                                { label: 'mph', width: 52 },
                                { label: 'rpm', width: 56 },
                                { label: t('pro.live.result'), width: 150, left: true },
                                { label: t('pro.live.count'), width: 64 }
                            ]}
                            rows={pitches.map((pitch, index) => ({
                                key: String(index),
                                cells: [
                                    { value: index + 1, muted: true },
                                    { value: pitchTypeName(pitch, lang) || '—' },
                                    { value: pitch.mph ?? '—', bold: true },
                                    { value: pitch.spin ?? '—' },
                                    { value: pitchCallName(pitch, lang) },
                                    { value: pitch.b != null && pitch.s != null ? `${pitch.b}-${pitch.s}` : '', muted: true }
                                ]
                            }))}
                        />
                    </View>
                </View>
            )}

            {pitchers.length > 0 && (
                <View style={{ gap: 12 }}>
                    <Txt eyebrow>{t('pro.live.arsenal')}</Txt>
                    {pitchers.map((pitcher) => {
                        const list = pitchesByPitcher(game.atBats, pitcher.id);
                        const rows = arsenal(list, lang);
                        const team = pitcher.top ? game.home : game.away;
                        return (
                            <View key={pitcher.id} style={{ borderRadius: radius.tile, backgroundColor: colors.raised, overflow: 'hidden' }}>
                                <Row justify="space-between" style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                                    <Row gap={8} style={{ flex: 1, minWidth: 0 }}>
                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: team.color }} />
                                        <Txt size={14} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                            {pitcher.name}
                                        </Txt>
                                    </Row>
                                    <Txt size={12} weight="semibold" tone="muted">
                                        {t('pro.live.pitches', { count: list.length })}
                                    </Txt>
                                </Row>
                                <Table
                                    heads={[
                                        { label: t('pro.live.type'), width: 124, left: true },
                                        { label: '%', width: 48 },
                                        { label: t('pro.live.avgMph'), width: 56 },
                                        { label: t('pro.live.maxMph'), width: 52 },
                                        { label: t('pro.live.strikePct'), width: 72 },
                                        { label: t('pro.live.whiffs'), width: 64 }
                                    ]}
                                    rows={rows.map((row) => ({
                                        key: row.type,
                                        cells: [
                                            { value: row.name, bold: true },
                                            { value: `${Math.round(row.share * 100)}%` },
                                            { value: row.avgMph !== null ? row.avgMph.toFixed(1) : '—', bold: true },
                                            { value: row.maxMph ?? '—' },
                                            { value: row.count ? `${Math.round((row.strikes / row.count) * 100)}%` : '—' },
                                            { value: row.whiffs }
                                        ]
                                    }))}
                                />
                            </View>
                        );
                    })}
                </View>
            )}

            {hardest.length > 0 && (
                <View>
                    <Txt eyebrow style={{ marginBottom: 8 }}>
                        {t('pro.live.hardest')}
                    </Txt>
                    <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, overflow: 'hidden' }}>
                        {hardest.map((ball, position) => (
                            <Row key={ball.atBat.i} gap={12} style={{ paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: position ? 1 : 0, borderTopColor: colors.line }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: (ball.side === 'away' ? game.away : game.home).color }} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Txt size={13} weight="extrabold" numberOfLines={1}>
                                        {ball.atBat.batter.name}
                                    </Txt>
                                    <Txt size={12} tone="muted" numberOfLines={1}>
                                        {eventName(ball.atBat, lang)}
                                    </Txt>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Txt size={18} weight="extrabold" tabular style={{ lineHeight: 20 }}>
                                        {ball.pitch.hit?.ev}
                                    </Txt>
                                    <Txt size={10} weight="bold" tone="muted">
                                        MPH
                                    </Txt>
                                </View>
                                <View style={{ width: 56, alignItems: 'flex-end' }}>
                                    <Txt size={12} tone="muted" tabular>
                                        {ball.pitch.hit?.la != null ? `${ball.pitch.hit.la}°` : ''}
                                    </Txt>
                                    {ball.pitch.hit?.dist ? (
                                        <Txt size={12} tone="muted" tabular>
                                            {ball.pitch.hit.dist} ft
                                        </Txt>
                                    ) : null}
                                </View>
                            </Row>
                        ))}
                    </View>
                </View>
            )}
        </Card>
    );
};
