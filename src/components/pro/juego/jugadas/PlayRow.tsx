import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { GameDetail, Pitch } from '../../../../types';
import type { NameBook, PlayItem } from './model';
import { battedBall, finalCount, narrate, playDetail, scorebook } from './model';
import { eventName, eventTone } from '../../../../lib/baseball';
import { PRO_GRADIENT, alpha, fonts, shadow } from '../../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../../ui';
import { middle } from '../../kit';
import { Collapse, EventBadge, OutDots, PitchPill, PressureChip, ScorePill, WpaPill, fmtSwing, usePlayColors, useSwingLabel } from './parts';
import { detailJoiner, detailText, playLine } from './texts';

type Game = Pick<GameDetail, 'away' | 'home' | 'state' | 'box'>;
type T = ReturnType<typeof useTranslation>['t'];

// ------------------------------------------------------------------ Zona chica del turno

const PX = 30; // píxeles por pie
const X_FT = 2; // pies a cada lado del centro del plato
const Z_MIN = 0.6;
const Z_MAX = 4.4;
const HALF_PLATE = 17 / 12 / 2;
const W = X_FT * 2 * PX;
const H = (Z_MAX - Z_MIN) * PX;
const sx = (x: number) => W / 2 + Math.min(X_FT - 0.2, Math.max(-X_FT + 0.2, x)) * PX;
const sy = (z: number) => (Z_MAX - Math.min(Z_MAX - 0.2, Math.max(Z_MIN + 0.2, z))) * PX;

const median = (values: (number | null)[], fallback: number) => {
    const list = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
    return list.length ? list[Math.floor(list.length / 2)] : fallback;
};

// Zona de strike chica (vista del receptor) con cada pitcheo numerado y del color de su resultado.
// Si hubo reto ABS, la zona va punteada (la del reto se mide con la estatura del bateador).
export const MiniZone: React.FC<{ pitches: Pitch[]; challenged: number[]; label: string }> = ({ pitches, challenged, label }) => {
    const { t } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const top = median(pitches.map((pitch) => pitch.top), 3.4);
    const bot = median(pitches.map((pitch) => pitch.bot), 1.6);
    const left = sx(-HALF_PLATE);
    const right = sx(HALF_PLATE);
    const width = right - left;
    const height = sy(bot) - sy(top);
    const abs = challenged.length > 0;
    return (
        <View style={{ flexShrink: 0, alignItems: 'center', gap: 4 }}>
            <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ borderRadius: 16, backgroundColor: colors.raised, padding: 6 }}>
                <Svg width={W} height={H}>
                    {[1, 2].map((n) => (
                        <G key={n} stroke={alpha(colors.ink, 0.2)} strokeWidth={1}>
                            <Line x1={left + (width * n) / 3} x2={left + (width * n) / 3} y1={sy(top)} y2={sy(bot)} />
                            <Line x1={left} x2={right} y1={sy(top) + (height * n) / 3} y2={sy(top) + (height * n) / 3} />
                        </G>
                    ))}
                    <Rect x={left} y={sy(top)} width={width} height={height} rx={3} fill="none" stroke={alpha(colors.ink, 0.6)} strokeWidth={1.5} strokeDasharray={abs ? '4 3' : undefined} />
                    {pitches.map((pitch, index) => {
                        if (pitch.x === null || pitch.z === null) return null;
                        const solid = paint.pitch(pitch.r, true);
                        return (
                            <G key={index}>
                                {challenged.includes(index) && <Circle cx={sx(pitch.x)} cy={sy(pitch.z)} r={11} fill="none" stroke={PRO_GRADIENT[1]} strokeWidth={2} strokeDasharray="3 2" />}
                                <Circle cx={sx(pitch.x)} cy={sy(pitch.z)} r={8} fill={solid.bg} stroke={colors.raised} strokeWidth={1.5} />
                                <SvgText x={sx(pitch.x)} y={sy(pitch.z)} dy={middle(9)} textAnchor="middle" fontSize={9} fontFamily={fonts.extrabold} fill={solid.ink}>
                                    {pitch.n ?? index + 1}
                                </SvgText>
                            </G>
                        );
                    })}
                </Svg>
            </View>
            {abs && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 12, borderTopWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.ink, 0.6) }} />
                    <Txt size={10.5} tone="muted">
                        {t('pro.jugadas.abs.zone')}
                    </Txt>
                </View>
            )}
        </View>
    );
};

// ------------------------------------------------------------------ Lo que se abre al tocar una jugada

