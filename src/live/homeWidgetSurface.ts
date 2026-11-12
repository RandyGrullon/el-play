// Fuera del iPhone no hay widget de la pantalla de inicio (Metro usa homeWidgetSurface.ios.ts en el iPhone).
// En Android, expo-widgets 58 no deja abrir la app desde un widget: queda para cuando lo permita.
import type { HomeWidgetSurface } from '../lib/homeWidget';

export const homeWidgetSurface: HomeWidgetSurface | null = null;
