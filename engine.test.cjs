const assert = require('node:assert/strict');
const NeonEngine = require('./engine.js');

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickUpgrade(engine) {
  const priority = [
    'backup_heart', 'phase_shield', 'nanobots', 'coolant_loop', 'molten_core',
    'overclock', 'void_lens', 'drone_fabricator', 'drone_laser', 'drone_link',
    'blade_matrix', 'chain_core', 'chain_surge', 'dash_reactor', 'magnet',
    'virus_seed', 'spread_protocol', 'thermal_amplifier', 'overcharge_battery'
  ];
  const card = priority.map((id) => engine.offeredUpgrades.find((x) => x.id === id)).find(Boolean) || engine.offeredUpgrades[0];
  assert.ok(card, 'upgrade offer should contain a card');
  assert.equal(engine.chooseUpgrade(card.id), true);
}

function pickRoute(engine) {
  const priority = ['salvage', 'normal', 'clinic', 'contract'];
  const route = priority.map((id) => engine.routeOptions.find((x) => x.id === id)).find(Boolean) || engine.routeOptions[0];
  assert.ok(route, 'route offer should contain a route');
  assert.equal(engine.chooseRoute(route.id), true);
}

function runAutoplay(loadout, seed, contract = null) {
  const engine = new NeonEngine({ random: seeded(seed) });
  engine.start(loadout, contract);
  let ticks = 0;
  let maxEnemies = 0;
  let nextDash = 0;
  let nextHack = 0;
  let nextUltimate = 0;
  const frame = 1 / 60;
  for (; ticks < 100000 && engine.state !== 'won' && engine.state !== 'dead'; ticks++) {
    if (engine.state === 'chest') {
      if (engine.chestReward.remaining > 0) assert.equal(engine.chooseChest(0), true);
      else engine.continueChest();
    }
    else if (engine.state === 'upgrade') pickUpgrade(engine);
    else if (engine.state === 'route') pickRoute(engine);
    else {
      const now = engine.elapsed;
      const chest = engine.chests[0];
      const boss = contract && loadout === 'samurai' && engine.enemies.find(enemy => enemy.type === 'boss');
      const target = chest || boss;
      let angle = target ? Math.atan2(target.y - engine.player.y, target.x - engine.player.x) : now * 0.41;
      if (boss) {
        const distance = Math.hypot(boss.x - engine.player.x, boss.y - engine.player.y);
        if (distance < 210) angle += Math.PI * 0.72;
        else if (distance < 375) angle += Math.PI * 0.40;
      }
      const distanceToChest = chest ? Math.hypot(chest.x - engine.player.x, chest.y - engine.player.y) : Infinity;
      const dash = now >= nextDash;
      const hack = now >= nextHack;
      const ultimate = now >= nextUltimate;
      if (dash) nextDash = now + 4.7;
      if (hack) nextHack = now + 7.1;
      if (ultimate) nextUltimate = now + 8.3;
      engine.update(frame, {
        x: Math.cos(angle),
        y: Math.sin(angle),
        dash,
        hack,
        ultimate
      });
      if (chest && distanceToChest < 240) nextDash = Math.min(nextDash, now + 0.1);
      maxEnemies = Math.max(maxEnemies, engine.enemies.length);
    }
  }
  return { engine, ticks, maxEnemies };
}

