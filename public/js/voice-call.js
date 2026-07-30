(function () {
  const PC_CONFIG = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };
  const RING_TIMEOUT_MS = 45000;
  const POLL_MS = 1500;

  let pc = null;
  let localStream = null;
  let remoteAudio = null;
  let activeCallId = null;
  let pollTimer = null;
  let durationTimer = null;
  let ringTimer = null;
  let callSeconds = 0;
  let isCaller = false;
  let peerName = "";
  let callState = "idle";
  let pendingOffer = null;
  let pollInFlight = false;
  let listenerStarted = false;

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

  function tr(key, fallback) {
    return typeof window.t === "function" ? window.t(key) : fallback;
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

  function formatDuration(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function ensureOverlay() {
    if (document.getElementById("voiceCallOverlay")) return;

    const style = document.createElement("style");
    style.textContent = `
      #voiceCallOverlay {
        display: none; position: fixed; inset: 0; z-index: 500;
        background: linear-gradient(180deg, #0b141a 0%, #111b21 40%, #1a2a32 100%);
        flex-direction: column; align-items: center; justify-content: space-between;
        padding: 48px 24px 40px; color: #fff; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
      }
      #voiceCallOverlay.open { display: flex; }
      .vc-top { text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
      .vc-avatar {
        width: 120px; height: 120px; border-radius: 60px;
        background: #2a3942; display: flex; align-items: center; justify-content: center;
        font-size: 48px; font-weight: 700; color: #8696a0; margin-bottom: 8px;
      }
      .vc-name { font-size: 26px; font-weight: 600; color: #e9edef; }
      .vc-status { font-size: 15px; color: #8696a0; min-height: 22px; }
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
      </div>
      <div class="vc-actions single" id="vcActions">
        <div class="vc-action-wrap">
          <button class="vc-btn vc-btn-end" id="vcEndBtn" aria-label="End call">
            <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41l2.76-2.76c.18-.18.43-.29.71-.29.27 0 .52.11.7.28.73.79 1.36 1.68 1.85 2.66.16.33.51.56.9.56h3.1c.47-1.45.72-3 0.72-4.6 0-.55.45-1 1-1h6c.55 0 1 .45 1 1 0 1.6.25 3.15.72 4.6h3.1c.39 0 .74-.23.9-.56.49-.98 1.12-1.87 1.85-2.66.18-.18.43-.29.71-.29.28 0 .53.11.71.29l2.76 2.76c.39.39.39 1.02 0 1.41l-2.76 2.76a.996.996 0 0 1-1.41 0c-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" transform="rotate(135 12 12)"/></svg>
          </button>
          <div class="vc-btn-label" id="vcEndLabel"></div>
        </div>
      </div>
      <audio id="voiceCallRemoteAudio" autoplay playsinline></audio>
    `;
    document.body.appendChild(overlay);

    remoteAudio = document.getElementById("voiceCallRemoteAudio");
    document.getElementById("vcEndBtn").addEventListener("click", () => {
      if (callState === "incoming") rejectCall();
      else endCall();
    });
  }

  function setOverlay(name, status, mode) {
    ensureOverlay();
    const overlay = document.getElementById("voiceCallOverlay");
    const avatar = document.getElementById("vcAvatar");
    const nameEl = document.getElementById("vcName");
    const statusEl = document.getElementById("vcStatus");
    const actions = document.getElementById("vcActions");
    const endLabel = document.getElementById("vcEndLabel");

    nameEl.textContent = name || tr("call_someone", "Someone");
    statusEl.textContent = status;
    avatar.textContent = (name || "?").charAt(0).toUpperCase();
    overlay.classList.add("open");

    if (mode === "incoming") {
      actions.classList.remove("single");
      actions.innerHTML = `
        <div class="vc-action-wrap">
          <button class="vc-btn vc-btn-decline" id="vcDeclineBtn" aria-label="Decline">
            <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41l2.76-2.76c.18-.18.43-.29.71-.29.27 0 .52.11.7.28.73.79 1.36 1.68 1.85 2.66.16.33.51.56.9.56h3.1c.47-1.45.72-3 0.72-4.6 0-.55.45-1 1-1h6c.55 0 1 .45 1 1 0 1.6.25 3.15.72 4.6h3.1c.39 0 .74-.23.9-.56.49-.98 1.12-1.87 1.85-2.66.18-.18.43-.29.71-.29.28 0 .53.11.71.29l2.76 2.76c.39.39.39 1.02 0 1.41l-2.76 2.76a.996.996 0 0 1-1.41 0c-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" transform="rotate(135 12 12)"/></svg>
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
            <svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41l2.76-2.76c.18-.18.43-.29.71-.29.27 0 .52.11.7.28.73.79 1.36 1.68 1.85 2.66.16.33.51.56.9.56h3.1c.47-1.45.72-3 0.72-4.6 0-.55.45-1 1-1h6c.55 0 1 .45 1 1 0 1.6.25 3.15.72 4.6h3.1c.39 0 .74-.23.9-.56.49-.98 1.12-1.87 1.85-2.66.18-.18.43-.29.71-.29.28 0 .53.11.71.29l2.76 2.76c.39.39.39 1.02 0 1.41l-2.76 2.76a.996.996 0 0 1-1.41 0c-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" transform="rotate(135 12 12)"/></svg>
          </button>
          <div class="vc-btn-label" id="vcEndLabel">${tr("call_end", "End")}</div>
        </div>
      `;
      document.getElementById("vcEndBtn").addEventListener("click", endCall);
    }
    if (endLabel && mode !== "incoming") {
      document.getElementById("vcEndLabel").textContent = tr("call_end", "End");
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
        showBriefStatus(tr("call_no_answer", "No answer"));
        endCall(true);
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
      if (remoteAudio && event.streams[0]) {
        remoteAudio.srcObject = event.streams[0];
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate && activeCallId) {
        api(`/${activeCallId}/ice`, "POST", { candidate: event.candidate }).catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc && (pc.connectionState === "failed" || pc.connectionState === "disconnected")) {
        showBriefStatus(tr("call_ended", "Call ended"));
        endCall(true);
      }
    };
  }

  function startPolling() {
    if (pollTimer) return;
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
      for (const ev of events) {
        await handleEvent(ev);
      }
    } catch {
      /* ignore transient poll errors */
    } finally {
      pollInFlight = false;
    }
  }

  async function handleEvent(ev) {
    if (!ev || !ev.type) return;

    if (ev.type === "incoming") {
      if (callState !== "idle") return;
      activeCallId = ev.call_id;
      isCaller = false;
      peerName = ev.caller_name || tr("call_someone", "Someone");
      callState = "incoming";
      setOverlay(peerName, tr("call_incoming", "Incoming voice call…"), "incoming");
      startRingTimer();
      pendingOffer = ev.offer;
      return;
    }

    if (ev.call_id && activeCallId && ev.call_id !== activeCallId) return;

    if (ev.type === "answered" && isCaller && pc) {
      clearRingTimer();
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(ev.answer));
        callState = "connected";
        document.getElementById("vcStatus").textContent = formatDuration(0);
        startDurationTimer();
      } catch {
        endCall(true);
      }
      return;
    }

    if (ev.type === "rejected" && isCaller) {
      showBriefStatus(tr("call_declined", "Declined"));
      cleanup(true);
      return;
    }

    if (ev.type === "ended") {
      if (callState !== "idle") {
        showBriefStatus(tr("call_ended", "Call ended"));
        cleanup(true);
      }
      return;
    }

    if (ev.type === "missed" && callState === "idle") {
      return;
    }

    if (ev.type === "ice" && pc && ev.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(ev.candidate));
      } catch {
        /* ignore late candidates */
      }
    }
  }

  function showBriefStatus(msg) {
    const statusEl = document.getElementById("vcStatus");
    if (statusEl) statusEl.textContent = msg;
    setTimeout(hideOverlay, 1200);
  }

  function cleanup(silent) {
    const keepListening = listenerStarted && getToken();
    stopPolling();
    stopDurationTimer();
    clearRingTimer();
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
    callState = "idle";
    pendingOffer = null;
    if (!silent) hideOverlay();
    else setTimeout(hideOverlay, 800);
    if (keepListening) startPolling();
  }

  async function endCall(localOnly) {
    const callId = activeCallId;
    cleanup(true);
    if (!localOnly && callId) {
      try {
        await api(`/${callId}/end`, "POST");
      } catch {
        /* ignore */
      }
    }
  }

  async function rejectCall() {
    const callId = activeCallId;
    cleanup(true);
    if (callId) {
      try {
        await api(`/${callId}/reject`, "POST");
      } catch {
        /* ignore */
      }
    }
  }

  async function acceptCall() {
    if (callState !== "incoming" || !pendingOffer || !activeCallId) return;
    try {
      await setupLocalAudio();
      createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await api(`/${activeCallId}/answer`, "POST", { answer: pc.localDescription });
      clearRingTimer();
      callState = "connected";
      setOverlay(peerName, formatDuration(0), "active");
      startDurationTimer();
      startPolling();
    } catch {
      showBriefStatus(tr("call_mic_denied", "Microphone access needed"));
      rejectCall();
    }
  }

  async function startVoiceCall(targetUserId, targetName) {
    if (!getToken()) return false;
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    if (callState !== "idle") {
      alert(tr("call_busy_self", "You are already on a call."));
      return false;
    }

    try {
      await setupLocalAudio();
      isCaller = true;
      peerName = targetName || tr("call_someone", "Someone");
      callState = "outgoing";
      setOverlay(peerName, tr("call_calling", "Calling…"), "active");
      startRingTimer();

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
      startPolling();
      return true;
    } catch (err) {
      cleanup(true);
      if (err.code === "user_busy") {
        alert(tr("call_user_busy", "User is on another call."));
      } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        alert(tr("call_mic_denied", "Microphone access is needed for voice calls."));
      } else if (err.code === "busy") {
        alert(tr("call_busy_self", "You are already on a call."));
      }
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
})();
