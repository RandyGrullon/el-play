// Quién corre y hasta dónde en un hit, para la animación: el bateador llega a su base, los que anotan cruzan home y
// los demás avanzan. Las bases ocupadas salen de la lectura anterior del juego (los corredores antes de la jugada) y
// cuántos anotan, del marcador (o de las impulsadas). Si no se sabe quién estaba en base, anotan los de las bases más
// altas. Lógica pura: se prueba en lib.test.ts.

export interface Bases {
    first: boolean;
    second: boolean;
    third: boolean;
}

/** Recorrido de un corredor: de la base `from` (0 = home, el bateador) a `to` (1-3, o 4 = anota) */
export interface RunnerPath {
    from: 0 | 1 | 2 | 3;
    to: 1 | 2 | 3 | 4;
    batter: boolean;
}

const BASES_BY_KIND = { single: 1, double: 2, triple: 3, hr: 4 } as const;

export const basesOf = (runners: { first: unknown; second: unknown; third: unknown } | null | undefined): Bases | null =>
    runners ? { first: !!runners.first, second: !!runners.second, third: !!runners.third } : null;

/**
 * Los recorridos de la jugada. `scored` = carreras que entraron (del marcador; si no, las impulsadas).
 * En el jonrón anotan todos; en los demás anotan los de adelante y el resto avanza tantas bases como el hit.
 */
export const runnerPaths = (kind: keyof typeof BASES_BY_KIND, bases: Bases | null, scored: number): RunnerPath[] => {
    const hit = BASES_BY_KIND[kind];
    const batter: RunnerPath = { from: 0, to: hit as RunnerPath['to'], batter: true };
    const onBase = (list: Bases) => ([3, 2, 1] as const).filter((base) => (base === 3 ? list.third : base === 2 ? list.second : list.first));
    // Las bases que había; si no se saben (o no cuadran con las carreras), las más altas que hagan falta
    const needed = kind === 'hr' ? Math.max(0, scored - 1) : Math.max(0, scored);
    let occupied: (1 | 2 | 3)[] = bases ? onBase(bases) : [];
    if (occupied.length < Math.min(3, needed)) occupied = ([3, 2, 1] as const).slice(0, Math.min(3, needed));

    if (kind === 'hr') return [...occupied.map((base) => ({ from: base, to: 4 as const, batter: false })), batter];

    const scoring = Math.min(occupied.length, needed);
    const paths: RunnerPath[] = [];
    let ceiling = 4; // la siguiente base libre por arriba (nadie se pasa al de adelante)
    occupied.forEach((base, index) => {
        if (index < scoring) {
            paths.push({ from: base, to: 4, batter: false });
            return;
        }
        // Avanza lo que el hit, sin llegar a home (no anotó), sin pasar al de adelante ni quedarse donde llega el bateador
        let to = Math.min(3, base + hit, ceiling - 1);
        if (to <= hit) to = Math.min(3, hit + 1);
        if (to >= ceiling) to = ceiling - 1;
        if (to < base) to = base;
        ceiling = to;
        paths.push({ from: base, to: to as RunnerPath['to'], batter: false });
    });
    return [...paths, batter];
};

/** Bases que recorre (incluida la de salida); home es 0 al salir y 4 al anotar */
export const legsOf = (path: Pick<RunnerPath, 'from' | 'to'>) => path.to - path.from;
