const canvas = document.querySelector("#gameCanvas");
const renderer = createRenderer(canvas);
const botController = createBotController();
const elements = {
  status: document.querySelector("#matchStatus"),
  playerName: document.querySelector("#playerName"),
  playerColor: document.querySelector("#playerColor"),
  botsMode: document.querySelector("#botsMode"),
  hostMode: document.querySelector("#hostMode"),
  guestMode: document.querySelector("#guestMode"),
  startMatch: document.querySelector("#startMatch"),
  resetMatch: document.querySelector("#resetMatch"),
  attackSlider: document.querySelector("#attackSlider"),
  attackPercent: document.querySelector("#attackPercent"),
  selectedInfo: document.querySelector("#selectedInfo"),
  upgradeEconomy: document.querySelector("#upgradeEconomy"),
  upgradeLogistics: document.querySelector("#upgradeLogistics"),
  upgradeFortification: document.querySelector("#upgradeFortification"),
  leaderboard: document.querySelector("#leaderboard"),
  armyStat: document.querySelector("#armyStat"),
  landStat: document.querySelector("#landStat"),
  incomeStat: document.querySelector("#incomeStat"),
  signalInput: document.querySelector("#signalInput"),
  signalOutput: document.querySelector("#signalOutput"),
  makeOffer: document.querySelector("#makeOffer"),
  acceptOffer: document.querySelector("#acceptOffer"),
  finishAnswer: document.querySelector("#finishAnswer"),
  toast: document.querySelector("#toast")
};

let game = createConfiguredGame("bots");
let role = "solo";
let lastFrame = performance.now();
let snapshotTimer = 0;

const network = createPeerNetwork({
  onMessage: handlePeerMessage,
  onStatus(message) {
    showToast(message);
    game.message = message;
    if (message === "Peer connected.") {
      sendPeer({
        type: "player_config",
        name: elements.playerName.value || "Commander",
        color: elements.playerColor.value || "#30a2ff"
      });
      sendPeer({ type: "hello" });
    }
  }
});

bindUi();
resizeCanvas(canvas);
requestAnimationFrame(loop);

function bindUi() {
  window.addEventListener("resize", () => resizeCanvas(canvas));

  elements.playerName.addEventListener("input", () => {
    setHumanConfig(game, elements.playerName.value, elements.playerColor.value);
    sendPeer({ type: "player_config", name: elements.playerName.value, color: elements.playerColor.value });
  });
  elements.playerColor.addEventListener("input", () => {
    setHumanConfig(game, elements.playerName.value, elements.playerColor.value);
    sendPeer({ type: "player_config", name: elements.playerName.value, color: elements.playerColor.value });
  });

  elements.attackSlider.addEventListener("input", () => {
    elements.attackPercent.textContent = `${elements.attackSlider.value}%`;
  });

  elements.botsMode.addEventListener("click", () => setMode("bots"));
  elements.hostMode.addEventListener("click", () => setMode("host"));
  elements.guestMode.addEventListener("click", () => setMode("guest"));

  elements.startMatch.addEventListener("click", () => {
    if (role === "guest") {
      sendPeer({ type: "start_request" });
      showToast("Asked host to start.");
      return;
    }
    if (game.mode === "bots") {
      autoPlaceBots(game);
    }
    if (startMatch(game)) {
      broadcastSnapshot();
    }
  });

  elements.resetMatch.addEventListener("click", () => setMode(game.mode));

  elements.upgradeEconomy.addEventListener("click", () => commandUpgrade("economy"));
  elements.upgradeLogistics.addEventListener("click", () => commandUpgrade("logistics"));
  elements.upgradeFortification.addEventListener("click", () => commandUpgrade("fortification"));

  canvas.addEventListener("click", (event) => handleCanvasClick(event));

  elements.makeOffer.addEventListener("click", async () => {
    setMode("host");
    try {
      const code = await network.createOffer();
      elements.signalOutput.value = code;
      showToast("Share this host code with the guest.");
    } catch (error) {
      showToast(error.message || "Could not create offer.");
    }
  });

  elements.acceptOffer.addEventListener("click", async () => {
    setMode("guest");
    try {
      const code = await network.acceptOffer(elements.signalInput.value);
      elements.signalOutput.value = code;
      showToast("Send this answer code back to the host.");
    } catch (error) {
      showToast(error.message || "Could not accept offer.");
    }
  });

  elements.finishAnswer.addEventListener("click", async () => {
    try {
      await network.finishAnswer(elements.signalInput.value);
      showToast("Connection answer applied.");
    } catch (error) {
      showToast(error.message || "Could not connect.");
    }
  });
}

