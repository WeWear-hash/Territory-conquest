const GRID_W = 120;
const GRID_H = 68;
const CELL_COUNT = GRID_W * GRID_H;
const NEUTRAL = -1;
const WATER = -2;

const PLAYER_NAMES = [
  "Atlas", "Mira", "Cobalt", "Nova", "Ridge", "Orion", "Delta", "Vega",
  "Ember", "Iris", "Juno", "Slate", "Zed", "Echo", "Kite", "Vale"
];

const PLAYER_COLORS = [
  "#ff5d5d", "#5dc96f", "#4da5ff", "#f6c85f", "#c779ff", "#ff8a3d",
  "#4fd6d0", "#ff6fb1", "#b9e659", "#9ca6ff", "#f2f2f2", "#d6a36b"
];

const WORLD_ROWS = [
  "........................................................................................................................",
  "........................................................................................................................",
  "........................................................................................................................",
  "........................................................................................................................",
  ".....................#######..............................###########...................................................",
  ".................###############.....................#####################...............................................",
  "..............####################...............#############################...........................................",
  "............########################..........###################################.......................................",
  "..........###########################.......#########################################...................................",
  ".........#############################.....#############################################................................",
  "........###############################....###############################################..............................",
  ".......#################################..#################################################............................",
  ".......#################################..##################################################...........................",
  "......##################################...#################################################...........................",
  "......#################################.....################################################...........................",
  "......################################......###############################################............................",
  "......###############################.........############################################.............................",
  ".......############################..............#########################################.............................",
  "........##########################.................######################################..............................",
  ".........########################....................###################################...............................",
  "..........######################......................################################................................",
  "...........####################.........................#############################..................................",
  "............##################............................###########################..................................",
  ".............################...............................########################...................................",
  "...............#############...................................####################....................................",
  "................###########.......................................#################.....................................",
  "..................########.........................................###############.....................................",
  "...................######...........................................############.......................................",
  "....................#####............................................###########.......................................",
  ".....................####.............................................#########........................................",
  "......................###..............................................#######.........................................",
  ".......................##......................########................######..........................................",
  "............................................#############...............#####..........................................",
  "..........................................#################..............####..........................................",
  ".........................................###################.............###...........................................",
  "........................................#####################.........................................................",
  ".......................................#######################........................................................",
  ".......................................########################.......................................................",
  ".......................................#########################......................................................",
  "........................................########################......................................................",
  ".........................................######################.......................................................",
  "..........................................####################........................................................",
  "............................................################..........................................................",
  "..............................................##############..........................................................",
  "................................................##########............................................................",
  "..................................................######..............................................................",
  "...................................................####...............................................................",
  ".................................................................................#######...............................",
  "..............................................................................############............................",
  "............................................................................################..........................",
  "..........................................................................####################........................",
  "........................................................................########################......................",
  ".......................................................................##########################.....................",
  "......................................................................############################....................",
  "......................................................................#############################...................",
  ".......................................................................############################...................",
  ".........................................................................########################.....................",
  "...........................................................................####################.......................",
  ".............................................................................################.........................",
  "................................................................................##########............................",
  "...................................................................................#####..............................",
  "........................................................................................................................",
  "........................................................................................................................",
  "........................................................................................................................",
  "........................................................................................................................",
  "........................................................................................................................",
  "........................................................................................................................",
  "........................................................................................................................",
  "........................................................................................................................"
];

function createGame(options = {}) {
  const game = {
    width: GRID_W,
    height: GRID_H,
    tick: 0,
    phase: "select",
    mode: options.mode || "bots",
    localPlayerId: 0,
    selectedCell: -1,
    winnerId: null,
    message: "Select a starting land tile.",
    cells: new Int16Array(CELL_COUNT),
    armies: new Float32Array(CELL_COUNT),
    landMask: new Uint8Array(CELL_COUNT),
    players: []
  };

  buildWorld(game);
  addPlayer(game, {
    id: 0,
    name: options.name || "Commander",
    color: options.color || "#30a2ff",
    local: true,
    bot: false
  });

  return game;
}

