const { MLB_API_BASE } = require('../../config/constants');
const http = require('../http'); // por el módulo: las pruebas sustituyen http.mlbGet
const { getLiveFeed } = require('../liveFeed');
const mlb = require('../mlbService');
const { cached } = require('../../utils/cache');
const { gameState } = require('../../utils/transformers');
const { leagueOf } = require('./games');

// Extras PRO de un juego (GET /v2/game/:pk/pro) a partir del mismo feed de MLB que usa el detalle del Lite: rastreo de
// cada pitcheo, recorrido de los corredores, acciones, box score completo, umpires, viento, retos, ritmo y récords del
// juego. Lo que MLB no manda llega en null (nunca se inventa). Con ?since=N solo vienen las jugadas desde la N
// (en vivo la app pide solo lo nuevo) y sin `players`.

const num = (value, decimals = 1) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10 ** decimals) / 10 ** decimals : undefined);
const intOr = (value, fallback = null) => {
    const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback;
};
const zero = (value) => intOr(value, 0);
const text = (value) => (typeof value === 'string' && value.trim() ? value : null);
const ref = (person) => (person?.id ? { id: person.id, name: person.fullName || '' } : null);
/** Quita las llaves sin valor (los pitcheos sin rastreo quedan chicos) */
const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

/** «20251130_230832» (timeStamp de MLB, UTC) → ISO */
const isoOfStamp = (stamp) => {
    const match = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(String(stamp || ''));
    return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z` : null;
};

/** «03:12:00» → 192 (minutos) / «00:00:17» → 17 (segundos) */
const clock = (value) => {
    const parts = String(value || '').split(':').map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

// ---------------------------------------------------------------- clima

const WIND_FIELD = { LF: -45, CF: 0, RF: 45 };

/** «8 mph, Out To CF» → velocidad, hacia dónde y en qué grados (0 = hacia el center, 90 = hacia el right) */
const windOf = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const [speed, ...rest] = raw.split(',');
    const mph = intOr((speed.match(/(\d+)/) || [])[1]);
    const description = rest.join(',').trim() || speed.replace(/^\s*\d+\s*mph\s*/i, '').trim();
    const field = (description.match(/\b(LF|CF|RF)\b/) || [])[1] || null;
    let dir = null;
    let deg = null;
    if (/^calm|none/i.test(description) || mph === 0) dir = 'calm';
    else if (/varies/i.test(description)) dir = 'varies';
    else if (/^out/i.test(description)) {
        dir = 'out';
        deg = field ? WIND_FIELD[field] : null;
    } else if (/^in/i.test(description)) {
        dir = 'in';
        deg = field ? (WIND_FIELD[field] === 0 ? 180 : WIND_FIELD[field] > 0 ? -135 : 135) : null;
    } else if (/^L To R/i.test(description)) {
        dir = 'cross';
        deg = 90;
    } else if (/^R To L/i.test(description)) {
        dir = 'cross';
        deg = -90;
    }
    return { mph, text: description, dir, field: dir === 'out' || dir === 'in' ? field : null, deg };
};

const weatherOf = (weather) => {
    if (!weather || (!weather.condition && !weather.temp && !weather.wind)) return null;
    const tempF = intOr(weather.temp);
    return { condition: text(weather.condition), tempF, tempC: tempF === null ? null : Math.round(((tempF - 32) * 5) / 9), wind: windOf(weather.wind) };
};

// ---------------------------------------------------------------- jugadas

const reviewOf = (review) => (review ? { type: review.reviewType || null, over: !!review.isOverturned, team: review.challengeTeamId ?? null, player: review.player?.id ?? null } : undefined);

const secondsFrom = (t0, time) => {
    const start = Date.parse(t0 || '');
    const at = Date.parse(time || '');
    return Number.isFinite(start) && Number.isFinite(at) ? Math.round((at - start) / 100) / 10 : undefined;
};

const pitchOf = (event, t0) => {
    const data = event.pitchData || {};
    const c = data.coordinates || {};
    const b = data.breaks || {};
    return compact({
        n: event.pitchNumber ?? undefined,
        end: num(data.endSpeed),
        ext: num(data.extension, 2),
        pt: num(data.plateTime, 3),
        ivb: num(b.breakVerticalInduced),
        hb: num(b.breakHorizontal),
        sd: num(b.spinDirection, 0),
        pfxX: num(c.pfxX, 2),
        pfxZ: num(c.pfxZ, 2),
        x0: num(c.x0, 3),
        z0: num(c.z0, 3),
        vx0: num(c.vX0, 3),
        vy0: num(c.vY0, 3),
        vz0: num(c.vZ0, 3),
        ax: num(c.aX, 3),
        ay: num(c.aY, 3),
        az: num(c.aZ, 3),
        t: secondsFrom(t0, event.startTime),
        rev: reviewOf(event.reviewDetails)
    });
};

const runnerOf = (runner) => {
    const movement = runner.movement || {};
    const details = runner.details || {};
    return compact({
        id: details.runner?.id ?? undefined,
        from: movement.originBase || undefined,
        to: movement.end || undefined,
        out: movement.isOut ? true : undefined,
        outBase: movement.isOut ? movement.outBase || undefined : undefined,
        outNum: movement.isOut ? movement.outNumber ?? undefined : undefined,
        event: details.eventType || undefined,
        reason: details.movementReason || undefined,
        scored: details.isScoringEvent || movement.end === 'score' ? true : undefined,
        earned: details.isScoringEvent || movement.end === 'score' ? !!details.earned : undefined,
        rbi: details.rbi ? true : undefined,
        pitcher: details.responsiblePitcher?.id ?? undefined,
        credits: (runner.credits || []).length ? runner.credits.map((credit) => ({ id: credit.player?.id ?? null, pos: intOr(credit.position?.code), c: credit.credit || null })) : undefined
    });
};

const SKIPPED_ACTIONS = new Set(['game_advisory']);

/**
 * Las jugadas desde `since`. `lastPitcher` lleva el lanzador de cada equipo a la defensa (para «a quién reemplaza» en
 * un cambio de lanzador).
 */
const playsOf = (allPlays, t0, since) => {
    const lastPitcher = new Map();
    const out = [];
    allPlays.forEach((play, index) => {
        const about = play.about || {};
        const i = about.atBatIndex ?? index;
        const fielding = about.isTopInning ? 'home' : 'away';
        const events = play.playEvents || [];
        let pitches = 0;
        const actions = [];
        for (const event of events) {
            if (event.isPitch) {
                pitches += 1;
                continue;
            }
            const type = event.details?.eventType || event.type;
            if (!type || SKIPPED_ACTIONS.has(type) || /^Status Change/.test(event.details?.description || '')) continue;
            let replaced = event.replacedPlayer?.id ?? undefined;
            if (type === 'pitching_substitution' && replaced === undefined) replaced = lastPitcher.get(fielding) ?? null;
            actions.push(
                compact({
                    k: pitches,
                    type,
                    desc: event.details?.description || undefined,
                    player: event.player?.id ?? undefined,
                    replaced,
                    pos: event.position?.abbreviation || undefined,
                    out: event.details?.isOut ? true : undefined,
                    t: secondsFrom(t0, event.startTime)
                })
            );
            if (type === 'pitching_substitution' && event.player?.id) lastPitcher.set(fielding, event.player.id);
        }
        if (play.matchup?.pitcher?.id) lastPitcher.set(fielding, play.matchup.pitcher.id);
        if (since !== null && i < since) return;
        const last = [...events].reverse().find((event) => event.hitData);
        out.push(
            compact({
                i,
                ci: about.captivatingIndex ?? undefined,
                start: about.startTime || undefined,
                end: about.endTime || undefined,
                loc: intOr(last?.hitData?.location) ?? undefined,
                runners: (play.runners || []).map(runnerOf),
                pitches: events.filter((event) => event.isPitch).map((event) => pitchOf(event, t0)),
                actions,
                review: reviewOf(play.reviewDetails)
            })
        );
    });
    return out;
};

// ---------------------------------------------------------------- box score

const seasonPitching = (s = {}) => ({
    w: intOr(s.wins),
    l: intOr(s.losses),
    sv: intOr(s.saves),
    hld: intOr(s.holds),
    era: text(s.era),
    whip: text(s.whip),
    ip: text(s.inningsPitched),
    g: intOr(s.gamesPitched ?? s.gamesPlayed),
    k9: text(s.strikeoutsPer9Inn),
    bb9: text(s.walksPer9Inn)
});

const seasonHitting = (s = {}) => ({ avg: text(s.avg), obp: text(s.obp), slg: text(s.slg), ops: text(s.ops) });

/** Game Score v2 (el de MLB): 40 + 2 por out + ponches − 2 por boleto y hit − 3 por carrera − 6 por jonrón */
const gameScoreOf = (p = {}) => {
    if (typeof p.gameScore === 'number') return p.gameScore;
    if (!p.battersFaced && !p.outs) return null;
    return 40 + 2 * zero(p.outs) + zero(p.strikeOuts) - 2 * zero(p.baseOnBalls) - 2 * zero(p.hits) - 3 * zero(p.runs) - 6 * zero(p.homeRuns);
};

/** «2-for-9.» → { h: 2, ab: 9 } */
const rispOf = (info) => {
    for (const block of info || []) {
        const field = (block.fieldList || []).find((item) => /RISP/i.test(item.label || ''));
        const match = /(\d+)-for-(\d+)/.exec(field?.value || '');
        if (match) return { h: Number(match[1]), ab: Number(match[2]) };
    }
    return null;
};

/** Primera y última entrada en que lanzó cada lanzador */
const inningsOf = (allPlays) => {
    const spans = new Map();
    for (const play of allPlays) {
        const id = play.matchup?.pitcher?.id;
        const inning = play.about?.inning;
        if (!id || typeof inning !== 'number') continue;
        const span = spans.get(id);
        spans.set(id, span ? [Math.min(span[0], inning), Math.max(span[1], inning)] : [inning, inning]);
    }
    return spans;
};

const boxTeamOf = (team = {}, people, spans) => {
    const player = (id) => team.players?.[`ID${id}`] || {};
    const person = (id) => people[`ID${id}`] || {};
    const batters = (team.batters || [])
        .map((id) => ({ id, p: player(id) }))
        .filter(({ p }) => p.battingOrder)
        .sort((a, b) => Number(a.p.battingOrder) - Number(b.p.battingOrder))
        .map(({ id, p }) => {
            const s = p.stats?.batting || {};
            const season = p.seasonStats?.batting || {};
            const positions = (p.allPositions || []).map((pos) => pos.abbreviation).filter(Boolean);
            return {
                id,
                order: intOr(p.battingOrder),
                pos: positions.length ? positions.join('-') : p.position?.abbreviation || '',
                number: text(p.jerseyNumber),
                note: text(String(s.note || '').replace(/-$/, '')),
                pa: intOr(s.plateAppearances),
                d: zero(s.doubles),
                t: zero(s.triples),
                sb: zero(s.stolenBases),
                cs: zero(s.caughtStealing),
                hbp: zero(s.hitByPitch),
                sf: zero(s.sacFlies),
                sh: zero(s.sacBunts),
                ibb: zero(s.intentionalWalks),
                gidp: zero(s.groundIntoDoublePlay),
                tb: intOr(s.totalBases),
                lob: zero(s.leftOnBase),
                season: { ...seasonHitting(season), hr: intOr(season.homeRuns), rbi: intOr(season.rbi), sb: intOr(season.stolenBases) }
            };
        });
    const pitchers = (team.pitchers || []).map((id, index) => {
        const p = player(id);
        const s = p.stats?.pitching || {};
        return {
            id,
            number: text(p.jerseyNumber),
            throws: person(id).pitchHand?.code || null,
            starter: index === 0,
            inn: spans.get(id) || null,
            bf: intOr(s.battersFaced),
            outs: intOr(s.outs),
            go: intOr(s.groundOuts),
            ao: intOr(s.airOuts),
            np: intOr(s.numberOfPitches ?? s.pitchesThrown),
            st: intOr(s.strikes),
            b: intOr(s.balls),
            ir: zero(s.inheritedRunners),
            irs: zero(s.inheritedRunnersScored),
            hld: zero(s.holds),
            bs: zero(s.blownSaves),
            wp: zero(s.wildPitches),
            bk: zero(s.balks),
            pk: zero(s.pickoffs),
            hbp: zero(s.hitBatsmen),
            gs: gameScoreOf(s),
            season: seasonPitching(p.seasonStats?.pitching)
        };
    });
    const bullpen = (team.bullpen || []).map((id) => ({ id, number: text(player(id).jerseyNumber), throws: person(id).pitchHand?.code || null, season: seasonPitching(player(id).seasonStats?.pitching) }));
    const bench = (team.bench || []).map((id) => {
        const p = player(id);
        const season = p.seasonStats?.batting || {};
        return { id, number: text(p.jerseyNumber), pos: p.position?.abbreviation || null, bats: person(id).batSide?.code || null, season: { ...seasonHitting(season), hr: intOr(season.homeRuns), ab: intOr(season.atBats) } };
    });
    const totals = team.teamStats?.batting || {};
    return {
        batters,
        pitchers,
        bullpen,
        bench,
        notes: (team.note || []).map((item) => ({ label: String(item.label ?? ''), value: String(item.value ?? '') })),
        info: (team.info || []).map((block) => ({ title: block.title || '', fields: (block.fieldList || []).map((field) => ({ label: field.label || '', value: field.value ?? null })) })),
        totals: {
            d: intOr(totals.doubles),
            t: intOr(totals.triples),
            sb: intOr(totals.stolenBases),
            cs: intOr(totals.caughtStealing),
            hbp: intOr(totals.hitByPitch),
            sf: intOr(totals.sacFlies),
            tb: intOr(totals.totalBases),
            gidp: intOr(totals.groundIntoDoublePlay),
            obp: text(totals.obp),
            slg: text(totals.slg),
            ops: text(totals.ops),
            risp: rispOf(team.info),
            lob: intOr(totals.leftOnBase)
        }
    };
};

// ---------------------------------------------------------------- resumen del juego

const half = (line = {}) => ({ r: intOr(line.runs), h: intOr(line.hits), e: intOr(line.errors), lob: intOr(line.leftOnBase) });

const absOf = (gameData, allPlays, teams) => {
    const raw = gameData.absChallenges;
    if (raw && (raw.away || raw.home)) {
        const side = (value = {}) => ({ ok: zero(value.usedSuccessful), fail: zero(value.usedFailed), left: intOr(value.remaining) });
        return { away: side(raw.away), home: side(raw.home) };
    }
    // Sin el resumen de MLB: los retos (type «MJ») que aparecen en los pitcheos y en los turnos
    const counts = { away: { ok: 0, fail: 0, left: null }, home: { ok: 0, fail: 0, left: null } };
    let seen = 0;
    for (const play of allPlays) {
        const reviews = [...(play.playEvents || []).map((event) => event.reviewDetails), play.reviewDetails].filter((review) => review?.reviewType === 'MJ' && !review.inProgress);
        for (const review of reviews) {
            const side = review.challengeTeamId === teams.away ? 'away' : review.challengeTeamId === teams.home ? 'home' : null;
            if (!side) continue;
            seen += 1;
            counts[side][review.isOverturned ? 'ok' : 'fail'] += 1;
        }
    }
    return seen ? counts : null;
};

const usedLeft = (raw) => (raw && (raw.away || raw.home) ? { away: { used: zero(raw.away?.used), left: intOr(raw.away?.remaining) }, home: { used: zero(raw.home?.used), left: intOr(raw.home?.remaining) } } : null);

/** Segundos promedio entre pitcheos seguidos del mismo lanzador dentro del turno */
const paceOf = (allPlays) => {
    const totals = new Map();
    for (const play of allPlays) {
        const id = play.matchup?.pitcher?.id;
        const times = (play.playEvents || []).filter((event) => event.isPitch).map((event) => Date.parse(event.startTime || '')).filter(Number.isFinite);
        if (!id || times.length < 2) continue;
        const row = totals.get(id) || { sum: 0, n: 0 };
        for (let k = 1; k < times.length; k++) {
            const gap = (times[k] - times[k - 1]) / 1000;
            // Una pausa larga (visita, revisión, lesión) no es ritmo
            if (gap > 0 && gap < 60) {
                row.sum += gap;
                row.n += 1;
            }
        }
        totals.set(id, row);
    }
    return [...totals].filter(([, row]) => row.n > 0).map(([id, row]) => ({ id, sec: Math.round((row.sum / row.n) * 10) / 10, n: row.n }));
};

const recordsOf = (allPlays) => {
    let fastest = null;
    let hardest = null;
    let longest = null;
    let longestPA = null;
    allPlays.forEach((play, index) => {
        const i = play.about?.atBatIndex ?? index;
        const batter = play.matchup?.batter?.id ?? null;
        const pitcher = play.matchup?.pitcher?.id ?? null;
        const event = play.result?.eventType || null;
        const pitches = (play.playEvents || []).filter((item) => item.isPitch);
        for (const pitch of pitches) {
            const mph = pitch.pitchData?.startSpeed;
            if (typeof mph === 'number' && (!fastest || mph > fastest.mph)) fastest = { mph, pitcher, type: pitch.details?.type?.code || null, i, n: pitch.pitchNumber ?? null };
            const hit = pitch.hitData;
            if (hit && typeof hit.launchSpeed === 'number' && (!hardest || hit.launchSpeed > hardest.ev)) hardest = { ev: hit.launchSpeed, la: hit.launchAngle ?? null, dist: hit.totalDistance ?? null, batter, event, i };
            if (hit && typeof hit.totalDistance === 'number' && (!longest || hit.totalDistance > longest.dist)) longest = { dist: hit.totalDistance, ev: hit.launchSpeed ?? null, batter, event, i };
        }
        if (play.about?.isComplete && pitches.length && (!longestPA || pitches.length > longestPA.pitches)) longestPA = { pitches: pitches.length, batter, pitcher, i };
    });
    return { fastest, hardest, longest, longestPA };
};

/** Duelo en curso: cuántas veces se han visto hoy antes de este turno y la vuelta del lanzador por el orden */
const currentOf = (doc, state) => {
    const play = doc.liveData?.plays?.currentPlay;
    if (state !== 'live' || !play?.matchup?.batter?.id || play.about?.isComplete) return null;
    const batter = play.matchup.batter.id;
    const pitcher = play.matchup.pitcher?.id ?? null;
    const i = play.about?.atBatIndex ?? null;
    const before = (doc.liveData.plays.allPlays || []).filter((item) => (item.about?.atBatIndex ?? -1) < (i ?? Infinity) && item.about?.isComplete);
    const faced = before.filter((item) => item.matchup?.batter?.id === batter && item.matchup?.pitcher?.id === pitcher).length;
    const byPitcher = before.filter((item) => item.matchup?.pitcher?.id === pitcher).length;
    const splits = play.matchup.splits ? { batter: play.matchup.splits.batter, pitcher: play.matchup.splits.pitcher, menOnBase: play.matchup.splits.menOnBase } : null;
    return { i, batter, pitcher, splits, faced, tto: pitcher ? Math.floor(byPitcher / 9) + 1 : 1 };
};

const fieldOf = (info) => {
    if (!info) return null;
    const field = {
        capacity: intOr(info.capacity),
        leftLine: intOr(info.leftLine),
        leftCenter: intOr(info.leftCenter),
        center: intOr(info.center),
        rightCenter: intOr(info.rightCenter),
        rightLine: intOr(info.rightLine),
        turf: info.turfType || null,
        roof: info.roofType || null
    };
    return Object.values(field).some((value) => value !== null) ? field : null;
};

const playersOf = (people, boxTeams) => {
    const sideOf = new Map();
    const number = new Map();
    for (const team of Object.values(boxTeams)) {
        for (const player of Object.values(team?.players || {})) {
            if (!player.person?.id) continue;
            sideOf.set(player.person.id, team.team?.id ?? null);
            if (player.jerseyNumber) number.set(player.person.id, String(player.jerseyNumber));
        }
    }
    return Object.fromEntries(
        Object.values(people || {})
            .filter((p) => p?.id)
            .map((p) => [
                p.id,
                {
                    id: p.id,
                    name: p.fullName || '',
                    short: p.boxscoreName || p.lastName || p.fullName || '',
                    first: p.useName || p.firstName || null,
                    last: p.useLastName || p.lastName || null,
                    number: number.get(p.id) ?? p.primaryNumber ?? null,
                    teamId: sideOf.get(p.id) ?? null,
                    pos: p.primaryPosition?.abbreviation || null,
                    bats: p.batSide?.code || null,
                    throws: p.pitchHand?.code || null,
                    age: intOr(p.currentAge),
                    country: p.birthCountry || null,
                    city: p.birthCity || null,
                    height: p.height || null,
                    weight: intOr(p.weight),
                    debut: p.mlbDebutDate || null
                }
            ])
    );
};

/** Feed crudo de MLB → GamePro (sin la serie ni el ritmo de la liga, que se piden aparte) */
const buildGamePro = (doc, since = null) => {
    if (!doc?.gameData || !doc?.liveData) throw new Error('Invalid Game Data received from MLB API');
    const gameData = doc.gameData;
    const live = doc.liveData;
    const status = gameData.status || {};
    const state = gameState(status);
    const allPlays = live.plays?.allPlays || [];
    const pitchEvents = allPlays.flatMap((play) => (play.playEvents || []).filter((event) => event.isPitch));
    const t0 = pitchEvents.map((event) => event.startTime).filter(Boolean).sort()[0] || null;
    const zonePitch = pitchEvents.find((event) => typeof event.pitchData?.strikeZoneWidth === 'number');
    const boxTeams = live.boxscore?.teams || {};
    const people = gameData.players || {};
    const spans = inningsOf(allPlays);
    const teams = { away: gameData.teams?.away?.id ?? boxTeams.away?.team?.id ?? null, home: gameData.teams?.home?.id ?? boxTeams.home?.team?.id ?? null };
    const linescore = live.linescore || {};
    const info = gameData.gameInfo || {};
    const offense = linescore.offense || {};
    const defense = linescore.defense || {};
    const started = state !== 'preview';
    const doubleHeader = ['Y', 'S'].includes(gameData.game?.doubleHeader) ? gameData.game.doubleHeader : null;
    const officials = (live.boxscore?.officials || []).filter((item) => item.official?.id).map((item) => ({ type: item.officialType || '', id: item.official.id, name: item.official.fullName || '' }));

    return {
        gamePk: gameData.game?.pk ?? null,
        state,
        detailedState: status.detailedState || '',
        reason: status.reason || null,
        date: gameData.datetime?.dateTime || null,
        updatedAt: isoOfStamp(doc.metaData?.timeStamp),
        tracking: {
            type: gameData.game?.gamedayType || null,
            pitches: pitchEvents.length,
            speed: pitchEvents.filter((event) => typeof event.pitchData?.startSpeed === 'number').length,
            breaks: pitchEvents.filter((event) => typeof event.pitchData?.breaks?.breakVerticalInduced === 'number').length
        },
        zoneSize: zonePitch ? { width: num(zonePitch.pitchData.strikeZoneWidth) ?? null, depth: num(zonePitch.pitchData.strikeZoneDepth) ?? null } : null,
        t0,
        game: {
            doubleHeader,
            gameNumber: intOr(gameData.game?.gameNumber),
            dayNight: ['day', 'night'].includes(gameData.datetime?.dayNight) ? gameData.datetime.dayNight : null,
            firstPitch: info.firstPitch || null,
            durationMin: intOr(info.gameDurationMinutes),
            delayMin: intOr(info.delayDurationMinutes),
            venue: { id: gameData.venue?.id ?? null, name: gameData.venue?.name || '', field: fieldOf(gameData.venue?.fieldInfo) },
            weather: weatherOf(gameData.weather),
            officials
        },
        flags: { noHitter: !!gameData.flags?.noHitter, perfectGame: !!gameData.flags?.perfectGame },
        abs: absOf(gameData, allPlays, teams),
        review: usedLeft(gameData.review),
        moundVisits: usedLeft(gameData.moundVisits),
        linescore: (linescore.innings || []).map((inning) => ({ n: inning.num, away: half(inning.away), home: half(inning.home) })),
        totals: started && linescore.teams ? { away: half(linescore.teams.away), home: half(linescore.teams.home) } : null,
        offense:
            state === 'live'
                ? { batter: ref(offense.batter), onDeck: ref(offense.onDeck), inHole: ref(offense.inHole), first: ref(offense.first), second: ref(offense.second), third: ref(offense.third), teamId: offense.team?.id ?? null }
                : null,
        defense:
            state === 'live'
                ? {
                      teamId: defense.team?.id ?? null,
                      pitcher: ref(defense.pitcher),
                      catcher: ref(defense.catcher),
                      first: ref(defense.first),
                      second: ref(defense.second),
                      third: ref(defense.third),
                      shortstop: ref(defense.shortstop),
                      left: ref(defense.left),
                      center: ref(defense.center),
                      right: ref(defense.right)
                  }
                : null,
        current: currentOf(doc, state),
        box: { away: boxTeamOf(boxTeams.away, people, spans), home: boxTeamOf(boxTeams.home, people, spans) },
        notes: (live.boxscore?.info || []).filter((item) => item.label).map((item) => ({ label: item.label, value: item.value ?? null })),
        topPerformers: (live.boxscore?.topPerformers || [])
            .filter((item) => item.player?.person?.id)
            .map((item) => {
                const id = item.player.person.id;
                const teamId = Object.values(boxTeams).find((team) => team?.players?.[`ID${id}`])?.team?.id ?? null;
                const stats = item.player.stats || {};
                return {
                    type: ['starter', 'reliever', 'hitter'].includes(item.type) ? item.type : null,
                    id,
                    teamId,
                    name: item.player.person.fullName || '',
                    gameScore: intOr(item.gameScore ?? item.pitchingGameScore ?? item.hittingGameScore),
                    summary: text(item.type === 'hitter' ? stats.batting?.summary : stats.pitching?.summary) ?? text(stats.batting?.summary) ?? text(stats.pitching?.summary)
                };
            }),
        pace: paceOf(allPlays),
        records: recordsOf(allPlays),
        schedule: null,
        leaguePace: null,
        total: allPlays.length,
        since,
        plays: playsOf(allPlays, t0, since),
        ...(since === null ? { players: playersOf(people, boxTeams) } : {})
    };
};

// ---------------------------------------------------------------- serie y ritmo de la liga (aparte, con caché)

/** Serie y número de juego del calendario de MLB (null si MLB no lo tiene) */
const scheduleOf = (gamePk, live) =>
    cached(
        `pro_game_schedule_${gamePk}`,
        live ? 60 : 6 * 3600,
        async () => {
            const data = await http.mlbGet(`${MLB_API_BASE}/schedule`, { gamePk, hydrate: 'seriesStatus' });
            const game = (data?.dates || []).flatMap((date) => date.games || []).find((item) => String(item.gamePk) === String(gamePk));
            if (!game) return null;
            return {
                gameType: game.gameType || null,
                description: game.seriesDescription || game.description || null,
                seriesGameNumber: intOr(game.seriesGameNumber),
                gamesInSeries: intOr(game.gamesInSeries),
                ifNecessary: game.ifNecessary === 'Y',
                series: game.seriesStatus ? mlb.toSeries(game) : null
            };
        },
        { staleSec: 3600 }
    ).catch(() => null);

/** Promedios de la liga en la temporada (/gamePace): duración, segundos por pitcheo, pitcheos, carreras, lanzadores */
const leaguePaceOf = (leagueKey, season) => {
    const league = leagueOf(leagueKey);
    if (!season) return Promise.resolve(null);
    return cached(
        `pro_game_pace_${league.id}_${season}`,
        6 * 3600,
        async () => {
            const data = await http.mlbGet(`${MLB_API_BASE}/gamePace`, { season, leagueIds: league.leagueId, sportId: league.sportId });
            const row = data?.leagues?.[0] || data?.sports?.[0];
            if (!row) return null;
            const minutes = clock(row.timePerGame);
            return {
                season: Number(season),
                games: zero(row.totalGames),
                minutesPerGame: minutes === null ? null : Math.round(minutes / 60),
                secondsPerPitch: clock(row.timePerPitch),
                pitchesPerGame: typeof row.pitchesPerGame === 'number' ? Math.round(row.pitchesPerGame * 10) / 10 : null,
                runsPerGame: typeof row.runsPerGame === 'number' ? Math.round(row.runsPerGame * 100) / 100 : null,
                pitchersPerGame: typeof row.pitchersPerGame === 'number' ? Math.round(row.pitchersPerGame * 10) / 10 : null
            };
        },
        { staleSec: 86400 }
    ).catch(() => null);
};

const leagueKeyOf = (gameData) => {
    const ids = [gameData?.teams?.home?.league?.id, gameData?.teams?.away?.league?.id];
    if (ids.includes(160)) return 'wbc';
    if (ids.includes(162)) return 'sdc';
    return 'lidom';
};

// Lo calculado se reutiliza mientras el feed no cambie (version de liveFeed)
const built = new Map();

/** GamePro de un juego; `since` = desde qué turno (null = todo) */
const fetchGamePro = async (gamePk, since = null) => {
    const { doc, version } = await getLiveFeed(gamePk);
    if (!doc?.gameData?.game?.pk) throw Object.assign(new Error(`game ${gamePk} not found`), { response: { status: 404 } });
    const key = `${gamePk}:${since ?? 'all'}`;
    let data = built.get(key)?.version === version ? built.get(key).data : null;
    if (!data) {
        data = buildGamePro(doc, since);
        built.set(key, { version, data });
        if (built.size > 60) built.delete(built.keys().next().value);
    }
    const isMock = process.env.MLB_MOCK === '1';
    const [schedule, leaguePace] = isMock ? [null, null] : await Promise.all([scheduleOf(gamePk, data.state === 'live'), leaguePaceOf(leagueKeyOf(doc.gameData), doc.gameData.game?.season)]);
    return { ...data, schedule, leaguePace };
};

module.exports = { buildGamePro, fetchGamePro, windOf, isoOfStamp, gameScoreOf };
