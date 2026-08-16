const localVideo = document.querySelector("#localVideo");
const remoteVideo = document.querySelector("#remoteVideo");
const statusEl = document.querySelector("#status");
const roomEl = document.querySelector("#room");
const joinBtn = document.querySelector("#join");
const leaveBtn = document.querySelector("#leave");
const muteBtn = document.querySelector("#mute");
const cameraBtn = document.querySelector("#camera");

let localStream;
let peer;
let socket;
let room;
let muted = false;
let cameraOff = false;

// Change this to your deployed WebSocket signaling server.
// The signaling server only exchanges SDP/ICE messages; media remains WebRTC peer-to-peer.
const SIGNALING_URL = "wss://YOUR-SIGNALING-SERVER.example/ws";

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // Add your TURN server here for difficult NAT/firewall networks.
    // { urls: "turn:your-turn-server.example", username: "user", credential: "password" }
  ]
};

function setStatus(text) { statusEl.textContent = text; }

async function startMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: { echoCancellation: true, noiseSuppression: true }
  });
  localVideo.srcObject = localStream;
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ room, ...message }));
  }
}

function createPeer() {
  peer = new RTCPeerConnection(rtcConfig);
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  peer.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  peer.onicecandidate = event => {
    if (event.candidate) send({ type: "ice", candidate: event.candidate });
  };

  peer.onconnectionstatechange = () => {
    setStatus(`Call: ${peer.connectionState}`);
  };
}

async function join() {
  try {
    joinBtn.disabled = true;
    await startMedia();

    if (SIGNALING_URL.includes("YOUR-SIGNALING-SERVER")) {
      throw new Error("Configure SIGNALING_URL in app.js first.");
    }

    room = roomEl.value.trim() || "my-room";
    socket = new WebSocket(SIGNALING_URL);

    socket.onopen = () => {
      send({ type: "join" });
      setStatus("Joined room");
    };

    socket.onmessage = async event => {
      const msg = JSON.parse(event.data);

      if (msg.type === "peer-joined") {
        createPeer();
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        send({ type: "offer", sdp: peer.localDescription });
      }

      if (msg.type === "offer") {
        if (!peer) createPeer();
        await peer.setRemoteDescription(msg.sdp);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        send({ type: "answer", sdp: peer.localDescription });
      }

      if (msg.type === "answer") {
        await peer.setRemoteDescription(msg.sdp);
      }

      if (msg.type === "ice" && peer) {
        try { await peer.addIceCandidate(msg.candidate); } catch (e) { console.warn(e); }
      }

      if (msg.type === "peer-left") {
        remoteVideo.srcObject = null;
        setStatus("Other participant left");
      }
    };

    socket.onerror = () => setStatus("Signaling connection error");
    socket.onclose = () => setStatus("Signaling disconnected");
  } catch (err) {
    setStatus(err.message);
    joinBtn.disabled = false;
    localStream?.getTracks().forEach(t => t.stop());
  }
}

function leave() {
  peer?.close();
  peer = null;
  socket?.close();
  socket = null;
  localStream?.getTracks().forEach(t => t.stop());
  localStream = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  joinBtn.disabled = false;
  setStatus("Ready");
}

joinBtn.onclick = join;
leaveBtn.onclick = leave;

muteBtn.onclick = () => {
  muted = !muted;
  localStream?.getAudioTracks().forEach(t => t.enabled = !muted);
  muteBtn.textContent = muted ? "Unmute" : "Mute";
};

cameraBtn.onclick = () => {
  cameraOff = !cameraOff;
  localStream?.getVideoTracks().forEach(t => t.enabled = !cameraOff);
  cameraBtn.textContent = cameraOff ? "Camera on" : "Camera off";
};