function addBotPlayers(game, count = 9) {
  for (let i = 0; i < count; i += 1) {
    addPlayer(game, {
      name: PLAYER_NAMES[i % PLAYER_NAMES.length],
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      bot: true,
      local: false
    });
  }
}

function addRemotePlayer(game, config) {
  const existing = game.players.find((player) => player.remote);
  if (existing) {
    existing.name = config.name || existing.name;
    existing.color = config.color || existing.color;
    return existing;
  }

  return addPlayer(game, {
    id: 1,
    name: config.name || "Guest",
    color: config.color || "#ffcd4d",
    local: false,
    remote: true,
    bot: false
  });
}

function setHumanConfig(game, name, color) {
  const player = game.players[0];
  player.name = name || "Commander";
  player.color = color || "#30a2ff";
}

function selectStart(game, playerId, cell) {
  if (game.phase !== "select" || !isClaimableStart(game, cell)) {
    return false;
  }
  claimCluster(game, playerId, cell, 2, 75);
  const player = game.players[playerId];
  if (player) {
    player.alive = true;
    player.ready = true;
  }
  game.message = `${player?.name || "Player"} selected a start.`;
  return true;
}

function autoPlaceBots(game) {
  for (const player of game.players) {
    if (!player.bot || player.ready) {
      continue;
    }
    const start = pickDistantStart(game);
    if (start >= 0) {
      selectStart(game, player.id, start);
    }
  }
}

function startMatch(game) {
  const human = game.players[game.localPlayerId];
  if (!human || !human.ready) {
    game.message = "Select a starting land tile first.";
    return false;
  }
  const waiting = game.players.find((player) => player && !player.bot && !player.ready);
  if (waiting) {
    game.message = "Waiting for all players to choose a start.";
    return false;
  }
  for (const player of game.players) {
    if (!player.ready && player.bot) {
      const start = pickDistantStart(game);
      if (start >= 0) {
        selectStart(game, player.id, start);
      }
    }
  }
  game.phase = "play";
  game.message = "Match started.";
  return true;
}

function updateGame(game, dt, botCommands = []) {
  if (game.phase !== "play") {
    return;
  }

  game.tick += dt;
  growArmies(game, dt);

  for (const command of botCommands) {
    if (command.type === "attack") {
      attack(game, command.playerId, command.from, command.to, command.percent);
    } else if (command.type === "upgrade") {
      upgrade(game, command.playerId, command.kind);
    }
  }

  checkEliminations(game);
  checkWinner(game);
}

function attack(game, playerId, from, to, percent = 50) {
  if (game.phase !== "play") {
    return false;
  }
  if (!isIndex(from) || !isIndex(to) || !areNeighbors(from, to)) {
    return false;
  }
  if (game.cells[from] !== playerId || game.cells[to] === WATER) {
    return false;
  }

  const player = game.players[playerId];
  if (!player || !player.alive) {
    return false;
  }

  const sendRatio = clamp(percent, 5, 100) / 100;
  const available = Math.max(0, game.armies[from] - 8);
  const sent = Math.floor(available * sendRatio);
  if (sent < 4) {
    game.message = "Build more army before attacking.";
    return false;
  }

  game.armies[from] -= sent;
  const efficiency = 0.72 + player.upgrades.logistics * 0.07;
  const attackPower = sent * efficiency;
  const defenderId = game.cells[to];

  if (defenderId === NEUTRAL) {
    const neutralDefense = 15 + game.armies[to] * 0.55;
    if (attackPower >= neutralDefense) {
      game.cells[to] = playerId;
      game.armies[to] = Math.max(7, attackPower - neutralDefense + sent * 0.18);
      game.message = `${player.name} captured neutral land.`;
    } else {
      game.armies[to] += sent * 0.22;
    }
    return true;
  }

  const defender = game.players[defenderId];
  const fortify = defender ? 1 + defender.upgrades.fortification * 0.11 : 1;
  const defense = game.armies[to] * fortify;
  if (attackPower > defense) {
    game.cells[to] = playerId;
    game.armies[to] = Math.max(5, (attackPower - defense) * 0.75);
    game.message = `${player.name} broke through.`;
  } else {
    game.armies[to] = Math.max(1, game.armies[to] - attackPower / fortify);
  }
  return true;
}

