import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { FormGame } from '../../../../types/pro-liga';
import { formatShortDate } from '../../../../lib/format';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { ProSection, useInView, useProColors } from '../../kit';
import type { SeriesSource } from './logica';
import { SeenEnter } from './shared';

// Forma reciente: los últimos 5 de cada uno con su marcador (del más reciente al más viejo) y el récord de los
// últimos 10. Las casillas punteadas son los juegos que todavía no se han jugado.

const SLOTS = 5;

export const RecentForm: React.FC<{ game: GameDetail; source: SeriesSource }> = ({ game, source }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const { setNode, onLayout, seen } = useInView();
    const lang = i18n.language;
    const dateOf = (item: FormGame) => formatShortDate(`${item.day}T16:00:00Z`, lang);

    const describe = (item: FormGame) => {
        const rival = source.teams[item.opponentId]?.abbrev ?? String(item.opponentId);
        return t(item.isHome ? 'pro.previa.form.vs' : 'pro.previa.form.at', { result: t(item.isWin ? 'pro.previa.form.w' : 'pro.previa.form.l'), team: rival });
    };

    const row = (team: GameDetail['away'], rowIndex: number) => {
        const games = (source.form[team.id] ?? []).slice(0, 10);
        const last5 = games.slice(0, SLOTS);
        const wins = games.filter((item) => item.isWin).length;
        const aria = last5.length
            ? t('pro.previa.form.aria', { team: team.abbrev, list: last5.map((item) => `${describe(item)} ${item.runs}-${item.runsAllowed}, ${dateOf(item)}`).join('; ') })
            : t('pro.previa.form.none', { team: team.abbrev });
        return (
            <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TeamLogo team={team} size={28} />
                    <Txt size={13} weight="extrabold" style={{ flex: 1 }}>
                        {team.abbrev}
                    </Txt>
                    <View style={{ alignItems: 'flex-end' }} accessible accessibilityLabel={t('pro.previa.form.last10Aria', { team: team.abbrev, wins, losses: games.length - wins, count: games.length })}>
                        <Txt condensed size={20} tabular style={{ lineHeight: 22 }}>{`${wins}-${games.length - wins}`}</Txt>
                        {games.length < 10 ? (
                            <Txt size={11} tone="muted">
                                {t('pro.previa.form.toPlay', { count: 10 - games.length })}
                            </Txt>
                        ) : null}
                    </View>
                </View>
                <View accessible accessibilityRole="image" accessibilityLabel={aria} style={{ flexDirection: 'row', gap: 6 }}>
                    {Array.from({ length: SLOTS }, (_, index) => {
                        const item = last5[index];
                        const order = rowIndex * SLOTS + index;
                        if (!item) {
                            return (
                                <SeenEnter key={`e${index}`} seen={seen} index={order} style={{ flex: 1, flexBasis: 0, height: 60, borderRadius: radius.tile, borderWidth: 1.5, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.2) }}>
                                    <View />
                                </SeenEnter>
                            );
                        }
                        const tone = item.isWin ? pro.up : pro.down;
                        return (
                            <SeenEnter
                                key={item.gamePk}
                                seen={seen}
                                index={order}
                                style={{ flex: 1, flexBasis: 0, minWidth: 0, height: 60, borderRadius: radius.tile, borderTopWidth: 3, borderTopColor: tone, backgroundColor: alpha(tone, 0.14), alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 2 }}
                            >
                                <Txt condensed size={20} tabular numberOfLines={1} style={{ lineHeight: 22 }}>{`${item.runs}-${item.runsAllowed}`}</Txt>
                                <Txt size={10} weight="extrabold" color={tone} numberOfLines={1}>
                                    {describe(item)}
                                </Txt>
                                <Txt size={10} tone="muted" numberOfLines={1}>
                                    {dateOf(item).replace(/^\S+\s/, '')}
                                </Txt>
                            </SeenEnter>
                        );
                    })}
                </View>
            </View>
        );
    };

    return (
        <ProSection title={t('pro.previa.form.title')} aside={t('pro.previa.form.aside')} headerOutside>
            <View ref={setNode} onLayout={onLayout} style={{ gap: 16 }}>
                {row(game.away, 0)}
                {row(game.home, 1)}
            </View>
            <Txt size={12} tone="muted" style={{ marginTop: 12, lineHeight: 16 }}>
                {t('pro.previa.form.note')}
                {source.window ? ` ${t('pro.previa.window', { from: formatShortDate(`${source.window.from}T16:00:00Z`, lang), to: formatShortDate(`${source.window.to}T16:00:00Z`, lang) })}` : ''}
            </Txt>
        </ProSection>
    );
};