{
  const Campaign = require('./campaign.js');
  for (const [index, company] of Campaign.COMPANIES.entries()) {
    const profile = Campaign.createProfile({ unlocked: true });
    const offer = Campaign.offers(profile, company.id)[0];
    const body = Campaign.OPERATIVES[index].id;
    const receipt = Campaign.begin(profile, offer.id, company.id);
    const { engine, maxEnemies } = runAutoplay(body, 42, Campaign.combatConfig(profile, body, offer));
    assert.equal(engine.state, 'won', `${company.name} rank 1 can be cleared with starting gear`);
    assert.equal(engine.floor, offer.floors);
    assert.ok(maxEnemies <= 18);
    assert.equal(Campaign.settle(profile, receipt, true).reward, 1200n);
  }

  const midbossMatchups = [
    ['power', 'transformer', 'ring', 'hack', 'shot', 'dash'],
    ['logistics', 'freight-breaker', 'charge', 'dash', 'hack', 'ultimate'],
    ['medical', 'graft-curator', 'pulse', 'ultimate', 'shot', 'hack']
  ];
  const variants = new Set();
  for (const [company, variant, pattern, weakSource, resistSource, neutralSource] of midbossMatchups) {
    const profile = Campaign.createProfile({ unlocked: true });
    const offer = Campaign.offers(profile, company)[0];
    const raid = new NeonEngine({ random: seeded(19) }).start('runner', Campaign.combatConfig(profile, 'runner', offer));
    for (const type of ['rush', 'shooter', 'tank', 'elite']) {
      const enemy = raid._spawnEnemy(type);
      assert.equal(enemy.faction, company);
      assert.ok(enemy.name && enemy.weakness);
      variants.add(enemy.variant);
    }
    raid._beginFloor(raid.finalFloor - 1);
    assert.equal(raid.enemies.some(enemy => enemy.midboss), false);
    raid.enemies.length = 0;
    raid.floorKills = Math.ceil(raid.floorQuota * 0.42);
    raid._spawnCooldown = 0;
    raid._checkFloorProgress();
    const guard = raid.enemies.find(enemy => enemy.midboss);
    assert.equal(guard.variant, variant);
    raid._spawnWave();
    assert.equal(raid.enemies.filter(enemy => enemy.midboss).length, 1);

    const hit = (source, track) => raid._damageEnemy(guard, 20, { source, track, ignoreMultipliers: true });
    assert.equal(hit(weakSource), 33);
    assert.equal(hit(resistSource), 16);
    assert.equal(hit(neutralSource), 20);
    if (company === 'power') assert.equal(hit('shot', 'drone'), 16, 'attribute drone rounds before resolving affinity');
    assert.ok(raid.events.some(event => event.type === 'weakPoint'));

    raid.enemies = [guard];
    Object.assign(guard, { x: 630, y: 500, shootCooldown: 0 });
    Object.assign(raid.player, { x: 800, y: 500, invuln: 0 });
    raid._updateMidboss(guard, 1 / 60);
    assert.equal(guard.pendingShots[0].kind, pattern);
    const previousHp = raid.player.hp;
    raid._updateTimers(0.8);
    if (pattern === 'ring') assert.equal(raid.bullets.filter(bullet => bullet.enemy).length, 10);
    if (pattern === 'pulse') assert.ok(raid.player.hp < previousHp);
    if (pattern === 'charge') {
      assert.ok(guard.chargeTime > 0);
      for (let i = 0; i < 12; i++) raid._updateMidboss(guard, 1 / 30);
      assert.ok(raid.player.hp < previousHp, 'charge hits across the warning line');
    }

    // The guaranteed reward survives the normal drop cap and the floor waits for its selection.
    raid.floorKills = raid.floorQuota - 1;
    raid._floorChestCount = 5;
    raid._killEnemy(guard, weakSource);
    raid._killEnemy(guard, weakSource);
    assert.deepEqual(raid.chests.map(chest => chest.rarity), ['epic']);
    raid._checkFloorProgress();
    assert.equal(raid.state, 'chest');
    assert.equal(raid.chestReward.total, 3);
    for (let pick = 0; pick < 3; pick++) assert.ok(raid.chooseChest(0));
    assert.ok(raid.continueChest());
    assert.equal(raid.state, 'upgrade');
  }
  assert.equal(variants.size, 12, 'four visually distinct regular enemy variants per company');

  const profile = Campaign.createProfile({ unlocked: true, team: { members: ['lineman'] } });
  const offer = Campaign.offers(profile, 'power')[0];
  const kit = Campaign.combatConfig(profile, 'lineman', offer);
  const engine = new NeonEngine({ random: seeded(1) });
  engine.start('lineman', { ...kit, rank: 10001n, weaponRank: 10000n, armorRank: 10000n, modRank: 10000n, alert: 2 });
  assert.equal(engine.attackScale, 1);
  assert.equal(engine.incomingScale, 1);
  assert.equal(engine.enemies.filter(enemy => enemy.type === 'elite').length >= 2, true);
  assert.equal(engine.player.x, 230, 'guard approach starts on the selected west entrance');
  engine.update(1 / 60, { x: 1, dash: true });
  assert.ok(engine.wire.from.x >= 230 && engine.wire.from.x < 240);
  const target = engine.enemies[0];
  target.x = engine.wire.from.x + 40;
  target.y = engine.wire.from.y;
  engine.update(1 / 60, {});
  assert.ok(target.stun > 0, 'wire halts a guard crossing the dash path');

  engine.start('runner', { ...kit, rank: 10002n, weaponRank: 10000n, armorRank: 10000n, modRank: 10000n });
  assert.ok(Math.abs(engine.attackScale - 1 / 1.2) < 1e-9);
  assert.equal(engine.incomingScale, 1.2);

  // Fund the entire path to a central raid with contract payouts.
  const wallet = Campaign.createProfile({ unlocked: true });
  const shopping = [[], [['gear', 'impact_shell']], [['mod', 'summoner'], ['gear', 'arc_coil']],
    [['mod', 'summoner'], ['gear', 'impact_shell']], [['gear', 'arc_coil'], ['mod', 'summoner']]];
  for (const [index, purchases] of shopping.entries()) {
    for (const [type, id] of purchases) {
      assert.ok(Campaign.purchase(wallet, type, id), 'previous payouts cover the next upgrade');
      if (type === 'gear') assert.ok(Campaign.equip(wallet, 'summoner', id));
    }
    const job = Campaign.offers(wallet, 'power')[0];
    assert.equal(job.rank, BigInt(index + 1));
    const receipt = Campaign.begin(wallet, job.id, 'power');
    const raid = runAutoplay('summoner', 42, Campaign.combatConfig(wallet, 'summoner', job)).engine;
    assert.equal(raid.state, 'won', `${job.facilityName} can be cleared with earned upgrades`);
    assert.equal(Campaign.settle(wallet, receipt, true).reward, job.reward);
    if (index === 4) {
      assert.equal(job.facilityId, 'control');
      assert.equal(raid.floor, 4);
      assert.equal(job.reward, 6075n);
    }
  }
}

// The public surface is usable before a run and contains the complete build catalog.
{
  const engine = new NeonEngine({ random: seeded(1) });
  assert.equal(engine.state, 'title');
  assert.deepEqual(engine.world, { width: 1600, height: 1000 });
  assert.equal(NeonEngine.UPGRADES.length, 19);
  assert.equal(NeonEngine.ROUTES.length, 15);
  assert.equal(NeonEngine.ROUTES.filter((route) => route.kind === 'rest').length, 2, 'two no-downside routes exist');
  assert.equal(NeonEngine.ROUTES.filter((route) => route.focus).length, 6, 'one focus sector per hardware family');
  assert.ok(NeonEngine.PLAY_BOUNDS.minY > 100);
}

// Upgrade previews are side-effect-free and use the same effective values as
// installation, including the selected body's weapon cadence and stat caps.
{
  const engine = new NeonEngine({ random: seeded(17) });
  engine.start('runner');
  const statsBefore = JSON.stringify(engine._stats);
  const playerBefore = JSON.stringify(engine.player);
  const overclock = engine.previewUpgrade('overclock');
  assert.ok(overclock);
  assert.ok(overclock.changes.some((change) => change.label === '射撃間隔'));
  assert.equal(JSON.stringify(engine._stats), statsBefore, 'preview must not mutate stats');
  assert.equal(JSON.stringify(engine.player), playerBefore, 'preview must not mutate player state');
  const intervalAfterPreview = Number(overclock.changes.find((change) => change.label === '射撃間隔').after.replace('秒', ''));
  engine._applyUpgrade('overclock', 'preview-test');
  assert.equal(Number(engine._stats.fireInterval.toFixed(2)), intervalAfterPreview, 'preview cadence should match installation');

  engine.player.hp = 26;
  const heart = engine.previewUpgrade('backup_heart');
  assert.deepEqual(heart.changes, [
    { label: '最大HP', before: '180', after: '235' },
    { label: '現在HP', before: '26', after: '235' }
  ]);
  assert.equal(engine.player.hp, 26);
  engine._applyUpgrade('backup_heart', 'preview-test');
  assert.equal(engine.player.hp, 235);
  assert.equal(engine.player.maxHp, 235);

  const upgradeIds = NeonEngine.UPGRADES.map((upgrade) => upgrade.id);
  for (const id of upgradeIds) {
    const preview = engine.previewUpgrade(id);
    assert.ok(preview && Array.isArray(preview.changes) && typeof preview.note === 'string', `${id} should expose a preview`);
  }
  assert.equal(engine.previewUpgrade('missing-upgrade'), null);

  engine.start('samurai');
  assert.ok(engine.previewUpgrade('overclock').changes.some(({ label }) => label === '斬撃間隔'));
  assert.ok(engine.previewUpgrade('blade_matrix').changes.some(({ label }) => label === '斬撃範囲'));
}

