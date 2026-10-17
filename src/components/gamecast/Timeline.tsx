import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AtBat, GameDetail, Pitch } from '../../types';
import { describePlay, eventName, eventTone, inningName, pitchCallName, pitchTypeName } from '../../lib/baseball';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { Row, Txt } from '../ui';
import { toneColors } from '../game/colors';

const PitchBubble: React.FC<{ pitch: Pitch; last: boolean }> = ({ pitch, last }) => {
    const { i18n } = useTranslation();
    const colors = useColors();
    const color = colors[pitch.r];
    const kind = pitch.type || pitch.typeDesc ? ` · ${pitchTypeName(pitch, i18n.language)}` : '';
    const text = `${pitch.n ?? ''} · ${pitchCallName(pitch, i18n.language)}${kind}${pitch.mph ? ` ${pitch.mph.toFixed(1)}` : ''}`;
    return (
        <View style={{ maxWidth: '85%', borderRadius: 18, borderBottomRightRadius: last ? 6 : 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: last ? color : alpha(color, 0.15) }}>
            <Txt size={13} weight="semibold" color={last ? '#fff' : color}>
                {text}
            </Txt>
        </View>
    );
};

const PlayBubble: React.FC<{ atBat: AtBat; game: GameDetail }> = ({ atBat, game }) => {
    const { i18n } = useTranslation();
    const colors = useColors();
    const team = atBat.top ? game.away : game.home;
    const tone = toneColors(colors, eventTone(atBat.event));
    return (
        <View style={[{ maxWidth: '88%', alignSelf: 'flex-start', borderRadius: 22, borderBottomLeftRadius: 6, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 }, shadow('card')]}>
            <Row gap={8} wrap style={{ marginBottom: 4 }}>
                <View style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: tone.bg }}>
                    <Txt size={11} weight="bold" color={tone.ink} style={{ textTransform: 'uppercase' }}>
                        {eventName(atBat, i18n.language)}
                    </Txt>
                </View>
                {atBat.scoring && atBat.away !== null && (
                    <Txt size={12} weight="bold" tabular>
                        {game.away.abbrev} {atBat.away} · {game.home.abbrev} {atBat.home}
                    </Txt>
                )}
                <View style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: 4, backgroundColor: team.color }} />
            </Row>
            <Txt size={14} style={{ lineHeight: 19 }}>
                {describePlay(atBat.desc, i18n.language)}
            </Txt>
        </View>
    );
};

// Cronología tipo chat: el turno de ahora con sus lanzamientos (el último resaltado) y debajo las jugadas
// anteriores, de la más reciente a la más vieja, con separadores por entrada.
export const Timeline: React.FC<{ game: GameDetail; limit?: number; onMore?: () => void }> = ({ game, limit = 12, onMore }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const current = game.state === 'live' ? game.atBats.find((atBat) => atBat.i === game.currentAtBat && !atBat.complete) : undefined;
    const past = game.atBats.filter((atBat) => atBat.complete).reverse();
    // Cada jugada con el separador de su media entrada (solo la primera de cada una)
    const shown = past.slice(0, limit).map((atBat, index, list) => {
        const half = inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language);
        const before = index ? inningName({ n: list[index - 1].inning, isTop: list[index - 1].top }, i18n.language) : '';
        return { atBat, separator: half !== before ? half : null };
    });

    return (
        <View accessibilityLabel={t('plays.title')} style={{ gap: 10 }}>
            {current && (
                <>
                    <View style={[{ maxWidth: '88%', alignSelf: 'flex-start', borderRadius: 22, borderBottomLeftRadius: 6, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 }, shadow('card')]}>
                        <Txt size={14}>
                            {t('timeline.atBat')}{' '}
                            <Txt size={14} weight="bold">
                                {current.batter.name}
                            </Txt>{' '}
                            <Txt size={14} tone="muted">
                                {t('zone.facing')}
                            </Txt>{' '}
                            <Txt size={14} weight="bold">
                                {current.pitcher.name}
                            </Txt>
                        </Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        {current.pitches.length === 0 ? (
                            <View style={{ borderRadius: 18, backgroundColor: colors.raised, paddingHorizontal: 14, paddingVertical: 8 }}>
                                <Txt size={13} weight="semibold" tone="muted">
                                    {t('zone.waiting')}
                                </Txt>
                            </View>
                        ) : (
                            current.pitches.map((pitch, index) => <PitchBubble key={index} pitch={pitch} last={index === current.pitches.length - 1} />)
                        )}
                    </View>
                </>
            )}
            {shown.map(({ atBat, separator }) => (
                <React.Fragment key={atBat.i}>
                    {separator && (
                        <Txt size={12} weight="bold" tone="muted" center style={{ marginTop: 8 }}>
                            {separator}
                        </Txt>
                    )}
                    <PlayBubble atBat={atBat} game={game} />
                </React.Fragment>
            ))}
            {past.length === 0 && !current && (
                <Txt size={14} tone="muted" center style={{ paddingVertical: 24 }}>
                    {t('plays.none')}
                </Txt>
            )}
            {past.length > limit && onMore && (
                <Pressable onPress={onMore} accessibilityRole="button" style={[{ marginTop: 4, alignSelf: 'center', borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 8 }, shadow('card')]}>
                    <Txt size={14} weight="bold">
                        {t('timeline.more', { count: past.length - limit })}
                    </Txt>
                </Pressable>
            )}
        </View>
    );
};
