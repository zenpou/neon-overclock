(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NeonCampaign = Object.freeze(api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // All currency, ranks, prices, and rewards are BigInt. serialize() converts
  // them to strings for localStorage or another JSON-based save layer.
  const MAX_SAFE_ALERT = 3;
  const INITIAL_MEMBERS = ['runner', 'samurai', 'summoner'];
  const COMPANIES = Object.freeze([
    { id: 'power', name: 'VOLT//GRID', nameJa: 'ボルト・グリッド', industry: '電力網', color: '#46e9ff', bossName: 'GRID WARDEN', facilities: Object.freeze([
      { id: 'substation', name: '地区変電所', minRank: 1, floors: 3, weights: { rush: .2, shooter: .62, tank: .14, elite: .04 }, entrances: Object.freeze([
        { id: 'service', name: '保守口' }, { id: 'roof', name: '屋上給電線' }, { id: 'tunnel', name: '地下ケーブル溝' }
      ]) },
      { id: 'regional', name: '広域送電所', minRank: 3, floors: 3, weights: { rush: .16, shooter: .5, tank: .26, elite: .08 }, entrances: Object.freeze([
        { id: 'relay', name: 'リレー棟' }, { id: 'cooling', name: '冷却設備口' }, { id: 'cable', name: '高架ケーブル' }
      ]) },
      { id: 'control', name: '中央管制塔', minRank: 5, floors: 4, weights: { rush: .16, shooter: .42, tank: .25, elite: .17 }, entrances: Object.freeze([
        { id: 'maintenance', name: '保守エレベーター' }, { id: 'antenna', name: 'アンテナ外壁' }, { id: 'core', name: '制御核直通路' }
      ]) }
    ]) },
    { id: 'logistics', name: 'CHAIN//FLOW', nameJa: 'チェイン・フロー', industry: '物流網', color: '#eaff63', bossName: 'CONVEYOR HOUND', facilities: Object.freeze([
      { id: 'yard', name: '貨物ヤード', minRank: 1, floors: 3, weights: { rush: .48, shooter: .28, tank: .18, elite: .06 }, entrances: Object.freeze([
        { id: 'gate', name: '西ゲート' }, { id: 'rail', name: '貨物線' }, { id: 'stack', name: '積荷スタック' }
      ]) },
      { id: 'hub', name: '自動搬送センター', minRank: 3, floors: 3, weights: { rush: .42, shooter: .3, tank: .2, elite: .08 }, entrances: Object.freeze([
        { id: 'dock', name: 'ドック制御室' }, { id: 'sorter', name: '仕分けタワー' }, { id: 'underpass', name: '地下搬送路' }
      ]) },
      { id: 'command', name: '配送指令塔', minRank: 5, floors: 4, weights: { rush: .34, shooter: .34, tank: .17, elite: .15 }, entrances: Object.freeze([
        { id: 'dispatch', name: '配車フロア' }, { id: 'railcore', name: '幹線レール' }, { id: 'skybridge', name: '高架ブリッジ' }
      ]) }
    ]) },
    { id: 'medical', name: 'MORPH//LIFE', nameJa: 'モーフ・ライフ', industry: '義体医療', color: '#c37aff', bossName: 'PROTOCOL SURGEON', facilities: Object.freeze([
      { id: 'clinic', name: '市街診療区', minRank: 1, floors: 3, weights: { rush: .24, shooter: .32, tank: .28, elite: .16 }, entrances: Object.freeze([
        { id: 'triage', name: '救急搬入口' }, { id: 'ward', name: '閉鎖病棟' }, { id: 'surgery', name: '手術棟' }
      ]) },
      { id: 'factory', name: '義体整備工場', minRank: 3, floors: 3, weights: { rush: .22, shooter: .31, tank: .34, elite: .13 }, entrances: Object.freeze([
        { id: 'assembly', name: '組立ライン' }, { id: 'sterile', name: '無菌区画' }, { id: 'scrapyard', name: '部品解体場' }
      ]) },
      { id: 'archive', name: '生体規格保管庫', minRank: 5, floors: 4, weights: { rush: .18, shooter: .32, tank: .25, elite: .25 }, entrances: Object.freeze([
        { id: 'coldstore', name: '低温保管庫' }, { id: 'registry', name: '規格登録室' }, { id: 'vault', name: '設計原本庫' }
      ]) }
    ]) }
  ]);
  const OPERATIVES = Object.freeze([
    { id: 'runner', name: 'ARC RUNNER', role: '電撃連鎖／高速戦', cost: 0n },
    { id: 'samurai', name: 'HEAT SAMURAI', role: '灼熱斬撃／近接戦', cost: 0n },
    { id: 'summoner', name: 'GHOST ENGINEER', role: '自律ドローン／支援射撃', cost: 0n },
    { id: 'lineman', name: 'LIVEWIRE TECH', role: '送電罠／足止め', cost: 1800n }
  ]);
  const GEAR = Object.freeze([
    { id: 'arc_coil', name: 'アーク・コイル', description: '連鎖 +1、ハック威力 +10%。強化で全攻撃の威力が伸びる。', slot: 'weapon', price: 800n, perk: 'chain' },
    { id: 'thermal_edge', name: 'サーマル・エッジ', description: '高温時の与ダメージ補正が上がる。強化で全攻撃の威力が伸びる。', slot: 'weapon', price: 900n, perk: 'heat' },
    { id: 'impact_shell', name: 'インパクト・シェル', description: '敵弾の被ダメージ -22%。強化で全被ダメージが減る。', slot: 'armor', price: 800n, perk: 'armor' },
    { id: 'cooling_rig', name: 'クーリング・リグ', description: '冷却速度 +25%。強化で全被ダメージが減る。', slot: 'armor', price: 1000n, perk: 'cooling' }
  ]);
  // Each entry is a client, an item, a brief and a reply after delivery.
  const JOBS = {
    substation: [
      ['商店街の修理組合', '予備電源', '排水ポンプに使う。予備電源を一台頼む。', '今夜は店を開けられる。助かった。'],
      ['共同住宅の管理人', '交換ヒューズ', '階段灯がまとめて落ちた。合うヒューズが残ってるはずだ。', 'これで、足元を照らして帰れる。']
    ],
    regional: [
      ['旧市街の修理屋', '交換制御盤', '工場の片隅に保守打ち切り前の制御盤が眠ってる。', '型番が合った。まだ修理できる。'],
      ['高架下の屋台組合', '蓄電ユニット', '朝まで冷蔵庫を持たせたい。蓄電ユニットを頼む。', '仕入れた食材を捨てずに済んだ。']
    ],
    control: [
      ['地区の診療所', '高出力電源ユニット', '手術中の停電に備えたい。高出力の予備電源を。', '予備が一台あれば、夜も診られる。'],
      ['地下水路の保守班', '予備変圧器', '次の雨が来る前に、予備変圧器を回収してほしい。', 'これで水路のポンプを交代で回せる。']
    ],
    yard: [['青空市場の仲買人', '封印貨物', '止められた今朝の荷を取り返してくれ。', '明日の市には間に合う。']],
    hub: [['高架下の運び屋', '搬送制御部品', '閉鎖された支線の台車を直す部品が要る。', '坂の上の店まで運んでやれる。']],
    command: [['共同倉庫の仕分け班', '保冷コンテナ', '薬を運べる保冷コンテナを一基確保してくれ。', '今夜の便に積む。待っている人がいる。']],
    clinic: [['路地の義体修理店', '義体交換部品', '古い義足の関節を一組。倉庫に返却された型だ。', '持ち主には歩いて帰ってもらおう。']],
    factory: [['職人街の整備組合', '整備用アクチュエータ', '市場の荷役係を診ている。腕に合う部品を頼む。', '朝の荷下ろしに間に合いそうだ。']],
    archive: [['診療所の技師', '生体規格データ', '保守終了になった義体の規格データが欲しい。', 'これで調整のやり方が分かる。']]
  };
  const indexById = items => Object.freeze(Object.assign(Object.create(null), Object.fromEntries(items.map(item => [item.id, item]))));
  const COMPANY_BY_ID = indexById(COMPANIES), OPERATIVE_BY_ID = indexById(OPERATIVES), GEAR_BY_ID = indexById(GEAR);

  function safeBig(value, fallback = 0n) {
    try {
      if (typeof value === 'bigint') return value >= 0n ? value : fallback;
      if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) return fallback;
      const parsed = BigInt(value ?? fallback);
      return parsed >= 0n ? parsed : fallback;
    } catch { return fallback; }
  }
  function safeInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(MAX_SAFE_ALERT, Math.floor(n))) : fallback;
  }
  function powBig(base, exponent) {
    let result = 1n, b = BigInt(base), e = safeBig(exponent);
    while (e > 0n) { if (e & 1n) result *= b; b *= b; e >>= 1n; }
    return result;
  }
  function rewardForRank(rank) {
    const r = safeBig(rank, 1n);
    if (r < 1n) return 0n;
    const numerator = 1200n * powBig(3n, r - 1n), denominator = powBig(2n, r - 1n);
    return (numerator + denominator / 2n) / denominator;
  }
  function scaledCost(base, level) {
    const l = safeBig(level), numerator = BigInt(base) * powBig(3n, l), denominator = powBig(2n, l);
    return (numerator + denominator / 2n) / denominator;
  }
  const routeKey = (companyId, facilityId, entranceId) => `${companyId}:${facilityId}:${entranceId}`;
  const directionFor = (facility, entrance) => ['west', 'north', 'east'][facility.entrances.indexOf(entrance)] || 'south';
  function parseSaved(saved) {
    if (!saved) return {};
    if (typeof saved === 'string') { try { return parseSaved(JSON.parse(saved)); } catch { return {}; } }
    return saved && typeof saved === 'object' ? saved : {};
  }
  function normalizeMembers(source) {
    const candidates = Array.isArray(source?.team?.members) ? source.team.members : Array.isArray(source?.members) ? source.members : INITIAL_MEMBERS;
    const result = [];
    for (const id of candidates) if (OPERATIVE_BY_ID[id] && !result.includes(id)) result.push(id);
    for (const id of INITIAL_MEMBERS) if (!result.includes(id)) result.push(id);
    return result;
  }
  function createProfile(saved, legacyClears = 0) {
    const source = parseSaved(saved), members = normalizeMembers(source);
    const profile = {
      version: 1, cash: safeBig(source.cash), team: { members }, modRanks: {}, gearRanks: {}, equipped: {},
      companies: {}, routeAlerts: {}, highestClearance: safeBig(source.highestClearance ?? source.globalHighestClear),
      unlocked: source.unlocked === true || safeBig(legacyClears) > 0n || safeBig(source.completedJobs) > 0n,
      completedJobs: safeBig(source.completedJobs), nextSerial: safeBig(source.nextSerial, 1n), activeRun: null
    };
    for (const gear of GEAR) profile.gearRanks[gear.id] = safeBig(source.gearRanks?.[gear.id]);
    for (const operative of OPERATIVES) {
      profile.modRanks[operative.id] = safeBig(source.modRanks?.[operative.id]);
      const equipped = source.equipped?.[operative.id];
      profile.equipped[operative.id] = {
        weapon: GEAR_BY_ID[equipped?.weapon]?.slot === 'weapon' && profile.gearRanks[equipped.weapon] > 0n ? equipped.weapon : null,
        armor: GEAR_BY_ID[equipped?.armor]?.slot === 'armor' && profile.gearRanks[equipped.armor] > 0n ? equipped.armor : null
      };
    }
    for (const company of COMPANIES) {
      const savedCompany = source.companies?.[company.id] || {}, facilities = {};
      for (const facility of company.facilities) facilities[facility.id] = {
        highestClear: safeBig(savedCompany.facilities?.[facility.id]?.highestClear), clears: safeBig(savedCompany.facilities?.[facility.id]?.clears)
      };
      profile.companies[company.id] = { highestClear: safeBig(savedCompany.highestClear), clears: safeBig(savedCompany.clears), facilities };
      for (const facility of company.facilities) for (const entrance of facility.entrances) {
        const key = routeKey(company.id, facility.id, entrance.id);
        profile.routeAlerts[key] = safeInt(source.routeAlerts?.[key], 0);
      }
    }
    const active = source.activeRun;
    if (active && typeof active.serial === 'string' && typeof active.offerId === 'string' && typeof active.routeKey === 'string'
      && Object.hasOwn(profile.routeAlerts, active.routeKey) && active.routeKey.startsWith(`${active.companyId}:`)) {
      profile.activeRun = { serial: active.serial, offerId: active.offerId, companyId: active.companyId, routeKey: active.routeKey, rank: safeBig(active.rank, 1n), reward: safeBig(active.reward), claimed: !!active.claimed };
    }
    return profile;
  }
  function encode(value) {
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
    return value;
  }
  function serialize(profile) { return encode(profile); }
  function unlock(profile) {
    profile.unlocked = true;
  }

  function offerFor(company, facility, entrance, rank, reward, alert, cycle) {
    const key = routeKey(company.id, facility.id, entrance.id);
    const entranceDirection = directionFor(facility, entrance);
    const jobs = JOBS[facility.id];
    const [client, objective, flavor, response] = jobs[Number((cycle + BigInt(facility.entrances.indexOf(entrance))) % BigInt(jobs.length))];
    const specialist = { west: 'shooter', north: 'rush', east: 'tank' }[entranceDirection];
    const weights = Object.fromEntries(Object.entries(facility.weights).map(([type, weight]) => [type, weight * 0.82 + (type === specialist ? 0.18 : 0)]));
    const patrol = { shooter: '射撃機が増える', rush: '突撃機が増える', tank: '重装機が増える' }[specialist];
    return Object.freeze({
      id: `${company.id}:${facility.id}:${entrance.id}:r${rank.toString()}`,
      companyId: company.id, companyName: company.name, industry: company.industry,
      facilityId: facility.id, facilityName: facility.name, entranceId: entrance.id,
      entranceName: entrance.name, entrance: entranceDirection, routeKey: key, rank, alert, reward,
      floors: facility.floors, weights: Object.freeze(weights), client, objective, response,
      warning: alert ? `${patrol} · 警戒 ${alert}/3 · 各層の初回編成に精鋭 ${alert}機` : patrol,
      color: company.color, bossName: company.bossName,
      flavor
    });
  }
  function offers(profile, companyId, requestedRank = null) {
    const company = COMPANY_BY_ID[companyId];
    if (!company || !profile.unlocked) return [];
    const maxRank = profile.highestClearance, nextRank = maxRank + 1n;
    const companyRecord = profile.companies[company.id] || { clears: 0n };
    const rank = requestedRank === null ? null : safeBig(requestedRank);
    if (rank !== null && (rank < 1n || rank > nextRank)) return [];
    const targets = rank !== null ? [rank, rank, rank] : maxRank < 1n ? [1n, 1n, 1n] : [nextRank, maxRank, maxRank > 1n ? maxRank - 1n : 1n];
    const rewards = new Map([...new Set(targets)].map(item => [item, rewardForRank(item)]));
    const result = [];
    for (const [slot, targetRank] of targets.entries()) {
      const facilities = company.facilities.filter(facility => BigInt(facility.minRank) <= targetRank);
      const candidates = [];
      const entranceCount = Math.max(0, ...facilities.map(facility => facility.entrances.length));
      for (let entranceIndex = 0; entranceIndex < entranceCount; entranceIndex++) for (const facility of facilities) {
        const entrance = facility.entrances[entranceIndex];
        if (!entrance) continue;
        const key = routeKey(company.id, facility.id, entrance.id);
        const candidate = offerFor(company, facility, entrance, targetRank, rewards.get(targetRank), profile.routeAlerts[key] || 0, companyRecord.clears);
        if (!result.some(offer => offer.id === candidate.id)) candidates.push(candidate);
      }
      if (candidates.length) {
        const newSite = slot === 0 ? candidates.filter(candidate => candidate.facilityId === facilities.at(-1).id && targetRank === BigInt(facilities.at(-1).minRank)) : [];
        const alerts = slot === 1 ? candidates.filter(candidate => candidate.alert > 0) : [];
        const quiet = slot === 2 ? candidates.filter(candidate => candidate.alert === 0) : [];
        const pool = [newSite, alerts, quiet, candidates].find(items => items.length);
        result.push(pool[Number(companyRecord.clears % BigInt(pool.length))]);
      }
    }
    return result.slice(0, 3);
  }
  function begin(profile, offerId, companyId, requestedRank = null) {
    if (profile.activeRun) return null;
    const offer = offers(profile, companyId, requestedRank).find(item => item.id === offerId);
    if (!offer) return null;
    const serialNumber = profile.nextSerial > 0n ? profile.nextSerial : 1n;
    profile.nextSerial = serialNumber + 1n;
    const serial = `run-${serialNumber.toString()}`;
    const receipt = { serial, offerId: offer.id, companyId: offer.companyId, routeKey: offer.routeKey, rank: offer.rank, reward: offer.reward, claimed: false };
    profile.activeRun = receipt;
    return { ...receipt };
  }
  const sameReceipt = (left, right) => !!left && !!right && left.serial === right.serial && left.offerId === right.offerId;
  function settle(profile, receipt, won) {
    if (!sameReceipt(profile.activeRun, receipt) || profile.activeRun.claimed) return null;
    const current = profile.activeRun;
    profile.activeRun = null;
    if (!won) return { reward: 0n, unlocked: false };
    if (!COMPANY_BY_ID[current.companyId] || current.reward !== rewardForRank(current.rank)) return null;
    profile.cash += current.reward;
    profile.completedJobs += 1n;
    const company = profile.companies[current.companyId] || (profile.companies[current.companyId] = { highestClear: 0n, clears: 0n, facilities: {} });
    company.clears += 1n;
    if (current.rank > company.highestClear) company.highestClear = current.rank;
    const [, facilityId] = current.routeKey.split(':'), facilityRecord = company.facilities[facilityId] || (company.facilities[facilityId] = { highestClear: 0n, clears: 0n });
    facilityRecord.clears += 1n;
    if (current.rank > facilityRecord.highestClear) facilityRecord.highestClear = current.rank;
    for (const key of Object.keys(profile.routeAlerts)) {
      profile.routeAlerts[key] = key === current.routeKey ? Math.min(MAX_SAFE_ALERT, profile.routeAlerts[key] + 1) : Math.max(0, profile.routeAlerts[key] - 1);
    }
    const unlocked = current.rank > profile.highestClearance;
    if (unlocked) profile.highestClearance = current.rank;
    return { reward: current.reward, unlocked };
  }
  function abandon(profile, receipt) {
    if (!sameReceipt(profile.activeRun, receipt) || profile.activeRun.claimed) return false;
    profile.activeRun = null;
    return true;
  }

  function quote(profile, type, id) {
    if (type === 'recruit') {
      const operative = OPERATIVE_BY_ID[id];
      if (!operative || operative.cost === 0n || profile.team.members.includes(id) || profile.completedJobs < 1n) return null;
      return operative.cost;
    }
    if (type === 'gear') {
      const gear = GEAR_BY_ID[id];
      return gear ? scaledCost(gear.price, profile.gearRanks[id] || 0n) : null;
    }
    if (type === 'mod') {
      if (!OPERATIVE_BY_ID[id] || !profile.team.members.includes(id)) return null;
      return scaledCost(1000n, profile.modRanks[id] || 0n);
    }
    return null;
  }
  // purchase(profile, type, id) returns { cost, level } on success, null when
  // invalid or unaffordable. Types are recruit, gear, and mod.
  function purchase(profile, type, id) {
    const cost = quote(profile, type, id);
    if (cost === null || profile.cash < cost) return null;
    profile.cash -= cost;
    if (type === 'recruit') { profile.team.members.push(id); return { cost, level: 1n }; }
    if (type === 'gear') { profile.gearRanks[id] = (profile.gearRanks[id] || 0n) + 1n; return { cost, level: profile.gearRanks[id] }; }
    profile.modRanks[id] = (profile.modRanks[id] || 0n) + 1n;
    return { cost, level: profile.modRanks[id] };
  }
  function equip(profile, operativeId, gearId) {
    if (!OPERATIVE_BY_ID[operativeId] || !profile.team.members.includes(operativeId)) return false;
    const gear = GEAR_BY_ID[gearId];
    if (!gear || !(profile.gearRanks[gearId] > 0n)) return false;
    profile.equipped[operativeId][gear.slot] = gearId;
    return true;
  }
  function unequip(profile, operativeId, slot) {
    if (!OPERATIVE_BY_ID[operativeId] || !profile.equipped[operativeId] || !['weapon', 'armor'].includes(slot)) return false;
    profile.equipped[operativeId][slot] = null;
    return true;
  }
  function combatConfig(profile, operativeId, offer) {
    if (!offer || !OPERATIVE_BY_ID[operativeId] || !profile.team.members.includes(operativeId)) return null;
    const weaponId = profile.equipped[operativeId]?.weapon, armorId = profile.equipped[operativeId]?.armor;
    const weapon = weaponId && profile.gearRanks[weaponId] > 0n ? GEAR_BY_ID[weaponId] : null;
    const armor = armorId && profile.gearRanks[armorId] > 0n ? GEAR_BY_ID[armorId] : null;
    return {
      rank: safeBig(offer.rank, 1n), weaponRank: weapon ? profile.gearRanks[weaponId] || 0n : 0n,
      armorRank: armor ? profile.gearRanks[armorId] || 0n : 0n, modRank: profile.modRanks[operativeId] || 0n,
      weaponPerk: weapon?.perk || null, armorPerk: armor?.perk || null,
      companyId: offer.companyId, companyName: offer.companyName, facilityName: offer.facilityName,
      entranceName: offer.entranceName, color: offer.color, floors: offer.floors, weights: { ...offer.weights },
      entrance: offer.entrance, alert: offer.alert, objective: offer.objective, bossName: offer.bossName
    };
  }

  return {
    COMPANIES, OPERATIVES, GEAR, createProfile, serialize, unlock, offers, begin, settle, abandon,
    rewardForRank, quote, purchase, equip, unequip, combatConfig
  };
}));
