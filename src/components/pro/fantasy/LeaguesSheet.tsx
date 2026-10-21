// Ligas privadas en una hoja: la tabla de la temporada de cada liga, sus miembros, el código para copiar o compartir,
// comparar los equipos del día (lo de un juego que no ha empezado no se ve) y salir. Abajo, crear o unirse a otra.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Columns2, Copy, Lock, LogOut, Share2 } from 'lucide-react-native';
import type { LeagueId } from '../../../types';
import { createLeague, joinLeague } from '../../../lib/account';
import { effectiveEntry, isLocked, pickPoints, playerScore, teamPoints, type FantasyDay, type FantasyPlayer } from '../../../lib/fantasy';
import { localeFor } from '../../../lib/format';
import { showToast } from '../../../lib/toast';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { ErrorState, PlayerPhoto, Sheet, Skeleton, Txt, useErrorText } from '../../ui';
import { Field, FieldButton } from '../../account/Field';
import { useFanLabel } from '../../fantasy/FanSearch';
import { useLocalText } from '../../fantasy/texts';
import { shareLink } from '../../share/ShareSheet';
import { ChipButton, ChipRow, ModuleHeader, ProButton, ProNote, shortName, useProColors } from '../kit';
import { Num, fmtPts } from './bits';
import { leaguesKey, leaveLeague, useDayRivals, useSeasonTable, type LeagueInfo } from './data';
import { ranked } from './logic';

interface LeaguesSheetProps {
    open: boolean;
    league: LeagueId;
    userId: string;
    day: FantasyDay | undefined;
    leagues: LeagueInfo[];
    loading: boolean;
    error: unknown;
    onRetry: () => void;
    onClose: () => void;
}

const SHOWN = 4;

export const LeaguesSheet: React.FC<LeaguesSheetProps> = ({ open, league, userId, day, leagues, loading, error, onRetry, onClose }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const errorText = useErrorText();
    const client = useQueryClient();
    const [selected, setSelected] = useState<string | null>(null);
    const current = leagues.find((item) => item.id === selected) ?? leagues[0] ?? null;
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState<'create' | 'join' | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const refresh = () => client.invalidateQueries({ queryKey: leaguesKey(userId) });

    const create = async () => {
        if (!name.trim() || busy) return;
        setBusy('create');
        const created = await createLeague(name).catch(() => null);
        setBusy(null);
        setMessage(created?.[0]?.code ? t('fantasy.created', { code: created[0].code }) : t('account.errors.unknown'));
        setName('');
        refresh();
    };
    const join = async () => {
        if (!code.trim() || busy) return;
        setBusy('join');
        const ok = await joinLeague(code)
            .then(() => true)
            .catch(() => false);
        setBusy(null);
        setMessage(ok ? t('fantasy.joined') : t('fantasy.badCode'));
        setCode('');
        refresh();
    };

    return (
        <Sheet open={open} onClose={onClose} title={t('pro.fantasy.leagues.title')}>
            {loading ? (
                <Skeleton height={320} />
            ) : error && !leagues.length ? (
                <ErrorState message={errorText(error)} onRetry={onRetry} />
            ) : current ? (
                <>
                    {leagues.length > 1 && (
                        <ChipRow label={t('pro.fantasy.leagues.pick')}>
                            {leagues.map((item) => (
                                <ChipButton key={item.id} active={item.id === current.id} onPress={() => setSelected(item.id)}>
                                    {item.name}
                                </ChipButton>
                            ))}
                        </ChipRow>
                    )}
                    <LeagueDetail key={current.id} league={league} userId={userId} day={day} info={current} onLeft={refresh} />
                </>
            ) : (
                <ProNote tone="info" title={t('pro.fantasy.leagues.noneTitle')}>
                    {t('pro.fantasy.leagues.none')}
                </ProNote>
            )}

            <View style={[{ gap: 12, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 }, shadow('card')]}>
                <ModuleHeader title={t('pro.fantasy.leagues.newTitle')} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Field value={name} onChangeText={setName} maxLength={40} placeholder={t('fantasy.newLeague')} accessibilityLabel={t('fantasy.newLeague')} returnKeyType="done" onSubmitEditing={create} style={{ flex: 1 }} />
                    <FieldButton label={t('fantasy.create')} onPress={create} disabled={!name.trim()} busy={busy === 'create'} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Field
                        value={code}
                        onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        maxLength={6}
                        placeholder={t('fantasy.code')}
                        accessibilityLabel={t('fantasy.code')}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={join}
                        style={{ flex: 1, letterSpacing: 3 }}
                    />
                    <FieldButton tone="accent" label={t('fantasy.join')} onPress={join} disabled={!code.trim()} busy={busy === 'join'} />
                </View>
                {message ? (
                    <Txt size={14} weight="semibold" accessibilityLiveRegion="polite">
                        {message}
                    </Txt>
                ) : null}
            </View>
        </Sheet>
    );
};

