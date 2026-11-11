// Guía para empezar (Fantasy v3): 3 pasos cortos para quien no tiene equipo hoy. Si la cierra, no vuelve a salir en
// este navegador (sin almacenamiento, dura mientras la app esté abierta).
import { useSyncExternalStore } from 'react';

const KEY = 'el-play-fantasy-guide';
let dismissedHere = false;
const listeners = new Set<() => void>();

export const GUIDE_STEPS = 3;

export const guideDismissed = () => {
    if (dismissedHere) return true;
    try {
        return localStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
};

export const dismissGuide = () => {
    dismissedHere = true;
    try {
        localStorage.setItem(KEY, '1');
    } catch {
        /* sin almacenamiento: se acuerda mientras la app esté abierta */
    }
    listeners.forEach((listener) => listener());
};

export const useGuideDismissed = () =>
    useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        guideDismissed,
        () => true
    );

/** Solo para las pruebas */
export const resetGuide = () => {
    dismissedHere = false;
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* sin almacenamiento */
    }
    listeners.forEach((listener) => listener());
};
