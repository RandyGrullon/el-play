// Logos de los equipos para la Live Activity y la notificación fija (solo en el teléfono: lo importan surface.ios.ts y
// surface.android.ts). Ninguna de las dos pinta SVG ni baja imágenes de internet: la app baja el PNG del logo de MLB
// (el «spot»: el logo en un círculo claro, como en el diseño) a la carpeta que comparte con ellas (widgetsDirectory)
// y les pasa la ruta. Se bajan una vez y quedan guardados; si algo falla, la vista pone la sigla.
// expo-file-system viene con el paquete expo (no se agregó nada al proyecto).
import { Directory, File } from 'expo-file-system';
import { widgetsDirectory } from 'expo-widgets';
import type { LogoTeam } from './types';

/** El id de MLB sale de la URL del logo de la API (…/team-logos/672.svg); las selecciones (banderas) no tienen */
const mlbId = (team: LogoTeam) => {
    const match = /\/team-logos\/(\d+)\.svg$/.exec(team.logo);
    return match && Number(match[1]) === team.id ? team.id : null;
};

const ready = new Map<number, string>();
const pending = new Map<number, Promise<string | null>>();

const download = async (id: number): Promise<string | null> => {
    if (!widgetsDirectory) return null;
    try {
        const folder = new Directory(widgetsDirectory, 'logos');
        if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
        const file = new File(folder, `equipo-${id}.png`);
        if (!file.exists || !file.size) {
            await File.downloadFileAsync(`https://midfield.mlbstatic.com/v1/team/${id}/spots/96`, file, { idempotent: true });
        }
        return file.exists && file.size ? file.uri : null;
    } catch {
        return null;
    }
};

/** Baja los que falten (a la vez, una sola vez por equipo) y devuelve id → file:// de los que ya están */
export const prepareLogos = async (teams: LogoTeam[]): Promise<Record<number, string>> => {
    await Promise.all(
        teams.map(async (team) => {
            const id = mlbId(team);
            if (id === null || ready.has(id)) return;
            let task = pending.get(id);
            if (!task) {
                task = download(id);
                pending.set(id, task);
            }
            const uri = await task;
            pending.delete(id);
            if (uri) ready.set(id, uri);
        })
    );
    return Object.fromEntries(teams.filter((team) => ready.has(team.id)).map((team) => [team.id, ready.get(team.id)!]));
};
