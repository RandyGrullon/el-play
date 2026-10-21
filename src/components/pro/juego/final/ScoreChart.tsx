import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AtBat, GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../../ui';
import { Enter, MarkerBadge, ProSection, StepChart, withAlpha } from '../../kit';
import { inningLabel, ordinal } from '../previa/logica';
import { biggestLead, cumulativeRuns } from './logica';
import { resultText } from './text';

// Gráfica del marcador: escalones por entrada en los dos colores con un «HR» en cada entrada con jonrón.
// Al tocarlo se abre la jugada (foto, entrada, distancia, velocidad y ángulo). Debajo, la mayor ventaja.

export const ScoreChart: React.FC<{ game: GameDetail; pro?: GamePro }> = ({ game, pro }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const [open, setOpen] = useState<string | null>(null);
    const innings = Math.max(game.scheduledInnings || 9, game.linescore.length);
    const away = cumulativeRuns(game.linescore, 'away');
    const home = cumulativeRuns(game.linescore, 'home');
    const lead = biggestLead(game.linescore);
    const homers = game.atBats.filter((atBat) => atBat.event === 'home_run');
    // Un marcador por equipo y entrada (si hubo dos jonrones en la misma entrada, se ven los dos al tocarlo)
    const groups = new Map<string, AtBat[]>();
    for (const atBat of homers) {
        const key = `${atBat.top ? 'away' : 'home'}-${atBat.inning}`;
        groups.set(key, [...(groups.get(key) ?? []), atBat]);
    }
    const markers = [...groups.entries()].map(([key, list]) => ({
        seriesId: key.split('-')[0],
        inning: list[0].inning,
        badge: 'HR',
        name: t('pro.final.score.hrMarker', { names: list.map((atBat) => atBat.batter.name).join(', '), inning: inningLabel(list[0].inning, list[0].top, lang) }),
        onPress: () => setOpen((value) => (value === key ? null : key))
    }));
    const shown = open ? (groups.get(open) ?? []) : [];

    return (
        <ProSection title={t('pro.final.score.title')} aside={t('pro.final.score.aside')}>
            <View style={{ marginBottom: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 6 }}>
                {(['away', 'home'] as const).map((side) => (
                    <View key={side} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: game[side].color }} />
                        <Txt size={12} weight="bold">{`${game[side].abbrev} ${game[side].runs}`}</Txt>
                    </View>
                ))}
                {markers.length > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MarkerBadge color={colors.gold}>HR</MarkerBadge>
                        <Txt size={12} weight="bold" tone="muted">
                            {t('pro.final.score.tapHr')}
                        </Txt>
                    </View>
                ) : null}
            </View>
            <StepChart
                innings={innings}
                height={180}
                series={[
                    { id: 'away', name: game.away.abbrev, color: game.away.color, values: away },
                    { id: 'home', name: game.home.abbrev, color: game.home.color, values: home }
                ]}
                markers={markers}
                label={t('pro.final.score.aria', { away: game.away.abbrev, awayList: away.join(', '), home: game.home.abbrev, homeList: home.join(', ') })}
            />
            <View accessibilityLiveRegion="polite" style={{ marginTop: 10, minHeight: 64 }}>
                {shown.length ? (
                    <View style={{ gap: 8 }}>
                        {shown.map((atBat) => {
                            const side = atBat.top ? 'away' : 'home';
                            const hit = atBat.pitches.find((pitch) => pitch.hit)?.hit;
                            const result = resultText(game, pro, atBat, t);
                            const numbers = hit ? [hit.dist ? t('pro.final.score.feet', { value: hit.dist }) : null, hit.ev ? `${hit.ev} mph` : null, hit.la !== null && hit.la !== undefined ? `${hit.la}°` : null].filter(Boolean).join(' · ') : '';
                            return (
                                <Enter
                                    key={atBat.i}
                                    accessible
                                    accessibilityLabel={[inningLabel(atBat.inning, atBat.top, lang), t('pro.final.score.hrOf', { batter: atBat.batter.name }), result, numbers].filter(Boolean).join(', ')}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.tile, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 10 }}
                                >
                                    <PlayerPhoto personId={atBat.batter.id} name={atBat.batter.name} size={40} background={withAlpha(game[side].color, 0.2)} team={game[side]} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                            {inningLabel(atBat.inning, atBat.top, lang)}
                                        </Txt>
                                        <Txt size={13} weight="extrabold" style={{ lineHeight: 17 }}>
                                            {t('pro.final.score.hrOf', { batter: atBat.batter.name })}
                                            {result ? (
                                                <Txt size={13} weight="semibold" tone="muted">
                                                    {` · ${result}`}
                                                </Txt>
                                            ) : null}
                                        </Txt>
                                        {numbers ? (
                                            <Txt condensed size={14} tabular>
                                                {numbers}
                                            </Txt>
                                        ) : null}
                                    </View>
                                </Enter>
                            );
                        })}
                    </View>
                ) : (
                    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: radius.tile, borderWidth: 1, borderColor: alpha(colors.line, 0.1), paddingHorizontal: 12, paddingVertical: 10 }}>
                        <Txt size={12} weight="semibold" tone="muted" style={{ flex: 1, lineHeight: 16 }}>
                            {markers.length ? t('pro.final.score.hint') : t('pro.final.score.noHr')}
                        </Txt>
                        {lead ? (
                            <View accessible accessibilityLabel={`${t('pro.final.score.biggest')}: +${lead.lead}, ${t('pro.final.score.inInning', { team: game[lead.side].abbrev, inning: ordinal(lead.inning, lang, 'f') })}`} style={{ alignItems: 'flex-end' }}>
                                <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                                    {t('pro.final.score.biggest')}
                                </Txt>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: game[lead.side].color }} />
                                    <Txt condensed size={20} tabular>{`+${lead.lead}`}</Txt>
                                </View>
                                <Txt size={11} weight="semibold" tone="muted">
                                    {t('pro.final.score.inInning', { team: game[lead.side].abbrev, inning: ordinal(lead.inning, lang, 'f') })}
                                </Txt>
                            </View>
                        ) : null}
                    </View>
                )}
            </View>
        </ProSection>
    );
};
