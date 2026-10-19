import { ballTexture, BALL_COLORS, mulberry32 } from "./textures.js";
import { sfx, setEnabled as setSfxEnabled } from "./audio.js";
import { setMusicEnabled, play as playMusic } from "./music.js";
import { CHAPTERS, LEVELS_PER_CHAPTER, TOTAL_LEVELS, chapterName, getLevel } from "./levels.js";
import { describe, msUntilReset } from "./missions.js";
import { normalizeAimHelp } from "./save.js";
import { getBonusLevel, modeForBonus, isBonusMilestone, bonusIdFor, BONUS_EVERY } from "./modes.js";

const HEART_SVG = '<svg class="heartIco" viewBox="0 0 24 24" fill="#ff5b86"><path d="M12 21s-7.5-4.9-9.6-9A5.4 5.4 0 0 1 12 6.3 5.4 5.4 0 0 1 21.6 12c-2.1 4.1-9.6 9-9.6 9z"/></svg>';
const COIN_SVG = '<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="12" cy="12" r="9" fill="#ffcf4a" stroke="#a97a10" stroke-width="1.6"/><circle cx="12" cy="12" r="5.4" fill="none" stroke="#c99420" stroke-width="1.3"/></svg>';
const GEM_SVG = '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M7 3h10l4 6-9 12L3 9z" fill="#7ee0ff" stroke="#2b8fc0" stroke-width="1.3"/></svg>';

