# Continuous Video Call

This starter provides a browser-to-browser WebRTC video call with no application-imposed call timer.

## Run the signaling server

```bash
npm init -y
npm install ws
node server.js
```

Then change `SIGNALING_URL` in `app.js` to:

```text
ws://YOUR_HOST:8080
```

For production, use HTTPS + WSS and deploy a TURN server for reliable connectivity across restrictive NAT/firewalls.

## Important

"No restrictions" cannot literally guarantee unlimited availability: browsers, devices, operating systems, networks, battery, bandwidth, and server infrastructure can still interrupt a call. This project intentionally has no built-in duration limit.