const LeagueDetail: React.FC<{ league: LeagueId; userId: string; day: FantasyDay | undefined; info: LeagueInfo; onLeft: () => void }> = ({ league, userId, day, info, onLeft }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const errorText = useErrorText();
    const fanLabel = useFanLabel();
    const ids = useMemo(() => info.members.map((member) => member.userId), [info.members]);
    const season = useSeasonTable(league, ids);
    const [all, setAll] = useState(false);
    const [compare, setCompare] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const rows = useMemo(() => ranked([...(season.data?.ranking ?? [])].sort((a, b) => b.points - a.points)), [season.data]);
    const owner = info.members.find((member) => member.userId === info.owner);
    const others = info.members.length - rows.length;
    const mine = rows.findIndex((row) => row.userId === userId);
    // Los primeros y tu fila (aunque vayas más abajo)
    const shown = all ? rows : mine >= SHOWN ? [...rows.slice(0, SHOWN - 1), rows[mine]] : rows.slice(0, SHOWN);
    const shareText = t('pro.fantasy.leagues.shareText', { name: info.name, code: info.code });
    const created = info.createdAt ? new Date(info.createdAt).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short' }) : null;

    const copy = async () => {
        try {
            await Clipboard.setStringAsync(info.code);
            showToast(t('pro.fantasy.leagues.copied'), undefined, 3000);
        } catch {
            showToast(t('pro.fantasy.leagues.copyFailed'), undefined, 3000);
        }
    };
    const leave = async () => {
        // Toca dos veces: la primera pide confirmar
        if (!confirm) {
            setConfirm(true);
            return;
        }
        try {
            await leaveLeague(info.id, userId);
            showToast(t('pro.fantasy.leagues.left', { name: info.name }), undefined, 3000);
            onLeft();
        } catch {
            showToast(t('account.errors.unknown'), undefined, 3000);
        }
        setConfirm(false);
    };

    return (
        <View style={[{ gap: 14, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 }, shadow('card')]}>
            <View style={{ gap: 4 }}>
                <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
                    {t('pro.fantasy.leagues.eyebrow')}
                </Txt>
                <Txt size={24} weight="black" accessibilityRole="header" style={{ lineHeight: 28, letterSpacing: -0.5 }}>
                    {info.name}
                </Txt>
                <Txt size={12} tone="muted">
                    {t('pro.fantasy.leagues.members', { count: info.members.length })}
                    {owner && created ? ` · ${t('pro.fantasy.leagues.createdBy', { name: fanLabel(owner.name, owner.userId === userId), date: created })}` : ''}
                </Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 14, paddingVertical: 12 }}>
                <View style={{ flexShrink: 1, minWidth: 0, gap: 4 }}>
                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                        {t('pro.fantasy.leagues.code')}
                    </Txt>
                    <Num size={30} style={{ letterSpacing: 2 }} numberOfLines={1}>
                        {info.code}
                    </Num>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
                    <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={t('pro.fantasy.leagues.copy')} style={[{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, shadow('card')]}>
                        <Copy size={18} color={colors.ink} />
                    </Pressable>
                    <Pressable
                        onPress={() => shareLink(shareText, '/fantasy', lang)}
                        accessibilityRole="button"
                        accessibilityLabel={t('pro.fantasy.leagues.share')}
                        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}
                    >
                        <Share2 size={18} color="#fff" />
                    </Pressable>
                </View>
            </View>
            {season.isPending ? (
                <Skeleton height={160} round={radius.tile} />
            ) : season.isError && !season.data ? (
                <ErrorState message={errorText(season.error)} onRetry={() => season.refetch()} />
            ) : (
                <View accessibilityLabel={t('pro.fantasy.leagues.tableLabel', { name: info.name })}>
                    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 }}>
                        <Txt size={10} weight="extrabold" tone="muted" style={{ width: 28, textTransform: 'uppercase' }}>
                            #
                        </Txt>
                        <Txt size={10} weight="extrabold" tone="muted" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            {t('pro.fantasy.leagues.member')}
                        </Txt>
                        <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            {t('pro.fantasy.leagues.season')}
                        </Txt>
                    </View>
                    {shown.map((row) => {
                        const own = row.userId === userId;
                        return (
                            <View
                                key={row.userId}
                                accessible
                                accessibilityLabel={`${row.rank}, ${fanLabel(row.name, own)}, ${fmtPts(row.points)} ${t('pro.fantasy.pts')}`}
                                style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.tile, paddingHorizontal: 8, backgroundColor: own ? alpha(colors.accent, 0.12) : 'transparent' }}
                            >
                                <Num size={16} style={{ width: 28 }}>
                                    {row.rank}
                                </Num>
                                <Txt size={13} weight={own ? 'extrabold' : 'semibold'} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                    {fanLabel(row.name, own)}
                                </Txt>
                                <Num size={18}>{fmtPts(row.points)}</Num>
                            </View>
                        );
                    })}
                    {!rows.length && (
                        <Txt size={14} tone="muted" center style={{ paddingVertical: 16 }}>
                            {t('pro.fanaticos.fans.emptyLeague')}
                        </Txt>
                    )}
                </View>
            )}
            {(rows.length > SHOWN || others > 0) && (
                <Pressable onPress={() => setAll((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: all }} style={{ marginTop: -4, minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 8 }}>
                    <Txt size={12} weight="bold" tone="accentInk">
                        {all ? t('pro.fantasy.leagues.less') : t('pro.fantasy.leagues.more', { count: Math.max(0, rows.length - shown.length) + Math.max(0, others) })}
                    </Txt>
                </Pressable>
            )}
            {all && others > 0 && (
                <Txt size={11} tone="muted" style={{ marginTop: -8 }}>
                    {t('pro.fantasy.leagues.noPoints', { count: others })}
                </Txt>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <ProButton
                    label={t('pro.fantasy.leagues.compare')}
                    icon={(color) => <Columns2 size={16} color={color} />}
                    onPress={() => setCompare((value) => !value)}
                    accessibilityState={{ expanded: compare }}
                    disabled={!day}
                    style={{ flex: 1, flexBasis: 0 }}
                />
                <Pressable
                    onPress={leave}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ flex: 1, flexBasis: 0, minWidth: 0, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 12, backgroundColor: confirm ? alpha(pro.down, 0.16) : pressed ? alpha(colors.line, 0.2) : colors.raised })}
                >
                    <LogOut size={16} color={pro.down} />
                    <Txt size={14} weight="bold" color={pro.down} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {confirm ? t('pro.fantasy.leagues.leaveConfirm') : t('pro.fantasy.leagues.leave')}
                    </Txt>
                </Pressable>
            </View>
            {compare && day && <CompareTeams league={league} userId={userId} day={day} members={ids} />}
        </View>
    );
};

