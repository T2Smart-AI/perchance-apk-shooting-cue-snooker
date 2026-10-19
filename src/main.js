import { Game } from "./game.js";
import { Save, normalizeAimHelp } from "./save.js";
import { UI } from "./ui.js";
import { unlockAudio, setEnabled as setSfx, sfx } from "./audio.js";
import { setMusicEnabled, unlockMusic, play as playMusic } from "./music.js";
import { LEVELS_PER_CHAPTER } from "./levels.js";
import { dayKey, rollDaily } from "./missions.js";
import { getBonusLevel, MODE_BY_ID } from "./modes.js";

const qs = new URLSearchParams(location.search);

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function readTable() {
  const t = (typeof root !== "undefined" && root.table) || {};
  const out = {};
  for (const k of [
    "halfLength", "halfWidth", "ballRadius", "pocketRadius", "sidePocketRadius",
    "cornerMouth", "sideMouth", "pocketInset", "railWidth", "cushionDepth",
    "cushionHeight", "railHeight",
  ]) {
    const v = num(t[k], NaN);
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

const cfg = {
  version: String((typeof root !== "undefined" && root.gameInfo?.version) ?? "1.0.0"),
  maxHearts: num(root?.economy?.maxHearts, 5),
  heartRefillMinutes: num(root?.economy?.heartRefillMinutes, 20),
  starBonus: num(root?.economy?.starBonus, 100),
  firstClearBonus: num(root?.economy?.firstClearBonus, 50),
  coinsPerBall: num(root?.economy?.coinsPerBall, 60),
  coinsPerLevel: num(root?.economy?.coinsPerLevel, 150),
  gemsPerChapter: num(root?.economy?.gemsPerChapterReward, 5),
};

function readPhysics() {
  const p = (typeof root !== "undefined" && root.physics) || {};
  const map = {
    gravity: "gravity",
    muSlide: "muSlide",
    muRoll: "muRoll",
    kDrag: "kDrag",
    muSpin: "spinDecay",
    muSpinStop: "spinStop",
    muBall: "muBall",
    eBall: "eBall",
    eCushion: "eCushion",
    muCushion: "muCushion",
    maxSpeed: "maxSpeed",
    hitPower: "hitPower",
    restSpeed: "restSpeed",
    restSpin: "restSpin",
  };
  const out = {};
  for (const [k, dest] of Object.entries(map)) {
    const v = num(p[k], NaN);
    if (Number.isFinite(v)) out[dest] = v;
  }
  return out;
}

const canvas = document.getElementById("gameCanvas");
const save = new Save(cfg);
await save.init();
setSfx(save.state.sfx !== false);
setMusicEnabled(save.state.music !== false);

const events = {};
const game = new Game(canvas, { params: readTable(), physics: readPhysics(), events });
const ui = new UI({ save, cfg, game, economy: root?.economy });
/* When a milestone level is cleared we enter its bonus stage, then hand the
 * player straight on to the following level (this remembers which one). */
let pendingNextLevel = 0;

ui.init();
game.assistMode = save.state.assistMode ?? "auto";
game.aimHelp = normalizeAimHelp(save.state.aimHelp ?? save.state.assistMode);
save.state.aimHelp = game.aimHelp;
game.applyQuality(save.state.quality ?? "auto");
game.aimDragGain = num(root?.aiming?.dragGain, 0.45);
game.aimMaxAngles = num(root?.aiming?.maxAngles, 3);

save.ensureMissions(dayKey(), rollDaily(dayKey()));
ui.refreshWallet();

function missionProgress(kind, amount = 1, mode = "add") {
  const done = save.progressMissions(kind, amount, mode);
  if (done.length) {
    ui.banner("Mission complete!");
    ui.refreshWallet();
  }
  return done;
}

const DEFAULT_CUE = { id: "starter", name: "Maple Starter", rank: "D", power: 1, aimBounces: 0, assist: false, spin: 0.8, coinBonus: 1, cost: 0, wood: "#b98a4f", wrap: "#5b3b22" };

function equippedCue() {
  return ui.cues.find((c) => c.id === save.state.cueEquipped) ?? ui.cues[0] ?? DEFAULT_CUE;
}

const DEMO_CUE = { id: "demo", name: "Demo", rank: "SSS", power: 1.25, aimBounces: 5, assist: true, spin: 1.5, coinBonus: 1.5, wood: "#f0e6d2", wrap: "#2a2f3a" };

function loadDemo() {
  game.demo = true;
  game.demoT = 0;
  pendingNextLevel = 0;
  game.setCue(DEMO_CUE);
  const lvl = Math.min(Math.max(1, save.state.maxLevel), 1000);
  const lv = game.loadLevel(lvl);
  ui.setLevel(lv);
  ui.setPower(0);
  game.aim = Math.PI * 0.85;
  ui.musicTrack = "menu";
  playMusic("menu");
}

function startLevel(n, force = false) {
  if (!force && save.state.hearts <= 0) {
    ui.showNoHearts();
    return;
  }
  pendingNextLevel = 0;
  game.demo = false;
  game.setCue(equippedCue());
  const lv = game.loadLevel(n);
  ui.inGameHud();
  ui.setLevel(lv);
  ui.setPower(0);
  ui.setSpin(0, 0);
  const el = document.getElementById("shotsLeftEl");
  if (el) el.textContent = lv.shots;
  ui.musicTrack = "play";
  playMusic("play");
}

/* Bonus stages are free (no hearts) and never touch the level track. */
function startBonus(k) {
  game.demo = false;
  game.setCue(equippedCue());
  const lv = game.loadLevel(0, { bonusId: k });
  ui.inGameHud();
  ui.setLevel(lv);
  ui.setPower(0);
  ui.setSpin(0, 0);
  ui.setBonusProgress({ text: game.bonusGoalText() });
  ui.musicTrack = "play";
  playMusic("play");
}

/* Enter a bonus stage through its full-screen entry animation. When `nextLevel`
 * is given, the bonus result then offers to continue to that level. */
function enterBonus(k, nextLevel = 0) {
  if (nextLevel) pendingNextLevel = nextLevel;
  ui.playBonusEntry(k, () => startBonus(k));
}

function bonusScoreOf() {
  const b = game.bonus;
  if (!b) return 0;
  return Math.round((b.state.score ?? 0) + (b.state.pots ?? 0) * 60);
}

function finishBonus(win, info) {
  const lv = info.level;
  const k = lv.bonusId;
  const mode = MODE_BY_ID[lv.mode];
  const score = bonusScoreOf();
  const goalText = game.bonus ? game.bonusGoalText() : "";
  const best = save.bonusRecord(k)?.best ?? 0;
  let coins = 0;
  let gems = 0;
  if (win) {
    const firstClear = !save.bonusCleared(k);
    const base = (lv.reward?.coins ?? 0) + (mode.chest?.coins ?? 0);
    const perf = Math.round(Math.min(mode.chest?.coins ?? 0, score * (mode.chest?.perScore ?? 1)));
    coins = firstClear ? base + perf : Math.round((base + perf) * 0.25);
    gems = firstClear ? (lv.reward?.gems ?? 0) + (mode.chest?.gems ?? 0) : 0;
    save.setBonusResult(k, { score, cleared: true, stars: info.stars ?? 3 });
    if (coins) save.addCoins(coins);
    if (gems) save.addGems(gems);
    ui.refreshWallet();
    missionProgress("clear", 1);
    missionProgress("coins", coins);
  } else {
    save.setBonusResult(k, { score, cleared: false, stars: 0 });
  }
  setTimeout(() => {
    ui.showBonusResult({
      win,
      mode,
      score,
      scoreLabel: `${goalText} · score ${score}`,
      coins,
      gems,
      k,
      best,
      nextLevel: pendingNextLevel,
      reason: info.reason,
    });
  }, win ? 820 : 640);
}

ui.onSelectLevel = (n, force) => startLevel(n, force);
ui.onBonus = (k, nextLevel) => enterBonus(k, nextLevel);
ui.onQuitToMenu = () => loadDemo();
ui.onCuesChanged = () => {
  if (!game.demo) game.setCue(equippedCue());
};

events.label = (text, color, x, y) => ui.label(text, color, x, y);
events.aim = ({ power }) => ui.setPower(power);
events.shot = ({ shotsUsed, shots }) => ui.setShots(shotsUsed, shots);
events.pocket = ({ remaining, credited, combo }) => {
  ui.setBallCount(remaining, game.level.count);
  ui.setBallIcon(ui.targetNumber());
  if (credited) {
    save.addPotted(1);
    missionProgress("pot", 1);
  }
  if (combo >= 2) missionProgress("combo", combo, "max");
};
events.ready = () => {
  ui.setBallIcon(ui.targetNumber());
  ui.setShots(game.shotsUsed, game.level.shots);
  ui.setHint();
};
events.start = () => {
  ui.setBallIcon(ui.targetNumber());
  ui.setBallCount(game.remaining, game.level.count);
  ui.setHint();
};
events.foul = ({ reason }) => {
  if (reason === "scratch") ui.banner("Scratch! Ball in hand");
};
events.ballInHand = () => {
  ui.setBallIcon(ui.targetNumber());
  ui.setHint("Drag to position the cue ball · release to place it");
};
events.banner = ({ text }) => ui.banner(text);
events.bumper = ({ strength }) => sfx.cushion(Math.min(1, 0.45 + (strength ?? 1) / 9));
events.timer = ({ timeLeft, timeLimit }) => ui.setTimer(timeLeft, timeLimit);
events.bonusProgress = (info) => ui.setBonusProgress(info);
events.tick = ({ timeLeft, timeLimit }) => {
  ui.setTimer(timeLeft, timeLimit);
  const sec = Math.ceil(timeLeft);
  if (sec <= 5 && sec > 0 && sec !== game._lastBeep) {
    game._lastBeep = sec;
    sfx.countdown(sec <= 3);
  }
  if (sec > 5) game._lastBeep = null;
};
events.bonus = ({ coins }) => {
  save.addCoins(coins);
  ui.refreshWallet();
  missionProgress("coins", coins);
};
events.bonusGems = ({ gems }) => {
  save.addGems(gems);
  ui.refreshWallet();
};
events.pauseToggle = () => ui.togglePause();
events.muteToggle = () => ui.toggleMute();
events.restart = ({ level }) => {
  if (ui.modalOpen) ui.closeModal();
  ui.playLevel(level, true);
};

events.complete = (info) => {
  const lv = info.level;
  if (lv.bonus) {
    finishBonus(true, info);
    return;
  }
  const prevStars = save.starsFor(lv.number);
  const firstClear = prevStars === 0;
  save.setStars(lv.number, info.stars);
  save.unlockNext(lv.number);
  const coins = lv.reward.coins + cfg.starBonus * info.stars + (firstClear ? cfg.firstClearBonus : 0);
  let gems = lv.reward.gems;
  let chapterBonus = 0;
  if (lv.index === LEVELS_PER_CHAPTER - 1) {
    chapterBonus = cfg.gemsPerChapter + Math.floor(lv.chapter / 6);
    gems += chapterBonus;
  }
  let perfectBonus = 0;
  if (info.stars === 3 && prevStars < 3) {
    perfectBonus = 2;
    gems += perfectBonus;
  }
  save.addCoins(coins);
  if (gems) save.addGems(gems);
  ui.refreshWallet();
  missionProgress("clear", 1);
  if (info.stars === 3) missionProgress("stars3", 1);
  if (info.fouls === 0) missionProgress("foulfree", 1);
  missionProgress("coins", coins);
  game.demo = false;
  if (chapterBonus) setTimeout(() => ui.banner("Chapter complete!"), 900);
  setTimeout(() => {
    ui.showResult({
      win: true,
      stars: info.stars,
      coins,
      gems,
      shotsUsed: info.shotsUsed,
      fouls: info.fouls,
      level: lv,
      firstClear,
      chapterBonus,
      perfectBonus,
    });
  }, 780);
};

events.fail = (info) => {
  if (info.level?.bonus) {
    finishBonus(false, info);
    return;
  }
  save.loseHeart();
  ui.refreshWallet();
  game.demo = false;
  setTimeout(() => {
    ui.showResult({ win: false, reason: info.reason, level: info.level });
  }, 640);
};

/* ---------------- boot ---------------- */

loadDemo();
ui.showScreen("menuScreen");
ui.hideLoader();

if (qs.has("bonus")) {
  const k = num(qs.get("bonus"), 1);
  setTimeout(() => enterBonus(k), 60);
} else if (qs.has("level")) {
  const n = num(qs.get("level"), 1);
  setTimeout(() => startLevel(n, true), 60);
} else if (!save.state.seenHelp) {
  setTimeout(() => ui.openHelp(), 600);
}

setInterval(() => {
  const day = dayKey();
  if (save.state.missions?.day !== day) {
    if (save.ensureMissions(day, rollDaily(day))) ui.toast("New daily missions!");
    ui.refreshWallet();
  }
}, 60000);

const unlock = () => {
  unlockAudio();
  unlockMusic();
  playMusic(ui.musicTrack ?? (game.demo ? "menu" : "play"));
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
  window.removeEventListener("touchstart", unlock);
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);
window.addEventListener("touchstart", unlock);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    game.update(dt);
    game.render();
  } catch (e) {
    console.error("frame error", e);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__game = game;
window.__ui = ui;
window.__save = save;
window.__ready = true;
