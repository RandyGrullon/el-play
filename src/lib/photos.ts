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

export const photoSources = (personId: number | null | undefined, name: string, teamId: number | null | undefined, index: PhotoIndex | undefined, size: number): PhotoSource[] => {
    const list: PhotoSource[] = [];
    const team = teamId ? index?.teams[String(teamId)]?.[nameKey(name)] : undefined;
    if (team) list.push({ url: team, kind: 'team' });
    if (personId) {
        // Sin imagen por defecto (d_…): si MLB no tiene la foto responde 404 y se pasa a la siguiente
        list.push({ url: `${MLB}/r_max,c_pad,ar_1:1,w_${size},q_auto:best/v1/people/${personId}/headshot/silo/current`, kind: 'mlb' });
        list.push({ url: `${MLB}/c_fill,g_face,ar_1:1,w_${size},q_auto:best/v1/people/${personId}/headshot/milb/current`, kind: 'milb' });
    }
    return list;
};
