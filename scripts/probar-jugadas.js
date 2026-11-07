// Casos de prueba de la lógica pura de las animaciones de jugada (los mismos de la web: lib.test.ts, runners.test.ts y
// playEventsNew.test.ts): el vuelo del jonrón a escala (src/lib/flight.ts), los corredores que anotan en un hit o una
// base por bolas (src/lib/runners.ts), lo que lleva cada jugada (src/lib/playEvents.ts) y, de paso, los juegos
// suspendidos en espera (src/lib/baseball.ts y src/lib/polling.ts) y los avisos de los juegos y del Fantasy
// (src/lib/gameAlerts.ts: qué se programa, qué se avisa y que no se repita). La app no tiene corredor de pruebas: los .ts se
// pasan a JavaScript con el TypeScript del proyecto en una carpeta temporal y se prueban con node:assert.
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
['flight', 'runners', 'playEvents', 'baseball', 'polling', 'gameAlerts', 'field', 'spray', 'swipeBack'].forEach(compile);
// playEvents usa el modo PRO de la cuenta (React Native): aquí siempre Lite
fs.writeFileSync(path.join(OUT, 'pro.js'), 'exports.proActive = () => false;\n');

const { camera, flightMs, flightOf, gamedayToFeet, groundAt, heightAt, parkFor, wallAt, wallCrossing } = require(path.join(OUT, 'flight.js'));
const { basesOf, legsOf, runnerPaths, walkPaths } = require(path.join(OUT, 'runners.js'));
const { forMode, leadChange, newPlayEvents } = require(path.join(OUT, 'playEvents.js'));
const { delayOf, isOnHold, isRainDelay } = require(path.join(OUT, 'baseball.js'));
const { batterBox, fieldModel } = require(path.join(OUT, 'field.js'));
const { gameInterval } = require(path.join(OUT, 'polling.js'));
const alertsLib = require(path.join(OUT, 'gameAlerts.js'));

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
    // Una base por bolas en la misma lectura sabe quién estaba en base, pero del hit siguiente ya no se sabe
    const later = { ...next, atBats: [turn(0, {}), turn(1, { event: 'walk', away: 1 }), turn(2, { event: 'single', rbi: 1, away: 2 })] };
    const [walk, single] = newPlayEvents(prev, later);
    partial(walk, { kind: 'walk', walk: 'bb', bases: { first: true, second: false, third: true } });
    partial(single, { kind: 'single', bases: null, runs: { count: 1, away: 2, home: 0 } });
});

console.log('base por bolas, robo, relevo, cambio en el marcador y dejado en el terreno (Lite)');
// Nombres de prueba, como en la web (playEventsNew.test.ts)
const club = (id, abbrev, runs = 0, isWinner = false) => ({ id, abbrev, name: abbrev, logo: '', color: '#0069e0', record: null, teamName: abbrev, runs, hits: 0, errors: 0, lob: 0, isWinner });
const ab = (i, event, extra = {}) => ({
    i,
    inning: 1,
    top: true,
    complete: event !== null,
    scoring: false,
    batter: { id: 100 + i, name: `Bateador ${i}`, side: 'R' },
    pitcher: { id: 99, name: 'Lanzador Uno', hand: 'R' },
    event,
    eventLabel: null,
    desc: '',
    rbi: 0,
    away: 0,
    home: 0,
    outs: 0,
    pitches: [],
    actions: [],
    ...extra
});
const juego = (atBats, extra = {}) => ({
    gamePk: 1,
    state: 'live',
    scheduledInnings: 9,
    atBats,
    inning: { n: 1, ordinal: '1st', isTop: true, state: 'Top' },
    runners: { first: null, second: null, third: null },
    away: club(672, 'LIC'),
    home: club(671, 'ESC'),
    box: {
        away: { batters: [{ id: 501, name: 'Corredor' }], pitchers: [] },
        home: {
            batters: [],
            pitchers: [
                { id: 601, name: 'Abridor', ip: '5.1', k: 6, np: 88 },
                { id: 602, name: 'Relevista', ip: '0.0', k: 0, np: 0 }
            ]
        }
    },
    ...extra
});

it('base por bolas: el bateador a primera y solo avanzan los forzados', () => {
    const batter = { from: 0, to: 1, batter: true };
    assert.deepStrictEqual(walkPaths(null), [batter]);
    assert.deepStrictEqual(walkPaths({ first: false, second: true, third: true }), [batter]);
    assert.deepStrictEqual(walkPaths({ first: true, second: false, third: true }), [{ from: 1, to: 2, batter: false }, batter]);
    assert.deepStrictEqual(walkPaths({ first: true, second: true, third: false }), [{ from: 2, to: 3, batter: false }, { from: 1, to: 2, batter: false }, batter]);
    assert.deepStrictEqual(walkPaths({ first: true, second: true, third: true }), [{ from: 3, to: 4, batter: false }, { from: 2, to: 3, batter: false }, { from: 1, to: 2, batter: false }, batter]);
});

it('base por bolas, intencional o golpeado: del equipo al bate y con quién estaba en base', () => {
    const prev = juego([ab(0, 'field_out')], { runners: { first: { id: 1, name: 'Uno' }, second: null, third: null } });
    const next = juego([ab(0, 'field_out'), ab(1, 'walk'), ab(2, 'intent_walk'), ab(3, 'hit_by_pitch')]);
    const events = newPlayEvents(prev, next).filter((event) => event.kind === 'walk');
    assert.deepStrictEqual(
        events.map((event) => [event.walk, event.team.abbrev]),
        [
            ['bb', 'LIC'],
            ['ibb', 'LIC'],
            ['hbp', 'LIC']
        ]
    );
    assert.deepStrictEqual(events[0].bases, { first: true, second: false, third: false });
    assert.strictEqual(events[1].bases, null);
});

it('robo: lo celebra el corredor; atrapado: la defensa; y van antes del resultado del turno', () => {
    const prev = juego([ab(0, null)]);
    const next = juego([
        ab(0, 'single', {
            actions: [
                { event: 'stolen_base_2b', desc: 'Juan Corredor steals (1) 2nd base.' },
                { event: 'caught_stealing_3b', desc: 'Juan Corredor caught stealing 3rd base.' }
            ]
        }),
        ab(1, null, { actions: [{ event: 'stolen_base_home', desc: 'Juan Corredor steals (2) home.' }] })
    ]);
    const events = newPlayEvents(prev, next);
    assert.deepStrictEqual(
        events.map((event) => [event.kind, event.team.abbrev, event.steal ? event.steal.base : null, event.steal ? event.steal.caught : null]),
        [
            ['steal', 'LIC', 2, false],
            ['steal', 'ESC', 3, true],
            ['single', 'LIC', null, null],
            ['steal', 'LIC', 4, false]
        ]
    );
    assert.strictEqual(events[0].steal.runner, 'Juan Corredor');
});

it('cambio de lanzador: del equipo que defiende, con la línea del que sale y su id del box', () => {
    const prev = juego([ab(0, 'field_out')]);
    const next = juego([ab(0, 'field_out'), ab(1, null, { pitcher: { id: 602, name: 'Juan Relevista', hand: 'R' }, actions: [{ event: 'pitching_substitution', desc: 'Pitching Change: Juan Relevista replaces Pedro Abridor.' }] })]);
    const [event] = newPlayEvents(prev, next);
    partial(event, { kind: 'pitchingChange', team: { abbrev: 'ESC' }, change: { in: { id: 602, name: 'Juan Relevista' }, out: { id: 601, name: 'Pedro Abridor' }, line: { ip: '5.1', k: 6, np: 88 } } });
    // En el PRO, igual que antes (sin la línea)
    const [pro] = newPlayEvents(prev, next, { pro: true });
    partial(pro, { kind: 'pitchingChange', change: { in: { id: 602 }, out: { id: 601 } } });
    assert.strictEqual(pro.change.line, undefined);
});

it('cambio en el marcador: abre, se va arriba, le da la vuelta, empata o nada', () => {
    assert.deepStrictEqual(leadChange({ away: 0, home: 0 }, { away: 1, home: 0 }), { side: 'away', lead: 'open' });
    assert.deepStrictEqual(leadChange({ away: 2, home: 2 }, { away: 2, home: 3 }), { side: 'home', lead: 'ahead' });
    assert.deepStrictEqual(leadChange({ away: 3, home: 1 }, { away: 3, home: 5 }), { side: 'home', lead: 'comeback' });
    assert.deepStrictEqual(leadChange({ away: 3, home: 1 }, { away: 3, home: 3 }), { side: 'home', lead: 'tie' });
    assert.strictEqual(leadChange({ away: 3, home: 1 }, { away: 4, home: 1 }), null);
    assert.strictEqual(leadChange({ away: 3, home: 0 }, { away: 3, home: 2 }), null);
    assert.strictEqual(leadChange({ away: 1, home: 1 }, { away: 2, home: 2 }), null);
    // Sale después de la jugada que lo hizo, con el equipo que anotó y cómo estaba antes
    const prev = juego([ab(0, 'field_out')], { away: club(672, 'LIC', 1), home: club(671, 'ESC', 2) });
    const next = juego([ab(0, 'field_out'), ab(1, 'home_run', { away: 3, home: 2 })], { away: club(672, 'LIC', 3), home: club(671, 'ESC', 2) });
    const events = newPlayEvents(prev, next);
    assert.deepStrictEqual(
        events.map((event) => event.kind),
        ['hr', 'lead']
    );
    partial(events[1], { team: { abbrev: 'LIC' }, lead: { change: 'comeback', before: { away: 1, home: 2 } } });
    // El PRO no lo tiene
    assert.ok(!newPlayEvents(prev, next, { pro: true }).some((event) => event.kind === 'lead'));
});

it('dejado en el terreno: el local gana en la baja de la última entrada (o en extra); si no, victoria normal', () => {
    const final = (lastTop, inning, scheduledInnings = 9, pro = false) => {
        const prev = juego([ab(0, null, { top: lastTop, inning })], { away: club(672, 'LIC', 3), home: club(671, 'ESC', 3) });
        const next = juego([ab(0, lastTop ? 'field_out' : 'single', { top: lastTop, inning })], { state: 'final', scheduledInnings, away: club(672, 'LIC', 3), home: club(671, 'ESC', 4, true) });
        return newPlayEvents(prev, next, { pro }).filter((event) => event.kind === 'win' || event.kind === 'walkoff');
    };
    assert.deepStrictEqual(
        final(false, 9).map((event) => event.kind),
        ['walkoff']
    );
    partial(final(false, 11)[0], { kind: 'walkoff', atBat: { i: 0 } });
    assert.deepStrictEqual(
        final(false, 7, 7).map((event) => event.kind),
        ['walkoff']
    );
    assert.deepStrictEqual(
        final(true, 9).map((event) => event.kind),
        ['win']
    );
    assert.deepStrictEqual(
        final(false, 6).map((event) => event.kind),
        ['win']
    );
    // El PRO sigue con la victoria de siempre
    partial(final(false, 9, 9, true)[0], { kind: 'win', atBat: null });
});

