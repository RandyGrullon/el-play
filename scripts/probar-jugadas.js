// Casos de prueba de la lógica pura de las animaciones de jugada (los mismos de la web: lib.test.ts y runners.test.ts):
// el vuelo del jonrón a escala (src/lib/flight.ts), los corredores que anotan en un hit (src/lib/runners.ts) y lo que
// lleva cada jugada (src/lib/playEvents.ts, solo el Lite). La app no tiene corredor de pruebas: los .ts se pasan a
// JavaScript con el TypeScript del proyecto en una carpeta temporal y se prueban con node:assert.
//
// Uso:  node scripts/probar-jugadas.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

// La raíz de la app (donde está su package.json), se corra desde donde se corra
const ROOT = path.dirname(require.resolve('../package.json'));
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'el-play-jugadas-'));

// Pasa un archivo de src/lib a CommonJS (los `import type` se borran solos)
const compile = (name) => {
    const source = fs.readFileSync(path.join(ROOT, 'src', 'lib', `${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    fs.writeFileSync(path.join(OUT, `${name}.js`), outputText);
};
['flight', 'runners', 'playEvents'].forEach(compile);
// playEvents usa el modo PRO de la cuenta (React Native): aquí siempre Lite
fs.writeFileSync(path.join(OUT, 'pro.js'), 'exports.proActive = () => false;\n');

const { camera, flightMs, flightOf, gamedayToFeet, groundAt, heightAt, parkFor, wallAt, wallCrossing } = require(path.join(OUT, 'flight.js'));
const { basesOf, legsOf, runnerPaths } = require(path.join(OUT, 'runners.js'));
const { newPlayEvents } = require(path.join(OUT, 'playEvents.js'));

let failed = 0;
const it = (name, run) => {
    try {
        run();
        console.log(`  ok  ${name}`);
    } catch (error) {
        failed += 1;
        console.log(`  MAL ${name}\n      ${error.message.split('\n').join('\n      ')}`);
    }
};
// Lo de vitest que usan los casos: toBeCloseTo (decimales), toMatchObject (lo que se pide, sin lo demás)
const close = (actual, expected, digits = 2) => assert.ok(Math.abs(actual - expected) < 10 ** -digits / 2, `${actual} no está cerca de ${expected}`);
const partial = (actual, expected) => {
    Object.entries(expected).forEach(([key, value]) => {
        if (value && typeof value === 'object') partial(actual?.[key], value);
        else assert.deepStrictEqual(actual?.[key], value, `${key}: ${JSON.stringify(actual?.[key])} en vez de ${JSON.stringify(value)}`);
    });
};

console.log('vuelo del jonrón a escala');
const atBat = (hit) => ({ pitches: [{ hit: null }, { hit }] });

it('el parque: medidas de MLB en Quisqueya, Cibao y Tetelo; genérico (sin medidas a la vista) en los demás', () => {
    partial(parkFor('Estadio Quisqueya Juan Marichal'), { left: 335, center: 411, right: 335, known: true });
    partial(parkFor('Estadio Cibao'), { center: 385, known: true });
    partial(parkFor('Estadio Julian Javier'), { known: false });
    const park = parkFor('Estadio Quisqueya Juan Marichal');
    assert.strictEqual(wallAt(park, -45), 335);
    assert.strictEqual(wallAt(park, 0), 411);
    assert.ok(wallAt(park, 10) > park.rightCenter);
    assert.ok(wallAt(park, 10) < 411);
});

it('jonrones reales: hacia dónde salió, cuánto voló y qué tan alto', () => {
    assert.deepStrictEqual(gamedayToFeet(125.42, 198.27), { x: 0, y: 0 });
    // Agustín Ramírez, 453 pies por el left (851464)
    const left = flightOf(atBat({ ev: 109.1, la: 22, dist: 453, x: 38.6, y: 36.9, traj: 'fly_ball' }));
    assert.ok(left.deg < -15);
    close(Math.hypot(left.land.x, left.land.y), 453, 0);
    assert.ok(left.apex > 60);
    // Jesús Made, 408 por el right (851491); Carlos Jorge, 404 al center (851509)
    assert.ok(flightOf(atBat({ ev: 106.8, la: 31, dist: 408, x: 219.3, y: 79.2, traj: 'fly_ball' })).deg > 15);
    assert.ok(Math.abs(flightOf(atBat({ ev: 100.1, la: 28, dist: 404, x: 118.6, y: 27.4, traj: 'fly_ball' })).deg) < 5);
    // Sin distancia de MLB, la del punto marcado; sin punto, no hay vuelo (va la animación de siempre)
    close(flightOf(atBat({ ev: null, la: null, dist: null, x: 125.42, y: 38.27, traj: 'fly_ball' })).dist, 400, 0);
    assert.strictEqual(flightOf(atBat({ ev: 100, la: 30, dist: 400 })), null);
    assert.ok(wallCrossing(left, parkFor('Estadio Quisqueya Juan Marichal')) > 0.7);
});

it('la curva: sale del piso, sube hasta el pico al 58 % y vuelve a caer; el vuelo dura según la distancia', () => {
    const flight = { apex: 100 };
    assert.strictEqual(heightAt(flight, 0), 0);
    assert.strictEqual(heightAt(flight, 0.58), 100);
    close(heightAt(flight, 1), 0, 6);
    assert.strictEqual(groundAt(0), 0);
    assert.strictEqual(groundAt(1), 1);
    assert.ok(groundAt(0.5) > 0.5);
    assert.ok(flightMs({ dist: 453 }) > flightMs({ dist: 404 }));
});

it('la cámara: home abajo y la cerca del center más arriba que home', () => {
    const park = parkFor('Estadio Quisqueya Juan Marichal');
    const project = camera(park, 360, 250);
    const home = project(0, 0, 0);
    const center = project(0, 411, 0);
    const high = project(0, 200, 100);
    assert.ok(home.y > center.y);
    assert.ok(high.y < project(0, 200, 0).y);
    assert.ok(home.y <= 250);
});

console.log('corredores en un hit: quién anota y hasta dónde llega cada uno');
const empty = { first: false, second: false, third: false };

it('sencillo: sin nadie en base, uno en segunda que anota y bases llenas con una remolcada', () => {
    assert.deepStrictEqual(runnerPaths('single', empty, 0), [{ from: 0, to: 1, batter: true }]);
    assert.deepStrictEqual(runnerPaths('single', { ...empty, second: true }, 1), [
        { from: 2, to: 4, batter: false },
        { from: 0, to: 1, batter: true }
    ]);
    assert.deepStrictEqual(runnerPaths('single', { first: true, second: true, third: true }, 1), [
        { from: 3, to: 4, batter: false },
        { from: 2, to: 3, batter: false },
        { from: 1, to: 2, batter: false },
        { from: 0, to: 1, batter: true }
    ]);
});

it('doble: remolca 1 desde primera; remolca 2; triple con bases llenas remolca 3', () => {
    assert.deepStrictEqual(runnerPaths('double', { ...empty, first: true }, 1), [
        { from: 1, to: 4, batter: false },
        { from: 0, to: 2, batter: true }
    ]);
    assert.strictEqual(runnerPaths('double', { ...empty, first: true, second: true }, 2).filter((p) => p.to === 4).length, 2);
    // Doble sin remolcar con uno en primera: llega a tercera
    assert.deepStrictEqual(runnerPaths('double', { ...empty, first: true }, 0), [
        { from: 1, to: 3, batter: false },
        { from: 0, to: 2, batter: true }
    ]);
    assert.strictEqual(runnerPaths('triple', { first: true, second: true, third: true }, 3).filter((p) => p.to === 4).length, 3);
});

it('jonrón: anotan todos (con dos en base, 3 carreras); grand slam con las bases llenas', () => {
    assert.deepStrictEqual(runnerPaths('hr', { ...empty, first: true, third: true }, 3), [
        { from: 3, to: 4, batter: false },
        { from: 1, to: 4, batter: false },
        { from: 0, to: 4, batter: true }
    ]);
    assert.strictEqual(runnerPaths('hr', null, 4).length, 4);
    assert.deepStrictEqual(runnerPaths('hr', empty, 1), [{ from: 0, to: 4, batter: true }]);
});

it('sin saber quién estaba (o si no cuadra con las carreras): anotan los de las bases más altas', () => {
    assert.deepStrictEqual(runnerPaths('double', null, 2), [
        { from: 3, to: 4, batter: false },
        { from: 2, to: 4, batter: false },
        { from: 0, to: 2, batter: true }
    ]);
    assert.strictEqual(runnerPaths('single', { ...empty, first: true }, 2).filter((p) => p.to === 4).length, 2);
    assert.strictEqual(legsOf({ from: 1, to: 4 }), 3);
    assert.strictEqual(basesOf(null), null);
    assert.deepStrictEqual(basesOf({ first: { id: 1 }, second: null, third: null }), { first: true, second: false, third: false });
});

// En la app `runs` es { count, away, home } (la forma del PRO) en vez del { before, after } de la web
it('la jugada lleva el estadio, quién estaba en base y las carreras que entraron', () => {
    const team = (id) => ({ id, abbrev: `T${id}`, color: '#000', logo: '' });
    const turn = (i, extra) => ({ i, inning: 3, top: true, complete: true, scoring: false, batter: { id: i, name: `B${i}`, side: 'R' }, pitcher: { id: 99, name: 'P', hand: 'R' }, event: 'field_out', eventLabel: null, desc: '', rbi: 0, away: 1, home: 0, outs: 1, pitches: [], actions: [], ...extra });
    const prev = { gamePk: 1, state: 'live', away: team(1), home: team(2), venue: 'Estadio Quisqueya', runners: { first: { id: 5 }, second: null, third: { id: 6 } }, atBats: [turn(0, {}), turn(1, { complete: false })] };
    const next = { ...prev, runners: { first: null, second: null, third: null }, atBats: [turn(0, {}), turn(1, { event: 'double', rbi: 2, away: 3, scoring: true })] };
    const [event] = newPlayEvents(prev, next);
    partial(event, { kind: 'double', venue: 'Estadio Quisqueya', bases: { first: true, second: false, third: true }, runs: { count: 2, away: 3, home: 0 } });
    // De la segunda jugada nueva de la misma lectura ya no se sabe quién estaba en base
    const later = { ...next, atBats: [turn(0, {}), turn(1, { event: 'walk', away: 1 }), turn(2, { event: 'single', rbi: 1, away: 2 })] };
    const [single] = newPlayEvents(prev, later);
    partial(single, { kind: 'single', bases: null, runs: { count: 1, away: 2, home: 0 } });
});

fs.rmSync(OUT, { recursive: true, force: true });
if (failed) {
    console.log(`\n${failed} caso(s) fallaron`);
    process.exit(1);
}
console.log('\nTodo bien');
