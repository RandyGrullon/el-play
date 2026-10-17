// Datos simulados con la misma forma que MLB StatsAPI (MLB_MOCK=1).
// Sirve para desarrollar sin red o donde statsapi.mlb.com está bloqueado: el juego "en vivo" avanza
// un pitcheo cada PITCH_MS, así se ve la zona de strike, el conteo y el marcador cambiar.
// Todos los nombres de jugadores son inventados.

const PITCH_MS = Number(process.env.MLB_MOCK_PITCH_MS || 6000);
const BOOT = Date.now();
const DAY = 86400000;

const TEAMS = {
    667: { name: 'Águilas Cibaeñas', teamName: 'Águilas', abbreviation: 'AGU', venue: 'Estadio Cibao' },
    668: { name: 'Toros del Este', teamName: 'Toros', abbreviation: 'TOR', venue: 'Estadio Francisco A. Micheli' },
    669: { name: 'Estrellas Orientales', teamName: 'Estrellas', abbreviation: 'EST', venue: 'Estadio Tetelo Vargas' },
    670: { name: 'Gigantes del Cibao', teamName: 'Gigantes', abbreviation: 'GIG', venue: 'Estadio Julián Javier' },
    671: { name: 'Leones del Escogido', teamName: 'Leones', abbreviation: 'ESC', venue: 'Estadio Quisqueya' },
    672: { name: 'Tigres del Licey', teamName: 'Tigres', abbreviation: 'LIC', venue: 'Estadio Quisqueya' }
};
const TEAM_IDS = Object.keys(TEAMS).map(Number);

const FIRST = ['Yeuris', 'Wandel', 'Kelvin', 'Ronny', 'Emilio', 'Darío', 'Franmil', 'Jeison', 'Yunior', 'Héctor', 'Anyelo', 'Dionis', 'Robelis', 'Edwar', 'Joel', 'Maikel', 'Nelson', 'Starlyn', 'Ariel', 'Wilkin'];
const LAST = ['Peña', 'Rosario', 'Mejía', 'Castillo', 'Batista', 'Tavárez', 'Guzmán', 'Almonte', 'Santana', 'Mercedes', 'Valdez', 'Abreu', 'Frías', 'Paulino', 'Ventura', 'Rijo', 'Núñez', 'Féliz', 'Brito', 'Morillo', 'Lantigua', 'Durán', 'Tejeda', 'Ogando', 'Hiciano', 'Matos'];
const POSITIONS = ['CF', 'SS', '2B', '1B', 'DH', '3B', 'RF', 'LF', 'C'];
const PITCH_TYPES = {
    FF: ['Four-Seam Fastball', 93, 97], SI: ['Sinker', 91, 95], FC: ['Cutter', 87, 91], SL: ['Slider', 83, 88],
    ST: ['Sweeper', 80, 85], CH: ['Changeup', 84, 88], CU: ['Curveball', 77, 82], FS: ['Splitter', 85, 89]
};

const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
const pick = (random, list) => list[Math.floor(random() * list.length)];
const between = (random, min, max) => min + random() * (max - min);
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

// ------------------------------------------------------------------ Plantillas

const rosterCache = new Map();
const roster = (teamId) => {
    if (rosterCache.has(teamId)) return rosterCache.get(teamId);
    const random = rng(teamId * 7919);
    const person = (index, extra) => {
        const first = pick(random, FIRST);
        const last = pick(random, LAST);
        return { id: teamId * 1000 + index, fullName: `${first} ${last}`, lastName: last, boxscoreName: last, ...extra };
    };
    const hitters = POSITIONS.map((pos, index) =>
        person(index + 1, { pos, bats: random() < 0.35 ? 'L' : random() < 0.1 ? 'S' : 'R', avg: round(between(random, 0.21, 0.33), 3), power: random() })
    );
    const pitchers = [0, 1, 2, 3].map((index) => {
        const types = Object.keys(PITCH_TYPES).sort(() => random() - 0.5).slice(0, 3 + Math.floor(random() * 2));
        if (!types.includes('FF') && !types.includes('SI')) types[0] = 'FF';
        return person(50 + index, {
            pos: 'P',
            throws: random() < 0.3 ? 'L' : 'R',
            arsenal: types,
            era: round(between(random, 1.9, 5.4), 2),
            wins: Math.floor(between(random, 0, 6)),
            losses: Math.floor(between(random, 0, 5)),
            saves: index === 3 ? Math.floor(between(random, 2, 12)) : 0
        });
    });
    const value = { hitters, pitchers };
    rosterCache.set(teamId, value);
    return value;
};

// ------------------------------------------------------------------ Simulación de un juego

const simCache = new Map();