// Preview text explains dormant systems and changes suppressed by caps.
{
  const engine = new NeonEngine({ random: seeded(18) });
  engine.start('runner');
  engine._stats.chain = 12;
  engine._stats.dashCooldown = 0.28;
  engine._stats.pickupRadius = 420;
  engine._syncBuild();
  const cappedChain = engine.previewUpgrade('chain_core');
  assert.match(cappedChain.note, /連鎖数は上限12/);
  assert.ok(cappedChain.changes.some((change) => change.label === '連鎖係数'));
  const cappedDash = engine.previewUpgrade('dash_reactor');
  assert.match(cappedDash.note, /下限0\.28秒/);
  const cappedMagnet = engine.previewUpgrade('magnet');
  assert.match(cappedMagnet.note, /吸引範囲は上限420/);
  const dormantDrone = engine.previewUpgrade('drone_laser');
  assert.match(dormantDrone.note, /ドローン未所持/);
}

// A shooter exposes a warning window before its projectile is created.
{
  const engine = new NeonEngine({ random: () => 0.6 });
  engine.start('runner');
  let telegraph;
  for (let i = 0; i < 20 && !telegraph; i++) {
    engine.update(0.1, { x: 0, y: 1 });
    telegraph = engine.enemies.find((x) => x.telegraph && x.telegraph.type === 'aim');
  }
  assert.ok(telegraph, 'shooter should telegraph before firing');
  assert.ok(telegraph.pendingShots.length > 0);
  const warningId = telegraph.id;
  const shotsBefore = engine.events.filter((x) => x.type === 'enemyShot').length;
  engine.update(0.1, { x: 0, y: 1 });
  assert.equal(engine.events.filter((x) => x.type === 'enemyShot').length, shotsBefore);
  for (let i = 0; i < 5; i++) engine.update(0.1, { x: 0, y: 1 });
  assert.ok(engine.events.some((x) => x.type === 'enemyShot'), `enemy ${warningId} should fire after the warning`);
}

// Heat builds into an overheat cycle, and a held dash key fires once per press.
{
  const observed = [];
  const engine = new NeonEngine({ random: seeded(11), onEvent: (event) => observed.push(event) });
  engine.start('runner');
  engine.player.maxHp = 100000;
  engine.player.hp = 100000;
  let maxHeat = 0;
  for (let i = 0; i < 180; i++) {
    engine.update(0.1, { x: 1, y: 0, dash: true });
    if (engine.state === 'chest') {
      if (engine.chestReward.remaining > 0) engine.chooseChest(0);
      else engine.continueChest();
    }
    maxHeat = Math.max(maxHeat, engine.player.heat);
  }
  assert.ok(maxHeat > 70, `heat should visibly climb (max=${maxHeat})`);
  assert.ok(observed.some((x) => x.type === 'overheat'), 'heat should eventually trigger overheat');
  const dashesHeld = observed.filter((x) => x.type === 'dash').length;
  assert.equal(dashesHeld, 1, 'holding dash should not spam the ability');
  for (let i = 0; i < 12; i++) {
    engine.update(0.1, { x: 1, y: 0, dash: false });
    if (engine.state === 'chest') {
      while (engine.chestReward.remaining > 0) engine.chooseChest(0);
      engine.continueChest();
    }
  }
  engine.update(0.1, { x: 1, y: 0, dash: true });
  if (engine.state === 'chest') {
    while (engine.chestReward.remaining > 0) engine.chooseChest(0);
    engine.continueChest();
  }
  assert.equal(observed.filter((x) => x.type === 'dash').length, 2, 'a new press should dash again');

  // start() is a fresh input session: a held key from the previous run does
  // not suppress the first press of the new run.
  engine.start('runner');
  engine.update(1 / 60, { x: 0, y: 0, dash: true });
  assert.equal(observed.filter((x) => x.type === 'dash').length, 3, 'restart should reset held-key state');
}

// Clinic routes clamp the HP trade, and restart clears the previous run.
{
  const engine = new NeonEngine({ random: seeded(3) });
  engine.start('samurai');
  for (let i = 0; i < 20; i++) {
    engine.state = 'route';
    engine.routeOptions = [{ id: 'clinic', name: '闇医者クリニック', description: '' }];
    assert.equal(engine.chooseRoute('clinic'), true);
  }
  assert.ok(engine.player.maxHp >= 60);
  engine.player.invuln = 0;
  engine._damagePlayer(999, engine.player.x, engine.player.y, '#fff');
  assert.equal(engine.state, 'dead');
  engine.start('runner');
  assert.equal(engine.state, 'playing');
  assert.equal(engine.floor, 1);
  assert.equal(engine.kills, 0);
  assert.equal(engine.upgrades.length, 0);
}

