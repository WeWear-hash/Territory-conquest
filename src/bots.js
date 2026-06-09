
const THINK_RATE = 0.55;

function createBotController() {
  return {
    elapsed: 0,
    update(game, dt) {
      this.elapsed += dt;
      if (this.elapsed < THINK_RATE || game.phase !== "play") {
        return [];
      }
      this.elapsed = 0;
      const commands = [];
      for (const player of game.players) {
        if (!player?.bot || !player.alive) {
          continue;
        }
        const command = chooseBotCommand(game, player.id);
        if (command) {
          commands.push(command);
        }
      }
      return commands;
    }
  };
}

function runBotCommands(game, commands) {
  for (const command of commands) {
    if (command.type === "attack") {
      attack(game, command.playerId, command.from, command.to, command.percent);
    } else if (command.type === "upgrade") {
      upgrade(game, command.playerId, command.kind);
    }
  }
}

function chooseBotCommand(game, playerId) {
  const army = getPlayerArmy(game, playerId);
  const land = getPlayerLand(game, playerId);
  const player = game.players[playerId];
  if (army > 420 && land > 18 && Math.random() < 0.13) {
    const kinds = ["economy", "logistics", "fortification"];
    const kind = kinds.reduce((best, next) => player.upgrades[next] < player.upgrades[best] ? next : best, kinds[0]);
    return { type: "upgrade", playerId, kind };
  }

  const borders = findBorders(game, playerId);
  if (!borders.length) {
    return null;
  }

  borders.sort((a, b) => scoreTarget(game, b) - scoreTarget(game, a));
  const pick = borders[Math.floor(Math.random() * Math.min(5, borders.length))] || borders[0];
  return {
    type: "attack",
    playerId,
    from: pick.from,
    to: pick.to,
    percent: land < 12 ? 72 : 42 + Math.floor(Math.random() * 34)
  };
}

function findBorders(game, playerId) {
  const borders = [];
  for (let i = 0; i < game.cells.length; i += 1) {
    if (game.cells[i] !== playerId || game.armies[i] < 18) {
      continue;
    }
    for (const to of neighbors(game, i)) {
      if (game.cells[to] !== playerId && game.cells[to] !== -2) {
        borders.push({ from: i, to });
      }
    }
  }
  return borders;
}

function scoreTarget(game, border) {
  const owner = game.cells[border.to];
  const targetArmy = game.armies[border.to] || 1;
  const base = owner === -1 ? 80 : 38;
  const from = cellCenter(border.from);
  const to = cellCenter(border.to);
  const centerBias = 24 - Math.abs(to.x - game.width / 2) * 0.08 - Math.abs(to.y - game.height / 2) * 0.1;
  return base + centerBias + game.armies[border.from] * 0.2 - targetArmy * 0.35 + Math.random() * 20;
}

function neighbors(game, cell) {
  const x = cell % game.width;
  const y = Math.floor(cell / game.width);
  const result = [];
  if (x > 0) result.push(cell - 1);
  if (x < game.width - 1) result.push(cell + 1);
  if (y > 0) result.push(cell - game.width);
  if (y < game.height - 1) result.push(cell + game.width);
  return result;
}