const simulate = (gamePk, awayId, homeId) => {
    const key = `${gamePk}`;
    if (simCache.has(key)) return simCache.get(key);
    const random = rng(gamePk);
    const teams = { away: roster(awayId), home: roster(homeId) };
    const lineupIndex = { away: 0, home: 0 };
    const pitcherState = { away: { index: 0, count: 0 }, home: { index: 0, count: 0 } };
    const score = { away: 0, home: 0 };
    const plays = [];
    let pitchCounter = 0;

    const playHalf = (inning, isTop) => {
        const batting = isTop ? 'away' : 'home';
        const fielding = isTop ? 'home' : 'away';
        let outs = 0;
        let bases = [null, null, null];
        while (outs < 3) {
            if (!isTop && inning >= 9 && score.home > score.away) return;
            const state = pitcherState[fielding];
            if (state.count > 85 + state.index * 10 && state.index < 3) {
                state.index += 1;
                state.count = 0;
            }
            const pitcher = teams[fielding].pitchers[state.index];
            const batter = teams[batting].hitters[lineupIndex[batting] % 9];
            lineupIndex[batting] += 1;
            const side = batter.bats === 'S' ? (pitcher.throws === 'R' ? 'L' : 'R') : batter.bats;
            const top = round(between(random, 3.25, 3.6), 2);
            const bot = round(between(random, 1.5, 1.7), 2);

            const before = { outs, bases: [...bases], away: score.away, home: score.home };
            const events = [];
            let balls = 0;
            let strikes = 0;
            let outcome = null;
            while (!outcome) {
                const type = pick(random, pitcher.arsenal);
                const [typeDesc, min, max] = PITCH_TYPES[type];
                const attackZone = random() < 0.52;
                const pX = attackZone ? between(random, -0.75, 0.75) : (random() < 0.5 ? -1 : 1) * between(random, 0.85, 1.7);
                const pZ = attackZone ? between(random, bot + 0.1, top - 0.1) : random() < 0.5 ? between(random, 0.4, bot - 0.05) : between(random, top + 0.05, 4.6);
                const inZone = Math.abs(pX) <= 0.83 && pZ >= bot && pZ <= top;
                const swing = random() < (inZone ? 0.66 : 0.27);
                let code;
                if (swing) {
                    const contact = random() < (inZone ? 0.82 : 0.52);
                    if (!contact) code = 'S';
                    else if (random() < 0.47) code = 'F';
                    else code = 'X';
                } else {
                    code = inZone ? 'C' : random() < 0.08 ? '*B' : 'B';
                }
                if (code === 'B' || code === '*B') balls += 1;
                else if (code === 'C' || code === 'S') strikes += 1;
                else if (code === 'F' && strikes < 2) strikes += 1;

                pitchCounter += 1;
                state.count += 1;
                const descriptions = { B: 'Ball', '*B': 'Ball In Dirt', C: 'Called Strike', S: 'Swinging Strike', F: 'Foul', X: 'In play, out(s)' };
                const event = {
                    isPitch: true,
                    type: 'pitch',
                    pitchNumber: events.length + 1,
                    seq: pitchCounter,
                    details: {
                        call: { code, description: descriptions[code] },
                        description: descriptions[code],
                        code,
                        isInPlay: code === 'X',
                        isStrike: ['C', 'S', 'F', 'X'].includes(code),
                        isBall: code === 'B' || code === '*B',
                        type: { code: type, description: typeDesc }
                    },
                    count: { balls: Math.min(balls, 4), strikes: Math.min(strikes, 3), outs },
                    pitchData: {
                        startSpeed: round(between(random, min, max), 1),
                        strikeZoneTop: top,
                        strikeZoneBottom: bot,
                        coordinates: { pX: round(pX, 4), pZ: round(pZ, 4) },
                        breaks: { spinRate: Math.round(between(random, 1900, 2700)) },
                        zone: inZone ? 5 : 12
                    }
                };
                events.push(event);
                if (balls === 4) outcome = 'walk';
                else if (strikes === 3) outcome = 'strikeout';
                else if (code === 'X') outcome = 'inplay';
            }

            let eventType;
            let label;
            let description;
            let rbi = 0;
            let isOut = false;
            const scorers = [];
            const advance = (count, batterRef) => {
                const next = [null, null, null];
                for (let base = 2; base >= 0; base--) {
                    if (!bases[base]) continue;
                    const target = base + count;
                    if (target >= 3) scorers.push(bases[base]);
                    else next[target] = bases[base];
                }
                if (batterRef && count < 4) next[count - 1] = batterRef;
                if (batterRef && count === 4) scorers.push(batterRef);
                bases = next;
            };
            const ref = { id: batter.id, name: batter.fullName };
            if (outcome === 'walk') {
                eventType = 'walk';
                label = 'Walk';
                description = `${batter.fullName} walks.`;
                const next = [...bases];
                if (next[0]) {
                    if (next[1]) {
                        if (next[2]) scorers.push(next[2]);
                        next[2] = next[1];
                    }
                    next[1] = next[0];
                }
                next[0] = ref;
                bases = next;
                rbi = scorers.length;
            } else if (outcome === 'strikeout') {
                const looking = events[events.length - 1].details.code === 'C';
                eventType = 'strikeout';
                label = 'Strikeout';
                description = looking ? `${batter.fullName} called out on strikes.` : `${batter.fullName} strikes out swinging.`;
                outs += 1;
                isOut = true;
            } else {
                const roll = random();
                const hitBoost = (batter.avg - 0.25) * 0.6;
                // Dónde cae la bola (coordenadas de Gameday): ángulo desde el jardín central y distancia en unidades (~2,5 pies)
                const ANGLE = { 'left field': -28, 'center field': 0, 'right field': 28 };
                const spot = (angle, min, max, trajectory, hardness = 'medium') => {
                    const a = ((angle + between(random, -12, 12)) * Math.PI) / 180;
                    const d = between(random, min, max);
                    return { coordinates: { coordX: round(125.42 + d * Math.sin(a), 2), coordY: round(198.27 - d * Math.cos(a), 2) }, trajectory, hardness };
                };
                const fields = ['left field', 'center field', 'right field'];
                const field = pick(random, fields);
                const last = events[events.length - 1];
                if (roll < 0.035 + batter.power * 0.02) {
                    eventType = 'home_run';
                    label = 'Home Run';
                    description = `${batter.fullName} homers on a fly ball to ${field}.`;
                    advance(4, ref);
                    last.hitData = { launchSpeed: round(between(random, 101, 112), 1), launchAngle: Math.round(between(random, 24, 34)), totalDistance: Math.round(between(random, 375, 445)), ...spot(ANGLE[field], 160, 176, 'fly_ball', 'hard') };
                } else if (roll < 0.25 + hitBoost) {
                    const kind = random();
                    if (kind < 0.72) {
                        eventType = 'single';
                        label = 'Single';
                        description = `${batter.fullName} singles on a line drive to ${field}.`;
                        advance(1, ref);
                    } else if (kind < 0.95) {
                        eventType = 'double';
                        label = 'Double';
                        description = `${batter.fullName} doubles on a fly ball to ${field}.`;
                        advance(2, ref);
                    } else {
                        eventType = 'triple';
                        label = 'Triple';
                        description = `${batter.fullName} triples on a line drive to ${field}.`;
                        advance(3, ref);
                    }
                    last.details.call = { code: scorers.length ? 'E' : 'D', description: scorers.length ? 'In play, run(s)' : 'In play, no out' };
                    last.details.code = last.details.call.code;
                    last.details.description = last.details.call.description;
                    const far = eventType === 'single' ? [62, 108] : [118, 152];
                    last.hitData = { launchSpeed: round(between(random, 88, 106), 1), launchAngle: Math.round(between(random, 5, 22)), totalDistance: Math.round(between(random, 150, 330)), ...spot(ANGLE[field], far[0], far[1], eventType === 'double' ? 'fly_ball' : 'line_drive', 'hard') };
                } else {
                    const kind = random();
                    isOut = true;
                    if (kind < 0.45) {
                        eventType = 'field_out';
                        label = 'Groundout';
                        description = `${batter.fullName} grounds out, shortstop to first baseman.`;
                    } else if (kind < 0.8) {
                        if (bases[2] && outs < 2) {
                            eventType = 'sac_fly';
                            label = 'Sac Fly';
                            description = `${batter.fullName} out on a sacrifice fly to ${field}. ${bases[2].name} scores.`;
                            scorers.push(bases[2]);
                            bases = [bases[0], bases[1], null];
                        } else {
                            eventType = 'field_out';
                            label = 'Flyout';
                            description = `${batter.fullName} flies out to ${field.replace(' field', ' fielder')}.`;
                        }
                    } else {
                        eventType = 'field_out';
                        label = 'Lineout';
                        description = `${batter.fullName} lines out to second baseman.`;
                    }
                    outs += 1;
                    const where = label === 'Groundout' ? spot(-14, 34, 58, 'ground_ball') : label === 'Lineout' ? spot(14, 50, 62, 'line_drive') : spot(ANGLE[field], 95, 140, 'fly_ball');
                    last.hitData = { launchSpeed: round(between(random, 70, 102), 1), launchAngle: Math.round(between(random, -10, 45)), totalDistance: Math.round(between(random, 20, 340)), ...where };
                }
                if (eventType !== 'field_out') rbi = scorers.length;
            }

            score[batting] += scorers.length;
            if (scorers.length && eventType !== 'sac_fly') {
                description += ` ${scorers.map((s) => s.name).join(', ')} ${scorers.length > 1 ? 'score' : 'scores'}.`;
            }
            plays.push({
                inning,
                isTop,
                batting,
                fielding,
                batter,
                pitcher,
                side,
                events,
                eventType,
                label,
                description,
                rbi,
                isOut,
                scorers,
                before,
                after: { outs, bases: [...bases], away: score.away, home: score.home }
            });
        }
    };

    for (let inning = 1; inning <= 12; inning++) {
        playHalf(inning, true);
        if (inning >= 9 && score.home > score.away) break;
        playHalf(inning, false);
        if (inning >= 9 && score.home !== score.away) break;
    }

    const sim = { gamePk, awayId, homeId, plays, totalPitches: pitchCounter, teams };
    simCache.set(key, sim);
    return sim;
};

