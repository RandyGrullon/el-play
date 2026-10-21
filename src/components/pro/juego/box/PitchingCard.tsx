import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import type { NameBook } from '../jugadas/model';
import { decisionOf, pitchingTotals } from '../jugadas/model';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { PlayerPhoto, TeamLogo, Txt } from '../../../ui';
import { GrowBar, ModuleHeader } from '../../kit';
import { RowIn, usePlayColors } from '../jugadas/parts';

type Side = 'away' | 'home';
const STATS = ['ip', 'h', 'r', 'er', 'bb', 'k'] as const;

// Chip de la decisión: «G, 1-0», «P, 0-1», «SV», «H», «SD» (la tinta un poco más cerca de la del tema)
const DecisionChip: React.FC<{ kind: string; record: string | null }> = ({ kind, record }) => {
    const { t } = useTranslation();
    const paint = usePlayColors();
    const { colors, pro } = paint;
    const tone =
        kind === 'W'
            ? { bg: alpha(pro.up, 0.15), ink: paint.tone(pro.up) }
            : kind === 'L'
              ? { bg: alpha(pro.down, 0.15), ink: paint.tone(pro.down) }
              : kind === 'S'
                ? { bg: alpha(colors.accent, 0.15), ink: colors.accentInk }
                : kind === 'BS'
                  ? { bg: alpha(pro.warn, 0.15), ink: paint.tone(pro.warn) }
                  : { bg: colors.raised, ink: colors.ink };
    return (
        <View style={{ flexShrink: 0, borderRadius: radius.pill, backgroundColor: tone.bg, paddingHorizontal: 6, paddingVertical: 1 }}>
            <Txt size={10.5} weight="extrabold" color={tone.ink}>
                {t(`pro.box.dec.${kind}`)}
                {record ? `, ${record}` : ''}
            </Txt>
        </View>
    );
};