console.log('reto del ABS: revisando y resultado entre dos lecturas (los mismos casos de la web)');
{
    const lanz = (extra = {}) => ({ n: 1, x: 0, z: 2.5, top: 3.4, bot: 1.6, r: 'strike', code: 'C', call: 'Called Strike', type: null, typeDesc: null, mph: null, spin: null, zone: 5, b: 0, s: 1, ...extra });
    const turno = (pitches, extra = {}) => ({ ...ab(44, null, { top: false, pitches, batter: { id: 1, name: 'Bateador Prueba', side: 'R' }, pitcher: { id: 2, name: 'Lanzador Prueba', hand: 'R' } }), ...extra });
    const partida = (atBats, abs = null) => juego(atBats, { inning: { n: 6, ordinal: '6th', isTop: false, state: 'Bottom' }, away: club(668, 'TOR'), home: club(672, 'LIC'), abs });
    const bola = lanz({ r: 'ball', code: 'B', call: 'Ball' });
    const revisando = { ...lanz({ r: 'ball', code: 'B', call: 'Ball' }), abs: { inProgress: true, overturned: false, teamId: 672, by: null } };
    const cambiado = { ...lanz(), abs: { inProgress: false, overturned: true, teamId: 672, by: { id: 1, name: 'Bateador Prueba' } } };
    const retos = { away: { won: 1, lost: 0, remaining: 2 }, home: { won: 2, lost: 2, remaining: 1 }, challenging: null };

    it('aparece «revisando» con la decisión del umpire y después el resultado (una vez cada uno)', () => {
        const antes = partida([turno([lanz(), bola])]);
        const durante = partida([turno([lanz(), revisando])], { ...retos, challenging: 672 });
        const despues = partida([turno([lanz(), cambiado], { complete: true, event: 'strikeout' })], retos);
        const [primero] = newPlayEvents(antes, durante);
        partial(primero, { kind: 'abs', key: 'abs-44-1-checking', team: { abbrev: 'LIC' }, abs: { phase: 'checking', call: 'ball', original: 'ball' } });
        const eventos = newPlayEvents(durante, despues);
        // El reto va antes que la jugada del turno (el ponche que salió del reto)
        assert.deepStrictEqual(
            eventos.map((event) => event.kind),
            ['abs', 'k']
        );
        partial(eventos[0], { key: 'abs-44-1-result', abs: { phase: 'result', overturned: true, call: 'strike', original: 'ball', by: 'batter', remaining: 1 } });
        assert.deepStrictEqual(newPlayEvents(despues, despues), []);
        assert.deepStrictEqual(newPlayEvents(durante, durante), []);
        // En el PRO también (lo pinta la animación del Lite), una vez y antes del ponche
        assert.deepStrictEqual(
            newPlayEvents(durante, despues, { pro: true }).map((event) => event.kind),
            ['abs', 'k']
        );
    });

    it('si ya llegó resuelto (la revisión dura menos que una lectura) sale directo el resultado', () => {
        const confirmado = { ...lanz({ r: 'ball', code: 'B', call: 'Ball' }), abs: { inProgress: false, overturned: false, teamId: 668, by: { id: 2, name: 'Lanzador Prueba' } } };
        const [evento] = newPlayEvents(partida([turno([lanz()])]), partida([turno([lanz(), confirmado])], retos));
        partial(evento, { kind: 'abs', team: { abbrev: 'TOR' }, abs: { phase: 'result', overturned: false, call: 'ball', original: 'ball', by: 'pitcher', remaining: 2 } });
    });

    it('en «inteligentes» sale aunque el juego no sea de tu equipo', () => {
        const eventos = newPlayEvents(partida([turno([bola])]), partida([turno([revisando])]));
        assert.deepStrictEqual(
            forMode(eventos, 'smart', null, [668, 672]).map((event) => event.kind),
            ['abs']
        );
    });
}

console.log('juegos suspendidos');

it('suspendido: con fecha nueva se espera como programado; sin ella, en espera como un pospuesto', () => {
    const NOW = Date.parse('2026-11-05T20:00:00Z');
    const MIN = 60000;
    const at = (minutes) => new Date(NOW + minutes * MIN).toISOString();
    const partido = (minutes, detailedState) => ({ state: 'preview', detailedState, date: at(minutes) });
    assert.strictEqual(gameInterval(partido(45, 'Suspended'), NOW), 3 * MIN);
    assert.ok(gameInterval(partido(-10, 'Suspended: Rain'), NOW) < 15000);
    assert.strictEqual(gameInterval(partido(-120, 'Suspended: Rain'), NOW), 10 * MIN);
    assert.strictEqual(isOnHold({ detailedState: 'Suspended', date: at(60) }, NOW), false);
    assert.strictEqual(isOnHold({ detailedState: 'Suspended', date: at(-180) }, NOW), true);
    assert.strictEqual(isOnHold({ detailedState: 'Postponed', date: at(60) }, NOW), true);
    assert.strictEqual(isOnHold({ detailedState: 'Scheduled', date: at(-180) }, NOW), false);
});

console.log('juegos detenidos (lluvia, tormenta…)');

it('detenido: el motivo de «Delayed: …» y si es el inicio; lo demás no es demora', () => {
    assert.deepStrictEqual(delayOf('Delayed: Rain'), { reason: 'rain', start: false });
    assert.deepStrictEqual(delayOf('Delayed Start: Rain'), { reason: 'rain', start: true });
    assert.deepStrictEqual(delayOf('Delayed: Wet Grounds'), { reason: 'wet', start: false });
    assert.deepStrictEqual(delayOf('Delayed Start: Wet Grounds'), { reason: 'wet', start: true });
    assert.deepStrictEqual(delayOf('Delayed: Lightning'), { reason: 'lightning', start: false });
    assert.deepStrictEqual(delayOf('Delayed: Weather'), { reason: 'weather', start: false });
    assert.deepStrictEqual(delayOf('Delayed: Fog'), { reason: 'fog', start: false });
    assert.deepStrictEqual(delayOf('Delayed: Power'), { reason: 'power', start: false });
    // Cualquier otra demora es «other», con o sin motivo
    assert.deepStrictEqual(delayOf('Delayed: Injury'), { reason: 'other', start: false });
    assert.deepStrictEqual(delayOf('Delayed'), { reason: 'other', start: false });
    assert.deepStrictEqual(delayOf('Delayed Start'), { reason: 'other', start: true });
    ['In Progress', 'Suspended: Rain', 'Postponed', 'Final', 'Scheduled', '', null, undefined].forEach((state) => assert.strictEqual(delayOf(state), null, String(state)));
    // La lluvia en pantalla: solo con lluvia o terreno mojado
    assert.strictEqual(isRainDelay(delayOf('Delayed: Rain')), true);
    assert.strictEqual(isRainDelay(delayOf('Delayed Start: Wet Grounds')), true);
    assert.strictEqual(isRainDelay(delayOf('Delayed: Lightning')), false);
    assert.strictEqual(isRainDelay(null), false);
});

