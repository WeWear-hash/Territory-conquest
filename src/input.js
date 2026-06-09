(function () {
  const TC = window.TC = window.TC || {};

  const els = {};
  let state = null;
  let renderer = null;
  let network = null;
  let lastTime = performance.now();
  let mode = "single";
  let snapshotTimer = 0;

  window.addEventListener("DOMContentLoaded", () => {
    bindElements();
    state = TC.Game.createState();
    renderer = TC.Render.createRenderer(els.canvas);
    network = TC.Network.createNetwork(state, receiveCommand, receiveSnapshot, setNetworkStatus);
    bindUI();
    refreshUpgrades();
    requestAnimationFrame(loop);
  });

  function bindElements() {
    [
      "gameCanvas", "startOverlay", "singleBtn", "hostBtn", "joinBtn", "startBtn",
      "phaseTitle", "connectionPill", "territoryStat", "armyStat", "groupsStat",
      "tickStat", "splitButtons", "retreatBtn", "upgradeList", "copyOfferBtn",
      "acceptAnswerBtn", "createAnswerBtn", "incomingCode", "outgoingCode", "networkStatus"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
    els.canvas = els.gameCanvas;
  }

  function bindUI() {
    [els.singleBtn, els.hostBtn, els.joinBtn].forEach((button) => {
      button.addEventListener("click", () => {
        [els.singleBtn, els.hostBtn, els.joinBtn].forEach((b) => b.classList.remove("is-active"));
        button.classList.add("is-active");
        mode = button === els.singleBtn ? "single" : button === els.hostBtn ? "host" : "join";
      });
    });

    els.startBtn.addEventListener("click", () => {
      state.mode = mode;
      state.host = mode !== "join";
      state.localPlayerId = mode === "join" ? 1 : 0;
      if (mode === "host") {
        state.players[1].isBot = false;
        state.players[1].name = "Guest";
      }
      if (mode === "join") {
        state.players[1].isBot = false;
        state.players[1].name = "You";
        state.players[0].name = "Host";
      }
      els.startOverlay.classList.add("is-hidden");
      state.message = "Choose any neutral land to begin.";
      syncHud();
    });

    els.canvas.addEventListener("click", handleCanvasClick);

    els.splitButtons.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-split]");
      if (!button) return;
      [...els.splitButtons.querySelectorAll("button")].forEach((b) => b.classList.remove("is-active"));
      button.classList.add("is-active");
      const ratio = Number(button.dataset.split);
      dispatch({ type: "splitArmy", playerId: state.localPlayerId, ratio });
    });

    els.retreatBtn.addEventListener("click", () => {
      if (state.selectedGroupId !== null) {
        dispatch({ type: "retreatArmy", playerId: state.localPlayerId, groupId: state.selectedGroupId });
      }
    });

    els.copyOfferBtn.addEventListener("click", async () => {
      try {
        els.outgoingCode.value = await network.createOffer();
      } catch (err) {
        setNetworkStatus(err.message);
      }
    });

    els.acceptAnswerBtn.addEventListener("click", async () => {
      try {
        await network.acceptAnswer(els.incomingCode.value);
      } catch (err) {
        setNetworkStatus(err.message);
      }
    });

    els.createAnswerBtn.addEventListener("click", async () => {
      try {
        els.outgoingCode.value = await network.createAnswer(els.incomingCode.value);
      } catch (err) {
        setNetworkStatus(err.message);
      }
    });
  }

  function handleCanvasClick(event) {
    const point = renderer.screenToWorld(event.clientX, event.clientY);
    const group = TC.Game.findGroupAt(state, point.x, point.y, state.localPlayerId);
    if (group) {
      state.selectedGroupId = group.id;
      state.selectedTerritoryId = null;
      return;
    }

    const territory = TC.Game.findTerritoryAt(state, point.x, point.y);
    if (!territory) return;

    if (state.phase === "setup" || TC.Game.ownedTerritories(state, state.localPlayerId).length === 0) {
      if (territory.owner === TC.Game.NEUTRAL) {
        dispatch({ type: "selectStart", playerId: state.localPlayerId, territoryId: territory.id });
      }
      return;
    }

    if (territory.owner === state.localPlayerId) {
      state.selectedTerritoryId = territory.id;
      state.selectedGroupId = null;
      state.message = `Selected territory ${territory.id + 1}.`;
      return;
    }

    if (state.selectedTerritoryId !== null) {
      dispatch({
        type: "moveArmy",
        playerId: state.localPlayerId,
        fromId: state.selectedTerritoryId,
        targetId: territory.id,
        ratio: state.splitRatio
      });
    }
  }

  function dispatch(command) {
    const changed = TC.Game.applyCommand(state, command);
    if (changed && network.isConnected()) {
      network.sendCommand(command);
    }
    refreshUpgrades();
  }

  function receiveCommand(command) {
    TC.Game.applyCommand(state, command);
    refreshUpgrades();
  }

  function receiveSnapshot(nextState) {
    const localId = state.localPlayerId;
    TC.Game.importState(state, nextState);
    state.localPlayerId = localId;
    state.host = false;
    refreshUpgrades();
  }

  function loop(now) {
    const dt = Math.min(40, now - lastTime);
    lastTime = now;

    if (!els.startOverlay.classList.contains("is-hidden")) {
      renderer.render(state);
      requestAnimationFrame(loop);
      return;
    }

    if (state.host) {
      TC.AI.updateBots(state);
      TC.Game.update(state, dt);
      snapshotTimer += dt;
      if (snapshotTimer > 900 && network.isConnected()) {
        network.sendSnapshot();
        snapshotTimer = 0;
      }
    }

    renderer.render(state);
    syncHud();
    if (state.tick % 20 === 0) refreshUpgrades();
    requestAnimationFrame(loop);
  }

  function syncHud() {
    const local = state.players.find((p) => p.id === state.localPlayerId);
    const owned = TC.Game.ownedTerritories(state, state.localPlayerId);
    els.phaseTitle.textContent = state.winner !== null ? "Finished" : state.phase === "setup" ? "Setup" : "Live Match";
    els.territoryStat.textContent = `${Math.round(owned.length / Math.max(1, state.territories.length) * 100)}%`;
    els.armyStat.textContent = TC.Render.formatNum(TC.Game.totalArmy(state, state.localPlayerId));
    els.groupsStat.textContent = state.groups.filter((g) => g.owner === state.localPlayerId).length;
    els.tickStat.textContent = state.tick;
    els.connectionPill.textContent = network.isConnected() ? "P2P Online" : state.mode === "single" ? "Offline" : "P2P Ready";
    els.connectionPill.style.borderColor = network.isConnected() ? local.color : "";
    els.connectionPill.style.color = network.isConnected() ? local.color : "";
  }

  function refreshUpgrades() {
    if (!state) return;
    const player = state.players.find((p) => p.id === state.localPlayerId);
    els.upgradeList.innerHTML = "";
    Object.entries(TC.Game.UPGRADES).forEach(([key, data]) => {
      const level = player.upgrades[key];
      const cost = TC.Game.playerCost(state, state.localPlayerId, key);
      const row = document.createElement("div");
      row.className = "upgrade";
      row.innerHTML = `
        <div>
          <strong>${data.label} ${level}/${data.max}</strong>
          <small>${data.desc}</small>
        </div>
      `;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = level >= data.max ? "Max" : TC.Render.formatNum(cost);
      button.disabled = level >= data.max || TC.Game.spendableArmy(state, state.localPlayerId) < cost;
      button.addEventListener("click", () => dispatch({ type: "buyUpgrade", playerId: state.localPlayerId, upgrade: key }));
      row.appendChild(button);
      els.upgradeList.appendChild(row);
    });
  }

  function setNetworkStatus(text) {
    els.networkStatus.textContent = text;
  }
})();
