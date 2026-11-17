(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const upgradeCatalog = Array.isArray(globalThis.NeonEngine?.UPGRADES) ? globalThis.NeonEngine.UPGRADES : [];
  const gearCatalog = Array.isArray(globalThis.NeonCampaign?.GEAR) ? globalThis.NeonCampaign.GEAR : [];
  const tagLabels = {
    LIGHTNING: '電撃',
    VIRUS: 'ウイルス',
    HEAT: '熱量',
    MOBILITY: '機動',
    SURVIVE: '生存',
    DRONE: 'ドローン',
    BLADE: 'ブレード',
    GENERAL: '汎用',
    ULTIMATE: '必殺技'
  };
  const gearSlotLabels = { weapon: '攻撃装備', armor: '防御装備' };
  const fallbackColors = ['#5af6f3', '#eaff63', '#ff4e8b', '#c37aff'];

  function priceLabel(value) {
    return value.toLocaleString('ja-JP');
  }

  function iconFor(item) {
    const image = document.createElement('img');
    image.src = `assets/sprites/items/${item.id}.png`;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 192;
    image.height = 192;
    return image;
  }

  function textNode(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
  }

  function renderCard(item, index, type) {
    const isGear = type === 'gear';
    const card = document.createElement('article');
    card.className = 'item-card';
    card.style.setProperty('--item-color', item.color || fallbackColors[index % fallbackColors.length]);
    const head = document.createElement('div');
    head.className = 'item-card-head';
    head.append(textNode('span', 'item-card-code', isGear ? gearSlotLabels[item.slot] || item.slot : tagLabels[item.tag] || item.tag));
    const main = document.createElement('div');
    main.className = 'item-card-main';
    const copy = document.createElement('div');
    copy.append(
      textNode('h3', '', item.name),
      textNode('p', 'item-card-description', item.description)
    );
    main.append(iconFor(item), copy);
    const meta = document.createElement('div');
    meta.className = 'item-meta';
    if (isGear) {
      meta.append(textNode('span', '', `初回価格 ${priceLabel(item.price)}`));
    }
    card.append(head, main);
    if (meta.childElementCount) card.append(meta);
    return card;
  }

  function renderGrid(id, items, type) {
    const grid = $(id);
    if (!grid) return;
    grid.replaceChildren();
    if (!items.length) {
      grid.append(textNode('p', 'item-empty', 'アイテムデータを読み込めませんでした。ゲーム本体へ戻ってください。'));
      return;
    }
    items.forEach((item, index) => grid.append(renderCard(item, index, type)));
  }

  renderGrid('augmentGrid', upgradeCatalog, 'augment');
  renderGrid('gearGrid', gearCatalog, 'gear');
})();