console.log('el terreno: quién va en cada lugar');
{
    const persona = (id, name) => ({ id, name });
    const visitante = { id: 9001, name: 'Equipo Uno' };
    const local = { id: 9002, name: 'Equipo Dos' };
    const defensa = {
        pitcher: persona(12345601, 'Pelotero Uno'),
        catcher: persona(12345602, 'Pelotero Dos'),
        first: persona(12345603, 'Pelotero Tres'),
        second: persona(12345604, 'Pelotero Cuatro'),
        third: persona(12345605, 'Pelotero Cinco'),
        shortstop: persona(12345606, 'Pelotero Seis'),
        left: persona(12345607, 'Pelotero Siete'),
        center: persona(12345608, 'Pelotero Ocho'),
        right: persona(12345609, 'Pelotero Nueve')
    };
    const juego = (extra) => ({
        away: visitante,
        home: local,
        inning: { n: 7, isTop: true, state: 'Top' },
        runners: { first: null, second: null, third: null },
        matchup: { batter: { id: 87654321, name: 'Bateador Uno', side: 'L' }, pitcher: { id: 12345601, name: 'Pelotero Uno' }, onDeck: null },
        ...extra
    });
    const campo = {
        defenseTeamId: 9002,
        offenseTeamId: 9001,
        defense: defensa,
        offense: { batter: persona(87654321, 'Bateador Uno'), onDeck: persona(87654322, 'Bateador Dos'), inHole: persona(87654323, 'Bateador Tres'), first: persona(87654324, 'Corredor Uno'), second: null, third: persona(87654325, 'Corredor Tres') }
    };

    it('con `field`: los nueve en orden (lanzador, receptor, cuadro, jardines), los corredores, el bateador y el que espera', () => {
        const modelo = fieldModel(juego({ field: campo }));
        assert.strictEqual(modelo.source, 'field');
        assert.strictEqual(modelo.hasDefense, true);
        assert.strictEqual(modelo.between, false);
        assert.deepStrictEqual(modelo.faces.map((face) => face.key), ['pitcher', 'catcher', 'first', 'second', 'shortstop', 'third', 'left', 'center', 'right', 'runner-first', 'runner-third', 'batter', 'onDeck']);
        assert.deepStrictEqual(modelo.faces.map((face) => face.order), modelo.faces.map((_, index) => index));
        assert.deepStrictEqual(modelo.faces.slice(0, 9).map((face) => face.tag), ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF']);
        // Aros: la defensa en el color del que fildea; corredores, bateador y el que espera en el del que batea
        assert.ok(modelo.faces.filter((face) => face.role === 'defense').every((face) => face.teamId === 9002));
        assert.ok(modelo.faces.filter((face) => face.role !== 'defense').every((face) => face.teamId === 9001));
        const corredor = modelo.faces.find((face) => face.key === 'runner-first');
        partial(corredor, { role: 'runner', tag: '1B', size: 'sm', person: { id: 87654324, name: 'Corredor Uno' } });
        // Al lado de su base, no encima (la base se sigue viendo)
        assert.ok(Math.hypot(corredor.x - 68.4, corredor.y - 71.6) > 5);
        // Zurdo: del lado de primera (a la derecha del plato); el que espera, más chico, en el círculo del visitante (tercera)
        const bateador = modelo.faces.find((face) => face.key === 'batter');
        assert.ok(bateador.x > 50);
        partial(modelo.faces.find((face) => face.key === 'onDeck'), { size: 'xs', tag: 'onDeck', person: { id: 87654322 } });
        assert.ok(modelo.faces.find((face) => face.key === 'onDeck').x < 50);
        // Todas las caras dentro del dibujo (100 × 112)
        assert.ok(modelo.faces.every((face) => face.x > 0 && face.x < 100 && face.y > 0 && face.y < 112));
    });

    it('la caja de bateo: derecho (o sin saber) a la izquierda del plato, zurdo a la derecha, ambidiestro contra la mano del lanzador', () => {
        assert.strictEqual(batterBox('R'), 'left');
        assert.strictEqual(batterBox(null), 'left');
        assert.strictEqual(batterBox('L'), 'right');
        assert.strictEqual(batterBox('S', 'R'), 'right');
        assert.strictEqual(batterBox('S', 'L'), 'left');
        // Si el bateador no es el del duelo, no se sabe de qué lado batea: la caja de los derechos
        const otro = fieldModel(juego({ field: { ...campo, offense: { ...campo.offense, batter: persona(11223344, 'Bateador Otro') } } }));
        assert.ok(otro.faces.find((face) => face.key === 'batter').x < 50);
    });

    it('entre entradas: sin corredores, con la defensa que sale y el que abre; sin defensa lo dice', () => {
        const pausa = fieldModel(juego({ inning: { n: 7, isTop: true, state: 'Middle' }, field: { ...campo, defenseTeamId: 9001, offenseTeamId: 9002 } }));
        assert.strictEqual(pausa.between, true);
        assert.strictEqual(pausa.defenseTeamId, 9001);
        assert.ok(!pausa.faces.some((face) => face.role === 'runner'));
        assert.ok(pausa.faces.some((face) => face.key === 'batter'));
        const vacio = fieldModel(juego({ field: { defenseTeamId: 9002, offenseTeamId: 9001, defense: {}, offense: {} } }));
        assert.strictEqual(vacio.hasDefense, false);
        assert.deepStrictEqual(vacio.faces, []);
    });

    it('sin `field`: los extras PRO; sin ellos, los corredores y el duelo del juego; nombres vacíos no salen', () => {
        const conPro = fieldModel(juego({}), { defense: { ...defensa, teamId: 9002 }, offense: { batter: persona(87654321, 'Bateador Uno'), onDeck: null, first: null, second: persona(87654326, 'Corredor Dos'), third: null, teamId: 9001 } });
        assert.strictEqual(conPro.source, 'pro');
        assert.strictEqual(conPro.defenseTeamId, 9002);
        assert.deepStrictEqual(conPro.faces.filter((face) => face.role === 'runner').map((face) => face.key), ['runner-second']);
        const solo = fieldModel(juego({ field: undefined, runners: { first: persona(87654324, 'Corredor Uno'), second: null, third: null } }));
        assert.strictEqual(solo.source, 'none');
        assert.strictEqual(solo.hasDefense, false);
        // En la alta batea el visitante: la defensa es el de casa
        assert.strictEqual(solo.defenseTeamId, 9002);
        assert.strictEqual(solo.offenseTeamId, 9001);
        assert.deepStrictEqual(solo.faces.map((face) => face.key), ['runner-first', 'batter']);
        const sinNombre = fieldModel(juego({ field: { ...campo, defense: { ...defensa, pitcher: persona(12345601, '') } } }));
        assert.ok(!sinNombre.faces.some((face) => face.key === 'pitcher'));
    });
}

console.log('avisos de los juegos y del Fantasy');

{
    const { DEFAULT_ALERT_KINDS, readAlertKinds, scheduledKinds, sameKinds, bellExpired, planTeamAlerts, watchedFromSchedule, watchedFromDetail, liveAlerts, liveAlertText, watchInterval, pruneNotified, fantasyStep, fantasyText } = alertsLib;
    const NOW = Date.parse('2026-11-05T23:00:00Z');
    const MIN = 60000;
    const HOUR = 60 * MIN;
    const at = (ms) => new Date(NOW + ms).toISOString();
    const ON = DEFAULT_ALERT_KINDS;
    const off = (...kinds) => ({ ...ON, ...Object.fromEntries(kinds.map((kind) => [kind, false])) });
    // Equipos y juegos de mentira (ids descarados)
    const equipo = (id, abbrev, extra = {}) => ({ id, abbrev, name: `Equipo ${abbrev}`, flag: null, score: null, hits: null, isWinner: false, ...extra });
    const juego = (gamePk, extra = {}) => ({ gamePk, state: 'preview', detailedState: 'Scheduled', date: at(2 * HOUR), live: null, away: equipo(11111, 'AAA'), home: equipo(22222, 'BBB'), ...extra });
    const visto = (gamePk, extra = {}) => watchedFromSchedule(juego(gamePk, extra));
    const opts = (extra = {}) => ({ bell: [], favoriteTeamId: null, kinds: ON, now: NOW, notified: () => false, ...extra });
    const t = (key, options = {}) => `${key}${JSON.stringify(options)}`;

    it('tipos de aviso: todos encendidos de fábrica; lo guardado manda y lo que no es sí/no se ignora', () => {
        assert.deepStrictEqual(readAlertKinds(undefined), ON);
        assert.deepStrictEqual(readAlertKinds('roto'), ON);
        assert.deepStrictEqual(readAlertKinds({ soon: false, final: 'no', extra: true }), off('soon'));
    });

    it('programados: 10 min antes solo con campana; playball con campana o tu equipo; nada si ya pasó o está apagado', () => {
        const start = NOW + HOUR;
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: false, kinds: ON, start, now: NOW }), ['soon', 'start']);
        assert.deepStrictEqual(scheduledKinds({ bell: false, favorite: true, kinds: ON, start, now: NOW }), ['start']);
        assert.deepStrictEqual(scheduledKinds({ bell: false, favorite: false, kinds: ON, start, now: NOW }), []);
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: false, kinds: off('soon'), start, now: NOW }), ['start']);
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: true, kinds: off('start'), start, now: NOW }), ['soon']);
        // A 5 minutos ya no da tiempo para el de 10 minutos antes
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: false, kinds: ON, start: NOW + 5 * MIN, now: NOW }), ['start']);
        assert.deepStrictEqual(scheduledKinds({ bell: true, favorite: false, kinds: ON, start: NOW - MIN, now: NOW }), []);
        assert.ok(sameKinds(['start', 'soon'], ['soon', 'start']));
        assert.ok(!sameKinds(undefined, []));
        assert.ok(!sameKinds(['soon'], ['soon', 'start']));
    });

    it('campana guardada: se queda hasta 12 h después de la hora (para el final); se va si el teléfono perdió sus avisos', () => {
        const pending = new Set(['a1']);
        assert.strictEqual(bellExpired({ ids: ['a1', 'a2'], date: at(HOUR) }, pending, NOW), false);
        assert.strictEqual(bellExpired({ ids: ['zz'], date: at(HOUR) }, pending, NOW), true);
        // Con todo apagado no hay avisos programados, pero la campana sigue
        assert.strictEqual(bellExpired({ ids: [], date: at(HOUR) }, pending, NOW), false);
        // Ya sonó el playball: sigue para el final
        assert.strictEqual(bellExpired({ ids: ['zz'], date: at(-3 * HOUR) }, pending, NOW), false);
        assert.strictEqual(bellExpired({ ids: ['zz'], date: at(-13 * HOUR) }, pending, NOW), true);
        // Formato viejo sin hora
        assert.strictEqual(bellExpired({ ids: ['a1'], date: null }, pending, NOW), false);
        assert.strictEqual(bellExpired({ ids: ['zz'], date: null }, pending, NOW), true);
    });

    it('playball de tu equipo: programa los suyos sin campana, reprograma si cambió la hora y quita lo que ya no va', () => {
        const fav = 11111;
        const games = [juego(900001), juego(900002, { away: equipo(33333, 'CCC') }), juego(900003, { date: at(5 * HOUR) }), juego(900004, { detailedState: 'Postponed' }), juego(900005, { startTimeTBD: true }), juego(900006, { state: 'live' })];
        let plan = planTeamAlerts({ games, current: {}, bell: [900003], favoriteTeamId: fav, kinds: ON, now: NOW });
        assert.deepStrictEqual(plan.schedule.map((game) => game.gamePk), [900001]);
        assert.deepStrictEqual(plan.cancel, []);
        const current = {
            900001: { ids: ['x'], date: at(HOUR), teamId: fav }, // cambió la hora
            900003: { ids: ['y'], date: at(5 * HOUR), teamId: fav }, // ahora tiene campana
            900004: { ids: ['z'], date: at(2 * HOUR), teamId: fav }, // pospuesto
            900099: { ids: ['w'], date: at(3 * HOUR), teamId: fav }, // no está en el calendario guardado: se deja
            900098: { ids: ['v'], date: at(-HOUR), teamId: fav } // ya sonó
        };
        plan = planTeamAlerts({ games, current, bell: [900003], favoriteTeamId: fav, kinds: ON, now: NOW });
        assert.deepStrictEqual(plan.cancel.sort(), ['900001', '900003', '900004', '900098']);
        assert.deepStrictEqual(plan.schedule.map((game) => game.gamePk), [900001]);
        // Otro favorito o el playball apagado: se quitan todos
        assert.strictEqual(planTeamAlerts({ games, current, bell: [], favoriteTeamId: 44444, kinds: ON, now: NOW }).cancel.length, 5);
        plan = planTeamAlerts({ games, current, bell: [], favoriteTeamId: fav, kinds: off('start'), now: NOW });
        assert.strictEqual(plan.cancel.length, 5);
        assert.deepStrictEqual(plan.schedule, []);
    });

    it('final: con campana o tu equipo, hasta 6 h después de la hora, una sola vez', () => {
        const final = visto(900010, { state: 'final', date: at(-3 * HOUR), away: equipo(11111, 'AAA', { score: 5, isWinner: true }), home: equipo(22222, 'BBB', { score: 3 }) });
        assert.deepStrictEqual(liveAlerts([final], opts()), []);
        assert.deepStrictEqual(
            liveAlerts([final], opts({ bell: [900010] })).map((alert) => alert.key),
            ['final-900010']
        );
        assert.strictEqual(liveAlerts([final], opts({ favoriteTeamId: 22222 })).length, 1);
        assert.strictEqual(liveAlerts([final], opts({ bell: [900010], kinds: off('final') })).length, 0);
        assert.strictEqual(liveAlerts([final], opts({ bell: [900010], notified: (key) => key === 'final-900010' })).length, 0);
        // El mismo juego dos veces en la misma lectura (calendario y detalle): un aviso
        assert.strictEqual(liveAlerts([final, final], opts({ bell: [900010] })).length, 1);
        assert.strictEqual(liveAlerts([{ ...final, date: at(-7 * HOUR) }], opts({ bell: [900010] })).length, 0);
        // Sin ganador todavía (empate suspendido): no
        assert.strictEqual(liveAlerts([{ ...final, away: { ...final.away, isWinner: false } }], opts({ bell: [900010] })).length, 0);
        const text = liveAlertText(liveAlerts([final], opts({ bell: [900010] }))[0], t, (team) => team.name);
        assert.strictEqual(text.title, 'notifications.final{"away":"AAA","awayRuns":5,"home":"BBB","homeRuns":3}');
        assert.strictEqual(text.body, 'notifications.finalBody{"team":"Equipo AAA"}');
    });

    it('juego sin hit: desde la 6.ª, por el equipo que no ha conectado, con el detalle o el calendario', () => {
        const live = (inning, awayHits, homeHits) => visto(900020, { state: 'live', live: { inning }, away: equipo(11111, 'AAA', { hits: awayHits }), home: equipo(22222, 'BBB', { hits: homeHits }) });
        assert.strictEqual(liveAlerts([live(5, 0, 3)], opts({ favoriteTeamId: 11111 })).length, 0);
        const found = liveAlerts([live(6, 0, 3)], opts({ favoriteTeamId: 11111 }));
        assert.deepStrictEqual(
            found.map((alert) => alert.key),
            ['noHitter-900020-11111']
        );
        partial(found[0], { batting: { abbrev: 'AAA' }, pitching: { abbrev: 'BBB' } });
        assert.strictEqual(liveAlertText(found[0], t, (team) => team.name).body, 'notifications.noHitterBody{"team":"Equipo AAA","count":6}');
        // Los dos sin hit: dos avisos; sin el dato de hits, ninguno
        assert.strictEqual(liveAlerts([live(7, 0, 0)], opts({ bell: [900020] })).length, 2);
        assert.strictEqual(liveAlerts([live(7, null, null)], opts({ bell: [900020] })).length, 0);
        assert.strictEqual(liveAlerts([live(7, 0, 0)], opts({ bell: [900020], kinds: off('noHitter') })).length, 0);
        // El detalle (runs/hits/inning.n) da lo mismo
        const detail = watchedFromDetail({ gamePk: 900020, state: 'live', date: at(-2 * HOUR), inning: { n: 8 }, away: { id: 11111, name: 'Equipo AAA', abbrev: 'AAA', runs: 0, hits: 0, isWinner: false }, home: { id: 22222, name: 'Equipo BBB', abbrev: 'BBB', runs: 2, hits: 6, isWinner: false } });
        assert.deepStrictEqual(
            liveAlerts([detail], opts({ bell: [900020] })).map((alert) => alert.key),
            ['noHitter-900020-11111']
        );
        assert.strictEqual(watchedFromDetail({ gamePk: null }), null);
    });

    it('vigilancia: cada minuto con un juego tuyo en vivo; antes, se despierta un minuto antes (máx. 10 min); sin juegos tuyos, nada', () => {
        const mine = (game) => game.away.id === 11111;
        assert.strictEqual(watchInterval(undefined, mine, NOW), false);
        assert.strictEqual(watchInterval([visto(1, { state: 'live' })], mine, NOW), MIN);
        assert.strictEqual(watchInterval([visto(1, { state: 'live', away: equipo(55555, 'EEE') })], mine, NOW), false);
        assert.strictEqual(watchInterval([visto(1, { date: at(5 * MIN) })], mine, NOW), 4 * MIN);
        assert.strictEqual(watchInterval([visto(1, { date: at(3 * HOUR) })], mine, NOW), 10 * MIN);
        assert.strictEqual(watchInterval([visto(1, { date: at(-20 * MIN) })], mine, NOW), MIN);
        assert.strictEqual(watchInterval([visto(1, { state: 'final' })], mine, NOW), false);
    });

    it('lo ya avisado se recuerda 3 días; lo raro se descarta', () => {
        assert.deepStrictEqual(pruneNotified({ 'final-1': NOW - HOUR, 'final-2': NOW - 4 * 24 * HOUR, roto: 'x' }, NOW), { 'final-1': NOW - HOUR });
        assert.deepStrictEqual(pruneNotified(null, NOW), {});
    });

    it('Fantasy: la primera lectura solo marca; después, lo que sumó cada pelotero (1 punto o más)', () => {
        let points = { 101: 2, 102: 0, 103: 4 };
        const scoreOf = (id) => (id in points ? points[id] : null);
        let step = fantasyStep(null, '2026-11-05', [101, 102, 103, 104], scoreOf);
        assert.deepStrictEqual(step.gains, []);
        points = { 101: 5, 102: 0.5, 103: 4 };
        step = fantasyStep(step.seen, '2026-11-05', [101, 102, 103, 104], scoreOf);
        assert.deepStrictEqual(step.gains, [{ id: 101, gain: 3 }]);
        // Otro día: vuelve a empezar
        points = { 101: 9 };
        assert.deepStrictEqual(fantasyStep(step.seen, '2026-11-06', [101], scoreOf).gains, []);
        assert.strictEqual(
            fantasyText([{ name: 'Pelotero Uno', gain: 3.04 }, { name: 'Pelotero Dos', gain: 1.5 }], 15.5, t),
            'fantasyAlerts.gain{"name":"Pelotero Uno","pts":3} · fantasyAlerts.gain{"name":"Pelotero Dos","pts":1.5} · fantasyAlerts.total{"pts":15.5}'
        );
    });
}

