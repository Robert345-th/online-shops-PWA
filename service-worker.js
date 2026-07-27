<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ZedMarket</title>
<meta name="theme-color" content="#16281F" />
<link rel="manifest" href="/manifest.json" />
<link rel="icon" href="/assets/icon.png" />
<style>
  :root {
    --paper: #F4F1EC;
    --paper-warm: #EDE6D8;
    --ink: #16171B;
    --ink-soft: #4A4A45;
    --market-green: #1F4B3F;
    --market-green-deep: #123028;
    --tag-gold: #C9A24B;
    --line: #D8D0C0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Georgia', 'Iowan Old Style', serif;
    background: var(--paper);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--market-green);
    color: var(--paper);
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-weight: 800;
    font-size: 1.3rem;
    letter-spacing: -0.02em;
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  .brand span { color: var(--tag-gold); }
  .brand small {
    font-family: Georgia, serif;
    font-weight: 400;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.75;
    margin-left: 6px;
  }
  .auth-btn {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--tag-gold);
    color: var(--market-green-deep);
    border: none;
    padding: 8px 16px;
    border-radius: 3px;
    cursor: pointer;
  }
  main { padding: 20px 16px 100px; max-width: 720px; margin: 0 auto; }
  .stall-note {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-soft);
    border-bottom: 2px solid var(--ink);
    display: inline-block;
    padding-bottom: 4px;
    margin: 20px 0 16px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .card {
    background: var(--paper-warm);
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }
  .card-img {
    aspect-ratio: 1 / 1;
    background: linear-gradient(135deg, #DCD3BC, #C9BFA3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-soft);
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.7rem;
  }
  .card-img img { width: 100%; height: 100%; object-fit: cover; }
  .price-tag {
    position: absolute;
    top: 8px;
    left: 8px;
    background: var(--market-green);
    color: var(--tag-gold);
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-weight: 700;
    font-size: 0.75rem;
    padding: 3px 8px;
    border-radius: 2px;
    transform: rotate(-2deg);
    box-shadow: 1px 1px 0 rgba(0,0,0,0.15);
  }
  .card-body { padding: 10px 12px 14px; }
  .card-title {
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.25;
    margin-bottom: 3px;
  }
  .card-loc {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 0.68rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .empty, .loading, .error {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    text-align: center;
    padding: 60px 20px;
    color: var(--ink-soft);
  }
  .error { color: #8B3A2B; }

  /* Modal */
  .modal-backdrop {
    display: none;
    position: fixed; inset: 0;
    background: rgba(18,48,40,0.55);
    z-index: 100;
    align-items: flex-end;
    justify-content: center;
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    background: var(--paper);
    width: 100%;
    max-width: 480px;
    border-radius: 16px 16px 0 0;
    padding: 28px 24px 32px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
  }
  .modal h2 {
    font-family: Georgia, serif;
    font-size: 1.3rem;
    margin-bottom: 18px;
    color: var(--market-green-deep);
  }
  .modal input {
    width: 100%;
    padding: 12px 14px;
    margin-bottom: 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 0.95rem;
    background: white;
  }
  .modal .primary-btn {
    width: 100%;
    background: var(--market-green);
    color: var(--paper);
    border: none;
    padding: 13px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    margin-top: 6px;
  }
  .modal .switch-link {
    text-align: center;
    margin-top: 14px;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .modal .switch-link a { color: var(--market-green); font-weight: 600; text-decoration: none; }
  .modal .close-x {
    position: absolute;
    top: 14px; right: 18px;
    background: none; border: none;
    font-size: 1.3rem; color: var(--ink-soft);
    cursor: pointer;
  }
  .modal-wrap { position: relative; }
  .modal-msg { font-size: 0.8rem; margin-bottom: 10px; }
  .modal-msg.err { color: #8B3A2B; }
  .modal-msg.ok { color: var(--market-green-deep); }
</style>
</head>
<body>

<header>
  <div class="brand">Zed<span>Market</span><small>Open-Air Digital</small></div>
  <button class="auth-btn" id="authBtn">Sign in</button>
</header>

<main>
  <div class="stall-note" id="feedLabel">Today at the market</div>
  <div id="feed" class="loading">Loading listings…</div>
</main>

<div class="modal-backdrop" id="authModal">
  <div class="modal modal-wrap">
    <button class="close-x" id="closeModal">×</button>
    <h2 id="modalTitle">Sign in</h2>
    <div id="modalMsg"></div>
    <div id="signupOnlyFields" style="display:none;">
      <input type="text" id="fullName" placeholder="Full name" />
    </div>
    <input type="text" id="identifier" placeholder="Phone or email" />
    <input type="password" id="password" placeholder="Password" />
    <button class="primary-btn" id="submitAuth">Sign in</button>
    <div class="switch-link">
      <span id="switchText">New to ZedMarket? <a id="switchLink">Create an account</a></span>
    </div>
  </div>
</div>

<script>
  const API_BASE = "https://online-shops-production.up.railway.app";
  let mode = "login"; // or "signup"

  const feed = document.getElementById("feed");
  const authModal = document.getElementById("authModal");
  const authBtn = document.getElementById("authBtn");
  const closeModal = document.getElementById("closeModal");
  const submitAuth = document.getElementById("submitAuth");
  const switchLink = document.getElementById("switchLink");
  const switchText = document.getElementById("switchText");
  const modalTitle = document.getElementById("modalTitle");
  const modalMsg = document.getElementById("modalMsg");
  const signupOnlyFields = document.getElementById("signupOnlyFields");

  function money(v) {
    if (v === undefined || v === null) return "";
    return "K" + Number(v).toLocaleString();
  }

  async function loadListings() {
    try {
      const res = await fetch(`${API_BASE}/listings`);
      if (!res.ok) throw new Error("Server error " + res.status);
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.listings || []);
      if (!items.length) {
        feed.className = "empty";
        feed.textContent = "No stalls open yet — be the first to post something.";
        return;
      }
      feed.className = "grid";
      feed.innerHTML = items.map(renderCard).join("");
    } catch (e) {
      feed.className = "error";
      feed.textContent = "Couldn't reach the market right now. Pull to refresh in a bit.";
      console.error(e);
    }
  }

  function renderCard(item) {
    const title = item.title || item.name || "Untitled item";
    const price = item.price !== undefined ? money(item.price) : "";
    const loc = item.location || item.city || "";
    const img = item.image_url || item.imageUrl || (item.images && item.images[0]);
    return `
      <div class="card">
        <div class="card-img">
          ${price ? `<div class="price-tag">${price}</div>` : ""}
          ${img ? `<img src="${img}" alt="${title}" loading="lazy" />` : "No photo"}
        </div>
        <div class="card-body">
          <div class="card-title">${title}</div>
          ${loc ? `<div class="card-loc">${loc}</div>` : ""}
        </div>
      </div>`;
  }

  // Auth modal
  authBtn.addEventListener("click", () => authModal.classList.add("open"));
  closeModal.addEventListener("click", () => authModal.classList.remove("open"));
  authModal.addEventListener("click", (e) => { if (e.target === authModal) authModal.classList.remove("open"); });

  switchLink.addEventListener("click", () => {
    mode = mode === "login" ? "signup" : "login";
    updateModalMode();
  });

  function updateModalMode() {
    modalMsg.textContent = "";
    if (mode === "login") {
      modalTitle.textContent = "Sign in";
      submitAuth.textContent = "Sign in";
      signupOnlyFields.style.display = "none";
      switchText.innerHTML = `New to ZedMarket? <a id="switchLink">Create an account</a>`;
    } else {
      modalTitle.textContent = "Create account";
      submitAuth.textContent = "Create account";
      signupOnlyFields.style.display = "block";
      switchText.innerHTML = `Already have an account? <a id="switchLink">Sign in</a>`;
    }
    document.getElementById("switchLink").addEventListener("click", () => {
      mode = mode === "login" ? "signup" : "login";
      updateModalMode();
    });
  }

  submitAuth.addEventListener("click", async () => {
    const identifier = document.getElementById("identifier").value.trim();
    const password = document.getElementById("password").value;
    const fullName = document.getElementById("fullName").value.trim();

    if (!identifier || !password) {
      modalMsg.className = "modal-msg err";
      modalMsg.textContent = "Please fill in all fields.";
      return;
    }

    const endpoint = mode === "login" ? "/auth/login" : "/auth/signup";
    const body = mode === "login"
      ? { identifier, password }
      : { identifier, password, fullName };

    submitAuth.disabled = true;
    modalMsg.className = "modal-msg";
    modalMsg.textContent = "Working on it…";

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || "Something went wrong");

      if (data.token) localStorage.setItem("zm_token", data.token);
      modalMsg.className = "modal-msg ok";
      modalMsg.textContent = mode === "login" ? "Signed in!" : "Account created!";
      setTimeout(() => authModal.classList.remove("open"), 700);
    } catch (e) {
      modalMsg.className = "modal-msg err";
      modalMsg.textContent = e.message;
    } finally {
      submitAuth.disabled = false;
    }
  });

  // PWA service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(console.error);
    });
  }

  loadListings();
</script>
</body>
</html>
