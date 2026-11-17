(() => {
  'use strict';
  const campaign = globalThis.NeonCampaign;
  const integerFormat = new Intl.NumberFormat('ja-JP');
  const mods = {
    runner: '加速処置 · 初回でダッシュ再使用を短縮',
    samurai: '耐熱処置 · 初回で冷却速度を強化',
    summoner: '神経直結 · 初回でドローン射撃間隔を短縮',
    lineman: '加速処置 · 初回でダッシュ再使用を短縮'
  };
  const slots = { weapon: '攻撃装備', armor: '防御装備' };

  function node(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  }

  function button(label, control, action, className = 'campaign-button') {
    const el = node('button', className, label);
    el.type = 'button';
    el.dataset.control = control;
    el.addEventListener('click', action);
    return el;
  }

  class NeonCampaignUI {
    constructor(screen, profile, actions) {
      this.screen = screen;
      this.profile = profile;
      this.actions = actions;
      this.companyId = campaign.COMPANIES[0].id;
      this.operative = profile.team.members[0];
      this.tab = 'board';
      this.offerId = null;
      this.rank = null;
    }

    static format(value) {
      const digits = String(value);
      return digits.length > 15 ? `${digits[0]}.${digits.slice(1, 4)}e${digits.length - 1}` : integerFormat.format(value);
    }

    open() {
      this.tab = 'board';
      this.offerId = null;
      this.screen.classList.remove('hidden');
      this.render();
      this.screen.scrollTop = 0;
      this.screen.querySelector('h2').focus();
    }

    close() { this.screen.classList.add('hidden'); }

    render() {
      const focus = document.activeElement?.dataset.control;
      const company = campaign.COMPANIES.find(item => item.id === this.companyId);
      this.screen.style.setProperty('--dispatch-color', company.color);
      const shell = node('div', 'campaign-shell');
      const header = node('header', 'campaign-header');
      const heading = node('h2', '', '回収屋のアジト');
      heading.tabIndex = -1;
      const funds = node('div', 'campaign-funds');
      funds.append(node('span', '', 'チーム資金'), node('strong', '', NeonCampaignUI.format(this.profile.cash)));
      const close = button('タイトルへ', 'close', this.actions.close, 'icon-button campaign-close');
      header.append(heading, funds, close);
      const nav = node('nav', 'campaign-nav');
      nav.setAttribute('aria-label', 'アジトのメニュー');
      for (const [id, label] of [['board', '依頼掲示板'], ['team', 'チームと装備']]) {
        const tab = button(label, id, () => { this.tab = id; this.render(); });
        tab.setAttribute('aria-pressed', String(this.tab === id));
        nav.append(tab);
      }
      shell.append(header, nav, this.tab === 'board' ? this.renderBoard() : this.renderTeam());
      this.screen.replaceChildren(shell);
      if (focus) this.screen.querySelector(`[data-control="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
    }

    renderBoard() {
      const content = node('div', 'campaign-board');
      const companyList = node('div', 'campaign-companies');
      companyList.setAttribute('role', 'group');
      companyList.setAttribute('aria-label', '対象企業');
      for (const company of campaign.COMPANIES) {
        const el = button('', `company-${company.id}`, () => { this.companyId = company.id; this.offerId = null; this.render(); });
        el.setAttribute('aria-pressed', String(company.id === this.companyId));
        el.title = company.nameJa;
        el.style.setProperty('--company-color', company.color);
        const record = this.profile.companies[company.id].highestClear;
        el.append(node('b', '', company.name), node('small', '', `${company.industry} · 最高 ${record > 0n ? NeonCampaignUI.format(record) : '—'}`));
        companyList.append(el);
      }
      const offers = campaign.offers(this.profile, this.companyId, this.rank);
      const offer = offers.find(item => item.id === this.offerId) || offers[0];
      this.offerId = offer?.id || null;
      const columns = node('div', 'campaign-columns');
      const list = node('div', 'campaign-offers');
      for (const item of offers) {
        const card = button('', `offer-${item.id}`, () => { this.offerId = item.id; this.render(); }, 'campaign-offer');
        card.setAttribute('aria-pressed', String(item.id === this.offerId));
        const top = node('span', 'campaign-offer-top');
        top.append(node('span', '', `危険ランク ${NeonCampaignUI.format(item.rank)}`), node('strong', '', `報酬 ${NeonCampaignUI.format(item.reward)}`));
        card.append(top, node('b', '', item.facilityName), node('small', '', `${item.entranceName} · ${item.client}`), node('span', 'campaign-objective', item.flavor || `${item.objective}を回収`));
        card.append(node('small', item.alert ? 'campaign-alert' : 'campaign-route-note', item.warning));
        list.append(card);
      }
      if (!offers.length) list.append(node('p', '', '掲載中の依頼はありません。'));
      columns.append(list, this.renderDispatch(offer));
      content.append(companyList);
      if (this.profile.highestClearance > 0n) content.append(this.rankFilter());
      content.append(columns);
      return content;
    }

    rankFilter() {
      const form = node('form', 'campaign-rank');
      const field = node('label');
      const rank = node('input');
      rank.inputMode = 'numeric';
      rank.pattern = '[0-9]+';
      rank.value = this.rank?.toString() ?? '';
      rank.placeholder = `1〜${NeonCampaignUI.format(this.profile.highestClearance + 1n)}`;
      field.append(node('span', '', '危険ランク'), rank);
      const apply = node('button', 'campaign-button', '絞り込む');
      apply.type = 'submit';
      apply.dataset.control = 'rank-apply';
      const reset = button('おすすめに戻す', 'rank-reset', () => { this.rank = null; this.offerId = null; this.render(); });
      reset.hidden = this.rank === null;
      form.addEventListener('submit', event => {
        event.preventDefault();
        const value = rank.value.trim();
        const selected = /^\d+$/.test(value) ? BigInt(value) : null;
        if (selected === null || selected < 1n || selected > this.profile.highestClearance + 1n) {
          this.actions.message('解放済みの危険ランクを入力してください。');
          return;
        }
        this.rank = selected;
        this.offerId = null;
        this.render();
      });
      form.append(field, apply, reset);
      return form;
    }

    operativePicker() {
      const list = node('div', 'campaign-operatives');
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', '担当キャラ');
      for (const id of this.profile.team.members) {
        const operative = campaign.OPERATIVES.find(item => item.id === id);
        const body = globalThis.NeonAppearance.BODIES[id];
        const el = button('', `operative-${id}`, () => { this.operative = id; this.render(); });
        el.setAttribute('aria-pressed', String(id === this.operative));
        el.style.setProperty('--body-color', body.color);
        if (body.portrait) {
          const image = node('img', 'campaign-avatar');
          image.src = body.portrait;
          image.alt = '';
          el.append(image);
        }
        const label = node('span');
        label.append(node('b', '', operative.name), node('small', '', operative.role));
        el.append(label);
        list.append(el);
      }
      return list;
    }

    renderDispatch(offer) {
      const panel = node('section', 'campaign-panel');
      panel.append(node('h3', '', '出撃準備'), this.operativePicker());
      const profile = this.profile;
      panel.append(node('p', 'campaign-body-grade', `人体改造 ${NeonCampaignUI.format(profile.modRanks[this.operative])} 段階`));
      const kit = node('div', 'campaign-kit');
      for (const [slot, label] of Object.entries(slots)) {
        const field = node('label', 'campaign-gear-field');
        const select = node('select');
        select.dataset.control = `gear-${slot}`;
        const blank = node('option', '', '装備なし');
        blank.value = '';
        select.append(blank);
        for (const item of campaign.GEAR.filter(item => item.slot === slot && profile.gearRanks[item.id] > 0n)) {
          const option = node('option', '', `${item.name} · Lv${NeonCampaignUI.format(profile.gearRanks[item.id])}`);
          option.value = item.id;
          select.append(option);
        }
        select.value = profile.equipped[this.operative][slot] || '';
        select.addEventListener('change', () => {
          const equipped = select.value ? campaign.equip(profile, this.operative, select.value) : campaign.unequip(profile, this.operative, slot);
          if (equipped) this.actions.save();
          this.render();
        });
        field.append(node('span', '', label), select);
        kit.append(field);
      }
      panel.append(kit);
      const launch = button(offer ? `出撃 · ${offer.facilityName}` : '出撃', 'launch', () => {
        if (!this.actions.dispatch(offer, this.operative, this.rank)) this.actions.message('依頼を開始できません。掲示板を確認してください。');
      }, 'primary-button campaign-dispatch');
      launch.disabled = !offer;
      panel.append(launch);
      return panel;
    }

    purchaseCard(type, id, name, description, stateLabel, actionLabel) {
      const card = node('article', 'campaign-store-card');
      const cost = campaign.quote(this.profile, type, id);
      card.append(node('b', '', name), node('small', '', stateLabel), node('p', '', description));
      if (cost !== null) {
        const buy = button(`${actionLabel} · ${NeonCampaignUI.format(cost)}`, `buy-${type}-${id}`, () => {
          const result = campaign.purchase(this.profile, type, id);
          if (!result) return;
          if(this.actions.save()) this.actions.message(`${name} · ${actionLabel}完了`);
          this.render();
        });
        buy.disabled = cost > this.profile.cash;
        card.append(buy);
      }
      return card;
    }

    renderTeam() {
      const panel = node('div', 'campaign-team');
      const crew = node('section', 'campaign-panel');
      crew.append(node('h3', '', '人体改造'), this.operativePicker());
      const { id, name } = campaign.OPERATIVES.find(item => item.id === this.operative);
      const grade = this.profile.modRanks[id];
      crew.append(this.purchaseCard('mod', id, name, `${mods[id]}。各段階で火力と耐久が向上。`, `現在 ${NeonCampaignUI.format(grade)} 段階`, '施術'));
      const recruits = node('section', 'campaign-panel');
      recruits.append(node('h3', '', 'メンバー募集'));
      for (const operative of campaign.OPERATIVES.filter(item => item.cost > 0n)) {
        const joined = this.profile.team.members.includes(operative.id);
        const state = joined ? '加入済み' : this.profile.completedJobs > 0n ? '契約可能' : '初仕事の納品後に契約可能';
        recruits.append(this.purchaseCard('recruit', operative.id, operative.name, '元送電所の保守員。ダッシュの軌跡に、警備機を止めるワイヤーを張る。', state, '契約'));
      }
      const shop = node('section', 'campaign-panel campaign-shop');
      shop.append(node('h3', '', '共用装備'));
      const grid = node('div', 'campaign-store-grid');
      for (const item of campaign.GEAR) {
        const grade = this.profile.gearRanks[item.id];
        grid.append(this.purchaseCard('gear', item.id, item.name, item.description, `${slots[item.slot]} · ${grade > 0n ? 'Lv' + NeonCampaignUI.format(grade) : '未購入'}`, grade > 0n ? '強化' : '購入'));
      }
      shop.append(grid);
      panel.append(crew, recruits, shop);
      return panel;
    }
  }

  globalThis.NeonCampaignUI = NeonCampaignUI;
})();
