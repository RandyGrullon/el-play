// Fotos de peloteros, de la más LIDOM a la más genérica:
// 1) la del equipo con su uniforme (solo los equipos que la publican; el servidor las sirve en /api/v2/photos),
// 2) la oficial de MLB (recorte sin fondo), 3) la de ligas menores de MLB (MiLB: casi todo LIDOM la tiene),
// y si ninguna existe, las iniciales en el color del equipo.
import { useQuery } from '@tanstack/react-query';

export interface PhotoIndex {
    teams: Record<string, Record<string, string>>;
}

export type PhotoKind = 'team' | 'mlb' | 'milb';
export interface PhotoSource {
    url: string;
    kind: PhotoKind;
}

const MLB = 'https://img.mlbstatic.com/mlb-photos/image/upload';
const EMPTY: PhotoIndex = { teams: {} };

/** Misma clave que el servidor (server/services/teamPhotos.js); acepta "Apellido, Nombre" del box score */
export const nameKey = (name: string) => {
    const ordered = name.includes(',') ? name.split(',').reverse().join(' ') : name;
    return ordered
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
        .replace(/[^a-z]/g, '');
};

let indexPromise: Promise<PhotoIndex> | null = null;

/** Se pide una vez por sesión; si falla, la app sigue con las fotos de MLB y lo reintenta la próxima vez */
export const loadPhotoIndex = (): Promise<PhotoIndex> =>
    (indexPromise ||= fetch('/api/v2/photos', { headers: { Accept: 'application/json' } })
        .then((response) => (response.ok ? (response.json() as Promise<PhotoIndex>) : EMPTY))
        .catch(() => {
            indexPromise = null;
            return EMPTY;
        }));

export const usePhotoIndex = () =>
    useQuery({ queryKey: ['photos'], queryFn: loadPhotoIndex, staleTime: 6 * 60 * 60 * 1000, gcTime: Infinity, retry: false }).data;

// Fotos que MLB no tiene (respondió 404): se recuerdan una semana para no pedirlas de nuevo en cada pantalla
const MISS_KEY = 'el-play-photo-miss';
const MISS_MS = 7 * 24 * 60 * 60 * 1000;
let misses: Record<string, number> | null = null;

const loadMisses = () => {
    if (misses) return misses;
    try {
        const saved = JSON.parse(localStorage.getItem(MISS_KEY) || '{}') as Record<string, number>;
        const now = Date.now();
        misses = Object.fromEntries(Object.entries(saved).filter(([, at]) => now - at < MISS_MS));
    } catch {
        misses = {};
    }
    return misses;
};

export const rememberMiss = (kind: PhotoKind, personId: number | null | undefined) => {
    if (!personId || kind === 'team') return;
    const all = loadMisses();
    const key = `${kind}:${personId}`;
    if (all[key]) return;
    all[key] = Date.now();
    try {
        const recent = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 3000);
        localStorage.setItem(MISS_KEY, JSON.stringify(Object.fromEntries(recent)));
    } catch {
        /* sin almacenamiento: solo se recuerda mientras la app esté abierta */
    }
};

const missing = (kind: PhotoKind, personId: number) => !!loadMisses()[`${kind}:${personId}`];

export const photoSources = (personId: number | null | undefined, name: string, teamId: number | null | undefined, index: PhotoIndex | undefined, size: number): PhotoSource[] => {
    const list: PhotoSource[] = [];
    const team = teamId ? index?.teams[String(teamId)]?.[nameKey(name)] : undefined;
    if (team) list.push({ url: team, kind: 'team' });
    if (personId) {
        // Sin imagen por defecto (d_…): si MLB no tiene la foto responde 404 y se pasa a la siguiente
        if (!missing('mlb', personId)) list.push({ url: `${MLB}/r_max,c_pad,ar_1:1,w_${size},q_auto:best/v1/people/${personId}/headshot/silo/current`, kind: 'mlb' });
        if (!missing('milb', personId)) list.push({ url: `${MLB}/c_fill,g_face,ar_1:1,w_${size},q_auto:best/v1/people/${personId}/headshot/milb/current`, kind: 'milb' });
    }
    return list;
};
