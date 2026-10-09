// localStorage puede no existir o lanzar (modo privado, almacenamiento bloqueado): nunca romper la app por eso.

export const readStorage = <T>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
        return fallback;
    }
};

export const writeStorage = (key: string, value: unknown) => {
    try {
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* sin almacenamiento: la preferencia dura solo esta sesión */
    }
};

/** Valor guardado como texto plano (la versión anterior guardaba la liga así, sin JSON) */
export const readRawStorage = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

export const writeRawStorage = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* sin almacenamiento */
    }
};
