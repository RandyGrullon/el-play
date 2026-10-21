import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { GameDetail, PersonRef } from '../../../../types';
import type { GamePro, SplitLine } from '../../../../lib/pro/juego';
import { useMatchup } from '../../../../lib/pro/juego';
import { seasonLabel } from '../../../../lib/format';
import { atBatForZone } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { alpha, shadow } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { Chip, Gauge, LiveDot, ModuleHeader, fmtPercent, lastName, shortName, useProColors } from '../../kit';
import { countryShort, useSeasonContext } from './logic';
import { Avatar, isBetween, ordinal } from './parts';
import { batterSide, pitcherSide, queueLine, type BatterSide, type PitcherSide } from './duel';
import { PaChips } from './PaChips';

// Duelo en vivo: dos tarjetas enfrentadas (bateador con lo de hoy, su temporada, contra zurdos y derechos y su
// historial contra este lanzador; lanzador con el medidor de pitcheos, su línea de hoy, su temporada y la vez por
// el orden) y la cola Al bate · En espera · En el hoyo.

interface DuelBlockProps {
    game: GameDetail;
    pro?: GamePro;
}

type T = (key: string, options?: Record<string, unknown>) => string;

/** Cifra chica con su etiqueta (AVG, IP…); el lector oye «.667 AVG» */
const Mini: React.FC<{ value: React.ReactNode; label: string; title?: string; small?: boolean }> = ({ value, label, title, small }) => {
    const colors = useColors();
    return (
        <View accessible accessibilityLabel={`${value} ${title ?? label}`} style={{ flex: 1, flexBasis: 0, minWidth: 0, borderRadius: 12, backgroundColor: alpha(colors.bg, 0.5), paddingHorizontal: 2, paddingVertical: 6, alignItems: 'center' }}>
            <Txt condensed size={small ? 16 : 19} tabular numberOfLines={1} style={{ lineHeight: small ? 18 : 21 }}>
                {value}
            </Txt>
            <Txt size={10} weight="bold" tone="muted" numberOfLines={1} style={{ marginTop: 2, textTransform: 'uppercase' }}>
                {label}
            </Txt>
        </View>
    );
};

const avg = (line: SplitLine | null | undefined) => (line && line.ab ? line.avg : null);

const identity = (t: T, lang: string, hand: string | null, kind: 'bats' | 'throws', age: number | null | undefined, country: string | null | undefined) =>
    [hand ? t(`pro.vivo.hand.${kind}.${hand}`, { defaultValue: hand }) : null, age ? t('pro.vivo.age', { count: age }) : null, countryShort(country, lang)].filter(Boolean).join(' · ');

const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
    <Txt size={11} weight="extrabold" tone="muted" color={color} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
        {children}
    </Txt>
);

/** Tarjeta del duelo con el degradado suave del color de su equipo */
const DuelCard: React.FC<{ color: string; label: string; wide: boolean; children: React.ReactNode }> = ({ color, label, wide, children }) => {
    const colors = useColors();
    return (
        <View accessibilityLabel={label} style={[{ flex: wide ? 1 : undefined, flexBasis: wide ? 0 : undefined, minWidth: 0, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), overflow: 'hidden' }, shadow('card')]}>
            <LinearGradient colors={[alpha(color, 0.22), alpha(color, 0.06), alpha(color, 0)]} locations={[0, 0.45, 0.75]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ padding: 14 }}>{children}</View>
        </View>
    );
};

const Divider: React.FC = () => {
    const colors = useColors();
    return <View style={{ height: 1, backgroundColor: alpha(colors.line, 0.1), marginTop: 12, marginBottom: 10 }} />;
};

