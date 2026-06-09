(function () {
  const TC = window.TC = window.TC || {};

  function createNetwork(state, onCommand, onSnapshot, onStatus) {
    let pc = null;
    let channel = null;
    let role = "offline";

    function status(text) {
      if (onStatus) onStatus(text);
    }

    function reset() {
      if (channel) channel.close();
      if (pc) pc.close();
      channel = null;
      pc = null;
    }

    function makePeer() {
      reset();
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      pc.onconnectionstatechange = () => status(`WebRTC: ${pc.connectionState}`);
      pc.ondatachannel = (event) => {
        channel = event.channel;
        wireChannel();
      };
      return pc;
    }

    function wireChannel() {
      channel.onopen = () => {
        status("Connected");
        if (role === "host") sendSnapshot();
      };
      channel.onclose = () => status("Disconnected");
      channel.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.kind === "command" && onCommand) onCommand(message.command);
        if (message.kind === "snapshot" && onSnapshot) onSnapshot(message.state);
      };
    }

    function waitForIce() {
      return new Promise((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
          return;
        }
        const done = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", done);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", done);
        setTimeout(resolve, 2400);
      });
    }

    function encode(desc) {
      return btoa(JSON.stringify(desc));
    }

    function decode(code) {
      return JSON.parse(atob(code.trim()));
    }

    async function createOffer() {
      role = "host";
      makePeer();
      channel = pc.createDataChannel("territory-conquest", { ordered: true });
      wireChannel();
      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce();
      status("Host code ready");
      return encode(pc.localDescription);
    }

    async function acceptAnswer(code) {
      if (!pc || role !== "host") throw new Error("Create a host code first.");
      await pc.setRemoteDescription(decode(code));
      status("Answer accepted");
    }

    async function createAnswer(offerCode) {
      role = "guest";
      makePeer();
      await pc.setRemoteDescription(decode(offerCode));
      await pc.setLocalDescription(await pc.createAnswer());
      await waitForIce();
      status("Answer code ready");
      return encode(pc.localDescription);
    }

    function sendCommand(command) {
      send({ kind: "command", command });
    }

    function sendSnapshot() {
      send({ kind: "snapshot", state: TC.Game.exportState(state) });
    }

    function send(payload) {
      if (channel && channel.readyState === "open") {
        channel.send(JSON.stringify(payload));
      }
    }

    function isConnected() {
      return channel && channel.readyState === "open";
    }

    return { createOffer, acceptAnswer, createAnswer, sendCommand, sendSnapshot, isConnected };
  }

  TC.Network = { createNetwork };
})();