function upgrade(game, playerId, kind) {
  const player = game.players[playerId];
  if (!player || !player.alive || !player.upgrades[kind] && player.upgrades[kind] !== 0) {
    return false;
  }
  const level = player.upgrades[kind];
  if (level >= 5) {
    game.message = "Upgrade already maxed.";
    return false;
  }
  const cost = 220 + level * 170;
  const pool = getPlayerArmy(game, playerId);
  if (pool < cost) {
    game.message = `Need ${cost} army for ${kind}.`;
    return false;
  }
  drainArmy(game, playerId, cost);
  player.upgrades[kind] += 1;
  game.message = `${player.name} upgraded ${kind}.`;
  return true;
}

function getPlayerLand(game, playerId) {
  let land = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (game.cells[i] === playerId) {
      land += 1;
    }
  }
  return land;
}

function getPlayerArmy(game, playerId) {
  let army = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (game.cells[i] === playerId) {
      army += game.armies[i];
    }
  }
  return army;
}

function getIncome(game, playerId) {
  const player = game.players[playerId];
  if (!player) {
    return 0;
  }
  return getPlayerLand(game, playerId) * (0.75 + player.upgrades.economy * 0.18);
}

function getLeaderboard(game) {
  return game.players
    .map((player) => ({
      ...player,
      land: getPlayerLand(game, player.id),
      army: Math.floor(getPlayerArmy(game, player.id))
    }))
    .filter((player) => player.land > 0 || player.ready)
    .sort((a, b) => b.land - a.land || b.army - a.army);
}

function getCellFromPoint(game, x, y, canvas) {
  const rect = canvas.getBoundingClientRect();
  const cellX = Math.floor(((x - rect.left) / rect.width) * game.width);
  const cellY = Math.floor(((y - rect.top) / rect.height) * game.height);
  if (cellX < 0 || cellY < 0 || cellX >= game.width || cellY >= game.height) {
    return -1;
  }
  return cellY * game.width + cellX;
}

function isClaimableStart(game, cell) {
  return isIndex(cell) && game.landMask[cell] === 1 && game.cells[cell] === NEUTRAL;
}

function isOwnedNeighbor(game, playerId, target) {
  return getNeighbors(target).some((neighbor) => game.cells[neighbor] === playerId);
}

function serializeGame(game) {
  return {
    width: game.width,
    height: game.height,
    tick: game.tick,
    phase: game.phase,
    selectedCell: game.selectedCell,
    winnerId: game.winnerId,
    message: game.message,
    cells: Array.from(game.cells),
    armies: Array.from(game.armies, (value) => Math.round(value * 10) / 10),
    players: game.players
  };
}

function applySnapshot(game, snapshot) {
  game.tick = snapshot.tick;
  game.phase = snapshot.phase;
  game.selectedCell = snapshot.selectedCell;
  game.winnerId = snapshot.winnerId;
  game.message = snapshot.message;
  game.players = snapshot.players;
  game.cells.set(snapshot.cells);
  game.armies.set(snapshot.armies);
}

function cellCenter(cell) {
  return {
    x: cell % GRID_W,
    y: Math.floor(cell / GRID_W)
  };
}

function addPlayer(game, config) {
  const id = config.id ?? game.players.length;
  const player = {
    id,
    name: config.name || `Player ${id + 1}`,
    color: config.color || PLAYER_COLORS[id % PLAYER_COLORS.length],
    bot: Boolean(config.bot),
    local: Boolean(config.local),
    remote: Boolean(config.remote),
    alive: false,
    ready: false,
    upgrades: { economy: 0, logistics: 0, fortification: 0 }
  };
  game.players[id] = player;
  return player;
}

