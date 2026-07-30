const CALL_RING_MS = 45 * 1000;

/** @type {Map<string, object>} */
const calls = new Map();
/** @type {Map<string, object[]>} */
const mailboxes = new Map();

function mailboxPush(userId, event) {
  const key = String(userId);
  const box = mailboxes.get(key) || [];
  box.push({ ...event, at: Date.now() });
  mailboxes.set(key, box);
}

function userInActiveCall(userId) {
  const key = String(userId);
  for (const call of calls.values()) {
    if (call.status === "ended" || call.status === "rejected") continue;
    if (call.callerId === key || call.calleeId === key) return call.id;
  }
  return null;
}

function expireStaleCalls() {
  const now = Date.now();
  for (const [id, call] of calls.entries()) {
    if (call.status === "ringing" && now - call.createdAt > CALL_RING_MS) {
      call.status = "ended";
      mailboxPush(call.callerId, { type: "ended", call_id: id, reason: "timeout" });
      mailboxPush(call.calleeId, {
        type: "missed",
        call_id: id,
        caller_id: call.callerId,
        caller_name: call.callerName,
      });
      calls.delete(id);
    }
  }
}

function registerVoiceCallRoutes(app, getUserIdFromToken) {
  app.post("/api/calls/start", (req, res) => {
    const callerId = getUserIdFromToken(req.headers.authorization);
    if (!callerId) return res.status(401).json({ error: "Unauthorized" });

    expireStaleCalls();

    const { callee_id, offer, caller_name } = req.body || {};
    if (!callee_id || !offer) return res.status(400).json({ error: "Missing fields" });

    const callerKey = String(callerId);
    const calleeKey = String(callee_id);
    if (callerKey === calleeKey) return res.status(400).json({ error: "Cannot call yourself" });

    if (userInActiveCall(callerKey)) {
      return res.status(409).json({ error: "busy" });
    }
    if (userInActiveCall(calleeKey)) {
      return res.status(409).json({ error: "user_busy" });
    }

    const callId = `call_${Date.now()}_${callerKey}`;
    const call = {
      id: callId,
      callerId: callerKey,
      calleeId: calleeKey,
      callerName: caller_name || "Someone",
      status: "ringing",
      offer,
      answer: null,
      createdAt: Date.now(),
    };
    calls.set(callId, call);
    mailboxPush(calleeKey, {
      type: "incoming",
      call_id: callId,
      caller_id: callerKey,
      caller_name: call.callerName,
      offer,
    });
    res.json({ call_id: callId });
  });

  app.get("/api/calls/poll", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    expireStaleCalls();

    const key = String(userId);
    const events = mailboxes.get(key) || [];
    mailboxes.set(key, []);
    res.json({ events });
  });

  app.post("/api/calls/:id/answer", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const call = calls.get(req.params.id);
    if (!call) return res.status(404).json({ error: "Call not found" });
    if (String(userId) !== call.calleeId) return res.status(403).json({ error: "Forbidden" });
    if (call.status !== "ringing") return res.status(409).json({ error: "Call not ringing" });

    const { answer } = req.body || {};
    if (!answer) return res.status(400).json({ error: "Missing answer" });

    call.answer = answer;
    call.status = "connected";
    mailboxPush(call.callerId, { type: "answered", call_id: call.id, answer });
    res.json({ ok: true });
  });

  app.post("/api/calls/:id/reject", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const call = calls.get(req.params.id);
    if (!call) return res.json({ ok: true });
    if (String(userId) !== call.calleeId) return res.status(403).json({ error: "Forbidden" });

    call.status = "rejected";
    mailboxPush(call.callerId, { type: "rejected", call_id: call.id });
    calls.delete(call.id);
    res.json({ ok: true });
  });

  app.post("/api/calls/:id/end", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const call = calls.get(req.params.id);
    if (!call) return res.json({ ok: true });

    const userKey = String(userId);
    if (userKey !== call.callerId && userKey !== call.calleeId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    call.status = "ended";
    const other = userKey === call.callerId ? call.calleeId : call.callerId;
    mailboxPush(other, { type: "ended", call_id: call.id });
    calls.delete(call.id);
    res.json({ ok: true });
  });

  app.post("/api/calls/:id/location", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const call = calls.get(req.params.id);
    if (!call || call.status !== "connected") {
      return res.status(404).json({ error: "Call not active" });
    }

    const userKey = String(userId);
    if (userKey !== call.callerId && userKey !== call.calleeId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { lat, lng } = req.body || {};
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "Invalid location" });
    }

    const other = userKey === call.callerId ? call.calleeId : call.callerId;
    mailboxPush(other, {
      type: "location",
      call_id: call.id,
      lat,
      lng,
      from_user_id: userKey,
    });
    res.json({ ok: true });
  });

  app.post("/api/calls/:id/ice", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const call = calls.get(req.params.id);
    if (!call) return res.status(404).json({ error: "Call not found" });

    const userKey = String(userId);
    if (userKey !== call.callerId && userKey !== call.calleeId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const other = userKey === call.callerId ? call.calleeId : call.callerId;
    const { candidate } = req.body || {};
    if (candidate) {
      mailboxPush(other, { type: "ice", call_id: call.id, candidate });
    }
    res.json({ ok: true });
  });
}

module.exports = { registerVoiceCallRoutes };
