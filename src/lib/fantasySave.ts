// Guardar el equipo del día en la cuenta, con un estado que se ve (Guardando… / Guardado / Sin conexión / No se pudo).
// Antes un error al subir se tragaba y nadie se enteraba de que ese día ya no se guardaba nada.
import { useSyncExternalStore } from 'react';
import type { LeagueId } from '../types';
import { AccountError, pushEntry } from './account';
import { entryKey, getStore, markSynced, type DayEntry, type EntryHistory } from './fantasy';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';
export type Pusher = (league: LeagueId, date: string, entry: DayEntry) => Promise<EntryHistory | null>;

const states = new Map<string, SaveStatus>();
const listeners = new Set<() => void>();
// El último intento de cada día: una respuesta vieja que llega tarde no pisa el estado del nuevo
const attempts = new Map<string, number>();
// Lo que quedó sin subir (sin red o con error) y con qué se sube
const pending = new Map<string, { league: LeagueId; date: string; push: Pusher }>();
let counter = 0;

const emit = () => listeners.forEach((listener) => listener());
const set = (key: string, status: SaveStatus) => {
    if (states.get(key) === status) return;
    states.set(key, status);
    emit();
};

const offline = (error: unknown) => (typeof navigator !== 'undefined' && navigator.onLine === false) || (error instanceof AccountError && error.code === 'network');

/** Sube el equipo de un día y va diciendo cómo va; si ya se subió esa versión, solo dice «Guardado» */
export const saveEntry = async (league: LeagueId, date: string, entry: DayEntry, push: Pusher = pushEntry) => {
    const key = entryKey(league, date);
    if (!entry.savedAt) return;
    if (entry.syncedAt === entry.savedAt) {
        pending.delete(key);
        set(key, 'saved');
        return;
    }
    const attempt = ++counter;
    attempts.set(key, attempt);
    set(key, 'saving');
    try {
        const history = await push(league, date, entry);
        if (attempts.get(key) !== attempt) return;
        markSynced(league, date, entry.savedAt, history);
        pending.delete(key);
        set(key, 'saved');
    } catch (error) {
        if (attempts.get(key) !== attempt) return;
        pending.set(key, { league, date, push });
        set(key, offline(error) ? 'offline' : 'error');
    }
};

/** Vuelve a intentar con lo último que hay en el teléfono para ese día */
export const retrySave = (league: LeagueId, date: string) => {
    const key = entryKey(league, date);
    const entry = getStore()[key];
    const push = pending.get(key)?.push ?? pushEntry;
    if (entry) return saveEntry(league, date, entry, push);
    return Promise.resolve();
};

// Al volver la conexión se sube lo que quedó pendiente
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        for (const { league, date } of [...pending.values()]) retrySave(league, date);
    });
}

export const getSaveStatus = (league: LeagueId, date: string): SaveStatus => states.get(entryKey(league, date)) ?? 'idle';

export const useSaveStatus = (league: LeagueId, date: string | undefined): SaveStatus =>
    useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => (date ? getSaveStatus(league, date) : 'idle'),
        () => 'idle'
    );

/** Solo para las pruebas */
export const resetSaveStatus = () => {
    states.clear();
    attempts.clear();
    pending.clear();
    emit();
};
