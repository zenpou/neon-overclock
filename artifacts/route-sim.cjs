// Route-strategy simulation: does the route a player takes change the build they end up with?
// usage: node route-sim.cjs <projectDir> [seeds] [strategies] [pilot]
// pilot: expert (circles, uses every ability on cooldown), average (slower hands, no hack,
// sometimes stands still), novice (wanders, never dashes on purpose, rarely uses BLACKOUT).
const path = require('path');
const NeonEngine = require(path.resolve(process.argv[2], 'engine.js'));
const SEEDS = (process.argv[3] || '11,23,37,58').split(',').map(Number);
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; }
const TAG_FAMILY = { LIGHTNING: 'lightning', VIRUS: 'virus', HEAT: 'heat', DRONE: 'drone', SURVIVE: 'armor', MOBILITY: 'mobility', BLADE: 'mobility', GENERAL: 'general', ULTIMATE: 'general' };
const familyOf = id => { const u = NeonEngine.UPGRADES.find(x => x.id === id); return u.family || TAG_FAMILY[u.tag] || 'general'; };
const SAFE = ['salvage', 'normal'];
const PILOT = process.argv[5] || 'expert';
const PILOTS = { expert: { dash: 4.7, hack: 7.1, ult: 8.3, wander: 0 }, average: { dash: 9, hack: 1e9, ult: 14, wander: 0.35 }, novice: { dash: 1e9, hack: 1e9, ult: 22, wander: 1 } };

// strategy: { route(engine, options) -> id, card(engine, options, rng) -> index }
const neutralCard = (engine, options, rng) => Math.floor(rng() * options.length);
const focusCard = (engine, options, rng) => { const f = engine.sector && engine.sector.focus; const i = f ? options.findIndex(o => familyOf(o.id) === f) : -1; return i >= 0 ? i : Math.floor(rng() * options.length); };
const preferRoute = ids => (engine, options) => (ids.map(id => options.find(o => o.id === id)).find(Boolean) || options.find(o => SAFE.includes(o.id)) || options[0]).id;
const byFocus = family => (engine, options) => (options.find(o => o.focus === family) || options.find(o => SAFE.includes(o.id)) || options[0]).id;
const STRATEGIES = {
  safe: { route: preferRoute(SAFE), card: neutralCard },
  risky: { route: preferRoute(['contract', 'clinic', 'blackmarket']), card: neutralCard },
  lightning: { route: byFocus('lightning'), card: focusCard },
  heat: { route: byFocus('heat'), card: focusCard },
  drone: { route: byFocus('drone'), card: focusCard },
  virus: { route: byFocus('virus'), card: focusCard },
  armor: { route: byFocus('armor'), card: focusCard },
  mobility: { route: byFocus('mobility'), card: focusCard },
  killzone: { route: (engine, options) => (options.find(o => o.id === 'kill_zone') || options.find(o => o.kind === 'sector') || options.find(o => o.kind === 'boss') || options[0]).id, card: neutralCard },
  armory: { route: preferRoute(['armory', 'blackmarket']), card: neutralCard },
  weakpoint: { route: preferRoute(['weakpoint', 'blackmarket']), card: neutralCard },
  bounty: { route: (engine, options) => (options.find(o => o.id === 'bounty') || options.find(o => o.kind === 'sector') || options[0]).id, card: neutralCard },
  anySector: { route: (engine, options) => (options.find(o => o.focus) || options[0]).id, card: neutralCard }
};