// Targeted combat regressions use tiny fixtures; the full-run checks below
// still exercise the public input API only.
{
  const engine = new NeonEngine({ random: seeded(9) });
  engine.start('runner');
  engine.enemies.length = 0;
  const target = engine._spawnEnemy('rush');
  target.x = engine.player.x + 80;
  target.y = engine.player.y;
  target.hp = 1;
  target.maxHp = 1;
  engine.player.energy = engine.player.maxEnergy;
  engine.update(1 / 60, { x: 0, y: 0, ultimate: true });
  assert.equal(engine.player.energy, 0, 'ultimate kills must not refund ultimate energy');

  const pierceTarget = engine._spawnEnemy('rush');
  pierceTarget.x = engine.player.x + 120;
  pierceTarget.y = engine.player.y;
  pierceTarget.hp = 100;
  pierceTarget.maxHp = 100;
  pierceTarget.stun = 999;
  engine.player.fireCooldown = 999;
  engine.bullets.push({ id: 99999, x: pierceTarget.x, y: pierceTarget.y, vx: 0, vy: 0, r: 6, color: '#fff', enemy: false, damage: 10, pierce: 2 });
  engine.update(1 / 60, { x: 0, y: 0 });
  const hpAfterFirstHit = pierceTarget.hp;
  engine.update(1 / 60, { x: 0, y: 0 });
  assert.equal(pierceTarget.hp, hpAfterFirstHit, 'a piercing bullet must not hit the same target twice');
}

{
  const engine = new NeonEngine({ random: () => 0.6 });
  engine.start('runner');
  const shooter = engine.enemies.find((enemy) => enemy.type === 'shooter');
  assert.ok(shooter, 'fixture should contain a shooter');
  engine.player.x = shooter.x;
  engine.player.y = shooter.y;
  engine.player.fireCooldown = 999;
  shooter.hp = 1000;
  shooter.maxHp = 1000;
  for (let i = 0; i < 20 && !shooter.pendingShots.length; i++) engine.update(0.1, { x: 0, y: 0 });
  assert.ok(shooter.pendingShots.length > 0, 'shooter should have a pending telegraphed shot');
  engine._hack();
  assert.equal(shooter.pendingShots.length, 0, 'hack should cancel a pending shot');
  assert.equal(shooter.telegraph, null, 'hack should clear the shot telegraph');
}

// Dashing through a pickup uses the whole swept path, and a chest pauses the
// simulation while the player chooses each reward round.
{
  const engine = new NeonEngine({ random: () => 0.5 });
  engine.start('runner');
  engine.enemies.length = 0;
  engine.player.heat = 40;
  engine.pickups.push({ x: engine.player.x + 95, y: engine.player.y, type: 'energy' });
  engine.pickups.push({ x: engine.player.x + 95, y: engine.player.y + 1, type: 'heal' });
  engine.pickups.push({ x: engine.player.x + 95, y: engine.player.y - 1, type: 'cool' });
  engine.update(1 / 60, { x: 1, y: 0, dash: true });
  assert.equal(engine.pickups.length, 0, 'dash sweep should collect every pickup between endpoints');
  assert.equal(engine.events.filter((event) => event.type === 'pickup').length, 3, 'energy, heal, and cool pickups should each emit once');
  engine.player.x = 100; engine.player.y = 300;
  engine.player.dashCooldown = 0;
  engine.pickups.push({ x: 191, y: 300, type: 'energy' });
  engine.update(1 / 60, { x: -1, y: -1, dash: false });
  engine.update(1 / 60, { x: -1, y: -1, dash: true });
  assert.equal(engine.pickups.length, 1, 'clamped diagonal dash must not collect outside the swept path');
}

for (const [rarity, expected] of [['rare', 1], ['epic', 3], ['legendary', 5]]) {
  const engine = new NeonEngine({ random: () => 0.5 });
  engine.start('runner');
  engine.enemies.length = 0;
  engine._spawnChestAt(engine.player.x + 140, engine.player.y, rarity);
  engine.update(1 / 60, { x: 1, y: 0, dash: true });
  assert.equal(engine.state, 'chest', `${rarity} chest should open into a paused reveal`);
  assert.equal(engine.chestReward.total, expected, `${rarity} chest should offer ${expected} selection round(s)`);
  assert.equal(engine.chestReward.remaining, expected);
  assert.equal(engine.chestReward.items.length, 0, 'opening a chest must not auto-apply upgrades');
  assert.equal(engine.chestReward.choices.length, 3, 'each round should expose three choices');
  assert.equal(new Set(engine.chestReward.choices.map((item) => item.id)).size, 3, 'choices in one round must be distinct');
  assert.equal(engine.events.filter((event) => event.type === 'chestOpen').length, 1);
  const before = engine.upgrades.length;
  const frozenTime = engine.elapsed;
  const frozenPosition = { x: engine.player.x, y: engine.player.y };
  for (const invalid of [-1, 3, 0.5, NaN, null, '0']) {
    assert.equal(engine.chooseChest(invalid), false, 'invalid choice must not consume a round');
  }
  assert.equal(engine.chestReward.remaining, expected);
  assert.equal(engine.upgrades.length, before);
  assert.equal(engine.continueChest(), false, 'chest cannot continue before all rounds are chosen');
  for (let round = 0; round < expected; round++) {
    engine.update(0.1, { x: 1, y: 1, dash: true, hack: true, ultimate: true });
    assert.equal(engine.elapsed, frozenTime, 'combat time must stay frozen during every selection round');
    assert.deepEqual({ x: engine.player.x, y: engine.player.y }, frozenPosition);
    const choiceIndex = round % 3;
    const selectedId = engine.chestReward.choices[choiceIndex].id;
    assert.equal(engine.chooseChest(choiceIndex), true, `${rarity} round ${round + 1} should accept a choice`);
    assert.equal(engine.upgrades.at(-1), selectedId, 'only the selected candidate should be installed');
    assert.equal(engine.chestReward.items.at(-1).id, selectedId);
    assert.equal(engine.upgrades.length, before + round + 1);
    if (round + 1 < expected) {
      assert.equal(engine.chestReward.remaining, expected - round - 1);
      assert.equal(engine.chestReward.choices.length, 3);
      assert.equal(new Set(engine.chestReward.choices.map((item) => item.id)).size, 3);
      assert.equal(engine.continueChest(), false, 'partial selection must not skip remaining rounds');
    }
  }
  assert.equal(engine.chestReward.items.length, expected);
  assert.equal(engine.chestReward.choices.length, 0);
  assert.equal(engine.chooseChest(0), false, 'completed chest must not grant extra upgrades');
  assert.equal(engine.continueChest(), true);
  assert.equal(engine.upgrades.length, before + expected, 'continue must not apply rewards a second time');
  assert.equal(engine.chooseChest(0), false, 'choice must be rejected after leaving chest state');
  assert.equal(engine.continueChest(), false, 'chest reward can only be continued once');
}

