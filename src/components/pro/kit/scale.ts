// Escalas para las gráficas SVG del PRO (sin librerías): de un valor a píxeles y marcas «redondas» del eje.

export type Domain = [number, number];

export interface LinearScale {
    (value: number): number;
    domain: Domain;
    range: Domain;
    /** De píxeles al valor (para tocar la gráfica) */
    invert: (px: number) => number;
}

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Escala lineal; con un dominio sin ancho (todo igual) cae en el centro del rango */
export const linearScale = (domain: Domain, range: Domain): LinearScale => {
    const [d0, d1] = domain;
    const [r0, r1] = range;
    const span = d1 - d0;
    const scale = ((value: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))) as LinearScale;
    scale.domain = domain;
    scale.range = range;
    scale.invert = (px: number) => (r1 === r0 ? d0 : d0 + ((px - r0) / (r1 - r0)) * span);
    return scale;
};

/** Mínimo y máximo de una lista (ignora nulos y NaN); `fallback` si no queda ninguno */
export const extent = (values: readonly (number | null | undefined)[], fallback: Domain = [0, 1]): Domain => {
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
        if (value === null || value === undefined || !Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    return min === Infinity ? fallback : [min, max];
};

/** Paso «redondo» (1, 2, 5 × 10ⁿ, el más cercano, como d3) para unas `count` marcas en `span` */
export const niceStep = (span: number, count = 4) => {
    if (!(span > 0) || count < 1) return 1;
    const raw = span / count;
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    const error = raw / power;
    const nice = error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.sqrt(2) ? 2 : 1;
    return nice * power;
};

// Quita el ruido de coma flotante (0.30000000000000004 → 0.3)
const tidy = (value: number) => Number(value.toPrecision(12));

/** Dominio ampliado a múltiplos del paso: [3, 47] → [0, 50] */
export const niceDomain = (min: number, max: number, count = 4): Domain => {
    if (min === max) return min === 0 ? [0, 1] : [Math.min(0, min), Math.max(0, max)];
    const step = niceStep(max - min, count);
    return [tidy(Math.floor(min / step) * step), tidy(Math.ceil(max / step) * step)];
};

/** Marcas redondas entre min y max (incluidos si caen en el paso) */
export const niceTicks = (min: number, max: number, count = 4): number[] => {
    if (min === max) return [min];
    const step = niceStep(max - min, count);
    const ticks: number[] = [];
    for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) ticks.push(tidy(value));
    return ticks;
};
