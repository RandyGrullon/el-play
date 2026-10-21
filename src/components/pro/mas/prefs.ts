// Preferencias del modo PRO que se eligen en «Más»: densidad de las tablas, columnas que se ven primero y cómo seguir
// un juego en la pantalla de bloqueo. Se guardan en el teléfono (mismas claves que la web para densidad y columnas).
// Las tablas PRO las leen con useTableDensity / useProColumns; follow.ts, con getFollowMode.
import { useSyncExternalStore } from 'react';
import { getItem, setItem } from '../../../lib/storage';

const DENSITY_KEY = 'el-play-pro-density';
const COLUMNS_KEY = 'el-play-pro-columns';
const FOLLOW_KEY = 'el-play-follow-mode';

export type TableDensity = 'comfortable' | 'compact';
/** auto: empieza solo con los juegos de tu equipo; ask: te pregunta al empezar un juego con aviso; never: solo los avisos */
export type FollowMode = 'auto' | 'ask' | 'never';

export interface ProColumns {
    hitting: string[];
    pitching: string[];
}

/** Columnas que se pueden elegir (mismas claves que pro.short de los textos) */
export const PRO_COLUMN_CHOICES: ProColumns = {
    hitting: ['avg', 'obp', 'slg', 'ops', 'iso', 'babip', 'kPct', 'bbPct'],
    pitching: ['era', 'whip', 'k9', 'bb9', 'kBb', 'fip']
};

export const DEFAULT_PRO_COLUMNS: ProColumns = {
    hitting: ['avg', 'ops', 'iso', 'babip', 'kPct'],
    pitching: ['era', 'whip', 'fip']
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const read = (key: string) => {
    try {
        return getItem(key);
    } catch {
        return null;
    }
};

const write = (key: string, value: string) => {
    try {
        setItem(key, value);
    } catch {
        /* sin almacenamiento: dura mientras la app esté abierta */
    }
    emit();
};

// ---------------------------------------------------------------- densidad

export const getTableDensity = (): TableDensity => (read(DENSITY_KEY)?.includes('compact') ? 'compact' : 'comfortable');
export const setTableDensity = (density: TableDensity) => write(DENSITY_KEY, JSON.stringify(density));
/** Filas de 40 px (cómoda) o 32 px (compacta) en las tablas PRO */
export const useTableDensity = () => useSyncExternalStore(subscribe, getTableDensity, () => 'comfortable' as TableDensity);

// ---------------------------------------------------------------- columnas

// Lo guardado puede venir de otra versión: solo valen las claves conocidas y en su orden
const cleanColumns = (stored: Partial<ProColumns> | null): ProColumns => {
    const pick = (group: keyof ProColumns) => {
        const list = Array.isArray(stored?.[group]) ? (stored![group] as string[]) : DEFAULT_PRO_COLUMNS[group];
        return PRO_COLUMN_CHOICES[group].filter((key) => list.includes(key));
    };
    return { hitting: pick('hitting'), pitching: pick('pitching') };
};

// Mismo objeto mientras no cambie lo guardado (useSyncExternalStore compara por referencia)
let columnsRaw: string | null | undefined;
let columns: ProColumns = DEFAULT_PRO_COLUMNS;
export const getProColumns = (): ProColumns => {
    const raw = read(COLUMNS_KEY);
    if (raw !== columnsRaw) {
        columnsRaw = raw;
        try {
            columns = cleanColumns(raw ? (JSON.parse(raw) as Partial<ProColumns>) : null);
        } catch {
            columns = DEFAULT_PRO_COLUMNS;
        }
    }
    return columns;
};

export const toggleProColumn = (group: keyof ProColumns, key: string) => {
    const current = getProColumns();
    const list = current[group].includes(key) ? current[group].filter((item) => item !== key) : [...current[group], key];
    write(COLUMNS_KEY, JSON.stringify(cleanColumns({ ...current, [group]: list })));
};

/** Columnas de bateo y pitcheo que las tablas PRO muestran primero (las demás quedan a un toque) */
export const useProColumns = () => useSyncExternalStore(subscribe, getProColumns, () => DEFAULT_PRO_COLUMNS);

// ---------------------------------------------------------------- pantalla de bloqueo

export const getFollowMode = (): FollowMode => {
    const saved = read(FOLLOW_KEY);
    return saved === 'ask' || saved === 'never' ? saved : 'auto';
};
export const setFollowMode = (mode: FollowMode) => write(FOLLOW_KEY, mode);
export const useFollowMode = () => useSyncExternalStore(subscribe, getFollowMode, () => 'auto' as FollowMode);
