import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Flame, Repeat, Ruler, Target, Timer, Zap } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { eventName, pitchTypeName } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { fonts, radius } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { CountUp, GrowBar, ProSection, lastName, shortName, useInView, useProColors } from '../../kit';
import { ordinal } from '../previa/logica';
import { recordsFromLite, reliefStrikeouts } from './logica';
import { nameOf, sideOfPlayer } from './text';

// Récords del juego (calculados del feed: MLB no los manda para LIDOM): pitcheo más rápido, batazo más largo y más
// duro, turno más largo, más ponches de un relevista y el ritmo entre pitcheos de cada lanzador (este solo con los
// datos PRO, que traen la hora de cada pitcheo). Sin los datos PRO salen de los turnos del Lite con la misma regla.

interface TileData {
    key: string;
    icon: (color: string) => React.ReactNode;
    value: number;
    digits?: number;
    unit: string;
    label: string;
    detail: string;
}

const Tile: React.FC<{ tile: TileData; seen: boolean; wide: boolean }> = ({ tile, seen, wide }) => {
    const colors = useColors();
    const pro = useProColors();
    return (
        <View
            accessible
            accessibilityLabel={`${tile.label}: ${tile.value.toFixed(tile.digits ?? 0)} ${tile.unit}. ${tile.detail}`}
            style={{ width: wide ? '100%' : '48.5%', flexGrow: 1, minWidth: 0, gap: 4, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12 }}
        >
            {tile.icon(pro.warn)}
            <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Txt condensed size={32} tabular style={{ lineHeight: 32 }}>
                    <CountUp value={tile.value} format={(n) => n.toFixed(tile.digits ?? 0)} seen={seen} style={{ fontFamily: fonts.condensed }} />
                </Txt>
                <Txt size={12} weight="bold" tone="muted">
                    {tile.unit}
                </Txt>
            </View>
            <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1, lineHeight: 14 }}>
                {tile.label}
            </Txt>
            <Txt size={12} weight="semibold" style={{ lineHeight: 16 }}>
                {tile.detail}
            </Txt>
        </View>
    );
};

export const Records: React.FC<{ game: GameDetail; pro?: GamePro }> = ({ game, pro }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    const lang = i18n.language;
    const name = (id: number | null | undefined) => nameOf(game, pro, id);
    const teamOf = (id: number | null | undefined) => {
        const side = sideOfPlayer(game, pro, id);
        return side ? game[side] : null;
    };
    const atBat = (i: number) => game.atBats.find((item) => item.i === i);
    const icon = 18;
    const { fastest, hardest, longest, longestPA } = pro?.records ?? recordsFromLite(game);
    const relief = reliefStrikeouts(game);
    const tiles: TileData[] = [];

    if (fastest) {
        const turn = atBat(fastest.i);
        tiles.push({
            key: 'fastest',
            icon: (color) => <Zap size={icon} color={color} />,
            value: fastest.mph,
            digits: 1,
            unit: 'mph',
            label: t('pro.final.records.fastest'),
            detail: t('pro.final.records.fastestDetail', {
                pitcher: name(fastest.pitcher),
                team: teamOf(fastest.pitcher)?.abbrev ?? '',
                pitch: pitchTypeName({ type: fastest.type, typeDesc: null }, lang).toLowerCase(),
                batter: turn ? lastName(turn.batter.name) : '',
                inning: turn ? ordinal(turn.inning, lang, 'f') : ''
            })
        });
    }
    if (longest) {
        const turn = atBat(longest.i);
        tiles.push({
            key: 'longest',
            icon: (color) => <Ruler size={icon} color={color} />,
            value: longest.dist,
            unit: t('pro.final.records.feet'),
            label: t(longest.event === 'home_run' ? 'pro.final.records.longestHr' : 'pro.final.records.longest'),
            detail: t('pro.final.records.hitDetail', { batter: lastName(name(longest.batter)), event: turn ? eventName(turn, lang).toLowerCase() : '', inning: turn ? ordinal(turn.inning, lang, 'f') : '' })
        });
    }
    if (hardest) {
        const turn = atBat(hardest.i);
        tiles.push({
            key: 'hardest',
            icon: (color) => <Flame size={icon} color={color} />,
            value: hardest.ev,
            digits: 1,
            unit: 'mph',
            label: t('pro.final.records.hardest'),
            detail: t('pro.final.records.hitDetail', { batter: lastName(name(hardest.batter)), event: turn ? eventName(turn, lang).toLowerCase() : '', inning: turn ? ordinal(turn.inning, lang, 'f') : '' })
        });
    }
    if (longestPA) {
        const turn = atBat(longestPA.i);
        tiles.push({
            key: 'pa',
            icon: (color) => <Repeat size={icon} color={color} />,
            value: longestPA.pitches,
            unit: t('pro.final.records.pitches'),
            label: t('pro.final.records.longestPa'),
            detail: t('pro.final.records.paDetail', {
                batter: lastName(name(longestPA.batter)),
                pitcher: lastName(name(longestPA.pitcher)),
                inning: turn ? ordinal(turn.inning, lang, 'f') : '',
                event: turn ? eventName(turn, lang).toLowerCase() : ''
            })
        });
    }
    if (relief) {
        tiles.push({
            key: 'relief',
            icon: (color) => <Target size={icon} color={color} />,
            value: relief.k,
            unit: 'K',
            label: t('pro.final.records.reliefK'),
            detail: t('pro.final.records.reliefDetail', { pitcher: name(relief.id) || relief.name, team: game[relief.side].abbrev, ip: relief.ip })
        });
    }

    const pace = (pro?.pace ?? []).filter((item) => item.n >= 10).sort((a, b) => a.sec - b.sec);
    const slowest = Math.max(1, ...pace.map((item) => item.sec));

    if (!tiles.length && !pace.length) return null;

    return (
        <ProSection title={t('pro.final.records.title')}>
            {tiles.length > 0 ? (
                <View ref={setNode} onLayout={onLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {tiles.map((tile, index) => (
                        <Tile key={tile.key} tile={tile} seen={seen} wide={index === tiles.length - 1 && tiles.length % 2 === 1} />
                    ))}
                </View>
            ) : null}
            {pace.length > 0 ? (
                <View style={{ marginTop: tiles.length ? 8 : 0, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Timer size={16} color={colors.muted} />
                        <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                            {t('pro.final.records.pace')}
                        </Txt>
                    </View>
                    <View style={{ marginTop: 8, gap: 6 }} accessibilityLabel={t('pro.final.records.pace')}>
                        {pace.map((item, index) => {
                            const team = teamOf(item.id);
                            return (
                                <View key={item.id} accessible accessibilityLabel={`${name(item.id)}: ${item.sec.toFixed(1)} s`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <View style={{ width: 104, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                        {team ? (
                                            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                                <TeamLogo team={team} size={13} />
                                            </View>
                                        ) : null}
                                        <Txt size={12} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                            {shortName(name(item.id))}
                                        </Txt>
                                    </View>
                                    <GrowBar value={item.sec / slowest} color={team?.color} index={index} height={8} style={{ flex: 1 }} />
                                    <Txt condensed size={14} tabular style={{ width: 48, textAlign: 'right' }}>{`${item.sec.toFixed(1)} s`}</Txt>
                                </View>
                            );
                        })}
                    </View>
                    <Txt size={11} tone="muted" style={{ marginTop: 8, lineHeight: 15 }}>
                        {t('pro.final.records.paceNote')}
                    </Txt>
                </View>
            ) : null}
        </ProSection>
    );
};
