const assert = require('node:assert/strict');
const Appearance = require('./appearance.js');

assert.equal(Appearance.FAMILIES.length, 6);
assert.deepEqual(Appearance.FAMILIES.map((family) => family.slot), [0, 1, 2, 3, 4, 5]);
assert.deepEqual(Object.keys(Appearance.ACTOR_CELLS), ['runner', 'samurai', 'summoner', 'rush', 'shooter', 'tank', 'elite', 'boss', 'drone']);

// The complete gameplay catalog is represented exactly once by a visual family.
assert.equal(Appearance.KNOWN_UPGRADES.length, 19);
assert.equal(new Set(Appearance.KNOWN_UPGRADES).size, 19);
for (const id of Appearance.KNOWN_UPGRADES) {
  assert.ok(Appearance.FAMILIES.some((family) => family.id === Appearance.UPGRADE_FAMILY[id]), `${id} should map to a family`);
}

// Mixed builds keep every visual family that was previously installed.
const mixed = Appearance.resolve('runner', ['chain_core', 'molten_core', 'drone_fabricator', 'virus_seed', 'phase_shield', 'dash_reactor']);
assert.equal(mixed.total, 6);
assert.equal(mixed.stage, 3);
assert.deepEqual(mixed.families.map((family) => family.id), ['lightning', 'heat', 'drone', 'virus', 'armor', 'mobility']);
assert.equal(mixed.dominant, 'lightning', 'runner bias should resolve an equal tie');
assert.ok(mixed.signature.includes('0:1') && mixed.signature.includes('5:1'));

// Stacks alter tiers without changing the other families.
const stacked = Appearance.resolve('samurai', ['molten_core', 'overclock', 'thermal_amplifier', 'drone_fabricator']);
const heat = stacked.families.find((family) => family.id === 'heat');
assert.equal(heat.count, 3);
assert.equal(heat.tier, 3);
assert.equal(stacked.families.find((family) => family.id === 'drone').tier, 1);
assert.equal(stacked.dominant, 'heat', 'samurai bias should win a tie involving heat');

// Stage and body fallbacks are deterministic and do not mutate caller arrays.
const ids = ['chain_core'];
const first = Appearance.resolve('bad-body', ids);
ids.push('unknown', 'drone_link');
const second = Appearance.resolve('bad-body', ids);
assert.equal(first.loadout, 'runner');
assert.equal(first.total, 1);
assert.equal(first.stage, 1);
assert.equal(first.stageLabel, '一次改造');
assert.equal(second.total, 2);
assert.notEqual(first.signature, second.signature);
assert.deepEqual(first.families.map((family) => family.id), ['lightning']);

// Unknown ids, non-arrays, and duplicate calls are safe; returned state is fresh.
const empty = Appearance.resolve('summoner', ['nope', null, 1]);
assert.equal(empty.total, 0);
assert.equal(empty.stage, 0);
assert.equal(empty.dominant, null);
assert.deepEqual(empty.families, []);
assert.equal(Appearance.resolve('runner', ['void_lens']).signature, Appearance.resolve('runner', ['void_lens']).signature);
const mutableCheck = Appearance.resolve('runner', ['chain_core']);
assert.throws(() => { mutableCheck.families.push({}); }, TypeError);

console.log('appearance tests passed: catalog mapping, tiers, mixed builds, fallback, and deterministic signatures');