// Multiple chests swept in one dash produce one merged reveal and are removed
// exactly once, even when the player resumes and updates again.
{
  const engine = new NeonEngine({ random: () => 0.5 });
  engine.start('runner');
  engine.enemies.length = 0;
  engine._spawnChestAt(engine.player.x + 80, engine.player.y, 'rare');
  engine._spawnChestAt(engine.player.x + 150, engine.player.y, 'epic');
  engine.update(1 / 60, { x: 1, y: 0, dash: true });
  assert.equal(engine.state, 'chest');
  assert.equal(engine.chests.length, 0);
  assert.equal(engine.chestReward.rarity, 'epic');
  assert.equal(engine.chestReward.total, 4);
  assert.equal(engine.chestReward.remaining, 4);
  const opened = engine.events.filter((event) => event.type === 'chestOpen').length;
  while (engine.chestReward.remaining > 0) assert.equal(engine.chooseChest(0), true);
  engine.continueChest();
  engine.update(1 / 60, { x: 0, y: 0 });
  assert.equal(engine.events.filter((event) => event.type === 'chestOpen').length, opened);
}

// A dash that opens a chest consumes the input edge; simultaneous hack and
// ultimate input must not fire through the paused reveal.
{
  const observed = [];
  const engine = new NeonEngine({ random: () => 0.5, onEvent: (event) => observed.push(event) });
  engine.start('runner');
  engine.enemies.length = 0;
  engine.player.energy = engine.player.maxEnergy;
  engine._spawnChestAt(engine.player.x + 100, engine.player.y, 'rare');
  engine.update(1 / 60, { x: 1, y: 0, dash: true, hack: true, ultimate: true });
  assert.equal(engine.state, 'chest');
  assert.equal(engine.upgrades.length, 0, 'simultaneous inputs must not auto-select chest rewards');
  assert.equal(observed.filter((event) => event.type === 'hack').length, 0);
  assert.equal(observed.filter((event) => event.type === 'ultimate').length, 0);
}

// A final kill waits for a queued chest, then proceeds to the normal upgrade
// choice after the player opens it and resumes.
{
  const engine = new NeonEngine({ random: () => 0.5 });
  engine.start('runner');
  engine.enemies.length = 0;
  engine.floorQuota = 1;
  const target = engine._spawnEnemy('rush');
  target.hp = 1;
  target.maxHp = 1;
  engine._spawnChestAt(1200, engine.player.y, 'rare');
  engine._killEnemy(target, 'shot');
  engine.update(1 / 60, { x: 0, y: 0 });
  assert.equal(engine.state, 'chest', 'final kill must not discard an unopened chest');
  assert.equal(engine.continueChest(), false, 'final-floor chest still requires a selection');
  assert.equal(engine.chooseChest(99), false, 'out-of-range chest choices must be rejected');
  while (engine.chestReward.remaining > 0) assert.equal(engine.chooseChest(0), true);
  const elapsed = engine.elapsed;
  assert.equal(engine.chestEndsFloor(), true);
  assert.equal(engine.continueChest(), true);
  assert.equal(engine.state, 'upgrade', 'floor reward should follow chest continuation immediately');
  assert.equal(engine.elapsed, elapsed, 'no combat time should pass between the two rewards');
}

// Difficulty and multiplicative stacking are intentional balance changes.
{
  const engine = new NeonEngine({ random: () => 0.5 });
  engine.start('runner');
  engine.enemies.length = 0;
  // 第1層だけは攻撃が軽い（初めてのルート選択まで届かせるため）。第2層以降は従来どおり重い。
  const opener = engine._spawnEnemy('rush');
  assert.ok(Math.abs(opener.damage - 16 * NeonEngine.DIFFICULTY.firstFloorDamage) < 1e-9, 'the opening floor hits softer');
  engine.enemies.length = 0;
  engine.floor = 2;
  const target = engine._spawnEnemy('rush');
  engine.floor = 1;
  engine.player.invuln = 0;
  engine.elapsed = engine.beginnerGrace + 1;
  const hp = engine.player.hp;
  engine._damagePlayer(target.damage, target.x, target.y, target.color);
  assert.ok(hp - engine.player.hp >= 14, 'rush enemy contact should be threatening after grace');
  engine._applyUpgrade('void_lens', 'test');
  engine._applyUpgrade('void_lens', 'test');
  assert.equal(Number(engine._stats.damageMult.toFixed(2)), 2.56, 'void lenses should compound multiplicatively');
  engine._applyUpgrade('molten_core', 'test');
  assert.equal(Number(engine._stats.damageMult.toFixed(3)), 3.328, 'molten core should multiply the stacked damage');
}

// Random drops are capped at two in addition to the two guaranteed floor
// vaults, and the stack caps keep the arena/rendering bounded.
{
  const engine = new NeonEngine({ random: () => 0 });
  engine.start('runner');
  for (let kill = 1; kill <= 36; kill++) {
    engine.floorKills = kill;
    engine._maybeSpawnChest(800, 500);
  }
  assert.equal(engine._floorChestDrops, 2);
  assert.equal(engine._floorChestCount, 4);
  assert.equal(engine._floorChestFlags.early, true);
  assert.equal(engine._floorChestFlags.late, true);
  const eventIds = engine.events.map((event) => event.id);
  assert.equal(new Set(eventIds).size, eventIds.length, 'event ids must remain unique when chest ids are emitted');
  assert.ok(engine.events.filter((event) => event.type === 'chestDrop').every((event) => Number.isInteger(event.chestId)), 'chest drops expose chestId separately');
  engine._applyUpgrade('drone_fabricator', 'test');
  engine._stats.droneCount = 11;
  const beforeDroneDamage = engine._stats.droneDamage;
  engine._applyUpgrade('drone_fabricator', 'test');
  assert.equal(engine._stats.droneCount, 12);
  assert.equal(engine._stats.droneOverflow, 1);
  assert.ok(engine._stats.droneDamage > beforeDroneDamage);
  for (let i = 0; i < 12; i++) {
    engine._applyUpgrade('blade_matrix', 'test');
    engine._applyUpgrade('magnet', 'test');
    engine._applyUpgrade('spread_protocol', 'test');
  }
  assert.equal(engine._stats.slashRadius, 420);
  assert.equal(engine._stats.dashRadius, 260);
  assert.equal(engine._stats.hackRadius, 420);
  assert.equal(engine._stats.pickupRadius, 420);
  assert.equal(engine._stats.dronePierce, 0);
  const shielded = new NeonEngine({ random: () => 0.5 });
  shielded.start('runner');
  shielded._applyUpgrade('phase_shield', 'test');
  const shieldHp = shielded.player.hp;
  shielded.player.invuln = 0;
  shielded._damagePlayer(999, shielded.player.x, shielded.player.y, '#fff');
  assert.equal(shielded.player.hp, shieldHp, 'phase shield should nullify a hit');
  assert.equal(shielded.player.shield, 1, 'phase shield should have a bounded remaining charge');
}

