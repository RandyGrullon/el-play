// Caminos SVG de las gráficas PRO: línea, área, escalones y arcos (los mismos de la web). Funciones puras.

export type Point = [number, number];

// Un decimal basta para la pantalla y acorta el atributo d
const n = (value: number) => String(Math.round(value * 10) / 10);

/** Línea por los puntos; un hueco (null) corta la línea y la sigue en el próximo punto */
export const linePath = (points: readonly (Point | null)[]) => {
    let d = '';
    let pen = false;
    for (const point of points) {
        if (!point) {
            pen = false;
            continue;
        }
        d += `${d ? ' ' : ''}${pen ? 'L' : 'M'}${n(point[0])} ${n(point[1])}`;
        pen = true;
    }
    return d;
};

/** Área cerrada entre la línea y la altura `baseY` (p. ej. el 50 % de la probabilidad) */
export const areaPath = (points: readonly Point[], baseY: number) => {
    if (!points.length) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `M${n(first[0])} ${n(baseY)} ${points.map((point) => `L${n(point[0])} ${n(point[1])}`).join(' ')} L${n(last[0])} ${n(baseY)} Z`;
};

/**
 * Escalones del marcador: `values[i]` son las carreras acumuladas al terminar la entrada i + 1.
 * La línea sube al empezar la entrada en que se anotó y sigue plana hasta el final de esa entrada.
 */
export const stepPath = (values: readonly number[], x: (inning: number) => number, y: (runs: number) => number) => {
    if (!values.length) return '';
    let d = `M${n(x(0))} ${n(y(0))}`;
    values.forEach((runs, index) => {
        d += ` V${n(y(runs))} H${n(x(index + 1))}`;
    });
    return d;
};

/** Punto sobre un círculo; los grados cuentan desde las 12 en sentido del reloj */
export const polar = (cx: number, cy: number, r: number, degrees: number): Point => {
    const radians = ((degrees - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(radians), cy + r * Math.sin(radians)];
};

/** Arco de `from` a `to` grados (desde las 12, sentido del reloj); 360° se parte en dos para que se vea */
export const arcPath = (cx: number, cy: number, r: number, from: number, to: number): string => {
    const sweep = to - from;
    if (sweep <= 0) return '';
    if (sweep >= 360) return `${arcPath(cx, cy, r, from, from + 180)} ${arcPath(cx, cy, r, from + 180, from + 359.99).replace(/^M[^A]+/, '')}`.trim();
    const [x0, y0] = polar(cx, cy, r, from);
    const [x1, y1] = polar(cx, cy, r, to);
    return `M${n(x0)} ${n(y0)} A${n(r)} ${n(r)} 0 ${sweep > 180 ? 1 : 0} 1 ${n(x1)} ${n(y1)}`;
};

/** Largo de una línea por puntos (los huecos no suman): para dibujarla con strokeDashoffset */
export const polylineLength = (points: readonly (Point | null)[]) => {
    let total = 0;
    let previous: Point | null = null;
    for (const point of points) {
        if (point && previous) total += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
        previous = point;
    }
    return total;
};

/** Largo de los escalones de stepPath (subidas más tramos planos) */
export const stepLength = (values: readonly number[], x: (inning: number) => number, y: (runs: number) => number) => {
    let total = 0;
    let runs = 0;
    values.forEach((next, index) => {
        total += Math.abs(y(next) - y(runs)) + Math.abs(x(index + 1) - x(index));
        runs = next;
    });
    return total;
};

/** Largo de un arco de `sweep` grados */
export const arcLength = (r: number, sweep: number) => (Math.PI * r * Math.min(360, Math.max(0, sweep))) / 180;
