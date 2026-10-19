import { addProgress, claimableCount } from "./missions.js";
import { BONUS_EVERY } from "./modes.js";

/* Aiming help levels: "off" | "basic" | "advanced" (two levels of help angles).
 * Older saves used assistMode "auto"/"full"/"off" — map those onto the new values. */
export function normalizeAimHelp(v) {
  if (v === "off" || v === false) return "off";
  if (v === "advanced" || v === "full") return "advanced";
  if (v === "basic" || v === "auto") return "basic";
  return "basic";
}

const DEFAULT_STATE = {
  coins: 500,
  gems: 30,
  hearts: 5,
  heartsAt: 0,
  maxLevel: 1,
  stars: {},
  cuesOwned: ["starter"],
  cueEquipped: "starter",
  lastDaily: 0,
  sfx: true,
  music: true,
  quality: "auto",
  assistMode: "auto",
  aimHelp: "basic",
  totalPotted: 0,
  seenHelp: false,
  missions: null,
  bonus: {},
};

export class Save {
  constructor(cfg) {
    this.cfg = cfg;
    this.state = { ...DEFAULT_STATE };
    this.folder = null;
    this.ready = false;
  }

  async init() {
    try {
      if (typeof root !== "undefined" && root.kv) {
        this.folder = root.kv.shootingBallSave;
        const stored = await this.folder.get("state");
        if (stored && typeof stored === "object") {
          this.state = { ...DEFAULT_STATE, ...stored };
          this.state.stars = stored.stars ?? {};
          this.state.cuesOwned = Array.isArray(stored.cuesOwned) ? stored.cuesOwned : ["starter"];
          this.state.aimHelp = normalizeAimHelp(stored.aimHelp ?? stored.assistMode);
        }
      }
    } catch (e) {
      console.warn("save load failed", e);
    }
    this.ready = true;
    this.refillHearts();
    return this.state;
  }

  async persist() {
    if (!this.folder) return;
    try {
      await this.folder.set("state", this.state);
    } catch (e) {
      console.warn("save write failed", e);
    }
  }

  refillHearts(now = Date.now()) {
    const cfg = this.cfg;
    if (this.state.hearts >= cfg.maxHearts) {
      this.state.heartsAt = now;
      return false;
    }
    const per = cfg.heartRefillMinutes * 60 * 1000;
    const elapsed = now - (this.state.heartsAt || now);
    if (elapsed >= per) {
      const gained = Math.floor(elapsed / per);
      this.state.hearts = Math.min(cfg.maxHearts, this.state.hearts + gained);
      this.state.heartsAt = this.state.hearts >= cfg.maxHearts ? now : (this.state.heartsAt || now) + gained * per;
      this.persist();
      return true;
    }
    return false;
  }

  msToNextHeart(now = Date.now()) {
    if (this.state.hearts >= this.cfg.maxHearts) return 0;
    const per = this.cfg.heartRefillMinutes * 60 * 1000;
    return Math.max(0, per - (now - (this.state.heartsAt || now)));
  }

  addCoins(n) {
    this.state.coins = Math.max(0, this.state.coins + n);
    this.persist();
  }
  addGems(n) {
    this.state.gems = Math.max(0, this.state.gems + n);
    this.persist();
  }
  spendCoins(n) {
    if (this.state.coins < n) return false;
    this.state.coins -= n;
    this.persist();
    return true;
  }
  spendGems(n) {
    if (this.state.gems < n) return false;
    this.state.gems -= n;
    this.persist();
    return true;
  }
  loseHeart() {
    if (this.state.hearts <= 0) return false;
    if (this.state.hearts >= this.cfg.maxHearts) this.state.heartsAt = Date.now();
    this.state.hearts--;
    this.persist();
    return true;
  }
  addHeart(n = 1) {
    this.state.hearts = Math.min(this.cfg.maxHearts, this.state.hearts + n);
    this.persist();
  }

  reset() {
    const keep = {
      sfx: this.state.sfx,
      music: this.state.music,
      quality: this.state.quality,
      aimHelp: this.state.aimHelp,
    };
    this.state = {
      ...DEFAULT_STATE,
      ...keep,
      stars: {},
      cuesOwned: ["starter"],
      cueEquipped: "starter",
      hearts: this.cfg.maxHearts,
      heartsAt: Date.now(),
    };
    this.persist();
    return this.state;
  }

