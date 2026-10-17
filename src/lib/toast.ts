// Avisos cortos abajo de la pantalla («Te avisamos cuando empiece», «Tienes los avisos bloqueados»…)
import { useSyncExternalStore } from 'react';

export interface ToastMessage {
    id: number;
    text: string;
    action?: { label: string; run: () => void };
}

let current: ToastMessage | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const showToast = (text: string, action?: ToastMessage['action'], ms = 5000) => {
    clearTimeout(timer);
    current = { id: Date.now(), text, action };
    emit();
    timer = setTimeout(hideToast, ms);
};

export const hideToast = () => {
    clearTimeout(timer);
    current = null;
    emit();
};

export const useToast = () =>
    useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => current,
        () => null
    );
