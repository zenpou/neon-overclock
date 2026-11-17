const test = require('node:test');
const assert = require('node:assert/strict');
const Campaign = require('./campaign.js');

test('initial campaign offers three rank-one routes for each company', () => {
  const profile = Campaign.createProfile({ unlocked: true });
  for (const company of Campaign.COMPANIES) {
    const list = Campaign.offers(profile, company.id);
    assert.equal(list.length, 3);
    assert.ok(list.every(offer => offer.rank === 1n));
    assert.ok(list.every(offer => offer.reward === 1200n));
    assert.equal(new Set(list.map(offer => offer.routeKey)).size, 3);
  }
});

test('campaign board stays locked until the first core clear', () => {
  assert.deepEqual(Campaign.offers(Campaign.createProfile(), 'power'), []);
  assert.equal(Campaign.offers(Campaign.createProfile(null, 1), 'power').length, 3);
});

test('a receipt pays once and blocks concurrent or stale runs', () => {
  const profile = Campaign.createProfile({ unlocked: true });
  const offer = Campaign.offers(profile, 'power')[0];
  const receipt = Campaign.begin(profile, offer.id, 'power');
  assert.ok(receipt);
  assert.equal(Campaign.begin(profile, offer.id, 'power'), null);
  assert.deepEqual(Campaign.settle(profile, receipt, true), { reward: 1200n, unlocked: true });
  assert.equal(profile.cash, 1200n);
  assert.equal(Campaign.settle(profile, receipt, true), null);
  assert.equal(Campaign.settle(profile, { ...receipt, serial: 'stale' }, true), null);
});

test('run serials stay unique across failed retries and survive saves', () => {
  const profile = Campaign.createProfile({ unlocked: true });
  const offer = Campaign.offers(profile, 'power')[0];
  const first = Campaign.begin(profile, offer.id, 'power');
  assert.equal(first.serial, 'run-1');
  Campaign.settle(profile, first, false);
  const second = Campaign.begin(profile, Campaign.offers(profile, 'power')[0].id, 'power');
  assert.equal(second.serial, 'run-2');
  const loaded = Campaign.createProfile(Campaign.serialize(profile));
  Campaign.abandon(loaded, second);
  const third = Campaign.begin(loaded, Campaign.offers(loaded, 'power')[0].id, 'power');
  assert.equal(third.serial, 'run-3');
});

test('rank unlock is global and route alert rises while other routes cool', () => {
  const profile = Campaign.createProfile({ unlocked: true });
  const first = Campaign.offers(profile, 'power')[0];
  const receipt = Campaign.begin(profile, first.id, 'power');
  Campaign.settle(profile, receipt, true);
  const next = Campaign.offers(profile, 'power');
  assert.deepEqual(next.map(offer => offer.rank), [2n, 1n, 1n]);
  assert.equal(new Set(next.map(offer => offer.id)).size, 3);
  const same = next.find(offer => offer.routeKey === first.routeKey);
  assert.equal(same.alert, 1);
  assert.equal(same.reward, first.reward);
  const otherKey = Object.keys(profile.routeAlerts).find(key => key.startsWith('medical:'));
  profile.routeAlerts[otherKey] = 3;
  const second = Campaign.begin(profile, same.id, 'power');
  Campaign.settle(profile, second, true);
  assert.equal(profile.routeAlerts[first.routeKey], 2);
  assert.equal(profile.routeAlerts[otherKey], 2);
});

test('facilities unlock at ranks three and five and central facilities have four floors', () => {
  const profile = Campaign.createProfile({ unlocked: true });
  profile.highestClearance = 4n;
  const offers = Campaign.offers(profile, 'power');
  assert.ok(offers.some(offer => offer.facilityId === 'control'));
  assert.deepEqual(offers.map(offer => offer.rank), [5n, 4n, 3n]);
  const control = offers.find(offer => offer.facilityId === 'control');
  assert.equal(control.floors, 4);
  const replay = Campaign.offers(profile, 'power', 1n);
  assert.equal(replay.length, 3);
  assert.ok(replay.every(offer => offer.rank === 1n && offer.facilityId === 'substation'));
  assert.deepEqual(Campaign.offers(profile, 'power', 6n), []);
  assert.ok(Campaign.begin(profile, replay[0].id, 'power', 1n));
});

test('payouts and prices remain exact beyond Number-safe ranks', () => {
  assert.equal(Campaign.rewardForRank(1n), 1200n);
  assert.equal(Campaign.rewardForRank(2n), 1800n);
  assert.equal(Campaign.rewardForRank(3n), 2700n);
  const profile = Campaign.createProfile({ cash: '1000000000000000000000000000000', completedJobs: '1', unlocked: true });
  profile.highestClearance = 100n;
  const offer = Campaign.offers(profile, 'logistics')[0];
  assert.equal(offer.rank, 101n);
  assert.equal(offer.reward, Campaign.rewardForRank(101n));
  const initial = Campaign.quote(profile, 'gear', 'arc_coil');
  Campaign.purchase(profile, 'gear', 'arc_coil');
  assert.equal(Campaign.quote(profile, 'gear', 'arc_coil'), 1200n);
});

test('team purchases, equipment, mods, and combat config persist', () => {
  const profile = Campaign.createProfile({ cash: '10000', completedJobs: '1', unlocked: true });
  assert.equal(Campaign.quote(profile, 'recruit', 'lineman'), 1800n);
  assert.ok(Campaign.purchase(profile, 'recruit', 'lineman'));
  assert.ok(Campaign.purchase(profile, 'gear', 'arc_coil'));
  assert.ok(Campaign.purchase(profile, 'gear', 'impact_shell'));
  assert.equal(Campaign.equip(profile, 'lineman', 'arc_coil'), true);
  assert.equal(Campaign.equip(profile, 'lineman', 'impact_shell'), true);
  assert.ok(Campaign.purchase(profile, 'mod', 'lineman'));
  const config = Campaign.combatConfig(profile, 'lineman', Campaign.offers(profile, 'power')[0]);
  assert.equal(config.weaponPerk, 'chain');
  assert.equal(config.armorPerk, 'armor');
  assert.equal(config.modRank, 1n);
  const saved = Campaign.serialize(profile);
  assert.equal(typeof saved.cash, 'string');
  assert.equal(typeof saved.modRanks.lineman, 'string');
  const loaded = Campaign.createProfile(saved);
  assert.deepEqual(Campaign.serialize(loaded), saved);
});

test('malformed saves are normalized and failed runs do not pay', () => {
  const profile = Campaign.createProfile({ cash: 'not-a-number', unlocked: true, team: { members: ['unknown'] }, routeAlerts: { 'power:substation:service': 99 } });
  assert.equal(profile.cash, 0n);
  assert.deepEqual(profile.team.members, ['runner', 'samurai', 'summoner']);
  assert.equal(profile.routeAlerts['power:substation:service'], 3);
  const offer = Campaign.offers(profile, 'medical')[0];
  const receipt = Campaign.begin(profile, offer.id, 'medical');
  assert.deepEqual(Campaign.settle(profile, receipt, false), { reward: 0n, unlocked: false });
  assert.equal(profile.cash, 0n);
  assert.equal(Campaign.offers(profile, 'medical')[0].rank, 1n);
});