// A real input-only autoplay can finish every loadout without touching enemies or HP.
const runResults = [];
for (const seed of [42, 7, 2026]) {
  for (const loadout of ['runner', 'samurai', 'summoner']) {
    const { engine, maxEnemies } = runAutoplay(loadout, seed);
    assert.equal(engine.state, 'won', `${loadout} should reach victory with seed ${seed}`);
    assert.equal(engine.floor, 8);
    assert.ok(engine.kills >= 630, `${loadout} should clear the bounded quotas with seed ${seed}`);
    assert.ok(maxEnemies >= 8 && maxEnemies <= 18, `${loadout} should stay within the crowd budget`);
    assert.ok(engine.upgrades.length >= 35, 'seven cleared floors must award at least 35 augments including guaranteed vaults');
    runResults.push({ seed, loadout, seconds: Number((engine.elapsed).toFixed(2)), kills: engine.kills, augments: engine.upgrades.length, maxEnemies });
  }
}

console.log('engine tests passed: catalog, telegraphs, heat/debounce, routes/restart, combat regressions, and 9 full runs');
console.table(runResults);

{
  // 演出用の追加情報：撃破イベントは敵の種類と半径を持ち、ボス第2形態への移行は1回だけ通知される。
  const engine = new NeonEngine({ random: seeded(77) });
  engine.start('runner');
  engine._beginFloor(8);
  const boss = engine.enemies.find((enemy) => enemy.type === 'boss');
  assert.ok(boss, 'floor 8 spawns the boss');
  // 適応装甲：どれだけ過剰な一撃でも、1回で通るのは最大HPの maxRate×burst ぶんまで。
  const T = NeonEngine.BOSS_TUNING;
  assert.equal(boss.maxHp, T.hp);
  const dealt = engine._damageEnemy(boss, 1e12, { source: 'test', ignoreMultipliers: true });
  assert.ok(Math.abs(dealt - boss.maxHp * T.maxRate * T.burst) < 1e-6, 'one hit is capped at the banked ceiling');
  assert.equal(engine._damageEnemy(boss, 1e12, { source: 'test', ignoreMultipliers: true }), 0, 'the ceiling does not refill without time passing');
  assert.equal(engine.state, 'playing', 'an overwhelming hit no longer ends the fight');
  // 装甲の回復はボスの更新ではなく経過時間で進む（スタン中でも回復する）。
  boss.stun = 5;
  for (let i = 0; i < 60; i++) { engine.player.invuln = 1; engine.update(1 / 60, { x: 0, y: 0 }); }
  assert.ok(engine._damageEnemy(boss, 1e12, { source: 'test', ignoreMultipliers: true }) > boss.maxHp * T.maxRate * 0.9, 'the ceiling refills from run time even while stunned');
  // 小さなダメージは減衰されない。
  for (let i = 0; i < 120; i++) { engine.player.invuln = 1; engine.update(1 / 60, { x: 0, y: 0 }); }
  const before = boss.hp;
  assert.equal(engine._damageEnemy(boss, 100, { source: 'test', ignoreMultipliers: true }), 100);
  assert.equal(boss.hp, before - 100);
  boss.stun = 0;
  boss.hp = boss.maxHp * 0.5;
  for (let i = 0; i < 30; i++) { engine.player.invuln = 1; engine.update(1 / 60, { x: 0, y: 0 }); }
  assert.equal(engine.events.filter((event) => event.type === 'bossPhase').length, 1, 'phase 2 is announced exactly once');
  boss.hp = 1;
  engine._damageEnemy(boss, 50, { source: 'test', ignoreMultipliers: true });
  const kill = engine.events.filter((event) => event.type === 'kill').at(-1);
  assert.equal(kill.enemyType, 'boss', 'kill events carry the enemy type');
  assert.equal(kill.r, boss.r, 'kill events carry the enemy radius');
  assert.equal(engine.events.filter((event) => event.type === 'explosion').at(-1).enemyType, 'boss');
  assert.equal(engine.state, 'won');
  console.log('engine tests passed: boss adaptive armor and presentation payloads (enemyType / bossPhase)');
}

