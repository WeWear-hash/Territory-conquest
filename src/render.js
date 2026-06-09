(function () {
  const TC = window.TC = window.TC || {};

  function createRenderer(canvas) {
    const ctx = canvas.getContext("2d");
    const view = { scale: 1, offsetX: 0, offsetY: 0 };
    ctx.imageSmoothingEnabled = false;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      view.scale = Math.min(rect.width / 1280, rect.height / 760);
      view.offsetX = Math.floor((rect.width - 1280 * view.scale) / 2);
      view.offsetY = Math.floor((rect.height - 760 * view.scale) / 2);
    }

    function screenToWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.offsetX) / view.scale,
        y: (clientY - rect.top - view.offsetY) / view.scale
      };
    }

    function render(state) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.save();
      ctx.translate(view.offsetX, view.offsetY);
      ctx.scale(view.scale, view.scale);
      drawOcean(ctx, state);
      drawPixelLandShadow(ctx, state);
      drawTerritories(ctx, state);
      drawGroups(ctx, state);
      drawEffects(ctx, state);
      drawBanner(ctx, state);
      ctx.restore();
    }

    resize();
    window.addEventListener("resize", resize);
    return { render, resize, screenToWorld };
  }

  function drawOcean(ctx, state) {
    ctx.fillStyle = "#0b1d2b";
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.fillStyle = "#0f2638";
    for (let y = 0; y < state.height; y += 24) {
      for (let x = (y / 24) % 2 ? 12 : 0; x < state.width; x += 48) {
        ctx.fillRect(x, y, 24, 2);
      }
    }
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x < state.width; x += 96) {
      ctx.fillRect(x, 0, 2, state.height);
    }
    for (let y = 0; y < state.height; y += 96) {
      ctx.fillRect(0, y, state.width, 2);
    }
  }

  function drawPixelLandShadow(ctx, state) {
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    state.territories.forEach((territory) => {
      ctx.fillRect(territory.x + 5, territory.y + 6, territory.w, territory.h);
    });
  }

  function drawTerritories(ctx, state) {
    const byId = new Map(state.territories.map((t) => [t.id, t]));
    state.territories.forEach((territory) => {
      const owner = state.players.find((p) => p.id === territory.owner);
      const selected = state.selectedTerritoryId === territory.id;
      const base = owner ? owner.color : "#6f7d72";
      const shade = territory.pixelShade || 0;
      const inset = territory.coast ? 2 : 1;

      ctx.fillStyle = adjustColor(base, shade * 6 - (territory.coast ? 8 : 0));
      ctx.fillRect(territory.x + inset, territory.y + inset, territory.w - inset * 2, territory.h - inset * 2);

      ctx.fillStyle = owner ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(territory.x + inset, territory.y + inset, territory.w - inset * 2, 4);

      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(territory.x + territory.w - 4, territory.y + inset, 3, territory.h - inset * 2);
      ctx.fillRect(territory.x + inset, territory.y + territory.h - 4, territory.w - inset * 2, 3);

      drawBorders(ctx, territory, byId, state);

      if (selected) {
        ctx.strokeStyle = "#f7f3d4";
        ctx.lineWidth = 4;
        ctx.strokeRect(territory.x - 2, territory.y - 2, territory.w + 4, territory.h + 4);
      }

      if (territory.army >= 70 || selected || owner) {
        drawArmyLabel(ctx, territory, owner);
      }
    });
  }

  function drawBorders(ctx, territory, byId, state) {
    const owner = territory.owner;
    const edges = [
      [0, -1, territory.x, territory.y, territory.x + territory.w, territory.y],
      [1, 0, territory.x + territory.w, territory.y, territory.x + territory.w, territory.y + territory.h],
      [0, 1, territory.x, territory.y + territory.h, territory.x + territory.w, territory.y + territory.h],
      [-1, 0, territory.x, territory.y, territory.x, territory.y + territory.h]
    ];
    ctx.lineWidth = 2;
    edges.forEach(([dx, dy, x1, y1, x2, y2]) => {
      const neighbor = state.territories.find((t) => t.col === territory.col + dx && t.row === territory.row + dy);
      const different = !neighbor || neighbor.owner !== owner;
      ctx.strokeStyle = different ? "rgba(5,8,10,0.72)" : "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  }

  function drawArmyLabel(ctx, territory, owner) {
    const c = TC.Game.territoryCenter(territory);
    const label = formatNum(territory.army);
    const width = Math.max(34, label.length * 9 + 14);
    ctx.fillStyle = "rgba(9,12,16,0.76)";
    ctx.fillRect(Math.floor(c.x - width / 2), Math.floor(c.y - 11), width, 22);
    ctx.strokeStyle = owner ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)";
    ctx.strokeRect(Math.floor(c.x - width / 2) + 0.5, Math.floor(c.y - 11) + 0.5, width - 1, 21);
    ctx.fillStyle = "#f4f7fb";
    ctx.font = "800 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, c.x, c.y + 1);
  }

  function drawGroups(ctx, state) {
    state.groups.forEach((group) => {
      const player = state.players.find((p) => p.id === group.owner);
      const selected = state.selectedGroupId === group.id;
      ctx.strokeStyle = group.retreating ? "rgba(244,247,251,0.62)" : player.color;
      ctx.lineWidth = selected ? 5 : 3;
      ctx.setLineDash(group.retreating ? [10, 7] : []);
      ctx.beginPath();
      ctx.moveTo(Math.floor(group.x), Math.floor(group.y));
      ctx.lineTo(Math.floor(group.targetX), Math.floor(group.targetY));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(Math.floor(group.x - 12), Math.floor(group.y - 8), 28, 20);
      ctx.fillStyle = player.color;
      ctx.fillRect(Math.floor(group.x - 14), Math.floor(group.y - 12), 28, 20);
      ctx.fillStyle = selected ? "#ffffff" : "rgba(255,255,255,0.34)";
      ctx.fillRect(Math.floor(group.x - 14), Math.floor(group.y - 12), 28, 3);
      ctx.strokeStyle = selected ? "#f7f3d4" : "rgba(0,0,0,0.55)";
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeRect(Math.floor(group.x - 14), Math.floor(group.y - 12), 28, 20);

      ctx.fillStyle = "#081017";
      ctx.font = "900 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatNum(group.army), group.x, group.y - 2);
    });
  }

  function drawEffects(ctx, state) {
    state.effects.forEach((effect) => {
      if (effect.type === "battle") {
        const progress = effect.ttl / 36;
        ctx.strokeStyle = effect.color;
        ctx.globalAlpha = progress;
        ctx.lineWidth = 5;
        const size = Math.floor(36 * (1 - progress) + 12);
        ctx.strokeRect(Math.floor(effect.x - size / 2), Math.floor(effect.y - size / 2), size, size);
        ctx.globalAlpha = 1;
      }
      if (effect.type === "text") {
        ctx.fillStyle = effect.color;
        ctx.font = "900 18px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(effect.text, effect.x, effect.y);
      }
    });
  }

  function drawBanner(ctx, state) {
    ctx.fillStyle = "rgba(8,13,18,0.82)";
    ctx.fillRect(24, 22, 520, 42);
    ctx.fillStyle = state.winner !== null ? "#f4c95d" : "#f4f7fb";
    ctx.font = "800 17px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(state.message, 42, 44);
  }

  function adjustColor(hex, amount) {
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    const r = clampColor((num >> 16) + amount);
    const g = clampColor(((num >> 8) & 255) + amount);
    const b = clampColor((num & 255) + amount);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function clampColor(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function formatNum(value) {
    const n = Math.floor(value);
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  TC.Render = { createRenderer, formatNum };
})();
