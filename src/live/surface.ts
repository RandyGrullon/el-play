// Web (y cualquier otra plataforma): no hay segundo plano. Metro usa surface.ios.ts / surface.android.ts en el teléfono.
// Para probar en la web de desarrollo: localStorage 'el-play-follow-demo' = '1' da una superficie de prueba que no
// muestra nada fuera de la app; guarda lo que se le mandaría a la actividad en window.__elPlayLive (y lo dice en la
// consola) para revisar los datos y pintar las vistas con un banco de pruebas.
import { Platform } from 'react-native';
import type { LiveGameProps, LiveHandle, LiveSurface } from './types';

interface DemoLog {
    /** Lo último que se mandó a cada actividad (por id) */
    active: Record<string, LiveGameProps>;
    /** Todo lo que pasó: start / update / end */
    history: { action: 'start' | 'update' | 'end'; id: string; at: number; props: LiveGameProps | null }[];
}

const demoOn = () => {
    if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return false;
    try {
        return window.localStorage?.getItem('el-play-follow-demo') === '1';
    } catch {
        return false;
    }
};

const demo = (): LiveSurface => {
    const log: DemoLog = { active: {}, history: [] };
    (window as unknown as { __elPlayLive: DemoLog }).__elPlayLive = log;
    const note = (action: DemoLog['history'][number]['action'], id: string, props: LiveGameProps | null) => {
        log.history.push({ action, id, at: Date.now(), props });
        console.info('[segundo-plano]', action, id, props ? JSON.stringify(props) : '');
    };
    return {
        start: async (props) => {
            const id = `juego-${props.gamePk}`;
            log.active[id] = props;
            note('start', id, props);
            return { ok: true, id };
        },
        update: async (id, props) => {
            if (!log.active[id]) return false;
            log.active[id] = props;
            note('update', id, props);
            return true;
        },
        end: async (id, props) => {
            delete log.active[id];
            note('end', id, props);
        },
        active: async (): Promise<LiveHandle[]> => Object.keys(log.active).map((id) => ({ id, gamePk: Number(id.slice(6)) || null, stopped: false, final: false })),
        onStop: () => () => undefined,
        // Sin carpeta compartida: el banco de pruebas pinta el mismo PNG que bajaría el teléfono, desde su URL
        logos: async (teams) =>
            Object.fromEntries(teams.filter((team) => /\/team-logos\/\d+\.svg$/.test(team.logo)).map((team) => [team.id, `https://midfield.mlbstatic.com/v1/team/${team.id}/spots/96`]))
    };
};

export const surface: LiveSurface | null = demoOn() ? demo() : null;
