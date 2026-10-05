// One race of the balance measurement (docs/superpowers/specs/
// 2026-10-05-balance-design.md), run in the real game page: the player's car
// (Leclerc's Ferrari unless told otherwise) is driven by an autopilot that
// drives like a decent human, against the field with the game's own physics,
// AI and power-ups, from the back of the grid or from pole. Loaded into the
// page by tools/balance/measure.js and tools/checks/balance-check.js; defines
// window.Comeback.
//
// The autopilot: no line noise and no mistakes; corners at 0.88 of the limit
// (Pro CPUs dare 0.85, Legend 0.93); it looks for the lane with the most room
// ahead to pass in, and uses its items as a sensible player would.
(function () {
  function seeded(seed) {
    let s = (seed * 2654435761) >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function race({ diff, trackId, seed, start = "back", driverId = "leclerc" }) {
    const realRandom = Math.random;
    const realControls = window.controlsFor;
    const realUse = window.useItem;
    const realSpin = window.spinRacer;
    Math.random = seeded(seed);
    try {
      const ci = CUPS.findIndex((cup) => !cup.season && cup.tracks.some((t) => t.id === trackId));
      const ti = CUPS[ci].tracks.findIndex((t) => t.id === trackId);
      state.selectedDriver = DRIVERS.findIndex((d) => d.id === driverId);
      state.selectedCup = ci;
      state.activeCupIndex = ci;
      state.activeCup = CUPS[ci];
      state.cupPlayers = 1;
      state.difficulty = diff;
      state.cupDifficulty = diff;
      state.cupWeatherMode = "dry";
      buildCupEntries();
      state.qualifying = null;
      if (start === "pole") {
        const me = state.cupEntries.find((e) => e.isPlayer).driver.id;
        state.qualifying = { raceIndex: ti, order: [me, ...state.cupEntries.map((e) => e.driver.id).filter((id) => id !== me)] };
      }
      startRace(ti);
      state.weather = "dry";
      state.headless = true;
      state.phase = "race";
      state.preparing = null;
      const t0 = 100000;
      let now = t0;
      state.raceStart = now;
      state.racers.forEach((r) => { r.lapStartAt = now; });
      const player = getPlayer();
      const L = state.track.totalLength;
      const route = getItemRoute(state.track);
      const skill = { cornerMargin: 0.88 };
      const ap = { lat: player.lat || 0, want: 0 };
      const dt = PHYSICS_DT;
      const placeOf = (r) => getSortedRacers().indexOf(r) + 1;

      // The autopilot's controls, read by updateRacer through controlsFor.
      let controls = { throttle: 1, brake: 0, steer: 0, drift: false, item: false };
      window.controlsFor = (racer) => (racer === player ? controls : realControls(racer));
      // What the player's items gained, and what spun the player.
      const uses = [];
      window.useItem = function (racer, t, opts) {
        if (racer === player && racer.currentItem !== "none" && !(opts && opts.trail)) {
          uses.push({ item: racer.currentItem, at: t, place: placeOf(player) });
        }
        return realUse(racer, t, opts);
      };
      const spins = [];
      window.spinRacer = function (racer, duration, t) {
        const spun = realSpin(racer, duration, t);
        if (spun && racer === player) spins.push(duration);
        return spun;
      };

      // How far the road is clear ahead in a lane.
      const room = (d, lat) => {
        let free = 220;
        for (const o of state.racers) {
          if (o === player || o.finished) continue;
          const a = PowerUps.wrapDelta(o.trackDistance || 0, d, L);
          if (a > -10 && a < 220 && Math.abs(o.lat - lat) < 20) free = Math.min(free, Math.max(0, a));
        }
        return free;
      };

      function drive(t) {
        const d = player.trackDistance || 0;
        const lim = route.halfWidthAt(d) - 14;
        // The lane with the most room ahead (sticking with the one it has
        // unless another is clearly better); the racing line when all are clear.
        let bestLat = ap.want;
        let bestScore = room(d, ap.want) + 25;
        for (let lat = -lim; lat <= lim + 0.1; lat += lim / 4) {
          const score = room(d, lat) - Math.abs(lat - ap.lat) * 0.25 - Math.abs(lat) * 0.05;
          if (score > bestScore) { bestScore = score; bestLat = lat; }
        }
        if (room(d, 0) >= 220 && room(d, ap.want) >= 220) bestLat = 0;
        ap.want = Math.max(-lim, Math.min(lim, bestLat));
        ap.lat += Math.max(-70 * dt, Math.min(70 * dt, ap.want - ap.lat));
        const aim = route.toWorld(d + 76 + Math.abs(player.speed) * 0.52, ap.lat);
        const angleDiff = normalizeAngle(Math.atan2(aim.y - player.y, aim.x - player.x) - player.heading);
        const brake = mustBrakeForCorners(player, skill);
        controls = {
          throttle: brake ? 0 : 1, brake: brake ? 1 : 0,
          steer: Math.max(-1, Math.min(1, angleDiff * 1.7)),
          drift: Math.abs(angleDiff) > 0.48 && player.speed > 80, item: false,
        };
        // Items, as a sensible player uses them.
        const item = player.currentItem;
        if (item === "none" || player.spinUntil > t) return;
        const ahead = carAhead(player);
        const aheadGap = ahead ? getRaceProgress(ahead) - getRaceProgress(player) : Infinity;
        if (item === "drs" || item === "overtakeMode") {
          if (PowerUps.isStraight(route, d) || aheadGap < 60) useItem(player, t);
        } else if (item === "undercut") {
          if (ahead) useItem(player, t);
        } else if (item === "debris") {
          if ((aheadGap < 120 && Math.abs(ahead.lat - player.lat) < 20) || t - player.itemHeldSince > 8000) useItem(player, t);
        } else if (item === "oilSlick") {
          const behind = PowerUps.nearestGaps({ id: player.id, d }, itemBodies(), L).behind;
          if (player.trailingOil) {
            if (t - player.trailSince > 6000) releaseTrail(player, t);
          } else if (behind !== null && behind < 60) {
            useItem(player, t, { trail: true });
          } else if (t - player.itemHeldSince > 8000) useItem(player, t);
        } else {
          useItem(player, t);
        }
      }

      // Stuck: a car less than 60 ahead in the player's lane (not while the
      // Safety Car holds everyone). An episode is a second or more stuck
      // behind the same car; it failed if that car is still ahead at the end.
      let stuckTime = 0;
      let episode = null;
      const episodes = [];
      const placeTrace = [];
      const startPlace = placeOf(player);
      let time = 0;
      while (time < 900 && !player.finished) {
        now += dt * 1000;
        time += dt;
        drive(now);
        updateRace(dt, now);
        const d = player.trackDistance || 0;
        let close = null;
        let gap = 60;
        if (!safetyCarActive(now)) {
          for (const o of state.racers) {
            if (o === player || o.finished) continue;
            const a = PowerUps.wrapDelta(o.trackDistance || 0, d, L);
            if (a > 0 && a < gap && Math.abs(o.lat - player.lat) < 26) { close = o; gap = a; }
          }
        }
        if (close) stuckTime += dt;
        if (close && (!episode || episode.car !== close)) {
          if (episode) episodes.push(episode);
          episode = { car: close, from: time, to: time };
        } else if (close) {
          episode.to = time;
        } else if (episode && time - episode.to > 0.5) {
          episodes.push(episode);
          episode = null;
        }
        if (Math.round(time * 60) % 60 === 0) placeTrace.push(placeOf(player));
      }
      if (episode) episodes.push(episode);
      const blocked = episodes.filter((e) => e.to - e.from >= 1);
      settleFinishers();
      const finished = state.racers.filter((r) => r.finished);
      return {
        diff, trackId, seed, start, startPlace,
        finish: player.finishPosition || placeOf(player),
        simSeconds: Math.round(time),
        laps: state.track.laps,
        stuckFrac: +(stuckTime / time).toFixed(3),
        episodes: blocked.length,
        failed: blocked.filter((e) => getRaceProgress(e.car) > getRaceProgress(player)).length,
        // Places gained in the 8 s after each item was used.
        itemGains: uses.map((u) => {
          const later = placeTrace[Math.min(placeTrace.length - 1, Math.round((u.at - t0) / 1000) + 8)];
          return { item: u.item, gain: later === undefined ? 0 : u.place - later };
        }),
        spins,
        gapToWinner: player.finished ? (player.finishTime - Math.min(...finished.map((r) => r.finishTime))) / 1000 : null,
      };
    } finally {
      Math.random = realRandom;
      window.controlsFor = realControls;
      window.useItem = realUse;
      window.spinRacer = realSpin;
    }
  }

  window.Comeback = { race };
}());