const BatterCard: React.FC<{ game: GameDetail; batter: BatterSide; pitcherName: string; pitcherId: number; wide: boolean }> = ({ game, batter, pitcherName, pitcherId, wide }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const lang = i18n.language;
    const live = game.state === 'live';
    const season = useSeasonContext(batter.ref.id, game.league, game.gamePk);
    const matchup = useMatchup(game.league, batter.ref.id, pitcherId, live).data;
    const splits = matchup?.batter?.id === batter.ref.id ? matchup.batter.splits : null;
    const vs = matchup?.batter?.id === batter.ref.id ? matchup.vs : null;
    const line = batter.line;
    const box = batter.box;
    const prev = season?.previous?.hitting;
    const number = batter.player?.number ?? box?.number;
    const pos = box?.pos ?? line?.pos;
    return (
        <DuelCard color={batter.team.color} label={t('pro.vivo.duel.batterAria', { name: batter.ref.name })} wide={wide}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Avatar person={batter.ref} team={batter.team} size={50} />
                <View style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {live && <LiveDot size={6} />}
                        <Eyebrow color={proColors.live}>{t('pro.vivo.atBat')}</Eyebrow>
                    </View>
                    <Txt size={12} weight="bold" tone="muted" numberOfLines={1}>
                        {[number ? `#${number}` : null, pos].filter(Boolean).join(' · ')}
                    </Txt>
                </View>
            </View>
            <Txt size={17} weight="black" accessibilityRole="header" style={{ marginTop: 8, lineHeight: 20, letterSpacing: -0.3 }}>
                {batter.ref.name}
            </Txt>
            <Txt size={12} tone="muted" numberOfLines={1}>
                {identity(t, lang, batter.side, 'bats', batter.player?.age, batter.player?.country)}
            </Txt>

            <Divider />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}>
                <Eyebrow>{t('pro.vivo.today')}</Eyebrow>
                <Txt condensed size={26} tabular style={{ lineHeight: 28 }}>
                    {line ? `${line.h}-${line.ab}` : '—'}
                </Txt>
                {line && (line.rbi > 0 || line.r > 0) ? (
                    <Txt size={12} weight="semibold" tone="muted">
                        {[line.rbi ? t('pro.vivo.rbi', { count: line.rbi }) : null, line.r ? t('pro.vivo.runs', { count: line.r }) : null].filter(Boolean).join(' · ')}
                    </Txt>
                ) : null}
            </View>
            <PaChips pas={batter.pas} style={{ marginTop: 6 }} />

            {box?.season.avg ? (
                <>
                    <Divider />
                    <Eyebrow>{season ? t('pro.vivo.duel.seasonWithToday', { season: seasonLabel(season.season, game.league) }) : t('pro.vivo.duel.seasonWithTodayShort')}</Eyebrow>
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                        <Mini value={box.season.avg} label="AVG" title={t('pro.vivo.duel.avg')} />
                        <Mini value={box.season.obp ?? '—'} label="OBP" title={t('pro.vivo.duel.obp')} />
                        <Mini value={box.season.ops ?? '—'} label="OPS" title={t('pro.vivo.duel.ops')} />
                    </View>
                    {season && season.gamesBefore === 0 && (
                        <Txt size={11} tone="muted" style={{ marginTop: 6, lineHeight: 15 }}>
                            {t('pro.vivo.duel.firstGame')}{' '}
                            {prev ? t('pro.vivo.duel.prevBat', { season: seasonLabel(season.season - 1, game.league), avg: prev.avg, ops: prev.ops, count: prev.g }) : t('pro.vivo.duel.noPrev', { season: seasonLabel(season.season - 1, game.league) })}
                        </Txt>
                    )}
                </>
            ) : null}

            {splits || vs ? (
                <View style={{ marginTop: 10, gap: 4 }}>
                    {splits &&
                        (['vl', 'vr'] as const).map((key) =>
                            splits[key] ? (
                                <View key={key} accessible style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                                    <Txt size={12} tone="muted">
                                        {t(`pro.vivo.duel.${key}`)}
                                    </Txt>
                                    <Txt condensed size={17} color={colors.accentInk} tabular>
                                        {avg(splits[key]) ?? '—'}
                                        <Txt size={10} weight="semibold" tone="muted">
                                            {` ${t('pro.vivo.duel.pa', { count: splits[key]!.pa ?? 0 })}`}
                                        </Txt>
                                    </Txt>
                                </View>
                            ) : null
                        )}
                    {vs && (
                        <View accessible style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <Txt size={12} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {t('pro.vivo.duel.vs', { name: lastName(pitcherName) })}
                            </Txt>
                            <Txt condensed size={17} color={colors.accentInk} tabular>
                                {vs.line.h ?? 0}-{vs.line.ab ?? 0}
                                {vs.line.bb ? (
                                    <Txt size={10} weight="semibold" tone="muted">
                                        {` ${t('pro.vivo.duel.bb', { count: vs.line.bb })}`}
                                    </Txt>
                                ) : null}
                            </Txt>
                        </View>
                    )}
                    {splits && (
                        <Txt size={10} tone="faint">
                            {t('pro.vivo.duel.splitsSeason', { season: seasonLabel(splits.season, game.league) })}
                        </Txt>
                    )}
                </View>
            ) : null}
        </DuelCard>
    );
};