// ------------------------------------------------------------------ Calendario simulado

const localDay = (time) => new Date(time - 4 * 3600000).toISOString().slice(0, 10); // RD = UTC-4

const gamesForDay = (dayString) => {
    const dayNumber = Math.floor(Date.parse(`${dayString}T00:00:00Z`) / DAY);
    const today = localDay(Date.now());
    const order = [...TEAM_IDS].sort((a, b) => ((a * 31 + dayNumber * 17) % 97) - ((b * 31 + dayNumber * 17) % 97));
    return [0, 1, 2].map((index) => {
        const gamePk = 800000 + dayNumber * 10 + index;
        const awayId = order[index * 2];
        const homeId = order[index * 2 + 1];
        const weekday = new Date(`${dayString}T12:00:00Z`).getUTCDay();
        let start = Date.parse(`${dayString}T${weekday === 0 ? '21' : '23'}:${index === 2 ? '30' : '00'}:00Z`);
        let mode = start + 4 * 3600000 < Date.now() ? 'final' : start > Date.now() ? 'preview' : 'live';
        if (dayString === today) {
            // Hoy siempre hay uno en vivo, uno terminado y uno por empezar
            mode = ['live', 'final', 'preview'][index];
            if (mode === 'live') start = BOOT - 55 * 60000;
            if (mode === 'final') start = Date.now() - 4 * 3600000;
            if (mode === 'preview') start = Math.max(start, Date.now() + 2 * 3600000);
        }
        return { gamePk, awayId, homeId, start, mode, dayString };
    });
};

