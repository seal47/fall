/* Dodge the Falling Object - Global Leaderboard via Vercel KV
   Bigger game area + scaled player/obstacles
*/

(() => {
  // ---------- DOM references ----------
  const gameEl = document.getElementById("game");
  const playerEl = document.getElementById("player");
  const scoreEl = document.getElementById("score");

  const overlayEl = document.getElementById("overlay");
  const paneStartEl = document.getElementById("pane-start");
  const paneOverEl = document.getElementById("pane-over");
  const walletInputEl = document.getElementById("wallet-input");
  const btnStart = document.getElementById("btn-start");
  const btnRestart = document.getElementById("btn-restart");
  const btnChangeWallet = document.getElementById("btn-change-wallet");
  const finalScoreEl = document.getElementById("final-score");

  const youWalletEl = document.getElementById("you-wallet");
  const youBestEl = document.getElementById("you-best");
  const lbListEl = document.getElementById("lb-list");
  const lbEmptyEl = document.getElementById("lb-empty");

  // ---------- Config ----------
  const LB_LIMIT = 100;

  // Keep only for remembering which wallet to use on this device
  const LS_KEY_WALLET = "dodge.currentWallet.v1";

  // ---------- Game state ----------
  const state = {
    running: false,
    gameOver: false,
    width: 0,
    height: 0,
    tPrev: 0,
    elapsed: 0,
    score: 0,
    difficulty: 0,
    obstacles: [],
    currentWallet: null
  };

  // Player scaled up to 64px to match the larger board
  const player = {
    w: 64,
    h: 64,
    x: 0,
    y: 0,
    vx: 0,
    maxSpeed: 560, // px/s
    accel: 3000 // px/s^2
  };

  // Input flags
  const input = { left: false, right: false };

  // Spawning
  let spawnTimer = 0;
  let spawnInterval = 0;

  // ---------- Utilities ----------
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const formatScore = (s) => Math.floor(s).toString();

  function aabb(a, b) {
    return !(
      a.x + a.w <= b.x ||
      a.x >= b.x + b.w ||
      a.y + a.h <= b.y ||
      a.y >= b.y + b.h
    );
  }

  // ---------- API helpers (same-origin Vercel functions) ----------
  async function fetchLeaderboard(limit = LB_LIMIT) {
    try {
      const res = await fetch(`/api/leaderboard?limit=${limit}`);
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      return Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      console.warn("Failed to fetch leaderboard:", e);
      return [];
    }
  }

  async function fetchBest(wallet) {
    if (!wallet) return 0;
    try {
      const res = await fetch(
        `/api/best?wallet=${encodeURIComponent(wallet)}`
      );
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      return Number(data.best || 0);
    } catch (e) {
      console.warn("Failed to fetch best:", e);
      return 0;
    }
  }

  async function submitScore(wallet, score) {
    try {
      const res = await fetch(`/api/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, score: Math.floor(score) })
      });
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      return {
        best: Number(data.best || 0),
        items: Array.isArray(data.items) ? data.items : null
      };
    } catch (e) {
      console.warn("Failed to submit score:", e);
      return { best: 0, items: null };
    }
  }

  // ---------- Layout ----------
  function resize() {
    const rect = gameEl.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;

    player.y = state.height - player.h - 14;
    player.x = clamp(player.x, 0, state.width - player.w);

    updatePlayerTransform();
  }

  function updatePlayerTransform() {
    playerEl.style.transform = `translate(${player.x}px, ${player.y}px)`;
  }

  // ---------- Obstacles (scaled up a bit) ----------
  function createObstacle(preferredX = null) {
    // Slightly larger range to fit the bigger board
    const minSize = 28;
    const maxSize = 96;
    const size = rand(
      minSize,
      maxSize - Math.min(34, state.difficulty * 1.5)
    );

    const w = size | 0;
    const h = (rand(size * 0.8, size * 1.4) | 0) + 6;

    let x;
    if (preferredX != null) {
      const jitter = rand(-90, 90);
      x = clamp(preferredX + jitter, 0, Math.max(1, state.width - w));
    } else {
      x = rand(0, Math.max(1, state.width - w));
    }
    const y = -h - 6;

    // Faster base speed so falls still feel snappy on the taller board
    const baseSpeed = 340 + state.difficulty * 42;
    const speed = rand(baseSpeed * 0.9, baseSpeed * 1.25);

    const rotation = rand(-18, 18);

    const el = document.createElement("div");
    el.className = "obstacle";
    const variant = Math.random();
    if (variant < 0.33) el.classList.add("variant-teal");
    else if (variant < 0.66) el.classList.add("variant-lime");

    el.style.borderRadius = `${Math.round(rand(12, 26))}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;

    gameEl.appendChild(el);
    return { x, y, w, h, speed, rotation, el };
  }

  // ---------- Leaderboard rendering ----------
  function renderLeaderboard(items, currentWallet) {
    lbListEl.innerHTML = "";

    if (!items || items.length === 0) {
      lbEmptyEl.style.display = "block";
      return;
    }
    lbEmptyEl.style.display = "none";

    items.slice(0, LB_LIMIT).forEach((e, i) => {
      const li = document.createElement("li");
      li.className = "lb-item";
      if (i === 0) li.classList.add("top-1");
      else if (i === 1) li.classList.add("top-2");
      else if (i === 2) li.classList.add("top-3");
      if (currentWallet && e.wallet === currentWallet) {
        li.classList.add("me");
      }

      const rank = document.createElement("div");
      rank.className = "lb-rank";
      rank.textContent = String(i + 1);

      const wallet = document.createElement("div");
      wallet.className = "lb-wallet";
      wallet.textContent = e.wallet;

      const score = document.createElement("div");
      score.className = "lb-score";
      score.textContent = formatScore(e.best);

      li.appendChild(rank);
      li.appendChild(wallet);
      li.appendChild(score);
      lbListEl.appendChild(li);
    });
  }

  async function refreshLeaderboard() {
    const items = await fetchLeaderboard(LB_LIMIT);
    renderLeaderboard(items, state.currentWallet);
  }

  async function refreshYouBest() {
    if (!state.currentWallet) return;
    const best = await fetchBest(state.currentWallet);
    youBestEl.textContent = formatScore(best);
  }

  // ---------- Game control ----------
  function startGame() {
    for (const o of state.obstacles) o.el.remove();
    state.obstacles.length = 0;

    state.running = true;
    state.gameOver = false;
    state.tPrev = performance.now();
    state.elapsed = 0;
    state.score = 0;
    state.difficulty = 0;

    spawnTimer = 0;
    spawnInterval = 720; // will ramp down to ~250ms

    player.vx = 0;
    player.x = (state.width - player.w) / 2;
    player.y = state.height - player.h - 14;
    updatePlayerTransform();

    overlayEl.classList.add("hidden");
    paneStartEl.classList.remove("hidden");
    paneOverEl.classList.add("hidden");

    requestAnimationFrame(tick);
  }

  async function endGame() {
    state.running = false;
    state.gameOver = true;
    finalScoreEl.textContent = formatScore(state.score);

    if (state.currentWallet) {
      const result = await submitScore(state.currentWallet, state.score);
      if (result.items) {
        renderLeaderboard(result.items, state.currentWallet);
      } else {
        await refreshLeaderboard();
      }
      youBestEl.textContent = formatScore(
        Math.max(Number(youBestEl.textContent) || 0, result.best || 0)
      );
    }

    paneStartEl.classList.add("hidden");
    paneOverEl.classList.remove("hidden");
    overlayEl.classList.remove("hidden");
  }

  // ---------- Main loop ----------
  function tick(tNow) {
    if (!state.running) return;

    const dt = Math.min(0.032, (tNow - state.tPrev) / 1000);
    state.tPrev = tNow;
    state.elapsed += dt;

    state.difficulty += dt * 1.15;

    const minInterval = 250;
    const maxInterval = 720;
    const k = Math.min(1, state.difficulty / 25);
    spawnInterval = maxInterval - (maxInterval - minInterval) * k;

    const target =
      (input.left ? -1 : 0) + (input.right ? 1 : 0); // -1, 0, or 1
    const targetVx = target * player.maxSpeed;

    if (player.vx < targetVx) {
      player.vx = Math.min(player.vx + player.accel * dt, targetVx);
    } else if (player.vx > targetVx) {
      player.vx = Math.max(player.vx - player.accel * dt, targetVx);
    }

    player.x += player.vx * dt;
    player.x = clamp(player.x, 0, state.width - player.w);
    updatePlayerTransform();

    spawnTimer += dt * 1000;
    while (spawnTimer >= spawnInterval) {
      spawnTimer -= spawnInterval;

      const biasChance = 0.4;
      const preferX = Math.random() < biasChance ? player.x : null;
      state.obstacles.push(createObstacle(preferX));

      if (Math.random() < 0.25) {
        const extra = Math.random() < 0.5 ? 1 : 2;
        for (let i = 0; i < extra; i++) {
          const px = Math.random() < 0.5 ? player.x : null;
          state.obstacles.push(createObstacle(px));
        }
      }
    }

    const p = { x: player.x, y: player.y, w: player.w, h: player.h };
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.y += o.speed * dt;
      o.el.style.transform = `translate(${o.x}px, ${o.y}px) rotate(${o.rotation}deg)`;

      if (o.y > state.height + 80) {
        o.el.remove();
        state.obstacles.splice(i, 1);
        continue;
      }

      if (aabb(p, { x: o.x, y: o.y, w: o.w, h: o.h })) {
        endGame();
        return;
      }
    }

    state.score += dt * 120;
    scoreEl.textContent = formatScore(state.score);

    requestAnimationFrame(tick);
  }

  // ---------- Input ----------
  function onKeyDown(e) {
    if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === " " ||
      e.code === "Space"
    ) {
      e.preventDefault();
    }

    if (e.key === "a" || e.key === "A" || e.code === "KeyA") input.left = true;
    if (e.key === "d" || e.key === "D" || e.code === "KeyD")
      input.right = true;
    if (e.key === "ArrowLeft") input.left = true;
    if (e.key === "ArrowRight") input.right = true;

    const startVisible =
      !overlayEl.classList.contains("hidden") &&
      !paneStartEl.classList.contains("hidden");
    const overVisible =
      !overlayEl.classList.contains("hidden") &&
      !paneOverEl.classList.contains("hidden");

    if (startVisible && e.key === "Enter") {
      if (!btnStart.disabled) btnStart.click();
    } else if (overVisible && (e.key === " " || e.key === "Enter")) {
      btnRestart.click();
    }
  }

  function onKeyUp(e) {
    if (e.key === "a" || e.key === "A" || e.code === "KeyA")
      input.left = false;
    if (e.key === "d" || e.key === "D" || e.code === "KeyD")
      input.right = false;
    if (e.key === "ArrowLeft") input.left = false;
    if (e.key === "ArrowRight") input.right = false;
  }

  // ---------- Wallet + UI wiring ----------
  function setCurrentWallet(wallet) {
    state.currentWallet = wallet;
    try {
      localStorage.setItem(LS_KEY_WALLET, wallet);
    } catch {}
    youWalletEl.textContent = wallet;
    youWalletEl.title = wallet;
    refreshYouBest();
    refreshLeaderboard();
  }

  function showStartPane(prefill = "") {
    walletInputEl.value = prefill;
    btnStart.disabled = walletInputEl.value.trim().length === 0;
    paneStartEl.classList.remove("hidden");
    paneOverEl.classList.add("hidden");
    overlayEl.classList.remove("hidden");
    walletInputEl.focus();
    walletInputEl.select();
  }

  walletInputEl.addEventListener("input", () => {
    btnStart.disabled = walletInputEl.value.trim().length === 0;
  });

  btnStart.addEventListener("click", () => {
    const w = walletInputEl.value.trim();
    if (!w) return;
    setCurrentWallet(w);
    startGame();
  });

  btnRestart.addEventListener("click", () => startGame());

  btnChangeWallet.addEventListener("click", () => {
    showStartPane(state.currentWallet || "");
  });

  // ---------- Boot ----------
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: true });

  resize();

  const lastWallet = (() => {
    try {
      return localStorage.getItem(LS_KEY_WALLET);
    } catch {
      return null;
    }
  })();

  refreshLeaderboard();

  if (lastWallet) {
    setCurrentWallet(lastWallet);
    showStartPane(lastWallet);
  } else {
    showStartPane("");
  }
})();