// Pitcheo del equipo: IP-H-C-CL-BB-K de cada lanzador y, debajo, sus pitcheos-strikes en barra, a cuántos
// enfrentó, rodados y elevados, corredores heredados y holds. La decisión (G/P/SV) en un chip con su récord.
export const PitchingCard: React.FC<{ game: GameDetail; pro?: GamePro; side: Side; names: NameBook }> = ({ game, pro, side, names }) => {
    const { t } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const wide = useWindowDimensions().width >= 360;
    const team = game[side];
    const lines = game.box[side].pitchers;
    const totals = pitchingTotals(lines);
    const statWidth = wide ? 28 : 26;
    const width = (key: (typeof STATS)[number]) => (key === 'ip' ? 36 : statWidth);

    return (
        <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16, paddingBottom: 12 }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <TeamLogo team={team} size={18} />
                </View>
                <ModuleHeader title={t('pro.box.pit.title', { team: team.name })} style={{ flex: 1 }} />
            </View>
            {lines.length === 0 ? (
                <Txt size={14} tone="muted" center style={{ paddingVertical: 24 }}>
                    {t('pro.box.noPitchers')}
                </Txt>
            ) : (
                <View accessibilityLabel={t('pro.box.pit.caption', { team: team.name })}>
                    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center' }} aria-hidden>
                        <Txt size={10} weight="extrabold" tone="muted" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            {t('pro.box.pit.pitcher')}
                        </Txt>
                        {STATS.map((key) => (
                            <Txt key={key} size={10} weight="extrabold" tone="muted" style={{ width: width(key), textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                {t(`pro.box.pit.${key}`)}
                            </Txt>
                        ))}
                    </View>
                    {lines.map((line, index) => {
                        const extra = pro?.box[side].pitchers.find((entry) => entry.id === line.id);
                        const decision = decisionOf(line.note);
                        const name = names.label(line.id, line.name);
                        const full = names.full(line.id, line.name);
                        const season = extra?.season;
                        const record = season && season.w !== null && season.l !== null ? `${season.w}-${season.l}` : null;
                        const era = season?.era ?? line.era;
                        const strikeShare = line.np && line.st !== null ? line.st / line.np : null;
                        const seasonText = [record ? t('pro.box.pit.record', { record }) : null, era ? t('pro.box.pit.era', { era }) : null].filter(Boolean).join(' · ');
                        const facts = [
                            extra?.bf != null ? t('pro.box.pit.bf', { count: extra.bf }) : null,
                            extra?.go != null && extra?.ao != null ? `${t('pro.box.pit.go', { count: extra.go })}, ${t('pro.box.pit.ao', { count: extra.ao })}` : null
                        ].filter(Boolean) as string[];
                        const chips = [
                            extra && extra.ir > 0 ? t('pro.box.pit.inherited', { count: extra.ir, scored: extra.irs }) : null,
                            extra && extra.hld > 0 ? t('pro.box.pit.hold') : null,
                            extra && extra.bs > 0 ? t('pro.box.pit.blown') : null
                        ].filter(Boolean) as string[];
                        const pitches = line.np !== null ? t('pro.box.pit.npAria', { np: t('pro.box.pit.pitches', { count: line.np }), st: t('pro.box.pit.strikes', { count: line.st ?? 0 }) }) : null;
                        const label = [
                            `${full}${decision ? `, ${t(`pro.box.dec.${decision.kind}`)}${decision.record ? ` ${decision.record}` : ''}` : ''}`,
                            seasonText,
                            STATS.map((key) => `${line[key]} ${t(`pro.box.pit.${key}Title`)}`).join(', '),
                            pitches,
                            facts.join(', '),
                            chips.join(', ')
                        ]
                            .filter(Boolean)
                            .join('. ');
                        return (
                            <RowIn key={line.id} index={index} play style={{ borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08), paddingTop: 10, paddingBottom: 10, gap: 6 }}>
                                <View accessible accessibilityLabel={label} style={{ gap: 6 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            {wide && <PlayerPhoto personId={line.id} name={full} size={32} team={team} />}
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                    <Txt size={14} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                                        {name}
                                                    </Txt>
                                                    {decision && wide && <DecisionChip kind={decision.kind} record={decision.record} />}
                                                </View>
                                                {wide && seasonText ? (
                                                    <Txt size={11} tone="muted" numberOfLines={1}>
                                                        {seasonText}
                                                    </Txt>
                                                ) : null}
                                            </View>
                                        </View>
                                        {STATS.map((key) => (
                                            <Txt key={key} size={17} condensed tabular color={key !== 'ip' && !line[key] ? colors.muted : colors.ink} style={{ width: width(key), textAlign: 'right' }}>
                                                {line[key]}
                                            </Txt>
                                        ))}
                                    </View>
                                    {!wide && (seasonText || decision) ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            {decision && <DecisionChip kind={decision.kind} record={decision.record} />}
                                            <Txt size={11} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                                                {seasonText}
                                            </Txt>
                                        </View>
                                    ) : null}
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, paddingLeft: wide ? 40 : 0 }}>
                                        {line.np !== null && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                {strikeShare !== null && <GrowBar value={strikeShare} index={index} style={{ width: 56 }} />}
                                                <Txt size={15} condensed tabular>
                                                    {line.np}
                                                    {line.st !== null ? `-${line.st}` : ''}
                                                </Txt>
                                            </View>
                                        )}
                                        {facts.length > 0 && (
                                            <Txt size={11.5} tone="muted">
                                                {facts.join(' · ')}
                                            </Txt>
                                        )}
                                        {chips.map((chip) => (
                                            <View key={chip} style={{ borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 8, paddingVertical: 1 }}>
                                                <Txt size={11} weight="semibold">
                                                    {chip}
                                                </Txt>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </RowIn>
                        );
                    })}
                    <View
                        accessible
                        accessibilityLabel={[t('pro.box.totals'), totals.np !== null ? t('pro.box.pit.totalPitches', { np: t('pro.box.pit.pitches', { count: totals.np }), st: t('pro.box.pit.strikes', { count: totals.st ?? 0 }) }) : null, STATS.map((key) => `${totals[key]} ${t(`pro.box.pit.${key}Title`)}`).join(', ')]
                            .filter(Boolean)
                            .join('. ')}
                        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.2), paddingVertical: 6 }}
                    >
                        <Txt size={13} weight="extrabold" style={{ flex: 1, minWidth: 0 }}>
                            {t('pro.box.totals')}
                            {totals.np !== null ? (
                                <Txt size={wide ? 13 : 11} weight="semibold" tone="muted">
                                    {wide ? ' · ' : '\n'}
                                    {t('pro.box.pit.totalPitches', { np: t('pro.box.pit.pitches', { count: totals.np }), st: t('pro.box.pit.strikes', { count: totals.st ?? 0 }) })}
                                </Txt>
                            ) : null}
                        </Txt>
                        {STATS.map((key) => (
                            <Txt key={key} size={17} condensed tabular style={{ width: width(key), textAlign: 'right' }}>
                                {totals[key]}
                            </Txt>
                        ))}
                    </View>
                </View>
            )}
            <Txt size={11.5} tone="muted" style={{ marginTop: 8, lineHeight: 16 }}>
                {t('pro.box.pit.legend')}
            </Txt>
        </View>
    );
};
