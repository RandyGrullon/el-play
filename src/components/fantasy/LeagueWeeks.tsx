// Ligas 2.0 (igual que la web, src/components/fantasy/LeagueWeeks.tsx): la tabla por semana de una liga privada (lunes
// a domingo, con el campeón de la semana pasada arriba) y las herramientas del dueño: renombrar, sacar a alguien
// (confirmando) y borrar la liga (escribiendo su nombre). Si el servidor no tiene las semanas o la base no tiene las
// funciones del dueño, no salen. Lo usan la Tabla del Lite y la hoja de ligas de PRO.
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Pencil, Settings2, Trash2, Trophy, UserMinus } from 'lucide-react-native';
import type { LeagueId } from '../../types';
import { lastChampion, useLeagueWeeks, weekName, type LeagueWeek } from '../../lib/fantasyStats';
import { LEAGUE_NAME_MAX, OWNER_TOOLS_KEY, cleanLeagueName, confirmsName, deleteLeague, removeMember, renameLeague, useOwnerTools } from '../../lib/leagueOwner';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { alpha, radius } from '../../theme/tokens';
import { Card, Row, Segmented, Skeleton, Txt } from '../ui';
import { Field } from '../account/Field';
import { FanRow, useFanLabel } from './FanSearch';
import { useSeasonRanking } from './fans';
import { statsDate } from './SeasonStats';
import { formatCredits } from './shared';

/** «10 nov – 16 nov» */
export const weekRange = (week: Pick<LeagueWeek, 'start' | 'end'>, t: TFunction, lang: string) => t('fantasyLeagues.weekRange', { start: statsDate(week.start, lang), end: statsDate(week.end, lang) });

/** Los nombres de la liga: los que se pasen (PRO ya los tiene) o los de la tabla de la temporada de sus miembros */
const useMemberNames = (league: LeagueId, members: string[], given?: (userId: string) => string | null) => {
    const season = useSeasonRanking(league, !given, members);
    return (userId: string) => (given ? given(userId) : (season.data?.ranking.find((row) => row.userId === userId)?.name ?? null));
};

interface LeagueWeeksProps {
    fantasyLeague: LeagueId;
    members: string[];
    ownId: string;
    onOpen: (userId: string) => void;
    names?: (userId: string) => string | null;
}

