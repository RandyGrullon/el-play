import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, CircleAlert, Hand, Info, Repeat, ScanLine, Shield, Users, X, Zap } from 'lucide-react-native';
import type { GameDetail, GameTeam } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import type { Challenge, EventKind, NameBook, PlayEvent, PlayItem } from './model';
import { useColors } from '../../../../theme/theme';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../../ui';
import { GradientCard } from '../../kit';
import { usePlayColors } from './parts';
import { baseText, challengeText, eventText, occupied, pitcherLineText } from './texts';

// Chips de lo que pasa entre jugadas (robo, WP/PB, visita, emergentes), la tarjeta del cambio de lanzador
// y la del reto ABS. Son informativos: no se tocan (cada uno se lee de una vez).

type Game = Pick<GameDetail, 'away' | 'home' | 'state' | 'box'>;
type IconTone = 'accent' | 'muted' | 'up' | 'down' | 'warn';

const ICONS: Record<EventKind, { Icon: typeof Info; tone: IconTone }> = {
    pitching_change: { Icon: ArrowLeftRight, tone: 'accent' },
    mound_visit: { Icon: Users, tone: 'muted' },
    stolen_base: { Icon: Zap, tone: 'up' },
    caught_stealing: { Icon: X, tone: 'down' },
    pickoff: { Icon: Hand, tone: 'down' },
    wild_pitch: { Icon: CircleAlert, tone: 'warn' },
    passed_ball: { Icon: CircleAlert, tone: 'warn' },
    balk: { Icon: CircleAlert, tone: 'warn' },
    pinch_hitter: { Icon: Repeat, tone: 'accent' },
    pinch_runner: { Icon: Repeat, tone: 'accent' },
    defense: { Icon: Shield, tone: 'muted' },
    other: { Icon: Info, tone: 'muted' }
};

const useIconColor = () => {
    const paint = usePlayColors();
    return (tone: IconTone) =>
        ({ accent: paint.colors.accentInk, muted: paint.colors.muted, up: paint.tone(paint.pro.up), down: paint.tone(paint.pro.down), warn: paint.tone(paint.pro.warn) })[tone];
};

// Chip de evento con borde punteado: «Robo de base · González se roba la 3.ª (1)»
export const EventChip: React.FC<{ event: PlayEvent; item: PlayItem; names: NameBook; game: Game }> = ({ event, item, names, game }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const iconColor = useIconColor();
    const { title, text } = eventText(t, event, item, names, game, i18n.language);
    const { Icon, tone } = ICONS[event.kind];
    return (
        <View
            accessible
            accessibilityLabel={text ? `${title}. ${text}` : title}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.ink, 0.2), paddingHorizontal: 12, paddingVertical: 8 }}
        >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={iconColor(tone)} />
            </View>
            <Txt size={13} weight="bold" style={{ flex: 1, lineHeight: 18 }}>
                {title}
                {text ? (
                    <Txt size={13} tone="muted">
                        {' · '}
                        {text}
                    </Txt>
                ) : null}
            </Txt>
        </View>
    );
};

const PitcherSide: React.FC<{ id: number | null; names: NameBook; team: GameTeam; kind: 'out' | 'in'; children?: React.ReactNode }> = ({ id, names, team, kind, children }) => {
    const { t } = useTranslation();
    const paint = usePlayColors();
    const name = names.full(id) || names.label(id);
    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <PlayerPhoto personId={id} name={name} size={36} team={team} />
            <View style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                <Txt size={14} weight="extrabold" style={{ lineHeight: 20 }}>
                    <Txt size={11} weight="extrabold" color={paint.tone(kind === 'out' ? paint.pro.down : paint.pro.up)} style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>
                        {t(kind === 'out' ? 'pro.jugadas.change.out' : 'pro.jugadas.change.in')}{' '}
                    </Txt>
                    {name}
                </Txt>
                {children}
            </View>
        </View>
    );
};