export const PlayPanel: React.FC<{ item: PlayItem; names: NameBook; showDesc: boolean }> = ({ item, names, showDesc }) => {
    const { t, i18n } = useTranslation();
    const { atBat } = item;
    const located = atBat.pitches.some((pitch) => pitch.x !== null && pitch.z !== null);
    const challenged = item.challenges.map((challenge) => challenge.k);
    return (
        <View style={{ gap: 8, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 }}>
            <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                {playLine(t, atBat, names, atBat.complete ? finalCount(atBat) : null)}
            </Txt>
            {showDesc && atBat.desc ? (
                <Txt size={13.5} style={{ lineHeight: 20 }}>
                    {narrate(atBat.desc, i18n.language)}
                </Txt>
            ) : null}
            {atBat.pitches.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    {located && <MiniZone pitches={atBat.pitches} challenged={challenged} label={t('pro.jugadas.zone', { count: atBat.pitches.length, batter: names.full(atBat.batter.id, atBat.batter.name) })} />}
                    <View accessibilityLabel={t('pro.jugadas.line.pitches', { count: atBat.pitches.length })} style={{ flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 }}>
                        {atBat.pitches.map((pitch, index) => (
                            <PitchPill key={index} pitch={pitch} index={index} last={index === atBat.pitches.length - 1} challenged={challenged.includes(index)} />
                        ))}
                    </View>
                </View>
            )}
        </View>
    );
};

/** Datos del batazo en texto: «106.8 mph, 408 pies» */
export const useBattedText = () => {
    const { t } = useTranslation();
    return (item: PlayItem) => {
        const ball = battedBall(item.atBat);
        if (!ball) return null;
        const parts = [ball.ev != null ? t('pro.jugadas.batted.ev', { value: ball.ev.toFixed(1) }) : null, ball.dist != null ? t('pro.jugadas.batted.dist', { value: ball.dist }) : null];
        return parts.filter(Boolean).join(', ') || null;
    };
};

/** Sin datos del batazo: la anotación y los pitcheos («K · 5 pitcheos») */
const scorebookWords = (t: T, item: PlayItem) => {
    const code = scorebook(item.atBat, item.pro);
    const pitches = t('pro.jugadas.line.pitches', { count: item.atBat.pitches.length });
    return code ? `${code} · ${pitches}` : pitches;
};

// ------------------------------------------------------------------ Fila de jugada (corta o grande)

interface PlayRowProps {
    item: PlayItem;
    game: Game;
    names: NameBook;
    open: boolean;
    onToggle: () => void;
    /** Siempre la tarjeta grande (cronología en vivo) */
    big?: boolean;
}

/** La jugada va en tarjeta grande: anotadora, clave o de mucha presión */
export const isBig = (item: PlayItem) => item.scoring || item.key || item.pressure !== null;

