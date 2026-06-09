
const WATER_COLOR = "#243649";
const LAND_COLOR = "#536452";
const NEUTRAL_COLOR = "#7c8b6e";
const GRID_LINE = "rgba(0, 0, 0, 0.12)";
const SELECT = "#ffffff";

function createRenderer(canvas) {
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  return { canvas, context };
}

function renderGame(renderer, game) {
  const { canvas, context } = renderer;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = WATER_COLOR;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const cellW = canvas.width / game.width;
  const cellH = canvas.height / game.height;

  for (let y = 0; y < game.height; y += 1) {
    for (let x = 0; x < game.width; x += 1) {
      const index = y * game.width + x;
      const owner = game.cells[index];
      if (owner === WATER) {
        continue;
      }
      context.fillStyle = getCellColor(game, index, owner);
      context.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
    }
  }

  context.strokeStyle = GRID_LINE;
  context.lineWidth = 1;
  for (let x = 0; x <= game.width; x += 4) {
    const px = Math.floor(x * cellW);
    context.beginPath();
    context.moveTo(px, 0);
    context.lineTo(px, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= game.height; y += 4) {
    const py = Math.floor(y * cellH);
    context.beginPath();
    context.moveTo(0, py);
    context.lineTo(canvas.width, py);
    context.stroke();
  }

  drawBorders(context, game, cellW, cellH);
  drawSelected(context, game, cellW, cellH);
  drawLabels(context, game, cellW, cellH);
}

function updateHud(game, elements) {
  const local = game.players[game.localPlayerId];
  const army = local ? Math.floor(getPlayerArmy(game, local.id)) : 0;
  const land = local ? getPlayerLand(game, local.id) : 0;
  const income = local ? getIncome(game, local.id).toFixed(1) : "0.0";

  elements.armyStat.textContent = compact(army);
  elements.landStat.textContent = compact(land);
  elements.incomeStat.textContent = `${income}/s`;
  elements.status.textContent = game.message;

  const selected = game.selectedCell;
  if (selected >= 0) {
    const owner = game.cells[selected];
    const label = owner === NEUTRAL ? "Neutral" : owner === WATER ? "Water" : game.players[owner]?.name || "Player";
    elements.selectedInfo.textContent = label;
  } else {
    elements.selectedInfo.textContent = "No target";
  }

  elements.leaderboard.innerHTML = "";
  for (const player of getLeaderboard(game).slice(0, 10)) {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = player.color;
    const name = document.createElement("span");
    name.textContent = player.name;
    const score = document.createElement("strong");
    score.textContent = `${player.land} / ${compact(player.army)}`;
    item.append(swatch, name, score);
    elements.leaderboard.append(item);
  }
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.floor(rect.width * scale);
  const height = Math.floor(rect.height * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function getCellColor(game, index, owner) {
  if (owner === NEUTRAL) {
    const shade = Math.min(28, Math.floor(game.armies[index] * 0.45));
    return tint(NEUTRAL_COLOR, shade);
  }
  const player = game.players[owner];
  return player ? tint(player.color, Math.min(24, Math.floor(game.armies[index] * 0.08))) : LAND_COLOR;
}

function drawBorders(context, game, cellW, cellH) {
  context.fillStyle = "rgba(0, 0, 0, 0.28)";
  for (let i = 0; i < game.cells.length; i += 1) {
    const owner = game.cells[i];
    if (owner < 0) {
      continue;
    }
    const x = i % game.width;
    const y = Math.floor(i / game.width);
    const right = x < game.width - 1 ? game.cells[i + 1] : WATER;
    const down = y < game.height - 1 ? game.cells[i + game.width] : WATER;
    if (right !== owner) {
      context.fillRect(Math.floor((x + 1) * cellW) - 1, Math.floor(y * cellH), 1, Math.ceil(cellH));
    }
    if (down !== owner) {
      context.fillRect(Math.floor(x * cellW), Math.floor((y + 1) * cellH) - 1, Math.ceil(cellW), 1);
    }
  }
}

function drawSelected(context, game, cellW, cellH) {
  if (game.selectedCell < 0) {
    return;
  }
  const point = cellCenter(game.selectedCell);
  context.strokeStyle = SELECT;
  context.lineWidth = 2;
  context.strokeRect(
    Math.floor(point.x * cellW) - 1,
    Math.floor(point.y * cellH) - 1,
    Math.ceil(cellW) + 2,
    Math.ceil(cellH) + 2
  );
}

function drawLabels(context, game, cellW, cellH) {
  context.font = "bold 12px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const player of game.players) {
    if (!player?.alive && !player?.ready) {
      continue;
    }
    const center = territoryCenter(game, player.id);
    if (!center) {
      continue;
    }
    context.fillStyle = "rgba(0, 0, 0, 0.55)";
    context.fillText(player.name, center.x * cellW + 1, center.y * cellH + 1);
    context.fillStyle = "#ffffff";
    context.fillText(player.name, center.x * cellW, center.y * cellH);
  }
}

function territoryCenter(game, playerId) {
  let x = 0;
  let y = 0;
  let count = 0;
  for (let i = 0; i < game.cells.length; i += 1) {
    if (game.cells[i] === playerId) {
      const point = cellCenter(i);
      x += point.x;
      y += point.y;
      count += 1;
    }
  }
  if (!count) {
    return null;
  }
  return { x: x / count, y: y / count };
}

function tint(hex, amount) {
  const color = hex.replace("#", "");
  const r = clampByte(parseInt(color.slice(0, 2), 16) + amount);
  const g = clampByte(parseInt(color.slice(2, 4), 16) + amount);
  const b = clampByte(parseInt(color.slice(4, 6), 16) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function compact(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
