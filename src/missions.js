import { mulberry32, hashString } from "./rng.js";

const TEMPLATES = [
  { kind: "pot", min: 12, max: 30, step: 6, coins: (t) => 120 + t * 8 },
  { kind: "clear", min: 2, max: 4, step: 1, coins: (t) => 150 + t * 90 },
  { kind: "stars3", min: 2, max: 3, step: 1, coins: (t) => 120 + t * 120, gems: (t) => (t >= 3 ? 1 : 0) },
  { kind: "combo", min: 3, max: 5, step: 1, coins: (t) => 120 + t * 70 },
  { kind: "foulfree", min: 1, max: 3, step: 1, coins: (t) => 180 + t * 110 },
  { kind: "coins", min: 600, max: 1500, step: 300, coins: () => 0, gems: () => 2 },
];

export const MISSION_COUNT = 3;

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function msUntilReset(now = Date.now()) {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - now;
}

export function rollDaily(day) {
  const rnd = mulberry32((hashString(day) ^ 0x9e3779b9) >>> 0);
  const pool = TEMPLATES.slice();
  const items = [];
  for (let i = 0; i < MISSION_COUNT && pool.length; i++) {
    const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const steps = Math.floor((t.max - t.min) / t.step) + 1;
    const target = t.min + Math.floor(rnd() * steps) * t.step;
    items.push({
      id: `${day}:${t.kind}`,
      kind: t.kind,
      target,
      progress: 0,
      claimed: false,
      coins: t.coins ? t.coins(target) : 0,
      gems: t.gems ? t.gems(target) : 0,
    });
  }
  return items;
}

export function describe(item) {
  switch (item.kind) {
    case "pot":
      return { title: `Sink ${item.target} balls`, sub: "Any level", icon: "🎱" };
    case "clear":
      return { title: `Clear ${item.target} levels`, sub: "Any level", icon: "🏆" };
    case "stars3":
      return { title: `Earn 3 stars on ${item.target} levels`, sub: "Flawless clears", icon: "⭐" };
    case "combo":
      return { title: `Reach a ${item.target}-ball combo`, sub: "One shot, many pots", icon: "🔥" };
    case "foulfree":
      return { title: `Clear ${item.target} levels foul-free`, sub: "No scratches", icon: "🎯" };
    case "coins":
      return { title: `Earn ${item.target} coins`, sub: "Level rewards & bonuses", icon: "💰" };
    default:
      return { title: item.kind, sub: "", icon: "•" };
  }
}

export function addProgress(items, kind, amount, mode = "add") {
  const done = [];
  if (!Array.isArray(items)) return done;
  for (const it of items) {
    if (it.kind !== kind || it.claimed) continue;
    const before = it.progress ?? 0;
    it.progress = mode === "max" ? Math.max(before, amount) : before + amount;
    it.progress = Math.min(it.target, it.progress);
    if (before < it.target && it.progress >= it.target) done.push(it);
  }
  return done;
}

export function claimableCount(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter((i) => !i.claimed && i.progress >= i.target).length;
}
