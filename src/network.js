function createPeerNetwork({ onMessage, onStatus }) {
  let peer = null;
  let channel = null;

  function setupPeer() {
    close();
    peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    peer.oniceconnectionstatechange = () => {
      onStatus(`WebRTC: ${peer.iceConnectionState}`);
    };
    peer.ondatachannel = (event) => {
      bindChannel(event.channel);
    };
    return peer;
  }

  function bindChannel(nextChannel) {
    channel = nextChannel;
    channel.onopen = () => onStatus("Peer connected.");
    channel.onclose = () => onStatus("Peer disconnected.");
    channel.onerror = () => onStatus("Peer connection error.");
    channel.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        onStatus("Ignored unreadable peer message.");
      }
    };
  }

  async function createOffer() {
    const current = setupPeer();
    bindChannel(current.createDataChannel("territory-conquest"));
    const offer = await current.createOffer();
    await current.setLocalDescription(offer);
    await waitForIce(current);
    return encode(current.localDescription);
  }

  async function acceptOffer(code) {
    const current = setupPeer();
    const offer = decode(code);
    await current.setRemoteDescription(offer);
    const answer = await current.createAnswer();
    await current.setLocalDescription(answer);
    await waitForIce(current);
    return encode(current.localDescription);
  }

  async function finishAnswer(code) {
    if (!peer) {
      throw new Error("Create an offer first.");
    }
    const answer = decode(code);
    await peer.setRemoteDescription(answer);
  }

  function send(message) {
    if (!channel || channel.readyState !== "open") {
      return false;
    }
    channel.send(JSON.stringify(message));
    return true;
  }

  function close() {
    if (channel) {
      channel.close();
      channel = null;
    }
    if (peer) {
      peer.close();
      peer = null;
    }
  }

  return { createOffer, acceptOffer, finishAnswer, send, close };
}

function waitForIce(peer) {
  if (peer.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, 2500);
    function done() {
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    function check() {
      if (peer.iceGatheringState === "complete") {
        done();
      }
    }
    peer.addEventListener("icegatheringstatechange", check);
  });
}

function encode(description) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(description))));
}

function decode(code) {
  return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
}