// Cambio de lanzador: el que sale con su línea y el que entra con la suya y los corredores que hereda
export const PitchingChangeCard: React.FC<{ event: PlayEvent; names: NameBook; game: Game; pro?: GamePro }> = ({ event, names, game, pro }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const team = game[event.fielding];
    const lines = game.box[event.fielding].pitchers;
    const outLine = lines.find((line) => line.id === event.replaced);
    const inLine = lines.find((line) => line.id === event.player);
    const proLine = pro?.box[event.fielding].pitchers.find((line) => line.id === event.player);
    const bases = occupied(event.bases);
    const inherited = proLine?.ir ?? bases.length;
    const scored = proLine?.irs ?? null;
    const who = bases.length === 3 ? t('pro.jugadas.bases.loaded') : bases.map((base) => t('pro.jugadas.change.at', { name: names.label(event.bases?.[base]), base: baseText(t, base) })).join(', ');
    const final = game.state === 'final';
    const small = { size: 12, tone: 'muted' as const, style: { lineHeight: 17 } };
    return (
        <View style={[{ borderRadius: 20, backgroundColor: colors.surface, padding: 14, gap: 10, borderWidth: 1, borderColor: alpha(colors.ink, 0.08) }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ArrowLeftRight size={16} color={colors.accentInk} />
                <Txt size={11} weight="extrabold" color={colors.accentInk} style={{ letterSpacing: 1.2, textTransform: 'uppercase', flex: 1 }}>
                    {t('pro.jugadas.change.title', { team: team.abbrev })}
                </Txt>
            </View>
            {event.replaced ? (
                <PitcherSide id={event.replaced} names={names} team={team} kind="out">
                    {outLine && <Txt {...small}>{pitcherLineText(t, outLine)}</Txt>}
                </PitcherSide>
            ) : null}
            <PitcherSide id={event.player} names={names} team={team} kind="in">
                {inLine && <Txt {...small}>{t(final ? 'pro.jugadas.change.final' : 'pro.jugadas.change.today', { line: pitcherLineText(t, inLine) })}</Txt>}
                {inherited > 0 && (
                    <Txt {...small}>
                        {t('pro.jugadas.change.inherits', { count: inherited, who: who || '' })}
                        {scored !== null && ` · ${scored === 0 ? t('pro.jugadas.change.noneScored', { count: inherited }) : t('pro.jugadas.change.scored', { count: scored })}`}
                    </Txt>
                )}
            </PitcherSide>
        </View>
    );
};

// Reto ABS (o revisión de video): quién retó, qué se cantó y cómo quedó, con los retos que le quedan
export const ChallengeCard: React.FC<{ challenge: Challenge; names: NameBook; game: Game }> = ({ challenge, names, game }) => {
    const { t, i18n } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const { who, what, left } = challengeText(t, challenge, names, game, i18n.language);
    const base = challenge.over ? paint.pro.up : paint.pro.down;
    const title = t(challenge.abs ? 'pro.jugadas.abs.title' : 'pro.jugadas.review.title');
    const verdict = t(challenge.over ? 'pro.jugadas.abs.over' : 'pro.jugadas.abs.upheld');
    const body = (
        <>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                <ScanLine size={16} color={colors.accentInk} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={13} weight="bold" style={{ lineHeight: 18 }}>
                    {title}
                    <Txt size={13} style={{ lineHeight: 18 }}>
                        {' · '}
                        {who} · {what}
                    </Txt>
                </Txt>
                {left ? (
                    <Txt size={13} tone="muted" style={{ lineHeight: 18 }}>
                        {left}
                    </Txt>
                ) : null}
            </View>
            <View style={{ height: 24, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 10, backgroundColor: alpha(base, 0.15), flexShrink: 0 }}>
                <Txt size={12} weight="bold" color={paint.tone(base)} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {verdict}
                </Txt>
            </View>
        </>
    );
    const label = [`${title}: ${who}`, what, left, verdict].filter(Boolean).join('. ');
    const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 12, paddingVertical: 10 };
    return challenge.abs ? (
        <GradientCard accessible accessibilityLabel={label} innerStyle={row}>
            {body}
        </GradientCard>
    ) : (
        <View accessible accessibilityLabel={label} style={[row, { borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.ink, 0.08) }]}>
            {body}
        </View>
    );
};