  starsFor(level) {
    return this.state.stars[level] ?? 0;
  }
  setStars(level, stars) {
    if ((this.state.stars[level] ?? 0) < stars) {
      this.state.stars[level] = stars;
      this.persist();
      return true;
    }
    return false;
  }
  isUnlocked(level) {
    return level <= this.state.maxLevel;
  }
  unlockNext(level) {
    if (level + 1 > this.state.maxLevel) {
      this.state.maxLevel = level + 1;
      this.persist();
    }
  }

  /* ---------------- bonus stages ---------------- */

  isBonusUnlocked(k) {
    return this.state.maxLevel > k * BONUS_EVERY;
  }
  bonusRecord(k) {
    return this.state.bonus?.[k] ?? null;
  }
  bonusCleared(k) {
    return !!this.state.bonus?.[k]?.cleared;
  }
  setBonusResult(k, { score = 0, cleared = false, stars = 0 } = {}) {
    const all = (this.state.bonus = this.state.bonus ?? {});
    const prev = all[k] ?? { best: 0, cleared: false, stars: 0, plays: 0 };
    const rec = {
      best: Math.max(prev.best ?? 0, score),
      cleared: !!prev.cleared || !!cleared,
      stars: Math.max(prev.stars ?? 0, stars),
      plays: (prev.plays ?? 0) + 1,
      at: Date.now(),
    };
    all[k] = rec;
    this.persist();
    return rec;
  }
  bonusClearedCount() {
    return Object.values(this.state.bonus ?? {}).filter((r) => r?.cleared).length;
  }

  ownsCue(id) {
    return this.state.cuesOwned.includes(id);
  }
  buyCue(id, price, gems) {
    if (this.ownsCue(id)) return true;
    const ok = gems ? this.spendGems(price) : this.spendCoins(price);
    if (!ok) return false;
    this.state.cuesOwned.push(id);
    this.state.cueEquipped = id;
    this.persist();
    return true;
  }
  equipCue(id) {
    if (!this.ownsCue(id)) return false;
    this.state.cueEquipped = id;
    this.persist();
    return true;
  }

  totalStars() {
    let t = 0;
    for (const k of Object.keys(this.state.stars)) t += this.state.stars[k];
    return t;
  }

  canDaily(now = Date.now()) {
    return now - (this.state.lastDaily || 0) > 20 * 60 * 60 * 1000;
  }
  claimDaily(now = Date.now()) {
    if (!this.canDaily(now)) return null;
    this.state.lastDaily = now;
    const coins = 200 + Math.floor(Math.random() * 9) * 50;
    const gems = 5 + Math.floor(Math.random() * 6);
    this.addCoins(coins);
    this.addGems(gems);
    this.persist();
    return { coins, gems };
  }

  ensureMissions(day, items) {
    const m = this.state.missions;
    if (m && m.day === day && Array.isArray(m.items) && m.items.length) return false;
    this.state.missions = { day, items };
    this.persist();
    return true;
  }

  progressMissions(kind, amount = 1, mode = "add") {
    const m = this.state.missions;
    if (!m) return [];
    const done = addProgress(m.items, kind, amount, mode);
    if (done.length) this.persist();
    return done;
  }

  missionById(id) {
    const m = this.state.missions;
    return m ? m.items.find((i) => i.id === id) ?? null : null;
  }

  claimMission(id) {
    const it = this.missionById(id);
    if (!it || it.claimed || it.progress < it.target) return null;
    it.claimed = true;
    if (it.coins) this.state.coins += it.coins;
    if (it.gems) this.state.gems += it.gems;
    this.persist();
    return { coins: it.coins, gems: it.gems };
  }

  missionsClaimable() {
    const m = this.state.missions;
    return m ? claimableCount(m.items) : 0;
  }

  addPotted(n = 1) {
    this.state.totalPotted = (this.state.totalPotted ?? 0) + n;
    this.persist();
  }
}