// ---------------------------------------------------------------- pantallas: estadísticas, posiciones, líderes y ficha
// Lo que se pasó de la web (lib/teamStats.ts, share/subjects.ts, PlayerSheet…). Va en su propia carpeta, con lo de React
// Query y la API de mentira para que se pueda cargar en Node.
const SCREENS = path.join(OUT, 'pantallas');
const compileTo = (rel) => {
    const source = fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8');
    const { outputText } = ts.transpileModule(source, { fileName: rel, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } });
    const target = path.join(SCREENS, rel.replace(/\.tsx?$/, '.js'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, outputText);
    return target;
};
const stub = (rel, code) => {
    const target = path.join(SCREENS, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, code);
};
stub('node_modules/@tanstack/react-query/index.js', 'exports.useQuery = () => ({});\n');
stub('lib/api.js', "exports.ApiError = class ApiError extends Error {};\nexports.getApiJson = async () => ({});\nexports.networkErrorCode = async () => 'network';\n");
stub('lib/config.js', "exports.API_BASE = '';\n");
compileTo('lib/advanced.ts');
const teamStats = require(compileTo('lib/teamStats.ts'));

console.log('estadísticas de los equipos');

// Equipos de mentira: siglas y cifras inventadas
const equipo = (id, abbrev, hitting, pitching) => ({ id, abbrev, name: `Equipo ${abbrev}`, color: '#123456', logo: '', hitting, pitching });
const EQUIPOS = [
    equipo(9001, 'AAA', { avg: '.250', ops: '.700', r: 100, hr: 10, h: 200, g: 30, sb: 5 }, { era: '3.50', whip: '1.30', r: 90, k: 200, w: 18, l: 12, sv: 8 }),
    equipo(9002, 'BBB', { avg: '.270', ops: '.760', r: 120, hr: 14, h: 230, g: 30, sb: 9 }, { era: '4.10', whip: '1.42', r: 130, k: 180, w: 14, l: 16, sv: 5 }),
    equipo(9003, 'CCC', null, null)
];

it('orden de los equipos: el mejor arriba, menos es mejor en la EFE y sin dato al final', () => {
    const { rankTeams, teamSort } = teamStats;
    assert.deepStrictEqual(rankTeams(EQUIPOS, teamSort('bat', 'avg')).map((item) => item.team.abbrev), ['BBB', 'AAA', 'CCC']);
    assert.deepStrictEqual(rankTeams(EQUIPOS, teamSort('pitch', 'era')).map((item) => item.team.abbrev), ['AAA', 'BBB', 'CCC']);
    assert.strictEqual(rankTeams(EQUIPOS, teamSort('pitch', 'era'))[2].value, null);
    // Una clave que no existe cae en la primera del grupo
    assert.strictEqual(teamSort('bat', 'nada').key, 'avg');
    assert.strictEqual(teamSort('pitch', 'nada').key, 'era');
});

it('promedio de la liga: el de los equipos con dato; las tarjetas de los mejores existen en el orden', () => {
    const { leagueAverage, teamSort, TEAM_HIGHLIGHTS, TEAM_SORTS } = teamStats;
    close(leagueAverage(EQUIPOS, teamSort('bat', 'avg')), 0.26, 3);
    close(leagueAverage(EQUIPOS, teamSort('pitch', 'whip')), 1.36, 3);
    assert.strictEqual(leagueAverage([EQUIPOS[2]], teamSort('bat', 'avg')), null);
    assert.strictEqual(teamSort('bat', 'avg').show(0.26), '.260');
    for (const group of ['bat', 'pitch']) TEAM_HIGHLIGHTS[group].forEach((key) => assert.ok(TEAM_SORTS[group].some((sort) => sort.key === key), key));
});

it('récord y diferencia de carreras con los juegos para el récord pitagórico', () => {
    const { recordOf } = teamStats;
    partial(recordOf(EQUIPOS[0]), { w: 18, l: 12, games: 30, scored: 100, allowed: 90, diff: 10 });
    partial(recordOf(EQUIPOS[1]), { diff: -10 });
    partial(recordOf(EQUIPOS[2]), { w: 0, l: 0, games: 0, scored: null, diff: null });
    const { pythagorean } = require(path.join(SCREENS, 'lib', 'advanced.js'));
    partial(pythagorean(100, 90, 30), { wins: 16, losses: 14 });
});

console.log('imágenes para compartir');

['lib/format.ts', 'lib/teams.ts', 'lib/nationalTeams.ts', 'lib/baseball.ts'].forEach(compileTo);
const subjects = require(compileTo('components/share/subjects.ts'));
// Las claves salen tal cual (con sus valores), para ver qué texto se pidió
const tKeys = (key, options = {}) => {
    const { defaultValue, ...vars } = options; // eslint-disable-line no-unused-vars
    return Object.keys(vars).length ? `${key}${JSON.stringify(vars)}` : key;
};

it('la tabla para la imagen: rango, sigla, nombre, récord y juegos detrás de cada equipo', () => {
    const fila = (rank, id, abbrev, wins, losses, gamesBack) => ({ rank, team: { id, name: `Equipo ${abbrev}`, shortName: abbrev, abbrev, logo: '', color: '#654321', flag: null }, wins, losses, gamesBack });
    const post = subjects.standingsPost([fila(1, 9001, 'AAA', 20, 10, '-'), fila(2, 9002, 'BBB', 18, 12, '2.0')], 'Posiciones', 'Regular · 2099-00', 'Liga de Prueba', 'es');
    partial(post, { kind: 'standings', title: 'Posiciones', subtitle: 'Regular · 2099-00', league: 'Liga de Prueba' });
    assert.deepStrictEqual(post.rows[1], { rank: 2, abbrev: 'BBB', name: 'Equipo BBB', color: '#654321', wins: 18, losses: 12, gamesBack: '2.0' });
});

it('el líder para la imagen: la categoría en singular si es 1, su puesto y la línea de abajo', () => {
    const lider = (value, extra) => ({ rank: 1, id: 12345678, name: 'Pelotero Ficticio', teamId: 9001, teamName: 'Equipo AAA', teamAbbrev: 'AAA', logo: null, color: null, value, extra });
    const uno = subjects.playerFromLeader(lider(1, { h: 3, ab: 10 }), 'homeRuns', '2099-00', 'Liga de Prueba', tKeys);
    partial(uno, { kind: 'player', personId: 12345678, value: '1', label: 'leaders.one.homeRuns', color: '#2563eb', detail: 'share.hitsInAtBats{"h":3,"ab":10}' });
    assert.strictEqual(uno.context, 'share.rankIn{"rank":1,"league":"Liga de Prueba","season":"2099-00"}');
    const varios = subjects.playerFromLeader(lider(12, { ip: '46.1', k: 34 }), 'strikeouts', '2099-00', 'Liga de Prueba', tKeys);
    partial(varios, { value: '12', label: 'leaders.strikeouts', detail: 'share.innings{"ip":"46.1","k":34}' });
    assert.strictEqual(subjects.playerFromLeader(lider(null, {}), 'wins', '2099-00', 'Liga', tKeys).value, '—');
});

console.log('aviso de sin conexión');

it('la edad de lo que se ve: minutos enteros desde el último dato; sin datos o de hace menos de un minuto, sin edad', () => {
    const { offlineAge } = require(path.join(SCREENS, 'lib', 'format.js'));
    const ahora = Date.UTC(2099, 0, 15, 20, 0, 0);
    assert.strictEqual(offlineAge(0, ahora), null);
    assert.strictEqual(offlineAge(ahora - 59999, ahora), null);
    assert.strictEqual(offlineAge(ahora - 60000, ahora), 1);
    assert.strictEqual(offlineAge(ahora - 7.5 * 60000, ahora), 7);
    assert.strictEqual(offlineAge(ahora - 3 * 3600000, ahora), 180);
    // Reloj del teléfono atrasado respecto al dato: no hay edades negativas
    assert.strictEqual(offlineAge(ahora + 5000, ahora), null);
});

console.log('ficha del pelotero');

const { careerTotal } = require(compileTo('lib/stats.ts'));

it('total de la carrera: sumas de todas las temporadas (EFE, AVG y OPS de las sumas); con una sola, no hay', () => {
    const bateo = (g, ab, h, d, t, hr, rbi, bb, hbp, sf) => ({ hitting: { g, ab, h, d, t, hr, rbi, bb, hbp, sf } });
    const bateador = { role: 'B', career: [bateo(40, 150, 45, 8, 1, 5, 20, 15, 2, 1), bateo(30, 100, 25, 4, 0, 2, 10, 10, 1, 0)] };
    // 70 J, 70 H en 250 VB (.280), 7 HR, 30 CI; OBP 98/279, SLG 105/250
    assert.deepStrictEqual(careerTotal(bateador), [70, '.280', 7, 30, ((98 / 279 + 105 / 250).toFixed(3)).replace(/^0/, '')]);
    const pitcheo = (g, w, l, outs, er, k) => ({ pitching: { g, w, l, outs, er, k } });
    const lanzador = { role: 'P', career: [pitcheo(10, 3, 2, 100, 12, 40), pitcheo(8, 1, 1, 44, 6, 20)] };
    // 144 outs = 48.0 IP; 18 CL → 3.38
    assert.deepStrictEqual(careerTotal(lanzador), [18, '4-3', '3.38', '48.0', 60]);
    assert.deepStrictEqual(careerTotal({ role: 'P', career: [pitcheo(5, 1, 0, 31, 0, 9), pitcheo(2, 0, 0, 0, 0, 0)] }).slice(2, 4), ['0.00', '10.1']);
    assert.strictEqual(careerTotal({ role: 'B', career: [bateo(1, 3, 1, 0, 0, 0, 0, 0, 0, 0)] }), null);
});

console.log('enlaces a equipos y peloteros');

const links = require(compileTo('lib/links.ts'));

it('id para abrir una página: solo enteros positivos (0, null, NaN o texto vacío no abren nada)', () => {
    const { linkId } = links;
    assert.strictEqual(linkId(12345678), 12345678);
    assert.strictEqual(linkId('9001'), 9001);
    [0, -3, 1.5, null, undefined, NaN, '', 'abc'].forEach((value) => assert.strictEqual(linkId(value), null, String(value)));
});

it('ya en esa página: la ruta del equipo o de la ficha con ese id (sin la barra final ni la consulta)', () => {
    const { isOnPage } = links;
    assert.strictEqual(isOnPage('/equipo/9001', 'equipo', 9001), true);
    assert.strictEqual(isOnPage('/equipo/9001/', 'equipo', 9001), true);
    assert.strictEqual(isOnPage('/jugador/12345678?name=Pelotero', 'jugador', 12345678), true);
    assert.strictEqual(isOnPage('/equipo/9001', 'equipo', 9002), false);
    assert.strictEqual(isOnPage('/jugador/9001', 'equipo', 9001), false);
    assert.strictEqual(isOnPage('/equipo/90011', 'equipo', 9001), false);
    assert.strictEqual(isOnPage('/juego/777', 'jugador', null), false);
    assert.strictEqual(isOnPage(null, 'equipo', 9001), false);
});

it('parámetros de la ficha: nombre y equipo si se tienen, temporada solo si no es la actual', () => {
    const { playerParams } = links;
    assert.deepStrictEqual(playerParams({ id: 12345678, name: 'Pelotero Uno', teamId: 9001 }, 2099), { id: 12345678, name: 'Pelotero Uno', teamId: 9001, season: 2099 });
    assert.deepStrictEqual(playerParams({ id: 12345678 }), { id: 12345678 });
    assert.deepStrictEqual(playerParams({ id: 12345678, name: '', teamId: 0 }, null), { id: 12345678 });
});

