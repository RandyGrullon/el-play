// El equipo que cuenta (el mismo número de la tabla y del perfil): tu equipo de este teléfono con el historial que
// escribe la base (cuándo entró y salió cada uno, supabase/2026-10-17-antitrampa.sql). La tabla y el servidor puntúan
// con effectiveEntry y ese historial; aquí se pide tu fila para hacer lo mismo en el resumen, el encabezado y las
// tarjetas («No cuenta: …»). Mientras la base no tenga tu último cambio (o sin cuenta), cuenta lo del teléfono.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accountEnabled, rest, useSession } from './account';
import { effectiveEntry, gameStarted, notCounted, type DayEntry, type EntryHistory, type FantasyDay, type NotCounted } from './fantasy';

export interface CountedEntry {
    /** El equipo que cuenta (capitán y pronósticos incluidos) */
    entry: DayEntry;
    /** Los de tu equipo que no cuentan y por qué */
    notCounted: Map<number, NotCounted>;
}

const EMPTY = new Map<number, NotCounted>();

export const useCountedEntry = (day: FantasyDay | undefined, entry: DayEntry): CountedEntry => {
    const session = useSession();
    const userId = session?.user.id ?? null;
    // Antes del primer juego el historial no cambia nada: el orden de la alineación es el orden en que entraron
    const started = !!day && day.games.some((game) => gameStarted(game));
    const query = useQuery({
        queryKey: ['fantasy-own-history', userId, day?.league, day?.date, entry.savedAt],
        queryFn: () => rest<{ saved_at: number; history?: EntryHistory | null }[]>(`fantasy_entries?user_id=eq.${userId}&league=eq.${encodeURIComponent(day!.league)}&day=eq.${day!.date}&select=*&limit=1`),
        enabled: accountEnabled() && !!userId && !!day && started && entry.savedAt > 0,
        staleTime: 5 * 60000,
        // Si la base todavía no tiene el último cambio, se mira otra vez en un rato
        refetchInterval: (current) => (current.state.data && Number(current.state.data[0]?.saved_at ?? 0) < entry.savedAt ? 5000 : false),
        retry: 1
    });
    const row = query.data?.[0];
    const history = row && Number(row.saved_at) === entry.savedAt && row.history && typeof row.history === 'object' ? row.history : null;
    return useMemo(() => {
        if (!day) return { entry, notCounted: EMPTY };
        const withHistory = history ? { ...entry, history } : entry;
        const counted = effectiveEntry(day, withHistory);
        return { entry: counted, notCounted: notCounted(day, withHistory, counted) };
    }, [day, entry, history]);
};