const findGame = (gamePk) => {
    const pk = Number(gamePk);
    const dayNumber = Math.floor((pk - 800000) / 10);
    const dayString = new Date(dayNumber * DAY).toISOString().slice(0, 10);
    return gamesForDay(dayString).find((game) => game.gamePk === pk) || null;
};

const revealedPitches = (game, sim) => {
    if (game.mode === 'final') return sim.totalPitches;
    if (game.mode === 'preview') return 0;
    // El juego en vivo arranca ya avanzado (~40 % de los pitcheos) y suma uno cada PITCH_MS
    return Math.min(sim.totalPitches, Math.floor(sim.totalPitches * 0.4) + Math.floor((Date.now() - BOOT) / PITCH_MS));
};

// ------------------------------------------------------------------ Feed live

const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const personRef = (p) => (p ? { id: p.id, fullName: p.fullName ?? p.name } : undefined);

const buildState = (game) => {
    const sim = simulate(game.gamePk, game.awayId, game.homeId);
    const revealed = revealedPitches(game, sim);
    const finished = game.mode === 'final' || revealed >= sim.totalPitches;

    const plays = [];
    for (const play of sim.plays) {
        const firstSeq = play.events[0].seq;
        const lastSeq = play.events[play.events.length - 1].seq;
        if (lastSeq <= revealed) plays.push({ play, events: play.events, complete: true });
        else if (firstSeq <= revealed + 1) plays.push({ play, events: play.events.filter((e) => e.seq <= revealed), complete: false });
        if (lastSeq > revealed) break;
    }
    return { sim, revealed, finished: finished && game.mode !== 'preview', plays };
};

const buildLinescore = (game, state) => {
    const { plays, finished } = state;
    const innings = [];
    const totals = { away: { runs: 0, hits: 0, errors: 0, leftOnBase: 0 }, home: { runs: 0, hits: 0, errors: 0, leftOnBase: 0 } };
    for (const { play, complete } of plays) {
        if (!innings[play.inning - 1]) innings[play.inning - 1] = { num: play.inning, ordinalNum: ordinal(play.inning), away: {}, home: {} };
        const half = innings[play.inning - 1][play.batting];
        half.runs = half.runs ?? 0;
        if (!complete) continue;
        half.runs += play.scorers.length;
        totals[play.batting].runs += play.scorers.length;
        if (['single', 'double', 'triple', 'home_run'].includes(play.eventType)) totals[play.batting].hits += 1;
    }
    const current = plays[plays.length - 1];
    const linescore = { scheduledInnings: 9, innings: innings.filter(Boolean), teams: totals };
    if (current && !finished) {
        const { play, events, complete } = current;
        const last = events[events.length - 1];
        const at = complete ? play.after : play.before;
        linescore.currentInning = play.inning;
        linescore.currentInningOrdinal = ordinal(play.inning);
        linescore.isTopInning = play.isTop;
        linescore.inningState = play.isTop ? 'Top' : 'Bottom';
        linescore.inningHalf = play.isTop ? 'Top' : 'Bottom';
        linescore.balls = complete ? 0 : last?.count.balls ?? 0;
        linescore.strikes = complete ? 0 : last?.count.strikes ?? 0;
        linescore.outs = at.outs;
        const lineup = state.sim.teams[play.batting].hitters;
        const batterIndex = lineup.findIndex((h) => h.id === play.batter.id);
        linescore.offense = {
            batter: personRef(play.batter),
            onDeck: personRef(lineup[(batterIndex + 1) % 9]),
            inHole: personRef(lineup[(batterIndex + 2) % 9]),
            first: personRef(at.bases[0]),
            second: personRef(at.bases[1]),
            third: personRef(at.bases[2])
        };
        linescore.defense = { pitcher: personRef(play.pitcher) };
    } else if (current) {
        linescore.currentInning = current.play.inning;
        linescore.currentInningOrdinal = ordinal(current.play.inning);
        linescore.isTopInning = current.play.isTop;
        linescore.inningState = 'End';
    }
    return linescore;
};

const status = (mode, finished) => {
    if (mode === 'preview') return { abstractGameState: 'Preview', codedGameState: 'S', detailedState: 'Scheduled', statusCode: 'S' };
    if (finished || mode === 'final') return { abstractGameState: 'Final', codedGameState: 'F', detailedState: 'Final', statusCode: 'F' };
    return { abstractGameState: 'Live', codedGameState: 'I', detailedState: 'In Progress', statusCode: 'I' };
};

const decisionsFor = (state) => {
    if (!state.finished) return undefined;
    const last = state.plays[state.plays.length - 1].play.after;
    const winner = last.home > last.away ? 'home' : 'away';
    const loser = winner === 'home' ? 'away' : 'home';
    const winPitchers = state.sim.teams[winner].pitchers;
    const decisions = { winner: personRef(winPitchers[0]), loser: personRef(state.sim.teams[loser].pitchers[0]) };
    if (Math.abs(last.home - last.away) <= 3) decisions.save = personRef(winPitchers[3]);
    return decisions;
};

