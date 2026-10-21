import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { useColors } from '../../../../theme/theme';
import { alpha, shadow } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { ChipButton, ChipRow, Enter, ProNote, ProSection, initials, shortName, teamInk, useElementWidth, useProColors } from '../../kit';
import { Avatar, halfInning } from './parts';

// Pestaña «En el terreno»: los 9 defensores en su posición, el bullpen (quién no ha lanzado, con su EFE y sus
// entradas de la temporada; los que ya lanzaron en gris con sus pitcheos de hoy) y la banca con su OPS.

interface FieldTabProps {
    game: GameDetail;
    pro?: GamePro;
}

type Side = 'away' | 'home';
type Spot = 'pitcher' | 'catcher' | 'first' | 'second' | 'third' | 'shortstop' | 'left' | 'center' | 'right';

// Lugar de cada posición sobre el dibujo del terreno (%), home abajo al centro
const SPOTS: Record<Spot, { x: number; y: number; abbr: string }> = {
    center: { x: 50, y: 10, abbr: 'CF' },
    left: { x: 18, y: 27, abbr: 'LF' },
    right: { x: 82, y: 27, abbr: 'RF' },
    shortstop: { x: 34, y: 48, abbr: 'SS' },
    second: { x: 64, y: 45, abbr: '2B' },
    third: { x: 17, y: 64, abbr: '3B' },
    first: { x: 83, y: 64, abbr: '1B' },
    pitcher: { x: 50, y: 64, abbr: 'P' },
    catcher: { x: 50, y: 89, abbr: 'C' }
};

/** Círculo con las iniciales en el color del equipo (bullpen y banca: listas largas sin fotos) */
const Initials: React.FC<{ name: string; color: string; muted?: boolean }> = ({ name, color, muted }) => {
    const colors = useColors();
    return (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: muted ? colors.raised : color, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={11} weight="extrabold" color={muted ? colors.muted : teamInk(color)}>
                {initials(name)}
            </Txt>
        </View>
    );
};

const Row: React.FC<{ children: React.ReactNode; label: string; dim?: boolean; last?: boolean }> = ({ children, label, dim, last }) => {
    const colors = useColors();
    return (
        <View accessible accessibilityLabel={label} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: dim ? 0.6 : 1, borderBottomWidth: last ? 0 : 1, borderBottomColor: alpha(colors.line, 0.08) }}>
            {children}
        </View>
    );
};

const Figure: React.FC<{ value: string; label: string; strong?: boolean }> = ({ value, label, strong }) => (
    <View style={{ alignItems: 'flex-end', minWidth: 40 }}>
        <Txt condensed size={strong ? 17 : 15} tone={strong ? 'ink' : 'muted'} tabular style={{ lineHeight: 18 }}>
            {value}
        </Txt>
        <Txt size={10} weight="bold" tone="muted">
            {label}
        </Txt>
    </View>
);

