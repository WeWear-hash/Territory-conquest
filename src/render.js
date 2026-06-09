(function () {
  const TC = window.TC = window.TC || {};

  function createRenderer(canvas) {
    const ctx = canvas.getContext("2d");
    const view = { scale: 1, offsetX: 0, offsetY: 0 };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.scale = Math.min(rect.width / 1280, rect.height / 760);
      view.offsetX = (rect.width - 1280 * view.scale) / 2;
      view.offsetY = (rect.height - 760 * view.scale) / 2;
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
      drawConnections(ctx, state);
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
    const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
    gradient.addColorStop(0, "#0d1722");
    gradient.addColorStop(1, "#101820");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;
    for (let x = 0; x < state.width; x += 54) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 80, state.height);
      ctx.stroke();
    }
  }

  function drawConnections(ctx, state) {
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 2;
    state.territories.forEach((territory) => {
      const a = TC.Game.territoryCenter(territory);
      territory.neighbors.forEach((id) => {
        if (id < territory.id) return;
        const b = TC.Game.territoryCenter(state.territories[id]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    });
  }

  function drawTerritories(ctx, state) {
    state.territories.forEach((territory) => {
      const owner = state.players.find((p) => p.id === territory.owner);
      const selected = state.selectedTerritoryId === territory.id;
      const fill = owner ? owner.color : "#5b6572";
      ctx.save();
      ctx.globalAlpha = owner ? 0.92 : 0.72;
      roundRect(ctx, territory.x, territory.y, territory.w, territory.h, 10);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = selected ? 5 : 2;
      ctx.strokeStyle = selected ? "#ffffff" : "rgba(255,255,255,0.28)";
      ctx.stroke();
      ctx.restore();

      const c = TC.Game.territoryCenter(territory);
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      roundRect(ctx, c.x - 28, c.y - 13, 56, 26, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatNum(territory.army), c.x, c.y + 1);
    });
  }

  function drawGroups(ctx, state) {
    state.groups.forEach((group) => {
      const player = state.players.find((p) => p.id === group.owner);
      const selected = state.selectedGroupId === group.id;
      ctx.strokeStyle = group.retreating ? "rgba(255,255,255,0.4)" : player.color;
      ctx.lineWidth = selected ? 4 : 2;
      ctx.beginPath();
      ctx.setLineDash(group.retreating ? [8, 8] : []);
      ctx.moveTo(group.x, group.y);
      ctx.lineTo(group.targetX, group.targetY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(group.x, group.y, selected ? 16 : 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = selected ? "#ffffff" : "rgba(0,0,0,0.45)";
      ctx.stroke();

      ctx.fillStyle = "#101318";
      ctx.font = "900 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatNum(group.army), group.x, group.y + 1);
    });
  }

  function drawEffects(ctx, state) {
    state.effects.forEach((effect) => {
      if (effect.type === "battle") {
        const progress = effect.ttl / 36;
        ctx.strokeStyle = effect.color;
        ctx.globalAlpha = progress;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 32 * (1 - progress) + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (effect.type === "text") {
        ctx.fillStyle = effect.color;
        ctx.font = "900 18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(effect.text, effect.x, effect.y);
      }
    });
  }

  function drawBanner(ctx, state) {
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    roundRect(ctx, 24, 20, 520, 44, 8);
    ctx.fill();
    ctx.fillStyle = "#edf2f8";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(state.winner !== null ? state.message : state.message, 42, 42);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function formatNum(value) {
    const n = Math.floor(value);
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  TC.Render = { createRenderer, formatNum };
})();
