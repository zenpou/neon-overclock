const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appearance = require('./appearance.js');
const { UPGRADES } = require('./engine.js');
const { GEAR } = require('./campaign.js');

function png(filename, minimumSize = 512) {
  const bytes = fs.readFileSync(path.join(__dirname, filename));
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a', `${filename}: PNG signature`);
  assert.equal(bytes.subarray(12,16).toString(), 'IHDR');
  assert.equal(bytes[25], 6, `${filename}: RGBA source is required to preserve transparency`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.ok(width >= minimumSize && height >= minimumSize, `${filename}: minimum asset resolution`);
  return {width,height};
}

for (const body of Object.values(appearance.BODIES)) if (body.portrait) png(body.portrait);
const actors = png('assets/sprites/actors.png');
assert.equal(actors.width, actors.height, '3×3 actor atlas must have square cells');
assert.equal(actors.width % 3, 0, 'actor cell edges must land on pixels');
const parts = png('assets/sprites/augments.png');
assert.equal(parts.width / 3, parts.height / 2, '3×2 augment atlas must have square cells');
assert.equal(parts.width % 3, 0, 'augment cell edges must land on pixels');
const players = png('assets/sprites/players.png');
assert.ok(Math.abs(players.width / 4 - players.height / 3) < 10, '4×3 directional atlas has approximately square cells');
for (const { id } of [...UPGRADES, ...GEAR]) {
  const icon = png(`assets/sprites/items/${id}.png`, 128);
  assert.equal(icon.width, icon.height, `${id}: square inventory icon`);
}
console.log('asset checks passed: portraits, sprite atlases, and all inventory icons');