export const FieldTab: React.FC<FieldTabProps> = ({ game, pro }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const lang = i18n.language;
    const { width, onLayout } = useElementWidth(340);
    const defense = pro?.defense ?? null;
    const fieldingSide: Side = defense?.teamId === game.home.id ? 'home' : defense?.teamId === game.away.id ? 'away' : game.inning?.isTop ? 'home' : 'away';
    const [chosen, setSide] = useState<Side | null>(null);
    const side = chosen ?? fieldingSide;
    const name = (id: number) => pro?.players?.[String(id)]?.name ?? null;

    if (!pro) return <ProNote tone="pending">{t('pro.vivo.field.loading')}</ProNote>;
    const team = game[side];
    const box = pro.box[side];
    const used = game.box[side].pitchers;
    const nowPitching = game.state === 'live' ? (game.matchup?.pitcher.id ?? null) : null;
    const sides: Side[] = fieldingSide === 'home' ? ['home', 'away'] : ['away', 'home'];
    const fieldHeight = Math.min(380, width) * 0.92;

    return (
        <View style={{ gap: 16 }}>
            <ChipRow label={t('pro.vivo.field.teamPick')}>
                {sides.map((value) => (
                    <ChipButton key={value} active={side === value} onPress={() => setSide(value)} icon={<TeamLogo team={game[value]} size={20} />} accessibilityLabel={game[value].name}>
                        {game[value].teamName || game[value].abbrev}
                    </ChipButton>
                ))}
            </ChipRow>

            {defense && side === fieldingSide ? (
                <ProSection title={t('pro.vivo.field.defense')} aside={t('pro.vivo.field.onField')} bodyStyle={{ gap: 10 }}>
                    <View onLayout={onLayout} accessibilityLabel={t('pro.vivo.field.defenseAria', { team: team.name })} style={{ width: '100%', maxWidth: 380, height: fieldHeight, alignSelf: 'center' }}>
                        <Svg width="100%" height="100%" viewBox="0 0 100 92" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }}>
                            <Path d="M50 88 L4 42 Q50 -14 96 42 Z" fill="#3f9b63" fillOpacity={0.16} stroke="#3f9b63" strokeOpacity={0.5} strokeWidth={0.6} />
                            <Path d="M50 88 L28 66 Q50 36 72 66 Z" fill="#c08a52" fillOpacity={0.26} />
                            <Path d="M50 84 L37 71 L50 58 L63 71 Z" fill="#3f9b63" fillOpacity={0.24} stroke={alpha(colors.line, 0.3)} strokeWidth={0.4} />
                            {[
                                [63, 71],
                                [50, 58],
                                [37, 71]
                            ].map(([x, y]) => (
                                <Rect key={`${x}${y}`} x={x - 1.4} y={y - 1.4} width={2.8} height={2.8} transform={`rotate(45 ${x} ${y})`} fill={colors.surface} />
                            ))}
                        </Svg>
                        {(Object.keys(SPOTS) as Spot[]).map((spot, index) => {
                            const person = defense[spot];
                            if (!person) return null;
                            const place = SPOTS[spot];
                            return (
                                <Enter
                                    key={spot}
                                    index={index}
                                    accessible
                                    accessibilityLabel={`${t(`pro.vivo.field.pos.${spot}`)}: ${person.name}`}
                                    style={{ position: 'absolute', left: `${place.x}%`, top: `${place.y}%`, width: 96, marginLeft: -48, marginTop: -26, alignItems: 'center', gap: 2 }}
                                >
                                    <Avatar person={person} team={team} size={30} />
                                    <View style={[{ maxWidth: 96, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, backgroundColor: colors.surface, paddingHorizontal: 6, paddingVertical: 1 }, shadow('card')]}>
                                        <Txt size={10} weight="extrabold" tone="muted">
                                            {place.abbr}
                                        </Txt>
                                        <Txt size={11} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                            {shortName(person.name, true).replace(/^\S+\s/, '')}
                                        </Txt>
                                    </View>
                                </Enter>
                            );
                        })}
                    </View>
                    <Txt size={12} tone="muted">
                        {t('pro.vivo.field.defenseNote', { team: team.teamName || team.abbrev, half: game.inning ? halfInning(game.inning.n, game.inning.isTop, lang) : '' })}
                    </Txt>
                </ProSection>
            ) : (
                <ProNote tone="neutral">{defense ? t('pro.vivo.field.atBatNow', { team: team.teamName || team.abbrev }) : t('pro.vivo.field.noDefense')}</ProNote>
            )}

            <ProSection title={t('pro.vivo.field.bullpen')} aside={t('pro.vivo.field.bullpenAside')} bodyStyle={{ paddingVertical: 12 }}>
                <Txt size={11} weight="extrabold" color={proColors.up} style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                    {t('pro.vivo.field.available', { count: box.bullpen.length })}
                </Txt>
                {box.bullpen.map((arm, index) => {
                    const armName = name(arm.id) ?? `#${arm.number ?? '—'}`;
                    const sub = [arm.number ? `#${arm.number}` : null, arm.throws ? t(`pro.vivo.hand.throws.${arm.throws}`, { defaultValue: arm.throws }) : null].filter(Boolean).join(' · ');
                    return (
                        <Row key={arm.id} label={`${armName}, ${sub}. ${arm.season.era ?? '—'} ${t('pro.vivo.duel.era')}, ${arm.season.ip ?? '—'} IP`} last={index === box.bullpen.length - 1}>
                            <Initials name={armName} color={team.color} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt size={14} weight="extrabold" numberOfLines={1}>
                                    {armName}
                                </Txt>
                                <Txt size={12} tone="muted" numberOfLines={1}>
                                    {sub}
                                </Txt>
                            </View>
                            <Figure value={arm.season.era ?? '—'} label={t('pro.vivo.duel.era')} strong />
                            <Figure value={arm.season.ip ?? '—'} label="IP" />
                        </Row>
                    );
                })}
                {!box.bullpen.length && (
                    <Txt size={12} tone="muted" style={{ paddingVertical: 8 }}>
                        {t('pro.vivo.field.noBullpen')}
                    </Txt>
                )}
                {used.length > 0 && (
                    <>
                        <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 2 }}>
                            {t('pro.vivo.field.usedToday', { count: used.length })}
                        </Txt>
                        {used.map((arm, index) => {
                            const armName = name(arm.id) ?? arm.name;
                            const now = arm.id === nowPitching;
                            const line = [arm.np !== null ? `${arm.np} P` : null, `${arm.ip} IP`].filter(Boolean).join(' · ');
                            return (
                                <Row key={arm.id} label={`${armName}${now ? `, ${t('pro.vivo.field.onMound')}` : ''}: ${line}`} dim={!now} last={index === used.length - 1}>
                                    <Initials name={armName} color={team.color} muted={!now} />
                                    <Txt size={14} weight={now ? 'extrabold' : 'semibold'} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                        {armName}
                                        {now ? ` · ${t('pro.vivo.field.onMound')}` : ''}
                                    </Txt>
                                    <Txt condensed size={15} tone={now ? 'ink' : 'muted'} tabular>
                                        {line}
                                    </Txt>
                                </Row>
                            );
                        })}
                    </>
                )}
            </ProSection>

            <ProSection title={t('pro.vivo.field.bench')} aside={t('pro.vivo.field.benchAside')} bodyStyle={{ paddingVertical: 12 }}>
                {box.bench.length ? (
                    box.bench.map((player, index) => {
                        const playerName = name(player.id) ?? `#${player.number ?? '—'}`;
                        const sub = [player.number ? `#${player.number}` : null, player.pos, player.bats ? t(`pro.vivo.hand.bats.${player.bats}`, { defaultValue: player.bats }) : null].filter(Boolean).join(' · ');
                        return (
                            <Row key={player.id} label={`${playerName}, ${sub}. ${player.season.ops ?? '—'} OPS`} last={index === box.bench.length - 1}>
                                <Initials name={playerName} color={team.color} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Txt size={14} weight="extrabold" numberOfLines={1}>
                                        {playerName}
                                    </Txt>
                                    <Txt size={12} tone="muted" numberOfLines={1}>
                                        {sub}
                                    </Txt>
                                </View>
                                <Figure value={player.season.ops ?? '—'} label={player.season.ab ? t('pro.vivo.field.opsAb', { count: player.season.ab }) : 'OPS'} strong />
                            </Row>
                        );
                    })
                ) : (
                    <Txt size={12} tone="muted" style={{ paddingVertical: 8 }}>
                        {t('pro.vivo.field.noBench')}
                    </Txt>
                )}
            </ProSection>
            <Txt size={12} tone="muted">
                {t('pro.vivo.field.note')}
            </Txt>
        </View>
    );
};