function setMode(mode) {
  role = mode === "host" ? "host" : mode === "guest" ? "guest" : "solo";
  game = createConfiguredGame(mode === "bots" ? "bots" : "online");
  game.localPlayerId = role === "guest" ? 1 : 0;
  if (role === "guest") {
    addRemotePlayer(game, { name: "Host", color: "#30a2ff" });
    game.players[0].local = false;
    game.players[1].local = true;
    game.players[1].name = elements.playerName.value || "Guest";
    game.players[1].color = elements.playerColor.value || "#ffcd4d";
    game.message = "Paste a host code, accept it, then choose a start.";
  } else if (role === "host") {
    addRemotePlayer(game, { name: "Guest", color: "#ffcd4d" });
    game.message = "Create a host code and wait for a guest.";
  }
  setActiveMode(mode);
  network.close();
  elements.signalInput.value = "";
  elements.signalOutput.value = "";
}

function createConfiguredGame(mode) {
  const nextGame = createGame({
    mode,
    name: elements.playerName.value || "Commander",
    color: elements.playerColor.value || "#30a2ff"
  });
  if (mode === "bots") {
    addBotPlayers(nextGame, 9);
  }
  return nextGame;
}

function handleCanvasClick(event) {
  const cell = getCellFromPoint(game, event.clientX, event.clientY, canvas);
  if (cell < 0) {
    return;
  }

  if (game.phase === "select") {
    if (!isClaimableStart(game, cell)) {
      showToast("Pick an open land tile.");
      return;
    }
    if (role === "guest") {
      sendPeer({ type: "start_selection", cell, playerId: 1 });
      game.message = "Start selection sent to host.";
      return;
    }
    if (selectStart(game, game.localPlayerId, cell)) {
      if (role === "host") {
        broadcastSnapshot();
      }
    }
    return;
  }

  if (game.phase !== "play") {
    return;
  }

  const localId = game.localPlayerId;
  const selected = game.selectedCell;
  if (game.cells[cell] === localId) {
    game.selectedCell = cell;
    return;
  }

  if (selected >= 0 && isOwnedNeighbor(game, localId, cell)) {
    const command = {
      type: "command_attack",
      playerId: localId,
      from: selected,
      to: cell,
      percent: Number(elements.attackSlider.value)
    };
    if (role === "guest") {
      sendPeer(command);
    } else if (attack(game, command.playerId, command.from, command.to, command.percent)) {
      broadcastSnapshot();
    }
    return;
  }

  game.selectedCell = cell;
}

function commandUpgrade(kind) {
  const command = { type: "command_upgrade", playerId: game.localPlayerId, kind };
  if (role === "guest") {
    sendPeer(command);
  } else if (upgrade(game, command.playerId, kind)) {
    broadcastSnapshot();
  }
}

function handlePeerMessage(message) {
  if (message.type === "player_config" && role === "host") {
    const remote = addRemotePlayer(game, message);
    remote.name = message.name || remote.name;
    remote.color = message.color || remote.color;
    broadcastSnapshot();
  } else if (message.type === "start_selection" && role === "host") {
    if (selectStart(game, message.playerId, message.cell)) {
      broadcastSnapshot();
    }
  } else if (message.type === "start_request" && role === "host") {
    if (startMatch(game)) {
      broadcastSnapshot();
    }
  } else if (message.type === "command_attack" && role === "host") {
    if (attack(game, message.playerId, message.from, message.to, message.percent)) {
      broadcastSnapshot();
    }
  } else if (message.type === "command_upgrade" && role === "host") {
    if (upgrade(game, message.playerId, message.kind)) {
      broadcastSnapshot();
    }
  } else if (message.type === "state_snapshot" && role === "guest") {
    applySnapshot(game, message.snapshot);
  } else if (message.type === "match_end") {
    showToast(message.message || "Match ended.");
  }

  if (message.type === "hello" && role === "host") {
    broadcastSnapshot();
  }
}

function loop(now) {
  const dt = Math.min(0.08, (now - lastFrame) / 1000);
  lastFrame = now;
  resizeCanvas(canvas);

  if (role !== "guest") {
    const commands = botController.update(game, dt);
    runBotCommands(game, commands);
    updateGame(game, dt, []);
    snapshotTimer += dt;
    if (role === "host" && snapshotTimer >= 0.35) {
      snapshotTimer = 0;
      broadcastSnapshot();
    }
  }

  renderGame(renderer, game);
  updateHud(game, elements);
  requestAnimationFrame(loop);
}

function broadcastSnapshot() {
  if (role !== "host") {
    return;
  }
  sendPeer({ type: "state_snapshot", snapshot: serializeGame(game) });
}

function sendPeer(message) {
  const sent = network.send(message);
  if (!sent && role !== "solo") {
    showToast("Peer is not connected yet.");
  }
  return sent;
}

function setActiveMode(mode) {
  for (const button of [elements.botsMode, elements.hostMode, elements.guestMode]) {
    button.classList.remove("primary");
  }
  if (mode === "host") {
    elements.hostMode.classList.add("primary");
  } else if (mode === "guest") {
    elements.guestMode.classList.add("primary");
  } else {
    elements.botsMode.classList.add("primary");
  }
}

function showToast(message) {
  elements.toast.hidden = false;
  elements.toast.textContent = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2600);
}