export function ballIconDataUrl(number) {
  const S = 96;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const r = S / 2 - 3;
  ctx.save();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
  ctx.clip();
  const color = number == null ? "#f6f3ec" : BALL_COLORS[number] ?? "#dddddd";
  const stripe = number > 8;
  ctx.fillStyle = stripe ? "#f8f6f0" : color;
  ctx.fillRect(0, 0, S, S);
  if (stripe) {
    ctx.fillStyle = color;
    ctx.fillRect(0, S * 0.3, S, S * 0.4);
  }
  if (number != null) {
    ctx.fillStyle = "#fbfbf8";
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1c";
    ctx.font = `800 ${S * 0.34}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), S / 2, S / 2 + S * 0.015);
  }
  ctx.restore();
  const g = ctx.createRadialGradient(S * 0.34, S * 0.28, S * 0.05, S * 0.5, S * 0.55, S * 0.72);
  g.addColorStop(0, "rgba(255,255,255,.75)");
  g.addColorStop(0.45, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(0,0,0,.42)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL();
}

function drawCueThumb(canvas, def) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const a = -Math.PI / 4;
  const cx = w / 2;
  const cy = h / 2;
  const L = w * 0.92;
  const ex = Math.cos(a) * L * 0.5;
  const ey = Math.sin(a) * L * 0.5;
  const grad = ctx.createLinearGradient(cx - ex, cy - ey, cx + ex, cy + ey);
  grad.addColorStop(0, def.wrap);
  grad.addColorStop(1, def.wood);
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(3, w * 0.11);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - ex, cy - ey);
  ctx.lineTo(cx + ex, cy + ey);
  ctx.stroke();
  ctx.strokeStyle = "#f2efe6";
  ctx.lineWidth = Math.max(2, w * 0.075);
  ctx.beginPath();
  ctx.moveTo(cx + ex * 0.86, cy + ey * 0.86);
  ctx.lineTo(cx + ex, cy + ey);
  ctx.stroke();
  ctx.strokeStyle = "#2f6fd0";
  ctx.lineWidth = Math.max(2, w * 0.06);
  ctx.beginPath();
  ctx.moveTo(cx + ex, cy + ey);
  ctx.lineTo(cx + ex * 1.02, cy + ey * 1.02);
  ctx.stroke();
}

export function readCueList() {
  const node = typeof root !== "undefined" ? root.cues : null;
  if (!node) return [];
  const out = [];
  for (const id of Object.keys(node)) {
    const c = node[id];
    if (!c || typeof c !== "object") continue;
    out.push({
      id,
      name: c.name ?? id,
      rank: c.rank ?? "D",
      power: Number(c.power) || 1,
      aimBounces: Number(c.aimBounces) || 0,
      assist: c.assist === true || c.assist === "true",
      spin: Number(c.spin) || 1,
      coinBonus: Number(c.coinBonus) || 1,
      cost: Number(c.cost) || 0,
      gems: c.gems === true || c.gems === "true",
      wood: c.wood ?? "#b98a4f",
      wrap: c.wrap ?? "#5b3b22",
    });
  }
  return out;
}

export class UI {
  constructor({ save, cfg, game, economy }) {
    this.save = save;
    this.cfg = cfg;
    this.game = game;
    this.economy = economy;
    this.cues = readCueList();
    this.chapter = 0;
    this.onSelectLevel = null;
    this.onBonus = null;
    this.onQuitToMenu = null;
    this.modalOpen = false;
    this.spin = { x: 0, y: 0 };
    this._iconCache = new Map();
  }

  init() {
    this.el = {
      hud: document.getElementById("hud"),
      menuScreen: document.getElementById("menuScreen"),
      mapScreen: document.getElementById("mapScreen"),
      shopScreen: document.getElementById("shopScreen"),
      modal: document.getElementById("modal"),
      bonusSplash: document.getElementById("bonusSplash"),
      bsIcon: document.getElementById("bsIcon"),
      bsName: document.getElementById("bsName"),
      bsTag: document.getElementById("bsTag"),
      bsGoal: document.getElementById("bsGoal"),
      helpCard: document.getElementById("helpCard"),
      toast: document.getElementById("toast"),
      fxLabels: document.getElementById("fxLabels"),
      loader: document.getElementById("loader"),
      levelNameEl: document.getElementById("levelNameEl"),
      ballChipEl: document.getElementById("ballChipEl"),
      ballCountEl: document.getElementById("ballCountEl"),
      turnBanner: document.getElementById("turnBanner"),
      objectiveCard: document.getElementById("objectiveCard"),
      bonusBar: document.getElementById("bonusBar"),
      bonusIconEl: document.getElementById("bonusIconEl"),
      bonusModeEl: document.getElementById("bonusModeEl"),
      bonusGoalEl: document.getElementById("bonusGoalEl"),
      powerFill: document.getElementById("powerFill"),
      powerKnob: document.getElementById("powerKnob"),
      powerBar: document.getElementById("powerBar"),
      powerWrap: document.getElementById("powerWrap"),
      spinBall: document.getElementById("spinBall"),
      spinDot: document.getElementById("spinDot"),
      shootHint: document.getElementById("shootHint"),
      aimLockBtn: document.getElementById("aimLockBtn"),
      menuWallet: document.getElementById("menuWallet"),
      mapWallet: document.getElementById("mapWallet"),
      shopWallet: document.getElementById("shopWallet"),
      versionEl: document.getElementById("versionEl"),
      chapterStrip: document.getElementById("chapterStrip"),
      levelGrid: document.getElementById("levelGrid"),
      cueList: document.getElementById("cueList"),
      settingsScreen: document.getElementById("settingsScreen"),
      timerWrap: document.getElementById("timerWrap"),
      timerFill: document.getElementById("timerFill"),
      progressLine: document.getElementById("progressLine"),
      heartTimer: document.getElementById("heartTimer"),
      missionsScreen: document.getElementById("missionsScreen"),
      missionsWallet: document.getElementById("missionsWallet"),
      missionsReset: document.getElementById("missionsReset"),
      missionList: document.getElementById("missionList"),
      missionDot: document.getElementById("missionDot"),
      statPotted: document.getElementById("statPotted"),
      statStars: document.getElementById("statStars"),
      statLevels: document.getElementById("statLevels"),
      statCues: document.getElementById("statCues"),
    };
    this.el.versionEl.textContent = `v${this.cfg.version} · 1000 levels · real physics`;
    this.setHint();

    document.getElementById("playBtn").addEventListener("click", () => {
      sfx.ui();
      this.openMap();
    });
    document.getElementById("shopBtn").addEventListener("click", () => {
      sfx.ui();
      this.openShop();
    });
    document.getElementById("dailyBtn").addEventListener("click", () => this.claimDaily());
    document.getElementById("mapBackBtn").addEventListener("click", () => {
      sfx.back();
      this.showScreen("menuScreen");
    });
    document.getElementById("shopBackBtn").addEventListener("click", () => {
      sfx.back();
      this.showScreen("menuScreen");
    });
    document.getElementById("settingsBtn").addEventListener("click", () => {
      sfx.click();
      this.openSettings();
    });
    document.getElementById("settingsBackBtn").addEventListener("click", () => {
      sfx.back();
      this.showScreen("menuScreen");
      this.refreshMenuMeta();
    });
    document.getElementById("settingsHelpBtn").addEventListener("click", () => this.openHelp());
    document.getElementById("resetProgressBtn").addEventListener("click", () => this.confirmResetProgress());
    document.getElementById("missionsBtn").addEventListener("click", () => {
      sfx.ui();
      this.openMissions();
    });
    document.getElementById("missionsBackBtn").addEventListener("click", () => {
      sfx.back();
      this.showScreen("menuScreen");
      this.refreshMenuMeta();
    });
    this.el.missionList.addEventListener("click", (e) => {
      const b = e.target.closest("[data-claim]");
      if (!b) return;
      const res = this.save.claimMission(b.dataset.claim);
      if (!res) return;
      sfx.gem();
      this.refreshWallet();
      this.renderMissions();
      const parts = [];
      if (res.coins) parts.push(`+${res.coins} coins`);
      if (res.gems) parts.push(`+${res.gems} gems`);
      this.toast(`Mission complete: ${parts.join(", ")}`);
    });
    document.getElementById("pauseBtn").addEventListener("click", () => this.openPause());
    document.getElementById("helpBtn").addEventListener("click", () => this.openHelp());
    document.getElementById("aimLeftBtn").addEventListener("click", () => {
      this.game.nudgeAim(-0.008);
      sfx.tick();
    });
    document.getElementById("aimRightBtn").addEventListener("click", () => {
      this.game.nudgeAim(0.008);
      sfx.tick();
    });
    this.el.aimLockBtn.addEventListener("click", () => {
      if (this.game.lockAim()) sfx.tick();
      else this.setHint("No clear pot from here — reposition for a better line");
    });
    this.bindPower();
    this.bindSpin();
    this.refreshWallet();
    this.renderChapters();
    this.renderMap();
    this.renderShop();
    this.refreshMenuMeta();
    setInterval(() => this.refreshHeartTimer(), 1000);
  }

  /* ---------------- settings ---------------- */

  segSet(id, value) {
    const ctn = document.getElementById(id);
    if (!ctn) return;
    for (const b of ctn.querySelectorAll("button")) b.classList.toggle("on", b.dataset.v === value);
  }

  openSettings() {
    const s = this.save.state;
    this.segSet("setSfx", s.sfx === false ? "off" : "on");
    this.segSet("setMusic", s.music === false ? "off" : "on");
    this.segSet("setAssist", normalizeAimHelp(s.aimHelp ?? s.assistMode));
    this.segSet("setQuality", s.quality ?? "auto");
    this.showScreen("settingsScreen");
    const bind = (id, fn) => {
      const ctn = document.getElementById(id);
      if (!ctn || ctn.dataset.bound) return;
      ctn.dataset.bound = "1";
      ctn.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-v]");
        if (!b) return;
        fn(b.dataset.v);
      });
    };
    bind("setSfx", (v) => {
      this.save.state.sfx = v === "on";
      setSfxEnabled(this.save.state.sfx);
      this.save.persist();
      this.segSet("setSfx", v);
      sfx.click();
    });
    bind("setMusic", (v) => {
      this.save.state.music = v === "on";
      setMusicEnabled(this.save.state.music);
      if (this.save.state.music) playMusic(this.musicTrack ?? "menu");
      this.save.persist();
      this.segSet("setMusic", v);
      sfx.click();
    });
    bind("setAssist", (v) => {
      const help = normalizeAimHelp(v);
      this.save.state.aimHelp = help;
      this.game.aimHelp = help;
      this.game.snapped = false;
      this.save.persist();
      this.segSet("setAssist", help);
      sfx.click();
    });
    bind("setQuality", (v) => {
      this.save.state.quality = v;
      this.game.applyQuality(v);
      this.save.persist();
      this.segSet("setQuality", v);
      sfx.click();
    });
  }

  confirmResetProgress() {
    sfx.click();
    this.openModal(
      `<div class="card">
        <h3>Reset progress?</h3>
        <p>This clears your coins, gems, stars, owned cues and unlocked levels, and starts you over from level 1. It can't be undone.</p>
        <div class="cardBtns">
          <button class="bigBtn small dangerBtn" data-act="yes">Yes, reset</button>
          <button class="bigBtn small" data-act="no">Cancel</button>
        </div>
      </div>`
    );
    this.el.modal.onclick = (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "yes") {
        this.save.reset();
        setSfxEnabled(this.save.state.sfx !== false);
        setMusicEnabled(this.save.state.music !== false);
        this.game.aimHelp = normalizeAimHelp(this.save.state.aimHelp ?? this.save.state.assistMode);
        this.game.snapped = false;
        this.game.applyQuality(this.save.state.quality ?? "auto");
        this.refreshWallet();
        this.refreshMenuMeta();
        this.renderShop();
        this.renderChapters();
        this.renderMap();
        this.closeModal();
        this.toast("Progress reset");
      } else {
        this.closeModal();
      }
    };
  }

  refreshMenuMeta() {
    const s = this.save.state;
    const totalStars = this.save.totalStars();
    const maxStars = TOTAL_LEVELS * 3;
    const pct = Math.round((totalStars / maxStars) * 100);
    this.el.progressLine.innerHTML = `Level <b>${s.maxLevel}</b>/${TOTAL_LEVELS} · ★ <b>${totalStars}</b>/${maxStars} (${pct}%)`;
    this.refreshHeartTimer();
  }

  refreshHeartTimer() {
    if (!this.el.heartTimer) return;
    this.save.refillHearts();
    const s = this.save.state;
    if (s.hearts >= this.cfg.maxHearts) {
      this.el.heartTimer.textContent = "Hearts full";
      return;
    }
    const ms = this.save.msToNextHeart();
    const m = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    this.el.heartTimer.textContent = `Next heart in ${m}:${String(sec).padStart(2, "0")}`;
  }

  isTouch() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  defaultHint() {
    return this.isTouch()
      ? "Drag on the table to aim, release to shoot"
      : "Drag to aim & shoot · ← → fine aim · Space to shoot";
  }

  setHint(text) {
    if (this.el.shootHint) this.el.shootHint.textContent = text ?? this.defaultHint();
  }

  /* ---------------- screens ---------------- */

  showScreen(id) {
    for (const s of document.querySelectorAll(".screen")) s.classList.add("hidden");
    if (id) {
      document.getElementById(id).classList.remove("hidden");
      this.el.hud.classList.add("hidden");
      if (id === "menuScreen") this.refreshMenuMeta();
    } else {
      this.el.hud.classList.remove("hidden");
    }
  }

  inGameHud() {
    for (const s of document.querySelectorAll(".screen")) s.classList.add("hidden");
    this.el.hud.classList.remove("hidden");
  }

  hideLoader() {
    this.el.loader.classList.add("hidden");
  }

  /* ---------------- wallet ---------------- */

  refreshWallet() {
    const s = this.save.state;
    const html =
      `<span class="wallet coins">${COIN_SVG}<span class="val">${s.coins.toLocaleString()}</span></span>` +
      `<span class="wallet gems">${GEM_SVG}<span class="val">${s.gems.toLocaleString()}</span></span>` +
      `<span class="wallet hearts">${HEART_SVG}<span class="val">${s.hearts}/${this.cfg.maxHearts}</span></span>`;
    this.el.menuWallet.innerHTML = html;
    this.el.mapWallet.innerHTML = `${COIN_SVG}<span class="val">${s.coins.toLocaleString()}</span>` + ` ${GEM_SVG}<span class="val">${s.gems.toLocaleString()}</span>`;
    this.el.shopWallet.innerHTML = this.el.mapWallet.innerHTML;
    if (this.el.missionsWallet) this.el.missionsWallet.innerHTML = this.el.mapWallet.innerHTML;
    if (this.el.missionDot) this.el.missionDot.classList.toggle("on", this.save.missionsClaimable() > 0);
  }

  toast(text, ms = 1700) {
    const d = document.createElement("div");
    d.className = "toastItem";
    d.textContent = text;
    this.el.toast.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  label(text, color, x, y) {
    const d = document.createElement("div");
    d.className = "fxLabel";
    d.textContent = text;
    d.style.color = color;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.transform = "translate(-50%,0)";
    this.el.fxLabels.appendChild(d);
    setTimeout(() => d.remove(), 1050);
  }

  banner(text) {
    const bonus = this.el.bonusBar && !this.el.bonusBar.classList.contains("hidden");
    this.el.turnBanner.style.top = bonus ? "158px" : "";
    this.el.turnBanner.textContent = text;
    this.el.turnBanner.classList.add("show");
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.el.turnBanner.classList.remove("show"), 1500);
  }

  /* ---------------- HUD ---------------- */

  setLevel(level) {
    if (level.bonus) {
      this.el.levelNameEl.innerHTML = `<b>★ BONUS</b> · ${level.name}`;
      this.el.objectiveCard.innerHTML = level.timeLimit
        ? `<b>${level.objective.hint}</b>`
        : `<b>${level.objective.hint}</b> · Shots <b id="shotsLeftEl">${Math.max(0, level.shots - this.game.shotsUsed)}</b>`;
      this.el.bonusBar.classList.remove("hidden");
      this.el.bonusIconEl.textContent = level.icon ?? "★";
      this.el.bonusModeEl.textContent = level.name;
      this.el.bonusGoalEl.textContent = "";
    } else {
      this.el.levelNameEl.innerHTML = `<b>#${level.number}</b> · ${level.name}`;
      this.el.objectiveCard.innerHTML = `<b>${level.objective.hint}</b> · Shots <b id="shotsLeftEl">${level.shots - this.game.shotsUsed}</b>`;
      this.el.bonusBar.classList.add("hidden");
    }
    this.totalBalls = level.count;
    this.setBallIcon(this.targetNumber());
    this.setBallCount(this.game.remaining, level.count);
    this.setTimer(this.game.timeLimit || 0, this.game.timeLimit || 0);
    this.game.aimHelp = normalizeAimHelp(this.save.state.aimHelp ?? this.save.state.assistMode);
  }

  setBonusProgress({ text } = {}) {
    if (!this.el.bonusGoalEl) return;
    this.el.bonusGoalEl.textContent = text ?? "";
  }

  targetNumber() {
    const lv = this.game.level;
    if (!lv) return null;
    if (lv.objective.type === "last") return lv.objective.ball;
    if (lv.objective.type === "forbid") return lv.objective.ball;
    let best = null;
    for (const bm of this.game.ballMeshes) {
      if (bm.ball === this.game.cueBall || bm.ball.potted) continue;
      if (!this.game.isRequired(bm.ball.data)) continue;
      if (best === null || bm.number < best) best = bm.number;
    }
    return best;
  }

  setBallIcon(number) {
    const key = number ?? "cue";
    if (!this._iconCache.has(key)) this._iconCache.set(key, ballIconDataUrl(number));
    this.el.ballChipEl.style.backgroundImage = `url(${this._iconCache.get(key)})`;
  }

  setBallCount(remaining, total) {
    this.el.ballCountEl.textContent = `${remaining}/${total}`;
  }

  setShots(shotsUsed, shots) {
    const el = document.getElementById("shotsLeftEl");
    if (el) el.textContent = Math.max(0, shots - shotsUsed);
  }

  setTimer(timeLeft, timeLimit) {
    const w = this.el.timerWrap;
    const f = this.el.timerFill;
    if (!w || !f) return;
    if (!timeLimit) {
      w.classList.remove("show");
      return;
    }
    w.classList.add("show");
    const k = Math.max(0, Math.min(1, timeLeft / timeLimit));
    f.style.width = `${Math.round(k * 100)}%`;
    f.style.background = k < 0.25
      ? "linear-gradient(90deg,#ff4a4a,#ff9a4a)"
      : k < 0.5
        ? "linear-gradient(90deg,#ffe14a,#ff9a3a)"
        : "linear-gradient(90deg,#7ef2b0,#ffe14a)";
  }

  setSpin(x, y) {
    this.spin = { x, y };
    const r = 22;
    this.el.spinDot.style.transform = `translate(${x * r}px, ${-y * r}px)`;
    this.game.spin = { x: -x, y: -y };
  }

  bindSpin() {
    const el = this.el.spinBall;
    let active = false;
    const set = (e) => {
      const rect = el.getBoundingClientRect();
      let dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      let dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      this.setSpin(dx, -dy);
    };
    el.addEventListener("pointerdown", (e) => {
      active = true;
      el.setPointerCapture?.(e.pointerId);
      set(e);
      e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => {
      if (active) { set(e); e.preventDefault(); }
    });
    const up = (e) => { active = false; };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("dblclick", () => this.setSpin(0, 0));
  }

  bindPower() {
    const bar = this.el.powerBar;
    let active = false;
    const set = (e) => {
      const rect = bar.getBoundingClientRect();
      const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.game.power = v;
      this.setPower(v);
    };
    bar.addEventListener("pointerdown", (e) => {
      active = true;
      bar.setPointerCapture?.(e.pointerId);
      set(e);
      e.preventDefault();
    });
    bar.addEventListener("pointermove", (e) => {
      if (active) { set(e); e.preventDefault(); }
    });
    const up = () => { active = false; };
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
  }

  setPower(p) {
    this.el.powerFill.style.width = `${Math.round(p * 100)}%`;
    const rect = this.el.powerBar.getBoundingClientRect();
    const wrapRect = this.el.powerWrap.getBoundingClientRect();
    const x = rect.left - wrapRect.left + p * rect.width - 16;
    this.el.powerKnob.style.left = `${Math.round(x)}px`;
    if (this.el.aimLockBtn) {
      const can = this.game.state === "aim" && this.game.helpLevel() > 0 && !!this.game.bestSolution();
      this.el.aimLockBtn.disabled = !can;
    }
  }

  /* ---------------- map ---------------- */

  renderChapters() {
    const html = [];
    for (let c = 0; c < CHAPTERS; c++) {
      const first = c * LEVELS_PER_CHAPTER + 1;
      const unlocked = this.save.state.maxLevel >= first;
      html.push(`<div class="chapterChip${c === this.chapter ? " active" : ""}" data-ch="${c}" style="${unlocked ? "" : "opacity:.5"}">${c + 1}. ${chapterName(c)}</div>`);
    }
    this.el.chapterStrip.innerHTML = html.join("");
    this.el.chapterStrip.onclick = (e) => {
      const chip = e.target.closest(".chapterChip");
      if (!chip) return;
      this.chapter = Number(chip.dataset.ch);
      sfx.click();
      this.renderChapters();
      this.renderMap();
    };
  }

  renderMap() {
    const start = this.chapter * LEVELS_PER_CHAPTER + 1;
    const html = [];
    for (let i = 0; i < LEVELS_PER_CHAPTER; i++) {
      const n = start + i;
      const unlocked = this.save.isUnlocked(n);
      const stars = this.save.starsFor(n);
      const done = stars > 0;
      const isCurrent = n === this.save.state.maxLevel;
      const starHtml = [0, 1, 2].map((k) => `<span class="s${k < stars ? " on" : ""}">★</span>`).join("");
      html.push(
        `<div class="levelNode${unlocked ? "" : " locked"}${isCurrent ? " current" : ""}${done ? " done" : ""}" data-lv="${n}">
          <div class="num">${n}</div>
          <div class="stars">${unlocked ? starHtml : '<span class="lockIco">🔒</span>'}</div>
        </div>`
      );
      if (isBonusMilestone(n)) {
        const k = bonusIdFor(n);
        const mode = modeForBonus(k);
        const bUnlocked = this.save.isBonusUnlocked(k);
        const rec = this.save.bonusRecord(k);
        const bDone = !!rec?.cleared;
        const tag = bDone ? "★ BEST " + rec.best : bUnlocked ? mode.tag : "🔒";
        html.push(
          `<div class="bonusNode${bUnlocked ? "" : " locked"}${bDone ? " done" : ""}" data-bonus="${k}">
            <div class="bIco">${bUnlocked ? mode.icon : "🔒"}</div>
            <div class="bName">${bUnlocked ? mode.name : "BONUS"}</div>
            <div class="bTag">${tag}</div>
          </div>`
        );
      }
    }
    this.el.levelGrid.innerHTML = html.join("");
    this.el.levelGrid.onclick = (e) => {
      const bonus = e.target.closest(".bonusNode");
      if (bonus) {
        const k = Number(bonus.dataset.bonus);
        if (!this.save.isBonusUnlocked(k)) {
          sfx.foul();
          this.toast(`Clear level ${k * BONUS_EVERY} to unlock this bonus stage`);
          return;
        }
        sfx.click();
        this.openBonusIntro(k);
        return;
      }
      const node = e.target.closest(".levelNode");
      if (!node) return;
      const n = Number(node.dataset.lv);
      if (!this.save.isUnlocked(n)) {
        sfx.foul();
        this.toast("Finish earlier levels to unlock this one");
        return;
      }
      sfx.click();
      this.playLevel(n);
    };
  }

  openMap() {
    const cur = this.save.state.maxLevel;
    this.chapter = Math.floor((cur - 1) / LEVELS_PER_CHAPTER);
    this.renderChapters();
    this.renderMap();
    this.refreshWallet();
    this.showScreen("mapScreen");
    const node = this.el.levelGrid.querySelector(".levelNode.current");
    if (node) node.scrollIntoView({ block: "center" });
  }

  /* ---------------- shop ---------------- */

  renderShop() {
    const s = this.save.state;
    const html = [];
    for (const c of this.cues) {
      const owned = s.cuesOwned.includes(c.id);
      const equipped = s.cueEquipped === c.id;
      const price = c.cost === 0 ? "FREE" : c.gems ? `${c.cost} 💎` : `${c.cost.toLocaleString()} 🪙`;
      const btn = equipped
        ? `<button class="bigBtn small" disabled>Equipped</button>`
        : owned
          ? `<button class="bigBtn small blue" data-equip="${c.id}">Equip</button>`
          : `<button class="bigBtn small gold" data-buy="${c.id}">Buy</button>`;
      html.push(
        `<div class="cueCard${equipped ? " equipped" : ""}">
          <div class="cueThumb"><canvas width="96" height="96" data-cue="${c.id}"></canvas></div>
          <div class="cueInfo">
            <div class="cueName">${c.name}<span class="rankTag rank-${c.rank}">${c.rank}</span></div>
            <div class="cueStats">Power <b>${c.power.toFixed(2)}×</b> · Spin <b>${c.spin.toFixed(2)}×</b> · Coins <b>${c.coinBonus.toFixed(2)}×</b><br>
            Aim help <b>+${(c.aimBounces ?? 0) + (c.assist ? 1 : 0)} bounce${((c.aimBounces ?? 0) + (c.assist ? 1 : 0)) === 1 ? "" : "s"}</b></div>
          </div>
          <div class="cuePrice">
            <div class="priceTag${c.gems ? " gem" : ""}">${owned ? "OWNED" : price}</div>
            ${btn}
          </div>
        </div>`
      );
    }
    this.el.cueList.innerHTML = html.join("");
    for (const canvas of this.el.cueList.querySelectorAll("canvas[data-cue]")) {
      const def = this.cues.find((c) => c.id === canvas.dataset.cue);
      if (def) drawCueThumb(canvas, def);
    }
    this.el.cueList.onclick = (e) => {
      const eq = e.target.closest("[data-equip]");
      const buy = e.target.closest("[data-buy]");
      if (eq) {
        this.save.equipCue(eq.dataset.equip);
        sfx.unlock();
        this.renderShop();
      } else if (buy) {
        const def = this.cues.find((c) => c.id === buy.dataset.buy);
        if (!def) return;
        if (this.save.buyCue(def.id, def.cost, def.gems)) {
          const cues = this.cues.filter((c) => this.save.state.cuesOwned.includes(c.id));
          sfx.unlock();
          this.toast(`${def.name} unlocked & equipped!`);
          this.refreshWallet();
          this.renderShop();
          if (this.onCuesChanged) this.onCuesChanged();
        } else {
          sfx.foul();
          this.toast(def.gems ? "Not enough gems" : "Not enough coins");
        }
      }
    };
  }

  openShop() {
    this.renderShop();
    this.refreshWallet();
    this.showScreen("shopScreen");
  }

  claimDaily() {
    const res = this.save.claimDaily();
    if (!res) {
      sfx.foul();
      this.toast("Bonus already claimed — come back tomorrow");
      return;
    }
    sfx.gem();
    this.refreshWallet();
    if (this.onDaily) this.onDaily();
    this.toast(`Daily bonus: +${res.coins} coins, +${res.gems} gems`);
  }

  /* ---------------- missions ---------------- */

  openMissions() {
    this.renderMissions();
    this.refreshWallet();
    this.showScreen("missionsScreen");
  }

  renderMissions() {
    const m = this.save.state.missions;
    const items = Array.isArray(m?.items) ? m.items : [];
    if (this.el.missionsReset) {
      if (m?.day) {
        const ms = msUntilReset();
        const h = Math.floor(ms / 3600000);
        const min = Math.floor((ms % 3600000) / 60000);
        this.el.missionsReset.textContent = `Daily missions · resets in ${h}h ${min}m`;
      } else {
        this.el.missionsReset.textContent = "Daily missions";
      }
    }
    const html = items
      .map((it) => {
        const d = describe(it);
        const done = it.progress >= it.target;
        const pct = Math.min(100, Math.round(((it.progress ?? 0) / it.target) * 100));
        const rwd = [it.coins ? `${it.coins} 🪙` : "", it.gems ? `${it.gems} 💎` : ""].filter(Boolean).join(" ");
        const btn = it.claimed
          ? `<button class="claimBtn" disabled>Claimed</button>`
          : done
            ? `<button class="claimBtn" data-claim="${it.id}">Claim</button>`
            : "";
        return `<div class="missionRow${done ? " done" : ""}">
          <div class="missionTop">
            <span class="ico">${d.icon}</span>
            <span class="lbl">${d.title}</span>
            <span class="rwd">${rwd}</span>
          </div>
          <div class="sub">${d.sub}</div>
          <div class="missionBar"><i style="width:${pct}%"></i></div>
          <div class="missionFoot"><span class="cnt">${Math.min(it.progress ?? 0, it.target)}/${it.target}${it.claimed ? " · claimed" : ""}</span>${btn}</div>
        </div>`;
      })
      .join("");
    this.el.missionList.innerHTML = html || `<div class="sub" style="padding:12px">No missions right now — check back tomorrow.</div>`;
    const s = this.save.state;
    if (this.el.statPotted) this.el.statPotted.textContent = (s.totalPotted ?? 0).toLocaleString();
    if (this.el.statStars) this.el.statStars.textContent = this.save.totalStars().toLocaleString();
    if (this.el.statLevels) this.el.statLevels.textContent = s.maxLevel;
    if (this.el.statCues) this.el.statCues.textContent = s.cuesOwned?.length ?? 1;
  }

  /* ---------------- modal ---------------- */

  closeModal() {
    this.el.modal.classList.add("hidden");
    this.el.modal.innerHTML = "";
    this.modalOpen = false;
    this.game.paused = false;
  }

  openModal(html) {
    this.el.modal.innerHTML = html;
    this.el.modal.classList.remove("hidden");
    this.modalOpen = true;
  }

  levelUrl(n) {
    const name = typeof window !== "undefined" && window.generatorName ? window.generatorName : "";
    const base = name ? `https://perchance.org/${name}` : location.origin + location.pathname;
    return `${base}?level=${n}`;
  }

  openPause() {
    sfx.click();
    const lv = this.game.level;
    this.game.paused = true;
    this.openModal(
      `<div class="card">
        <h3>Paused</h3>
        <p>${lv ? `Level #${lv.number} · ${lv.name}` : "No level loaded"}</p>
        <div class="cardBtns">
          <button class="bigBtn small" data-act="resume">Resume</button>
          <button class="bigBtn small blue" data-act="restart">Restart</button>
          <button class="bigBtn small" data-act="quit">Level Map</button>
        </div>
        <div class="cardBtns">
          <button class="pillBtn" data-act="sfx">Sound: ${this.save.state.sfx ? "ON" : "OFF"}</button>
          <button class="pillBtn" data-act="music">Music: ${this.save.state.music !== false ? "ON" : "OFF"}</button>
          ${lv ? `<button class="pillBtn" data-act="share">Share level</button>` : ""}
        </div>
      </div>`
    );
    this.el.modal.onclick = (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "resume") { this.closeModal(); }
      else if (act === "restart") { this.closeModal(); this.playLevel(lv.number, true); }
      else if (act === "quit") { this.closeModal(); this.quitToMap(); }
      else if (act === "sfx") {
        this.save.state.sfx = !this.save.state.sfx;
        setSfxEnabled(this.save.state.sfx);
        this.save.persist();
        b.textContent = `Sound: ${this.save.state.sfx ? "ON" : "OFF"}`;
      } else if (act === "music") {
        this.save.state.music = !(this.save.state.music !== false);
        setMusicEnabled(this.save.state.music);
        if (this.save.state.music) playMusic(this.musicTrack ?? "play");
        this.save.persist();
        b.textContent = `Music: ${this.save.state.music ? "ON" : "OFF"}`;
      } else if (act === "share" && lv) {
        const u = this.levelUrl(lv.number);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(u).then(() => this.toast("Level link copied!")).catch(() => this.toast(u));
        } else {
          this.toast(u);
        }
        sfx.ui();
      }
    };
  }

  openHelp() {
    sfx.click();
    if (!this.game.demo) this.game.paused = true;
    const touch = this.isTouch();
    this.openModal(
      `<div class="card" style="max-width:470px">
        <h3>How to play</h3>
        <ul>
          <li><b>Drag</b> on the table to aim — pull back like a slingshot, release to shoot.</li>
          <li>Drag further for more <b>power</b>; the bar at the bottom shows it. Tap the table to nudge your aim.</li>
          <li>Use the <b>spin ball</b> (bottom-left) for english: side spin curves off the rail, top spin follows through.</li>
          <li>The <b>green</b> line shows where the cue ball will go — it ends where it strikes a ball. The <b>pink</b> line traces where that ball will travel, and turns <b>green into a pocket</b> when it is going in. At most three lines are drawn, all taken from a real simulation of your shot.</li>
          <li><b>Aiming help</b> (Settings) has two levels — <b>Basic</b> shows the aim line, the ghost ball, the object ball's path and its pocket line; <b>Advanced</b> adds a gold <b>recommended angle</b> your aim gently snaps to. The <b>◎ Lock</b> button jumps straight to the nearest clear pot.</li>
          <li>Sink every required ball within the <b>shot limit</b>. Fewer shots = more stars. Three fouls caps you at 1 star.</li>
          <li><b>Scratch</b> (sinking the cue ball) gives the opponent nothing — you get <b>ball in hand</b>, so drag to re-place it anywhere legal.</li>
          <li>Chain pots for a <b>combo</b> — each additional ball pays bonus coins.</li>
          <li>Objectives: ✱ clear the table, number order, a ball <b>last</b>, a <b>forbidden</b> ball, limited shots, or beat the clock. A ball sunk at the wrong moment (wrong order, the <b>last</b> ball too early, the <b>forbidden</b> ball) is <b>re-spotted and costs a foul</b> — recoverable, not instant defeat.</li>
          <li>Special balls: ★ <b>coins</b>, 💎 <b>gems</b>, +1 shot / +6s <b>time</b> balls and 💣 <b>bombs</b> that blast nearby balls.</li>
          <li>${touch ? "Tap ❚❚ to pause." : "Keyboard: <b>← →</b> fine aim, <b>↑ ↓</b> power, <b>Space</b> shoot, <b>Esc/P</b> pause, <b>R</b> restart, <b>M</b> mute."}</li>
        </ul>
        <div class="cardBtns"><button class="bigBtn small" data-act="close">Got it</button></div>
      </div>`
    );
    this.el.modal.onclick = (e) => {
      if (e.target.closest('[data-act="close"]')) this.closeModal();
    };
    this.save.state.seenHelp = true;
    this.save.persist();
  }

  showResult({ win, stars = 0, coins = 0, gems = 0, shotsUsed, fouls, reason, level, firstClear, chapterBonus = 0, perfectBonus = 0 }) {
    if (win) sfx.win();
    this.refreshMenuMeta();
    const starHtml = [0, 1, 2].map((k) => `<span class="s${k < stars ? " on" : ""}">★</span>`).join("");
    const nextLevel = level.number + 1;
    const hasNext = nextLevel <= TOTAL_LEVELS;
    /* Clearing a milestone level (every 5th) leads into its bonus stage, so the
     * bonus appears in the normal order of play instead of only on the map. */
    const milestone = win && level.number > 0 && isBonusMilestone(level.number);
    const bonusK = milestone ? bonusIdFor(level.number) : 0;
    const bonusReady = bonusK > 0 && this.save.isBonusUnlocked(bonusK);
    const body = win
      ? `<div class="bigStars">${starHtml}</div>
         <p>Cleared in <b>${shotsUsed}</b> shot${shotsUsed === 1 ? "" : "s"}${fouls ? ` · ${fouls} foul${fouls === 1 ? "" : "s"}` : ""}${firstClear ? " · <b>First clear!</b>" : ""}</p>
         <div class="rewardRow">
           <span style="color:#ffcf4a">+${coins} 🪙</span>
           ${gems ? `<span style="color:#7ee0ff">+${gems} 💎</span>` : ""}
         </div>
         ${chapterBonus ? `<p style="font-size:12.5px"><b>Chapter complete!</b> +${chapterBonus} 💎 bonus</p>` : ""}
         ${perfectBonus ? `<p style="font-size:12.5px"><b>Three stars!</b> +${perfectBonus} 💎 bonus</p>` : ""}`
      : `<h3 style="color:#ff8aa8">${reason ?? "Level failed"}</h3>
         <p>${reason === "Out of shots" ? "You ran out of shots — try saving the easy balls for last." : reason === "Time's up" ? "The clock beat you — go for quicker, safer pots." : "Give it another go."}</p>`;
    this.openModal(
      `<div class="card">
        <h3>${win ? "Level Cleared!" : "Failed"}</h3>
        ${body}
        <div class="cardBtns">
          ${bonusReady ? `<button class="bigBtn gold" data-act="bonus">★ BONUS STAGE</button>` : win && hasNext ? `<button class="bigBtn small" data-act="next">Next Level</button>` : ""}
          <button class="bigBtn small blue" data-act="replay">Replay</button>
          <button class="bigBtn small" data-act="map">Level Map</button>
        </div>
        <div class="cardBtns">
          ${bonusReady && hasNext ? `<button class="pillBtn" data-act="skip">Skip to level ${nextLevel} ▶</button>` : ""}
          <button class="pillBtn" data-act="share">Share level</button>
        </div>
      </div>`
    );
    this.el.modal.onclick = (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "bonus") { this.closeModal(); if (this.onBonus) this.onBonus(bonusK, nextLevel); }
      else if (act === "next" || act === "skip") { this.closeModal(); this.playLevel(nextLevel); }
      else if (act === "replay") { this.closeModal(); this.playLevel(level.number, true); }
      else if (act === "map") { this.closeModal(); this.quitToMap(); }
      else if (act === "share") {
        const u = this.levelUrl(level.number);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(u).then(() => this.toast("Level link copied!")).catch(() => this.toast(u));
        } else {
          this.toast(u);
        }
        sfx.ui();
      }
    };
  }

  showNoHearts() {
    const ms = this.save.msToNextHeart();
    const mins = Math.ceil(ms / 60000);
    this.openModal(
      `<div class="card">
        <h3>Out of hearts</h3>
        <p>Hearts refill over time — next one in about <b>${mins}</b> minute${mins === 1 ? "" : "s"}.</p>
        <p>Or refill instantly for <b>10 💎</b>.</p>
        <div class="cardBtns">
          <button class="bigBtn small gold" data-act="refill" ${this.save.state.gems < 10 ? "disabled" : ""}>Refill — 10 💎</button>
          <button class="bigBtn small" data-act="map">Level Map</button>
        </div>
      </div>`
    );
    this.el.modal.onclick = (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "refill") {
        if (this.save.spendGems(10)) {
          this.save.state.hearts = this.cfg.maxHearts;
          this.save.persist();
          sfx.gem();
          this.closeModal();
          this.refreshWallet();
        }
      } else if (b.dataset.act === "map") {
        this.closeModal();
        this.quitToMap();
      }
    };
  }

  quitToMap() {
    if (this.onQuitToMenu) this.onQuitToMenu();
    this.openMap();
  }

  togglePause() {
    if (this.modalOpen) this.closeModal();
    else this.openPause();
  }

  toggleMute() {
    const anyOn = this.save.state.sfx !== false || this.save.state.music !== false;
    this.save.state.sfx = !anyOn;
    this.save.state.music = !anyOn;
    setSfxEnabled(this.save.state.sfx);
    setMusicEnabled(this.save.state.music);
    if (this.save.state.music) playMusic(this.musicTrack ?? "menu");
    this.save.persist();
    this.segSet("setSfx", this.save.state.sfx ? "on" : "off");
    this.segSet("setMusic", this.save.state.music ? "on" : "off");
    this.toast(anyOn ? "Audio muted (M)" : "Audio on (M)");
  }

  playLevel(n, force = false) {
    if (this.onSelectLevel) this.onSelectLevel(n, force);
  }

  /* ---------------- bonus stages ---------------- */

  /* Full-screen animated "BONUS STAGE" entry. Plays each time a bonus stage is
   * entered (from the map or automatically after its milestone level). Calls
   * `onDone` once the animation finishes, or immediately if the player taps. */
  playBonusEntry(k, onDone) {
    const lv = getBonusLevel(k, this.game.params);
    const mode = modeForBonus(k);
    const splash = this.el.bonusSplash;
    if (!splash) { onDone && onDone(); return; }
    clearTimeout(this._bsT1);
    clearTimeout(this._bsT2);
    this.el.bsIcon.textContent = mode.icon ?? "★";
    this.el.bsName.textContent = mode.name ?? "BONUS";
    this.el.bsTag.textContent = `AFTER LEVEL ${lv.number} · ${mode.tag ?? ""}`;
    this.el.bsGoal.textContent = `GOAL · ${mode.hint ?? ""}`;
    splash.classList.remove("out", "show");
    void splash.offsetWidth; /* restart the CSS animations */
    splash.classList.add("show");
    sfx.gem();
    const finish = () => {
      clearTimeout(this._bsT0);
      clearTimeout(this._bsT1);
      clearTimeout(this._bsT2);
      splash.removeEventListener("pointerdown", skip);
      splash.classList.remove("show", "out");
      splash.removeAttribute("style");
      for (const el of splash.querySelectorAll(".bsKicker, .bsIcon, .bsName, .bsTag, .bsGoal, .bsHint")) el.removeAttribute("style");
      onDone && onDone();
    };
    const skip = () => {
      if (splash.classList.contains("out")) return;
      splash.classList.add("out");
      this._bsT2 = setTimeout(finish, 400);
    };
    splash.addEventListener("pointerdown", skip);
    /* Safety net: if the animation clock is stalled (e.g. a background tab pauses
     * CSS animations), snap the copy to its final state so it stays readable. */
    this._bsT0 = setTimeout(() => {
      const kicker = splash.querySelector(".bsKicker");
      if (kicker && parseFloat(getComputedStyle(kicker).opacity) < 0.5) {
        splash.style.transition = "none";
        splash.style.transform = "none";
        splash.style.opacity = "1";
        for (const el of splash.querySelectorAll(".bsKicker, .bsIcon, .bsName, .bsTag, .bsGoal, .bsHint")) {
          el.style.animation = "none";
          el.style.opacity = "1";
          el.style.transform = "none";
          el.style.filter = "none";
        }
      }
    }, 1000);
    this._bsT1 = setTimeout(() => {
      splash.classList.add("out");
      this._bsT2 = setTimeout(finish, 420);
    }, 2000);
  }

  openBonusIntro(k) {
    const lv = getBonusLevel(k, this.game.params);
    const mode = modeForBonus(k);
    const rec = this.save.bonusRecord(k);
    const coins = (lv.reward?.coins ?? 0) + (mode.chest?.coins ?? 0);
    const gems = (lv.reward?.gems ?? 0) + (mode.chest?.gems ?? 0);
    this.openModal(
      `<div class="card">
        <div class="bonusFlash">BONUS STAGE</div>
        <div class="bonusMode">${mode.icon} ${mode.name}</div>
        <div class="bonusTag2">AFTER LEVEL ${lv.number} · ${mode.tag}</div>
        <p>${mode.blurb}</p>
        <div class="bonusGoal">GOAL · ${mode.hint}</div>
        <div class="rewardRow">
          <span style="color:#ffcf4a">+${coins} 🪙</span>
          ${gems ? `<span style="color:#7ee0ff">+${gems} 💎</span>` : ""}
        </div>
        <div class="sub" style="margin-top:8px">${rec?.cleared ? `Cleared · best ${rec.best}` : "Free to play — no hearts. First clear pays the full chest."}</div>
        <div class="cardBtns">
          <button class="bigBtn gold" data-act="play">${rec?.cleared ? "PLAY AGAIN" : "START"}</button>
          <button class="pillBtn" data-act="close">Later</button>
        </div>
      </div>`
    );
    this.el.modal.onclick = (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "play") {
        this.closeModal();
        if (this.onBonus) this.onBonus(k);
      } else if (b.dataset.act === "close") {
        this.closeModal();
      }
    };
  }

  showBonusResult({ win, mode, score = 0, scoreLabel = "", coins = 0, gems = 0, k, best = 0, reason, nextLevel = 0 }) {
    if (win) sfx.win();
    const head = win
      ? `<div class="bonusFlash">BONUS CLEARED</div>
         <div class="bonusMode">${mode.icon} ${mode.name}</div>
         <p>${scoreLabel}</p>
         <div class="rewardRow">
           <span style="color:#ffcf4a">+${coins} 🪙</span>
           ${gems ? `<span style="color:#7ee0ff">+${gems} 💎</span>` : ""}
         </div>
         <div class="sub" style="margin-top:8px">${score > best ? "New best score!" : `Best ${best}`}</div>`
      : `<div class="bonusFlash" style="color:#ff9ab0">RUN OVER</div>
         <div class="bonusMode">${mode.icon} ${mode.name}</div>
         <p>${reason ? `<b>${reason}</b> · ` : ""}${scoreLabel}</p>
         <div class="sub" style="margin-top:8px">Bonus stages cost no hearts — dive back in whenever.</div>`;
    this.openModal(
      `<div class="card">
        ${head}
        <div class="cardBtns">
          ${nextLevel ? `<button class="bigBtn" data-act="next">Next Level ▶</button>` : ""}
          <button class="bigBtn gold small" data-act="again">PLAY AGAIN</button>
          <button class="pillBtn" data-act="map">Back to map</button>
        </div>
      </div>`
    );
    this.el.modal.onclick = (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "again") {
        this.closeModal();
        if (this.onBonus) this.onBonus(k);
      } else if (b.dataset.act === "next") {
        this.closeModal();
        this.playLevel(nextLevel);
      } else if (b.dataset.act === "map") {
        this.closeModal();
        this.quitToMap();
      }
    };
  }
}
