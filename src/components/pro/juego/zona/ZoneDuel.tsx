import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AtBat, GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { seasonLabel } from '../../../../lib/format';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { Chip, Gauge, GradientCard, LiveDot, ModuleHeader, lastName, shortName } from '../../kit';
import { useSeasonContext } from '../vivo/logic';
import { Avatar, CountDots, sidesOf } from '../vivo/parts';
import { batterSide, pitcherSide, queueLine } from '../vivo/duel';
import { PaChips } from '../vivo/PaChips';

// Duelo arriba de la hoja de zona: lanzador contra bateador con lo de hoy (pitcheos, H-VB, turnos), la línea del
// lanzador, el conteo con los corredores y quién viene en espera.

interface ZoneDuelProps {
    game: GameDetail;
    pro?: GamePro;
    atBat: AtBat;
}

const STATS = ['ip', 'h', 'r', 'er', 'bb', 'k'] as const;

export const ZoneDuel: React.FC<ZoneDuelProps> = ({ game, pro, atBat }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const live = game.state === 'live' && !atBat.complete;
    const { batting, fielding } = sidesOf(game, atBat.top);
    const batter = batterSide(game, pro, atBat.batter, batting, t('pro.vivo.hbpCode'));
    const pitcher = pitcherSide(game, pro, atBat.pitcher, fielding);
    const pitcherSeason = useSeasonContext(pitcher.ref.id, game.league, game.gamePk);
    const hand = (value: string | null, kind: 'bats' | 'throws') => (value ? t(`pro.vivo.hand.${kind}.${value}`, { defaultValue: value }) : null);
    // La cola del PRO solo vale si es la de este bateador (las dos lecturas pueden ir desfasadas un turno)
    const offense = pro?.offense && pro.offense.batter?.id === atBat.batter.id ? pro.offense : null;
    const onDeck = live ? (offense?.onDeck ?? game.matchup?.onDeck ?? null) : null;
    const onDeckPlayer = onDeck ? pro?.players?.[String(onDeck.id)] : null;
    const onDeckLine = onDeck ? queueLine(game, onDeck.id) : null;
    const line = pitcher.line;
    const prev = pitcherSeason?.previous?.pitching;
    // Sin entradas esta temporada antes de hoy se muestra la anterior; si no, la de ahora con hoy (box de MLB)
    const seasonText = !pitcherSeason
        ? null
        : pitcherSeason.gamesBefore === 0 && prev
          ? t('pro.zona.seasonPrev', { name: lastName(pitcher.ref.name), season: seasonLabel(pitcherSeason.season - 1, game.league), era: prev.era, whip: prev.whip, ip: prev.ip })
          : pitcher.box?.season.era
            ? t('pro.zona.seasonNow', { name: lastName(pitcher.ref.name), season: seasonLabel(pitcherSeason.season, game.league), era: pitcher.box.season.era, whip: pitcher.box.season.whip ?? '—', ip: pitcher.box.season.ip ?? '—' })
            : null;
    const runners = (['first', 'second', 'third'] as const).filter((base) => game.runners[base] && live);

    const person = (who: 'pitcher' | 'batter') => {
        const data = who === 'pitcher' ? pitcher : batter;
        const number = data.player?.number ?? (who === 'batter' ? batter.box?.number : pitcher.box?.number) ?? null;
        const parts = [number ? `#${number}` : null, who === 'pitcher' ? hand(pitcher.hand, 'throws') : hand(batter.side, 'bats'), who === 'batter' ? (batter.box?.pos ?? batter.line?.pos ?? null) : null, data.team.abbrev].filter(Boolean);
        const end = who === 'batter';
        return (
            <View accessible accessibilityLabel={`${t(who === 'pitcher' ? 'pro.vivo.pitching' : 'pro.vivo.atBat')}: ${data.ref.name}, ${parts.join(', ')}`} style={{ flex: 1, minWidth: 0, gap: 6, alignItems: end ? 'flex-end' : 'flex-start' }}>
                <Avatar person={data.ref} team={data.team} size={56} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {end && live && <LiveDot size={6} />}
                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                        {t(who === 'pitcher' ? 'pro.vivo.pitching' : 'pro.vivo.atBat')}
                    </Txt>
                </View>
                <Txt size={17} weight="black" style={{ width: '100%', lineHeight: 20, letterSpacing: -0.3, textAlign: end ? 'right' : 'left' }}>
                    {data.ref.name}
                </Txt>
                <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ width: '100%', textAlign: end ? 'right' : 'left' }}>
                    {parts.join(' · ')}
                </Txt>
            </View>
        );
    };

    return (
        <GradientCard accessibilityLabel={t('pro.zona.duel')} innerStyle={{ padding: 16, gap: 12 }}>
            <ModuleHeader
                title={t('pro.zona.duel')}
                aside={
                    live ? (
                        <Chip tone="live" icon={<LiveDot size={6} />}>
                            {t('pro.zona.liveTurn')}
                        </Chip>
                    ) : (
                        <Chip>{t('pro.zona.lastTurn')}</Chip>
                    )
                }
            />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                {person('pitcher')}
                <View style={{ marginTop: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={11} weight="extrabold" tone="muted">
                        vs
                    </Txt>
                </View>
                {person('batter')}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, flexBasis: 0, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 10 }}>
                    <Gauge value={pitcher.pitches} max={100} size={48} thickness={5} color={colors.strike} label={t('pro.zona.pitchesToday', { count: pitcher.pitches })}>
                        <Txt condensed size={18} tabular>
                            {pitcher.pitches}
                        </Txt>
                    </Gauge>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={13} weight="extrabold">
                            {t('pro.zona.pitchesTodayShort')}
                        </Txt>
                        <Txt size={12} tone="muted">
                            {t('pro.zona.strikes', { count: pitcher.strikes })}
                        </Txt>
                    </View>
                </View>
                <View style={{ flex: 1, flexBasis: 0, minWidth: 0, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 10 }}>
                    <View accessible style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <Txt condensed size={26} tabular style={{ lineHeight: 28 }}>
                            {batter.line ? `${batter.line.h}-${batter.line.ab}` : '—'}
                        </Txt>
                        <Txt size={12} weight="bold" tone="muted">
                            {t('pro.vivo.today')}
                        </Txt>
                    </View>
                    <PaChips pas={batter.pas} style={{ marginTop: 6 }} />
                </View>
            </View>

            {line && (
                <View accessible accessibilityLabel={`${t('pro.zona.pitcherToday', { name: pitcher.ref.name })}: ${STATS.map((key) => `${line[key]} ${t(`pro.vivo.stat.${key}.name`)}`).join(', ')}`} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Txt size={11} weight="bold" tone="muted" numberOfLines={2} style={{ width: '28%' }}>
                        {t('pro.zona.todayOf', { name: lastName(pitcher.ref.name) })}
                    </Txt>
                    {STATS.map((key) => (
                        <View key={key} style={{ flex: 1, alignItems: 'center' }}>
                            <Txt size={11} weight="bold" tone="muted">
                                {t(`pro.vivo.stat.${key}.short`)}
                            </Txt>
                            <Txt condensed size={20} tabular>
                                {line[key]}
                            </Txt>
                        </View>
                    ))}
                </View>
            )}
            {seasonText && (
                <Txt size={12} tone="muted">
                    {seasonText}
                </Txt>
            )}

            {live && (
                <View style={{ gap: 12, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Txt condensed size={34} tabular style={{ lineHeight: 36 }}>
                            {game.count.balls}-{game.count.strikes}
                        </Txt>
                        <CountDots balls={game.count.balls} strikes={game.count.strikes} outs={game.count.outs} />
                        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 }}>
                            {runners.length ? (
                                runners.map((base) => (
                                    <Txt key={base} size={12} weight="bold" numberOfLines={1}>
                                        {t(`pro.vivo.base.${base}`)} <Txt size={12} weight="extrabold">{shortName(game.runners[base]!.name, true)}</Txt>
                                    </Txt>
                                ))
                            ) : (
                                <Txt size={12} weight="bold" tone="muted">
                                    {t('pro.vivo.basesEmpty')}
                                </Txt>
                            )}
                        </View>
                    </View>
                    {onDeck && (
                        <View accessible style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingTop: 12 }}>
                            <Avatar person={onDeck} team={batting} size={36} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt size={11} weight="extrabold" color={colors.accentInk} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                    {t('pro.vivo.onDeck')}
                                </Txt>
                                <Txt size={14} weight="extrabold" numberOfLines={1}>
                                    {onDeck.name}
                                    {onDeckPlayer?.pos ? <Txt size={14} weight="semibold" tone="muted">{` · ${onDeckPlayer.pos}`}</Txt> : null}
                                </Txt>
                            </View>
                            {onDeckLine && (
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Txt condensed size={20} tabular>
                                        {onDeckLine.h}-{onDeckLine.ab}
                                    </Txt>
                                    <Txt size={11} tone="muted">
                                        {t('pro.vivo.today')}
                                    </Txt>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            )}
        </GradientCard>
    );
};
