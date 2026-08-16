const localVideo = document.querySelector("#localVideo");
const remoteVideo = document.querySelector("#remoteVideo");
const statusEl = document.querySelector("#status");

const startBtn = document.querySelector("#start");
const nextBtn = document.querySelector("#next");
const muteBtn = document.querySelector("#mute");
const cameraBtn = document.querySelector("#camera");
const stopBtn = document.querySelector("#stop");

const SIGNALING_URL =
  "wss://continuous-video-call-server.onrender.com";

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

let localStream = null;
let socket = null;
let peer = null;
let muted = false;
let cameraOff = false;
let stopping = false;

function status(text) {
  statusEl.textContent = text;
}

async function startMedia() {
  if (localStream) return;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true
    }
  });

  localVideo.srcObject = localStream;
}

function closePeer() {
  if (peer) {
    peer.close();
    peer = null;
  }

  remoteVideo.srcObject = null;
}

function createPeer() {
  closePeer();

  peer = new RTCPeerConnection(rtcConfig);

  localStream.getTracks().forEach(track => {
    peer.addTrack(track, localStream);
  });

  peer.ontrack = event => {
    if (event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      status("Connected");
    }
  };

  peer.onicecandidate = event => {
    if (event.candidate) {
      send({
        type: "ice",
        candidate: event.candidate
      });
    }
  };

  peer.onconnectionstatechange = () => {
    if (!peer) return;

    if (peer.connectionState === "connected") {
      status("Connected");
    }

    if (peer.connectionState === "disconnected") {
      status("Connection interrupted");
    }

    if (peer.connectionState === "failed") {
      status("Connection failed — tap Next Person");
    }
  };
}

function send(message) {
  if (
    socket &&
    socket.readyState === WebSocket.OPEN
  ) {
    socket.send(JSON.stringify(message));
  }
}

function handleMessage(event) {
  const message = JSON.parse(event.data);

  if (message.type === "waiting") {
    status("Looking for a random person...");
    return;
  }

  if (message.type === "matched") {
    status("Person found. Connecting...");
    return;
  }

  if (message.type === "peer-joined") {
    createPeer();

    peer.createOffer()
      .then(offer => peer.setLocalDescription(offer))
      .then(() => {
        send({
          type: "offer",
          sdp: peer.localDescription
        });
      });

    return;
  }

  if (message.type === "offer") {
    if (!peer) {
      createPeer();
    }

    peer.setRemoteDescription(message.sdp)
      .then(() => peer.createAnswer())
      .then(answer => peer.setLocalDescription(answer))
      .then(() => {
        send({
          type: "answer",
          sdp: peer.localDescription
        });
      });

    return;
  }

  if (message.type === "answer") {
    if (peer) {
      peer.setRemoteDescription(message.sdp);
    }

    return;
  }

  if (message.type === "ice") {
    if (peer) {
      peer.addIceCandidate(message.candidate)
        .catch(error => {
          console.warn("ICE error:", error);
        });
    }

    return;
  }

  if (message.type === "peer-left") {
    closePeer();

    status(
      "The other person left. Finding someone new..."
    );

    send({
      type: "find"
    });

    return;
  }

  if (message.type === "stopped") {
    closePeer();
    status("Ready.");
  }
}

async function connectToServer() {
  if (
    socket &&
    socket.readyState === WebSocket.OPEN
  ) {
    return;
  }

  await new Promise((resolve, reject) => {

    socket = new WebSocket(SIGNALING_URL);

    socket.onopen = () => {
      console.log("Connected to signaling server");
      resolve();
    };

    socket.onerror = () => {
      reject(
        new Error(
          "Could not connect to the matching server."
        )
      );
    };

    socket.onclose = () => {
      if (!stopping) {
        status("Matching server disconnected.");
      }
    };

    socket.onmessage = handleMessage;
  });
}

async function startRandomCall() {
  try {

    stopping = false;

    startBtn.disabled = true;

    await startMedia();

    await connectToServer();

    send({
      type: "find"
    });

    status("Looking for a random person...");

  } catch (error) {

    console.error(error);

    status(
      error.message ||
      "Unable to start the call."
    );

    startBtn.disabled = false;
  }
}

async function nextPerson() {

  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    await startRandomCall();
    return;
  }

  closePeer();

  status("Finding the next person...");

  send({
    type: "next"
  });
}

function stopCall() {

  stopping = true;

  closePeer();

  if (socket) {

    send({
      type: "stop"
    });

    socket.close();

    socket = null;
  }

  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => track.stop());

    localStream = null;
  }

  localVideo.srcObject = null;

  startBtn.disabled = false;

  status("Stopped.");
}

startBtn.onclick = startRandomCall;

nextBtn.onclick = nextPerson;

stopBtn.onclick = stopCall;

muteBtn.onclick = () => {

  if (!localStream) return;

  muted = !muted;

  localStream
    .getAudioTracks()
    .forEach(track => {
      track.enabled = !muted;
    });

  muteBtn.textContent =
    muted ? "Unmute" : "Mute";
};

cameraBtn.onclick = () => {

  if (!localStream) return;

  cameraOff = !cameraOff;

  localStream
    .getVideoTracks()
    .forEach(track => {
      track.enabled = !cameraOff;
    });

  cameraBtn.textContent =
    cameraOff ? "Camera On" : "Camera Off";
};