const PitcherCard: React.FC<{ game: GameDetail; pro?: GamePro; pitcher: PitcherSide; wide: boolean }> = ({ game, pro, pitcher, wide }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const season = useSeasonContext(pitcher.ref.id, game.league, game.gamePk);
    const line = pitcher.line;
    const box = pitcher.box;
    const prev = season?.previous?.pitching;
    const usePrev = !!season && season.gamesBefore === 0 && !!prev;
    const number = pitcher.player?.number ?? box?.number;
    const role = box ? t(box.starter ? 'pro.vivo.duel.starter' : 'pro.vivo.duel.reliever') : null;
    const tto = pro?.current && pro.current.pitcher === pitcher.ref.id ? pro.current.tto : null;
    const pct = pitcher.pitches ? fmtPercent(pitcher.strikes / pitcher.pitches, 0, lang) : null;
    return (
        <DuelCard color={pitcher.team.color} label={t('pro.vivo.duel.pitcherAria', { name: pitcher.ref.name })} wide={wide}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Avatar person={pitcher.ref} team={pitcher.team} size={50} />
                <View style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                    <Eyebrow>{t('pro.vivo.pitching')}</Eyebrow>
                    <Txt size={12} weight="bold" tone="muted" numberOfLines={1}>
                        {[number ? `#${number}` : null, role].filter(Boolean).join(' · ')}
                    </Txt>
                </View>
            </View>
            <Txt size={17} weight="black" accessibilityRole="header" style={{ marginTop: 8, lineHeight: 20, letterSpacing: -0.3 }}>
                {pitcher.ref.name}
            </Txt>
            <Txt size={12} tone="muted" numberOfLines={1}>
                {identity(t, lang, pitcher.hand, 'throws', pitcher.player?.age, pitcher.player?.country)}
            </Txt>

            <Divider />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Gauge value={pitcher.pitches} max={100} size={54} thickness={6} color={colors.strike} label={t('pro.zona.pitchesToday', { count: pitcher.pitches })}>
                    <Txt condensed size={20} tabular>
                        {pitcher.pitches}
                    </Txt>
                </Gauge>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={13} weight="extrabold">
                        {t('pro.vivo.duel.pitches')}
                    </Txt>
                    <Txt size={11} tone="muted" numberOfLines={2}>
                        {t('pro.zona.strikes', { count: pitcher.strikes })}
                        {pct ? ` · ${pct}` : ''}
                    </Txt>
                    {pitcher.since ? (
                        <Txt size={11} tone="muted" numberOfLines={1}>
                            {t('pro.vivo.duel.since', { inning: ordinal(pitcher.since, lang) })}
                        </Txt>
                    ) : null}
                </View>
            </View>
            {line && (
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                    {(['ip', 'h', 'er', 'bb', 'k'] as const).map((key) => (
                        <Mini key={key} small value={line[key]} label={t(`pro.vivo.stat.${key}.short`)} title={t(`pro.vivo.stat.${key}.name`)} />
                    ))}
                </View>
            )}

            {usePrev || box?.season.era ? (
                <>
                    <Divider />
                    <Eyebrow>
                        {usePrev ? t('pro.vivo.duel.seasonPrev', { season: seasonLabel(season!.season - 1, game.league), count: prev!.g }) : season ? t('pro.vivo.duel.seasonWithToday', { season: seasonLabel(season.season, game.league) }) : t('pro.vivo.duel.seasonWithTodayShort')}
                    </Eyebrow>
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                        <Mini value={usePrev ? prev!.era : box!.season.era} label={t('pro.vivo.duel.era')} title={t('pro.vivo.duel.eraName')} />
                        <Mini value={usePrev ? prev!.whip : (box?.season.whip ?? '—')} label="WHIP" title={t('pro.vivo.duel.whip')} />
                    </View>
                    {usePrev && (
                        <Txt size={11} tone="muted" style={{ marginTop: 6, lineHeight: 15 }}>
                            {t('pro.vivo.duel.noInningsYet', { season: seasonLabel(season!.season, game.league) })}
                        </Txt>
                    )}
                </>
            ) : null}
            {tto ? (
                <Chip tone={tto >= 3 ? 'warn' : 'neutral'} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                    {t('pro.vivo.duel.tto', { n: ordinal(tto, lang) })}
                </Chip>
            ) : null}
        </DuelCard>
    );
};