// Jugada de la cronología: corta (chip + nombre + detalle + cambio de probabilidad) o grande (las anotadoras y las
// clave: la narración completa, el batazo, los outs y el marcador). Al tocarla se abre con los pitcheos.
export const PlayRow: React.FC<PlayRowProps> = ({ item, game, names, open, onToggle, big = false }) => {
    const { t, i18n } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const battedText = useBattedText();
    const swingLabel = useSwingLabel();
    const { atBat } = item;
    const team = atBat.top ? game.away : game.home;
    const event = atBat.complete ? eventName(atBat, i18n.language) || t('pro.jugadas.play') : t('pro.jugadas.inProgress');
    const swing = swingLabel(item.swing, game);

    if (!(big || isBig(item))) {
        const detail = playDetail(item);
        const text = detailText(t, detail, item, names);
        const name = names.label(atBat.batter.id, atBat.batter.name);
        return (
            <View>
                <Pressable
                    onPress={onToggle}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={[`${event}: ${name}${text ? `${detailJoiner(detail)}${text}` : ''}`, swing].filter(Boolean).join('. ')}
                    style={[
                        { minHeight: 46, minWidth: '88%', maxWidth: '100%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 24, backgroundColor: colors.surface, paddingVertical: 8, paddingLeft: 12, paddingRight: 10, borderWidth: 1, borderColor: alpha(colors.ink, 0.06) },
                        shadow('card')
                    ]}
                >
                    <EventBadge atBat={atBat} inProgress={!atBat.complete} />
                    <Txt size={13} style={{ flex: 1, minWidth: 0, lineHeight: 18 }}>
                        {name}
                        {text ? (
                            <Txt size={13} tone="muted">
                                {detailJoiner(detail)}
                                {text}
                            </Txt>
                        ) : null}
                    </Txt>
                    <WpaPill swing={item.swing} game={game} />
                </Pressable>
                <Collapse open={open}>
                    <PlayPanel item={item} names={names} showDesc />
                </Collapse>
            </View>
        );
    }

    const batted = battedText(item);
    const desc = atBat.complete ? narrate(atBat.desc, i18n.language) : t('pro.jugadas.atBatNow', { batter: atBat.batter.name, pitcher: atBat.pitcher.name });
    const score = atBat.scoring && atBat.away !== null && atBat.home !== null ? t('pro.jugadas.score', { away: game.away.abbrev, awayRuns: atBat.away, home: game.home.abbrev, homeRuns: atBat.home }) : null;
    const label = [event, item.pressure !== null ? t('pro.jugadas.pressure', { value: item.pressure.toFixed(2) }) : null, desc, batted, score, swing].filter(Boolean).join('. ');
    return (
        <View>
            <Pressable
                onPress={onToggle}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={label}
                style={[
                    { width: '94%', maxWidth: '100%', alignSelf: 'flex-start', gap: 8, borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: alpha(colors.ink, 0.06), borderLeftWidth: 3, borderLeftColor: team.color },
                    shadow('card')
                ]}
            >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <EventBadge atBat={atBat} inProgress={!atBat.complete} />
                    {item.pressure !== null && <PressureChip li={item.pressure} />}
                    <View style={{ flex: 1 }} />
                    <WpaPill swing={item.swing} game={game} strong={item.scoring || item.key} />
                </View>
                <Txt size={14.5} weight="medium" style={{ lineHeight: 20 }}>
                    {desc}
                </Txt>
                <View style={{ minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <PlayerPhoto personId={atBat.batter.id} name={atBat.batter.name} size={22} team={team} />
                    <Txt size={11.5} tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {batted ?? scorebookWords(t, item)}
                    </Txt>
                    {atBat.outs !== null && <OutDots outs={atBat.outs} />}
                    {atBat.scoring && <ScorePill atBat={atBat} game={game} />}
                </View>
            </Pressable>
            <Collapse open={open}>
                <PlayPanel item={item} names={names} showDesc={false} />
            </Collapse>
        </View>
    );
};

// ------------------------------------------------------------------ Fila del anotador (pestaña en vivo)

// «F9 · Erik González, elevado al derecho · 89.2 mph»: fila compacta con la anotación del anotador
export const ScorebookRow: React.FC<{ item: PlayItem; names: NameBook; open: boolean; onToggle: () => void }> = ({ item, names, open, onToggle }) => {
    const { t } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const { atBat } = item;
    const detail = playDetail(item);
    const text = detailText(t, detail, item, names, true);
    const code = scorebook(atBat, item.pro);
    const ball = battedBall(atBat);
    const tone = eventTone(atBat.event);
    const codeColor = tone === 'out' ? colors.ink : paint.event(tone).ink;
    const name = names.full(atBat.batter.id, atBat.batter.name);
    const right = ball?.ev != null ? t('pro.jugadas.batted.ev', { value: ball.ev.toFixed(1) }) : t('pro.jugadas.batted.pitches', { count: atBat.pitches.length });
    return (
        <View>
            <Pressable
                onPress={onToggle}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={[code, `${name}${text ? `${detailJoiner(detail)}${text}` : ''}`, right].filter(Boolean).join('. ')}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
                <Txt size={17} condensed tabular color={codeColor} style={{ width: 40 }}>
                    {code ?? '·'}
                </Txt>
                <Txt size={13} weight="semibold" style={{ flex: 1, minWidth: 0, lineHeight: 18 }}>
                    {name}
                    {text ? (
                        <Txt size={13} tone="muted">
                            {detailJoiner(detail)}
                            {text}
                        </Txt>
                    ) : null}
                </Txt>
                <Txt size={14} condensed tabular tone="muted" style={{ flexShrink: 0, textAlign: 'right' }}>
                    {right}
                </Txt>
            </Pressable>
            <Collapse open={open}>
                <PlayPanel item={item} names={names} showDesc />
            </Collapse>
        </View>
    );
};

/** Cambio de probabilidad de una media entrada con el color del equipo («LIC +5.2 %»), o «±0 %» */
export const HalfSwing: React.FC<{ swing: PlayItem['swing']; game: Pick<GameDetail, 'away' | 'home'> }> = ({ swing, game }) => {
    const { i18n } = useTranslation();
    const paint = usePlayColors();
    if (!swing) return null;
    const team = swing.side ? game[swing.side] : null;
    return (
        <Txt size={14} condensed tabular color={team ? paint.team(team.color) : paint.colors.muted} style={{ flexShrink: 0 }}>
            {team ? `${team.abbrev} ` : ''}
            {fmtSwing(swing.value, i18n.language)}
        </Txt>
    );
};

