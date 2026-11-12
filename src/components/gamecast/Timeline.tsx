import React, { useMemo } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react-native';
import type { AtBat, GameDetail, Pitch } from '../../types';
import { describePlay, eventName, eventTone, inningName, pitchCallName, pitchTypeName } from '../../lib/baseball';
import { timelineActions, type ActionKind } from '../../lib/liveGame';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow, type Palette } from '../../theme/tokens';
import { Row, Txt } from '../ui';
import { toneColors } from '../game/colors';
import { gamePeople, type LinkPerson } from '../../lib/links';
import { LinkedNames, playerTextLink, teamTextLink } from '../stats/common';
import { useReplay } from './replay';

const PitchBubble: React.FC<{ pitch: Pitch; last: boolean }> = ({ pitch, last }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const color = colors[pitch.r];
    const kind = pitch.type || pitch.typeDesc ? ` · ${pitchTypeName(pitch, i18n.language)}` : '';
    const abs = pitch.abs ? ` · ${t(pitch.abs.inProgress ? 'zone.absChecking' : pitch.abs.overturned ? 'zone.absOverturned' : 'zone.absConfirmed')}` : '';
    const text = `${pitch.n ?? ''} · ${pitchCallName(pitch, i18n.language)}${kind}${pitch.mph ? ` ${pitch.mph.toFixed(1)}` : ''}${abs}`;
    return (
        <View style={{ maxWidth: '85%', borderRadius: 18, borderBottomRightRadius: last ? 6 : 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: last ? color : alpha(color, 0.15) }}>
            <Txt size={13} weight="semibold" color={last ? '#fff' : color}>
                {text}
            </Txt>
        </View>
    );
};

/** Tocar la jugada (o la acción) la repite; `locked`: hay una animación saliendo o corre la pausa entre repeticiones */
interface BubbleReplay {
    locked: boolean;
    onReplay: () => void;
}

/** El ▶ que dice que esa jugada se puede volver a ver (el toque lo recibe toda la burbuja); es el botón del lector de pantalla */
const ReplayMark: React.FC<{ replay: BubbleReplay; label: string; small?: boolean }> = ({ replay, label, small }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const size = small ? 20 : 24;
    return (
        <Pressable
            onPress={replay.onReplay}
            disabled={replay.locked}
            accessibilityRole="button"
            accessibilityLabel={t('timeline.replayPlay', { play: label })}
            accessibilityState={{ disabled: replay.locked }}
            hitSlop={8}
            style={{ width: size, height: size, flexShrink: 0, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: small ? colors.surface : colors.raised, opacity: replay.locked ? 0.4 : 1 }}
        >
            <Play size={small ? 10 : 12} color={colors.ink} fill={colors.ink} style={{ marginLeft: 1 }} />
        </Pressable>
    );
};

/**
 * La burbuja: con `replay`, tocarla en cualquier parte la repite; los nombres y los equipos de adentro siguen abriendo su
 * página (el toque se lo queda el enlace). Para el lector de pantalla el botón es el ▶ y el texto se lee como siempre.
 */
const Bubble: React.FC<{ replay: BubbleReplay | null; style: StyleProp<ViewStyle>; children: React.ReactNode }> = ({ replay, style, children }) =>
    replay ? (
        <Pressable onPress={replay.onReplay} disabled={replay.locked} accessible={false} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>
            {children}
        </Pressable>
    ) : (
        <View style={style}>{children}</View>
    );