const QueueItem: React.FC<{ game: GameDetail; person: PersonRef; label: string; team: GameDetail['away']; live?: boolean; wide: boolean }> = ({ game, person, label, team, live, wide }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const line = queueLine(game, person.id);
    return (
        <View accessible accessibilityLabel={`${label}: ${person.name}${line ? `, ${t('pro.vivo.todayLine', { line: `${line.h}-${line.ab}` })}` : ''}`} style={{ flex: wide ? 1 : undefined, flexBasis: wide ? 0 : undefined, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar person={person} team={team} size={34} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={10} weight="extrabold" color={live ? proColors.live : colors.accentInk} numberOfLines={1} style={{ textTransform: 'uppercase' }}>
                    {label}
                </Txt>
                <Txt size={13} weight="extrabold" numberOfLines={1}>
                    {shortName(person.name)}
                </Txt>
                {line && (
                    <Txt size={11} tone="muted" numberOfLines={1}>
                        {t('pro.vivo.todayLine', { line: `${line.h}-${line.ab}` })}
                    </Txt>
                )}
            </View>
        </View>
    );
};

export const DuelBlock: React.FC<DuelBlockProps> = ({ game, pro }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const wide = useWindowDimensions().width >= 370;
    const { atBat } = atBatForZone(game);
    if (!atBat || isBetween(game)) return null;
    const batting = atBat.top ? game.away : game.home;
    const fielding = atBat.top ? game.home : game.away;
    const batter = batterSide(game, pro, atBat.batter, batting, t('pro.vivo.hbpCode'));
    const pitcher = pitcherSide(game, pro, atBat.pitcher, fielding);
    // La cola del PRO solo vale si es la de este bateador (las dos lecturas pueden ir desfasadas un turno)
    const offense = pro?.offense && pro.offense.batter?.id === atBat.batter.id ? pro.offense : null;
    const onDeck = offense?.onDeck ?? game.matchup?.onDeck ?? null;
    const inHole = offense?.inHole ?? null;

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.zona.duel')} />
            <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'stretch' : undefined, gap: 10 }}>
                <BatterCard game={game} batter={batter} pitcherName={pitcher.ref.name} pitcherId={pitcher.ref.id} wide={wide} />
                <PitcherCard game={game} pro={pro} pitcher={pitcher} wide={wide} />
            </View>
            <View
                accessibilityLabel={t('pro.vivo.queue')}
                style={[{ flexDirection: wide ? 'row' : 'column', gap: wide ? 8 : 10, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 12 }, shadow('card')]}
            >
                <QueueItem game={game} person={atBat.batter} label={t('pro.vivo.atBat')} team={batting} live wide={wide} />
                {onDeck && <QueueItem game={game} person={onDeck} label={t('pro.vivo.onDeck')} team={batting} wide={wide} />}
                {inHole && <QueueItem game={game} person={inHole} label={t('pro.vivo.inHole')} team={batting} wide={wide} />}
            </View>
        </View>
    );
};
