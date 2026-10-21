// Carrusel «Lo mejor de la jornada»: las figuras de MLB de cada juego terminado (boxscore.topPerformers) de mayor a
// menor Game Score, con foto, el color de su equipo, su línea y el resultado. Tocar abre la ficha del pelotero.
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ScheduleGame } from '../../../types';
import { radius } from '../../../theme/tokens';
import { PlayerPhoto, TeamLogo, Txt } from '../../ui';
import { Enter, MOTION_STAGGER, ModuleHeader, mix } from '../kit';
import { teamFill, type BestItem } from './logic';
import { useLineText } from './shared';

interface BestOfDayProps {
    items: BestItem[];
    games: ScheduleGame[];
    aside: string;
}

// Gris pizarra para un pelotero sin equipo en el juego (no pasa: MLB siempre manda su equipo)
const NO_TEAM = '#475569';

export const BestOfDay: React.FC<BestOfDayProps> = ({ items, games, aside }) => {
    const { t } = useTranslation();
    const lineText = useLineText();
    if (!items.length) return null;
    return (
        <View accessibilityLabel={t('pro.portada.best.aria', { when: aside })} style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.portada.best.title')} aside={aside} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -16 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 4 }}>
                {items.map(({ performer, gamePk }, index) => {
                    const game = games.find((item) => item.gamePk === gamePk);
                    const team = game ? (performer.teamId === game.away.id ? game.away : performer.teamId === game.home.id ? game.home : null) : null;
                    const opponent = game && team ? (team === game.away ? game.home : game.away) : null;
                    const { bg, ink } = teamFill(team?.color ?? NO_TEAM);
                    // Arriba el color del equipo (con 4.5:1 para su texto) y abajo más oscuro, como en el diseño
                    const bottom = mix(bg, '#000000', ink === '#ffffff' ? 0.3 : 0.08);
                    const result =
                        game && team && opponent
                            ? `${performer.decision ? `${t(`pro.portada.final.${performer.decision}`)} · ` : ''}${team.score ?? 0}-${opponent.score ?? 0} ${t(team === game.home ? 'pro.portada.vs' : 'pro.portada.at', { team: opponent.abbrev })}`
                            : null;
                    const line = lineText(performer);
                    return (
                        <Enter key={`${performer.id}-${gamePk}`} index={index} step={MOTION_STAGGER.bar}>
                            <Pressable
                                onPress={() => router.push(`/jugador/${performer.id}`)}
                                accessibilityRole="link"
                                accessibilityLabel={t('pro.portada.best.cardAria', { name: performer.name, line, result: result ?? '', score: performer.gameScore ?? '—' })}
                                style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
                            >
                                <LinearGradient colors={[bg, bottom, bottom]} locations={[0, 0.58, 1]} style={{ width: 150, minHeight: 214, gap: 6, borderRadius: radius.card, padding: 12 }}>
                                    <View style={{ width: 64, height: 64 }}>
                                        <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', overflow: 'hidden', backgroundColor: '#ffffff' }}>
                                            <PlayerPhoto personId={performer.id} name={performer.name} size={58} team={team ? { id: team.id, color: team.color } : null} background="#ffffff" />
                                        </View>
                                        {team && (
                                            <View style={{ position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: bg, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
                                                <TeamLogo team={team} size={18} />
                                            </View>
                                        )}
                                    </View>
                                    <Txt size={16} weight="extrabold" color={ink} style={{ marginTop: 6, lineHeight: 18, letterSpacing: -0.2 }}>
                                        {performer.name}
                                    </Txt>
                                    {line ? (
                                        <Txt size={13} weight="bold" color={ink}>
                                            {line}
                                        </Txt>
                                    ) : null}
                                    <View style={{ marginTop: 'auto', gap: 4 }}>
                                        {result && (
                                            <Txt size={12} weight="bold" color={ink} numberOfLines={1}>
                                                {result}
                                            </Txt>
                                        )}
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                            <Txt condensed size={26} tabular color={ink} style={{ lineHeight: 28 }}>
                                                {String(performer.gameScore ?? '—')}
                                            </Txt>
                                            <Txt size={10} weight="extrabold" color={ink} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                                                {t('pro.portada.best.gameScore')}
                                            </Txt>
                                        </View>
                                    </View>
                                </LinearGradient>
                            </Pressable>
                        </Enter>
                    );
                })}
            </ScrollView>
        </View>
    );
};
