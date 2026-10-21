// Banco de pruebas del kit PRO: monta TODAS las piezas para verlas en la web de desarrollo (8090).
// Solo sale en desarrollo y en la web con localStorage 'el-play-kit-demo' = '1' (lo monta ProGame). Las cifras de aquí
// son de ejemplo para probar las piezas y NUNCA se ven en la app: las pantallas usan datos reales.
import React, { useState } from 'react';
import { View } from 'react-native';
import { ChevronRight, Share2 } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import { useColors } from '../../../../theme/theme';
import { ProLive } from '../../juego/vivo/ProLive';
import { FillDemo } from '../../juego/jugadas/__demo__/FillDemo'; // TEMPORAL jugadas-box
import { Txt } from '../../../ui';
import {
    Chip,
    ChipButton,
    ChipRow,
    CountUp,
    Delta,
    DivergingBar,
    Enter,
    Flash,
    FormDots,
    Gauge,
    GlossaryButton,
    GradientCard,
    GrowBar,
    HBarChart,
    HeatGrid,
    LineChart,
    LiveDot,
    MirrorBar,
    MirrorRow,
    ModuleHeader,
    Odometer,
    PlusOne,
    ProButton,
    ProNote,
    ProSection,
    ProSegmented,
    ProTable,
    ScatterChart,
    ScreenTitle,
    StatTile,
    StepChart,
    TeamChip,
    UpdatedAgo,
    WinProbChart,
    useProColors,
    type ProColumn
} from '..';

interface DemoRow {
    id: string;
    name: string;
    w: number;
    l: number;
    dif: number;
}