const PlayBubble: React.FC<{ atBat: AtBat; game: GameDetail; people: LinkPerson[]; replay: BubbleReplay | null }> = ({ atBat, game, people, replay }) => {
    const { i18n } = useTranslation();
    const colors = useColors();
    const team = atBat.top ? game.away : game.home;
    const tone = toneColors(colors, eventTone(atBat.event));
    const name = eventName(atBat, i18n.language);
    return (
        <Bubble replay={replay} style={[{ maxWidth: '88%', alignSelf: 'flex-start', borderRadius: 22, borderBottomLeftRadius: 6, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 }, shadow('card')]}>
            <Row gap={8} wrap style={{ marginBottom: 4 }}>
                <View style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: tone.bg }}>
                    <Txt size={11} weight="bold" color={tone.ink} style={{ textTransform: 'uppercase' }}>
                        {name}
                    </Txt>
                </View>
                {atBat.scoring && atBat.away !== null && (
                    <Txt size={12} weight="bold" tabular>
                        <Text {...teamTextLink(game.away.id)}>{game.away.abbrev}</Text> {atBat.away} · <Text {...teamTextLink(game.home.id)}>{game.home.abbrev}</Text> {atBat.home}
                    </Txt>
                )}
                <Row gap={8} style={{ marginLeft: 'auto' }}>
                    {replay && <ReplayMark replay={replay} label={name} />}
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: team.color }} />
                </Row>
            </Row>
            <Txt size={14} style={{ lineHeight: 19 }}>
                <LinkedNames text={describePlay(atBat.desc, i18n.language)} people={[{ ...atBat.batter, teamId: team.id }, atBat.pitcher, ...people]} />
            </Txt>
        </Bubble>
    );
};

const ACTION_TONE: Partial<Record<ActionKind, keyof Palette>> = {
    steal: 'ball',
    caught: 'strike',
    pickoff: 'strike',
    wildPitch: 'gold',
    passedBall: 'gold',
    balk: 'gold',
    pitchingChange: 'accentInk',
    injury: 'live',
    ejection: 'live'
};

/**
 * Una acción del juego (robo, cambio de lanzador, visita al montículo…) como aviso pequeño en medio de la charla; con
 * `replay` (robo, atrapado robando, cambio de lanzador, emergente), tocarla repite su animación
 */
const ActionLine: React.FC<{ kind: ActionKind; desc: string; people: LinkPerson[]; replay?: BubbleReplay | null }> = ({ kind, desc, people, replay = null }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const label = t(`timeline.actions.${kind}`);
    const text = describePlay(desc, i18n.language);
    // «Visita al montículo. · Visita al montículo»: si la descripción no dice más que la etiqueta, va sola
    const same = text.replace(/[.\s]+$/, '').toLowerCase() === label.toLowerCase();
    return (
        <Bubble
            replay={replay}
            style={[
                { maxWidth: '92%', alignSelf: 'center', borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 6 },
                replay && { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6 }
            ]}
        >
            {replay && <ReplayMark replay={replay} label={label} small />}
            <Txt size={12} tone="muted" center style={replay ? { flexShrink: 1 } : undefined}>
                <Txt size={12} weight="extrabold" color={colors[ACTION_TONE[kind] ?? 'ink']} style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {label}
                </Txt>
                {same ? null : (
                    <>
                        {' · '}
                        <LinkedNames text={text} people={people} />
                    </>
                )}
            </Txt>
        </Bubble>
    );
};