/** Los equipos del día de los miembros: cada pelotero se ve cuando empieza su juego (los tuyos siempre) */
const CompareTeams: React.FC<{ league: LeagueId; userId: string; day: FantasyDay; members: string[] }> = ({ league, userId, day, members }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const errorText = useErrorText();
    const fanLabel = useFanLabel();
    const L = useLocalText();
    const live = day.games.some((game) => game.state === 'live');
    const rivals = useDayRivals(league, day.date, members, live);
    if (rivals.isPending) return <Skeleton height={200} round={radius.tile} />;
    if (rivals.isError) return <ErrorState message={errorText(rivals.error)} onRetry={() => rivals.refetch()} />;
    const teams = (rivals.data ?? [])
        .map((rival) => {
            const entry = effectiveEntry(day, rival.entry);
            return { ...rival, entry, points: teamPoints(day, entry) + pickPoints(day, entry) };
        })
        .sort((a, b) => b.points - a.points);
    if (!teams.length) {
        return (
            <Txt size={14} tone="muted">
                {t('fantasy.emptyTable')}
            </Txt>
        );
    }
    return (
        <View accessibilityLabel={t('pro.fantasy.leagues.compareLabel')} style={{ gap: 8 }}>
            {teams.map((team) => {
                const own = team.userId === userId;
                const players = team.entry.lineup.map((id) => day.players.find((player) => player.id === id)).filter((player): player is FantasyPlayer => !!player);
                return (
                    <View key={team.userId} style={{ gap: 8, borderRadius: radius.tile, padding: 12, backgroundColor: own ? alpha(colors.accent, 0.1) : colors.raised }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <Txt size={13} weight="extrabold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                {fanLabel(team.name, own)}
                            </Txt>
                            <Num size={18}>
                                {fmtPts(team.points)}
                                <Txt size={12} weight="bold" tone="muted">
                                    {` ${t('pro.fantasy.pts')}`}
                                </Txt>
                            </Num>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {players.map((player) => {
                                // Lo de otro antes de que empiece su juego no se ve
                                const hidden = !own && !isLocked(day, player);
                                const club = day.teams[player.teamId];
                                return hidden ? (
                                    <View key={player.id} accessible accessibilityRole="image" accessibilityLabel={L('fans.hidden')} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                                        <Lock size={16} color={colors.muted} />
                                    </View>
                                ) : (
                                    <View key={player.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.surface, paddingVertical: 2, paddingLeft: 2, paddingRight: 10 }}>
                                        <PlayerPhoto personId={player.id} name={player.name} size={36} team={club ? { id: club.id, logo: club.logo, color: club.color } : null} />
                                        <Txt size={11} weight="bold">
                                            {shortName(player.name)}
                                            {team.entry.captain === player.id ? ' ×1.5' : ''} · {fmtPts(playerScore(team.entry, player))}
                                        </Txt>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                );
            })}
        </View>
    );
};