const buildBoxscore = (game, state) => {
    const result = {};
    for (const side of ['away', 'home']) {
        const team = state.sim.teams[side];
        const players = {};
        const batting = {};
        const pitching = {};
        for (const hitter of team.hitters) batting[hitter.id] = { atBats: 0, runs: 0, hits: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 0, homeRuns: 0 };
        for (const { play, events, complete } of state.plays) {
            if (play.fielding === side) {
                const p = (pitching[play.pitcher.id] = pitching[play.pitcher.id] || { outs: 0, hits: 0, runs: 0, earnedRuns: 0, baseOnBalls: 0, strikeOuts: 0, homeRuns: 0, numberOfPitches: 0, strikes: 0 });
                p.numberOfPitches += events.length;
                p.strikes += events.filter((e) => e.details.isStrike).length;
                if (!complete) continue;
                if (play.isOut) p.outs += 1;
                if (['single', 'double', 'triple', 'home_run'].includes(play.eventType)) p.hits += 1;
                if (play.eventType === 'home_run') p.homeRuns += 1;
                if (play.eventType === 'walk') p.baseOnBalls += 1;
                if (play.eventType === 'strikeout') p.strikeOuts += 1;
                p.runs += play.scorers.length;
                p.earnedRuns += play.scorers.length;
            }
            if (play.batting === side && complete) {
                const b = batting[play.batter.id];
                if (!['walk', 'sac_fly'].includes(play.eventType)) b.atBats += 1;
                if (['single', 'double', 'triple', 'home_run'].includes(play.eventType)) b.hits += 1;
                if (play.eventType === 'home_run') b.homeRuns += 1;
                if (play.eventType === 'walk') b.baseOnBalls += 1;
                if (play.eventType === 'strikeout') b.strikeOuts += 1;
                b.rbi += play.rbi;
                for (const scorer of play.scorers) if (batting[scorer.id]) batting[scorer.id].runs += 1;
            }
        }
        const appeared = game.mode === 'preview' ? [] : team.hitters;
        team.hitters.forEach((hitter, index) => {
            players[`ID${hitter.id}`] = {
                person: { id: hitter.id, fullName: hitter.fullName },
                position: { abbreviation: hitter.pos },
                battingOrder: appeared.length ? String((index + 1) * 100) : undefined,
                stats: { batting: appeared.length ? { ...batting[hitter.id], summary: `${batting[hitter.id].hits}-${batting[hitter.id].atBats}` } : {}, pitching: {} },
                seasonStats: { batting: { avg: hitter.avg.toFixed(3).replace(/^0/, '') }, pitching: {} }
            };
        });
        team.pitchers.forEach((pitcher) => {
            const p = pitching[pitcher.id];
            players[`ID${pitcher.id}`] = {
                person: { id: pitcher.id, fullName: pitcher.fullName },
                position: { abbreviation: 'P' },
                stats: {
                    batting: {},
                    pitching: p ? { ...p, inningsPitched: `${Math.floor(p.outs / 3)}.${p.outs % 3}` } : {}
                },
                seasonStats: { batting: {}, pitching: { era: pitcher.era.toFixed(2), wins: pitcher.wins, losses: pitcher.losses, saves: pitcher.saves } }
            };
        });
        const totals = Object.values(batting).reduce(
            (acc, b) => ({ atBats: acc.atBats + b.atBats, runs: acc.runs + b.runs, hits: acc.hits + b.hits, rbi: acc.rbi + b.rbi, baseOnBalls: acc.baseOnBalls + b.baseOnBalls, strikeOuts: acc.strikeOuts + b.strikeOuts, homeRuns: acc.homeRuns + b.homeRuns }),
            { atBats: 0, runs: 0, hits: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 0, homeRuns: 0 }
        );
        const id = side === 'away' ? game.awayId : game.homeId;
        result[side] = {
            team: { id, name: TEAMS[id].name },
            teamStats: { batting: { ...totals, avg: totals.atBats ? (totals.hits / totals.atBats).toFixed(3).replace(/^0/, '') : '.000', leftOnBase: Math.floor(totals.hits * 0.8) } },
            players,
            batters: appeared.map((h) => h.id),
            pitchers: team.pitchers.filter((p) => pitching[p.id]).map((p) => p.id)
        };
    }
    return { teams: result };
};

