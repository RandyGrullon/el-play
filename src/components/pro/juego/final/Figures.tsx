import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react-native';
import type { Decision, GameDetail, TopPerformer } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { useColors } from '../../../../theme/theme';
import { alpha, fonts, radius } from '../../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../../ui';
import { CountUp, Gauge, ProSection, shortName, useInView, useProColors, withAlpha } from '../../kit';
import { useDivider } from '../previa/shared';
import { sideOfTeam, type Side } from './logica';

// Figuras del juego con el gameScore de MLB en medidor circular (sus 3 topPerformers; sin los datos PRO, las
// figuras del Lite sin medidor) y la franja de decisiones G / P / SV con récord y EFE. Tocar una figura abre su
// imagen para compartir (la del Lite).

type TFn = ReturnType<typeof useTranslation>['t'];

/** Línea del box del Lite como figura para compartir */
export const performerOf = (game: GameDetail, id: number, teamId: number | null, kind: 'pitcher' | 'hitter'): TopPerformer | null => {
    const side = sideOfTeam(game, teamId) ?? (game.box.away.pitchers.some((line) => line.id === id) || game.box.away.batters.some((line) => line.id === id) ? 'away' : 'home');
    const team = game[side];
    if (kind === 'pitcher') {
        const line = game.box[side].pitchers.find((item) => item.id === id);
        return line ? { kind: 'pitcher', teamId: team.id, ...line } : null;
    }
    const line = game.box[side].batters.find((item) => item.id === id);
    return line ? { kind: 'hitter', teamId: team.id, ...line } : null;
};

const statLine = (performer: TopPerformer | null, t: TFn) => {
    if (!performer) return ['', ''];
    if (performer.kind === 'pitcher') return [t('pro.final.figures.pitcher1', { ip: performer.ip, k: performer.k }), t('pro.final.figures.pitcher2', { r: performer.r, bb: performer.bb })];
    const first = [`${performer.h}-${performer.ab}`, performer.hr ? (performer.hr > 1 ? `${performer.hr} HR` : 'HR') : null, performer.rbi ? t('pro.final.figures.rbi', { count: performer.rbi }) : null].filter(Boolean).join(' · ');
    const second = [performer.bb ? `${performer.bb} BB` : null, performer.r ? t('pro.final.figures.runs', { count: performer.r }) : null, performer.k ? `${performer.k} K` : null].filter(Boolean).join(' · ');
    return [first, second];
};

const DecisionSlot: React.FC<{ tag: string; ink: string; bg: string; person: Decision | null; side: Side | null; game: GameDetail; extra: string; empty: string; emptySub: string; label: string }> = ({
    tag,
    ink,
    bg,
    person,
    side,
    game,
    extra,
    empty,
    emptySub,
    label
}) => {
    const colors = useColors();
    return (
        <View accessible accessibilityLabel={label} style={{ flexGrow: 1, flexBasis: 90, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {person && side ? (
                <PlayerPhoto personId={person.id} name={person.name} size={34} background={withAlpha(game[side].color, 0.2)} team={game[side]} />
            ) : (
                <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.25) }} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, backgroundColor: bg }}>
                    <Txt condensed size={12} color={ink}>
                        {tag}
                    </Txt>
                </View>
                <Txt size={12} weight="extrabold" numberOfLines={1} style={{ marginTop: 2 }}>
                    {person ? shortName(person.name) : empty}
                </Txt>
                <Txt condensed size={13} tabular tone="muted" numberOfLines={1}>
                    {person ? extra : emptySub}
                </Txt>
            </View>
        </View>
    );
};

