import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { LineupPlayer } from '../../../../lib/pro/pantallas';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { ProSection, TeamChip, shortName, useInView } from '../../kit';
import { SeenEnter, useDivider } from './shared';

// Alineaciones (9 y 9) cuando MLB las publica antes del juego; si no hay ninguna, el bloque no sale.

const Column: React.FC<{ team: GameDetail['away']; players: LineupPlayer[] | null; align: 'start' | 'end'; seen: boolean }> = ({ team, players, align, seen }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const divider = useDivider();
    return (
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: align === 'end' ? 'flex-end' : 'flex-start' }}>
                <TeamChip team={team} logo={align} size="sm" />
            </View>
            {players?.length ? (
                <View accessible accessibilityLabel={`${t('pro.previa.lineups.of', { team: team.name })}: ${players.map((player) => `${player.order}. ${player.name}${player.pos ? ` (${player.pos})` : ''}`).join(', ')}`}>
                    {players.map((player, index) => (
                        <SeenEnter key={player.id} seen={seen} index={index} style={[{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 }, divider]}>
                            <Txt condensed size={14} tabular tone="muted" style={{ width: 16 }}>
                                {player.order}
                            </Txt>
                            <Txt size={13} weight="bold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                {shortName(player.name)}
                            </Txt>
                            {player.pos ? (
                                <Txt size={11} weight="semibold" tone="muted">
                                    {player.pos}
                                </Txt>
                            ) : null}
                        </SeenEnter>
                    ))}
                </View>
            ) : (
                <View style={{ borderRadius: radius.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.2), paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Txt size={12} tone="muted">
                        {t('pro.previa.lineups.pending')}
                    </Txt>
                </View>
            )}
        </View>
    );
};

export const Lineups: React.FC<{ game: GameDetail; lineups: { away: LineupPlayer[] | null; home: LineupPlayer[] | null } }> = ({ game, lineups }) => {
    const { t } = useTranslation();
    const { setNode, onLayout, seen } = useInView();
    return (
        <ProSection title={t('pro.previa.lineups.title')} aside={t('pro.previa.lineups.aside')} headerOutside>
            <View ref={setNode} onLayout={onLayout} style={{ flexDirection: 'row', gap: 12 }}>
                <Column team={game.away} players={lineups.away} align="start" seen={seen} />
                <Column team={game.home} players={lineups.home} align="end" seen={seen} />
            </View>
        </ProSection>
    );
};