function buildWorld(game) {
  for (let y = 0; y < GRID_H; y += 1) {
    const source = WORLD_ROWS[y] || "";
    for (let x = 0; x < GRID_W; x += 1) {
      const index = y * GRID_W + x;
      const land = source[x] === "#";
      game.landMask[index] = land ? 1 : 0;
      game.cells[index] = land ? NEUTRAL : WATER;
      game.armies[index] = land ? 8 + Math.random() * 10 : 0;
    }
  }
}

function claimCluster(game, playerId, center, radius, army) {
  const c = cellCenter(center);
  for (let y = c.y - radius; y <= c.y + radius; y += 1) {
    for (let x = c.x - radius; x <= c.x + radius; x += 1) {
      const index = y * GRID_W + x;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) {
        continue;
      }
      if (game.cells[index] === NEUTRAL && game.landMask[index] === 1) {
        const dist = Math.abs(x - c.x) + Math.abs(y - c.y);
        if (dist <= radius + 1) {
          game.cells[index] = playerId;
          game.armies[index] = army - dist * 9;
        }
      }
    }
  }
}

function pickDistantStart(game) {
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < 260; i += 1) {
    const cell = Math.floor(Math.random() * CELL_COUNT);
    if (!isClaimableStart(game, cell)) {
      continue;
    }
    const score = distanceFromOwned(game, cell) + Math.random() * 12;
    if (score > bestScore) {
      best = cell;
      bestScore = score;
    }
  }
  return best;
}

function distanceFromOwned(game, cell) {
  const c = cellCenter(cell);
  let best = 999;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (game.cells[i] >= 0) {
      const point = cellCenter(i);
      best = Math.min(best, Math.abs(c.x - point.x) + Math.abs(c.y - point.y));
    }
  }
  return best === 999 ? 999 : best;
}

function growArmies(game, dt) {
  for (const player of game.players) {
    if (!player || !player.alive) {
      continue;
    }
    const income = 0.75 + player.upgrades.economy * 0.18;
    for (let i = 0; i < CELL_COUNT; i += 1) {
      if (game.cells[i] === player.id) {
        const cap = 260 + getPlayerLand(game, player.id) * 2.8;
        game.armies[i] = Math.min(cap, game.armies[i] + income * dt);
      }
    }
  }
}

function drainArmy(game, playerId, amount) {
  let remaining = amount;
  for (let i = 0; i < CELL_COUNT && remaining > 0; i += 1) {
    if (game.cells[i] !== playerId) {
      continue;
    }
    const drain = Math.min(game.armies[i] * 0.7, remaining);
    game.armies[i] -= drain;
    remaining -= drain;
  }
}

function checkEliminations(game) {
  for (const player of game.players) {
    if (player && player.alive && getPlayerLand(game, player.id) === 0) {
      player.alive = false;
      game.message = `${player.name} was eliminated.`;
    }
  }
}

function checkWinner(game) {
  const alive = game.players.filter((player) => player?.alive && getPlayerLand(game, player.id) > 0);
  if (alive.length === 1) {
    game.phase = "ended";
    game.winnerId = alive[0].id;
    game.message = `${alive[0].name} conquered the world.`;
  }
}

function getNeighbors(cell) {
  const x = cell % GRID_W;
  const y = Math.floor(cell / GRID_W);
  const neighbors = [];
  if (x > 0) neighbors.push(cell - 1);
  if (x < GRID_W - 1) neighbors.push(cell + 1);
  if (y > 0) neighbors.push(cell - GRID_W);
  if (y < GRID_H - 1) neighbors.push(cell + GRID_W);
  return neighbors;
}

function areNeighbors(a, b) {
  return getNeighbors(a).includes(b);
}

function isIndex(cell) {
  return Number.isInteger(cell) && cell >= 0 && cell < CELL_COUNT;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