export const KitDemo: React.FC<{ game: GameDetail }> = ({ game }) => {
    const colors = useColors();
    const pro = useProColors();
    const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
    const [chip, setChip] = useState('uno');
    const [runs, setRuns] = useState(game.away.runs);
    const [openedAt] = useState(() => Date.now() - 7000);
    const rows: DemoRow[] = [
        { id: game.away.abbrev, name: game.away.abbrev, w: 3, l: 1, dif: 9 },
        { id: game.home.abbrev, name: game.home.abbrev, w: 1, l: 3, dif: -9 },
        { id: 'X', name: 'X', w: 2, l: 2, dif: 0 }
    ];
    const columns: ProColumn<DemoRow>[] = [
        { id: 'team', header: 'Equipo', sticky: true, width: 96, cell: (r) => r.name, sortValue: (r) => r.name, firstDir: 'asc' },
        { id: 'w', header: 'G', title: 'Ganados', cell: (r) => r.w, sortValue: (r) => r.w },
        { id: 'l', header: 'P', title: 'Perdidos', cell: (r) => r.l, sortValue: (r) => r.l, firstDir: 'asc' },
        { id: 'pct', header: 'PCT', title: 'Porcentaje', width: 64, cell: (r) => (r.w / (r.w + r.l)).toFixed(3).replace(/^0/, ''), sortValue: (r) => r.w / (r.w + r.l) },
        { id: 'dif', header: 'DIF', width: 90, cell: (r) => <DivergingBar value={r.dif} spread={9} style={{ width: 70 }} />, sortValue: (r) => r.dif }
    ];
    return (
        <View style={{ padding: 16, gap: 16, borderBottomWidth: 4, borderBottomColor: pro.warn }}>
            {/* TEMPORAL jugadas-box */}
            <FillDemo game={game} />
            {/* El esbozo del juego en vivo con este juego (para verlo aunque no haya uno en vivo) */}
            <ProLive game={game} onOpenZone={() => undefined} />
            <ScreenTitle eyebrow="Banco de pruebas" title="Kit PRO" actions={<GlossaryButton title="Tabla" entries={[{ term: 'PCT', name: 'Porcentaje de victorias', formula: 'PCT = G / (G + P)' }, { term: 'EFE', name: 'Efectividad', lowerIsBetter: true }]} />} />
            <ModuleHeader title="Encabezado de módulo" aside="por turno · MLB" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <StatTile gradient countTo={3} label="Juegos hoy" style={{ flex: 1, flexBasis: 0 }} />
                <StatTile value="0" tone="live" label="En vivo" style={{ flex: 1, flexBasis: 0 }} />
                <StatTile align="center" value=".763" label="OPS" size="sm" delta={{ value: -0.057, display: '.057' }} style={{ flex: 1, flexBasis: 0 }} />
                <StatTile align="center" value="3.72" label="EFE" size="sm" delta={{ value: 0.3, display: '0.30', better: 'lower' }} style={{ flex: 1, flexBasis: 0 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Delta value={8} />
                <Delta value={0} />
                <Chip tone="up">G1</Chip>
                <Chip tone="warn">Presión ×2.04</Chip>
                <Chip dashed>por jugar</Chip>
                <LiveDot />
            </View>
            <ChipRow label="Días">
                {['uno', 'dos', 'tres', 'cuatro', 'cinco'].map((key) => (
                    <ChipButton key={key} active={chip === key} onPress={() => setChip(key)}>
                        {key}
                    </ChipButton>
                ))}
            </ChipRow>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <TeamChip team={game.away} logo="start" />
                <TeamChip team={game.home} />
            </View>
            <ProSegmented value={tab} onChange={setTab} label="Vista" options={[{ value: 'a', label: 'Resumen' }, { value: 'b', label: 'Carreras' }, { value: 'c', label: 'Situaciones' }]} />
            <ProSegmented value={tab} onChange={setTab} label="Vista" variant="gradient" options={[{ value: 'a', label: 'Clásico' }, { value: 'b', label: 'Poder' }, { value: 'c', label: 'Cine' }]} />
            <ProSection title="Tabla" aside="toca para ordenar" bodyStyle={{ paddingHorizontal: 8 }}>
                <ProTable columns={columns} rows={rows} rowKey={(r) => r.id} label="Tabla de prueba" defaultSort={{ id: 'pct', dir: 'desc' }} rowTone={(r) => (r.id === 'X' ? 'gold' : null)} after={(r) => (r.id === game.away.abbrev ? <Txt size={11} weight="bold" color={colors.accentInk} center>Corte</Txt> : null)} footer={{ team: 'Totales', w: 6, l: 6 }} stagger />
            </ProSection>
            <ProSection title="Probabilidad de ganar" gradient>
                <WinProbChart
                    points={[0, 1, 2, 3, 4, 5, 6, 7, 8].map((x) => ({ x, top: [50, 46, 62, 70, 66, 81, 90, 88, 97][x] }))}
                    topTeam={game.away}
                    bottomTeam={game.home}
                    label="Prueba"
                    xDomain={[0, 9]}
                    xTicks={[1, 3, 5, 7, 9].map((v) => ({ value: v, label: String(v) }))}
                    markers={[{ x: 2, top: 62, badge: '1', name: 'Jugada 1', onPress: () => undefined }]}
                    live
                />
            </ProSection>
            <LineChart
                label="Prueba"
                series={[
                    { id: 'a', name: game.away.abbrev, color: game.away.color, points: [0, 1, 2, 3].map((x) => ({ x, y: [0, 1, 2, 1][x] })), endLabel: game.away.abbrev, endDot: true },
                    { id: 'b', name: game.home.abbrev, color: game.home.color, points: [0, 1, 2, 3].map((x) => ({ x, y: [0, -1, -2, -1][x] })), endLabel: game.home.abbrev, endDot: true },
                    { id: 'c', name: 'Liga', color: colors.muted, points: [0, 1, 2, 3].map((x) => ({ x, y: 0 })), dashed: true }
                ]}
                reference={{ y: 0, label: '.500' }}
                band={{ from: -0.5, to: -1.5, label: 'Corte' }}
                xBand={{ from: 2.5, to: 3, label: 'Por jugar' }}
                xTicks={[{ value: 0, label: 'Inicio' }, { value: 3, label: 'Hoy', strong: true }]}
            />
            <HBarChart label="Prueba" rows={[{ id: 'a', name: game.away.abbrev, value: 0.285, display: '.285', color: game.away.color, emphasis: true }, { id: 'b', name: game.home.abbrev, value: 0.226, display: '.226', color: game.home.color }]} />
            <HBarChart label="Prueba centro" center={0.25} rows={[{ id: 'a', name: game.away.abbrev, value: 0.285, display: '.285', color: game.away.color }, { id: 'b', name: game.home.abbrev, value: 0.226, display: '.226', color: game.home.color }]} />
            <MirrorBar left={{ value: 4, color: game.away.color }} right={{ value: 12, color: game.home.color }} />
            <MirrorRow label="Récord" left="1-0" right="1-0" best="right" leftColor={game.away.color} rightColor={game.home.color} />
            <GrowBar value={0.6} />
            <HeatGrid
                label="Prueba"
                legend={{ low: 'Frío', high: 'Caliente' }}
                cells={[1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14].map((zone, i) => ({ zone, value: zone === 3 ? null : (i * 7) % 16, sub: `${i} %` }))}
                onSelect={() => undefined}
            />
            <HeatGrid label="Prueba equipo" scale={{ color: game.away.color }} cells={[1, 2, 3, 4, 5, 6, 7, 8, 9].map((zone) => ({ zone, value: zone }))} maxSize={180} />
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <Gauge value={43} max={100} label="43 pitcheos" color={colors.strike} size={64}>
                    <Txt condensed size={20}>
                        43
                    </Txt>
                </Gauge>
                <Gauge value={0.6} max={1} label=".600" sweep={270} color={game.away.color} />
                <FormDots results={['W', 'L', 'W']} />
                <FormDots results={['W', 'L']} variant="letters" slots={5} />
            </View>
            <StepChart innings={9} label="Prueba" series={[{ id: 'a', name: 'A', color: game.away.color, values: [1, 3, 6, 6, 7, 10] }, { id: 'b', name: 'B', color: game.home.color, values: [1, 1, 1, 1, 1, 1] }]} markers={[{ seriesId: 'a', inning: 1, badge: 'HR', name: 'Jonrón', onPress: () => undefined }]} currentInning={6} />
            <ScatterChart
                label="Prueba"
                xDomain={[0.2, 0.5]}
                yDomain={[0.2, 0.7]}
                points={[{ id: 'a', x: 0.418, y: 0.402, color: game.away.color, name: 'A', label: 'A' }, { id: 'b', x: 0.3, y: 0.6, color: game.home.color, name: 'B', halo: 18 }]}
                refX={{ value: 0.332, label: 'Liga' }}
                refY={{ value: 0.364 }}
                quadrants={{ tr: 'Élite', tl: 'Solo poder' }}
                highlightQuadrant="tr"
                selectedId="a"
                onSelect={() => undefined}
                xLabel="OBP"
                yLabel="SLG"
                formatX={(v) => v.toFixed(3).replace(/^0/, '')}
                formatY={(v) => v.toFixed(3).replace(/^0/, '')}
            />
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <Txt condensed size={40}>
                    <CountUp value={0.763} format={(n) => n.toFixed(3).replace(/^0/, '')} />
                </Txt>
                <Flash value={runs} tone="up">
                    <Odometer value={runs} size={44} />
                </Flash>
                <View>
                    <PlusOne trigger={runs - game.away.runs} style={{ right: -18, top: 0 }}>
                        <Txt size={12} weight="extrabold" color={pro.up}>
                            +1
                        </Txt>
                    </PlusOne>
                    <ProButton label="+1" onPress={() => setRuns((value) => value + 1)} />
                </View>
                <UpdatedAgo at={openedAt} />
            </View>
            {[0, 1, 2].map((i) => (
                <Enter key={i} index={i}>
                    <ProNote tone={(['info', 'warn', 'pending'] as const)[i]} title="Nota.">
                        Texto de la nota honesta.
                    </ProNote>
                </Enter>
            ))}
            <GradientCard>
                <Txt>Tarjeta con borde degradado</Txt>
            </GradientCard>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <ProButton label="Compartir" variant="gradient" icon={(c) => <Share2 size={16} color={c} />} style={{ flex: 1 }} block />
                <ProButton label="Ver el final" variant="ghost" iconEnd icon={(c) => <ChevronRight size={16} color={c} />} />
            </View>
        </View>
    );
};
