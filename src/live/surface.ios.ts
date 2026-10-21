// iPhone: Live Activity en la pantalla bloqueada y la isla dinámica
import { after, type LiveActivity } from 'expo-widgets';
import { liveGame } from './LiveGame';
import { prepareLogos } from './logoFiles';
import type { LiveGameProps, LiveSurface } from './types';

/** Si la app deja de mandar lecturas, el sistema la marca como desactualizada pasado este tiempo */
const STALE_MS = 4 * 60 * 1000;
/** Al terminar, el marcador final queda un rato en la pantalla bloqueada */
const FINAL_MS = 20 * 60 * 1000;

const staleDate = () => new Date(Date.now() + STALE_MS);

// El id de ActivityKit es estable: con él se encuentra la actividad aunque la app se haya cerrado
const find = (id: string): LiveActivity<LiveGameProps> | undefined => liveGame.getInstances().find((instance) => instance.getId() === id);

export const surface: LiveSurface = {
    // En el iPhone no hay permiso que pedir: las Actividades en vivo se apagan en Ajustes (ask no cambia nada)
    start: async (props) => {
        try {
            const instance = liveGame.start(props, `elplay://juego/${props.gamePk}`, staleDate());
            return { ok: true, id: instance.getId() };
        } catch (error) {
            // Actividades en vivo apagadas para El Play en Ajustes (o el iPhone no las tiene)
            const message = String((error as Error)?.message ?? error);
            return { ok: false, reason: /not supported|disabled|enabled|authoriz/i.test(message) ? 'blocked' : 'error' };
        }
    },
    update: async (id, props) => {
        const instance = find(id);
        if (!instance) return false;
        try {
            await instance.update(props, staleDate());
            return true;
        } catch {
            return false;
        }
    },
    end: async (id, props) => {
        const instance = find(id);
        if (!instance) return;
        await instance.end(props ? after(new Date(Date.now() + FINAL_MS)) : 'immediate', props ?? undefined, new Date()).catch(() => undefined);
    },
    // Las props no se pueden leer de vuelta: el juego de cada una lo recuerda follow.ts por su id.
    // getInstances no trae las que ya terminaron (las del marcador final)
    active: async () => liveGame.getInstances().map((instance) => ({ id: instance.getId(), gamePk: null, stopped: false, final: false })),
    // En el iPhone se deja de seguir deslizando la actividad o desde la app
    onStop: () => () => undefined,
    logos: prepareLogos
};
