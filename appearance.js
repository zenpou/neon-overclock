(function (root) {
  'use strict';

  // A single visual vocabulary for the protagonist. Gameplay owns the list of
  // acquired upgrade ids; this module turns that list into renderable layers.
  const FAMILIES = Object.freeze([
    Object.freeze({ id: 'lightning', label: 'ARC CIRCUIT', labelJa: 'アーク回路', color: '#5af6f3', slot: 0 }),
    Object.freeze({ id: 'heat', label: 'THERMAL CORE', labelJa: '熱量装甲', color: '#ff9a4d', slot: 1 }),
    Object.freeze({ id: 'drone', label: 'DRONE LINK', labelJa: 'ドローン接続', color: '#b873ff', slot: 2 }),
    Object.freeze({ id: 'virus', label: 'VIRUS BLOOM', labelJa: 'ウイルス発芽', color: '#9cff68', slot: 3 }),
    Object.freeze({ id: 'armor', label: 'PHASE ARMOR', labelJa: '位相装甲', color: '#9fcfff', slot: 4 }),
    Object.freeze({ id: 'mobility', label: 'EDGE DRIVE', labelJa: 'エッジ駆動', color: '#ff5ca8', slot: 5 })
  ]);

  const BODIES = Object.freeze({
    runner: Object.freeze({ name: 'runner', label: 'ARC RUNNER', role: '電撃連鎖／高速戦', color: '#5af6f3', portrait: 'assets/characters/runner.png', actorCell: 0 }),
    samurai: Object.freeze({ name: 'samurai', label: 'HEAT SAMURAI', role: '灼熱斬撃／近接戦', color: '#ff5ca8', portrait: 'assets/characters/samurai.png', actorCell: 1 }),
    summoner: Object.freeze({ name: 'summoner', label: 'GHOST ENGINEER', role: 'ドローン制圧／支援戦', color: '#b873ff', portrait: 'assets/characters/summoner.png', actorCell: 2 }),
    lineman: Object.freeze({ name: 'lineman', label: 'LIVEWIRE TECH', role: 'ワイヤー／足止め', color: '#91ffc4', actorCell: 6 })
  });

  const ACTOR_CELLS = Object.freeze({ runner: 0, samurai: 1, summoner: 2, rush: 3, shooter: 4, tank: 5, elite: 6, boss: 7, drone: 8 });

  // Every gameplay upgrade belongs to exactly one visual family. General
  // upgrades intentionally have a visible direction so no card feels cosmetic.
  const UPGRADE_FAMILY = Object.freeze({
    chain_core: 'lightning', chain_surge: 'lightning', void_lens: 'lightning',
    overclock: 'heat', thermal_amplifier: 'heat', coolant_loop: 'heat', molten_core: 'heat', overcharge_battery: 'heat',
    drone_fabricator: 'drone', drone_laser: 'drone', drone_link: 'drone', magnet: 'drone',
    virus_seed: 'virus', spread_protocol: 'virus',
    phase_shield: 'armor', nanobots: 'armor', backup_heart: 'armor',
    dash_reactor: 'mobility', blade_matrix: 'mobility'
  });

  const STAGES = Object.freeze([
    Object.freeze({ stage: 0, label: '初期接続', labelEn: 'BASE BODY' }),
    Object.freeze({ stage: 1, label: '一次改造', labelEn: 'AUGMENTED' }),
    Object.freeze({ stage: 2, label: '多重改造', labelEn: 'OVERWIRED' }),
    Object.freeze({ stage: 3, label: '完全オーバークロック', labelEn: 'FULL OVERCLOCK' })
  ]);

  const BODY_BIAS = Object.freeze({ runner: 'lightning', samurai: 'heat', summoner: 'drone', lineman: 'mobility' });
  const FAMILY_BY_ID = Object.freeze(FAMILIES.reduce((out, family) => { out[family.id] = family; return out; }, {}));
  const KNOWN_UPGRADES = Object.freeze(Object.keys(UPGRADE_FAMILY));

  function normalizeLoadout(loadout) {
    return Object.prototype.hasOwnProperty.call(BODIES, loadout) ? loadout : 'runner';
  }

  function tierForCount(count) {
    return count >= 3 ? 3 : count >= 2 ? 2 : 1;
  }

  function stageForTotal(total) {
    return total >= 5 ? 3 : total >= 3 ? 2 : total >= 1 ? 1 : 0;
  }

  function resolve(loadout, upgrades) {
    const bodyId = normalizeLoadout(loadout);
    const counts = FAMILIES.reduce((out, family) => { out[family.id] = 0; return out; }, {});
    let total = 0;
    if (Array.isArray(upgrades)) {
      for (const id of upgrades) {
        const familyId = typeof id === 'string' ? UPGRADE_FAMILY[id] : undefined;
        if (!familyId) continue;
        counts[familyId] += 1;
        total += 1;
      }
    }

    const stage = stageForTotal(total);
    const activeFamilies = FAMILIES
      .filter((family) => counts[family.id] > 0)
      .map((family) => Object.freeze({
        id: family.id,
        label: family.label,
        labelJa: family.labelJa,
        color: family.color,
        count: counts[family.id],
        tier: tierForCount(counts[family.id]),
        slot: family.slot
      }));

    let dominant = null;
    if (activeFamilies.length) {
      const maximum = Math.max(...activeFamilies.map((family) => family.count));
      const tied = activeFamilies.filter((family) => family.count === maximum);
      dominant = tied.find((family) => family.id === BODY_BIAS[bodyId])?.id || tied[0].id;
    }

    const stageInfo = STAGES[stage];
    const body = BODIES[bodyId];
    const signature = [
      bodyId,
      `s${stage}`,
      activeFamilies.map((family) => `${family.slot}:${family.count}`).join(','),
      dominant || 'none'
    ].join('|');

    return Object.freeze({
      loadout: bodyId,
      body,
      total,
      stage,
      stageLabel: stageInfo.label,
      stageLabelEn: stageInfo.labelEn,
      dominant,
      families: Object.freeze(activeFamilies),
      signature
    });
  }

  const NeonAppearance = Object.freeze({
    FAMILIES,
    BODIES,
    ACTOR_CELLS,
    UPGRADE_FAMILY,
    KNOWN_UPGRADES,
    STAGES,
    resolve
  });

  root.NeonAppearance = NeonAppearance;
  if (typeof module !== 'undefined' && module.exports) module.exports = NeonAppearance;
})(typeof globalThis !== 'undefined' ? globalThis : this);