{
  // ルートと共鳴：区画の効果は次の1層だけに掛かり、制圧するとその系統の共鳴が1段階上がる。
  const appearance = require('./appearance.js');
  assert.deepEqual(NeonEngine.UPGRADE_FAMILY, { ...appearance.UPGRADE_FAMILY }, 'engine families match the body visuals');

  const engine = new NeonEngine({ random: seeded(31) });
  engine.start('samurai');
  assert.equal(engine.sector, null, 'the first floor has no sector modifier');
  const offered = (id) => engine._canOfferUpgrade(NeonEngine.UPGRADES.find((u) => u.id === id));
  assert.equal(offered('drone_fabricator'), false, 'a body without drones is not offered the drone opener outside the hangar');
  assert.equal(offered('virus_seed'), false);
  assert.equal(offered('chain_core'), false);
  assert.equal(offered('blade_matrix'), true, 'the samurai owns the blade line');

  // 候補の構成：休息1・区画3・取引1。直前の区画は出ない。
  engine.state = 'route';
  let options = engine._rollRoutes();
  const kindOf = (id) => NeonEngine.ROUTES.find((route) => route.id === id).kind;
  assert.deepEqual(options.map((o) => kindOf(o.id)), ['rest', 'sector', 'sector', 'sector', 'deal']);
  assert.equal(options[1].focus, 'heat', 'the samurai is first offered its own line');
  assert.equal(new Set(options.map((o) => o.id)).size, 5);
  assert.ok(options[1].resonance.next === 1 && options[1].resonance.text, 'sector cards preview the resonance they grow');

  engine.routeOptions = [{ id: 'hangar' }];
  const hpBefore = engine.player.hp;
  assert.equal(engine.chooseRoute('hangar'), true);
  assert.equal(engine.floor, 2);
  assert.equal(engine.sector.id, 'hangar');
  assert.equal(engine.player.hp, hpBefore, 'a sector route has no immediate cost');
  assert.equal(engine.floorQuota, Math.round(70 * 1.3), 'the hangar raises the kill quota');
  assert.ok(engine.enemies.every((enemy) => enemy.type === 'rush' || enemy.type === 'shooter'), 'the hangar spawns only rush and shooter units');
  assert.equal(offered('drone_fabricator'), true, 'the hangar deals in the drone opener');
  for (let i = 0; i < 40; i++) {
    const cards = engine._rollChestChoices();
    assert.ok(cards.some((card) => card.family === 'drone' && card.focus), 'every roll in a focus sector contains a focus card');
    assert.equal(new Set(cards.map((card) => card.id)).size, cards.length, 'cards stay distinct');
  }

  // 制圧：共鳴 +1。Lv1 でドローンが1機加わる。
  const dronesBefore = engine._stats.droneCount;
  engine.enemies.length = 0; engine.chests.length = 0; engine.floorKills = engine.floorQuota;
  engine._checkFloorProgress();
  assert.equal(engine.state, 'upgrade');
  assert.equal(engine.resonance.drone, 1);
  assert.equal(engine._stats.droneCount, dronesBefore + 1);
  assert.equal(engine.events.filter((event) => event.type === 'resonance').length, 1);
  assert.deepEqual(engine.sectorHistory, ['hangar']);
  engine.chooseUpgrade(engine.offeredUpgrades[0].id);
  assert.ok(!engine.routeOptions.some((o) => o.id === 'hangar'), 'the sector just cleared is not offered again');
  assert.equal(engine._affinityFamily(), 'drone', 'the strongest resonance becomes the line the route screen keeps offering');

  // 休息ルートを選ぶと区画効果は残らない。
  const rest = engine.routeOptions[0];
  assert.equal(kindOf(rest.id), 'rest');
  engine.chooseRoute(rest.id);
  assert.equal(engine.sector, null, 'a sector modifier lasts exactly one floor');
  assert.equal(engine.floorQuota, 80);
  assert.equal(offered('drone_fabricator'), true, 'owning drones keeps the line open after the sector');
  engine.state = 'route';
  assert.equal(engine._rollRoutes()[1].focus, 'drone', 'once it is no longer the sector just cleared, the strongest line is back on offer');
  engine.state = 'playing';

  // 共鳴は最大3。重複上限：同じパーツは5個、全体倍率の2種は3個まで。
  for (let i = 0; i < 5; i++) engine._gainResonance('heat');
  assert.equal(engine.resonance.heat, 3);
  for (let i = 0; i < 3; i++) engine._applyUpgrade('void_lens', 'test');
  assert.equal(offered('void_lens'), false, 'global multipliers stop being offered at three copies');
  for (let i = 0; i < 5; i++) engine._applyUpgrade('nanobots', 'test');
  assert.equal(offered('nanobots'), false, 'any part stops being offered at five copies');

  // 上限で候補が尽きても、抽選は空にならず、未解放の系統は出さない。
  {
    const drained = new NeonEngine({ random: seeded(5) });
    drained.start('samurai');
    for (const part of NeonEngine.UPGRADES) {
      if (!drained._canOfferUpgrade(part)) continue;
      for (let i = 0; i < part.maxStack; i++) drained._applyUpgrade(part.id, 'test');
    }
    assert.equal(NeonEngine.UPGRADES.filter((part) => drained._canOfferUpgrade(part)).length, 0, 'every eligible part is capped');
    for (let i = 0; i < 30; i++) {
      const upgradeCards = drained._rollUpgrades(3), chestCards = drained._rollChestChoices();
      assert.equal(upgradeCards.length, 3, 'the floor reward never comes back short');
      assert.equal(chestCards.length, 3, 'a vault round never comes back short');
      for (const card of upgradeCards.concat(chestCards)) {
        assert.ok(!['drone_fabricator', 'drone_laser', 'drone_link', 'virus_seed', 'spread_protocol', 'chain_core', 'chain_surge'].includes(card.id), `${card.id} stays locked for a body that never opened that line`);
        assert.ok(card.id !== 'void_lens' && card.id !== 'molten_core', 'global multipliers stay capped while ordinary parts remain');
      }
    }
  }

  // 最終層の前：区画は出ず、ボス用の準備と取引が並ぶ。
  engine.floor = 7; engine.state = 'route';
  options = engine._rollRoutes();
  assert.equal(options.length, 3);
  assert.equal(kindOf(options[0].id), 'rest');
  assert.ok(options.slice(1).every((o) => kindOf(o.id) === 'boss' || o.id === 'clinic' || o.id === 'contract'));
  engine.routeOptions = [{ id: 'weakpoint' }];
  engine.chooseRoute('weakpoint');
  const boss = engine.enemies.find((enemy) => enemy.type === 'boss');
  const T = NeonEngine.BOSS_TUNING;
  const first = engine._damageEnemy(boss, 1e12, { source: 'test', ignoreMultipliers: true });
  assert.ok(Math.abs(first - boss.maxHp * T.maxRate * T.burst * 1.5) < 1e-6, 'weak-point analysis lets 50% more damage through the armor');
  assert.equal(engine.sector, null, 'the boss floor never carries a sector modifier');
  console.log('engine tests passed: routes, sector modifiers, loot focus, resonance, stack caps');
}

