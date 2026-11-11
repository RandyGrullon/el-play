// Acciones rápidas de «Mi equipo» (Fantasy v3): copiar el equipo de ayer (los que juegan hoy y no se han cerrado, con
// las mismas reglas de agregar) y deshacer el último cambio (un paso, mientras nada de ese cambio se haya cerrado).
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Undo2 } from 'lucide-react';
import { showToast } from '../../lib/toast';
import {
    copyLineup,
    copySource,
    isLocked,
    isPostponed,
    slotsLeft,
    undoLast,
    undoState,
    useFantasyDay,
    useFantasyStore,
    type CopyPlan,
    type DayEntry,
    type FantasyDay,
    type FantasyPlayer
} from '../../lib/fantasy';
import { reasonText } from './PlayerPicker';
import { shortDay } from './fantasyUi';

type T = (key: string, options?: Record<string, unknown>) => string;
const DAY_MS = 86400000;
const previousDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

/** «Copiamos 4 peloteros y tu capitán. No se pudo: Pelotero Uno (su juego ya empezó), Pelotero Dos (no juega hoy).» */
export const copyMessage = (t: T, lang: string, day: FantasyDay, entry: DayEntry, plan: CopyPlan, names: Map<number, string>) => {
    const copied = plan.added.length
        ? t(plan.captainCopied ? 'fantasyIdeas.quick.copiedCaptain' : 'fantasyIdeas.quick.copied', { count: plan.added.length })
        : plan.skipped.length
          ? t('fantasyIdeas.quick.copiedNone')
          : t('fantasyIdeas.quick.nothing');
    if (!plan.skipped.length) return copied;
    const list = plan.skipped
        .map(({ id, reason }) => {
            const player = day.players.find((p) => p.id === id);
            const name = player?.name ?? names.get(id) ?? t('fantasyIdeas.quick.unknown');
            // Lo mismo que dice el selector («Su juego ya empezó», «Ya tienes 2 de LIC», «Te faltan 1,5 créditos»), en minúscula
            const why = reason === 'notPlaying' || !player ? t('fantasyIdeas.quick.notPlaying') : reasonText(t, lang, day, entry, player, reason);
            return t('fantasyIdeas.quick.skippedItem', { name, reason: why.charAt(0).toLocaleLowerCase(lang) + why.slice(1) });
        })
        .join(', ');
    return `${copied} ${t('fantasyIdeas.quick.skipped', { list })}`;
};

export const QuickActions: React.FC<{ day: FantasyDay; entry: DayEntry; now: number }> = ({ day, entry, now }) => {
    const { t, i18n } = useTranslation();
    const store = useFantasyStore();
    const source = useMemo(() => copySource(store, day.league, day.date), [store, day.league, day.date]);
    // Los nombres de los que hoy no juegan salen del día copiado
    const sourceDay = useFantasyDay(day.league, source?.date ?? day.date, !!source);
    const slots = slotsLeft(day, entry);
    const anyOpen = day.players.some((player) => !isLocked(day, player, now) && !isPostponed(day, player));
    const showCopy = !!source && anyOpen && slots.batters + slots.pitchers > 0 && source.entry.lineup.some((id) => !entry.lineup.includes(id));
    const undo = undoState(day, entry, now);
    if (!showCopy && !undo) return null;

    const copy = () => {
        if (!source) return;
        const plan = copyLineup(day, entry, source.entry);
        const names = new Map((sourceDay.data?.players ?? []).map((player: FantasyPlayer) => [player.id, player.name]));
        const changed = plan.added.length > 0 || plan.captainCopied;
        // Las razones con el equipo como quedó (p. ej. cuántos créditos faltan)
        showToast(copyMessage(t, i18n.language, day, { ...entry, lineup: plan.lineup, captain: plan.captain }, plan, names),changed ? { label: t('fantasyIdeas.quick.undo'), run: () => undoLast(day) } : undefined, 9000);
    };
    const runUndo = () => showToast(undoLast(day) ? t('fantasyIdeas.quick.undone') : t('fantasyIdeas.quick.undoFailed'));
    const undoName = undo?.playerId ? day.players.find((player) => player.id === undo.playerId)?.name ?? t('fantasyIdeas.quick.unknown') : '';
    const copyLabel = source && source.date === previousDay(day.date) ? t('fantasyIdeas.quick.copy') : t('fantasyIdeas.quick.copyFrom', { day: source ? shortDay(source.date, i18n.language) : '' });

    return (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('fantasyIdeas.quick.title')}>
            {showCopy && (
                <button type="button" onClick={copy} className="flex h-11 items-center gap-1.5 rounded-full bg-raised px-4 text-xs font-extrabold">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    {copyLabel}
                </button>
            )}
            {undo && (
                // El lector oye qué se deshace («Deshacer: agregaste a …»); a la vista, solo «Deshacer»
                <button type="button" onClick={runUndo} aria-label={t(`fantasyIdeas.quick.undoWhat.${undo.kind}`, { name: undoName })} className="flex h-11 items-center gap-1.5 rounded-full bg-raised px-4 text-xs font-extrabold">
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    {t('fantasyIdeas.quick.undo')}
                </button>
            )}
        </div>
    );
};
