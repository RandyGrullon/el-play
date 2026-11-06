// Los avisos que corren en cualquier pantalla (como AlertsWatcher y FantasyWatcher de AppShell en la web): el resultado
// final y el juego sin hit con la app abierta y lo que suma tu equipo del Fantasy. Va en el layout raíz, dentro del
// navegador y de los proveedores, junto a useAlertTaps (tocar un aviso abre su juego).
import { useFantasyAlerts } from './useFantasyAlerts';
import { useGameAlerts } from './useGameAlerts';

export const useAlerts = () => {
    useGameAlerts();
    useFantasyAlerts();
};