/** La tabla de cada semana (la de ahora y las 3 anteriores), con el campeón de la semana pasada resaltado */
export const LeagueWeeks: React.FC<LeagueWeeksProps> = ({ fantasyLeague, members, ownId, onOpen, names }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const fanLabel = useFanLabel();
    const query = useLeagueWeeks(fantasyLeague, members);
    const nameOf = useMemberNames(fantasyLeague, members, names);
    const [index, setIndex] = useState(0);
    const weeks = query.data ?? [];
    if (query.isPending && query.fetchStatus !== 'idle') {
        return (
            <Card style={{ gap: 10 }}>
                <Skeleton height={32} width={220} round={16} />
                <Skeleton height={36} round={18} />
                <Skeleton height={36} round={18} />
            </Card>
        );
    }
    // Sin el servidor nuevo la pestaña no sale (la Tabla la quita); aquí no se muestra nada
    if (query.isError || !weeks.length) return null;
    const week = weeks[Math.min(index, weeks.length - 1)];
    const champion = lastChampion(weeks);
    const label = (userId: string) => fanLabel(nameOf(userId), userId === ownId);

    return (
        <View style={{ gap: 12 }}>
            {champion && (
                <Pressable
                    onPress={() => onOpen(champion.userId)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('fantasyLeagues.championLast')}: ${label(champion.userId)}, ${t('fantasyLeagues.championPts', { pts: formatCredits(champion.total, lang) })}`}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.card, padding: 16, backgroundColor: alpha(colors.gold, 0.15), borderWidth: 1, borderColor: alpha(colors.gold, 0.3), opacity: pressed ? 0.85 : 1 })}
                >
                    <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold }}>
                        <Trophy size={20} color="#fff" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={11} weight="extrabold" color={colors.gold} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {t('fantasyLeagues.championLast')}
                        </Txt>
                        <Txt size={18} weight="extrabold" numberOfLines={1}>
                            {label(champion.userId)}
                        </Txt>
                        <Txt size={12} weight="semibold" tone="muted" numberOfLines={1}>
                            {`${t('fantasyLeagues.championPts', { pts: formatCredits(champion.total, lang) })} · ${weekRange(champion.week, t, lang)}`}
                        </Txt>
                    </View>
                </Pressable>
            )}
            {weeks.length > 1 && (
                // Margen vertical para que el área táctil de 44 px del Segmented no quede recortada por el ScrollView
                <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={t('fantasyLeagues.pickWeek')} style={{ marginHorizontal: -16, marginVertical: -6, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6 }}>
                    <Segmented<string>
                        small
                        value={String(Math.min(index, weeks.length - 1))}
                        onChange={(value) => setIndex(Number(value))}
                        options={weeks.map((_, position) => ({ value: String(position), label: weekName(position, t) }))}
                    />
                </ScrollView>
            )}
            <Txt size={12} weight="semibold" tone="muted" style={{ paddingHorizontal: 4 }}>
                {weekRange(week, t, lang)}
                {!week.champion ? ` · ${week === weeks[0] ? t('fantasyLeagues.inProgress') : t('fantasyLeagues.noChampion')}` : ''}
            </Txt>
            {week.rows.length ? (
                <Card padded={false} style={{ overflow: 'hidden' }}>
                    {week.rows.map((row, position) => {
                        const isChampion = week.champion === row.userId;
                        const days = t('fantasyLeagues.days', { count: row.days });
                        return (
                            <View key={row.userId} style={isChampion ? { backgroundColor: alpha(colors.gold, 0.1) } : undefined}>
                                <FanRow first={position === 0} userId={row.userId} name={nameOf(row.userId)} own={row.userId === ownId} onOpen={onOpen} rank={row.rank} points={row.total} detail={isChampion ? `🏆 ${t('fantasyLeagues.champion')} · ${days}` : days} />
                            </View>
                        );
                    })}
                </Card>
            ) : (
                <Card>
                    <Txt size={14} tone="muted" center>
                        {t('fantasyLeagues.empty')}
                    </Txt>
                </Card>
            )}
        </View>
    );
};

// ---------------------------------------------------------------- dueño

interface OwnerToolsProps {
    league: { code: string; name: string; owner: string | null; members: string[] };
    fantasyLeague: LeagueId;
    ownId: string;
    /** Después de cada cambio (se vuelven a pedir las ligas); `deleted` la saca de la vista */
    onChanged: (change: 'renamed' | 'removed' | 'deleted') => void;
    names?: (userId: string) => string | null;
}

type Mode = 'rename' | 'remove' | 'delete' | null;

/** Renombrar, sacar a alguien y borrar la liga: solo el dueño, y solo si la base ya tiene esas funciones */
export const LeagueOwnerTools: React.FC<OwnerToolsProps> = ({ league, fantasyLeague, ownId, onChanged, names }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const client = useQueryClient();
    const fanLabel = useFanLabel();
    const isOwner = !!league.owner && league.owner === ownId;
    const tools = useOwnerTools(isOwner);
    const nameOf = useMemberNames(fantasyLeague, league.members, names);
    const [mode, setMode] = useState<Mode>(null);
    const [name, setName] = useState(league.name);
    const [removing, setRemoving] = useState<string | null>(null);
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    if (!isOwner || tools.data !== true) return null;
    const others = league.members.filter((id) => id !== ownId);

    const attempt = async (work: () => Promise<unknown>, done: string, change: 'renamed' | 'removed' | 'deleted') => {
        setBusy(true);
        try {
            await work();
            showToast(done);
            setMode(null);
            setRemoving(null);
            setTyped('');
            onChanged(change);
        } catch {
            showToast(t('fantasyLeagues.owner.failed'));
            // Si la base dijo que no tiene la función, las herramientas se esconden
            client.invalidateQueries({ queryKey: OWNER_TOOLS_KEY });
        } finally {
            setBusy(false);
        }
    };
    const open = (next: Exclude<Mode, null>) => {
        setMode((current) => (current === next ? null : next));
        setRemoving(null);
        setTyped('');
        setName(league.name);
    };
    const rename = () => {
        const clean = cleanLeagueName(name);
        if (!clean || clean === league.name) return setMode(null);
        attempt(() => renameLeague(league.code, clean), t('fantasyLeagues.owner.renamed', { name: clean }), 'renamed');
    };
    const tab = (value: Exclude<Mode, null>, Icon: typeof Pencil, text: string, danger = false) => {
        const active = mode === value;
        const ink = active ? colors.bg : danger ? colors.live : colors.ink;
        return (
            <Pressable
                key={value}
                onPress={() => open(value)}
                accessibilityRole="button"
                accessibilityState={{ expanded: active }}
                style={({ pressed }) => ({ height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 14, backgroundColor: active ? colors.ink : danger ? alpha(colors.live, 0.1) : colors.raised, opacity: pressed ? 0.85 : 1 })}
            >
                <Icon size={16} color={ink} />
                <Txt size={12} weight="extrabold" color={ink}>
                    {text}
                </Txt>
            </Pressable>
        );
    };
    const small = (label: string, onPress: () => void, tone: 'danger' | 'plain', disabled = false) => (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            style={({ pressed }) => ({ height: 40, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 14, backgroundColor: tone === 'danger' ? colors.live : colors.surface, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 })}
        >
            <Txt size={12} weight="extrabold" color={tone === 'danger' ? '#fff' : colors.ink}>
                {label}
            </Txt>
        </Pressable>
    );

    return (
        <View accessibilityLabel={t('fantasyLeagues.owner.title')} style={{ gap: 12, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
            <Row justify="space-between" gap={8} wrap>
                <Row gap={6}>
                    <Settings2 size={14} color={colors.muted} />
                    <Txt eyebrow>{t('fantasyLeagues.owner.title')}</Txt>
                </Row>
                <View style={{ borderRadius: radius.pill, backgroundColor: alpha(colors.gold, 0.15), paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Txt size={11} weight="bold">
                        {t('fantasyLeagues.owner.badge')}
                    </Txt>
                </View>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tab('rename', Pencil, t('fantasyLeagues.owner.rename'))}
                {tab('remove', UserMinus, t('fantasyLeagues.owner.remove'))}
                {tab('delete', Trash2, t('fantasyLeagues.owner.delete'), true)}
            </View>
            {mode === 'rename' && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Field value={name} onChangeText={setName} maxLength={LEAGUE_NAME_MAX} accessibilityLabel={t('fantasyLeagues.owner.renameLabel')} returnKeyType="done" onSubmitEditing={rename} style={{ flexGrow: 1, flexBasis: 180, minWidth: 0 }} />
                    <Pressable onPress={rename} disabled={busy} accessibilityRole="button" style={({ pressed }) => ({ height: 44, justifyContent: 'center', borderRadius: 16, paddingHorizontal: 16, backgroundColor: colors.ink, opacity: busy ? 0.5 : pressed ? 0.85 : 1 })}>
                        <Txt size={14} weight="bold" color={colors.bg}>
                            {t('fantasyLeagues.owner.save')}
                        </Txt>
                    </Pressable>
                    <Pressable onPress={() => setMode(null)} accessibilityRole="button" style={({ pressed }) => ({ height: 44, justifyContent: 'center', borderRadius: 16, paddingHorizontal: 16, backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 })}>
                        <Txt size={14} weight="bold">
                            {t('fantasyLeagues.owner.cancel')}
                        </Txt>
                    </Pressable>
                </View>
            )}
            {mode === 'remove' &&
                (others.length ? (
                    <View style={{ borderRadius: 16, backgroundColor: alpha(colors.raised, 0.6) }}>
                        {others.map((userId, position) => {
                            const who = fanLabel(nameOf(userId), false);
                            return (
                                <View key={userId} style={{ gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: position ? 1 : 0, borderTopColor: colors.line }}>
                                    <Row gap={8}>
                                        <Txt size={14} weight="bold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                            {who}
                                        </Txt>
                                        {removing !== userId && (
                                            <Pressable
                                                onPress={() => setRemoving(userId)}
                                                accessibilityRole="button"
                                                accessibilityLabel={t('fantasyLeagues.owner.removeWho', { name: who })}
                                                style={({ pressed }) => ({ height: 36, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 12, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 })}
                                            >
                                                <UserMinus size={14} color={colors.ink} />
                                                <Txt size={12} weight="bold">
                                                    {t('fantasyLeagues.owner.remove')}
                                                </Txt>
                                            </Pressable>
                                        )}
                                    </Row>
                                    {removing === userId && (
                                        <View accessibilityRole="alert" style={{ gap: 8, borderRadius: 12, padding: 10, backgroundColor: alpha(colors.live, 0.1) }}>
                                            <Txt size={12} weight="semibold">
                                                {t('fantasyLeagues.owner.removeConfirm', { name: who })}
                                            </Txt>
                                            <Row gap={8}>
                                                {small(t('fantasyLeagues.owner.removeYes'), () => attempt(() => removeMember(league.code, userId), t('fantasyLeagues.owner.removed', { name: who }), 'removed'), 'danger', busy)}
                                                {small(t('fantasyLeagues.owner.cancel'), () => setRemoving(null), 'plain')}
                                            </Row>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <Txt size={14} tone="muted">
                        {t('fantasyLeagues.owner.nobody')}
                    </Txt>
                ))}
            {mode === 'delete' && (
                <View style={{ gap: 8, borderRadius: 16, padding: 12, backgroundColor: alpha(colors.live, 0.1) }}>
                    <Txt size={12} weight="semibold">
                        {t('fantasyLeagues.owner.deleteConfirm', { name: league.name })}
                    </Txt>
                    <Field value={typed} onChangeText={setTyped} accessibilityLabel={t('fantasyLeagues.owner.deleteLabel')} placeholder={league.name} autoCorrect={false} autoCapitalize="none" style={{ backgroundColor: colors.surface }} />
                    <Row gap={8}>
                        <Pressable
                            onPress={() => confirmsName(typed, league.name) && attempt(() => deleteLeague(league.code), t('fantasyLeagues.owner.deleted', { name: league.name }), 'deleted')}
                            disabled={busy || !confirmsName(typed, league.name)}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: busy || !confirmsName(typed, league.name) }}
                            style={({ pressed }) => ({ height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 16, backgroundColor: colors.live, opacity: busy || !confirmsName(typed, league.name) ? 0.4 : pressed ? 0.85 : 1 })}
                        >
                            <Trash2 size={16} color="#fff" />
                            <Txt size={12} weight="extrabold" color="#fff">
                                {t('fantasyLeagues.owner.deleteYes')}
                            </Txt>
                        </Pressable>
                        {small(t('fantasyLeagues.owner.cancel'), () => setMode(null), 'plain')}
                    </Row>
                </View>
            )}
        </View>
    );
};
