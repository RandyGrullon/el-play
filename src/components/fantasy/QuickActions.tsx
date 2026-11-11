// Acciones rápidas de «Mi equipo» (igual que la web): «Copiar mi equipo de ayer» (o del último día que tuviste equipo
// en la semana), que avisa lo que no se pudo copiar y por qué (con «Deshacer» en el aviso), y «Deshacer» el último
// cambio (agregar, quitar, capitán, completar, sugerido o copiar) mientras nada de eso se haya cerrado.
import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Copy, Undo2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { undoLast, undoState, useFantasyDay, useFantasyStore, type DayEntry, type FantasyDay } from '../../lib/fantasy';
import { canOfferCopy, copyIntoDay, previousEntry, type CopyPlan } from '../../lib/fantasyQuick';
import { formatDayNumber, formatWeekday } from '../../lib/format';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { radius } from '../../theme/tokens';
import { Txt } from '../ui';
import { reasonText } from './PlayerBits';
import { shift } from './shared';

/** «Copiamos 3 peloteros y tu capitán. No se pudo: Pelotero (no juega hoy), Otro (ya tienes 2 de LIC).» */
export const copyMessage = (plan: CopyPlan, t: TFunction, lang: string) => {
    const head = plan.added.length
        ? t(plan.captainCopied ? 'fantasyIdeas.quick.copiedCaptain' : 'fantasyIdeas.quick.copied', { count: plan.added.length })
        : plan.skipped.length
          ? t('fantasyIdeas.quick.copiedNone')
          : t('fantasyIdeas.quick.nothing');
    if (!plan.skipped.length) return head;
    const list = plan.skipped
        .map((item) => {
            // Lo mismo que dice el selector («Su juego ya empezó», «Ya tienes 2 de LIC»…), en minúscula
            const why = item.reason.kind === 'notPlaying' ? t('fantasyIdeas.quick.notPlaying') : reasonText(item.reason, t, lang);
            return t('fantasyIdeas.quick.skippedItem', { name: item.name ?? t('fantasyIdeas.quick.unknown'), reason: why.charAt(0).toLocaleLowerCase() + why.slice(1) });
        })
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
    const fromDay = useFantasyDay(day.league, from?.date ?? day.date, !!from).data;
    const undo = undoState(day, entry);
    const offerCopy = canOfferCopy(day, entry, from?.entry);
    if (!offerCopy && !undo) return null;

    const copyLabel = from && from.date !== shift(day.date, -1) ? t('fantasyIdeas.quick.copyFrom', { day: `${formatWeekday(from.date, lang)} ${formatDayNumber(from.date)}` }) : t('fantasyIdeas.quick.copy');
    const copy = () => {
        if (!from) return;
        const names = fromDay?.date === from.date ? fromDay.players : [];
        const plan = copyIntoDay(day, from.entry, (id) => names.find((player) => player.id === id)?.name ?? null);
        const changed = plan.added.length > 0 || plan.captainCopied;
        if (changed) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        showToast(copyMessage(plan, t, lang), changed ? { label: t('fantasyIdeas.quick.undo'), run: () => undoLast(day) } : undefined, 9000);
    };
    const undoName = undo?.playerId ? (day.players.find((player) => player.id === undo.playerId)?.name ?? t('fantasyIdeas.quick.unknown')) : '';
    const runUndo = () => {
        const done = undoLast(day);
        if (done) Haptics.selectionAsync().catch(() => undefined);
        showToast(done ? t('fantasyIdeas.quick.undone') : t('fantasyIdeas.quick.undoFailed'), undefined, 3000);
    };
    const pill = { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: radius.pill } as const;

    return (
        <View accessibilityLabel={t('fantasyIdeas.quick.title')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {offerCopy && (
                <Pressable onPress={copy} accessibilityRole="button" style={({ pressed }) => [pill, { backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 }]}>
                    <Copy size={16} color={colors.ink} />
                    <Txt size={12} weight="extrabold" numberOfLines={1}>
                        {copyLabel}
                    </Txt>
                </Pressable>
            )}
            {undo && (
                // El lector oye qué se deshace («Deshacer: agregaste a …»); a la vista, solo «Deshacer»
                <Pressable onPress={runUndo} accessibilityRole="button" accessibilityLabel={t(`fantasyIdeas.quick.undoWhat.${undo.kind}`, { name: undoName })} style={({ pressed }) => [pill, { backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 }]}>
                    <Undo2 size={16} color={colors.ink} />
                    <Txt size={12} weight="extrabold">
                        {t('fantasyIdeas.quick.undo')}
                    </Txt>
                </Pressable>
            )}
        </View>
    );
};