{
  // 共鳴の中身：熱は武器の命中で炎上させ、装甲は近づく敵を焼きシールドを再生する。
  const engine = new NeonEngine({ random: seeded(9) });
  engine.start('runner');
  engine.enemies.length = 0; engine.bullets.length = 0;
  const dummy = (x, y, hp) => { const e = { id: 9000 + engine.enemies.length, type: 'tank', x, y, r: 20, hp, maxHp: hp, speed: 0, color: '#fff', damage: 0, angle: 0, phase: 0, telegraph: null, pendingShots: [], shootCooldown: 99, attackCooldown: 99, stun: 99, infected: 0, hitFlash: 0, dead: false }; engine.enemies.push(e); return e; };
  const far = dummy(engine.player.x + 600, engine.player.y, 1e6);
  engine._damageEnemy(far, 100, { source: 'shot', ignoreHeat: true });
  assert.ok(!far.burn, 'without heat resonance a hit does not ignite');
  engine._gainResonance('heat');
  const dealt = engine._damageEnemy(far, 100, { source: 'shot', ignoreHeat: true });
  assert.equal(far.burn, 3, 'heat resonance I ignites on a weapon hit');
  assert.ok(Math.abs(far.burnDps - dealt * 0.8) < 1e-9, 'the burn is sized from the hit');
  const drone = dummy(engine.player.x - 600, engine.player.y, 1e6);
  engine._damageEnemy(drone, 100, { source: 'shot', track: 'drone', ignoreHeat: true });
  assert.ok(!drone.burn, 'drone shots do not ignite');
  const before = far.hp, heatBefore = engine.damageDealt.heat || 0;
  engine.bullets.length = 0;
  for (let i = 0; i < 60; i++) { engine.player.invuln = 1; engine.player.fireCooldown = 9; engine.update(1 / 60, { x: 0, y: 0 }); engine.bullets.length = 0; }
  assert.ok(Math.abs((before - far.hp) - far.burnDps) < far.burnDps * 0.05, 'one second of burning deals one second of burn damage');
  assert.ok((engine.damageDealt.heat || 0) > heatBefore, 'burn damage is tracked as its own source');

  // 装甲：帯電装甲は近い敵だけを焼く。Lv2で空のシールドが6秒で戻る。
  engine._gainResonance('armor');
  const near = dummy(engine.player.x + 60, engine.player.y, 1e6);
  const nearBefore = near.hp, farBefore = far.hp;
  far.burn = 0; far.burnDps = 0;
  for (let i = 0; i < 60; i++) { engine.player.invuln = 1; engine.player.fireCooldown = 9; engine.update(1 / 60, { x: 0, y: 0 }); engine.bullets.length = 0; }
  assert.ok(nearBefore - near.hp > engine.player.maxHp * 0.7, 'charged plating burns an adjacent enemy for about 80% of max HP per second');
  assert.equal(far.hp, farBefore, 'charged plating does not reach distant enemies');
  engine._gainResonance('armor');
  assert.equal(engine.player.shield, 0);
  for (let i = 0; i < 6 * 60 + 2; i++) { engine.player.invuln = 1; engine.player.fireCooldown = 9; engine.update(1 / 60, { x: 0, y: 0 }); engine.bullets.length = 0; }
  assert.equal(engine.player.shield, 1, 'armor resonance II restores an empty shield after six seconds');
  engine.player.invuln = 0;
  const hp = engine.player.hp, nearHp = near.hp;
  engine._damagePlayer(50, near.x, near.y, '#fff');
  assert.equal(engine.player.hp, hp, 'the restored shield absorbs the hit');
  assert.ok(nearHp - near.hp >= engine.player.maxHp * 2 * 0.99, 'absorbing a hit answers with a counter wave scaled by max HP');
  console.log('engine tests passed: heat ignition and armor resonance');
}


{
  // 脅威度：区画を制圧するたびに +1。以後の敵のHPと攻撃力、ボスの攻撃力が上がる。休息では上がらない。
  const D = NeonEngine.DIFFICULTY;
  const engine = new NeonEngine({ random: seeded(3) });
  engine.start('summoner');
  assert.equal(engine.threat, 0);
  engine.state = 'route'; engine.routeOptions = [{ id: 'normal' }]; engine.chooseRoute('normal');
  engine.enemies.length = 0; engine.chests.length = 0; engine.floorKills = engine.floorQuota; engine._checkFloorProgress();
  assert.equal(engine.threat, 0, 'a rest floor does not raise the threat');
  engine.chooseUpgrade(engine.offeredUpgrades[0].id);
  const card = engine.routeOptions.find((option) => option.kind === 'sector');
  assert.equal(card.threat, 1, 'sector cards state their threat cost');
  engine.chooseRoute(card.id);
  engine.enemies.length = 0;
  const calm = engine._spawnEnemy('rush');
  engine.enemies.length = 0; engine.chests.length = 0; engine.floorKills = engine.floorQuota; engine._checkFloorProgress();
  assert.equal(engine.threat, 1, 'clearing a sector raises the threat by one');
  assert.equal(engine.events.filter((event) => event.type === 'threat').length, 1);
  engine.state = 'route'; engine.routeOptions = [{ id: 'bounty' }]; engine.chooseRoute('bounty');
  assert.equal(engine.threat, 6, 'the bounty adds five more');
  engine.enemies.length = 0;
  const wanted = engine._spawnEnemy('rush');
  assert.ok(wanted.damage > calm.damage * 1.5, 'threat scales enemy damage');
  assert.ok(wanted.maxHp > calm.maxHp * 1.3, 'threat scales enemy HP');
  engine.state = 'route';
  engine.routeOptions = [{ id: 'bounty' }];
  engine.state = 'playing';
  engine._beginFloor(8);
  const boss = engine.enemies.find((enemy) => enemy.type === 'boss');
  assert.ok(Math.abs(boss.damage - 30 * (1 + 6 * D.threatDamage)) < 1e-9, 'threat scales the boss attacks');
  console.log('engine tests passed: threat level and the opening floor');
}
