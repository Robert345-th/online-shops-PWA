(function () {
  const PC_CONFIG = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };
  const RING_TIMEOUT_MS = 45000;
  const POLL_MS = 1200;
  const LOCATION_SEND_MS = 8000;

  let pc = null;
  let localStream = null;
  let remoteAudio = null;
  let activeCallId = null;
  let pollTimer = null;
  let durationTimer = null;
  let ringTimer = null;
  let locationSendTimer = null;
  let locationWatchId = null;
  let locationChannel = null;
  let callSeconds = 0;
  let isCaller = false;
  let peerName = "";
  let peerUserId = null;
  let callerUserId = null;
  let callState = "idle";
  let pendingOffer = null;
  let pollInFlight = false;
  let listenerStarted = false;
  let sharingLocation = false;
  let peerLocation = null;
  let ringAudioCtx = null;
  let ringOscillator = null;
  let ringGain = null;

  function getToken() {
    return localStorage.getItem("zm_token");
  }

  function getUserName() {
    try {
      const u = JSON.parse(localStorage.getItem("zm_user") || "null");
      return u?.display_name || u?.shop_name || u?.phone || "Someone";
    } catch {
      return "Someone";
    }
  }

  function tr(key, fallback, vars) {
    if (typeof window.t !== "function") return fallback;
    const val = window.t(key, vars);
    return val || fallback;
  }

  function authHeaders(extra) {
    return { Authorization: `Bearer ${getToken()}`, ...extra };
  }

  async function api(path, method, body) {
    const res = await fetch(`/api/calls${path}`, {
      method: method || "GET",
      headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "call_api_error");
      err.code = data.error;
      throw err;
    }
    return data;
  }

  function emitCallEvent(type, detail) {
    window.dispatchEvent(new CustomEvent("voicecall", { detail: { type, ...detail } }));
  }

  function formatDuration(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function startRingtone() {
    stopRingtone();
    try {
      ringAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      ringOscillator = ringAudioCtx.createOscillator();
      ringGain = ringAudioCtx.createGain();
      ringOscillator.type = "sine";
      ringOscillator.frequency.value = 440;
      ringGain.gain.value = 0.08;
      ringOscillator.connect(ringGain);
      ringGain.connect(ringAudioCtx.destination);
      ringOscillator.start();
      let high = true;
      ringTimerTone = setInterval(() => {
        if (!ringOscillator) return;
        ringOscillator.frequency.value = high ? 480 : 440;
        high = !high;
      }, 500);
    } catch {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }

  let ringTimerTone = null;

  function stopRingtone() {
    if (ringTimerTone) {
      clearInterval(ringTimerTone);
      ringTimerTone = null;
    }
    if (ringOscillator) {
      try { ringOscillator.stop(); } catch { /* ignore */ }
      ringOscillator = null;
    }
    if (ringAudioCtx) {
      ringAudioCtx.close().catch(() => {});
      ringAudioCtx = null;
    }
    ringGain = null;
  }

  function showIncomingNotification(name, callId) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const n = new Notification(tr("call_incoming", "Incoming voice call…"), {
        body: name || tr("call_someone", "Someone"),
        icon: "https://www.zedmarket.app/icon-192.png",
        tag: `call-${callId}`,
        requireInteraction: true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch { /* ignore */ }
  }

  function ensureOverlay() {
    if (document.getElementById("voiceCallOverlay")) return;

    const style = document.createElement("style");
    style.textContent = `
      #voiceCallOverlay {
        display: none; position: fixed; inset: 0; z-index: 500;
        background: linear-gradient(180deg, #0b141a 0%, #111b21 40%, #1a2a32 100%);
        flex-direction: column; align-items: center; justify-content: space-between;
        padding: 48px 24px 32px; color: #fff; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
      }
      #voiceCallOverlay.open { display: flex; }
      .vc-top { text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; width: 100%; }
      .vc-avatar {
        width: 120px; height: 120px; border-radius: 60px;
        background: #2a3942; display: flex; align-items: center; justify-content: center;
        font-size: 48px; font-weight: 700; color: #8696a0; margin-bottom: 8px;
      }
      .vc-name { font-size: 26px; font-weight: 600; color: #e9edef; }
      .vc-status { font-size: 15px; color: #8696a0; min-height: 22px; }
      .vc-location {
        font-size: 13px; color: #53bdeb; margin-top: 4px; max-width: 280px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .vc-location a { color: #53bdeb; text-decoration: none; }
      .vc-tools { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center; }
      .vc-tool-btn {
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        background: none; border: none; color: #e9edef; cursor: pointer; min-width: 72px;
      }
      .vc-tool-icon {
        width: 52px; height: 52px; border-radius: 26px; background: rgba(255,255,255,0.12);
        display: flex; align-items: center; justify-content: center;
      }
      .vc-tool-icon.on { background: #25d366; }
      .vc-tool-icon svg { width: 22px; height: 22px; stroke: #fff; fill: none; stroke-width: 2; }
      .vc-tool-label { font-size: 11px; color: #8696a0; }
      .vc-actions { display: flex; gap: 48px; align-items: center; justify-content: center; width: 100%; }
      .vc-actions.single { justify-content: center; }
      .vc-btn {
        width: 64px; height: 64px; border-radius: 32px; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      .vc-btn svg { width: 28px; height: 28px; fill: #fff; stroke: none; }
      .vc-btn-decline, .vc-btn-end { background: #e01b27; }
      .vc-btn-accept { background: #25d366; }
      .vc-btn-label { font-size: 12px; color: #8696a0; text-align: center; margin-top: 8px; }
      .vc-action-wrap { display: flex; flex-direction: column; align-items: center; }
      .vc-pulse { animation: vc-pulse 1.5s ease-in-out infinite; }
      @keyframes vc-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.85; } }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "voiceCallOverlay";
    overlay.innerHTML = `
      <div class="vc-top">
        <div class="vc-avatar vc-pulse" id="vcAvatar">?</div>
        <div class="vc-name" id="vcName"></div>
        <div class="vc-status" id="vcStatus"></div>
        <div class="vc-location" id="vcLocation" style="display:none"></div>
      </div>
      <div class="vc-tools" id="vcTools" style="display:none"></div>
      <div class="vc-actions single" id="vcActions"></div>
      <audio id="voiceCallRemoteAudio" autoplay playsinline></audio>
    `;
    document.body.appendChild(overlay);
    remoteAudio = document.getElementById("voiceCallRemoteAudio");
  }

  function updateLocationDisplay() {
    const el = document.getElementById("vcLocation");
    if (!el) return;
    if (!peerLocation) {
      el.style.display = "none";
      return;
    }
    const mapsUrl = `https://www.google.com/maps?q=${peerLocation.lat},${peerLocation.lng}`;
    el.style.display = "block";
    el.innerHTML = `<a href="${mapsUrl}" target="_blank" rel="noopener">${tr("call_peer_location", "Their location")} · ${peerLocation.lat.toFixed(4)}, ${peerLocation.lng.toFixed(4)}</a>`;
  }

  function renderConnectedTools() {
    const tools = document.getElementById("vcTools");
    if (!tools) return;
    tools.style.display = "flex";
    tools.innerHTML = `
      <button class="vc-tool-btn" id="vcShareLocationBtn" type="button">
        <span class="vc-tool-icon ${sharingLocation ? "on" : ""}" id="vcShareLocationIcon">
          <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </span>
        <span class="vc-tool-label">${sharingLocation ? tr("call_sharing_location", "Sharing location") : tr("call_share_location", "Share location")}</span>
      </button>
      <button class="vc-tool-btn" id="vcOpenMyLocationBtn" type="button">
        <span class="vc-tool-icon">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
        </span>
        <span class="vc-tool-label">${tr("call_my_location", "My location")}</span>
      </button>
    `;
    document.getElementById("vcShareLocationBtn").addEventListener("click", toggleShareLocation);
    document.getElementById("vcOpenMyLocationBtn").addEventListener("click", openMyLocation);
  }

  function hideConnectedTools() {
    const tools = document.getElementById("vcTools");
    if (tools) tools.style.display = "none";
    const loc = document.getElementById("vcLocation");
    if (loc) loc.style.display = "none";
  }

  async function openMyLocation() {
    if (!navigator.geolocation) {
      alert(tr("call_location_unavailable", "Location is not available on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, "_blank");
      },
      () => alert(tr("call_location_denied", "Location permission is needed to share your position.")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function sendLocationPayload(lat, lng) {
    const payload = { lat, lng, at: Date.now() };
    if (locationChannel?.readyState === "open") {
      locationChannel.send(JSON.stringify(payload));
    }
    if (activeCallId) {
      api(`/${activeCallId}/location`, "POST", { lat, lng }).catch(() => {});
    }
    emitCallEvent("location_sent", { lat, lng, peerUserId, peerName });
  }

  function bindLocationChannel(channel) {
    locationChannel = channel;
    channel.onmessage = (event) => {
      try {
        peerLocation = JSON.parse(event.data);
        updateLocationDisplay();
        emitCallEvent("location_received", { ...peerLocation, peerUserId, peerName });
      } catch { /* ignore */ }
    };
  }

  function setupDataChannel() {
    if (!pc) return;
    if (isCaller) {
      bindLocationChannel(pc.createDataChannel("location", { ordered: true }));
    } else {
      pc.ondatachannel = (event) => {
        if (event.channel.label === "location") bindLocationChannel(event.channel);
      };
    }
  }

  function stopLocationSharing() {
    sharingLocation = false;
    if (locationWatchId != null) {
      navigator.geolocation.clearWatch(locationWatchId);
      locationWatchId = null;
    }
    if (locationSendTimer) {
      clearInterval(locationSendTimer);
      locationSendTimer = null;
    }
  }

  async function toggleShareLocation() {
    if (sharingLocation) {
      stopLocationSharing();
      renderConnectedTools();
      return;
    }
    if (!navigator.geolocation) {
      alert(tr("call_location_unavailable", "Location is not available on this device."));
      return;
    }
    sharingLocation = true;
    renderConnectedTools();
    const pushLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendLocationPayload(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    };
    pushLocation();
    locationWatchId = navigator.geolocation.watchPosition(
      (pos) => sendLocationPayload(pos.coords.latitude, pos.coords.longitude),
      () => alert(tr("call_location_denied", "Location permission is needed to share your position.")),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    locationSendTimer = setInterval(pushLocation, LOCATION_SEND_MS);
  }

  function setOverlay(name, status, mode) {
    ensureOverlay();
    const overlay = document.getElementById("voiceCallOverlay");
    const avatar = document.getElementById("vcAvatar");
    const nameEl = document.getElementById("vcName");
    const statusEl = document.getElementById("vcStatus");
    const actions = document.getElementById("vcActions");

    nameEl.textContent = name || tr("call_someone", "Someone");
    statusEl.textContent = status;
    avatar.textContent = (name || "?").charAt(0).toUpperCase();
    overlay.classList.add("open");

    if (mode === "connected") {
      renderConnectedTools();
      updateLocationDisplay();
    } else {
      hideConnectedTools();
    }

    if (mode === "incoming") {
      actions.classList.remove("single");
      actions.innerHTML = `
        <div class="vc-action-wrap">
          <button class="vc-btn vc-btn-decline" id="vcDeclineBtn" aria-label="Decline">
            <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)"/></svg>
          </button>
          <div class="vc-btn-label">${tr("call_decline", "Decline")}</div>
        </div>
        <div class="vc-action-wrap">
          <button class="vc-btn vc-btn-accept" id="vcAcceptBtn" aria-label="Accept">
            <svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </button>
          <div class="vc-btn-label">${tr("call_accept", "Accept")}</div>
        </div>
      `;
      document.getElementById("vcDeclineBtn").addEventListener("click", rejectCall);
      document.getElementById("vcAcceptBtn").addEventListener("click", acceptCall);
    } else {
      actions.classList.add("single");
      actions.innerHTML = `
        <div class="vc-action-wrap">
          <button class="vc-btn vc-btn-end" id="vcEndBtn" aria-label="End call">
            <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)"/></svg>
          </button>
          <div class="vc-btn-label">${tr("call_end", "End")}</div>
        </div>
      `;
      document.getElementById("vcEndBtn").addEventListener("click", endCall);
    }
  }

  function hideOverlay() {
    const overlay = document.getElementById("voiceCallOverlay");
    if (overlay) overlay.classList.remove("open");
  }

  function startDurationTimer() {
    stopDurationTimer();
    callSeconds = 0;
    durationTimer = setInterval(() => {
      callSeconds += 1;
      const statusEl = document.getElementById("vcStatus");
      if (statusEl && callState === "connected") {
        statusEl.textContent = formatDuration(callSeconds);
      }
      emitCallEvent("duration", {
        seconds: callSeconds,
        peerUserId,
        peerName,
        formatted: formatDuration(callSeconds),
      });
    }, 1000);
  }

  function stopDurationTimer() {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
  }

  function startRingTimer() {
    clearRingTimer();
    ringTimer = setTimeout(() => {
      if (callState === "outgoing" || callState === "incoming") {
        const reason = callState === "incoming" ? "missed" : "no_answer";
        emitCallEvent(reason, {
          peerUserId: isCaller ? peerUserId : callerUserId,
          peerName,
          duration: 0,
        });
        showBriefStatus(tr("call_no_answer", "No answer"));
        endCall(false);
      }
    }, RING_TIMEOUT_MS);
  }

  function clearRingTimer() {
    if (ringTimer) {
      clearTimeout(ringTimer);
      ringTimer = null;
    }
  }

  async function setupLocalAudio() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return localStream;
  }

  function createPeerConnection() {
    pc = new RTCPeerConnection(PC_CONFIG);
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }
    pc.ontrack = (event) => {
      if (remoteAudio && event.streams[0]) remoteAudio.srcObject = event.streams[0];
    };
    pc.onicecandidate = (event) => {
      if (event.candidate && activeCallId) {
        api(`/${activeCallId}/ice`, "POST", { candidate: event.candidate }).catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc && (pc.connectionState === "failed" || pc.connectionState === "disconnected")) {
        emitCallEvent("ended", { peerUserId, peerName, duration: callSeconds, reason: "disconnected" });
        showBriefStatus(tr("call_ended", "Call ended"));
        endCall(true);
      }
    };
    setupDataChannel();
  }

  function startPolling() {
    if (pollTimer) return;
    pollEvents();
    pollTimer = setInterval(pollEvents, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollEvents() {
    if (!getToken() || pollInFlight) return;
    pollInFlight = true;
    try {
      const { events } = await api("/poll");
      for (const ev of events) await handleEvent(ev);
    } catch { /* ignore */ } finally {
      pollInFlight = false;
    }
  }

  async function handleEvent(ev) {
    if (!ev || !ev.type) return;

    if (ev.type === "incoming") {
      if (callState !== "idle") return;
      activeCallId = ev.call_id;
      isCaller = false;
      callerUserId = ev.caller_id;
      peerUserId = ev.caller_id;
      peerName = ev.caller_name || tr("call_someone", "Someone");
      callState = "incoming";
      pendingOffer = ev.offer;
      setOverlay(peerName, tr("call_incoming", "Incoming voice call…"), "incoming");
      startRingTimer();
      startRingtone();
      if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
      showIncomingNotification(peerName, ev.call_id);
      emitCallEvent("incoming", {
        callId: ev.call_id,
        callerId: ev.caller_id,
        callerName: peerName,
        peerUserId: ev.caller_id,
        peerName,
      });
      return;
    }

    if (ev.call_id && activeCallId && ev.call_id !== activeCallId) return;

    if (ev.type === "answered" && isCaller && pc) {
      clearRingTimer();
      stopRingtone();
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(ev.answer));
        callState = "connected";
        setOverlay(peerName, formatDuration(0), "connected");
        startDurationTimer();
        emitCallEvent("connected", { peerUserId, peerName });
      } catch {
        endCall(true);
      }
      return;
    }

    if (ev.type === "rejected" && isCaller) {
      stopRingtone();
      emitCallEvent("declined", { peerUserId, peerName, duration: 0 });
      showBriefStatus(tr("call_declined", "Declined"));
      cleanup(true);
      return;
    }

    if (ev.type === "ended") {
      if (callState !== "idle") {
        stopRingtone();
        emitCallEvent("ended", {
          peerUserId: isCaller ? peerUserId : callerUserId,
          peerName,
          duration: callSeconds,
          reason: ev.reason || "ended",
        });
        showBriefStatus(tr("call_ended", "Call ended"));
        cleanup(true);
      }
      return;
    }

    if (ev.type === "missed" && callState === "idle") {
      emitCallEvent("missed", {
        callerId: ev.caller_id,
        callerName: ev.caller_name || tr("call_someone", "Someone"),
        peerUserId: ev.caller_id,
        peerName: ev.caller_name || tr("call_someone", "Someone"),
      });
      return;
    }

    if (ev.type === "location" && callState === "connected") {
      peerLocation = { lat: ev.lat, lng: ev.lng, at: Date.now() };
      updateLocationDisplay();
      emitCallEvent("location_received", { ...peerLocation, peerUserId, peerName });
      return;
    }

    if (ev.type === "ice" && pc && ev.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(ev.candidate));
      } catch { /* ignore */ }
    }
  }

  function showBriefStatus(msg) {
    const statusEl = document.getElementById("vcStatus");
    if (statusEl) statusEl.textContent = msg;
    setTimeout(hideOverlay, 1200);
  }

  function cleanup(silent) {
    const keepListening = listenerStarted && getToken();
    const endedDuration = callSeconds;
    stopPolling();
    stopDurationTimer();
    clearRingTimer();
    stopRingtone();
    stopLocationSharing();
    locationChannel = null;
    peerLocation = null;
    if (pc) {
      pc.close();
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    if (remoteAudio) remoteAudio.srcObject = null;
    activeCallId = null;
    isCaller = false;
    peerName = "";
    peerUserId = null;
    callerUserId = null;
    callState = "idle";
    pendingOffer = null;
    callSeconds = endedDuration;
    if (!silent) hideOverlay();
    else setTimeout(hideOverlay, 800);
    if (keepListening) startPolling();
  }

  async function endCall(localOnly) {
    const callId = activeCallId;
    const duration = callSeconds;
    if (!localOnly && callState === "connected") {
      emitCallEvent("ended", { peerUserId, peerName, duration, reason: "hangup" });
    }
    cleanup(true);
    if (!localOnly && callId) {
      try {
        await api(`/${callId}/end`, "POST");
      } catch { /* ignore */ }
    }
  }

  async function rejectCall() {
    const callId = activeCallId;
    emitCallEvent("declined", {
      peerUserId: callerUserId,
      peerName,
      duration: 0,
      incoming: true,
    });
    cleanup(true);
    if (callId) {
      try {
        await api(`/${callId}/reject`, "POST");
      } catch { /* ignore */ }
    }
  }

  async function acceptCall() {
    if (callState !== "incoming" || !pendingOffer || !activeCallId) return;
    try {
      stopRingtone();
      await setupLocalAudio();
      createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await api(`/${activeCallId}/answer`, "POST", { answer: pc.localDescription });
      clearRingTimer();
      callState = "connected";
      setOverlay(peerName, formatDuration(0), "connected");
      startDurationTimer();
      startPolling();
      emitCallEvent("connected", { peerUserId: callerUserId, peerName, incoming: true });
    } catch {
      showBriefStatus(tr("call_mic_denied", "Microphone access needed"));
      rejectCall();
    }
  }

  async function startVoiceCall(targetUserId, targetName) {
    if (!getToken()) return false;
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) return false;
    if (callState !== "idle") {
      alert(tr("call_busy_self", "You are already on a call."));
      return false;
    }

    try {
      await setupLocalAudio();
      isCaller = true;
      peerUserId = String(targetUserId);
      peerName = targetName || tr("call_someone", "Someone");
      callState = "outgoing";
      setOverlay(peerName, tr("call_calling", "Calling…"), "active");
      startRingTimer();
      emitCallEvent("outgoing", { peerUserId, peerName });

      createPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const data = await api("/start", "POST", {
        callee_id: targetUserId,
        offer: pc.localDescription,
        caller_name: getUserName(),
      });

      activeCallId = data.call_id;
      document.getElementById("vcStatus").textContent = tr("call_ringing", "Ringing…");
      emitCallEvent("ringing", { peerUserId, peerName, callId: data.call_id });
      startPolling();
      return true;
    } catch (err) {
      cleanup(true);
      if (err.code === "user_busy") alert(tr("call_user_busy", "User is on another call."));
      else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        alert(tr("call_mic_denied", "Microphone access is needed for voice calls."));
      } else if (err.code === "busy") alert(tr("call_busy_self", "You are already on a call."));
      return false;
    }
  }

  function initIncomingCallListener() {
    if (listenerStarted || !getToken()) return;
    if (!window.RTCPeerConnection) return;
    listenerStarted = true;
    startPolling();
    window.addEventListener("pagehide", () => {
      if (callState === "idle") stopPolling();
    });
  }

  window.startVoiceCall = startVoiceCall;
  window.initIncomingCallListener = initIncomingCallListener;
  window.isVoiceCallActive = () => callState !== "idle";
  window.getVoiceCallState = () => ({
    state: callState,
    peerUserId,
    peerName,
    callerUserId,
    duration: callSeconds,
    isCaller,
  });
  window.acceptVoiceCall = acceptCall;
  window.rejectVoiceCall = rejectCall;
})();
