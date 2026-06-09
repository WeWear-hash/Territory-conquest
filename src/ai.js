(function () {
  const TC = window.TC = window.TC || {};

  function updateBots(state) {
    if (state.phase !== "playing" || state.winner !== null) return;

    state.players.forEach((player) => {
      if (!player.isBot || !player.alive) return;

      if (TC.Game.ownedTerritories(state, player.id).length === 0) {
        chooseBotStart(state, player.id);
        return;
      }

      if (state.tick % (28 + player.id * 3) === 0) {
        maybeUpgrade(state, player.id);
      }

      if (state.tick % (34 + player.id * 5) === 0) {
        makeAttack(state, player.id);
      }

      if (state.tick % 21 === 0) {
        maybeRetreat(state, player.id);
      }
    });
  }

  function chooseBotStart(state, playerId) {
    const empty = state.territories.filter((t) => t.owner === TC.Game.NEUTRAL);
    if (!empty.length) return;
    const preferred = empty.sort((a, b) => b.neighbors.length - a.neighbors.length).slice(0, 8);
    TC.Game.applyCommand(state, {
      type: "selectStart",
      playerId,
      territoryId: TC.Game.randFrom(preferred).id
    });
  }

  function maybeUpgrade(state, playerId) {
    const player = state.players.find((p) => p.id === playerId);
    const keys = ["economy", "logistics", "tactics", "defense"];
    const key = keys[(Math.floor(state.tick / 100) + playerId) % keys.length];
    if (player.upgrades[key] >= TC.Game.UPGRADES[key].max) return;
    TC.Game.applyCommand(state, { type: "buyUpgrade", playerId, upgrade: key });
  }

  function makeAttack(state, playerId) {
    const lands = TC.Game.ownedTerritories(state, playerId)
      .filter((t) => t.army > 65)
      .sort((a, b) => b.army - a.army);
    if (!lands.length) return;

    let bestMove = null;
    lands.slice(0, 5).forEach((from) => {
      const targets = from.neighbors
        .map((id) => state.territories[id])
        .filter((t) => t && t.owner !== playerId);
      targets.forEach((target) => {
        const neutralBonus = target.owner === TC.Game.NEUTRAL ? 45 : 0;
        const score = from.army - target.army + neutralBonus + target.neighbors.length * 4;
        if (!bestMove || score > bestMove.score) {
          bestMove = { from, target, score };
        }
      });
    });

    if (bestMove && bestMove.score > 4) {
      TC.Game.applyCommand(state, {
        type: "moveArmy",
        playerId,
        fromId: bestMove.from.id,
        targetId: bestMove.target.id,
        ratio: bestMove.target.owner === TC.Game.NEUTRAL ? 0.45 : 0.68
      });
    }
  }

  function maybeRetreat(state, playerId) {
    state.groups
      .filter((g) => g.owner === playerId && !g.retreating)
      .forEach((group) => {
        const target = state.territories[group.targetId];
        if (target && target.owner !== playerId && target.army > group.army * 1.4) {
          TC.Game.applyCommand(state, {
            type: "retreatArmy",
            playerId,
            groupId: group.id
          });
        }
      });
  }

  TC.AI = { updateBots };
})();