export const Figures: React.FC<{ game: GameDetail; pro?: GamePro; onSharePerformer: (performer: TopPerformer) => void }> = ({ game, pro, onSharePerformer }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const divider = useDivider();
    const { setNode, onLayout, seen } = useInView();
    // gameScore de MLB (sus 3); si no llegan los extras, las figuras del Lite sin medidor
    const list = pro?.topPerformers?.length
        ? pro.topPerformers.map((item) => ({ id: item.id, teamId: item.teamId, name: item.name, gs: item.gameScore, kind: item.type === 'hitter' ? ('hitter' as const) : ('pitcher' as const) }))
        : game.topPerformers.map((item) => ({ id: item.id, teamId: item.teamId, name: item.name, gs: null as number | null, kind: item.kind }));
    const winner = game.home.isWinner ? game.home : game.away;
    const loser = winner === game.home ? game.away : game.home;
    const { winner: win, loser: loss, save } = game.decisions;
    const sideOf = (person: Decision | null): Side | null =>
        person ? (game.box.away.pitchers.some((line) => line.id === person.id) ? 'away' : game.box.home.pitchers.some((line) => line.id === person.id) ? 'home' : null) : null;
    const record = (person: Decision | null) => (person && person.wins !== null ? `${person.wins}-${person.losses ?? 0}${person.era ? ` · ${person.era}` : ''}` : (person?.era ?? ''));

    if (!list.length && !win) return null;

    return (
        <ProSection title={t('pro.final.figures.title')} aside={pro?.topPerformers?.length ? t('pro.final.figures.aside') : undefined}>
            {list.length > 0 ? (
                <View ref={setNode} onLayout={onLayout} style={{ flexDirection: 'row', gap: 8 }}>
                    {list.slice(0, 3).map((item) => {
                        const performer = performerOf(game, item.id, item.teamId, item.kind);
                        const side = sideOfTeam(game, item.teamId) ?? 'away';
                        const team = game[side];
                        const [first, second] = statLine(performer, t);
                        const name = item.name.includes(',') ? item.name.split(',').reverse().join(' ').trim() : item.name;
                        return (
                            <Pressable
                                key={item.id}
                                disabled={!performer}
                                onPress={() => performer && onSharePerformer(performer)}
                                accessibilityRole="button"
                                accessibilityLabel={[t('pro.final.figures.share', { name }), first, second, item.gs !== null ? t('pro.final.figures.gsAria', { value: item.gs }) : null].filter(Boolean).join(', ')}
                                style={({ pressed }) => ({ flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 6, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 6, paddingVertical: 12, opacity: pressed ? 0.85 : 1 })}
                            >
                                <View style={{ position: 'absolute', right: 8, top: 8 }}>
                                    <Share2 size={14} color={colors.muted} />
                                </View>
                                <PlayerPhoto personId={item.id} name={name} size={52} background={withAlpha(team.color, 0.2)} team={team} />
                                <Txt size={12} weight="extrabold" numberOfLines={1} center style={{ marginTop: 2, alignSelf: 'stretch' }}>
                                    {name}
                                </Txt>
                                <Txt size={11} weight="semibold" tone="muted" center style={{ minHeight: 28, lineHeight: 14 }}>
                                    {second ? `${first}\n${second}` : first}
                                </Txt>
                                {item.gs !== null ? (
                                    <Gauge value={item.gs} max={100} size={70} thickness={6} color={team.color} label={t('pro.final.figures.gsAria', { value: item.gs })}>
                                        <Txt condensed size={26} tabular style={{ lineHeight: 26 }}>
                                            <CountUp value={item.gs} seen={seen} style={{ fontFamily: fonts.condensed }} />
                                        </Txt>
                                        <Txt size={10} weight="extrabold" tone="muted" style={{ letterSpacing: 0.8 }}>
                                            GS
                                        </Txt>
                                    </Gauge>
                                ) : null}
                            </Pressable>
                        );
                    })}
                </View>
            ) : null}
            {win ? (
                <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, list.length ? [{ marginTop: 12, paddingTop: 12 }, divider] : null]}>
                    <DecisionSlot
                        tag={t('summary.win')}
                        ink={proColors.up}
                        bg={alpha(proColors.up, 0.15)}
                        person={win}
                        side={sideOf(win)}
                        game={game}
                        extra={record(win)}
                        empty=""
                        emptySub=""
                        label={`${t('summary.win')}: ${win.name}, ${record(win)}`}
                    />
                    <DecisionSlot
                        tag={t('summary.loss')}
                        ink={proColors.down}
                        bg={alpha(proColors.down, 0.15)}
                        person={loss}
                        side={sideOf(loss)}
                        game={game}
                        extra={record(loss)}
                        empty={t('pro.final.figures.none')}
                        emptySub=""
                        label={`${t('summary.loss')}: ${loss ? `${loss.name}, ${record(loss)}` : t('pro.final.figures.none')}`}
                    />
                    <DecisionSlot
                        tag="SV"
                        ink={colors.ink}
                        bg={colors.raised}
                        person={save}
                        side={sideOf(save)}
                        game={game}
                        extra={save?.saves !== null && save?.saves !== undefined ? t('summary.saves', { count: save.saves }) : ''}
                        empty={t('pro.final.figures.noSave')}
                        emptySub={t('pro.final.figures.wonBy', { count: winner.runs - loser.runs })}
                        label={`SV: ${save ? save.name : `${t('pro.final.figures.noSave')}, ${t('pro.final.figures.wonBy', { count: winner.runs - loser.runs })}`}`}
                    />
                </View>
            ) : null}
        </ProSection>
    );
};