const buildFeed = (game) => {
    const state = buildState(game);
    const { sim, plays, finished } = state;
    const linescore = buildLinescore(game, state);
    const people = {};
    for (const side of ['away', 'home']) {
        for (const player of [...sim.teams[side].hitters, ...sim.teams[side].pitchers]) {
            people[`ID${player.id}`] = {
                id: player.id,
                fullName: player.fullName,
                lastName: player.lastName,
                boxscoreName: player.boxscoreName,
                batSide: { code: player.bats || 'R' },
                pitchHand: { code: player.throws || 'R' }
            };
        }
    }
    const allPlays = plays.map(({ play, events, complete }, index) => ({
        result: complete
            ? { type: 'atBat', event: play.label, eventType: play.eventType, description: play.description, rbi: play.rbi, awayScore: play.after.away, homeScore: play.after.home, isOut: play.isOut }
            : { type: 'atBat', awayScore: play.before.away, homeScore: play.before.home },
        about: { atBatIndex: index, halfInning: play.isTop ? 'top' : 'bottom', isTopInning: play.isTop, inning: play.inning, isComplete: complete, isScoringPlay: complete && play.scorers.length > 0 },
        count: { balls: events[events.length - 1]?.count.balls ?? 0, strikes: events[events.length - 1]?.count.strikes ?? 0, outs: complete ? play.after.outs : play.before.outs },
        matchup: { batter: personRef(play.batter), batSide: { code: play.side }, pitcher: personRef(play.pitcher), pitchHand: { code: play.pitcher.throws } },
        playEvents: events.map(({ seq, ...event }) => event)
    }));
    const record = (id) => {
        const random = rng(id * 13);
        const wins = 8 + Math.floor(random() * 10);
        const losses = 8 + Math.floor(random() * 10);
        return { wins, losses, leagueRecord: { wins, losses, pct: (wins / (wins + losses)).toFixed(3).replace(/^0/, '') } };
    };
    const team = (id) => ({ id, name: TEAMS[id].name, teamName: TEAMS[id].teamName, abbreviation: TEAMS[id].abbreviation, league: { id: 131 }, sport: { id: 17 }, record: record(id) });
    const timeStamp = `mock_${game.gamePk}_${state.revealed}_${finished ? 'F' : ''}`;

    return {
        metaData: { timeStamp },
        gameData: {
            game: { pk: game.gamePk, type: 'R' },
            datetime: { dateTime: new Date(game.start).toISOString() },
            status: status(game.mode, finished),
            teams: { away: team(game.awayId), home: team(game.homeId) },
            players: people,
            venue: { name: TEAMS[game.homeId].venue },
            weather: { condition: 'Partly Cloudy', temp: '84' },
            probablePitchers: { away: personRef(sim.teams.away.pitchers[0]), home: personRef(sim.teams.home.pitchers[0]) }
        },
        liveData: {
            plays: { allPlays, currentPlay: allPlays[allPlays.length - 1] },
            linescore,
            boxscore: buildBoxscore(game, state),
            decisions: decisionsFor(state)
        }
    };
};

// ------------------------------------------------------------------ Endpoints

const scheduleGame = (game) => {
    const feed = buildFeed(game);
    const { linescore } = feed.liveData;
    const final = feed.gameData.status.abstractGameState === 'Final';
    const side = (key) => {
        const id = key === 'away' ? game.awayId : game.homeId;
        const other = key === 'away' ? 'home' : 'away';
        return {
            team: { id, name: TEAMS[id].name },
            score: game.mode === 'preview' ? undefined : linescore.teams[key].runs,
            isWinner: final ? linescore.teams[key].runs > linescore.teams[other].runs : undefined,
            leagueRecord: feed.gameData.teams[key].record.leagueRecord,
            probablePitcher: feed.gameData.probablePitchers[key]
        };
    };
    return {
        gamePk: game.gamePk,
        gameType: 'R',
        gameDate: new Date(game.start).toISOString(),
        status: feed.gameData.status,
        teams: { away: side('away'), home: side('home') },
        venue: { name: TEAMS[game.homeId].venue },
        seriesDescription: 'Regular Season',
        linescore,
        decisions: feed.liveData.decisions
    };
};

const schedule = (params = {}) => {
    if (Number(params.leagueId) !== 131) return { dates: [] };
    if (params.gameTypes === 'W') return { dates: [] };
    const start = Date.parse(`${params.startDate}T00:00:00Z`);
    const end = Date.parse(`${params.endDate}T00:00:00Z`);
    const dates = [];
    for (let time = start; time <= end; time += DAY) {
        const day = new Date(time).toISOString().slice(0, 10);
        dates.push({ date: day, games: gamesForDay(day).map(scheduleGame) });
    }
    return { dates };
};

const standings = (params = {}) => {
    if (Number(params.leagueId) !== 131 || params.standingsTypes !== 'regularSeason') return { records: [] };
    const rows = TEAM_IDS.map((id) => {
        const random = rng(id * 101);
        const wins = 10 + Math.floor(random() * 14);
        const losses = 10 + Math.floor(random() * 14);
        return { id, wins, losses, streak: `${random() < 0.5 ? 'W' : 'L'}${1 + Math.floor(random() * 4)}`, lastWins: Math.floor(random() * 11) };
    }).sort((a, b) => b.wins - b.losses - (a.wins - a.losses));
    const leader = rows[0];
    return {
        records: [{
            standingsType: 'regularSeason',
            teamRecords: rows.map((row, index) => ({
                team: { id: row.id, name: TEAMS[row.id].name },
                rank: String(index + 1),
                wins: row.wins,
                losses: row.losses,
                gamesPlayed: row.wins + row.losses,
                winningPercentage: (row.wins / (row.wins + row.losses)).toFixed(3).replace(/^0/, ''),
                gamesBack: index === 0 ? '-' : String(((leader.wins - row.wins + (row.losses - leader.losses)) / 2).toFixed(1)).replace('.0', ''),
                streak: { streakCode: row.streak },
                records: { splitRecords: [{ type: 'lastTen', wins: row.lastWins, losses: 10 - row.lastWins }] }
            }))
        }]
    };
};