function run(loadout, seed, strategyName) {
  const strategy = STRATEGIES[strategyName];
  const engine = new NeonEngine({ random: seeded(seed) });
  const rng = seeded(seed * 7919 + 13);
  const dealt = {};
  const original = engine._damageEnemy.bind(engine);
  engine._damageEnemy = (e, amount, meta) => {
    const before = e && !e.dead ? e.hp : 0;
    const out = original(e, amount, meta);
    if (out > 0) { let src = (meta && meta.source) || 'other'; if (src === 'shot' && meta.color === '#be6cff') src = 'drone'; dealt[src] = (dealt[src] || 0) + Math.min(out, Math.max(0, before)); }
    return out;
  };
  engine.start(loadout);
  let nextDash = PILOTS[PILOT].dash > 1e8 ? 1e9 : 0, nextHack = PILOTS[PILOT].hack > 1e8 ? 1e9 : 0, nextUlt = 0, bossStart = null, routes = [], minOffer = 9, bossTaken = 0, lastHp = 0, heading = 0, idle = false, nextTurn = 0;
  for (let t = 0; t < 300000 && engine.state !== 'won' && engine.state !== 'dead'; t++) {
    if (engine.state === 'chest') { if (engine.chestReward.remaining > 0) engine.chooseChest(strategy.card(engine, engine.chestReward.choices, rng)); else engine.continueChest(); }
    else if (engine.state === 'upgrade') { minOffer = Math.min(minOffer, engine.offeredUpgrades.length); engine.chooseUpgrade(engine.offeredUpgrades[strategy.card(engine, engine.offeredUpgrades, rng)].id); }
    else if (engine.state === 'route') { const id = strategy.route(engine, engine.routeOptions); routes.push(id); engine.chooseRoute(id); }
    else {
      const now = engine.elapsed, chest = engine.chests[0];
      const P = PILOTS[PILOT];
      // Wandering pilots hold a random heading for a while instead of circling, and stop now and then.
      if (P.wander && now >= nextTurn) { heading = rng() * Math.PI * 2; idle = rng() < P.wander * 0.35; nextTurn = now + 0.8 + rng() * 1.6; }
      const angle = chest ? Math.atan2(chest.y - engine.player.y, chest.x - engine.player.x) : P.wander ? heading : now * 0.41;
      const dist = chest ? Math.hypot(chest.x - engine.player.x, chest.y - engine.player.y) : Infinity;
      const dash = now >= nextDash || (engine.resonance && engine.resonance.mobility >= 1 && engine.player.dashCooldown <= 0 && t % 2 === 0), hack = now >= nextHack, ultimate = now >= nextUlt;
      if (dash) nextDash = now + P.dash; if (hack) nextHack = now + P.hack; if (ultimate) nextUlt = now + P.ult;
      const still = idle && !chest;
      engine.update(1 / 60, { x: still ? 0 : Math.cos(angle), y: still ? 0 : Math.sin(angle), dash, hack, ultimate });
      if (chest && dist < 240 && P.dash < 1e8) nextDash = Math.min(nextDash, now + 0.1);
      if (engine.floor === 8 && bossStart === null) bossStart = now;
      if (engine.floor === 8 && engine.player.hp < lastHp) bossTaken += lastHp - engine.player.hp;
      lastHp = engine.player.hp;
    }
  }
  const families = {}; for (const id of engine.upgrades) { const f = familyOf(id); families[f] = (families[f] || 0) + 1; }
  if (engine.damageDealt && Object.keys(engine.damageDealt).length) { for (const k of Object.keys(dealt)) delete dealt[k]; Object.assign(dealt, engine.damageDealt); }
  const total = Object.values(dealt).reduce((a, b) => a + b, 0) || 1;
  const share = {}; for (const [k, v] of Object.entries(dealt)) share[k] = v / total;
  return { loadout, seed, strategy: strategyName, state: engine.state, floor: engine.floor, seconds: engine.elapsed, bossSec: bossStart === null ? null : engine.elapsed - bossStart, augments: engine.upgrades.length, dmgMult: engine._stats.damageMult, hp: engine.player.hp, maxHp: engine.player.maxHp, families, share, routes, minOffer, bossTaken, resonance: engine.resonance ? { ...engine.resonance } : null };
}

const FAMILIES = ['lightning', 'heat', 'drone', 'virus', 'armor', 'mobility', 'general'];
const SOURCES = ['shot', 'drone', 'chain', 'slash', 'dash', 'hack', 'virus', 'heat', 'counter', 'ultimate'];
const names = (process.argv[4] || Object.keys(STRATEGIES).join(',')).split(',');
const summary = [];
let losses = [];
for (const name of names) {
  const runs = [];
  for (const seed of SEEDS) for (const loadout of ['runner', 'samurai', 'summoner']) runs.push(run(loadout, seed, name));
  const avg = f => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const row = { strategy: name, wins: runs.filter(r => r.state === 'won').length + '/' + runs.length, sec: Math.round(avg(r => r.seconds)), boss: +avg(r => r.bossSec || 0).toFixed(1), aug: +avg(r => r.augments).toFixed(1), dmgMultMed: +runs.map(r => r.dmgMult).sort((a, b) => a - b)[Math.floor(runs.length / 2)].toFixed(1), minHpPct: Math.round(Math.min(...runs.map(r => r.hp / r.maxHp)) * 100), minOffer: Math.min(...runs.map(r => r.minOffer)), bossTaken: Math.round(avg(r => r.bossTaken)) };
  for (const f of FAMILIES) row[f] = +avg(r => r.families[f] || 0).toFixed(1);
  for (const s of SOURCES) { const v = avg(r => r.share[s] || 0); if (v > 0.004) row['%' + s] = Math.round(v * 100); }
  const top = {}; for (const r of runs) for (const id of r.routes) top[id] = (top[id] || 0) + 1;
  row.routes = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + '×' + v).join(' ');
  if (runs[0].resonance) row.resonance = FAMILIES.map(f => +avg(r => (r.resonance && r.resonance[f]) || 0).toFixed(1)).join('/');
  summary.push(row);
  losses = losses.concat(runs.filter(r => r.state !== 'won').map(r => `${name}/${r.loadout}/${r.seed}: ${r.state} at floor ${r.floor}`));
}
console.log('pilot: ' + PILOT);
console.table(summary);
if (losses.length) console.log('LOSSES:\n' + losses.join('\n'));
