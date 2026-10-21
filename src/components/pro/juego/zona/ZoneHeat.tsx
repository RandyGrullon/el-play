import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import { useZones } from '../../../../lib/pro/juego';
import { isPermanent } from '../../../../lib/pro/http';
import { seasonLabel } from '../../../../lib/format';
import { useColors } from '../../../../theme/theme';
import { Txt } from '../../../ui';
import { ChipButton, ChipRow, HeatGrid, ProNote, ProSection, fmtPercent, type HeatCell } from '../../kit';
import { isStrike, isSwing, isWhiff, zoneFromLocation, type PitchItem } from '../vivo/logic';

// Mapa de calor 3 × 3 + 4 cuadrantes: del juego (pitcheos, % strike, abanicados, hits) del lanzador o del
// bateador, y de la temporada del bateador (AVG, OPS, velocidad de salida) con las zonas calientes de MLB.

type GameMetric = 'pitches' | 'strike' | 'whiff' | 'hits';
type SeasonMetric = 'avg' | 'ops' | 'ev';
type Metric = GameMetric | SeasonMetric;

const GAME_METRICS: GameMetric[] = ['pitches', 'strike', 'whiff', 'hits'];
const SEASON_METRICS: SeasonMetric[] = ['avg', 'ops', 'ev'];
const MLB_METRIC: Record<SeasonMetric, string> = { avg: 'battingAverage', ops: 'onBasePlusSlugging', ev: 'exitVelocity' };
const ZONES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14];
const HITS = new Set(['single', 'double', 'triple', 'home_run']);

interface ZoneHeatProps {
    game: GameDetail;
    /** Pitcheos del juego del sujeto (el lanzador o el bateador) */
    items: PitchItem[];
    /** Nombre del sujeto del juego («Iván Armstrong») */
    subject: string;
    batter: { id: number; name: string };
}

const zoneOf = (item: PitchItem) => item.pitch.zone ?? zoneFromLocation(item.pitch.x, item.pitch.z, item.pitch.top, item.pitch.bot);

/** Celdas del juego por zona (pura) */
export const gameCells = (items: PitchItem[], metric: GameMetric, lang: string, noPitches: string): HeatCell[] => {
    const total = items.length;
    return ZONES.map((zone) => {
        const list = items.filter((item) => zoneOf(item) === zone);
        if (!list.length) return { zone, value: null, sub: zone <= 9 ? noPitches : undefined };
        if (metric === 'pitches') return { zone, value: list.length, sub: fmtPercent(list.length / total, 1, lang) };
        if (metric === 'strike') {
            const strikes = list.filter((item) => isStrike(item.pitch)).length;
            return { zone, value: strikes / list.length, display: fmtPercent(strikes / list.length, 0, lang), sub: `${strikes}/${list.length}` };
        }
        if (metric === 'whiff') {
            const swings = list.filter((item) => isSwing(item.pitch)).length;
            const whiffs = list.filter((item) => isWhiff(item.pitch)).length;
            return { zone, value: whiffs, sub: `${whiffs}/${swings}` };
        }
        const hits = list.filter((item) => item.pitch.r === 'inplay' && HITS.has(item.atBat.event ?? '') && item.k === item.atBat.pitches.length - 1).length;
        return { zone, value: hits };
    });
};

export const ZoneHeat: React.FC<ZoneHeatProps> = ({ game, items, subject, batter }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const [metric, setMetric] = useState<Metric>('pitches');
    const zones = useZones(game.league, batter.id, 'hitting');
    const seasonMetric = SEASON_METRICS.includes(metric as SeasonMetric) ? (metric as SeasonMetric) : null;
    const season = zones.data?.metrics ?? null;
    // Un 404 (la ruta aún no está en el servidor o MLB no tiene zonas) no se arregla reintentando
    const failed = zones.isError && !isPermanent(zones.error);

    let cells: HeatCell[];
    let domain: [number, number] | undefined;
    if (seasonMetric) {
        const list = season?.[MLB_METRIC[seasonMetric]] ?? [];
        cells = ZONES.map((zone) => {
            const row = list.find((item) => Number(item.zone) === zone);
            const value = row?.value !== null && row?.value !== undefined ? Number.parseFloat(row.value) : null;
            return { zone, value: value !== null && Number.isFinite(value) ? value : null, display: row?.value ?? undefined };
        });
    } else {
        cells = gameCells(items, metric as GameMetric, lang, t('pro.zona.heat.none'));
        if (metric === 'strike') domain = [0, 1];
        else domain = [0, Math.max(1, ...cells.map((cell) => cell.value ?? 0))];
    }
    const seasonName = zones.data?.season ? seasonLabel(zones.data.season, game.league) : null;
    const caption = seasonMetric ? t('pro.zona.heat.captionSeason', { metric: t(`pro.zona.heat.${seasonMetric}`), name: batter.name, season: seasonName ?? '' }) : t(`pro.zona.heat.caption.${metric}`, { name: subject, count: items.length });
    const gameOf = t('pro.zona.heat.gameOf', { name: subject });
    const seasonOf = t('pro.zona.heat.seasonOf', { name: batter.name, season: seasonName ?? '' });

    return (
        <ProSection title={t('pro.zona.heat.title')} bodyStyle={{ gap: 12 }}>
            <View style={{ gap: 8 }}>
                <Txt size={13} weight="bold" tone="muted">
                    {gameOf}
                </Txt>
                <ChipRow label={gameOf} bleed={false}>
                    {GAME_METRICS.map((key) => (
                        <ChipButton key={key} active={metric === key} onPress={() => setMetric(key)}>
                            {t(`pro.zona.heat.${key}`)}
                        </ChipButton>
                    ))}
                </ChipRow>
                <Txt size={13} weight="bold" tone="muted">
                    {seasonOf}
                </Txt>
                <ChipRow label={seasonOf} bleed={false}>
                    {SEASON_METRICS.map((key) => (
                        <ChipButton key={key} active={metric === key} onPress={() => setMetric(key)} disabled={!season && !zones.isLoading}>
                            {t(`pro.zona.heat.${key}`)}
                        </ChipButton>
                    ))}
                </ChipRow>
                {!season && !zones.isLoading && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
                        <Txt size={12} tone="muted" style={{ flexShrink: 1 }}>
                            {failed ? t('pro.zona.heat.error') : t('pro.zona.heat.noSeason', { name: batter.name })}
                        </Txt>
                        {failed && (
                            <Pressable onPress={() => zones.refetch()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                                <Txt size={12} weight="bold" color={colors.accentInk}>
                                    {t('pro.zona.heat.retry')}
                                </Txt>
                            </Pressable>
                        )}
                    </View>
                )}
            </View>
            {seasonMetric && !season ? (
                <ProNote tone="pending">{zones.isLoading ? t('pro.zona.heat.loading') : t('pro.zona.heat.noSeason', { name: batter.name })}</ProNote>
            ) : !seasonMetric && !items.length ? (
                <ProNote tone="neutral">{t('pro.zona.noPitches')}</ProNote>
            ) : (
                <HeatGrid key={metric} cells={cells} label={caption} scale="zone" domain={domain} legend={{ low: t('pro.zona.heat.cold'), high: t('pro.zona.heat.hot') }} />
            )}
            <Txt size={12} tone="muted">
                {caption}
            </Txt>
        </ProSection>
    );
};