// Cronología tipo chat: el turno de ahora con sus lanzamientos (el último resaltado) y debajo las jugadas
// anteriores, de la más reciente a la más vieja, con separadores por entrada. En la pantalla del juego (useReplay), tocar
// una jugada (o un robo, un cambio de lanzador, un emergente) repite su animación, la misma que salió en vivo.
export const Timeline: React.FC<{ game: GameDetail; limit?: number; onMore?: () => void }> = ({ game, limit = 12, onMore }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const current = game.state === 'live' ? game.atBats.find((atBat) => atBat.i === game.currentAtBat && !atBat.complete) : undefined;
    const currentActions = current ? timelineActions(current) : [];
    const past = game.atBats.filter((atBat) => atBat.complete).reverse();
    // Los nombres de las jugadas abren la ficha de cada uno
    const people = useMemo(() => gamePeople(game), [game]);
    // Cada jugada con el separador de su media entrada (solo la primera de cada una)
    const shown = past.slice(0, limit).map((atBat, index, list) => {
        const half = inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language);
        const before = index ? inningName({ n: list[index - 1].inning, isTop: list[index - 1].top }, i18n.language) : '';
        return { atBat, separator: half !== before ? half : null };
    });
    // Lo que se puede repetir (lo que tiene animación): con el mismo candado de la pantalla, una a la vez
    const replay = useReplay();
    const playReplay = (atBat: AtBat): BubbleReplay | null => (replay?.can(atBat.i) ? { locked: replay.locked, onReplay: () => replay.replay(atBat.i) } : null);
    const actionReplay = (atBat: AtBat, index: number): BubbleReplay | null =>
        replay?.canAction(atBat.i, index) ? { locked: replay.locked, onReplay: () => replay.replayAction(atBat.i, index) } : null;
    const hint =
        !!replay &&
        ((!!current && currentActions.some((action) => replay.canAction(current.i, action.index))) ||
            shown.some(({ atBat }) => replay.can(atBat.i) || timelineActions(atBat).some((action) => replay.canAction(atBat.i, action.index))));

    return (
        <View accessibilityLabel={t('plays.title')} style={{ gap: 10 }}>
            {current && (
                <>
                    <View style={[{ maxWidth: '88%', alignSelf: 'flex-start', borderRadius: 22, borderBottomLeftRadius: 6, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 }, shadow('card')]}>
                        <Txt size={14}>
                            {t('timeline.atBat')}{' '}
                            <Txt size={14} weight="bold" {...playerTextLink({ ...current.batter, teamId: (current.top ? game.away : game.home).id })}>
                                {current.batter.name}
                            </Txt>{' '}
                            <Txt size={14} tone="muted">
                                {t('zone.facing')}
                            </Txt>{' '}
                            <Txt size={14} weight="bold" {...playerTextLink({ ...current.pitcher, teamId: (current.top ? game.home : game.away).id })}>
                                {current.pitcher.name}
                            </Txt>
                        </Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        {current.pitches.length === 0 && !currentActions.length ? (
                            <View style={{ borderRadius: 18, backgroundColor: colors.raised, paddingHorizontal: 14, paddingVertical: 8 }}>
                                <Txt size={13} weight="semibold" tone="muted">
                                    {t('zone.waiting')}
                                </Txt>
                            </View>
                        ) : (
                            // Los pitcheos con las acciones donde pasaron (un robo entre el 2.º y el 3.º, por ejemplo)
                            [
                                ...current.pitches.map((pitch, index) => ({ at: index, pitch, action: null })),
                                ...currentActions.map((action) => ({ at: (action.at ?? current.pitches.length) - 0.5, pitch: null, action }))
                            ]
                                .sort((a, b) => a.at - b.at)
                                .map((item, index) =>
                                    item.pitch ? (
                                        <PitchBubble key={`p${index}`} pitch={item.pitch} last={item.at === current.pitches.length - 1} />
                                    ) : (
                                        <ActionLine key={`a${index}`} kind={item.action!.kind!} desc={item.action!.desc} people={people} replay={actionReplay(current, item.action!.index)} />
                                    )
                                )
                        )}
                    </View>
                </>
            )}
            {hint && shown.length > 0 && (
                <Row gap={6} style={{ alignSelf: 'center', marginTop: 4 }}>
                    <Play size={10} color={colors.faint} fill={colors.faint} />
                    <Txt size={11} weight="semibold" tone="faint">
                        {t('timeline.replayHint')}
                    </Txt>
                </Row>
            )}
            {shown.map(({ atBat, separator }) => (
                <React.Fragment key={atBat.i}>
                    {separator && (
                        <Txt size={12} weight="bold" tone="muted" center style={{ marginTop: 8 }}>
                            {separator}
                        </Txt>
                    )}
                    <PlayBubble atBat={atBat} game={game} people={people} replay={playReplay(atBat)} />
                    {/* De la más nueva a la más vieja: lo que pasó durante el turno va debajo de su resultado */}
                    {timelineActions(atBat)
                        .reverse()
                        .map((action) => (
                            <ActionLine key={action.index} kind={action.kind!} desc={action.desc} people={people} replay={actionReplay(atBat, action.index)} />
                        ))}
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
