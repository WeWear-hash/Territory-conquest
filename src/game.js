(function () {
  const TC = window.TC = window.TC || {};

  const WORLD_W = 1280;
  const WORLD_H = 760;
  const COLS = 16;
  const ROWS = 10;
  const LAND_MARGIN = 42;
  const NEUTRAL = -1;

  const UPGRADES = {
    economy: { label: "Economy", desc: "Faster army growth", baseCost: 120, max: 5 },
    logistics: { label: "Logistics", desc: "Faster army movement", baseCost: 110, max: 5 },
    defense: { label: "Defense", desc: "Stronger home resistance", baseCost: 100, max: 5 },
    tactics: { label: "Tactics", desc: "Better attack efficiency", baseCost: 130, max: 5 }
  };

  const PLAYER_COLORS = [
    "#57a6ff",
    "#f25f5c",
    "#70c45c",
    "#f4c95d",
    "#b889ff",
    "#ff8a4c",
    "#55d6c2",
    "#e66ad3"
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function randFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function territoryCenter(t) {
    return { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  }

  function makePlayer(id, name, isBot) {
    return {
      id,
      name,
      isBot,
      color: PLAYER_COLORS[id % PLAYER_COLORS.length],
      alive: true,
      upgrades: { economy: 0, logistics: 0, defense: 0, tactics: 0 }
    };
  }

  function createTerritories() {
    const territories = [];
    const cellW = (WORLD_W - LAND_MARGIN * 2) / COLS;
    const cellH = (WORLD_H - LAND_MARGIN * 2) / ROWS;
    const occupied = new Set();

    const continents = [
      { x: 2, y: 1, w: 4, h: 4 },
      { x: 6, y: 1, w: 3, h: 7 },
      { x: 9, y: 2, w: 5, h: 5 },
      { x: 3, y: 6, w: 4, h: 3 },
      { x: 12, y: 6, w: 3, h: 3 },
      { x: 1, y: 4, w: 2, h: 3 }
    ];

    continents.forEach((shape) => {
      for (let yy = shape.y; yy < shape.y + shape.h; yy++) {
        for (let xx = shape.x; xx < shape.x + shape.w; xx++) {
          const edge = xx === shape.x || yy === shape.y || xx === shape.x + shape.w - 1 || yy === shape.y + shape.h - 1;
          const keep = !edge || Math.random() > 0.22;
          if (keep && xx >= 0 && yy >= 0 && xx < COLS && yy < ROWS) {
            occupied.add(`${xx},${yy}`);
          }
        }
      }
    });

    occupied.forEach((key) => {
      const [cx, cy] = key.split(",").map(Number);
      const jitterX = (Math.random() - 0.5) * 12;
      const jitterY = (Math.random() - 0.5) * 12;
      territories.push({
        id: territories.length,
        col: cx,
        row: cy,
        x: LAND_MARGIN + cx * cellW + 4 + jitterX,
        y: LAND_MARGIN + cy * cellH + 4 + jitterY,
        w: cellW - 8,
        h: cellH - 8,
        owner: NEUTRAL,
        army: Math.floor(32 + Math.random() * 28),
        selected: false,
        neighbors: []
      });
    });

    territories.forEach((a) => {
      territories.forEach((b) => {
        if (a.id === b.id) return;
        const dx = Math.abs(a.col - b.col);
        const dy = Math.abs(a.row - b.row);
        if (dx + dy === 1 || (dx === 1 && dy === 1 && Math.random() > 0.68)) {
          a.neighbors.push(b.id);
        }
      });
    });

    return territories;
  }

  function createState(options) {
    const botCount = options && Number.isFinite(options.botCount) ? options.botCount : 5;
    const players = [makePlayer(0, "You", false)];
    for (let i = 1; i <= botCount; i++) {
      players.push(makePlayer(i, `Bot ${i}`, true));
    }

    return {
      width: WORLD_W,
      height: WORLD_H,
      mode: "single",
      phase: "setup",
      localPlayerId: 0,
      host: true,
      tick: 0,
      nextGroupId: 1,
      selectedTerritoryId: null,
      selectedGroupId: null,
      splitRatio: 0.5,
      winner: null,
      message: "Choose a starting land.",
      players,
      territories: createTerritories(),
      groups: [],
      effects: [],
      commands: []
    };
  }

  function getPlayer(state, id) {
    return state.players.find((p) => p.id === id);
  }

  function ownedTerritories(state, playerId) {
    return state.territories.filter((t) => t.owner === playerId);
  }

  function totalArmy(state, playerId) {
    const land = ownedTerritories(state, playerId).reduce((sum, t) => sum + t.army, 0);
    const moving = state.groups.filter((g) => g.owner === playerId).reduce((sum, g) => sum + g.army, 0);
    return Math.floor(land + moving);
  }

  function spendableArmy(state, playerId) {
    return Math.floor(ownedTerritories(state, playerId).reduce((sum, land) => sum + Math.max(0, land.army - 18), 0));
  }

  function playerCost(state, playerId, upgradeKey) {
    const player = getPlayer(state, playerId);
    const level = player.upgrades[upgradeKey];
    return Math.floor(UPGRADES[upgradeKey].baseCost * Math.pow(1.55, level));
  }

  function applyCommand(state, command) {
    if (!command || state.winner !== null) return false;
    const playerId = command.playerId;
    if (!getPlayer(state, playerId)) return false;

    if (command.type === "selectStart") {
      return selectStart(state, playerId, command.territoryId);
    }
    if (command.type === "moveArmy") {
      return moveArmy(state, playerId, command.fromId, command.targetId, command.ratio);
    }
    if (command.type === "splitArmy") {
      state.splitRatio = clamp(command.ratio, 0.25, 1);
      return true;
    }
    if (command.type === "retreatArmy") {
      return retreatArmy(state, playerId, command.groupId);
    }
    if (command.type === "buyUpgrade") {
      return buyUpgrade(state, playerId, command.upgrade);
    }
    return false;
  }

  function selectStart(state, playerId, territoryId) {
    const territory = state.territories[territoryId];
    if (!territory || territory.owner !== NEUTRAL) return false;
    territory.owner = playerId;
    territory.army = 160;
    state.phase = "playing";
    state.message = "Expand, upgrade, and outmaneuver your enemies.";
    return true;
  }

  function moveArmy(state, playerId, fromId, targetId, ratio) {
    const from = state.territories[fromId];
    const target = state.territories[targetId];
    if (!from || !target || from.owner !== playerId || from.id === target.id) return false;
    const available = Math.max(0, from.army - 12);
    const amount = Math.floor(available * clamp(ratio || state.splitRatio, 0.25, 1));
    if (amount < 8) return false;
    const start = territoryCenter(from);
    const end = territoryCenter(target);
    from.army -= amount;
    state.groups.push({
      id: state.nextGroupId++,
      owner: playerId,
      army: amount,
      x: start.x,
      y: start.y,
      fromId,
      targetId,
      targetX: end.x,
      targetY: end.y,
      retreating: false
    });
    state.selectedGroupId = state.nextGroupId - 1;
    state.selectedTerritoryId = null;
    return true;
  }

  function retreatArmy(state, playerId, groupId) {
    const group = state.groups.find((g) => g.id === groupId && g.owner === playerId);
    if (!group) return false;
    const homes = ownedTerritories(state, playerId);
    if (!homes.length) return false;
    let best = homes[0];
    let bestDist = Infinity;
    homes.forEach((territory) => {
      const center = territoryCenter(territory);
      const d = Math.hypot(group.x - center.x, group.y - center.y);
      if (d < bestDist) {
        best = territory;
        bestDist = d;
      }
    });
    const center = territoryCenter(best);
    group.targetId = best.id;
    group.targetX = center.x;
    group.targetY = center.y;
    group.retreating = true;
    state.message = "Selected army is retreating.";
    return true;
  }

  function buyUpgrade(state, playerId, upgradeKey) {
    if (!UPGRADES[upgradeKey]) return false;
    const player = getPlayer(state, playerId);
    if (player.upgrades[upgradeKey] >= UPGRADES[upgradeKey].max) return false;
    const cost = playerCost(state, playerId, upgradeKey);
    const lands = ownedTerritories(state, playerId).sort((a, b) => b.army - a.army);
    const spendable = spendableArmy(state, playerId);
    if (spendable < cost) return false;
    let remaining = cost;
    for (const land of lands) {
      const take = Math.min(Math.max(0, land.army - 18), remaining);
      land.army -= take;
      remaining -= take;
      if (remaining <= 0) break;
    }
    player.upgrades[upgradeKey]++;
    state.effects.push({ type: "text", text: `${UPGRADES[upgradeKey].label} +1`, x: 650, y: 70, ttl: 80, color: player.color });
    return true;
  }

  function update(state, dt) {
    if (state.winner !== null) return;
    state.tick++;
    growArmies(state);
    updateGroups(state, dt);
    updateEffects(state);
    updateAlive(state);
    checkWinner(state);
  }

  function growArmies(state) {
    state.players.forEach((player) => {
      if (!player.alive) return;
      const growth = 0.075 + player.upgrades.economy * 0.024;
      ownedTerritories(state, player.id).forEach((territory) => {
        const cap = 420 + player.upgrades.economy * 80;
        territory.army = Math.min(cap, territory.army + growth);
      });
    });
  }

  function updateGroups(state, dt) {
    const arrivals = [];
    state.groups.forEach((group) => {
      const player = getPlayer(state, group.owner);
      const speed = (1.05 + player.upgrades.logistics * 0.2) * dt * 0.12;
      const dx = group.targetX - group.x;
      const dy = group.targetY - group.y;
      const d = Math.hypot(dx, dy);
      if (d <= speed + 2) {
        group.x = group.targetX;
        group.y = group.targetY;
        arrivals.push(group);
      } else {
        group.x += dx / d * speed;
        group.y += dy / d * speed;
      }
    });

    arrivals.forEach((group) => {
      resolveArrival(state, group);
      state.groups = state.groups.filter((g) => g.id !== group.id);
    });
  }

  function resolveArrival(state, group) {
    const target = state.territories[group.targetId];
    if (!target) return;
    const attacker = getPlayer(state, group.owner);
    const defender = getPlayer(state, target.owner);

    if (target.owner === group.owner) {
      target.army += group.army;
      state.effects.push({ type: "text", text: `+${Math.floor(group.army)}`, x: group.x, y: group.y, ttl: 48, color: attacker.color });
      return;
    }

    const attackPower = group.army * (1 + attacker.upgrades.tactics * 0.12);
    const defensePower = target.army * (target.owner === NEUTRAL ? 0.72 : 1 + (defender ? defender.upgrades.defense * 0.12 : 0));
    const swing = attackPower - defensePower;
    state.effects.push({
      type: "battle",
      x: group.x,
      y: group.y,
      ttl: 36,
      color: swing > 0 ? attacker.color : (defender ? defender.color : "#8b94a3")
    });

    if (swing > 0) {
      target.owner = group.owner;
      target.army = Math.max(10, swing * 0.72);
      state.message = `${attacker.name} captured territory ${target.id + 1}.`;
    } else {
      target.army = Math.max(8, Math.abs(swing) * 0.82);
    }
  }

  function updateEffects(state) {
    state.effects.forEach((effect) => {
      effect.ttl--;
      if (effect.type === "text") effect.y -= 0.35;
    });
    state.effects = state.effects.filter((effect) => effect.ttl > 0);
  }

  function updateAlive(state) {
    state.players.forEach((player) => {
      player.alive = ownedTerritories(state, player.id).length > 0 || state.groups.some((g) => g.owner === player.id);
    });
  }

  function checkWinner(state) {
    const alive = state.players.filter((p) => p.alive);
    if (state.phase === "playing" && alive.length === 1) {
      state.winner = alive[0].id;
      state.message = `${alive[0].name} controls the world.`;
    }
  }

  function findTerritoryAt(state, x, y) {
    for (let i = state.territories.length - 1; i >= 0; i--) {
      const t = state.territories[i];
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        return t;
      }
    }
    return null;
  }

  function findGroupAt(state, x, y, playerId) {
    let found = null;
    state.groups.forEach((group) => {
      if (playerId !== undefined && group.owner !== playerId) return;
      if (Math.hypot(group.x - x, group.y - y) < 18) found = group;
    });
    return found;
  }

  function exportState(state) {
    return JSON.parse(JSON.stringify({
      width: state.width,
      height: state.height,
      mode: state.mode,
      phase: state.phase,
      localPlayerId: state.localPlayerId,
      host: state.host,
      tick: state.tick,
      nextGroupId: state.nextGroupId,
      selectedTerritoryId: state.selectedTerritoryId,
      selectedGroupId: state.selectedGroupId,
      splitRatio: state.splitRatio,
      winner: state.winner,
      message: state.message,
      players: state.players,
      territories: state.territories,
      groups: state.groups,
      effects: []
    }));
  }

  function importState(target, source) {
    Object.keys(target).forEach((key) => delete target[key]);
    Object.assign(target, source);
  }

  TC.Game = {
    NEUTRAL,
    UPGRADES,
    createState,
    update,
    applyCommand,
    findTerritoryAt,
    findGroupAt,
    ownedTerritories,
    totalArmy,
    spendableArmy,
    territoryCenter,
    playerCost,
    exportState,
    importState,
    clamp,
    dist,
    randFrom
  };
})();
