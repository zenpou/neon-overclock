(function (root) {
  'use strict';

  const WORLD_W = 1600;
  const WORLD_H = 1000;
  const PLAY_MIN_X = 100;
  const PLAY_MAX_X = WORLD_W - 100;
  const PLAY_MIN_Y = 145;
  const PLAY_MAX_Y = WORLD_H - 145;
  const TAU = Math.PI * 2;
  const PLAYER_R = 18;
  // CERBERUS tuning. Measured end-game output against a single target spans roughly
  // 2,200 to 245,000 damage per second across builds, so neither a fixed HP pool nor
  // a multiplier-based one gives a fight: HP sets how long the weakest build needs,
  // and adaptive armor sets how fast the strongest build is allowed to go.
  //   hp / fullRate  -> damage up to hp * fullRate per second lands in full (weak builds: ~1 / fullRate seconds)
  //   maxRate        -> hard ceiling per second (strong builds: ~1 / maxRate seconds)
  //   excess         -> share of damage above the full-rate allowance that still lands
  //   burst          -> seconds of allowance the armor can bank (the opening hit)
  const BOSS_TUNING = { hp: 48000, fullRate: 1 / 30, maxRate: 1 / 15, excess: 0.04, burst: 1 };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist2 = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };
  const distance = (a, b) => Math.sqrt(dist2(a, b));
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const segmentDistance2 = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1),0,1);
    return (p.x-a.x-t*dx)**2 + (p.y-a.y-t*dy)**2;
  };
  const norm = (x, y) => {
    const l = Math.hypot(x, y);
    return l > 0.0001 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  };

  const UPGRADE_DEFS = [
    { id: 'chain_core', name: 'アーク・リンク', tag: 'LIGHTNING', color: '#46e9ff', description: '攻撃が追加の敵へ +2連鎖（最大12）／連鎖威力 +0.22', apply: (s) => { s.chain = Math.min(12, s.chain + 2); s.chainDamage += 0.22; } },
    { id: 'chain_surge', name: 'チェイン・サージ', tag: 'LIGHTNING', color: '#00a6ff', description: '連鎖係数 +0.62、撃破時エネルギー +2（必殺撃破を除く）', apply: (s) => { s.chainDamage += 0.62; s.energyGain += 2; } },
    { id: 'virus_seed', name: 'ウイルス・シード', tag: 'VIRUS', color: '#b64dff', description: '感染を有効化。感染ダメージ +20／秒、ハック威力 +16', apply: (s) => { s.virus = true; s.virusDamage += 20; s.hackDamage += 16; } },
    { id: 'spread_protocol', name: 'スプレッド・プロトコル', tag: 'VIRUS', color: '#ff4df2', description: '感染拡散。ハック範囲 +65（最大420）、感染威力 +10', apply: (s) => { s.virusSpread = true; s.hackRadius += 65; s.virusDamage += 10; } },
    { id: 'overclock', name: 'オーバークロック', tag: 'HEAT', color: '#ffb32e', description: '射撃間隔 -22%（最短0.06秒）、斬撃 -20%（最短0.22秒）、発熱 +2', apply: (s) => { s.fireInterval = Math.max(0.06, s.fireInterval * 0.78); s.slashInterval = Math.max(0.22, s.slashInterval * 0.8); s.heatPerShot += 2; } },
    { id: 'thermal_amplifier', name: 'サーマル・アンプ', tag: 'HEAT', color: '#ff5d30', description: '熱量によるダメージ補正 +65ポイント', apply: (s) => { s.heatBonus += 0.65; } },
    { id: 'coolant_loop', name: 'クーラント・ループ', tag: 'HEAT', color: '#46d8ff', description: '冷却速度 +28、最大熱量 +22。連射を止めない', apply: (s) => { s.coolRate += 28; s.maxHeat += 22; } },
    { id: 'molten_core', name: 'マグマ・コア', tag: 'HEAT', color: '#ff713e', description: '最大熱量 +30、ダメージ倍率 ×1.30（最大3個）', maxStack: 3, apply: (s) => { s.maxHeat += 30; s.damageMult *= 1.3; } },
    { id: 'dash_reactor', name: 'ダッシュ・リアクター', tag: 'MOBILITY', color: '#53ffcf', description: 'ダッシュ待機 -0.30秒（最短0.28秒）、通過ダメージ +65', apply: (s) => { s.dashCooldown = Math.max(0.28, s.dashCooldown - 0.3); s.dashDamage += 65; } },
    { id: 'phase_shield', name: 'フェイズ・シールド', tag: 'SURVIVE', color: '#79a7ff', description: '被弾を2回無効化するシールドを追加。装甲共鳴Lv2以上では、取得数×2まで6秒ごとに1回再生', apply: (s) => { s.shield += 2; s.phaseShieldCapacity = (s.phaseShieldCapacity || 0) + 2; } },
    { id: 'nanobots', name: 'ナノ・リペア', tag: 'SURVIVE', color: '#77ff9c', description: '敵を倒すたびHPを1.85回復。連鎖キルは2倍', apply: (s) => { s.healOnKill += 1.85; } },
    { id: 'drone_fabricator', name: 'ドローン工場', tag: 'DRONE', color: '#c37aff', description: '追従ドローン +2（最大12）。上限超過分は1体ごと火力 +4', apply: (s) => { const room = Math.max(0, 12 - s.droneCount); const added = Math.min(2, room); s.droneCount += added; s.droneOverflow += 2 - added; s.droneDamage += 6 + s.droneOverflow * 4; } },
    { id: 'drone_laser', name: 'ドローン・レーザー', tag: 'DRONE', color: '#f05dff', description: 'ドローン攻撃力 +24、レーザー貫通 +1（最大5）', apply: (s) => { s.droneDamage += 24; s.dronePierce = Math.min(5, s.dronePierce + 1); } },
    { id: 'drone_link', name: 'リンク・ファーム', tag: 'DRONE', color: '#8f77ff', description: 'ドローン射撃間隔 ×0.68（最短0.18秒）、機数×5の攻撃力を追加', apply: (s) => { s.droneInterval = Math.max(0.18, s.droneInterval * 0.68); s.droneDamage += Math.max(8, s.droneCount * 5); } },
    { id: 'blade_matrix', name: 'ブレード・マトリクス', tag: 'BLADE', color: '#ff5c9c', description: '斬撃範囲 +55（最大420）／ダッシュ範囲 +55（最大260）、ダメージ +50', apply: (s) => { s.slashRadius += 55; s.slashDamage += 50; s.dashRadius += 55; s.dashDamage += 50; } },
    { id: 'void_lens', name: 'ヴォイド・レンズ', tag: 'GENERAL', color: '#f7edff', description: 'すべてのダメージ倍率 ×1.60。撃破スコア +15%（最大3個）', maxStack: 3, apply: (s) => { s.damageMult *= 1.6; s.scoreMult += 0.15; } },
    { id: 'magnet', name: 'マグネット・コア', tag: 'GENERAL', color: '#ffde5a', description: 'ピックアップ吸引範囲 +160（最大420）、エネルギー獲得 ×1.35', apply: (s) => { s.pickupRadius += 160; s.energyGain *= 1.35; } },
    { id: 'overcharge_battery', name: 'オーバーチャージ', tag: 'ULTIMATE', color: '#fff05a', description: '必殺技の必要エネルギー -15（最低60）、必殺威力補正 +0.8', apply: (s) => { s.maxEnergy = Math.max(60, s.maxEnergy - 15); s.ultimateMult += 0.8; } },
    { id: 'backup_heart', name: 'バックアップ・ハート', tag: 'SURVIVE', color: '#ff5d7f', description: '最大HP +55。取得時にHPを全回復', apply: (s, e) => { s.maxHp += 55; e.player.maxHp = s.maxHp; e.player.hp = s.maxHp; } }
  ];

  // Hardware family of every upgrade. appearance.js keeps the same table for the body
  // visuals; a test ties the two together so a card's look and its family never drift.
  // A part can be installed this many times unless it sets its own maxStack. Without a
  // cap the two global multipliers compounded to ×159 in measured runs and every build
  // converged on stacking them.
  const MAX_STACK = 5;
  // Difficulty knobs measured with three simulated skill levels (artifacts/route-sim.cjs).
  //   firstFloorDamage: the opening floor hits softer, so a new player reaches the first route choice.
  //   threatHp / threatDamage: every sector a run clears raises its threat by one, and each point of
  //   threat makes all later enemies (and the boss's attacks) tougher. Growing a build through
  //   sectors therefore costs safety; resting keeps the tower calm.
  const DIFFICULTY = { firstFloorDamage: 0.55, threatHp: 0.12, threatDamage: 0.18 };
  const ENTRY_POINTS = { west: [230, 500], east: [1370, 500], north: [800, 235], south: [800, 765] };
  const ENEMY_TYPES = ['rush', 'shooter', 'tank', 'elite'];
  const ENEMY_AFFINITIES = Object.freeze({
    signal: { id: 'signal', label: 'ハック・雷撃・感染', short: '電脳', glyph: 'ϟ', color: '#62f0ff', weak: ['hack', 'chain', 'virus'], resist: ['shot', 'drone'], resistLabel: '射撃・ドローン' },
    close: { id: 'close', label: '斬撃・ダッシュ・ワイヤー', short: '近接', glyph: '╱', color: '#ffb27a', weak: ['slash', 'dash', 'wire'], resist: ['hack', 'chain', 'virus'], resistLabel: 'ハック・雷撃・感染' },
    ranged: { id: 'ranged', label: '射撃・ドローン', short: '射撃', glyph: '⊕', color: '#d5ff8f', weak: ['shot', 'drone'], resist: ['slash', 'dash', 'wire'], resistLabel: '斬撃・ダッシュ・ワイヤー' },
    heat: { id: 'heat', label: '炎上・熱波・BLACKOUT', short: '熱', glyph: '♨', color: '#ff9fbd', weak: ['heat', 'ultimate'], resist: ['shot', 'drone'], resistLabel: '射撃・ドローン' }
  });
  const RAID_ENEMIES = {
    power: {
      color: '#56daeb',
      rush: { variant: 'spark-scout', name: 'スパーク偵察機', affinity: 'ranged', speed: 142 },
      shooter: { variant: 'relay-sniper', name: 'リレー狙撃機', affinity: 'close', hp: 46, weapon: { range: 455, retreat: 290, windup: 0.62, cooldown: 1.48, speed: 515 } },
      tank: { variant: 'capacitor-tank', name: '蓄電装甲機', affinity: 'signal', hp: 148, speed: 35 },
      elite: { variant: 'arc-warden', name: 'アーク警備機', affinity: 'signal', weapon: { windup: 0.48, cooldown: 1.95, speed: 420 } },
      midboss: { variant: 'transformer', name: '変電重装機', affinity: 'signal', r: 44, hp: 530, speed: 61, damage: 24, pattern: 'ring' },
      command: { affinity: 'signal' }
    },
    logistics: {
      color: '#e6c66d',
      rush: { variant: 'belt-runner', name: 'ベルト追跡機', affinity: 'ranged', hp: 31, speed: 155 },
      shooter: { variant: 'marker-drone', name: '誘導ビーコン機', affinity: 'close', speed: 83, weapon: { range: 310, retreat: 220, windup: 0.4, cooldown: 1.08, speed: 325 } },
      tank: { variant: 'cargo-hauler', name: '装甲搬送車', affinity: 'signal', hp: 119, speed: 60 },
      elite: { variant: 'pursuit-unit', name: '高速追撃機', affinity: 'ranged', hp: 157, speed: 106, weapon: { spread: 0, windup: 0.4, cooldown: 1.48, speed: 385 } },
      midboss: { variant: 'freight-breaker', name: '貨物破砕車', affinity: 'close', r: 43, hp: 495, speed: 80, damage: 25, pattern: 'charge' },
      command: { affinity: 'ranged' }
    },
    medical: {
      color: '#d39cff',
      rush: { variant: 'suture-probe', name: '縫合プローブ', affinity: 'ranged', hp: 39, speed: 116 },
      shooter: { variant: 'dose-turret', name: '注入タレット', affinity: 'close', hp: 53, speed: 52, weapon: { spread: 0.13, windup: 0.55, cooldown: 1.72, speed: 278 } },
      tank: { variant: 'graft-shell', name: 'グラフト装甲機', affinity: 'heat', hp: 153, speed: 38 },
      elite: { variant: 'quarantine-unit', name: '隔離部隊機', affinity: 'signal', hp: 169, weapon: { windup: 0.5, cooldown: 1.8, speed: 300 } },
      midboss: { variant: 'graft-curator', name: '義体保全機', affinity: 'heat', r: 46, hp: 575, speed: 58, damage: 26, pattern: 'pulse' },
      command: { affinity: 'heat' }
    }
  };

  // Each equipment/body grade contributes half a contract rank. Subtract before
  // converting to Number so equal ranks still match at arbitrarily large values.
  function rankMultiplier(equipment, body, rank) {
    const delta = equipment + body - 2n * (rank - 1n);
    return 1.2 ** (Number(delta < -160n ? -160n : delta > 160n ? 160n : delta) / 2);
  }
  const UPGRADE_FAMILY = {
    chain_core: 'lightning', chain_surge: 'lightning', void_lens: 'lightning',
    overclock: 'heat', thermal_amplifier: 'heat', coolant_loop: 'heat', molten_core: 'heat', overcharge_battery: 'heat',
    drone_fabricator: 'drone', drone_laser: 'drone', drone_link: 'drone', magnet: 'drone',
    virus_seed: 'virus', spread_protocol: 'virus',
    phase_shield: 'armor', nanobots: 'armor', backup_heart: 'armor',
    dash_reactor: 'mobility', blade_matrix: 'mobility'
  };
  const FAMILIES = {
    lightning: { label: '雷撃', color: '#46e9ff' }, heat: { label: '熱', color: '#ff713e' }, drone: { label: 'ドローン', color: '#c37aff' },
    virus: { label: '感染', color: '#b64dff' }, armor: { label: '装甲', color: '#79a7ff' }, mobility: { label: '機動', color: '#53ffcf' }
  };

  // Resonance is the pay-off for the route a run takes: clearing a sector raises the
  // resonance of that sector's family by one level (max 3). Levels are cumulative.
  // Only one-off grants touch the stats; every multiplier is read where it is used,
  // so upgrade previews stay honest.
  const RESONANCE = {
    lightning: { name: '雷撃共鳴', levels: ['連鎖 +2、連鎖係数 +1.0', '倒した敵から連鎖放電が走る', '連鎖の到達距離 ×1.6、威力 ×2'], grant: [(st) => { st.chain = Math.min(12, st.chain + 2); st.chainDamage += 1; }] },
    heat: { name: '熱共鳴', levels: ['射撃・斬撃が敵を3秒間炎上させる（毎秒、命中ダメージの80%）', '炎上中の敵は倒れると爆発して周囲に燃え移る。オーバーヒートは熱波になり即座に半分まで冷却', '射撃・斬撃の間隔 ×0.7、炎上ダメージ ×2'], grant: [] },
    drone: { name: 'ドローン共鳴', levels: ['ドローン +1、ドローン威力 ×1.3', 'ドローン弾が着弾時に爆発する', 'ドローン射撃間隔 ×0.7'], grant: [(st) => { st.droneCount = Math.min(12, st.droneCount + 1); }] },
    virus: { name: '感染共鳴', levels: ['感染を解放。すべての攻撃が感染を付与し、感染ダメージ ×3', '感染した敵は倒れると爆発し、感染を広げる', '感染中の敵への全ダメージ +40%'], grant: [(st) => { st.virus = true; }] },
    armor: { name: '装甲共鳴', levels: ['被ダメージ -30%。帯電装甲が半径130以内の敵を焼く（毎秒、最大HPの80%）', '残りが上限未満なら、被弾無効シールドが6秒ごとに1枚再生（フェイズ・シールド取得数×2、未取得時は1枚）', 'シールド再生の上限を維持したまま、毎秒最大HPの2%を再生'], grant: [] },
    mobility: { name: '機動共鳴', levels: ['ダッシュ通過ダメージ ×4', 'ダッシュで敵を倒すと待機をリセットし、2秒間 全ダメージ +35%', 'ダッシュ距離 +70、通過ダメージさらに ×2'], grant: [] }
  };

  // Routes. 'rest' has no downside and one is always offered. 'deal' is a permanent
  // trade. 'sector' rewrites the next floor (enemy mix, pressure, loot) and raises a
  // resonance when cleared. 'boss' routes are offered only before the final floor,
  // where enemy mix, quota and vaults do not exist.
  const ROUTES = [
    { id: 'normal', kind: 'rest', name: '標準ルート', tag: 'SAFE PASSAGE', symbol: '↗', color: '#5af6f3', description: '小休止。HPを18回復し、次のフロアへ', apply: (e, s) => { e.player.hp = Math.min(e.player.maxHp, e.player.hp + 18); } },
    { id: 'salvage', kind: 'rest', name: 'サルベージ・デッキ', tag: 'RECOVERY', symbol: '⌘', color: '#77ff9c', description: '回収した医療セルでHPを35回復し、熱を冷却', apply: (e, s) => { e.player.hp = Math.min(e.player.maxHp, e.player.hp + 35); e.player.heat = 0; e.player.overheated = false; } },
    { id: 'clinic', kind: 'deal', name: '闇医者クリニック', tag: 'BODY MODIFICATION', symbol: '✚', color: '#ffac57', description: '最大HP -12と引き換えにダメージ +32%', apply: (e, s) => { e.player.maxHp = Math.max(60, e.player.maxHp - 12); e.player.hp = Math.min(e.player.maxHp, e.player.hp + 12); s.damageMult += 0.32; } },
    { id: 'contract', kind: 'deal', name: '企業との契約', tag: 'HIGH RISK / HIGH REWARD', symbol: 'ϟ', color: '#ff4e8b', description: '敵の速度 +18%。代わりにダメージ +42%、スコア +50%', apply: (e, s) => { s.enemySpeedMult = Math.min(1.55, s.enemySpeedMult + 0.18); s.damageMult += 0.42; s.scoreMult += 0.5; } },
    { id: 'blackmarket', kind: 'deal', name: '闇市', tag: 'BLACK MARKET', symbol: '◆', color: '#eaff63', description: '現在HPの30%を支払う。次の層の宝箱は1段階上のレア度で出る', apply: (e, s) => { e.player.hp = Math.max(1, e.player.hp * 0.7); }, sector: { label: '闇市の横流し品', chestTierUp: true } },
    { id: 'bounty', kind: 'deal', name: '指名手配', tag: 'WANTED / THREAT +5', symbol: '☢', color: '#ff375f', description: '企業に名前を売る。脅威度 +5（以後の敵のHP +60%・攻撃力 +90%）。見返りはスコア倍率 +2 だけ。何度でも重ねられる。腕に覚えがある者向け', apply: (e, s) => { e.threat += 5; s.scoreMult += 2; } },
    { id: 'arc_grid', kind: 'sector', name: '送電区画', tag: 'SECTOR / LIGHTNING', symbol: 'ϟ', color: '#46e9ff', description: '射撃型が密集する送電網。まとめて焼き払える。',
      sector: { label: '送電区画', threat: 1, focus: 'lightning', weights: { rush: 0.15, shooter: 0.75, tank: 0.1 }, hpMult: 0.85, concurrentAdd: 3 }, effects: ['敵：射撃型が主体、HP -15%、同時出現 +3'] },
    { id: 'foundry', kind: 'sector', name: '溶鉱区画', tag: 'SECTOR / HEAT', symbol: '♨', color: '#ff713e', description: '重装が守る炉心。熱が逃げない。',
      sector: { label: '溶鉱区画', threat: 1, focus: 'heat', weights: { rush: 0.3, shooter: 0.25, tank: 0.45 }, coolRateMult: 0.65, extraChest: 'epic' }, effects: ['敵：重装が多い', '環境：冷却速度 -35%', '報酬：Epic宝箱 +1'] },
    { id: 'hangar', kind: 'sector', name: 'ドローン格納庫', tag: 'SECTOR / DRONE', symbol: '⌘', color: '#c37aff', description: '突撃型の群れが押し寄せる。数で応戦しろ。',
      sector: { label: 'ドローン格納庫', threat: 1, focus: 'drone', weights: { rush: 0.8, shooter: 0.2 }, hpMult: 0.7, quotaMult: 1.3, concurrentAdd: 4 }, effects: ['敵：突撃型の群れ、HP -30%、撃破ノルマ +30%、同時出現 +4'] },
    { id: 'quarantine', kind: 'sector', name: '隔離病棟', tag: 'SECTOR / VIRUS', symbol: '⌬', color: '#b64dff', description: '硬く鈍い被検体。じわじわ蝕め。',
      sector: { label: '隔離病棟', threat: 1, focus: 'virus', hpMult: 1.4, speedMult: 0.85, hackCooldownMult: 0.5 }, effects: ['敵：HP +40%、速度 -15%', '環境：ハック待機 半減'] },
    { id: 'bunker', kind: 'sector', name: '装甲保管庫', tag: 'SECTOR / ARMOR', symbol: '✚', color: '#79a7ff', description: '精鋭が詰める保管庫。一撃が重い。',
      sector: { label: '装甲保管庫', threat: 1, focus: 'armor', weights: { rush: 0.45, shooter: 0.3, tank: 0.15, elite: 0.1 }, damageMult: 1.15, clearMaxHp: 30 }, effects: ['敵：精鋭が混ざる、攻撃力 +15%', '報酬：制圧で最大HP +30'] },
    { id: 'speedway', kind: 'sector', name: '高速搬送路', tag: 'SECTOR / MOBILITY', symbol: '↗', color: '#53ffcf', description: '全てが速い。止まれば轢かれる。',
      sector: { label: '高速搬送路', threat: 1, focus: 'mobility', hpMult: 0.9, speedMult: 1.25, dashCooldownMult: 0.6 }, effects: ['敵：速度 +25%、HP -10%', '環境：ダッシュ待機 -40%'] },
    { id: 'kill_zone', kind: 'sector', name: '処刑場', tag: 'SECTOR / KILL ZONE', symbol: '☠', color: '#ff375f', description: '精鋭だらけの処刑場。共鳴は得られないが、見返りは大きい。',
      sector: { label: '処刑場', threat: 1, weights: { rush: 0.2, shooter: 0.25, tank: 0.15, elite: 0.4 }, quotaMult: 0.7, extraChest: 'legendary' }, effects: ['敵：精鋭 40%、撃破ノルマ -30%', '報酬：Legendary宝箱 +1'] },
    { id: 'armory', kind: 'boss', name: '武器庫', tag: 'BOSS PREP', symbol: '✳', color: '#fff05a', description: '被弾無効シールド +2（再生上限には加算されない）。BLACKOUT を充填した状態でボス戦を始める', apply: (e, s) => { s.shield += 2; e.player.energy = e.player.maxEnergy; } },
    { id: 'weakpoint', kind: 'boss', name: '弱点解析', tag: 'BOSS PREP', symbol: '◎', color: '#ff7fbd', description: '最大HP -20。CERBERUS の適応装甲が通す火力 +50%', apply: (e, s) => { e.player.maxHp = Math.max(60, e.player.maxHp - 20); e.player.hp = Math.min(e.player.maxHp, e.player.hp); e._bossArmorBoost = 1.5; } }
  ];

  class NeonEngine {
    constructor(opts) {
      opts = opts || {};
      this.onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : function () {};
      this.random = typeof opts.random === 'function' ? opts.random : Math.random;
      this.world = { width: WORLD_W, height: WORLD_H };
      this.events = [];
      this.eventSeq = 0;
      this._resetPublic();
    }

    _resetPublic() {
      this._held = { dash: false, hack: false, ultimate: false };
      this.events = [];
      this.eventSeq = 0;
      this.state = 'title';
      this.loadout = 'runner';
      this.contract = null;
      this.finalFloor = 8;
      this.attackScale = 1;
      this.incomingScale = 1;
      this.wire = null;
      this.floor = 1;
      this.floorKills = 0;
      this.floorQuota = 0;
      this.floorElapsed = 0;
      this.floorDuration = 42;
      this.elapsed = 0;
      this.kills = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.score = 0;
      this.wave = 0;
      this.routeOptions = [];
      this.offeredUpgrades = [];
      this.upgrades = [];
      this.sector = null;
      this._pendingSector = null;
      this.sectorHistory = [];
      this.resonance = { lightning: 0, heat: 0, drone: 0, virus: 0, armor: 0, mobility: 0 };
      this.damageDealt = {};
      this.threat = 0;
      this._bossArmorBoost = 1;
      this.enemies = [];
      this.bullets = [];
      this.pickups = [];
      this.chests = [];
      this.chestReward = null;
      this.drones = [];
      this.build = { label: '未接続', role: '', colors: ['#46e9ff', '#ff4df2'], upgrades: [], stats: {} };
      this.player = this._newPlayer();
      this._stats = this._newStats();
      this._enemyId = 0;
      this._bulletId = 0;
      this._chestId = 0;
      this._floorChestFlags = { early: false, late: false };
      this._floorChestDrops = 0;
      this._floorChestCount = 0;
      this._spawnCooldown = 0;
      this._floorCompleteSent = false;
      this._boss = null;
      this._midbossSpawned = false;
      this._lastWeakPoint = -Infinity;
      this.beginnerGrace = 4;
    }

    _newPlayer() {
      return { x: WORLD_W / 2, y: WORLD_H / 2, hp: 180, maxHp: 180, heat: 0, overheated: false, energy: 0, maxEnergy: 100, dashCooldown: 0, hackCooldown: 0, invuln: 2.5, angle: 0, fireCooldown: 0, slashCooldown: 0, droneCooldown: 0, shield: 0, surge: 0 };
    }

    _newStats() {
      return {
        damage: 18, damageMult: 1, maxHp: 180, fireInterval: 0.27, bulletSpeed: 820, heatPerShot: 7,
        maxHeat: 100, coolRate: 16, heatBonus: 0.35, chain: 0, chainDamage: 0.9, virus: false, virusDamage: 8, virusSpread: false,
        hackRadius: 230, hackDamage: 34, moveSpeed: 300, dashCooldown: 0.9, dashDistance: 190, dashDamage: 30, dashRadius: 65,
        slashRadius: 150, slashDamage: 34, slashInterval: 0.7, droneCount: 0, droneDamage: 12, droneInterval: 1.0, dronePierce: 0,
        shield: 0, phaseShieldCapacity: 0, healOnKill: 0.1, pickupRadius: 90, energyGain: 8, maxEnergy: 100, ultimateMult: 1, scoreMult: 1, luck: 0,
        enemySpeedMult: 1, bossDamageMult: 1, armor: 0.1, regen: 0.35, droneOverflow: 0
      };
    }

    start(loadout, contract = null) {
      this._resetPublic();
      this.contract = contract;
      this.finalFloor = contract?.floors || 8;
      this.loadout = loadout === 'samurai' || loadout === 'summoner' || (contract && loadout === 'lineman') ? loadout : 'runner';
      this.state = 'playing';
      this._configureLoadout(this.loadout);
      if (contract) this._configureContract(contract);
      this._syncBuild();
      this._beginFloor(1);
      this._emit('start', { loadout: this.loadout, x: this.player.x, y: this.player.y, color: this.build.colors[0] });
      return this;
    }

    _configureLoadout(loadout) {
      const s = this._stats;
      if (loadout === 'samurai') {
        this.build = { label: '灼熱サムライ', role: '近接／熱量', colors: ['#ff4d8e', '#ffba42'], upgrades: [], stats: {} };
        s.damage = 12; s.fireInterval = 999; s.heatPerShot = 15; s.moveSpeed = 300; s.slashRadius = 220; s.slashDamage = 52; s.slashInterval = 0.62;
      } else if (loadout === 'summoner') {
        this.build = { label: 'ドローン司令官', role: '召喚／制圧', colors: ['#be6cff', '#48ffc2'], upgrades: [], stats: {} };
        s.damage = 15; s.fireInterval = 0.4; s.moveSpeed = 265; s.droneCount = 3; s.droneDamage = 13; s.droneInterval = 0.82;
      } else if (loadout === 'lineman') {
        this.build = { label: 'LIVEWIRE TECH', role: 'ワイヤー／足止め', colors: ['#91ffc4', '#ffcf78'], upgrades: [], stats: {} };
        s.damage = 23; s.fireInterval = 0.32; s.hackRadius = 250; s.dashCooldown = 0.82;
      } else {
        this.build = { label: '雷撃ランナー', role: '速度／連鎖', colors: ['#46e9ff', '#ff4df2'], upgrades: [], stats: {} };
        s.damage = 18; s.fireInterval = 0.22; s.heatPerShot = 8; s.moveSpeed = 330; s.chain = 2; s.chainDamage = 0.9;
      }
      this.player.maxEnergy = s.maxEnergy;
      this.player.maxHp = s.maxHp || 180;
      this.player.hp = this.player.maxHp;
    }

    _configureContract(contract) {
      this.attackScale = rankMultiplier(contract.weaponRank, contract.modRank, contract.rank);
      this.incomingScale = 1 / rankMultiplier(contract.armorRank, contract.modRank, contract.rank);
      const s = this._stats;
      const [x, y] = ENTRY_POINTS[contract.entrance] || [WORLD_W / 2, WORLD_H / 2];
      this.player.x = x;
      this.player.y = y;
      if (contract.weaponPerk === 'chain') { s.chain += 1; s.hackDamage *= 1.1; }
      if (contract.weaponPerk === 'heat') s.heatBonus += 0.18;
      if (contract.armorPerk === 'cooling') s.coolRate *= 1.25;
      if (contract.modRank > 0n) {
        if (this.loadout === 'samurai') s.coolRate *= 1.18;
        else if (this.loadout === 'summoner') s.droneInterval *= 0.88;
        else s.dashCooldown *= 0.88;
      }
    }

    _normalizeStats(stats, player) {
      stats.chain = clamp(Math.round(stats.chain), 0, 12);
      stats.droneCount = clamp(Math.round(stats.droneCount), 0, 12);
      stats.dronePierce = clamp(Math.round(stats.dronePierce), 0, 5);
      stats.slashRadius = clamp(stats.slashRadius, 80, 420);
      stats.dashRadius = clamp(stats.dashRadius, 45, 260);
      stats.hackRadius = clamp(stats.hackRadius, 160, 420);
      stats.pickupRadius = clamp(stats.pickupRadius, 60, 420);
      stats.fireInterval = clamp(stats.fireInterval, 0.06, 999);
      stats.slashInterval = clamp(stats.slashInterval, 0.22, 999);
      player.maxEnergy = stats.maxEnergy;
      // HP is a player-facing value because route choices can trade it away.
      // Keep the internal stat in lockstep instead of restoring a previous max.
      stats.maxHp = player.maxHp;
      player.shield = stats.shield;
    }

    _syncBuild() {
      const s = this._stats;
      this._normalizeStats(s, this.player);
      this.build.upgrades = this.upgrades.slice();
      this.build.stats = {
        damage: Math.round(s.damage * s.damageMult), fireInterval: Number(s.fireInterval.toFixed(2)), chain: s.chain,
        heat: Math.round(s.maxHeat), drones: s.droneCount, slashRadius: Math.round(s.slashRadius),
        speed: Math.round(s.moveSpeed), energy: Math.round(s.maxEnergy), score: Math.round(s.scoreMult * 100) + '%',
        damageMultiplier: Number(s.damageMult.toFixed(2)), dronePierce: s.dronePierce
      };
    }

    _previewSnapshot(stats, player) {
      const samurai = this.loadout === 'samurai';
      const weaponLabel = samurai ? '斬撃' : '射撃';
      const fields = [
        { label: '斬撃の基礎威力', value: samurai ? stats.slashDamage : null, format: 'integer' },
        { label: '斬撃範囲', value: samurai ? stats.slashRadius : null, format: 'integer' },
        { label: `${weaponLabel}間隔`, value: samurai ? stats.slashInterval : stats.fireInterval, format: 'seconds' },
        { label: '総合ダメージ倍率', value: stats.damageMult, format: 'multiplier' },
        { label: '熱量補正の上限', value: 1 + stats.heatBonus, format: 'multiplier' },
        { label: '最大熱量', value: stats.maxHeat, format: 'integer' },
        { label: '1回の発熱', value: stats.heatPerShot, format: 'integer' },
        { label: '冷却速度', value: stats.coolRate, format: 'rate' },
        { label: 'ダッシュ待機', value: stats.dashCooldown, format: 'seconds' },
        { label: 'ダッシュの基礎威力', value: stats.dashDamage, format: 'integer' },
        { label: 'ダッシュ範囲', value: stats.dashRadius, format: 'integer' },
        { label: '連鎖数', value: stats.chain, format: 'integer' },
        { label: '連鎖係数', value: stats.chainDamage, format: 'multiplier' },
        { label: 'ハックの基礎威力', value: stats.hackDamage, format: 'integer' },
        { label: 'ハック範囲', value: stats.hackRadius, format: 'integer' },
        { label: '感染', value: stats.virus, format: 'boolean' },
        { label: '感染の基礎威力', value: stats.virus ? stats.virusDamage : null, format: 'rate' },
        { label: '感染拡散', value: stats.virusSpread, format: 'boolean' },
        { label: 'ドローン機数', value: stats.droneCount, format: 'integer' },
        { label: 'ドローンの基礎威力', value: stats.droneCount ? stats.droneDamage : null, format: 'integer' },
        { label: 'ドローン間隔', value: stats.droneInterval, format: 'seconds' },
        { label: 'ドローン貫通', value: stats.dronePierce, format: 'integer' },
        { label: '最大HP', value: player.maxHp, format: 'integer' },
        { label: '現在HP', value: Math.ceil(player.hp), format: 'integer' },
        { label: '被弾無効', value: player.shield, format: 'charges' },
        { label: '装甲共鳴Lv2時の再生上限', value: Math.max(1, stats.phaseShieldCapacity || 0), format: 'charges' },
        { label: '撃破回復', value: stats.healOnKill, format: 'hp' },
        { label: '吸引範囲', value: stats.pickupRadius, format: 'integer' },
        { label: '撃破エネルギー', value: stats.energyGain, format: 'energy' },
        { label: '必殺の必要エネルギー', value: stats.maxEnergy, format: 'integer' },
        { label: '必殺威力補正', value: stats.ultimateMult, format: 'multiplier' },
        { label: 'スコア倍率', value: stats.scoreMult, format: 'multiplier' }
      ];
      return fields;
    }

    _formatPreviewValue(value, format) {
      if (value === null) return '—';
      if (format === 'boolean') return value ? '有効' : '未解放';
      if (format === 'seconds') return `${value.toFixed(2)}秒`;
      if (format === 'multiplier') return `×${value.toFixed(2)}`;
      if (format === 'hp') return `${value.toFixed(2)} HP`;
      if (format === 'energy') return String(Number(value.toFixed(2)));
      if (format === 'rate') return `${value}/秒`;
      if (format === 'charges') return `${value}回`;
      return String(value);
    }

    _previewUpgradeNote(id, stats) {
      const notes = [];
      const dormant = {
        drone_laser: stats.droneCount <= 0 ? 'ドローン未所持のため、ドローン獲得後に有効です。' : '',
        drone_link: stats.droneCount <= 0 ? 'ドローン未所持のため、ドローン獲得後に有効です。' : '',
        spread_protocol: !stats.virus ? '感染未解放のため、ウイルス・シード取得後に有効です。' : '',
        chain_surge: stats.chain <= 0 ? '連鎖未解放のため、連鎖を持つ攻撃で有効です。' : ''
      }[id];
      if (dormant) notes.push(dormant);
      const caps = {
        chain_core: stats.chain >= 12 ? '連鎖数は上限12。以降は連鎖係数だけ伸びます。' : '',
        spread_protocol: stats.hackRadius >= 420 ? 'ハック範囲は上限420です。' : '',
        overclock: (this.loadout === 'samurai' ? stats.slashInterval <= 0.22 : stats.fireInterval <= 0.06) ? '攻撃間隔は下限です。' : '',
        dash_reactor: stats.dashCooldown <= 0.28 ? 'ダッシュ待機は下限0.28秒。以降は通過ダメージだけ伸びます。' : '',
        drone_fabricator: stats.droneCount >= 12 ? 'ドローン機数は上限12。超過分は火力に変換されます。' : '',
        drone_laser: stats.dronePierce >= 5 ? 'ドローン貫通は上限5。' : '',
        drone_link: stats.droneInterval <= 0.18 ? 'ドローン間隔は下限0.18秒。' : '',
        blade_matrix: stats.dashRadius >= 260 || (this.loadout === 'samurai' && stats.slashRadius >= 420) ? '上限に達した範囲は変化しません。' : '',
        magnet: stats.pickupRadius >= 420 ? '吸引範囲は上限420。' : '',
        overcharge_battery: stats.maxEnergy <= 60 ? '必殺必要量は下限60。' : ''
      }[id];
      if (caps) notes.push(caps);
      return notes.join(' ');
    }

    previewUpgrade(id) {
      const def = UPGRADE_DEFS.find((upgrade) => upgrade.id === id);
      if (!def) return null;
      const afterStats = { ...this._stats };
      const afterPlayer = { ...this.player };
      def.apply(afterStats, { player: afterPlayer });
      this._normalizeStats(afterStats, afterPlayer);
      const before = this._previewSnapshot(this._stats, this.player);
      const after = this._previewSnapshot(afterStats, afterPlayer);
      const changes = [];
      before.forEach(({ label, value, format }, index) => {
        const current = this._formatPreviewValue(value, format);
        const installed = this._formatPreviewValue(after[index].value, format);
        if (current !== installed) changes.push({ label, before: current, after: installed });
      });
      return { changes, note: this._previewUpgradeNote(id, this._stats) };
    }

    _beginFloor(floor) {
      this.floor = floor;
      // The modifier chosen on the route screen applies to exactly this floor.
      const bossFloor = floor >= this.finalFloor;
      this.sector = bossFloor ? null : this._pendingSector || null;
      this._pendingSector = null;
      this.floorElapsed = 0;
      this.floorKills = 0;
      // The quota grows from a busy opening pack to a crowded late-floor fight.
      // It is a hard total kill budget: replenishing waves never exceed it.
      const baseQuota = this.contract ? 28 + floor * 10 : 50 + floor * 10;
      this.floorQuota = bossFloor ? 1 : Math.round(baseQuota * (this.sector?.quotaMult || 1));
      this.floorDuration = bossFloor ? 180 : 40 + floor * 3;
      this.wave = 0;
      this.enemies.length = 0;
      this.bullets.length = 0;
      this.chests.length = 0;
      this.chestReward = null;
      this._floorChestFlags = { early: false, late: false, extra: false };
      this._floorChestDrops = 0;
      this._floorChestCount = 0;
      this._spawnCooldown = 0.2;
      this._floorCompleteSent = false;
      this._boss = null;
      this._midbossSpawned = false;
      this.wire = null;
      if (bossFloor) {
        this._spawnBoss();
      } else {
        this._spawnWave();
      }
      this._emit('floor', { floor, x: this.player.x, y: this.player.y, color: bossFloor ? '#ff3b91' : this.sector?.color || this.contract?.color || '#46e9ff', sector: this.sector ? { id: this.sector.id, label: this.sector.label, focus: this.sector.focus || null, color: this.sector.color } : null });
    }

    _spawnWave() {
      if (this.floor >= this.finalFloor || this.floorKills >= this.floorQuota) return;
      this.wave += 1;
      const maxConcurrent = Math.min(18, 8 + this.floor * 2 + ((this.sector && this.sector.concurrentAdd) || 0));
      const faction = this.contract && RAID_ENEMIES[this.contract.companyId];
      const pendingBoss = faction && !this._midbossSpawned && this.floor === this.finalFloor - 1;
      if (pendingBoss && this.enemies.length < maxConcurrent && this.floorKills >= Math.ceil(this.floorQuota * 0.42)) {
        this._midbossSpawned = true;
        this._spawnEnemy('elite', true);
      }
      // Live enemies already account for future kills, so never spawn past the
      // floor's hard quota. Set aside one slot until the security unit arrives.
      const remaining = this.floorQuota - this.floorKills - this.enemies.length - (pendingBoss && !this._midbossSpawned ? 1 : 0);
      const desired = this.wave === 1 ? Math.max(5, Math.ceil(maxConcurrent * 0.6)) : maxConcurrent;
      const room = Math.max(0, desired - this.enemies.length);
      const count = Math.min(remaining, room);
      if (count <= 0) return;
      for (let i = 0; i < count; i++) {
        const reinforcement = this.wave === 1 && i < (this.contract?.alert || 0);
        this._spawnEnemy(reinforcement ? 'elite' : this._pickEnemyType());
      }
      this._spawnCooldown = this.wave === 1 ? 1.35 : 0.65;
    }

    _pickEnemyType() {
      const r = this.random();
      const weights = this.contract && (r < 0.7 || !this.sector?.weights) ? this.contract.weights : this.sector?.weights;
      if (weights) {
        let left = this.contract && this.sector?.weights ? (r < 0.7 ? r / 0.7 : (r - 0.7) / 0.3) : r;
        for (const type of ENEMY_TYPES) { left -= weights[type] || 0; if (left < 0) return type; }
        return 'rush';
      }
      if (this.floor >= 6 && r < 0.12) return 'elite';
      if (this.floor >= 4 && r < 0.28) return 'tank';
      if (r < 0.55) return 'rush';
      return 'shooter';
    }

    _spawnEnemy(type, midboss = false) {
      let edge = Math.floor(this.random() * 4);
      if (this.contract && this.floor === 1 && this.wave === 1) {
        // The first patrol approaches from the interior opposite the entry point.
        const opposite = { west: 1, east: 0, north: 3, south: 2 };
        if (this.random() < 0.7) edge = opposite[this.contract.entrance] ?? edge;
      }
      const pad = 50;
      let x = pad, y = pad;
      if (edge === 0) { x = pad; y = pad + this.random() * (WORLD_H - pad * 2); }
      if (edge === 1) { x = WORLD_W - pad; y = pad + this.random() * (WORLD_H - pad * 2); }
      if (edge === 2) { x = pad + this.random() * (WORLD_W - pad * 2); y = pad; }
      if (edge === 3) { x = pad + this.random() * (WORLD_W - pad * 2); y = WORLD_H - pad; }
      const scale = 1 + (this.floor - 1) * 0.1;
      const presets = {
        rush: { r: 17, hp: 34, speed: 126, color: '#ff4d8e', damage: 16 },
        shooter: { r: 20, hp: 43, speed: 65, color: '#be6cff', damage: 14 },
        tank: { r: 29, hp: 125, speed: 40, color: '#ff9b3f', damage: 26 },
        elite: { r: 24, hp: 180, speed: 88, color: '#ff375f', damage: 22 }
      };
      const faction = this.contract && RAID_ENEMIES[this.contract.companyId];
      const unit = faction?.[midboss ? 'midboss' : type];
      const p = { ...(presets[type] || presets.rush), ...unit };
      const color = faction?.color || p.color;
      if (midboss) {
        // Put reinforcements on the playable field at a readable distance.
        const towardCenter = norm(WORLD_W / 2 - this.player.x, WORLD_H / 2 - this.player.y);
        x = clamp(this.player.x + towardCenter.x * 310, PLAY_MIN_X + p.r, PLAY_MAX_X - p.r);
        y = clamp(this.player.y + (towardCenter.x || towardCenter.y ? towardCenter.y : -1) * 310, PLAY_MIN_Y + p.r, PLAY_MAX_Y - p.r);
      }
      const mod = this.sector || {};
      const alert = this.contract?.alert || 0;
      const hp = Math.round(p.hp * scale * (mod.hpMult || 1) * (1 + this.threat * DIFFICULTY.threatHp) * (1 + 0.08 * alert));
      const pressure = (this.floor === 1 ? DIFFICULTY.firstFloorDamage : 1) * (1 + this.threat * DIFFICULTY.threatDamage) * (1 + 0.12 * alert);
      const enemy = {
        id: ++this._enemyId, type, x, y, r: p.r, hp, maxHp: hp,
        speed: p.speed * (1 + (this.floor - 1) * 0.025) * this._stats.enemySpeedMult * (mod.speedMult || 1), color,
        damage: p.damage * (1 + (this.floor - 1) * 0.07) * (mod.damageMult || 1) * pressure, angle: 0, phase: this.random() * TAU,
        telegraph: null, pendingShots: [], shootCooldown: 0.8 + this.random() * 0.8, attackCooldown: 0, stun: 0,
        infected: 0, hitFlash: 0, dead: false
      };
      if (unit) Object.assign(enemy, {
        faction: this.contract.companyId, name: unit.name, variant: unit.variant, weakness: ENEMY_AFFINITIES[unit.affinity],
        weapon: unit.weapon, pattern: unit.pattern, midboss
      });
      this.enemies.push(enemy);
      if (midboss) this._emit('midboss', { x, y, color, faction: enemy.faction, name: enemy.name, weakness: enemy.weakness, amount: hp });
      else this._emit('spawn', { x, y, color, enemyType: type });
      return enemy;
    }

    _spawnBoss() {
      const contract = this.contract;
      const hp = contract ? (contract.floors === 4 ? 3600 : 1900) * (1 + 0.08 * contract.alert) : BOSS_TUNING.hp;
      this._boss = {
        id: ++this._enemyId, type: 'boss', x: WORLD_W / 2, y: 190, r: 76, hp, maxHp: hp, speed: 48 * this._stats.enemySpeedMult,
        color: contract?.color || '#ff2a9d', damage: (contract ? 22 : 30) * (1 + this.threat * DIFFICULTY.threatDamage) * (1 + 0.12 * (contract?.alert || 0)), angle: Math.PI / 2, phase: 0, telegraph: null, shootCooldown: 2.2,
        attackCooldown: 1.1, pendingShots: [], stun: 0, infected: 0, hitFlash: 0, dead: false
      };
      const faction = contract && RAID_ENEMIES[contract.companyId];
      if (faction) Object.assign(this._boss, { faction: contract.companyId, variant: 'command', name: contract.bossName, weakness: ENEMY_AFFINITIES[faction.command.affinity] });
      this.enemies.push(this._boss);
      this._emit('boss', { x: this._boss.x, y: this._boss.y, color: this._boss.color, amount: hp, name: contract?.bossName });
    }

    update(dt, input) {
      if (this.state !== 'playing') return;
      dt = Number.isFinite(dt) ? clamp(dt, 0, 0.12) : 0;
      input = input || {};
      this.elapsed += dt;
      this.floorElapsed += dt;
      this._updateTimers(dt);
      this._movePlayer(dt, input);
      this._handleAbilities(input);
      if (this.state !== 'playing') return;
      this._updatePlayerWeapons(dt);
      if (this.state !== 'playing') return;
      this._updateEnemies(dt);
      if (this.state !== 'playing') return;
      this._updateBullets(dt);
      if (this.state !== 'playing') return;
      this._updatePickups(dt);
      if (this.state !== 'playing') return;
      this._updateDrones(dt);
      this._checkFloorProgress(dt);
      this._syncBuild();
    }

    _updateTimers(dt) {
      if (this.wire) {
        this.wire.ttl -= dt;
        if (this.wire.ttl <= 0) this.wire = null;
      }
      this.player.invuln = Math.max(0, this.player.invuln - dt);
      this.player.dashCooldown = Math.max(0, this.player.dashCooldown - dt);
      this.player.hackCooldown = Math.max(0, this.player.hackCooldown - dt);
      this.player.fireCooldown = Math.max(0, this.player.fireCooldown - dt);
      this.player.slashCooldown = Math.max(0, this.player.slashCooldown - dt);
      this.player.droneCooldown = Math.max(0, this.player.droneCooldown - dt);
      this._spawnCooldown = Math.max(0, this._spawnCooldown - dt);
      for (const e of this.enemies) {
        e.shootCooldown = Math.max(0, e.shootCooldown - dt);
        e.attackCooldown = Math.max(0, e.attackCooldown - dt);
        e.stun = Math.max(0, e.stun - dt);
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        if (e.telegraph && (!e.midboss || e.stun <= 0)) {
          e.telegraph.ttl -= dt;
        }
        if (e.pendingShots && e.pendingShots.length && e.stun <= 0) {
          for (let i = e.pendingShots.length - 1; i >= 0; i--) {
            const pending = e.pendingShots[i];
            pending.ttl -= dt;
            if (pending.ttl <= 0) {
              if (pending.kind === 'enemy') this._enemyShoot(e, pending.spread);
              else if (pending.kind === 'burst') this._bossBurst(e);
              else if (pending.kind === 'fan') this._bossFan(e);
              else this._resolveMidbossAttack(e, pending.kind);
              e.pendingShots.splice(i, 1);
              if (!e.pendingShots.length) e.telegraph = null;
            }
          }
        } else if (e.telegraph && e.telegraph.ttl <= 0) {
          e.telegraph = null;
        }
        if (e.infected > 0) e.infected = Math.max(0, e.infected - dt);
      }
      const wasOver = this.player.overheated;
      this.player.heat = Math.max(0, this.player.heat - this._stats.coolRate * ((this.sector && this.sector.coolRateMult) || 1) * dt);
      this.player.surge = Math.max(0, (this.player.surge || 0) - dt);
      // Armor resonance II: replenish one shield every six seconds, up to the
      // capacity provided by the phase-shield upgrades. The armory route can
      // temporarily put the current count above this capacity, so it never
      // removes charges and simply waits until the count falls below the cap.
      const shieldCapacity = this._shieldCapacity();
      if (this.resonance.armor >= 2 && this.player.shield < shieldCapacity) {
        this.player.shieldRegen = (this.player.shieldRegen || 0) + dt;
        if (this.player.shieldRegen + 1e-9 >= 6) {
          this.player.shieldRegen = Math.max(0, this.player.shieldRegen - 6);
          this.player.shield = Math.min(shieldCapacity, this.player.shield + 1);
          this._stats.shield = this.player.shield;
          if (this.player.shield >= shieldCapacity) this.player.shieldRegen = 0;
          this._emit('shieldUp', { x: this.player.x, y: this.player.y, color: '#79a7ff' });
        }
      } else {
        this.player.shieldRegen = 0;
      }
      const regen = this._stats.regen + (this.resonance.armor >= 3 ? this.player.maxHp * 0.02 : 0);
      if (regen > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + regen * dt);
      if (this.player.overheated && this.player.heat <= this._stats.maxHeat * 0.32) this.player.overheated = false;
      if (wasOver && !this.player.overheated) this._emit('cool', { x: this.player.x, y: this.player.y, color: '#46e9ff' });
    }

    _movePlayer(dt, input) {
      let x = Number(input.x) || 0;
      let y = Number(input.y) || 0;
      const d = norm(x, y);
      if (d.x || d.y) this.player.angle = Math.atan2(d.y, d.x);
      this.player.x = clamp(this.player.x + d.x * this._stats.moveSpeed * dt, PLAY_MIN_X, PLAY_MAX_X);
      this.player.y = clamp(this.player.y + d.y * this._stats.moveSpeed * dt, PLAY_MIN_Y, PLAY_MAX_Y);
    }

    _handleAbilities(input) {
      const pressed = {
        dash: !!input.dash && !this._held.dash,
        hack: !!input.hack && !this._held.hack,
        ultimate: !!input.ultimate && !this._held.ultimate
      };
      this._held.dash = !!input.dash;
      this._held.hack = !!input.hack;
      this._held.ultimate = !!input.ultimate;
      if (pressed.dash && this.player.dashCooldown <= 0) {
        this._dash(input);
        if (this.state !== 'playing') return;
      }
      if (pressed.hack && this.player.hackCooldown <= 0) this._hack();
      if (pressed.ultimate && this.player.energy >= this.player.maxEnergy) this._ultimate();
    }

    _dash(input) {
      let d = norm(Number(input.x) || 0, Number(input.y) || 0);
      if (!d.x && !d.y) d = { x: Math.cos(this.player.angle), y: Math.sin(this.player.angle) };
      const from = { x: this.player.x, y: this.player.y };
      const mobility = this.resonance.mobility;
      const reach = this._stats.dashDistance + (mobility >= 3 ? 70 : 0);
      this.player.x = clamp(this.player.x + d.x * reach, PLAY_MIN_X, PLAY_MAX_X);
      this.player.y = clamp(this.player.y + d.y * reach, PLAY_MIN_Y, PLAY_MAX_Y);
      this.player.invuln = 0.34;
      this.player.dashCooldown = this._stats.dashCooldown * ((this.sector && this.sector.dashCooldownMult) || 1);
      this._emit('dash', { x: this.player.x, y: this.player.y, tx: from.x, ty: from.y, color: this.build.colors[0] });
      if (this.loadout === 'lineman') {
        this.wire = { from, to: { x: this.player.x, y: this.player.y }, ttl: 2.4, caught: new Set() };
      }
      if (this._stats.dashDamage > 0) {
        const dashDamage = this._stats.dashDamage * (mobility >= 1 ? 4 : 1) * (mobility >= 3 ? 2 : 1);
        const killsBefore = this.kills;
        for (const e of this.enemies.slice()) {
          if (segmentDistance2(e,from,this.player) < (e.r + this._stats.dashRadius)**2) this._damageEnemy(e, dashDamage, { source: 'dash', color: '#53ffcf' });
        }
        if (mobility >= 2 && this.kills > killsBefore) {
          this.player.dashCooldown = 0;
          this.player.surge = 2;
          this._emit('surge', { x: this.player.x, y: this.player.y, color: '#53ffcf' });
        }
      }
      this._collectAlongSegment(from, this.player);
    }

    _collectAlongSegment(from, to) {
      const pickupNext = [];
      for (const p of this.pickups) {
        if (segmentDistance2(p, from, to) <= this._stats.pickupRadius * this._stats.pickupRadius) this._collectPickup(p);
        else pickupNext.push(p);
      }
      this.pickups = pickupNext;
      const found = [];
      const chestNext = [];
      for (const chest of this.chests) {
        if (segmentDistance2(chest, from, to) <= (this._stats.pickupRadius + 34) ** 2) found.push(chest);
        else chestNext.push(chest);
      }
      this.chests = chestNext;
      if (found.length) this._openChests(found);
    }

    _hack() {
      this.player.hackCooldown = 4.2 * ((this.sector && this.sector.hackCooldownMult) || 1);
      let count = 0;
      for (const e of this.enemies) {
        if (distance(this.player, e) <= this._stats.hackRadius + e.r) {
          this._damageEnemy(e, this._stats.hackDamage, { source: 'hack', color: '#b64dff' });
          e.stun = Math.max(e.stun, 1.3);
          e.pendingShots = [];
          e.telegraph = null;
          if (e.midboss) e.chargeTime = 0;
          if (this._stats.virus) e.infected = 5.5;
          count++;
        }
      }
      this._emit('hack', { x: this.player.x, y: this.player.y, amount: count, color: '#b64dff' });
    }

    _ultimate() {
      this.player.energy = 0;
      let hits = 0;
      const damage = 170 * this._stats.ultimateMult;
      for (const e of this.enemies.slice()) {
        this._damageEnemy(e, damage, { source: 'ultimate', color: '#fff05a' });
        e.stun = Math.max(e.stun, 1.8);
        e.pendingShots = [];
        e.telegraph = null;
        hits++;
      }
      this.player.invuln = Math.max(this.player.invuln, 0.8);
      this._emit('ultimate', { x: this.player.x, y: this.player.y, amount: hits, color: '#fff05a' });
    }

    _updatePlayerWeapons(dt) {
      const target = this._nearestEnemy();
      if (target) this.player.angle = angleTo(this.player, target);
      if (this.loadout === 'samurai') {
        if (target && this.player.slashCooldown <= 0 && !this.player.overheated) {
          this.player.slashCooldown = this._stats.slashInterval * this._hotRate();
          this.player.heat = Math.min(this._stats.maxHeat, this.player.heat + this._stats.heatPerShot);
          if (this.player.heat >= this._stats.maxHeat) this._triggerOverheat();
          let hits = 0;
          let chainOrigin = null;
          for (const e of this.enemies.slice()) {
            const d = distance(this.player, e);
            const a = Math.abs(this._angleDiff(this.player.angle, angleTo(this.player, e)));
            const waveHit = d < this._stats.slashRadius * 2.05 + e.r && a < 0.34;
            const arcHit = d < this._stats.slashRadius + e.r && a < 1.7;
            if (arcHit || waveHit) {
              this._damageEnemy(e, waveHit && !arcHit ? this._stats.slashDamage * 0.62 : this._stats.slashDamage, { source: 'slash', color: '#ff5c9c' });
              if (!chainOrigin) chainOrigin = e;
              hits++;
            }
          }
          if (chainOrigin && this._stats.chain > 0) this._chainStrike(chainOrigin);
          this._emit('slash', { x: this.player.x, y: this.player.y, tx: this.player.x + Math.cos(this.player.angle) * this._stats.slashRadius * 2, ty: this.player.y + Math.sin(this.player.angle) * this._stats.slashRadius * 2, angle: this.player.angle, radius: this._stats.slashRadius * 2, amount: hits, color: '#ff5c9c' });
        }
      } else if (target && this.player.fireCooldown <= 0 && !this.player.overheated) {
        this.player.fireCooldown = this._stats.fireInterval * this._hotRate();
        this._firePlayerBullet(target);
      }
    }

    _angleDiff(a, b) {
      let d = (a - b) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    }

    _firePlayerBullet(target, extra) {
      const a = angleTo(this.player, target) + ((extra && extra.spread) || 0);
      const speed = this._stats.bulletSpeed;
      this.bullets.push({ id: ++this._bulletId, x: this.player.x + Math.cos(a) * 24, y: this.player.y + Math.sin(a) * 24, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6, color: this.build.colors[0], enemy: false, damage: this._stats.damage, pierce: extra && extra.pierce ? extra.pierce : 0 });
      this.player.heat += this._stats.heatPerShot;
      if (this.player.heat >= this._stats.maxHeat) this._triggerOverheat();
      this._emit('shot', { x: this.player.x, y: this.player.y, tx: target.x, ty: target.y, color: this.build.colors[0], amount: this._stats.damage });
    }

    _triggerOverheat() {
      if (this.player.overheated) return;
      this.player.overheated = true;
      this.player.heat = this._stats.maxHeat;
      this._emit('overheat', { x: this.player.x, y: this.player.y, color: '#ff713e', amount: 1 });
      if (this.resonance.heat >= 2) {
        // Heat resonance turns the overheat penalty into a detonation and a fast recovery.
        this.player.heat = this._stats.maxHeat * 0.5;
        this._emit('heatwave', { x: this.player.x, y: this.player.y, radius: 320, color: '#ff713e' });
        for (const e of this.enemies.slice()) {
          if (distance(this.player, e) <= 320 + e.r) this._damageEnemy(e, 600, { source: 'heat', color: '#ff713e', ignoreHeat: true });
        }
      }
    }

    // Heat resonance III: the weapon cycles faster.
    _hotRate() {
      return this.resonance.heat >= 3 ? 0.7 : 1;
    }

    _updateDrones(dt) {
      if (this._stats.droneCount <= 0) { this.drones.length = 0; return; }
      while (this.drones.length < this._stats.droneCount) this.drones.push({ angle: this.drones.length * TAU / this._stats.droneCount, x: this.player.x, y: this.player.y, fire: this.random() * this._stats.droneInterval });
      if (this.drones.length > this._stats.droneCount) this.drones.length = this._stats.droneCount;
      const target = this._nearestEnemy();
      for (let i = 0; i < this.drones.length; i++) {
        const d = this.drones[i];
        d.angle += dt * (0.7 + i * 0.06);
        const orbit = 58 + (i % 2) * 16;
        d.x = this.player.x + Math.cos(d.angle) * orbit;
        d.y = this.player.y + Math.sin(d.angle) * orbit;
        d.fire -= dt;
        if (target && d.fire <= 0) {
          const link = this.resonance.drone;
          d.fire = this._stats.droneInterval * (link >= 3 ? 0.7 : 1);
          const a = angleTo(d, target);
          this.bullets.push({ id: ++this._bulletId, x: d.x, y: d.y, vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, r: 5, color: '#be6cff', enemy: false, damage: this._stats.droneDamage * (link >= 1 ? 1.3 : 1), pierce: this._stats.dronePierce, source: 'drone', splash: link >= 2 });
          this._emit('drone', { x: d.x, y: d.y, tx: target.x, ty: target.y, color: '#be6cff', amount: this._stats.droneDamage });
        }
      }
    }

    _updateEnemies(dt) {
      for (const e of this.enemies.slice()) {
        if (this.state !== 'playing') break;
        if (e.dead) continue;
        if (e.infected > 0 && this._stats.virus) this._damageEnemy(e, this._stats.virusDamage * (this.resonance.virus >= 1 ? 3 : 1) * dt, { source: 'virus', color: '#b64dff', silent: true });
        if (e.dead) continue;
        // Armor resonance I: charged plating hurts whatever closes in, scaled by max HP.
        if (this.resonance.armor >= 1 && distance(this.player, e) <= 130 + e.r) {
          this._damageEnemy(e, this.player.maxHp * 0.8 * dt, { source: 'armor', color: '#79a7ff', silent: true });
          if (e.dead) continue;
        }
        if (e.burn > 0) {
          e.burn -= dt;
          this._damageEnemy(e, e.burnDps * dt, { source: 'heat', color: '#ff713e', silent: true, ignoreMultipliers: true });
          if (e.dead) continue;
          if (e.burn <= 0) e.burnDps = 0;
        }
        if (e.stun > 0) continue;
        if (e.type === 'boss') this._updateBoss(e, dt);
        else {
          if (e.midboss) this._updateMidboss(e, dt);
          else this._updateMinion(e, dt);
          const wire = this.wire;
          if (wire && !wire.caught.has(e.id) && segmentDistance2(e, wire.from, wire.to) <= (e.r + 18) ** 2) {
            wire.caught.add(e.id);
            e.stun = Math.max(e.stun, 1.35);
            e.pendingShots = [];
            e.telegraph = null;
            if (e.midboss) e.chargeTime = 0;
            this._damageEnemy(e, 16, { source: 'wire', color: '#91ffc4' });
          }
        }
      }
    }

    _updateMinion(e, dt) {
      const d = distance(this.player, e);
      const a = angleTo(e, this.player);
      const weapon = e.weapon;
      e.angle = a;
      if (e.type === 'shooter') {
        const desired = d > (weapon?.range ?? 360) ? 1 : d < (weapon?.retreat ?? 250) ? -1 : 0;
        e.x += Math.cos(a) * e.speed * desired * dt;
        e.y += Math.sin(a) * e.speed * desired * dt;
        if (e.shootCooldown <= 0 && (!e.pendingShots || !e.pendingShots.length)) {
          const spread = weapon?.spread || 0;
          this._telegraphShot(e, a, weapon?.windup ?? 0.45, spread, weapon ? e.color : '#be6cff');
          e.shootCooldown = (weapon?.cooldown ?? 1.2) + this.random() * 0.7;
        }
      } else {
        e.x += Math.cos(a) * e.speed * dt;
        e.y += Math.sin(a) * e.speed * dt;
        if (e.type === 'elite' && e.shootCooldown <= 0 && (!e.pendingShots || !e.pendingShots.length)) {
          this._telegraphShot(e, a, weapon?.windup ?? 0.38, weapon?.spread ?? 0.18, e.color);
          e.shootCooldown = weapon?.cooldown ?? 1.65;
        }
      }
      e.x = clamp(e.x, 26, WORLD_W - 26);
      e.y = clamp(e.y, 26, WORLD_H - 26);
      if (d < e.r + PLAYER_R + 2 && e.attackCooldown <= 0) {
        e.attackCooldown = 0.8;
        this._damagePlayer(e.damage, e.x, e.y, e.color);
      }
    }

    _telegraphShot(enemy, angle, ttl, spread, color) {
      const type = spread ? 'fan' : 'aim';
      const { x, y } = enemy;
      const tx = this.player.x, ty = this.player.y;
      enemy.telegraph = { type, kind: type, ttl, x, y, tx, ty, angle, spread, color };
      enemy.pendingShots.push({ kind: 'enemy', ttl, spread });
      this._emit('telegraph', { x, y, tx, ty, amount: spread ? 3 : 1, color, enemyType: enemy.type });
    }

    _updateMidboss(enemy, dt) {
      if (enemy.chargeTime > 0) {
        const from = { x: enemy.x, y: enemy.y };
        const step = Math.min(dt, enemy.chargeTime) * 660;
        enemy.x = clamp(enemy.x + Math.cos(enemy.angle) * step, PLAY_MIN_X, PLAY_MAX_X);
        enemy.y = clamp(enemy.y + Math.sin(enemy.angle) * step, PLAY_MIN_Y, PLAY_MAX_Y);
        enemy.chargeTime -= dt;
        if (!enemy.chargeHit && segmentDistance2(this.player, from, enemy) <= (enemy.r + PLAYER_R) ** 2) {
          enemy.chargeHit = true;
          this._damagePlayer(enemy.damage * 1.4, enemy.x, enemy.y, enemy.color);
        }
        return;
      }
      if (enemy.pendingShots.length) return;
      const { pattern } = enemy;
      const d = distance(this.player, enemy);
      enemy.angle = angleTo(enemy, this.player);
      const reach = pattern === 'charge' ? 420 : pattern === 'pulse' ? 240 : 380;
      if (enemy.shootCooldown <= 0 && d <= reach) {
        const type = pattern === 'charge' ? 'aim' : 'radial';
        const ttl = pattern === 'charge' ? 0.7 : 0.68;
        enemy.telegraph = { type, kind: type, ttl, angle: enemy.angle, length: 310, width: pattern === 'charge' ? enemy.r * 2 : 0, radius: pattern === 'pulse' ? 200 : 150, color: enemy.color };
        enemy.pendingShots.push({ kind: pattern, ttl });
        enemy.shootCooldown = pattern === 'charge' ? 2.6 : 2.9;
        this._emit('telegraph', { x: enemy.x, y: enemy.y, color: enemy.color, amount: 2 });
        return;
      }
      if (d > (pattern === 'ring' ? 220 : enemy.r + PLAYER_R)) {
        enemy.x = clamp(enemy.x + Math.cos(enemy.angle) * enemy.speed * dt, 26, WORLD_W - 26);
        enemy.y = clamp(enemy.y + Math.sin(enemy.angle) * enemy.speed * dt, 26, WORLD_H - 26);
      } else if (d <= enemy.r + PLAYER_R + 2 && enemy.attackCooldown <= 0) {
        enemy.attackCooldown = 0.9;
        this._damagePlayer(enemy.damage, enemy.x, enemy.y, enemy.color);
      }
    }

    _resolveMidbossAttack(enemy, pattern) {
      const { x, y, color, damage, telegraph } = enemy;
      if (pattern === 'ring') {
        this._fireEnemyRing(enemy, 10, 285, 0.78, color);
      } else if (pattern === 'charge') {
        enemy.angle = telegraph?.angle ?? enemy.angle;
        enemy.chargeTime = 0.46;
        enemy.chargeHit = false;
      } else if (pattern === 'pulse') {
        const radius = telegraph?.radius || 200;
        this._emit('radial', { x, y, color, radius, amount: 1 });
        if (distance(this.player, enemy) <= radius + PLAYER_R) this._damagePlayer(damage * 1.25, x, y, color);
      }
    }

    _updateBoss(e, dt) {
      e.phase = e.hp < e.maxHp * 0.52 ? 2 : 1;
      if (e.phase === 2 && !e.phaseAnnounced) {
        e.phaseAnnounced = true;
        this._emit('bossPhase', { x: e.x, y: e.y, amount: 2, color: '#ff2a9d' });
      }
      const targetX = WORLD_W / 2 + Math.cos(this.elapsed * 0.42) * 410;
      const targetY = 220 + Math.sin(this.elapsed * 0.55) * 210;
      const v = norm(targetX - e.x, targetY - e.y);
      e.x += v.x * e.speed * dt;
      e.y += v.y * e.speed * dt;
      e.angle = angleTo(e, this.player);
      if (e.shootCooldown <= 0 && (!e.pendingShots || !e.pendingShots.length)) {
        e.shootCooldown = e.phase === 2 ? 1.45 : 2.1;
        e.telegraph = { type: 'radial', kind: 'radial', ttl: 0.6, x: e.x, y: e.y, radius: e.phase === 2 ? 260 : 190, angle: this.elapsed * 0.6, color: '#ff2a9d' };
        this._emit('telegraph', { x: e.x, y: e.y, amount: e.phase, color: '#ff2a9d' });
        e.pendingShots.push({ kind: 'burst', ttl: 0.6 });
      }
      if (e.attackCooldown <= 0 && (!e.pendingShots || !e.pendingShots.length)) {
        e.attackCooldown = e.phase === 2 ? 2.8 : 3.6;
        const fanAngle = angleTo(e, this.player);
        e.telegraph = { type: 'fan', kind: 'fan', ttl: 0.48, x: e.x, y: e.y, angle: fanAngle, radius: 340, color: '#ff7fbd' };
        e.pendingShots.push({ kind: 'fan', ttl: 0.48 });
      }
      if (distance(this.player, e) < e.r + PLAYER_R && e.attackCooldown <= 0) this._damagePlayer(e.damage * 1.3, e.x, e.y, e.color);
    }

    _enemyShoot(e, spread) {
      const a = e.telegraph?.angle ?? angleTo(e, this.player);
      const shots = spread ? [-spread, 0, spread] : [0];
      const speed = e.weapon?.speed ?? 360;
      for (const off of shots) {
        const aa = a + off;
        this.bullets.push({ id: ++this._bulletId, x: e.x, y: e.y, vx: Math.cos(aa) * speed, vy: Math.sin(aa) * speed, r: 7, color: e.color, enemy: true, damage: e.damage });
      }
      this._emit('enemyShot', { x: e.x, y: e.y, tx: this.player.x, ty: this.player.y, color: e.color, amount: shots.length });
    }

    _bossBurst(e) {
      this._fireEnemyRing(e, e.phase === 2 ? 14 : 10, e.phase === 2 ? 300 : 260, 0.72, '#ff3b91');
    }

    _fireEnemyRing(e, count, speed, damageScale, color) {
      const base = e.telegraph?.angle ?? this.elapsed * 0.6;
      for (let i = 0; i < count; i++) {
        const a = base + TAU * i / count;
        this.bullets.push({ id: ++this._bulletId, x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 8, color, enemy: true, damage: e.damage * damageScale });
      }
      this._emit('radial', { x: e.x, y: e.y, amount: count, color });
    }

    _bossFan(e) {
      const a = e.telegraph?.angle ?? angleTo(e, this.player);
      const count = e.phase === 2 ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * 0.18;
        const aa = a + off;
        this.bullets.push({ id: ++this._bulletId, x: e.x, y: e.y, vx: Math.cos(aa) * 430, vy: Math.sin(aa) * 430, r: 9, color: '#ff7fbd', enemy: true, damage: e.damage });
      }
      this._emit('fan', { x: e.x, y: e.y, tx: this.player.x, ty: this.player.y, amount: count, color: '#ff7fbd' });
    }

    _updateBullets(dt) {
      const next = [];
      for (const b of this.bullets) {
        const from = {x:b.x,y:b.y};
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < -40 || b.x > WORLD_W + 40 || b.y < -40 || b.y > WORLD_H + 40) continue;
        if (b.enemy) {
          if (this.player.invuln <= 0 && segmentDistance2(this.player,from,b) < (b.r + PLAYER_R)**2) {
            this._damagePlayer(b.damage, b.x, b.y, b.color, true);
            continue;
          }
          next.push(b);
        } else {
          let hit = false;
          if (!b.hitIds) b.hitIds = new Set();
          for (const e of this.enemies.slice()) {
            if (e.dead || b.hitIds.has(e.id)) continue;
            if (segmentDistance2(e,from,b) < (b.r + e.r)**2) {
              b.hitIds.add(e.id);
              const dealt = this._damageEnemy(e, b.damage, { source: 'shot', color: b.color, track: b.source });
              this._emit('hit', { x: b.x, y: b.y, tx: e.x, ty: e.y, color: b.color, amount: dealt });
              if (b.splash) {
                this._emit('splash', { x: e.x, y: e.y, radius: 90, color: b.color });
                for (const n of this.enemies.slice()) {
                  if (n !== e && !n.dead && distance(e, n) <= 90 + n.r) this._damageEnemy(n, b.damage * 0.6, { source: 'shot', color: b.color, track: 'drone', silent: true });
                }
              }
              if (this._stats.chain > 0) this._chainStrike(e);
              if (b.pierce > 0) { b.pierce -= 1; } else { hit = true; }
              if (hit) break;
            }
          }
          if (!hit) next.push(b);
        }
      }
      this.bullets = next;
    }

    _chainStrike(origin) {
      const targets = this.enemies.filter((e) => !e.dead && e !== origin).sort((a, b) => dist2(a, origin) - dist2(b, origin));
      const boost = this.resonance.lightning >= 3 ? 1.6 : 1;
      const damage = this._stats.damage * this._stats.chainDamage * (this.resonance.lightning >= 3 ? 2 : 1);
      let from = origin;
      for (let i = 0; i < Math.min(this._stats.chain, targets.length); i++) {
        const e = targets[i];
        if (e.dead) continue;
        if (distance(from, e) > 260 * boost) break;
        this._damageEnemy(e, damage, { source: 'chain', color: '#46e9ff' });
        this._emit('lightning', { x: from.x, y: from.y, tx: e.x, ty: e.y, color: '#46e9ff', amount: damage });
        from = e;
      }
    }

    _updatePickups(dt) {
      const next = [];
      for (const p of this.pickups) {
        const d = distance(this.player, p);
        if (d < this._stats.pickupRadius) {
          this._collectPickup(p);
        } else {
          next.push(p);
        }
      }
      this.pickups = next;
      if (this.chests.length) {
        const found = [], chestNext = [];
        for (const chest of this.chests) {
          if (distance(this.player, chest) <= this._stats.pickupRadius + 34) found.push(chest);
          else chestNext.push(chest);
        }
        this.chests = chestNext;
        if (found.length) this._openChests(found);
      }
    }

    _collectPickup(p) {
      if (p.type === 'energy') this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 18 * this._stats.energyGain / 8);
      else if (p.type === 'heal') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 14);
      else if (p.type === 'cool') { this.player.heat = Math.max(0, this.player.heat - 35); this.player.overheated = false; }
      this._emit('pickup', { x: p.x, y: p.y, color: p.type === 'heal' ? '#77ff9c' : p.type === 'cool' ? '#46d8ff' : '#fff05a', pickup: p.type });
    }

    _maybeSpawnChest(x, y) {
      const bonus = this.sector && this.sector.extraChest;
      if (this.floor >= this.finalFloor || this._floorChestCount >= (bonus ? 5 : 4)) return false;
      const earlyAt = Math.max(8, Math.ceil(this.floorQuota * 0.2));
      const lateAt = Math.max(earlyAt + 1, Math.ceil(this.floorQuota * 0.6));
      let guaranteed = null;
      if (!this._floorChestFlags.early && this.floorKills >= earlyAt) {
        this._floorChestFlags.early = true;
        guaranteed = 'rare';
      } else if (!this._floorChestFlags.late && this.floorKills >= lateAt) {
        this._floorChestFlags.late = true;
        guaranteed = 'epic';
      } else if (bonus && !this._floorChestFlags.extra && this.floorKills >= Math.ceil(this.floorQuota * 0.85)) {
        this._floorChestFlags.extra = true;
        guaranteed = bonus;
      }
      if (guaranteed) return this._spawnChestAt(x, y, guaranteed);
      if (this._floorChestDrops < 2 && this._floorChestCount < 4 && this.random() < 0.018 + this._stats.luck * 0.08) {
        this._floorChestDrops += 1;
        return this._spawnChestAt(x, y, this._rollChestRarity());
      }
      return false;
    }

    _rollChestRarity() {
      const r = this.random();
      return r < 0.1 ? 'legendary' : r < 0.4 ? 'epic' : 'rare';
    }

    _spawnChestAt(x, y, rarity) {
      const chest = {
        id: ++this._chestId,
        x: clamp(Number.isFinite(x) ? x : this.player.x, PLAY_MIN_X, PLAY_MAX_X),
        y: clamp(Number.isFinite(y) ? y : this.player.y, PLAY_MIN_Y, PLAY_MAX_Y),
        rarity: rarity === 'legendary' || rarity === 'epic' ? rarity : 'rare'
      };
      if (this.sector && this.sector.chestTierUp) chest.rarity = chest.rarity === 'rare' ? 'epic' : 'legendary';
      if (this.floor < this.finalFloor) this._floorChestCount += 1;
      this.chests.push(chest);
      this._emit('chestDrop', { chestId: chest.id, x: chest.x, y: chest.y, rarity: chest.rarity, color: chest.rarity === 'legendary' ? '#fff05a' : chest.rarity === 'epic' ? '#ff4df2' : '#46e9ff' });
      return chest;
    }

    _chestItemCount(rarity) {
      return rarity === 'legendary' ? 5 : rarity === 'epic' ? 3 : 1;
    }

    _rollChestChoices() {
      // Each chest round presents three distinct candidates.  The pool is
      // rebuilt for every round so a previously selected part can appear
      // again in a later round (duplicates are intentional build stacking).
      const candidates = this._offerPool();
      const out = [];
      while (out.length < 3 && candidates.length) {
        const i = Math.floor(this.random() * candidates.length);
        const def = candidates.splice(i, 1)[0];
        out.push(def);
      }
      return this._offerCards(out);
    }

    // Turns rolled definitions into offer cards. In a focus sector at least one card of
    // the sector's family is guaranteed whenever an eligible one exists, and every card
    // of that family is flagged so the UI can point at it.
    _offerCards(defs) {
      const focus = this.sector && this.sector.focus;
      if (focus && defs.length && !defs.some((def) => UPGRADE_FAMILY[def.id] === focus)) {
        const eligible = UPGRADE_DEFS.filter((def) => UPGRADE_FAMILY[def.id] === focus && this._canOfferUpgrade(def));
        if (eligible.length) defs[Math.floor(this.random() * defs.length)] = eligible[Math.floor(this.random() * eligible.length)];
      }
      return defs.map((def) => ({ id: def.id, name: def.name, tag: def.tag, description: def.description, color: def.color, family: UPGRADE_FAMILY[def.id] || null, focus: !!focus && UPGRADE_FAMILY[def.id] === focus }));
    }

    _gainResonance(family) {
      const def = RESONANCE[family];
      if (!def || this.resonance[family] >= 3) return false;
      const level = this.resonance[family] + 1;
      this.resonance[family] = level;
      const grant = def.grant[level - 1];
      if (grant) grant(this._stats, this);
      this._syncBuild();
      this._emit('resonance', { family, level, name: def.name, text: def.levels[level - 1], x: this.player.x, y: this.player.y, color: FAMILIES[family].color });
      return true;
    }

    // The family the next route screen keeps on offer: the strongest resonance (ties go
    // to the family with more parts installed), or the body's own line until one exists.
    // Counting parts alone would always favour heat, the family with the most cards.
    _affinityFamily() {
      const counts = {};
      for (const id of this.upgrades) { const family = UPGRADE_FAMILY[id]; if (family) counts[family] = (counts[family] || 0) + 1; }
      let best = null, bestScore = 0;
      for (const family of Object.keys(FAMILIES)) {
        if (!this.resonance[family]) continue;
        const score = this.resonance[family] * 100 + (counts[family] || 0);
        if (score > bestScore) { best = family; bestScore = score; }
      }
      return best || { samurai: 'heat', summoner: 'drone' }[this.loadout] || 'lightning';
    }

    _applyUpgrade(id, source) {
      const def = UPGRADE_DEFS.find((x) => x.id === id);
      if (!def) return false;
      this.upgrades.push(id);
      def.apply(this._stats, this);
      this._syncBuild();
      this._emit('upgrade', { id, x: this.player.x, y: this.player.y, color: def.color, source: source || 'upgrade' });
      return true;
    }

    _shieldCapacity() {
      return Math.max(1, this._stats.phaseShieldCapacity || 0);
    }

    _openChests(chests) {
      if (this.state !== 'playing' || !chests || !chests.length) return false;
      let rarity = 'rare';
      const rank = { rare: 1, epic: 2, legendary: 3 };
      let total = 0;
      for (const chest of chests) {
        if (rank[chest.rarity] > rank[rarity]) rarity = chest.rarity;
        total += this._chestItemCount(chest.rarity);
      }
      if (!total) return false;
      this.chestReward = { rarity, total, remaining: total, items: [], choices: this._rollChestChoices() };
      this.state = 'chest';
      this._emit('chestOpen', { x: this.player.x, y: this.player.y, rarity, items: [], choices: this.chestReward.choices.map((item) => item.id), amount: total, total, remaining: total, color: rarity === 'legendary' ? '#fff05a' : rarity === 'epic' ? '#ff4df2' : '#46e9ff' });
      return true;
    }

    chooseChest(index) {
      if (this.state !== 'chest' || !this.chestReward || this.chestReward.remaining <= 0) return false;
      if (!Number.isInteger(index) || index < 0 || index >= this.chestReward.choices.length) return false;
      const selected = this.chestReward.choices[index];
      if (!selected || !this._applyUpgrade(selected.id, 'chest')) return false;
      this.chestReward.items.push(selected);
      this.chestReward.remaining -= 1;
      this.chestReward.choices = this.chestReward.remaining > 0 ? this._rollChestChoices() : [];
      this._emit('chestChoice', { x: this.player.x, y: this.player.y, id: selected.id, index, rarity: this.chestReward.rarity, remaining: this.chestReward.remaining, total: this.chestReward.total, color: selected.color });
      return true;
    }

    continueChest() {
      if (this.state !== 'chest' || !this.chestReward || this.chestReward.remaining > 0) return false;
      const reward = this.chestReward;
      this.chestReward = null;
      this._held = { dash: false, hack: false, ultimate: false };
      this.state = 'playing';
      this._emit('chestContinue', { x: this.player.x, y: this.player.y, rarity: reward.rarity, amount: reward.items.length, total: reward.total, color: '#46e9ff' });
      if (this.chestEndsFloor()) this._completeFloor();
      return true;
    }

    chestEndsFloor() {
      return this.floor < this.finalFloor && !this._floorCompleteSent && this.floorKills >= this.floorQuota
        && this.enemies.length === 0 && this.chests.length === 0;
    }

    _damageEnemy(e, amount, meta) {
      if (!e || e.dead || amount <= 0) return;
      const opts = meta || {};
      const heatFactor = opts.ignoreHeat ? 1 : 1 + (this.player.heat / Math.max(1, this._stats.maxHeat)) * this._stats.heatBonus;
      let scaled = opts.ignoreMultipliers ? amount : amount * this._stats.damageMult * heatFactor;
      if (!opts.ignoreMultipliers) {
        if (this.player.surge > 0) scaled *= 1.35;
        if (this.resonance.virus >= 3 && e.infected > 0 && opts.source !== 'virus') scaled *= 1.4;
      }
      if (this.resonance.virus >= 1 && opts.source !== 'virus') e.infected = Math.max(e.infected || 0, 4);
      // Heat resonance: the body's own weapon sets its target alight. The burn is sized from
      // the hit that caused it, so it scales with everything that scales the weapon.
      if (this.resonance.heat >= 1 && (opts.source === 'slash' || (opts.source === 'shot' && !opts.track))) {
        e.burn = 3;
        e.burnDps = Math.max(e.burnDps || 0, scaled * 0.8 * (this.resonance.heat >= 3 ? 2 : 1));
      }
      const key = opts.track || opts.source || 'other';
      const weak = e.weakness?.weak.includes(key);
      const resist = e.weakness?.resist.includes(key);
      const affinity = weak ? (e.midboss ? 1.65 : 1.5) : resist ? 0.8 : 1;
      scaled *= this.attackScale * affinity;
      if (e.type === 'boss') scaled = this._limitBossDamage(e, scaled);
      e.hitFlash = 0.08;
      if (scaled <= 0) return 0;
      this.damageDealt[key] = (this.damageDealt[key] || 0) + Math.min(scaled, Math.max(0, e.hp));
      e.hp -= scaled;
      if (!opts.silent) this._emit('damageEnemy', { x: e.x, y: e.y, amount: scaled, color: opts.color || e.color, source: opts.source });
      if (weak && !opts.silent && this.elapsed - this._lastWeakPoint >= 0.38) {
        this._lastWeakPoint = this.elapsed;
        this._emit('weakPoint', { x: e.x, y: e.y, amount: scaled, color: e.weakness.color, glyph: e.weakness.glyph });
      }
      if (e.hp <= 0) this._killEnemy(e, opts.source);
      return scaled;
    }

    // Adaptive armor: two token buckets refilled from run time (not from the boss update,
    // which is skipped while the boss is stunned). Damage inside the full-rate allowance
    // lands untouched, the rest is attenuated, and the total never exceeds the ceiling.
    _limitBossDamage(e, amount) {
      const T = BOSS_TUNING;
      const boost = this._bossArmorBoost || 1;
      const fullCap = e.maxHp * T.fullRate * T.burst * boost;
      const maxCap = e.maxHp * T.maxRate * T.burst * boost;
      const dt = Math.max(0, this.elapsed - (e.armorAt === undefined ? this.elapsed : e.armorAt));
      e.armorAt = this.elapsed;
      e.armorFull = Math.min(fullCap, (e.armorFull === undefined ? fullCap : e.armorFull) + e.maxHp * T.fullRate * boost * dt);
      e.armorMax = Math.min(maxCap, (e.armorMax === undefined ? maxCap : e.armorMax) + e.maxHp * T.maxRate * boost * dt);
      const full = Math.min(amount, e.armorFull);
      e.armorFull -= full;
      const dealt = Math.min(full + (amount - full) * T.excess, e.armorMax);
      e.armorMax -= dealt;
      return dealt;
    }

    _killEnemy(e, source) {
      if (e.dead) return;
      e.dead = true;
      this.enemies = this.enemies.filter((x) => x !== e);
      this.kills += 1;
      this.floorKills += e.type === 'boss' ? this.floorQuota : 1;
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.score += Math.round((e.maxHp * 2 + 40 * this.combo) * this._stats.scoreMult);
      if (source !== 'ultimate') this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + this._stats.energyGain);
      const heal = this._stats.healOnKill * (source === 'chain' ? 2 : 1);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      if (this._stats.virusSpread && e.infected > 0) {
        for (const n of this.enemies) if (distance(e, n) < 180) n.infected = Math.max(n.infected, 4);
      }
      if (this.resonance.virus >= 2 && e.infected > 0 && e.type !== 'boss') {
        this._emit('viralBurst', { x: e.x, y: e.y, radius: 170, color: '#b64dff' });
        for (const n of this.enemies.slice()) {
          if (n.dead || distance(e, n) > 170 + n.r) continue;
          n.infected = Math.max(n.infected, 4);
          this._damageEnemy(n, this._stats.virusDamage * 8, { source: 'virus', color: '#b64dff' });
        }
      }
      if (this.resonance.heat >= 2 && e.burn > 0 && e.type !== 'boss') {
        this._emit('scorch', { x: e.x, y: e.y, radius: 140, color: '#ff713e' });
        for (const n of this.enemies.slice()) {
          if (n.dead || distance(e, n) > 140 + n.r) continue;
          n.burn = 3;
          n.burnDps = Math.max(n.burnDps || 0, e.burnDps);
          this._damageEnemy(n, e.burnDps * 1.5, { source: 'heat', color: '#ff713e', ignoreMultipliers: true });
        }
      }
      if (this.resonance.lightning >= 2 && this._stats.chain > 0 && e.type !== 'boss') this._chainStrike(e);
      if (e.type !== 'boss' && this.random() < 0.16 + this._stats.luck) {
        const roll = this.random();
        this.pickups.push({ x: e.x, y: e.y, type: roll < 0.45 ? 'energy' : roll < 0.72 ? 'heal' : 'cool' });
      }
      if (e.midboss) this._spawnChestAt(e.x, e.y, 'epic');
      else if (e.type !== 'boss') this._maybeSpawnChest(e.x, e.y);
      this._emit('kill', { x: e.x, y: e.y, color: e.color, amount: e.maxHp, source, combo: this.combo, enemyType: e.type, r: e.r, name: e.name, midboss: e.midboss });
      this._emit('explosion', { x: e.x, y: e.y, color: e.color, amount: e.r, enemyType: e.type, r: e.r });
      if (e.type === 'boss') this._win();
    }

    _damagePlayer(amount, x, y, color, projectile = false) {
      if (this.player.invuln > 0 || this.state !== 'playing') return;
      if (this.player.shield > 0) {
        this.player.shield -= 1;
        this._stats.shield = this.player.shield;
        this.player.invuln = 0.22;
        this._emit('shield', { x: this.player.x, y: this.player.y, color: '#79a7ff' });
        return;
      }
      const grace = this.elapsed < this.beginnerGrace ? 0.7 : 1;
      const vest = projectile && this.contract?.armorPerk === 'armor' ? 0.78 : 1;
      const actual = Math.max(this.contract ? 0.001 : 1, amount * this.incomingScale * vest * (1 - (this._stats.armor || 0)) * grace * (this.resonance.armor >= 1 ? 0.7 : 1));
      this.player.hp -= actual;
      this.combo = 0;
      this.player.invuln = 0.28;
      this._emit('damage', { x: this.player.x, y: this.player.y, tx: x, ty: y, color: color || '#ff4d8e', amount: actual });
      if (this.player.hp <= 0) { this._die(); return; }
    }

    _checkFloorProgress() {
      if (this.floor >= this.finalFloor || this._floorCompleteSent || this.state !== 'playing') return;
      if (this.enemies.length === 0 && this.floorKills >= this.floorQuota && this.chests.length > 0) {
        const remaining = this.chests.splice(0, this.chests.length);
        this._openChests(remaining);
        return;
      }
      if (this.enemies.length === 0 && this.floorKills >= this.floorQuota && this.chests.length === 0) {
        this._completeFloor();
      } else {
        // Refill before the arena empties so each floor reads as a continuous
        // wave fight, while the floor quota keeps the total bounded.
        const maxConcurrent = Math.min(18, 8 + this.floor * 2 + ((this.sector && this.sector.concurrentAdd) || 0));
        if (this.floorKills < this.floorQuota && this.enemies.length < Math.max(3, Math.floor(maxConcurrent * 0.52)) && this._spawnCooldown <= 0) {
          this._spawnWave();
        }
      }
    }

    _completeFloor() {
      if (this._floorCompleteSent) return;
      this._floorCompleteSent = true;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 24);
      this.player.invuln = Math.max(this.player.invuln, 1.6);
      this.player.heat = Math.max(0, this.player.heat - 24);
      this.state = 'upgrade';
      this.offeredUpgrades = this._rollUpgrades(3);
      this.routeOptions = [];
      this._emit('floorClear', { floor: this.floor, x: this.player.x, y: this.player.y, color: '#fff05a' });
      const cleared = this.sector;
      if (cleared) {
        this.sectorHistory.push(cleared.id);
        if (cleared.threat) { this.threat += cleared.threat; this._emit('threat', { amount: this.threat, x: this.player.x, y: this.player.y, color: '#ff375f' }); }
        if (cleared.clearMaxHp) { this.player.maxHp += cleared.clearMaxHp; this.player.hp += cleared.clearMaxHp; this._syncBuild(); }
        if (cleared.focus) this._gainResonance(cleared.focus);
      }
    }

    _rollUpgrades(n) {
      const pool = this._offerPool();
      const out = [];
      while (out.length < n && pool.length) {
        const i = Math.floor(this.random() * pool.length);
        out.push(pool.splice(i, 1)[0]);
      }
      return this._offerCards(out);
    }

    // The parts a roll may draw from. A long run on one family can exhaust the capped
    // pool (a body with a single line has 56 slots, and deal-heavy runs take 60+ parts),
    // so when fewer than three parts are eligible the stack cap is lifted: first for
    // ordinary parts, then for the two global multipliers. Gating is never lifted, so a
    // roll never shows a dead card and never comes back empty.
    _offerPool() {
      let pool = UPGRADE_DEFS.filter((def) => this._canOfferUpgrade(def));
      if (pool.length < 3) pool = pool.concat(UPGRADE_DEFS.filter((def) => !pool.includes(def) && !def.maxStack && this._canOfferUpgrade(def, true)));
      if (pool.length < 3) pool = pool.concat(UPGRADE_DEFS.filter((def) => !pool.includes(def) && this._canOfferUpgrade(def, true)));
      return pool;
    }

    _canOfferUpgrade(def, ignoreCap) {
      const s = this._stats;
      const owned = this.upgrades.reduce((n, id) => n + (id === def.id ? 1 : 0), 0);
      if (!ignoreCap && owned >= (def.maxStack || MAX_STACK)) return false;
      // A follow-up part should never be a dead card before its base system is
      // online. The enabling cards themselves remain available to all builds.
      // Each family's opening part belongs to the body that starts with that system, or to
      // the sector that deals in it. Clearing such a sector (resonance I) or owning the
      // system unlocks it for the rest of the run, so routes decide which lines a build has.
      const focus = this.sector && this.sector.focus;
      if (def.id === 'drone_fabricator') return s.droneCount > 0 || focus === 'drone';
      if (def.id === 'virus_seed') return !!s.virus || focus === 'virus';
      if (def.id === 'chain_core') return s.chain > 0 || focus === 'lightning';
      if (def.id === 'blade_matrix') return this.loadout === 'samurai' || owned > 0 || focus === 'mobility' || this.resonance.mobility > 0;
      if (def.id === 'drone_laser' || def.id === 'drone_link') return s.droneCount > 0;
      if (def.id === 'spread_protocol') return !!s.virus;
      if (def.id === 'chain_surge') return s.chain > 0;
      return true;
    }

    chooseUpgrade(id) {
      if (this.state !== 'upgrade') return false;
      const selected = this.offeredUpgrades.find((x) => x.id === id);
      const def = UPGRADE_DEFS.find((x) => x.id === id);
      if (!selected || !def) return false;
      this._applyUpgrade(id, 'choice');
      this.state = 'route';
      this.routeOptions = this._rollRoutes(3);
      return true;
    }

    // One rest route is always on offer. Before a normal floor the other four are the
    // sector that continues the run's strongest line, two more sectors to branch into,
    // and a deal; the sector just cleared never repeats. Before the boss floor,
    // where sector rules do not apply, the others are boss preparations and deals.
    _rollRoutes() {
      const take = (list) => list.splice(Math.floor(this.random() * list.length), 1)[0];
      const out = [take(ROUTES.filter((r) => r.kind === 'rest'))];
      if (this.floor + 1 >= this.finalFloor) {
        const prep = ROUTES.filter((r) => r.kind === 'boss' || r.id === 'clinic' || r.id === 'contract');
        out.push(take(prep), take(prep));
      } else {
        const last = this.sector && this.sector.id;
        const sectors = ROUTES.filter((r) => r.kind === 'sector' && r.id !== last);
        const affinity = this._affinityFamily();
        const index = sectors.findIndex((r) => r.sector.focus === affinity);
        out.push(index >= 0 ? sectors.splice(index, 1)[0] : take(sectors));
        out.push(take(sectors), take(sectors));
        out.push(take(ROUTES.filter((r) => r.kind === 'deal')));
      }
      return out.map((r) => this._routeCard(r));
    }

    _routeCard(r) {
      const focus = r.sector && r.sector.focus;
      const level = focus ? this.resonance[focus] : 0;
      return {
        id: r.id, name: r.name, description: this.contract && r.id === 'weakpoint' ? r.description.replace('CERBERUS', this.contract.bossName) : r.description, kind: r.kind, tag: r.tag, symbol: r.symbol, color: r.color,
        focus: focus || null, effects: (r.effects || []).slice(),
        loot: focus ? FAMILIES[focus].label + '系の改造が毎回1枚候補に入る（上限まで）' : null,
        threat: (r.sector && r.sector.threat) || 0,
        resonance: focus ? { family: focus, name: RESONANCE[focus].name, level, next: level < 3 ? level + 1 : null, text: level < 3 ? RESONANCE[focus].levels[level] : null } : null
      };
    }

    chooseRoute(id) {
      if (this.state !== 'route') return false;
      const selected = this.routeOptions.find((x) => x.id === id);
      const route = ROUTES.find((x) => x.id === id);
      if (!selected || !route) return false;
      if (route.apply) route.apply(this, this._stats);
      this._pendingSector = route.sector ? Object.assign({ id: route.id, name: route.name, color: route.color }, route.sector) : null;
      this._syncBuild();
      this._emit('route', { id, x: this.player.x, y: this.player.y, color: '#b64dff' });
      this._beginFloor(this.floor + 1);
      this.state = 'playing';
      return true;
    }

    _nearestEnemy() {
      let best = null, bestD = Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = dist2(this.player, e);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }

    _die() {
      if (this.state === 'dead') return;
      this.player.hp = 0;
      this.state = 'dead';
      this._emit('death', { x: this.player.x, y: this.player.y, color: '#ff3b91', amount: this.score });
    }

    _win() {
      if (this.state === 'won') return;
      this.state = 'won';
      this.floor = this.finalFloor;
      this._emit('victory', { x: this.player.x, y: this.player.y, color: '#fff05a', amount: this.score });
    }

    _emit(type, payload) {
      const evt = Object.assign({ id: ++this.eventSeq, type, t: this.elapsed }, payload || {});
      this.events.push(evt);
      if (this.events.length > 220) this.events.splice(0, this.events.length - 220);
      try { this.onEvent(evt); } catch (_) { /* visual callbacks must not break simulation */ }
      return evt;
    }
  }

  NeonEngine.WORLD_W = WORLD_W;
  NeonEngine.WORLD_H = WORLD_H;
  NeonEngine.BOSS_TUNING = BOSS_TUNING;
  NeonEngine.DIFFICULTY = DIFFICULTY;
  NeonEngine.PLAY_BOUNDS = { minX: PLAY_MIN_X, maxX: PLAY_MAX_X, minY: PLAY_MIN_Y, maxY: PLAY_MAX_Y };
  NeonEngine.UPGRADES = UPGRADE_DEFS.map((u) => ({ id: u.id, name: u.name, tag: u.tag, description: u.description, color: u.color, family: UPGRADE_FAMILY[u.id] || null, maxStack: u.maxStack || MAX_STACK }));
  NeonEngine.ROUTES = ROUTES.map((r) => ({ id: r.id, name: r.name, description: r.description, kind: r.kind, tag: r.tag, color: r.color, focus: (r.sector && r.sector.focus) || null }));
  NeonEngine.UPGRADE_FAMILY = Object.assign({}, UPGRADE_FAMILY);
  NeonEngine.FAMILIES = Object.keys(FAMILIES).map((id) => ({ id, label: FAMILIES[id].label, color: FAMILIES[id].color }));
  NeonEngine.RESONANCE = Object.keys(RESONANCE).map((id) => ({ family: id, name: RESONANCE[id].name, levels: RESONANCE[id].levels.slice() }));

  root.NeonEngine = NeonEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = NeonEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