it('línea de decisiones: ganador y salvado; sin salvamento, el perdedor; sin ganador, nada', () => {
    const { decisionParts } = links;
    const uno = { id: 12345678, name: 'Pelotero Uno' };
    const dos = { id: 87654321, name: 'Pelotero Dos' };
    const tres = { id: 11223344, name: 'Pelotero Tres' };
    assert.deepStrictEqual(decisionParts({ winner: uno, loser: dos, save: tres }).map((part) => [part.key, part.person.id]), [['win', 12345678], ['save', 11223344]]);
    assert.deepStrictEqual(decisionParts({ winner: uno, loser: dos, save: null }).map((part) => part.key), ['win', 'loss']);
    assert.deepStrictEqual(decisionParts({ winner: uno, loser: null, save: null }).map((part) => part.key), ['win']);
    assert.deepStrictEqual(decisionParts({ winner: null, loser: dos, save: null }), []);
    assert.deepStrictEqual(decisionParts(null), []);
});

it('nombres dentro de una jugada: cada nombre entero de la lista es un pedazo con su pelotero', () => {
    const { nameSegments } = links;
    const uno = { id: 12345678, name: 'Pelotero Uno', teamId: 9001 };
    const dos = { id: 87654321, name: 'Pelotero Dos' };
    const texto = 'Pelotero Uno batea sencillo. Pelotero Dos anota.';
    const partes = nameSegments(texto, [uno, dos]);
    assert.strictEqual(partes.map((part) => part.text).join(''), texto);
    assert.deepStrictEqual(partes.map((part) => part.person && part.person.id), [12345678, null, 87654321, null]);
    // El punto final pegado al nombre vale; dentro de otra palabra, no
    assert.deepStrictEqual(nameSegments('Ponche a Pelotero Uno.', [uno]).map((part) => part.text), ['Ponche a ', 'Pelotero Uno', '.']);
    assert.deepStrictEqual(nameSegments('Pelotero Unotres sale out', [uno]).map((part) => part.person), [null]);
    // Si dos se pisan, el más largo; repetidos e ids malos no cuentan
    const largo = { id: 11223344, name: 'Pelotero Uno Jr.' };
    assert.deepStrictEqual(nameSegments('Pelotero Uno Jr. se embasa', [uno, largo, { id: 0, name: 'se embasa' }, uno]).map((part) => part.person && part.person.id), [11223344, null]);
    assert.deepStrictEqual(nameSegments('', [uno]), []);
    assert.deepStrictEqual(nameSegments('Sin nombres aquí', []).map((part) => part.text), ['Sin nombres aquí']);
});

it('los del juego para enlazar: los cuatro grupos del box de cada lado con su equipo', () => {
    const { gamePeople } = links;
    const lado = (base) => ({ batters: [{ id: base + 1, name: 'Bateador' }], pitchers: [{ id: base + 2, name: 'Lanzador' }], bench: [{ id: base + 3, name: 'Banca' }] });
    const gente = gamePeople({ away: { id: 9001 }, home: { id: 9002 }, box: { away: lado(100), home: lado(200) } });
    assert.deepStrictEqual(gente.map((person) => [person.id, person.teamId]), [[101, 9001], [102, 9001], [103, 9001], [201, 9002], [202, 9002], [203, 9002]]);
    assert.deepStrictEqual(gamePeople({ away: { id: 9001 }, home: { id: 9002 }, box: null }), []);
});

it('las otras formas del nombre: cada una enlaza a la misma persona, sin repetir ni vacías', () => {
    const { nameForms, nameSegments } = links;
    const formas = nameForms([{ id: 12345678, name: 'Pelotero Uno', teamId: 9001 }], () => ['P. Uno', 'Pelotero Uno', '', null]);
    assert.deepStrictEqual(formas.map((person) => [person.id, person.name, person.teamId]), [[12345678, 'Pelotero Uno', 9001], [12345678, 'P. Uno', 9001]]);
    const partes = nameSegments('P. Uno roba la segunda; Pelotero Uno anota', formas);
    assert.deepStrictEqual(partes.filter((part) => part.person).map((part) => [part.text, part.person.id]), [['P. Uno', 12345678], ['Pelotero Uno', 12345678]]);
});


// ---------------------------------------------------------------- mapa de batazos (src/lib/spray.ts)
console.log('mapa de batazos');
const spray = require(path.join(OUT, 'spray.js'));
const turno = (i, event, hit, extra = {}) => ({
    i, inning: 1 + Math.floor(i / 6), top: i % 2 === 0, complete: true, scoring: false, event, eventLabel: extra.label ?? null, desc: '', rbi: 0, away: 0, home: 0, outs: 0, actions: [],
    batter: { id: extra.batter ?? 12345678, name: extra.name ?? 'Pelotero Uno', side: extra.side ?? 'R' },
    pitcher: { id: 87654321, name: 'Lanzador Dos', hand: extra.hand ?? 'R' },
    pitches: [{ r: 'ball', hit: null }, { r: 'inplay', type: 'FF', typeDesc: 'Four-Seam Fastball', mph: 95, hit }]
});
const parque = parkFor('Estadio Quisqueya Juan Marichal');
// x/y del cuadro de Gameday: home 125.42,198.27; 2.5 pies por unidad
const JUEGO = [
    turno(0, 'single', { ev: 101, la: 12, dist: 250, x: 80, y: 120, traj: 'line_drive', hard: 'hard' }),
    turno(1, 'field_out', { ev: 80, la: -5, dist: 90, x: 140, y: 170, traj: 'ground_ball' }, { side: 'L', batter: 23456789, name: 'Pelotero Tres' }),
    turno(2, 'home_run', { ev: 106, la: 28, dist: 420, x: 125, y: 40, traj: 'fly_ball' }),
    turno(3, 'double', { ev: null, la: null, dist: null, x: 190, y: 100, traj: null }, { side: 'S', hand: 'L', batter: 34567890, name: 'Pelotero Cuatro' }),
    turno(4, 'field_error', { ev: 70, la: 60, dist: 120, x: 118, y: 160, traj: 'popup' })
];

it('clase del resultado por el evento', () => {
    assert.deepStrictEqual(['single', 'double', 'triple', 'home_run', 'field_error', 'field_out', 'sac_fly', null].map(spray.resultOf), ['single', 'double', 'triple', 'hr', 'error', 'out', 'out', 'out']);
    assert.strictEqual(spray.trajOf(null, 40), 'fly');
    assert.strictEqual(spray.trajOf('bunt_popup', null), 'popup');
    assert.strictEqual(spray.trajOf(null, null, 'Groundout'), 'ground');
    assert.strictEqual(spray.trajOf(null, null, null), null);
});

it('batazos y filtros: equipo, resultado, trayectoria y bateador se combinan', () => {
    const balls = spray.sprayBalls(JUEGO, parque);
    assert.deepStrictEqual(balls.map((b) => b.order), [0, 1, 2, 3, 4]);
    const f = (extra) => spray.filterBalls(balls, { ...spray.NO_FILTERS, ...extra }).map((b) => b.key);
    assert.deepStrictEqual(f({ team: 'away' }), [0, 2, 4]);
    assert.deepStrictEqual(f({ result: 'hits' }), [0, 2, 3]);
    assert.deepStrictEqual(f({ result: 'hr' }), [2]);
    assert.deepStrictEqual(f({ result: 'outs' }), [1]);
    assert.deepStrictEqual(f({ traj: 'ground' }), [1]);
    assert.deepStrictEqual(f({ team: 'away', result: 'hits', batter: 12345678 }), [0, 2]);
    // El jonrón cae detrás de la cerca
    const hr = balls[2];
    assert.ok(Math.hypot(hr.land.x, hr.land.y) > wallAt(parque, hr.deg));
});

it('vuelo desde arriba: el rodado recto con piques; la curva crece con el ángulo', () => {
    const land = { x: 0, y: 300 };
    const rodado = spray.flightPath(land, 'ground', -5);
    assert.strictEqual(rodado.bulge, 0);
    assert.strictEqual(rodado.bounces.length, 3);
    const linea = spray.flightPath(land, 'line', 15);
    const elevado = spray.flightPath(land, 'fly', 32);
    assert.ok(linea.bulge > 0 && elevado.bulge > linea.bulge);
    close(spray.pathLength(rodado), 300, 0);
    // Al right la panza va hacia el centro (x menor que la recta)
    const derecha = spray.flightPath({ x: 200, y: 200 }, 'fly', 30);
    assert.ok(derecha.control.x < 100);
});

it('zona del batazo y halado/centro/contrario por el lado del bateador', () => {
    assert.strictEqual(spray.zoneOf({ x: 0, y: 100 }), 'IF');
    assert.strictEqual(spray.zoneOf({ x: -200, y: 200 }), 'LF');
    assert.strictEqual(spray.zoneOf({ x: 0, y: 350 }), 'CF');
    assert.strictEqual(spray.zoneOf({ x: 120, y: 280 }), 'RCF');
    assert.strictEqual(spray.dirOf(-30, 'R', 'R'), 'pull');
    assert.strictEqual(spray.dirOf(-30, 'L', 'R'), 'oppo');
    assert.strictEqual(spray.dirOf(5, 'L', 'R'), 'center');
    // Ambidiestro contra zurdo batea a la derecha: halar es al left
    assert.strictEqual(spray.dirOf(-30, 'S', 'L'), 'pull');
    assert.strictEqual(spray.dirOf(-30, null, 'L'), null);
});

it('cifras de los batazos: fuertes entre los medidos, promedios y el más largo', () => {
    const s = spray.sprayStats(spray.sprayBalls(JUEGO, parque));
    partial(s, { balls: 5, hits: 3, hr: 1, tracked: 4 });
    close(s.hardHit, 0.5);
    close(s.avgEv, (101 + 80 + 106 + 70) / 4);
    assert.strictEqual(s.longest.key, 2);
    close(s.traj.ground, 0.25);
    const zonas = spray.zoneStats(spray.sprayBalls(JUEGO, parque));
    assert.strictEqual(Object.values(zonas).reduce((sum, z) => sum + z.count, 0), 5);
    assert.strictEqual(spray.sprayStats([]).hardHit, null);
});

it('tiempos: la entrada cabe en 2,5 s y «Repetir» en 20 s', () => {
    const { dur, step } = spray.entryTiming(80);
    assert.ok(dur + step * 79 <= 2500.001);
    assert.strictEqual(spray.replayStep(10), 700);
    assert.ok(spray.replayStep(80) * 80 <= 20000);
});

it('mapa de calor: la celda más caliente vale 1 y queda junto a las caídas', () => {
    const grid = spray.heatGrid([{ x: 0, y: 300 }, { x: 5, y: 305 }], { minX: -300, maxX: 300, minY: 0, maxY: 450 });
    const hot = grid.reduce((a, b) => (b.v > a.v ? b : a));
    assert.strictEqual(hot.v, 1);
    assert.ok(Math.hypot(hot.x, hot.y - 300) < 20);
    assert.deepStrictEqual(spray.heatGrid([], { minX: 0, maxX: 1, minY: 0, maxY: 1 }), []);
    assert.notStrictEqual(spray.heatColor(0), spray.heatColor(1));
});

// ---------------------------------------------------------------- deslizar para volver (src/lib/swipeBack.ts)
console.log('deslizar para volver');
const swipe = require(path.join(OUT, 'swipeBack.js'));
// Un teléfono de 400 puntos de ancho: la raya del 35 % queda en 140
const ANCHO = 400;

it('la pantalla sigue al dedo: nunca a la izquierda ni más allá del ancho', () => {
    assert.strictEqual(swipe.swipeOffset(100, ANCHO), 100);
    assert.strictEqual(swipe.swipeOffset(-30, ANCHO), 0);
    assert.strictEqual(swipe.swipeOffset(520, ANCHO), ANCHO);
    // Sin medir todavía no se mueve
    assert.strictEqual(swipe.swipeOffset(100, 0), 0);
    close(swipe.swipeProgress(100, ANCHO), 0.25);
    assert.strictEqual(swipe.swipeProgress(800, ANCHO), 1);
    assert.strictEqual(swipe.swipeProgress(50, 0), 0);
});

it('la raya del 35 %: ahí vibra y desde ahí soltar vuelve', () => {
    assert.strictEqual(swipe.pastSwipeThreshold(139, ANCHO), false);
    assert.strictEqual(swipe.pastSwipeThreshold(140, ANCHO), true);
    assert.strictEqual(swipe.pastSwipeThreshold(140, 0), false);
});