const stats = (params = {}) => {
    if (Number(params.leagueId) !== 131) return { stats: [] };
    const random = rng([...String(params.sortStat)].reduce((acc, char) => acc + char.charCodeAt(0), 0));
    const generators = {
        homeRuns: () => ({ homeRuns: 3 + Math.floor(random() * 9) }),
        battingAverage: () => {
            const atBats = 120 + Math.floor(random() * 80);
            const hits = Math.round(atBats * (0.28 + random() * 0.08));
            return { avg: (hits / atBats).toFixed(3).replace(/^0/, ''), atBats, hits };
        },
        runsBattedIn: () => ({ rbi: 10 + Math.floor(random() * 20) }),
        onBasePlusSlugging: () => ({ ops: (0.78 + random() * 0.25).toFixed(3).replace(/^0/, '') }),
        hits: () => ({ hits: 20 + Math.floor(random() * 25) }),
        stolenBases: () => ({ stolenBases: 3 + Math.floor(random() * 12) }),
        earnedRunAverage: () => ({ era: (1.2 + random() * 2.2).toFixed(2), inningsPitched: `${30 + Math.floor(random() * 25)}.${Math.floor(random() * 3)}`, strikeOuts: 20 + Math.floor(random() * 35) }),
        strikeouts: () => ({ strikeOuts: 20 + Math.floor(random() * 30) }),
        wins: () => ({ wins: 2 + Math.floor(random() * 5) }),
        saves: () => ({ saves: 3 + Math.floor(random() * 10) }),
        walksAndHitsPerInningPitched: () => ({ whip: (0.85 + random() * 0.45).toFixed(2) })
    };
    const make = generators[params.sortStat];
    if (!make) return { stats: [] };
    const splits = Array.from({ length: Number(params.limit) || 5 }, (_, index) => {
        const teamId = pick(random, TEAM_IDS);
        const team = roster(teamId);
        const player = params.group === 'pitching' ? pick(random, team.pitchers) : pick(random, team.hitters);
        return { rank: index + 1, stat: make(), team: { id: teamId, name: TEAMS[teamId].name }, player: { id: player.id, fullName: player.fullName } };
    });
    const key = Object.keys(splits[0].stat)[0];
    splits.sort((a, b) => (params.order === 'asc' ? 1 : -1) * (parseFloat(a.stat[key]) - parseFloat(b.stat[key])));
    splits.forEach((split, index) => { split.rank = index + 1; });
    return { stats: [{ splits }] };
};

// ------------------------------------------------------------------ Estadísticas de jugadores (página Estadísticas)

const ipText = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
const rate = (num, den, digits = 3) => (den ? (num / den).toFixed(digits).replace(/^0(?=\.)/, '') : digits === 3 ? '.000' : '-.--');

/** Línea de bateo inventada pero coherente (H ≤ VB, extra bases ≤ H) */
const hittingLine = (random, player, games) => {
    const ab = Math.round(games * between(random, 2.8, 4.2));
    const h = Math.min(ab, Math.round(ab * player.avg * between(random, 0.85, 1.15)));
    const hr = Math.min(h, Math.round(games * player.power * between(random, 0.05, 0.22)));
    const d = Math.min(h - hr, Math.round(h * between(random, 0.12, 0.25)));
    const t = Math.min(h - hr - d, random() < 0.3 ? 1 : 0);
    const bb = Math.round(ab * between(random, 0.06, 0.14));
    const hbp = random() < 0.4 ? 1 : 0;
    const sf = random() < 0.4 ? 1 : 0;
    const tb = h + d + 2 * t + 3 * hr;
    const obp = (h + bb + hbp) / Math.max(1, ab + bb + hbp + sf);
    const slg = tb / Math.max(1, ab);
    return {
        gamesPlayed: games, plateAppearances: ab + bb + hbp + sf, atBats: ab, runs: Math.round(h * between(random, 0.3, 0.6)), hits: h, doubles: d, triples: t, homeRuns: hr,
        rbi: Math.round(h * between(random, 0.3, 0.7) + hr), baseOnBalls: bb, strikeOuts: Math.round(ab * between(random, 0.14, 0.28)), stolenBases: Math.floor(between(random, 0, games / 4)),
        caughtStealing: random() < 0.3 ? 1 : 0, hitByPitch: hbp, sacFlies: sf, avg: rate(h, ab), obp: rate(obp * 1000, 1000), slg: rate(slg * 1000, 1000), ops: rate((obp + slg) * 1000, 1000)
    };
};

const pitchingLine = (random, player, games, starter) => {
    const outs = Math.round(games * (starter ? between(random, 13, 17) : between(random, 2, 4)));
    const er = Math.round((outs / 27) * player.era);
    const h = Math.round((outs / 3) * between(random, 0.7, 1.1));
    const bb = Math.round((outs / 3) * between(random, 0.25, 0.45));
    return {
        gamesPlayed: games, gamesPitched: games, gamesStarted: starter ? games : 0, inningsPitched: ipText(outs), outs, wins: Math.min(games, player.wins), losses: Math.min(games, player.losses),
        saves: player.saves, holds: starter ? 0 : Math.floor(between(random, 0, 3)), strikeOuts: Math.round((outs / 3) * between(random, 0.7, 1.2)), baseOnBalls: bb, hits: h, earnedRuns: er,
        homeRuns: Math.floor(between(random, 0, games / 3)), era: outs ? ((er * 27) / outs).toFixed(2) : '-.--', whip: outs ? (((h + bb) * 3) / outs).toFixed(2) : '-.--'
    };
};

/** Toda la liga en una temporada: lo que devuelve /stats con playerPool=ALL */
const seasonSplits = (group, season) => {
    const games = Number(season) >= new Date().getUTCFullYear() ? 12 : 50;
    const splits = [];
    for (const teamId of TEAM_IDS) {
        const team = roster(teamId);
        const random = rng(teamId * 131 + Number(season) + (group === 'pitching' ? 7 : 0));
        const people = group === 'pitching' ? team.pitchers : team.hitters;
        people.forEach((player, index) => {
            const played = Math.max(1, Math.round(games * between(random, 0.6, 1)));
            const stat = group === 'pitching' ? pitchingLine(random, player, Math.ceil(played / (index === 0 ? 5 : 2)), index < 2) : hittingLine(random, player, played);
            splits.push({ season: String(season), stat, team: { id: teamId, name: TEAMS[teamId].name }, player: { id: player.id, fullName: player.fullName }, position: { abbreviation: player.pos } });
        });
    }
    return splits;
};

