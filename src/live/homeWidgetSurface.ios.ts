// iPhone: le pasa al widget de la pantalla de inicio (HomeWidget.tsx) su línea de tiempo
import type { HomeWidgetSurface } from '../lib/homeWidget';
import { HomeWidget } from './HomeWidget';

export const homeWidgetSurface: HomeWidgetSurface | null = {
    update: (entries) => HomeWidget.updateTimeline(entries.map((entry) => ({ date: new Date(entry.at), props: entry.props })))
};