it('al soltar: pasado el 35 % o rápido a la derecha vuelve; si no, regresa a su sitio', () => {
    assert.strictEqual(swipe.shouldSwipeBack(150, 0, ANCHO), true);
    assert.strictEqual(swipe.shouldSwipeBack(100, 0, ANCHO), false);
    // Un tirón corto pero rápido (más de 800 puntos/s) también vuelve; justo 800 no
    assert.strictEqual(swipe.shouldSwipeBack(60, 900, ANCHO), true);
    assert.strictEqual(swipe.shouldSwipeBack(60, 800, ANCHO), false);
    // Lo devolvió a la izquierda (aunque soltara rápido) o no hay ancho: no vuelve
    assert.strictEqual(swipe.shouldSwipeBack(-10, 2000, ANCHO), false);
    assert.strictEqual(swipe.shouldSwipeBack(150, 0, 0), false);
    assert.strictEqual(swipe.SWIPE_BACK.start, 20);
    assert.strictEqual(swipe.SWIPE_BACK.failY, 15);
});

it('terminar de irse: rápido si se soltó con impulso, entre 120 y 280 ms', () => {
    // Despacio: a 1500 puntos/s, los 300 que faltan en 200 ms
    assert.strictEqual(swipe.swipeOutMs(300, 0), 200);
    assert.ok(swipe.swipeOutMs(300, 2400) < swipe.swipeOutMs(300, 0));
    assert.strictEqual(swipe.swipeOutMs(300, 6000), 120);
    assert.strictEqual(swipe.swipeOutMs(1200, 0), 280);
    assert.strictEqual(swipe.swipeOutMs(0, 0), 120);
    assert.strictEqual(swipe.swipeOutMs(-50, 0), 120);
});

