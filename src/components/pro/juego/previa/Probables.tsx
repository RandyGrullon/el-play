import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Decision, GameDetail } from '../../../../types';
import { pitchTypeName } from '../../../../lib/baseball';
import { useProPlayer } from '../../../../lib/pro/liga';
import { useColors } from '../../../../theme/theme';
import { radius } from '../../../../theme/tokens';
import { PlayerPhoto, TeamLogo, Txt } from '../../../ui';
import { ProNote, ProSection, withAlpha } from '../../kit';

// Abridores probables. En LIDOM MLB no los publica (0 de 374 juegos en 2025-26 y 2026-27): se dice tal cual.
// Cuando existen (Clásico, Serie del Caribe) salen con G-P, EFE, WHIP y su repertorio en una mini barra.

const Tile: React.FC<{ value: string; label: string }> = ({ value, label }) => {
    const colors = useColors();
    return (
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 2, borderRadius: radius.tile, backgroundColor: colors.raised, paddingVertical: 8 }}>
            <Txt condensed size={16} tabular numberOfLines={1}>
                {value}
            </Txt>
            <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {label}
            </Txt>
        </View>
    );
};

const Starter: React.FC<{ game: GameDetail; side: 'away' | 'home'; pitcher: Decision | null }> = ({ game, side, pitcher }) => {
    const { t, i18n } = useTranslation();
    const team = game[side];
    const detail = useProPlayer(pitcher?.id ?? null, game.league, undefined, !!pitcher).data;
    const line = detail?.phases.find((phase) => phase.pitching)?.pitching ?? null;
    const arsenal = (detail?.arsenal ?? []).slice(0, 3);
    const record = pitcher?.wins !== null && pitcher?.wins !== undefined ? `${pitcher.wins}-${pitcher.losses ?? 0}` : line ? `${line.w}-${line.l}` : '—';
    const era = pitcher?.era ?? line?.era ?? '—';
    const whip = line?.whip ?? '—';
    const head = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {pitcher ? (
                <PlayerPhoto personId={pitcher.id} name={pitcher.name} size={52} background={withAlpha(team.color, 0.2)} team={team} />
            ) : (
                <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: team.color }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
                        <TeamLogo team={team} size={30} />
                    </View>
                </View>
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={15} weight="extrabold" style={{ letterSpacing: -0.3, lineHeight: 18 }}>
                    {pitcher?.name ?? t('preview.tbd')}
                </Txt>
                <Txt size={12} tone="muted" numberOfLines={1}>
                    {team.teamName}
                </Txt>
            </View>
        </View>
    );
    return (
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 10 }}>
            {pitcher ? (
                <Pressable
                    onPress={() => router.push(`/jugador/${pitcher.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={t('pro.previa.probables.open', { name: pitcher.name, team: team.teamName })}
                    style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
                >
                    {head}
                </Pressable>
            ) : (
                <View accessible accessibilityLabel={`${t('preview.tbd')}, ${team.teamName}`}>
                    {head}
                </View>
            )}
            {pitcher ? (
                <>
                    <View accessible accessibilityLabel={`${t('pro.previa.probables.wl')} ${record}, ${t('stats.era')} ${era}, WHIP ${whip}`} style={{ flexDirection: 'row', gap: 4 }}>
                        <Tile value={record} label={t('pro.previa.probables.wl')} />
                        <Tile value={era} label={t('stats.era')} />
                        <Tile value={whip} label="WHIP" />
                    </View>
                    {arsenal.length > 0 ? (
                        <View style={{ gap: 4 }}>
                            <View style={{ flexDirection: 'row', height: 8, gap: 2, borderRadius: 4, overflow: 'hidden' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                                {arsenal.map((pitch, index) => (
                                    <View key={pitch.code} style={{ flex: pitch.pct, backgroundColor: team.color, opacity: [1, 0.7, 0.45][index] }} />
                                ))}
                            </View>
                            <Txt size={10} tone="muted" style={{ lineHeight: 14 }}>
                                {t('pro.previa.probables.arsenal', { list: arsenal.map((pitch) => `${pitchTypeName({ type: pitch.code, typeDesc: pitch.name }, i18n.language)} ${Math.round(pitch.pct)} %`).join(' · ') })}
                            </Txt>
                        </View>
                    ) : null}
                </>
            ) : null}
        </View>
    );
};

export const Probables: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const none = !game.probables.away && !game.probables.home;
    return (
        <ProSection title={t('pro.kit.game.probables')} headerOutside>
            <View style={{ flexDirection: 'row', gap: 14 }}>
                <Starter game={game} side="away" pitcher={game.probables.away} />
                <Starter game={game} side="home" pitcher={game.probables.home} />
            </View>
            {none ? (
                <ProNote style={{ marginTop: 14 }} title={t('pro.previa.probables.tbdTitle')}>
                    {game.league === 'lidom' ? t('pro.previa.probables.lidom') : t('pro.previa.probables.later')}
                </ProNote>
            ) : (
                <Txt size={12} tone="muted" style={{ marginTop: 12, lineHeight: 16 }}>
                    {t('pro.previa.probables.note')}
                </Txt>
            )}
        </ProSection>
    );
};
