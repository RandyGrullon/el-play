// Piezas chicas de Estadísticas PRO: fase de la temporada, leyenda de percentiles, promedios de la liga y glosario.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { numOf } from '../../../lib/advanced';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import type { LeagueAverages, ProPhaseId } from '../../../types/pro-liga';
import { Sheet, Txt } from '../../ui';
import { HEAT_SCALES, ModuleHeader, StatTile, heatColor, withAlpha, type GlossaryEntry } from '../kit';
import { STATS_VIEWS, columnOf, percentileTint, type Role } from './logic';

/** Color de una barra por percentil (más fuerte que el de la celda: va sin texto encima) */
export const barTone = (pct: number | null | undefined, line: string) => {
    if (pct === null || pct === undefined) return alpha(line, 0.2);
    const { side, alpha: strength } = percentileTint(pct);
    if (side === 'mid') return withAlpha(HEAT_SCALES.percentile[1], 0.55);
    return withAlpha(HEAT_SCALES.percentile[side === 'good' ? 2 : 0], Math.min(1, 0.45 + strength * 0.7));
};

// Fase (Serie regular, Round Robin, Final…) en una píldora de 44 px que abre una hoja con las fases
export const PhaseSelect: React.FC<{ value: ProPhaseId; phases: ProPhaseId[]; onChange: (phase: ProPhaseId) => void }> = ({ value, phases, onChange }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [open, setOpen] = useState(false);
    const label = t(`pro.estadisticas.phases.${value}`);
    return (
        <>
            <Pressable
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('pro.estadisticas.phaseAria', { phase: label })}
                style={({ pressed }) => [
                    { height: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingLeft: 16, paddingRight: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), opacity: pressed ? 0.85 : 1 },
                    shadow('card')
                ]}
            >
                <Txt size={13} weight="bold" numberOfLines={1}>
                    {label}
                </Txt>
                <ChevronDown size={16} color={colors.muted} />
            </Pressable>
            <Sheet open={open} onClose={() => setOpen(false)} title={t('pro.estadisticas.phaseSheet')}>
                <View style={{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }}>
                    {phases.map((phase, index) => {
                        const active = phase === value;
                        return (
                            <Pressable
                                key={phase}
                                onPress={() => {
                                    onChange(phase);
                                    setOpen(false);
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                style={({ pressed }) => [
                                    { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
                                    index > 0 && { borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) },
                                    pressed && { backgroundColor: colors.raised }
                                ]}
                            >
                                <Txt size={15} weight={active ? 'extrabold' : 'semibold'} style={{ flex: 1 }}>
                                    {t(`pro.estadisticas.phases.${phase}`)}
                                </Txt>
                                {active && <Check size={18} color={colors.accentInk} />}
                            </Pressable>
                        );
                    })}
                </View>
            </Sheet>
        </>
    );
};

// Leyenda de los percentiles de la tabla: rojo el peor, gris el medio, azul el mejor
export const PercentileLegend: React.FC = () => {
    const { t } = useTranslation();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }} accessible accessibilityLabel={`${t('pro.estadisticas.legend.title')}: ${t('pro.estadisticas.legend.low')}, 50, ${t('pro.estadisticas.legend.high')}`}>
            <Txt size={11} weight="bold" style={{ paddingTop: 0 }}>
                {t('pro.estadisticas.legend.title')}
            </Txt>
            <View style={{ flex: 1, minWidth: 0 }}>
                <LinearGradient colors={[heatColor(0, 'percentile'), heatColor(0.5, 'percentile'), heatColor(1, 'percentile')]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ height: 6, borderRadius: 3, marginTop: 4 }} />
                <View style={{ marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Txt size={11} weight="semibold" tone="muted">
                        {t('pro.estadisticas.legend.low')}
                    </Txt>
                    <Txt size={11} weight="semibold" tone="muted">
                        50
                    </Txt>
                    <Txt size={11} weight="semibold" tone="muted">
                        {t('pro.estadisticas.legend.high')}
                    </Txt>
                </View>
            </View>
        </View>
    );
};

/** Los promedios de la liga que son la base de OPS+ (bateo) o de EFE+ y FIP (pitcheo) */
export const LeagueTiles: React.FC<{ role: Role; season: string; averages: LeagueAverages | null; fromPlayers: number | null }> = ({ role, season, averages, fromPlayers }) => {
    const { t } = useTranslation();
    if (!averages) return null;
    const tiles =
        role === 'B'
            ? [
                  { value: averages.obp, label: t('pro.estadisticas.league.obp') },
                  { value: averages.slg, label: t('pro.estadisticas.league.slg') },
                  { value: averages.avg, label: t('pro.estadisticas.league.avg') }
              ]
            : [
                  { value: averages.era, label: t('pro.estadisticas.league.era') },
                  { value: averages.pitchingKPct !== null ? `${averages.pitchingKPct.toFixed(1)}%` : null, label: t('pro.estadisticas.league.kPct') },
                  { value: averages.pitchingBbPct !== null ? `${averages.pitchingBbPct.toFixed(1)}%` : null, label: t('pro.estadisticas.league.bbPct') }
              ];
    if (tiles.every((tile) => tile.value === null || numOf(tile.value) === null)) return null;
    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t(role === 'B' ? 'pro.estadisticas.league.titleB' : 'pro.estadisticas.league.titleP', { season })} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {tiles.map((tile) => (
                    <StatTile key={tile.label} value={tile.value ?? '—'} label={tile.label} size="md" style={{ flex: 1, flexBasis: 0 }} />
                ))}
            </View>
            {fromPlayers !== null && (
                <Txt size={11} tone="muted">
                    {t('pro.estadisticas.league.fromPlayers', { count: fromPlayers })}
                </Txt>
            )}
        </View>
    );
};

/** Glosario de las vistas del rol: cada sigla con su nombre, fórmula y «menos es mejor» (del catálogo de columnas) */
export const useGlossary = (role: Role): GlossaryEntry[] => {
    const { t, i18n } = useTranslation();
    return useMemo(() => {
        const keys = [...new Set(STATS_VIEWS[role].flatMap((view) => view.cols))];
        const entries: GlossaryEntry[] = keys.map((key) => {
            const formula = i18n.exists(`pro.estadisticas.glossary.formula.${key}`) ? t(`pro.estadisticas.glossary.formula.${key}`) : undefined;
            const description = i18n.exists(`pro.estadisticas.glossary.desc.${key}`) ? t(`pro.estadisticas.glossary.desc.${key}`) : undefined;
            return { term: t(`pro.estadisticas.cols.${key}.short`), name: t(`pro.estadisticas.cols.${key}.long`), formula, description, lowerIsBetter: !!columnOf(role, key)?.asc };
        });
        entries.push({ term: t('pro.estadisticas.glossary.percentile.term'), name: t('pro.estadisticas.glossary.percentile.name'), description: t('pro.estadisticas.glossary.percentile.desc') });
        entries.push({ term: t('pro.estadisticas.glossary.qualified.term'), name: t('pro.estadisticas.glossary.qualified.name'), description: t(role === 'B' ? 'pro.estadisticas.glossary.qualified.descB' : 'pro.estadisticas.glossary.qualified.descP') });
        return entries;
    }, [role, t, i18n]);
};