// ---------------------------------------------------------------- Fantasy (src/lib/fantasy*.ts)
// El optimizador es el de la web (fantasyBest.ts) con los casos de su fantasyBest.test.ts; además, el equipo que cuenta
// (effectiveEntry y «No cuenta»), los puestos compartidos, el selector y los números de la ayuda. Datos de mentira.
console.log('Fantasy');
stub('node_modules/react/index.js', 'exports.useEffect = () => {};\nexports.useState = (v) => [typeof v === "function" ? v() : v, () => {}];\nexports.useSyncExternalStore = (s, get) => get();\nexports.useMemo = (f) => f();\n');
stub('lib/storage.js', 'exports.getItem = () => null;\nexports.setItem = () => {};\nexports.removeItem = () => {};\nexports.onHydrated = () => {};\n');
const fantasyLib = require(compileTo('lib/fantasy.ts'));
const { bestLineup, projectedPoints, valueOf } = require(compileTo('lib/fantasyBest.ts'));
const pickerLib = require(compileTo('lib/fantasyPicker.ts'));
const helpLib = require(compileTo('lib/fantasyHelp.ts'));
{
    const { applyLineup, getStore, replaceStore, setStoreOwner } = fantasyLib;
    const LATER = '2099-10-20T23:00:00Z';
    const PAST = '2000-01-01T00:00:00Z';
    const p = (id, role, teamId, price, proj, extra = {}) => ({ id, name: `Pelotero ${id}`, teamId, gamePk: teamId <= 2 ? 1 : 2, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: false, line: null, points: 0, price, proj, ...extra });
    // Dos juegos (4 equipos: máximo 2 por equipo), 50 créditos
    const dia = (players, firstDate = LATER, extra = {}) => ({
        league: 'lidom',
        date: '2099-10-20',
        teams: { 1: { id: 1, abbrev: 'AAA' }, 2: { id: 2, abbrev: 'BBB' }, 3: { id: 3, abbrev: 'CCC' }, 4: { id: 4, abbrev: 'DDD' } },
        scoring: { batter: {}, pitcher: {} },
        credits: { budget: 50, min: 4, max: 12 },
        games: [
            { gamePk: 1, date: firstDate, state: 'preview', detailedState: 'Scheduled', startTimeTBD: false, away: { id: 1, abbrev: 'AAA' }, home: { id: 2, abbrev: 'BBB' } },
            { gamePk: 2, date: LATER, state: 'preview', detailedState: 'Scheduled', startTimeTBD: false, away: { id: 3, abbrev: 'CCC' }, home: { id: 4, abbrev: 'DDD' } }
        ],
        players,
        ...extra
    });

    it('optimizador: el sugerido maximiza la proyección sin pasarse de los créditos ni del máximo por equipo (fuerza bruta)', () => {
        const players = [p(1, 'B', 1, 12, 10), p(2, 'B', 1, 12, 9.5), p(3, 'B', 1, 12, 9), p(4, 'B', 2, 8, 7), p(5, 'B', 3, 6, 6), p(6, 'B', 4, 5, 5.5), p(7, 'B', 4, 4, 3), p(8, 'B', 3, 4, 2), p(9, 'P', 2, 10, 12), p(10, 'P', 3, 5, 6)];
        const best = bestLineup(dia(players), { metric: 'proj' });
        assert.ok(best.cost <= 50);
        const chosen = best.lineup.map((id) => players.find((x) => x.id === id));
        assert.strictEqual(chosen.filter((x) => x.role === 'B').length, 5);
        assert.strictEqual(chosen.filter((x) => x.role === 'P').length, 1);
        assert.ok(chosen.filter((x) => x.teamId === 1).length <= 2);
        const top = chosen.reduce((a, b) => (b.proj > a.proj ? b : a));
        assert.strictEqual(best.captain, top.id);
        close(best.total, projectedPoints(dia(players), best.lineup, best.captain), 5);
        const valid = (ids) => {
            const list = ids.map((id) => players.find((x) => x.id === id));
            const teams = new Map();
            list.forEach((x) => teams.set(x.teamId, (teams.get(x.teamId) ?? 0) + 1));
            return list.filter((x) => x.role === 'B').length === 5 && list.filter((x) => x.role === 'P').length === 1 && [...teams.values()].every((n) => n <= 2) && list.reduce((s, x) => s + x.price, 0) <= 50;
        };
        let bruteBest = 0;
        const ids = players.map((x) => x.id);
        const pick = (start, acc) => {
            if (acc.length === 6) {
                if (valid(acc)) bruteBest = Math.max(bruteBest, projectedPoints(dia(players), acc, acc.reduce((a, b) => (players.find((x) => x.id === b).proj > players.find((x) => x.id === a).proj ? b : a))));
                return;
            }
            for (let i = start; i < ids.length; i++) pick(i + 1, [...acc, ids[i]]);
        };
        pick(0, []);
        close(best.total, bruteBest, 5);
    });

    it('optimizador: el capitán cuenta en la búsqueda (una estrella de capitán vale más que un equipo parejo)', () => {
        const players = [p(1, 'B', 1, 30, 26), p(2, 'B', 2, 8, 7), p(3, 'B', 2, 8, 7), p(4, 'B', 3, 8, 7), p(5, 'B', 3, 8, 7), p(6, 'B', 4, 8, 7), p(7, 'B', 1, 4, 1), p(8, 'B', 2, 4, 1), p(11, 'B', 3, 4, 1), p(12, 'B', 4, 4, 1), p(9, 'P', 4, 4, 2)];
        const best = bestLineup(dia(players), { metric: 'proj' });
        assert.strictEqual(best.captain, 1);
        assert.strictEqual(best.total, 45);
        assert.deepStrictEqual(best.lineup.sort((a, b) => a - b), [1, 7, 8, 9, 11, 12]);
        const fixed = bestLineup(dia(players), { metric: 'proj', keep: [2], captain: 2 });
        assert.strictEqual(fixed.captain, 2);
        assert.strictEqual(fixed.total, 40.5);
    });

    it('optimizador: los que se quedan se respetan; sin créditos para completar, null', () => {
        const players = [p(1, 'B', 1, 12, 10), p(2, 'B', 2, 4, 1), p(3, 'B', 3, 6, 6), p(4, 'B', 4, 5, 5.5), p(5, 'B', 3, 4, 3), p(6, 'B', 4, 4, 2), p(7, 'B', 1, 8, 4), p(9, 'P', 2, 10, 12), p(10, 'P', 3, 5, 6)];
        const best = bestLineup(dia(players), { metric: 'proj', keep: [2] });
        assert.ok(best.lineup.includes(2));
        assert.strictEqual(best.lineup.length, 6);
        assert.strictEqual(bestLineup(dia([p(1, 'B', 1, 12, 10), p(2, 'B', 2, 12, 9), p(3, 'B', 3, 12, 8), p(4, 'B', 4, 12, 7), p(5, 'B', 1, 12, 6), p(9, 'P', 2, 12, 12)]), { metric: 'proj' }), null);
    });

    it('optimizador: el ideal del día mira los puntos de verdad aunque los juegos ya hayan empezado', () => {
        const players = [
            p(1, 'B', 1, 12, 10, { played: true, points: 2 }),
            p(2, 'B', 2, 4, 1, { played: true, points: 18 }),
            p(3, 'B', 1, 6, 6, { played: true, points: 9 }),
            p(4, 'B', 2, 5, 5.5, { played: true, points: 7 }),
            p(5, 'B', 3, 4, 3, { played: true, points: 5 }),
            p(6, 'B', 4, 4, 2, { played: true, points: 4 }),
            p(7, 'B', 4, 8, 4, { played: false, points: 0 }),
            p(9, 'P', 3, 10, 12, { played: true, points: 15 })
        ];
        const ideal = bestLineup(dia(players, PAST), { metric: 'points', ignoreLocks: true });
        [2, 3, 4, 5, 6, 9].forEach((id) => assert.ok(ideal.lineup.includes(id), `falta ${id}`));
        assert.strictEqual(ideal.captain, 2);
        assert.strictEqual(ideal.total, 18 * 1.5 + 9 + 7 + 5 + 4 + 15);
    });

    it('optimizador: aunque los de más proyección no quepan en los créditos, mira a los baratos (antes salía «no se puede»)', () => {
        const stars = [...Array.from({ length: 48 }, (_, i) => p(100 + i, 'B', (i % 4) + 1, 12, 10)), ...Array.from({ length: 21 }, (_, i) => p(300 + i, 'P', (i % 4) + 1, 12, 8))];
        const cheap = [p(200, 'B', 1, 4, 1), p(201, 'B', 2, 4, 1), p(202, 'B', 3, 4, 1), p(203, 'B', 4, 4, 1), p(400, 'P', 4, 4, 2)];
        const best = bestLineup(dia([...stars, ...cheap]), { metric: 'proj' });
        assert.ok(best);
        assert.strictEqual(best.cost, 48);
        assert.strictEqual(best.total, 39);
    });

    it('optimizador: da lo mismo que probar todos los equipos posibles (60 días al azar, con fijos y capitán fijo)', () => {
        let seed = 20261020;
        const random = () => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };
        for (let round = 0; round < 60; round++) {
            const players = [
                ...Array.from({ length: 12 }, (_, i) => p(i + 1, 'B', (i % 4) + 1, 4 + Math.floor(random() * 17) / 2, Math.floor(random() * 11))),
                ...Array.from({ length: 4 }, (_, i) => p(i + 21, 'P', i + 1, 4 + Math.floor(random() * 17) / 2, Math.floor(random() * 11)))
            ];
            const keep = round % 3 === 0 ? [1 + (round % 12)] : [];
            const captain = round % 6 === 0 ? keep[0] : null;
            let brute = null;
            const candidates = players.filter((x) => x.proj > 0 || keep.includes(x.id));
            const batters = candidates.filter((x) => x.role === 'B');
            const pick = (start, acc) => {
                if (acc.length === 5) {
                    for (const pitcher of candidates.filter((x) => x.role === 'P')) {
                        const team = [...acc, pitcher];
                        if (!keep.every((id) => team.some((x) => x.id === id))) continue;
                        if (team.reduce((s, x) => s + x.price, 0) > 50) continue;
                        const counts = new Map();
                        team.forEach((x) => counts.set(x.teamId, (counts.get(x.teamId) ?? 0) + 1));
                        if ([...counts.values()].some((n) => n > 2)) continue;
                        const sum = team.reduce((s, x) => s + x.proj, 0);
                        const bonus = captain !== null ? players.find((x) => x.id === captain).proj : Math.max(...team.map((x) => x.proj));
                        brute = Math.max(brute ?? -Infinity, sum + bonus * 0.5);
                    }
                    return;
                }
                for (let i = start; i < batters.length; i++) pick(i + 1, [...acc, batters[i]]);
            };
            pick(0, []);
            const best = bestLineup(dia(players), { metric: 'proj', keep, captain });
            assert.strictEqual(best?.total ?? null, brute, `día ${round}`);
        }
    });

    it('optimizador: valor = proyección por crédito; sin tope (rules.budget null) no mira los créditos; el pospuesto no se propone', () => {
        assert.strictEqual(valueOf({ proj: 8.4, price: 12 }), 0.7);
        assert.strictEqual(valueOf({ proj: undefined, price: 12 }), null);
        const caros = [p(1, 'B', 1, 12, 10), p(2, 'B', 2, 12, 9), p(3, 'B', 3, 12, 8), p(4, 'B', 4, 12, 7), p(5, 'B', 1, 12, 6), p(9, 'P', 2, 12, 12)];
        assert.strictEqual(bestLineup(dia(caros, LATER, { rules: { budget: null } }), { metric: 'proj' }).cost, 72);
        const pospuesto = dia([...caros, p(6, 'B', 3, 4, 30, { status: 'postponed' })], LATER, { rules: { budget: null } });
        assert.ok(!bestLineup(pospuesto, { metric: 'proj' }).lineup.includes(6));
    });

    it('usar el equipo sugerido: los cerrados se quedan (y su capitán); entra el resto', () => {
        setStoreOwner('sugerido-prueba');
        const players = [p(1, 'B', 1, 12, 10), p(2, 'B', 2, 4, 1), p(3, 'B', 3, 6, 6), p(4, 'B', 4, 5, 5.5), p(9, 'P', 3, 10, 12)];
        const d = dia(players, PAST);
        replaceStore({ 'lidom:2099-10-20': { lineup: [1, 4], captain: 1, picks: {}, savedAt: 1 } });
        applyLineup(d, [2, 3, 9], 9);
        const saved = getStore()['lidom:2099-10-20'];
        assert.deepStrictEqual(saved.lineup, [1, 3, 9]);
        assert.strictEqual(saved.captain, 1);
        setStoreOwner(null);
    });

    it('reglas: el máximo por equipo y los créditos salen de rules (null = sin tope); sin rules, los de siempre', () => {
        const { perTeamLimit, budgetOf, creditsOf, rulesOf, scoringOf } = fantasyLib;
        assert.strictEqual(perTeamLimit(dia([])), 2);
        assert.strictEqual(perTeamLimit(dia([], LATER, { rules: { perTeam: 3 } })), 3);
        assert.strictEqual(perTeamLimit({ games: [{ away: { id: 1 }, home: { id: 2 } }] }), 3);
        assert.strictEqual(budgetOf(dia([])), 50);
        assert.strictEqual(budgetOf(dia([], LATER, { rules: { budget: 55 } })), 55);
        assert.strictEqual(budgetOf(dia([], LATER, { rules: { budget: null } })), null);
        assert.strictEqual(creditsOf(dia([], LATER, { rules: { budget: null } })), null);
        assert.deepStrictEqual(creditsOf(dia([], LATER, { rules: { budget: 45, prices: { min: 3, max: 13 } } })), { budget: 45, min: 3, max: 13 });
        // Las claves del contrato (hbp, strikeout) pasan a las de la app (hitByPitch, strikeOut)
        const s = scoringOf({ rules: { scoring: { batter: { hbp: 2, strikeout: -1, homeRun: 10 }, pitcher: { strikeout: 2 } } } });
        assert.deepStrictEqual(s.batter, { hitByPitch: 2, strikeOut: -1, homeRun: 10 });
        assert.deepStrictEqual(s.pitcher, { strikeOut: 2 });
        const r = rulesOf(dia([]));
        partial(r, { perTeam: 2, budget: 50, captain: 1.5, picks: { points: 10 }, prices: { min: 4, max: 12 } });
        assert.strictEqual(r.scoring.batter.homeRun, 10);
    });

    it('reglas: un juego pospuesto no cierra a los suyos (se pueden cambiar) ni se pueden agregar; se vuelve a pedir a los 15 min como máximo', () => {
        const { isLocked, canAdd, fantasyInterval } = fantasyLib;
        const d = dia([p(1, 'B', 1, 8, 5), p(2, 'B', 3, 8, 5)], PAST);
        d.games[0] = { ...d.games[0], state: 'final', detailedState: 'Postponed', status: 'postponed' };
        assert.strictEqual(isLocked(d, d.players[0]), false);
        // No se cierra nunca: quien lo cambia por otro no se pasa del cupo (igual que la web y el servidor)
        assert.strictEqual(fantasyLib.lockTime(d.games[0]), Infinity);
        assert.strictEqual(canAdd(d, { lineup: [], captain: null, picks: {}, savedAt: 0 }, d.players[0]), 'postponed');
        assert.strictEqual(canAdd(d, { lineup: [], captain: null, picks: {}, savedAt: 0 }, d.players[1]), null);
        const lejos = dia([], new Date(Date.now() + 5 * 3600000).toISOString());
        lejos.games = [lejos.games[0]];
        assert.strictEqual(fantasyInterval(lejos), 15 * 60000);
    });

    it('equipo que cuenta: el que entró después de que empezó su juego no cuenta; si se pasa del tope, sobra el último', () => {
        const { effectiveEntry, notCounted, dayPoints } = fantasyLib;
        const start = Date.parse('2026-11-07T23:00:00Z');
        const d = dia(
            [p(12345601, 'B', 1, 12, 5, { played: true, points: 10 }), p(12345602, 'B', 1, 12, 5, { played: true, points: 6 }), p(12345603, 'B', 3, 12, 5, { points: 0 }), p(12345604, 'B', 3, 12, 5), p(12345605, 'P', 4, 10, 5)],
            '2026-11-07T23:00:00Z'
        );
        d.games[0] = { ...d.games[0], state: 'live' };
        d.games[1] = { ...d.games[1], date: '2099-01-01T00:00:00Z' };
        // 12345602 entró 5 minutos después de que empezó su juego
        const entry = {
            lineup: [12345601, 12345602, 12345603, 12345604, 12345605],
            captain: 12345601,
            picks: {},
            savedAt: start + 300000,
            history: { v: 1, players: { 12345601: [[start - 3600000, null]], 12345602: [[start + 300000, null]], 12345603: [[start - 3500000, null]], 12345604: [[start - 3400000, null]], 12345605: [[start - 3300000, null]] }, captain: [[12345601, start - 3600000]] }
        };
        const counted = effectiveEntry(d, entry);
        assert.ok(!counted.lineup.includes(12345602));
        // 12 + 12 + 12 + 10 = 46 de 50: cabe todo lo demás
        assert.deepStrictEqual(counted.lineup, [12345601, 12345603, 12345604, 12345605]);
        assert.deepStrictEqual([...notCounted(d, entry, counted, start + 3600000)], [[12345602, 'late']]);
        partial(dayPoints(d, entry, counted), { team: 15, total: 15 });
        // Sin historial (lo del teléfono): el orden de la alineación; 12 × 5 = 60 > 50 → el último que entró no cuenta
        const local = { lineup: [12345601, 12345602, 12345603, 12345604, 12345605], captain: 12345605, picks: {}, savedAt: 1 };
        const sinHistorial = effectiveEntry(d, local);
        assert.deepStrictEqual(sinHistorial.lineup, [12345601, 12345602, 12345603, 12345604]);
        assert.strictEqual(sinHistorial.captain, null);
        assert.deepStrictEqual([...notCounted(d, local)], [[12345605, 'over']]);
    });

    it('equipo que cuenta: el de un juego pospuesto no suma ni ocupa cupo, y su pronóstico no cuenta (igual que el servidor)', () => {
        const { effectiveEntry, notCounted, perTeamLimit } = fantasyLib;
        const start = Date.parse('2026-11-07T23:00:00Z');
        const d = dia(
            [p(12345601, 'B', 1, 12, 5, { status: 'postponed' }), p(12345602, 'B', 3, 12, 5, { played: true, points: 4 }), p(12345603, 'B', 3, 12, 5), p(12345604, 'B', 4, 12, 5), p(12345605, 'B', 4, 12, 5), p(12345606, 'P', 3, 2, 5)],
            '2026-11-07T23:00:00Z'
        );
        d.games[0] = { ...d.games[0], state: 'final', detailedState: 'Postponed', status: 'postponed' };
        d.games[1] = { ...d.games[1], date: '2026-11-07T20:00:00Z', state: 'live' };
        // Sin historial: 12 × 5 + 2 = 62 > 50, pero el pospuesto no gasta: 12 × 4 + 2 = 50, cuentan todos los demás
        const local = { lineup: [12345601, 12345602, 12345603, 12345604, 12345605, 12345606], captain: null, picks: { 1: 1, 2: 3 }, savedAt: 1 };
        assert.deepStrictEqual(effectiveEntry(d, local).lineup, local.lineup);
        assert.deepStrictEqual([...notCounted(d, local)], []);
        // Con historial: el pospuesto no cuenta (ni su pronóstico), aunque se cambie después de su hora
        const history = { v: 1, players: Object.fromEntries(local.lineup.map((id) => [id, [[start - 4 * 3600000, null]]])), picks: { 1: [[1, start - 4 * 3600000]], 2: [[3, start - 4 * 3600000]] } };
        const counted = effectiveEntry(d, { ...local, history });
        assert.deepStrictEqual(counted.lineup, [12345602, 12345603, 12345604, 12345605, 12345606]);
        assert.deepStrictEqual(counted.picks, { 2: 3 });
        // Sin rules, el tope por equipo no cuenta los equipos del juego pospuesto (quedan 2 equipos: 3 por equipo)
        assert.strictEqual(perTeamLimit(d), 3);
    });

    it('pospuesto en el equipo: deja su lugar libre y agregar al que lo reemplaza lo saca; el que ya no sale se puede quitar', () => {
        const { canAdd, addPlayer, removeId, entryCost, getStore, replaceStore, setStoreOwner } = fantasyLib;
        const { slotsLeft } = pickerLib;
        setStoreOwner('pospuesto-prueba');
        const d = dia([p(12345601, 'B', 1, 12, 5, { status: 'postponed' }), p(12345602, 'B', 3, 8, 5), p(12345603, 'B', 3, 8, 5), p(12345604, 'B', 4, 8, 5), p(12345605, 'B', 4, 8, 5), p(12345606, 'P', 3, 4, 5), p(12345607, 'B', 4, 8, 5)]);
        d.games[0] = { ...d.games[0], state: 'final', detailedState: 'Postponed', status: 'postponed' };
        const saved = { lineup: [12345601, 12345602, 12345603, 12345604, 12345605, 12345606], captain: 12345601, picks: {}, savedAt: 1 };
        replaceStore({ 'lidom:2099-10-20': saved });
        // El pospuesto no gasta créditos ni ocupa su cupo de bateador
        assert.strictEqual(entryCost(d, saved), 36);
        partial(slotsLeft(d, saved), { batters: 1, pitchers: 0, credits: 14 });
        assert.strictEqual(canAdd(d, saved, d.players[6]), null);
        assert.ok(addPlayer(d, saved, d.players[6]));
        const after = getStore()['lidom:2099-10-20'];
        assert.deepStrictEqual(after.lineup, [12345602, 12345603, 12345604, 12345605, 12345606, 12345607]);
        assert.strictEqual(after.captain, null);
        // Uno que ya no sale en el día (sin juego que lo cierre) se quita por su id
        replaceStore({ 'lidom:2099-10-20': { ...after, lineup: [...after.lineup.slice(0, 5), 99999999] } });
        assert.ok(removeId(d, 99999999));
        assert.ok(!getStore()['lidom:2099-10-20'].lineup.includes(99999999));
        setStoreOwner(null);
    });

    it('puestos compartidos en los empates: 1, 2, 2, 4 (también con decimales que no cuadran exactos)', () => {
        const { rankRows } = fantasyLib;
        const rows = rankRows([
            { userId: 'c', points: 15.3 + 10 },
            { userId: 'a', points: 40 },
            { userId: 'b', points: 5.3 + 20 },
            { userId: 'd', points: 12 }
        ]);
        assert.deepStrictEqual(rows.map((row) => [row.userId, row.rank]), [['a', 1], ['c', 2], ['b', 2], ['d', 4]]);
        assert.deepStrictEqual(rankRows([]), []);
    });

    it('selector: estado, razones y filtros (Disponibles, Me alcanza, Titulares, juego y equipo), igual que la web', () => {
        const { statusOf, badgeOf, reasonOf, pickerRows, defaultFilters, slotsLeft, matchupOf, pickerOptions, roleFull, isFiltered } = pickerLib;
        const players = [
            p(12345678, 'B', 1, 12, 9, { name: 'Pelotero Uno', status: 'confirmed', last5: [3, 5, 8, 2, 12], opp: { id: 2, abbrev: 'BBB', home: false } }),
            p(12345679, 'B', 1, 6, 4, { name: 'Pelotero Dos', status: 'bench' }),
            p(12345680, 'B', 2, 5, 6, { name: 'Pelotero Tres', status: 'expected' }),
            p(12345681, 'B', 3, 11, 3, { name: 'Pelotero Cuatro' }),
            p(12345682, 'B', 4, 4, 2, { name: 'Pelotero Cinco', starter: false }),
            p(12345683, 'P', 3, 10, 8, { name: 'Lanzador Uno', status: 'probable' }),
            p(12345684, 'P', 4, 6, 3, { name: 'Lanzador Dos', rest: true }),
            p(12345685, 'P', 4, 5, 1, { name: 'Lanzador Tres' })
        ];
        const d = dia(players, PAST);
        d.games[0] = { ...d.games[0], state: 'live' };
        const vacio = { lineup: [], captain: null, picks: {}, savedAt: 0 };
        // El del servidor manda; sin él, se saca del día (titular del último juego = Esperado, si no Banca)
        assert.strictEqual(statusOf(d, players[0]), 'confirmed');
        assert.strictEqual(badgeOf({ status: 'confirmed', locked: true }), 'started');
        assert.strictEqual(badgeOf({ status: 'dnp', locked: true }), 'dnp');
        assert.strictEqual(statusOf(d, players[3]), 'expected');
        assert.strictEqual(statusOf(d, players[4]), 'bench');
        assert.strictEqual(statusOf(d, players[5]), 'probable');
        assert.strictEqual(statusOf(d, players[6]), 'resting');
        assert.strictEqual(statusOf(d, players[7]), 'bullpen');
        // Le toca abrir: el servidor manda «probable» con estimated (la liga no lo anunció) y cuenta como titular
        const estimado = { ...players[7], id: 12345678, name: 'Pelotero Uno', status: 'probable', estimated: true };
        assert.strictEqual(statusOf(d, estimado), 'rotation');
        assert.strictEqual(pickerLib.isStarterStatus('rotation'), true);
        assert.strictEqual(statusOf(d, { ...estimado, estimated: undefined }), 'probable');
        // En PRO, las alineaciones dicen «Esperado» o «Confirmado» si el día no trae el estado
        assert.strictEqual(statusOf(d, players[4], Date.now(), 'expected'), 'expected');
        assert.deepStrictEqual(reasonOf(d, vacio, players[0]), { kind: 'started' });
        assert.deepStrictEqual(matchupOf(d, players[0]), { team: 'AAA', opp: 'BBB', home: false });
        assert.deepStrictEqual(matchupOf(d, players[3]), { team: 'CCC', opp: 'DDD', home: false });
        // 2 bateadores y el lanzador del juego 2 (10 + 11 + 4): quedan 25 créditos
        const mio = { lineup: [12345683, 12345681, 12345682], captain: null, picks: {}, savedAt: 1 };
        assert.deepStrictEqual(slotsLeft(d, mio), { batters: 3, pitchers: 0, credits: 25 });
        assert.deepStrictEqual(reasonOf(d, mio, players[6]), { kind: 'fullP', count: 1 });
        assert.strictEqual(roleFull(d, mio, 'P'), true);
        // Disponibles: sin los del juego empezado; los de tu equipo siempre salen
        const ids = (rows) => rows.map((row) => row.player.id);
        assert.deepStrictEqual(ids(pickerRows(d, mio, defaultFilters('B'), 'proj')), [12345681, 12345682]);
        assert.deepStrictEqual(ids(pickerRows(d, mio, { ...defaultFilters('B'), available: false }, 'proj')), [12345678, 12345680, 12345679, 12345681, 12345682]);
        assert.strictEqual(isFiltered(defaultFilters('B')), false);
        assert.strictEqual(isFiltered({ ...defaultFilters('B'), teamId: 1 }), true);
        // Titulares: confirmados, esperados y abridores probables
        assert.deepStrictEqual(ids(pickerRows(d, vacio, { ...defaultFilters('B'), available: false, starters: true }, 'proj')), [12345678, 12345680, 12345681]);
        assert.deepStrictEqual(ids(pickerRows(d, vacio, { ...defaultFilters('P'), available: false, starters: true }, 'proj')), [12345683]);
        // Por juego y por equipo
        assert.deepStrictEqual(ids(pickerRows(d, vacio, { ...defaultFilters('B'), available: false, gamePk: 2 }, 'proj')), [12345681, 12345682]);
        assert.deepStrictEqual(ids(pickerRows(d, vacio, { ...defaultFilters('B'), available: false, teamId: 1 }, 'proj')), [12345678, 12345679]);
        // Me alcanza: con 35 créditos y 30 gastados quedan 5: fuera el de 12 y el de 6 (los míos siempre salen)
        const caro = { lineup: [12345683, 12345681, 12345682, 12345680], captain: null, picks: {}, savedAt: 1 };
        d.games[0] = { ...d.games[0], state: 'preview', date: LATER };
        assert.strictEqual(slotsLeft(d, caro).credits, 20);
        const apretado = { ...d, credits: { budget: 35, min: 4, max: 12 } };
        assert.deepStrictEqual(ids(pickerRows(apretado, caro, { ...defaultFilters('B'), available: false, affordable: true }, 'proj')), [12345680, 12345681, 12345682]);
        // Las razones con sus números
        const lleno = dia([...players, p(12345690, 'B', 2, 12, 1, { name: 'Pelotero Seis' }), p(12345691, 'B', 2, 4, 1, { name: 'Pelotero Siete' })]);
        assert.deepStrictEqual(reasonOf(lleno, { lineup: [12345683, 12345681, 12345690, 12345679], captain: null, picks: {}, savedAt: 1 }, players[0]), { kind: 'budget', short: 1 });
        assert.deepStrictEqual(reasonOf(lleno, { lineup: [12345680, 12345690], captain: null, picks: {}, savedAt: 1 }, lleno.players.find((x) => x.id === 12345691)), { kind: 'team', n: 2, team: 'BBB' });
        assert.deepStrictEqual(reasonOf(lleno, { lineup: [12345683, 12345681, 12345682, 12345679, 12345680, 12345691], captain: null, picks: {}, savedAt: 1 }, players[0]), { kind: 'fullB', n: 5 });
        partial(pickerOptions(d), { affordable: true, defaultSort: 'proj' });
        assert.strictEqual(pickerOptions(dia(players, LATER, { rules: { budget: null } })).affordable, false);
    });

    it('selector: orden por Proyección, Valor, Precio, Pts/J, Últimos 5 y % elegido (sin dato al final)', () => {
        const { pickerRows, defaultFilters, pickerOptions } = pickerLib;
        const players = [
            p(12345678, 'B', 1, 12, 9, { name: 'Pelotero Uno', last5: [10, 10, 10] }),
            p(12345679, 'B', 2, 4, 4, { name: 'Pelotero Dos', last5: [1, 2, 3, 4, 5, 20] }),
            p(12345680, 'B', 3, 8, 6, { name: 'Pelotero Tres' })
        ];
        const d = dia(players);
        const vacio = { lineup: [], captain: null, picks: {}, savedAt: 0 };
        const order = (sort, extras) => pickerRows(d, vacio, defaultFilters('B'), sort, extras).map((row) => row.player.id);
        assert.deepStrictEqual(order('proj'), [12345678, 12345680, 12345679]);
        // Valor: 4/4 = 1, 9/12 = 0.75 y 6/8 = 0.75 (empate: más proyección primero)
        assert.deepStrictEqual(order('value'), [12345679, 12345678, 12345680]);
        assert.deepStrictEqual(order('price'), [12345678, 12345680, 12345679]);
        const ppg = { 12345678: 3, 12345679: 7 };
        assert.deepStrictEqual(order('ppg', { ppg: (x) => ppg[x.id] }), [12345679, 12345678, 12345680]);
        // Últimos 5: (2 + 3 + 4 + 5 + 20) / 5 = 6.8 contra 10; sin dato al final
        assert.deepStrictEqual(order('last5'), [12345678, 12345679, 12345680]);
        const row = pickerRows(d, vacio, defaultFilters('B'), 'proj').find((r) => r.player.id === 12345679);
        assert.deepStrictEqual(row.last5, [2, 3, 4, 5, 20]);
        assert.strictEqual(row.last5Avg, 6.8);
        const owned = { 12345680: 40, 12345679: 12.5 };
        assert.deepStrictEqual(order('owned', { owned: (x) => owned[x.id] }), [12345680, 12345679, 12345678]);
        // El % elegido solo se ofrece cuando ya existe; sin proyección se empieza por Pts/J
        assert.deepStrictEqual(pickerOptions(d).sorts, ['proj', 'value', 'price', 'ppg', 'last5']);
        assert.deepStrictEqual(pickerOptions(d, true).sorts, ['proj', 'value', 'price', 'ppg', 'last5', 'owned']);
        assert.strictEqual(pickerOptions(dia([p(1, 'B', 1, 5, undefined)])).defaultSort, 'ppg');
    });

    it('ayuda: los números y los ejemplos salen de las reglas del día', () => {
        const { rulesOf } = fantasyLib;
        const { helpNumbers, helpExamples, scoringRows, HELP_QUESTIONS, HELP_TOPICS, isHelpQuestion } = helpLib;
        const r = rulesOf(dia([], LATER, { scoring: { batter: { single: 3, double: 5, triple: 8, homeRun: 10, run: 2, rbi: 2, walk: 2, hitByPitch: 2, stolenBase: 5, strikeOut: -1 }, pitcher: { out: 1, strikeOut: 2, win: 5, save: 5, earnedRun: -2, hit: -0.5, walk: -0.5 } } }));
        assert.deepStrictEqual(helpNumbers(r), { batters: 5, pitchers: 1, budget: 50, captain: 1.5, picks: 10, perTeam: 2, min: 4, max: 12, past: 3, code: 6 });
        const ex = helpExamples(r);
        partial(ex, { solo: { hr: 10, run: 2, rbi: 2, total: 14, captain: 21 }, double: { double: 5, rbi: 2, total: 9 }, pitcher: { ip: 6, outs: 18, outsPts: 18, k: 7, kPts: 14, er: 2, erPts: -4, h: 5, hPts: -2.5, bb: 1, bbPts: -0.5, winPts: 5, total: 30 } });
        assert.deepStrictEqual(scoringRows(r, 'pitcher').map((row) => row.key), ['out', 'strikeOut', 'win', 'save', 'earnedRun', 'hit', 'walk']);
        // Los textos de la ayuda son los de la web (hbp y strikeout)
        assert.deepStrictEqual(scoringRows(r, 'batter').filter((row) => row.key !== row.label).map((row) => row.label), ['hbp', 'strikeout']);
        assert.strictEqual(scoringRows(r, 'batter').length, 10);
        // Con otras reglas cambian los números (nada escrito a mano)
        const otras = rulesOf(dia([], LATER, { rules: { budget: null, perTeam: 3, captain: 2, picks: { points: 15 }, scoring: { batter: { homeRun: 12, run: 1, rbi: 1, double: 4 }, pitcher: { out: 1 } } } }));
        partial(helpNumbers(otras), { budget: null, perTeam: 3, captain: 2, picks: 15 });
        partial(helpExamples(otras), { solo: { total: 14, captain: 28 }, double: { total: 6 } });
        // Precios provisionales (pueden ajustarse una vez antes del día): la ayuda lo dice
        assert.strictEqual(rulesOf(dia([], LATER, { rules: { prices: { frozen: false } } })).prices.frozen, false);
        assert.strictEqual(rulesOf(dia([])).prices.frozen, true);
        assert.strictEqual(HELP_QUESTIONS.length, 15);
        assert.ok(Object.values(HELP_TOPICS).every(isHelpQuestion));
    });
}

fs.rmSync(OUT, { recursive: true, force: true });
if (failed) {
    console.log(`\n${failed} caso(s) fallaron`);
    process.exit(1);
}
console.log('\nTodo bien');
