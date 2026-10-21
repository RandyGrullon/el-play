import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PlayerDetail } from '../../../lib/stats';
import { numOf } from '../../../lib/advanced';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import type { PlayerPro } from '../../../types/pro-liga';
import { TeamLogo, Txt } from '../../ui';
import { ModuleHeader, ProButton } from '../kit';
import { FichaTile, TileRows } from './SeasonTiles';
import { shortDate } from './format';

type Tile = { key: string; value: string };

const num = (value: unknown) => numOf(value as string | number | null | undefined);
const fixed = (value: number | null, digits: number) => (value === null ? null : value.toFixed(digits));
const percent = (value: number | null) => (value === null ? null : `${(value * 100).toFixed(1)}%`);

/** Lo de seasonAdvanced de MLB que no está en otras partes de la ficha */
const tilesOf = (pro: PlayerPro, player: PlayerDetail): Tile[] => {
    const a = pro.advanced;
    if (!a) return [];
    const out: (Tile | null)[] = [];
    const add = (key: string, value: string | null) => out.push(value === null ? null : { key, value });
    const swings = num(a.totalSwings);
    const misses = num(a.swingAndMisses);
    const whiff = swings ? (misses ?? 0) / swings : null;
    if (player.role === 'B') {
        add('pPa', fixed(num(a.pitchesPerPlateAppearance), 2));
        add('whiff', percent(whiff));
        add('xbh', num(a.extraBaseHits) === null ? null : String(num(a.extraBaseHits)));
        // Roletazos contra elevados (GO/AO de MLB) de la línea de la fase principal
        const line = pro.phases[0]?.hitting;
        add('goAo', line && line.ao ? (line.go / line.ao).toFixed(2) : null);
        add('roe', num(a.reachedOnError) === null ? null : String(num(a.reachedOnError)));
        add('walkOffs', num(a.walkOffs) ? String(num(a.walkOffs)) : null);
        add('lob', num(a.leftOnBase) === null ? null : String(num(a.leftOnBase)));
        const gidpOpp = num(a.gidpOpp);
        add('gidpOpp', gidpOpp ? `${num(a.gidp) ?? 0}/${gidpOpp}` : null);
    } else {
        if ((player.pitching?.gs ?? 0) > 0) add('qs', num(a.qualityStarts) === null ? null : String(num(a.qualityStarts)));
        add('whiff', percent(num(a.whiffPercentage) ?? whiff));
        add('kMinusBb', percent(num(a.strikeoutsMinusWalksPercentage)));
        const inherited = num(a.inheritedRunners);
        add('inherited', inherited ? `${num(a.inheritedRunnersScored) ?? 0}/${inherited}` : null);
        add('pIp', fixed(num(a.pitchesPerInning), 1));
        add('strikePct', percent(num(a.strikePercentage)));
        add('runSupport', num(a.runSupport) === null ? null : String(num(a.runSupport)));
        add('gidpPct', percent(num(a.gidpPercentage)));
    }
    return out.filter((tile): tile is Tile => tile !== null);
};

// Más de MLB (no está en el diseño; es lo que MLB manda de LIDOM y la ficha no tenía): avanzadas de la temporada
// (swing y fallo, pitcheos por turno, aperturas de calidad, heredados…) y los movimientos del pelotero con equipos
// de la liga. Solo lo que MLB manda.
export const MoreFromMlb: React.FC<{ player: PlayerDetail; pro: PlayerPro }> = ({ player, pro }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [allMoves, setAllMoves] = useState(false);
    const tiles = tilesOf(pro, player);
    const moves = [...(pro.transactions ?? [])].filter((move) => move.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const shownMoves = allMoves ? moves : moves.slice(0, 4);
    if (!tiles.length && !moves.length) return null;
    const moveText = (move: (typeof moves)[number]) => {
        const team = move.toTeam?.name ?? move.fromTeam?.name ?? '';
        if (move.type === 'ASG') return t('pro.ficha.more.moves.ASG', { team });
        if (move.type === 'SC') return t('pro.ficha.more.moves.SC', { team });
        return t('pro.ficha.more.moves.other', { type: move.typeDesc ?? move.type ?? '', team });
    };
    return (
        <>
            {tiles.length > 0 && (
                <View style={{ gap: 12 }}>
                    <ModuleHeader title={t('pro.ficha.more.title')} aside={t('pro.ficha.more.aside')} />
                    <TileRows>
                        {tiles.map((tile) => (
                            <FichaTile key={tile.key} value={tile.value} label={t(`pro.ficha.more.tiles.${tile.key}`)} />
                        ))}
                    </TileRows>
                    <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                        {t(player.role === 'P' ? 'pro.ficha.more.noteP' : 'pro.ficha.more.noteB')}
                    </Txt>
                </View>
            )}
            {moves.length > 0 && (
                <View style={{ gap: 12 }}>
                    <ModuleHeader title={t('pro.ficha.more.movesTitle')} />
                    <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), overflow: 'hidden' }, shadow('card')]}>
                        {shownMoves.map((move, index) => {
                            const team = move.toTeam ?? move.fromTeam;
                            const date = move.date ? `${shortDate(move.date, i18n.language)} ${move.date.slice(0, 4)}` : '';
                            return (
                                <View key={move.id} accessible accessibilityLabel={`${moveText(move)}, ${date}`} style={[{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }, index > 0 && { borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) }]}>
                                    {team ? <TeamLogo team={team} size={24} /> : <View style={{ width: 24, height: 24 }} />}
                                    <Txt size={13} weight="semibold" style={{ flex: 1, minWidth: 0 }}>
                                        {moveText(move)}
                                    </Txt>
                                    <Txt size={12} tone="muted">
                                        {date}
                                    </Txt>
                                </View>
                            );
                        })}
                    </View>
                    {moves.length > 4 && <ProButton block label={allMoves ? t('pro.ficha.log.less') : t('pro.ficha.more.allMoves', { count: moves.length })} onPress={() => setAllMoves((now) => !now)} />}
                </View>
            )}
        </>
    );
};
