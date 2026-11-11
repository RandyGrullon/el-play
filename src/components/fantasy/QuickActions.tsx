// Acciones rápidas de «Mi equipo» (igual que la web): «Copiar mi equipo de ayer» (o del último día que tuviste equipo
// en la semana) con lo que no se pudo copiar y por qué, y «Deshacer» el último cambio (agregar, quitar, capitán,
// completar, sugerido o copiar) mientras nada de eso se haya cerrado.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Copy, Undo2, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { undoLast, undoState, useFantasyDay, useFantasyStore, type DayEntry, type FantasyDay } from '../../lib/fantasy';
import { canOfferCopy, copyIntoDay, previousEntry, type CopyPlan } from '../../lib/fantasyQuick';
import { formatWeekday, formatDayNumber } from '../../lib/format';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { radius } from '../../theme/tokens';
import { Row, Txt } from '../ui';
import { reasonText } from './PlayerBits';
import { shift } from './shared';

/** «Copiamos 3 peloteros y tu capitán. No se pudo: Pelotero (no juega hoy), Otro (Ya tienes 2 de LIC).» */
export const copyMessage = (plan: CopyPlan, t: TFunction, lang: string) => {
    const head = plan.added.length
        ? t(plan.captainCopied ? 'fantasyIdeas.quick.copiedCaptain' : 'fantasyIdeas.quick.copied', { count: plan.added.length })
        : plan.skipped.length
          ? t('fantasyIdeas.quick.copiedNone')
          : t('fantasyIdeas.quick.nothing');
    if (!plan.skipped.length) return head;
    const list = plan.skipped
        .map((item) =>
            t('fantasyIdeas.quick.skippedItem', {
                name: item.name ?? t('fantasyIdeas.quick.unknown'),
                reason: item.reason.kind === 'notPlaying' ? t('fantasyIdeas.quick.notPlaying') : reasonText(item.reason, t, lang).replace(/^./, (char) => char.toLocaleLowerCase())
            })
        )
        .join(', ');
    return `${head} ${t('fantasyIdeas.quick.skipped', { list })}`;
};

export const QuickActions: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const store = useFantasyStore();
    const from = previousEntry(store, day.league, day.date);
    // El día que se copia: para los nombres de los que hoy no juegan
    const fromDay = useFantasyDay(day.league, from?.date, !!from).data;
    const [message, setMessage] = useState<{ key: string; text: string } | null>(null);
    const key = `${day.league}:${day.date}`;
    const undo = undoState(day, entry);
    const offerCopy = canOfferCopy(day, entry, from?.entry);
    const shown = message?.key === key ? message.text : null;
    if (!offerCopy && !undo && !shown) return null;

    const copyLabel = from && from.date !== shift(day.date, -1) ? t('fantasyIdeas.quick.copyFrom', { day: `${formatWeekday(from.date, lang)} ${formatDayNumber(from.date)}` }) : t('fantasyIdeas.quick.copy');
    const copy = () => {
        if (!from) return;
        const plan = copyIntoDay(day, from.entry, (id) => fromDay?.players.find((player) => player.id === id)?.name ?? null);
        if (plan.added.length) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setMessage({ key, text: copyMessage(plan, t, lang) });
    };
    const undoName = undo?.playerId ? (day.players.find((player) => player.id === undo.playerId)?.name ?? t('fantasyIdeas.quick.unknown')) : '';
    const undoWhat = undo ? t(`fantasyIdeas.quick.undoWhat.${undo.kind}`, { name: undoName }) : '';
    const runUndo = () => {
        const done = undoLast(day);
        if (done) Haptics.selectionAsync().catch(() => undefined);
        setMessage(null);
        showToast(done ? t('fantasyIdeas.quick.undone') : t('fantasyIdeas.quick.undoFailed'), undefined, 3000);
    };
    const pill = { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: radius.pill } as const;

    return (
        <View style={{ gap: 8 }} accessibilityLabel={t('fantasyIdeas.quick.title')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {offerCopy && (
                    <Pressable onPress={copy} accessibilityRole="button" style={({ pressed }) => [pill, { backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 }]}>
                        <Copy size={16} color={colors.ink} />
                        <Txt size={12} weight="extrabold" numberOfLines={1}>
                            {copyLabel}
                        </Txt>
                    </Pressable>
                )}
                {undo && (
                    <Pressable onPress={runUndo} accessibilityRole="button" accessibilityLabel={undoWhat} style={({ pressed }) => [pill, { backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1, flexShrink: 1 }]}>
                        <Undo2 size={16} color={colors.ink} />
                        <Txt size={12} weight="extrabold">
                            {t('fantasyIdeas.quick.undo')}
                        </Txt>
                        <Txt size={11} weight="semibold" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {undoWhat.replace(/^[^:]*:\s*/, '')}
                        </Txt>
                    </Pressable>
                )}
            </View>
            {shown && (
                <Row gap={8} align="flex-start" style={{ borderRadius: radius.tile, backgroundColor: colors.raised, paddingVertical: 10, paddingLeft: 12, paddingRight: 8 }}>
                    <Txt size={12} weight="semibold" accessibilityLiveRegion="polite" style={{ flex: 1 }}>
                        {shown}
                    </Txt>
                    <Pressable onPress={() => setMessage(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                        <X size={16} color={colors.muted} />
                    </Pressable>
                </Row>
            )}
        </View>
    );
};
