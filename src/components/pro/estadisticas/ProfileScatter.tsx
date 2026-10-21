import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';
import type { PlayerRow, StatsTeam } from '../../../lib/stats';
import { numOf } from '../../../lib/advanced';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, radius } from '../../../theme/tokens';
import type { LeagueAverages } from '../../../types/pro-liga';
import { PlayerPhoto, Txt } from '../../ui';
import { ChipButton, ProSection, ScatterChart, niceDomain, niceTicks, type ScatterPoint } from '../kit';
import type { Role } from './logic';

interface ProfileScatterProps {
    role: Role;
    pool: PlayerRow[];
    teams: Record<string, StatsTeam>;
    names: Map<number, string>;
    /** Equipo filtrado: los demás quedan tenues */
    teamId: number | null;
    /** El de la búsqueda: queda elegido y late */
    match: PlayerRow | null;
    season: string;
    averages: LeagueAverages | null;
    onOpen: (row: PlayerRow) => void;
}

const GREY = '#64748b';

// Perfil de los calificados en dos ejes: OBP contra SLG (bateo) o BB% contra K% (pitcheo). Las líneas son el promedio
// de la liga y forman los cuadrantes («Élite», «Solo poder»). Tocar un punto lo elige; la lista «Cerca» y el buscador
// sirven de vía para el lector de pantalla.
export const ProfileScatter: React.FC<ProfileScatterProps> = ({ role, pool, teams, names, teamId, match, season, averages, onOpen }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [selected, setSelected] = useState<number | null>(match?.id ?? null);
    // Lo que busca la persona pasa a ser el elegido (se ajusta en el render, sin efecto)
    const [lastMatch, setLastMatch] = useState<number | null>(match?.id ?? null);
    if ((match?.id ?? null) !== lastMatch) {
        setLastMatch(match?.id ?? null);
        if (match) setSelected(match.id);
    }

    const batting = role === 'B';
    const items = useMemo(
        () =>
            pool.flatMap((row) => {
                if (batting) {
                    const x = numOf(row.hitting?.obp);
                    const y = numOf(row.hitting?.slg);
                    return x === null || y === null ? [] : [{ row, x, y }];
                }
                const p = row.pitching;
                if (!p?.bf) return [];
                return [{ row, x: (100 * p.bb) / p.bf, y: (100 * p.k) / p.bf }];
            }),
        [pool, batting]
    );
    if (items.length < 3) return null;

    const refX = batting ? numOf(averages?.obp) : (averages?.pitchingBbPct ?? null);
    const refY = batting ? numOf(averages?.slg) : (averages?.pitchingKPct ?? null);
    const xs = items.map((item) => item.x).concat(refX !== null ? [refX] : []);
    const ys = items.map((item) => item.y).concat(refY !== null ? [refY] : []);
    const xDomain = niceDomain(Math.min(...xs), Math.max(...xs), 3);
    const yDomain = niceDomain(Math.min(...ys), Math.max(...ys), 4);
    const formatAxis = (value: number) => (batting ? value.toFixed(3).replace(/^0(?=\.)/, '') : `${Math.round(value)}%`);
    const formatValue = (value: number) => (batting ? value.toFixed(3).replace(/^0(?=\.)/, '') : `${value.toFixed(1)}%`);
    const xKey = batting ? 'obp' : 'bbPct';
    const yKey = batting ? 'slg' : 'kPct';
    const xShort = t(`pro.estadisticas.cols.${xKey}.short`);
    const yShort = t(`pro.estadisticas.cols.${yKey}.short`);

    const chosen = items.find((item) => item.row.id === selected) ?? null;
    const points: ScatterPoint[] = items.map((item) => {
        const team = item.row.teamId ? teams[item.row.teamId] : undefined;
        return {
            id: String(item.row.id),
            x: item.x,
            y: item.y,
            color: team?.color || GREY,
            name: `${item.row.name}, ${team?.abbrev ?? ''}: ${xShort} ${formatValue(item.x)}, ${yShort} ${formatValue(item.y)}`,
            label: item.row.id === selected ? names.get(item.row.id) : undefined,
            r: item.row.id === selected ? 6 : 5,
            muted: teamId !== null && item.row.teamId !== teamId
        };
    });
    // Vecinos del elegido (a menos del 4,5 % de la gráfica): se ofrecen como botones «Cerca»
    const near = chosen
        ? items
              .filter((item) => item !== chosen && (teamId === null || item.row.teamId === teamId))
              .map((item) => ({ item, d: Math.hypot((item.x - chosen.x) / (xDomain[1] - xDomain[0]), (item.y - chosen.y) / (yDomain[1] - yDomain[0])) }))
              .filter(({ d }) => d < 0.045)
              .sort((a, b) => a.d - b.d)
              .slice(0, 4)
              .map(({ item }) => item.row)
        : [];
    const chosenTeam = chosen?.row.teamId ? teams[chosen.row.teamId] : undefined;
    const legendTeams = Object.values(teams).sort((a, b) => a.abbrev.localeCompare(b.abbrev));
    const countText = t(batting ? 'pro.estadisticas.scatter.countB' : 'pro.estadisticas.scatter.countP', { count: items.length });
    const teamText = teamId !== null && teams[teamId] ? t('pro.estadisticas.scatter.teamHighlight', { team: teams[teamId].abbrev }) : null;
    const quadrants =
        refX === null || refY === null
            ? undefined
            : batting
              ? { tl: t('pro.estadisticas.scatter.q.power'), tr: t('pro.estadisticas.scatter.q.elite'), bl: t('pro.estadisticas.scatter.q.below'), br: t('pro.estadisticas.scatter.q.onBase') }
              : { tl: t('pro.estadisticas.scatter.q.elite'), tr: t('pro.estadisticas.scatter.q.strikeouts'), bl: t('pro.estadisticas.scatter.q.control'), br: t('pro.estadisticas.scatter.q.trouble') };
    const chartLabel = [
        t('pro.estadisticas.scatter.aria', { x: t(batting ? 'pro.estadisticas.scatter.xB' : 'pro.estadisticas.scatter.xP'), y: t(batting ? 'pro.estadisticas.scatter.yB' : 'pro.estadisticas.scatter.yP') }),
        countText,
        refX !== null && refY !== null ? t('pro.estadisticas.scatter.averages', { x: xShort, xv: formatValue(refX), y: yShort, yv: formatValue(refY) }) : null,
        chosen ? `${chosen.row.name}: ${xShort} ${formatValue(chosen.x)}, ${yShort} ${formatValue(chosen.y)}` : null
    ]
        .filter(Boolean)
        .join('. ');

    return (
        <ProSection title={t(batting ? 'pro.estadisticas.scatter.eyebrowB' : 'pro.estadisticas.scatter.eyebrowP', { season })} headerOutside>
            <Txt size={17} weight="extrabold" style={{ lineHeight: 21 }}>
                {t(batting ? 'pro.estadisticas.scatter.titleB' : 'pro.estadisticas.scatter.titleP')}
            </Txt>
            <Txt size={12} tone="muted" style={{ marginTop: 2 }}>
                {[countText, teamText, t('pro.estadisticas.scatter.lines')].filter(Boolean).join(' · ')}
            </Txt>
            <Txt size={11} weight="bold" tone="muted" style={{ marginTop: 12 }}>
                {t(batting ? 'pro.estadisticas.scatter.yB' : 'pro.estadisticas.scatter.yP')}
            </Txt>
            <ScatterChart
                style={{ marginTop: 4 }}
                points={points}
                label={chartLabel}
                xDomain={xDomain}
                yDomain={yDomain}
                xTicks={niceTicks(xDomain[0], xDomain[1], 3)}
                yTicks={niceTicks(yDomain[0], yDomain[1], 4)}
                formatX={formatAxis}
                formatY={formatAxis}
                // El rótulo de la línea vertical va arriba: si cae a la derecha taparía el del cuadrante
                refX={refX !== null ? { value: refX, label: (refX - xDomain[0]) / (xDomain[1] - xDomain[0]) < 0.6 ? t('pro.estadisticas.scatter.league', { value: formatValue(refX) }) : undefined } : undefined}
                refY={refY !== null ? { value: refY, label: t('pro.estadisticas.scatter.league', { value: formatValue(refY) }) } : undefined}
                // Sin los promedios de la liga no hay cuadrantes (quedarían en un centro inventado)
                quadrants={quadrants}
                highlightQuadrant={quadrants ? (batting ? 'tr' : 'tl') : undefined}
                selectedId={selected !== null ? String(selected) : null}
                onSelect={(id) => setSelected(Number(id))}
            />
            <Txt size={11} weight="bold" tone="muted" style={{ marginTop: 4, textAlign: 'right' }}>
                {`${t(batting ? 'pro.estadisticas.scatter.xB' : 'pro.estadisticas.scatter.xP')} →`}
            </Txt>

            <View accessible accessibilityLabel={`${t('pro.estadisticas.scatter.legend')}: ${legendTeams.map((team) => team.abbrev).join(', ')}`} style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                {legendTeams.map((team) => (
                    <View key={team.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: teamId !== null && team.id !== teamId ? 0.4 : 1 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: team.color }} />
                        <Txt size={11} weight="bold">
                            {team.abbrev}
                        </Txt>
                    </View>
                ))}
            </View>

            {chosen ? (
                <Pressable
                    onPress={() => onOpen(chosen.row)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('statsPage.viewPlayer', { name: chosen.row.name })}: ${xShort} ${formatValue(chosen.x)}, ${yShort} ${formatValue(chosen.y)}`}
                    style={({ pressed }) => ({ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 10, opacity: pressed ? 0.85 : 1 })}
                >
                    <PlayerPhoto personId={chosen.row.id} name={chosen.row.name} size={44} team={chosenTeam ? { id: chosenTeam.id, logo: chosenTeam.logo, color: chosenTeam.color } : null} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={15} weight="extrabold" numberOfLines={1}>
                            {chosen.row.name}
                        </Txt>
                        <Txt size={12} tone="muted" numberOfLines={1}>
                            {[chosenTeam?.abbrev, chosen.row.pos].filter(Boolean).join(' · ')}
                        </Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Txt size={12} weight="extrabold" tabular>{`${xShort} ${formatValue(chosen.x)}`}</Txt>
                        <Txt size={12} weight="extrabold" tabular>{`${yShort} ${formatValue(chosen.y)}`}</Txt>
                    </View>
                    <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden' }}>
                        <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <ChevronRight size={20} color="#fff" />
                        </LinearGradient>
                    </View>
                </Pressable>
            ) : null}

            {near.length > 0 && (
                <View style={{ marginTop: 12, gap: 6 }}>
                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                        {t('pro.estadisticas.scatter.near')}
                    </Txt>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {near.map((row) => (
                            <ChipButton key={row.id} active={false} onPress={() => setSelected(row.id)} accessibilityLabel={t('pro.estadisticas.scatter.nearAria', { name: row.name })}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: (row.teamId && teams[row.teamId]?.color) || GREY }} />
                                <Txt size={13} weight="bold">
                                    {names.get(row.id) ?? row.name}
                                </Txt>
                            </ChipButton>
                        ))}
                    </View>
                </View>
            )}
            <Txt size={12} tone="muted" style={{ marginTop: 12, borderRadius: radius.tile }}>
                {chosen ? (match && chosen.row.id === match.id ? `${t('pro.estadisticas.scatter.bySearch')} ` : '') + t('pro.estadisticas.scatter.hintChosen') : t('pro.estadisticas.scatter.hint')}
            </Txt>
        </ProSection>
    );
};
