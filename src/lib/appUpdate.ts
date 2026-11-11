// Actualizar la app sin reinstalarla (expo-updates + EAS Update): lo que se decide sin el teléfono. Es el aviso «Hay una
// versión nueva de El Play» de la web (src/lib/appUpdate.ts y UpdateToast.tsx del proyecto el-play), pero aquí la
// versión nueva ya llega bajada: el botón solo recarga. El aviso y las búsquedas están en hooks/useAppUpdate.ts y
// components/UpdateBanner.tsx. Sin imports para probarlo con node (scripts/probar-jugadas.js).

/** Como mucho una búsqueda cada 15 minutos (al abrir la app y al volver a ella) */
export const UPDATE_CHECK_MS = 15 * 60 * 1000;

export interface UpdatesHost {
    /** Platform.OS */
    os: string;
    /** __DEV__: con el servidor de desarrollo el código ya llega solo */
    dev: boolean;
    /** Dentro de Expo Go */
    expoGo: boolean;
    /** El build trae el módulo nativo de expo-updates (los builds de antes de instalarlo no lo traen) */
    native: boolean;
}

/** Solo en un build de iPhone o Android que trae expo-updates; en la web, en desarrollo y en Expo Go no se hace nada */
export const canUseUpdates = ({ os, dev, expoGo, native }: UpdatesHost) => (os === 'ios' || os === 'android') && !dev && !expoGo && native;

/** La búsqueda más reciente (milisegundos): la de la app o la que hizo el teléfono al abrir (`checkAutomatically`) */
export const lastCheckOf = (...times: (number | null | undefined)[]): number | null => {
    const known = times.filter((time): time is number => typeof time === 'number' && Number.isFinite(time));
    return known.length ? Math.max(...known) : null;
};

export interface CheckState {
    now: number;
    lastCheck: number | null;
    /** Ya se está buscando o bajando (o el teléfono todavía está en lo suyo del arranque) */
    busy: boolean;
    /** Ya hay una versión nueva bajada: basta con el aviso */
    ready: boolean;
}

/**
 * ¿Buscar ahora? La primera vez y después cada 15 minutos; nunca dos a la vez ni con una ya bajada. Con la hora del
 * teléfono atrasada (now < lastCheck) también se busca: si no, no se volvería a buscar hasta que la hora la alcance.
 */
export const shouldCheck = ({ now, lastCheck, busy, ready }: CheckState) => !busy && !ready && (lastCheck === null || now < lastCheck || now - lastCheck >= UPDATE_CHECK_MS);

export interface BannerState {
    /** La versión nueva ya está bajada (useUpdates().isUpdatePending) */
    ready: boolean;
    /** Se cerró con la X (vuelve la próxima vez que se regrese a la app) */
    dismissed: boolean;
    /** Sale una animación de jugada en vivo o una repetición: el aviso espera a que termine */
    animating: boolean;
    /** Hay otro aviso corto en pantalla (lib/toast.ts): el de la versión nueva espera a que se vaya */
    toast: boolean;
}

/** El aviso «Hay una versión nueva» con el botón «Actualizar»; recargar solo pasa si se toca, nunca solo */
export const showUpdateBanner = ({ ready, dismissed, animating, toast }: BannerState) => ready && !dismissed && !animating && !toast;