const findPerson = (personId) => {
    const teamId = Math.floor(Number(personId) / 1000);
    if (!TEAMS[teamId]) return null;
    const team = roster(teamId);
    const player = [...team.hitters, ...team.pitchers].find((item) => item.id === Number(personId));
    return player ? { teamId, player } : null;
};

/** /people/{id} con stats(season, gameLog, yearByYear) hidratados */
const person = (personId, params = {}) => {
    const found = findPerson(personId);
    if (!found) throw Object.assign(new Error('not found'), { response: { status: 404 } });
    const { teamId, player } = found;
    const season = Number((String(params.hydrate || '').match(/season=(\d{4})/) || [])[1]) || new Date().getUTCFullYear();
    const group = player.pos === 'P' ? 'pitching' : 'hitting';
    const total = seasonSplits(group, season).find((split) => split.player.id === player.id);
    const random = rng(player.id + season);
    const opponents = TEAM_IDS.filter((id) => id !== teamId);
    const games = Math.min(10, total.stat.gamesPlayed);
    const log = Array.from({ length: games }, (_, index) => {
        const date = new Date(Date.now() - (index + 1) * DAY).toISOString().slice(0, 10);
        const opponent = opponents[index % opponents.length];
        const stat = group === 'pitching' ? pitchingLine(random, player, 1, player.pos === 'P' && random() < 0.5) : hittingLine(random, player, 1);
        return { season: String(season), date, isHome: index % 2 === 0, isWin: random() < 0.5, opponent: { id: opponent, name: TEAMS[opponent].name }, team: { id: teamId, name: TEAMS[teamId].name }, game: { gamePk: 900000 + index * 10 + (teamId % 10) }, stat };
    });
    const years = [season, season - 1, season - 2, season - 3].map((year) => ({ ...seasonSplits(group, year).find((split) => split.player.id === player.id), season: String(year) }));
    const position = player.pos === 'P' ? { code: '1', abbreviation: 'P' } : { code: '9', abbreviation: player.pos };
    return {
        people: [
            {
                id: player.id, fullName: player.fullName, primaryNumber: String((player.id % 90) + 1), currentAge: 22 + (player.id % 14), birthDate: '1998-05-12', birthCity: 'San Pedro de Macorís',
                birthCountry: 'Dominican Republic', height: `6' ${player.id % 4}"`, weight: 180 + (player.id % 40), primaryPosition: position,
                batSide: { code: player.bats || 'R' }, pitchHand: { code: player.throws || 'R' }, currentTeam: { id: teamId, name: TEAMS[teamId].name },
                stats: [
                    { type: { displayName: 'season' }, group: { displayName: group }, splits: [total] },
                    { type: { displayName: 'gameLog' }, group: { displayName: group }, splits: log },
                    { type: { displayName: 'yearByYear' }, group: { displayName: group }, splits: years }
                ]
            }
        ]
    };
};

const get = async (url, params = {}) => {
    const path = url.replace(/^https?:\/\/[^/]+\/api\/v1(\.1)?/, '');
    let match;
    if ((match = path.match(/^\/game\/(\d+)\/feed\/live\/diffPatch$/))) {
        const game = findGame(match[1]);
        if (!game) throw Object.assign(new Error('not found'), { response: { status: 404 } });
        const feed = buildFeed(game);
        return params.startTimecode === feed.metaData.timeStamp ? [] : feed;
    }
    if ((match = path.match(/^\/game\/(\d+)\/feed\/live$/))) {
        const game = findGame(match[1]);
        if (!game) throw Object.assign(new Error('not found'), { response: { status: 404 } });
        return buildFeed(game);
    }
    if ((match = path.match(/^\/game\/(\d+)\/boxscore$/))) {
        const game = findGame(match[1]);
        if (!game) throw Object.assign(new Error('not found'), { response: { status: 404 } });
        return buildFeed(game).liveData.boxscore;
    }
    if (path === '/schedule') return schedule(params);
    if (path === '/standings') return standings(params);
    if (path === '/stats') {
        if (params.playerPool === 'ALL' && !params.sortStat) return Number(params.leagueId) === 131 ? { stats: [{ splits: seasonSplits(params.group, params.season) }] } : { stats: [] };
        return stats(params);
    }
    if (path === '/teams') return { teams: TEAM_IDS.map((id) => ({ id, name: TEAMS[id].name, abbreviation: TEAMS[id].abbreviation })) };
    if ((match = path.match(/^\/teams\/(\d+)\/roster$/))) {
        const team = roster(Number(match[1]));
        return { roster: [...team.hitters, ...team.pitchers].map((player) => ({ person: { id: player.id, fullName: player.fullName }, jerseyNumber: String((player.id % 90) + 1), position: { abbreviation: player.pos } })) };
    }
    if ((match = path.match(/^\/people\/(\d+)$/))) return person(match[1], params);
    if ((match = path.match(/^\/league\/(\d+)$/))) {
        return { leagues: [{ id: Number(match[1]), season: String(new Date().getUTCFullYear()), numGames: 50 }] };
    }
    throw Object.assign(new Error(`mock: ruta sin simular ${path}`), { response: { status: 404 } });
};

module.exports = { get, simulate, findGame, buildFeed, gamesForDay };
