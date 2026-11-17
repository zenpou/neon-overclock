(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const shareDialog=$('shareDialog');
  const publicUrl=document.querySelector('link[rel="canonical"]')?.href;
  let shareData=null;
  const names=['侵入口 / THE BREACH','貨物区画 / CARGO ZERO','神経回廊 / NEURAL LINK','製造区画 / BLACK FORGE','記憶保管庫 / LOST MEMORY','違法研究棟 / GOD COMPLEX','防衛中枢 / POINT OF NO RETURN','管理AI / CERBERUS'];
  const bodies={runner:'ARC RUNNER',samurai:'HEAT SAMURAI',summoner:'GHOST ENGINEER',lineman:'LIVEWIRE TECH'};
  const appearance=globalThis.NeonAppearance;
  const familyPreviewIds={lightning:'chain_core',heat:'overclock',drone:'drone_fabricator',virus:'virus_seed',armor:'phase_shield',mobility:'dash_reactor'};
  const familySymbols={lightning:'ϟ',heat:'♨',drone:'⌘',virus:'⌬',armor:'✚',mobility:'╱'};
  function createItemIcon(id,className){
    const image=document.createElement('img');
    image.className=`item-icon ${className}`;
    image.src=`assets/sprites/items/${id}.png`;
    image.alt='';
    image.decoding='async';
    return image;
  }
  const storage={get(k,fallback){try{return JSON.parse(localStorage.getItem('neon.'+k))??fallback;}catch{return fallback;}},set(k,v){try{localStorage.setItem('neon.'+k,JSON.stringify(v));}catch{}}};
  const campaign=globalThis.NeonCampaign;
  let savedProfile=storage.get('campaign',null);
  const profile=campaign?.createProfile(savedProfile,storage.get('clears',0));
  let assignment=null, settlement=null;
  function saveProfile(){
    const actual=storage.get('campaign',null);
    if(JSON.stringify(actual)!==JSON.stringify(savedProfile)){
      savedProfile=actual;
      Object.assign(profile,campaign.createProfile(actual,storage.get('clears',0)));
      toast('別のタブで記録が更新されました。最新の記録を表示します。');
      return false;
    }
    storage.set('campaign',campaign.serialize(profile));
    savedProfile=storage.get('campaign',null);
    return true;
  }
  class AudioSystem {
    constructor(){this.enabled=false;this.ctx=null;this.step=0;this.next=0;this.intensity=0;this.lastShot=0;this.lastBoom=0;this.lastZap=0;this.lastHit=0;}
    unlock(){if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;this.ctx=new AC();this.master=this.ctx.createGain();this.master.gain.value=.19;const compressor=this.ctx.createDynamicsCompressor();this.master.connect(compressor);compressor.connect(this.ctx.destination);}if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});}
    toggle(){this.unlock();this.enabled=!this.enabled;if(this.master)this.master.gain.setTargetAtTime(this.enabled?.19:0,this.ctx.currentTime,.08);this.next=this.ctx?.currentTime||0;return this.enabled;}
    tone(freq,duration,type='sine',gain=.2,end=0,when){if(!this.enabled||!this.ctx)return;const t=when??this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(20,freq),t);if(end)o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(gain,t+.006);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.01);}
    noise(duration,gain=.15,when){if(!this.enabled||!this.ctx)return;const t=when??this.ctx.currentTime,b=this.ctx.createBuffer(1,Math.ceil(this.ctx.sampleRate*duration),this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);const s=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();f.type='highpass';f.frequency.value=1700;s.buffer=b;g.gain.value=gain;s.connect(f);f.connect(g);g.connect(this.master);s.start(t);}
    update(playing,heat){if(!this.enabled||!this.ctx||!playing){if(this.ctx)this.next=this.ctx.currentTime;return;}const now=this.ctx.currentTime;if(this.next<now-.2)this.next=now;while(this.next<now+.08){const n=this.step%16,t=this.next;if(n%4===0)this.tone(145,.19,'sine',.6,38,t);if(n%8===4)this.noise(.12,.25,t);if(n%2===0)this.noise(.025,.07,t);const bass=[55,55,82.41,55,65.41,55,73.42,49][Math.floor(n/2)];if(n%2===0)this.tone(bass,.14,'sawtooth',.055,0,t);if(heat>.45||n%4===2){const notes=[220,329.63,440,293.66,261.63,392,523.25,246.94];this.tone(notes[(this.step*3)%8],.09,'triangle',.035,0,t);}this.step++;this.next+=60/132/4;}}
    event(e){if(!this.enabled||!this.ctx)return;const now=this.ctx.currentTime;switch(e.type){case'shot':if(now-this.lastShot>.08){this.tone(600,.045,'square',.035,100);this.lastShot=now;}break;case'kill':this.tone(120,.15,'sawtooth',.12,30);this.noise(.1,.12);break;case'dash':this.tone(180,.14,'sawtooth',.09,1200);break;case'hack':this.tone(1600,.4,'sine',.15,80);this.tone(700,.28,'square',.03,120);break;case'ultimate':this.tone(90,1.3,'sawtooth',.32,22);this.noise(.6,.3);this.tone(1500,.6,'triangle',.15,100);break;case'damage':this.noise(.15,.2);this.tone(70,.2,'square',.12,30);break;case'chestOpen':for(let i=0;i<5;i++)this.tone([330,440,554,660,880][i],.5,'triangle',.18,0,now+i*.1);this.noise(.18,.1);break;case'upgrade':this.tone(440,.15,'sine',.14);this.tone(660,.25,'sine',.14,0,now+.1);this.tone(880,.3,'sine',.14,0,now+.2);break;case'slash':this.noise(.09,.15);this.tone(900,.08,'sawtooth',.04,220);break;
      // Frequent events are rate-limited like 'shot' so dense fights do not smear into noise.
      case'explosion':if(now-this.lastBoom>.07){this.tone(95,.22,'sine',.16,34);this.noise(.14,.1);this.lastBoom=now;}break;
      case'lightning':if(now-this.lastZap>.06){this.tone(2400,.07,'sawtooth',.03,400);this.lastZap=now;}break;
      case'hit':if(now-this.lastHit>.05){this.tone(1300,.03,'triangle',.025,700);this.lastHit=now;}break;
      case'pickup':this.tone(880,.08,'sine',.09);this.tone(1320,.12,'sine',.08,0,now+.06);break;
      case'overheat':this.tone(420,.5,'sawtooth',.1,60);this.noise(.4,.12);break;
      case'cool':this.tone(300,.3,'sine',.07,1200);break;
      case'shield':this.tone(1800,.18,'triangle',.12,500);this.noise(.08,.14);break;
      case'chestDrop':this.tone(660,.2,'triangle',.1);this.tone(990,.35,'triangle',.1,0,now+.12);break;
      case'boss':case'bossPhase':this.tone(55,1.4,'sawtooth',.3,28);this.tone(58,1.4,'square',.12,30);for(let i=0;i<3;i++)this.tone(440,.22,'square',.08,415,now+i*.32);this.noise(.5,.16);break;
      case'midboss':this.tone(61,.64,'sawtooth',.18,39);this.tone(310,.26,'square',.06,240,now+.14);break;
      case'floorClear':for(let i=0;i<4;i++)this.tone([392,523.25,659.25,783.99][i],.35,'triangle',.14,0,now+i*.09);this.tone(98,.6,'sine',.2,49);break;
      case'victory':for(let i=0;i<8;i++)this.tone([261.63,329.63,392,523.25,659.25,783.99,1046.5,1318.5][i],.7,'triangle',.15,0,now+1.7+i*.12);this.tone(60,2.2,'sawtooth',.3,24);this.noise(1.2,.25);break;
      case'death':this.tone(220,1.3,'sawtooth',.2,28);this.tone(110,1.5,'square',.1,20);this.noise(.7,.25);break;
      case'start':this.tone(110,.5,'sawtooth',.12,880);this.noise(.2,.1);break;
      case'resonance':for(let i=0;i<3;i++)this.tone([523.25,783.99,1046.5][i],.5,'sine',.14,0,now+i*.14);this.tone(130.81,.9,'triangle',.12);break;
      case'heatwave':case'counter':this.tone(140,.3,'sawtooth',.14,40);this.noise(.2,.14);break;}}
  }
  const audio=new AudioSystem();const renderer=new NeonRenderer($('game'));
  let selected='runner',paused=false,inRun=false,lastState='title',lastTime=0,hudTimer=0,toastTimer,runSerial=0,previewLast=0,freeze=0,slowTime=0,slowScale=1,hold=0,holdAction=null,lastCombo=0,lastStop=-1e9;
  const lab={open:false,inGameplay:false,previousPaused:false,loadout:'runner',upgrades:[]};
  let keys={},queued={},touch={x:0,y:0};
  const upgradeInfo=new Map();
  const touchInput=matchMedia('(pointer: coarse)');
  const joy=$('joystick');
  const mobileControls=$('mobileControls');
  const actionButtons=mobileControls.querySelectorAll('[data-action]');
  const abilityDisplays={
    dash:document.querySelectorAll('[data-ability-status="dash"]'),
    hack:document.querySelectorAll('[data-ability-status="hack"]'),
    ultimate:document.querySelectorAll('[data-ability-status="ultimate"]')
  };
  let joystickPointer=null;

  function resetJoystick(){
    const pointer=joystickPointer;
    joystickPointer=null;
    touch.x=touch.y=0;
    joy.firstElementChild.style.transform='';
    if(pointer!==null&&joy.hasPointerCapture(pointer))joy.releasePointerCapture(pointer);
  }
  function clearInput(){
    keys={};
    queued={};
    resetJoystick();
  }
  function canAct(){return inRun&&!paused&&engine.state==='playing';}
  function updateControls(){
    const active=canAct()&&touchInput.matches;
    mobileControls.classList.toggle('hidden',!active);
    for(const button of actionButtons)button.disabled=!active;
  }
  function queueAction(action){
    if(!canAct())return;
    if(action==='ultimate'&&engine.player.energy<engine.player.maxEnergy){
      toast('BLACKOUT充填中。敵を倒してエネルギーを集めよう');
    }
    queued[action]=true;
  }
  const engine=new NeonEngine({onEvent:handleEvent});
  const campaignUI=$('campaignScreen')&&profile?new NeonCampaignUI($('campaignScreen'),profile,{
    save:saveProfile, close:title, message:toast, dispatch(offer,body,requestedRank){
      const config=campaign.combatConfig(profile,body,offer);
      if(!config)return false;
      if(profile.activeRun)campaign.abandon(profile,profile.activeRun);
      const receipt=campaign.begin(profile,offer.id,offer.companyId,requestedRank);
      if(!receipt)return false;
      if(!saveProfile()){campaignUI.render();return false;}
      assignment={receipt,offer};
      start(body,config);
      return true;
    }
  }):null;
  function canOpenCampaign(){return !!(campaignUI&&profile.unlocked);}
  function updateCampaignEntry(){$('campaignButton')?.classList.toggle('hidden',!canOpenCampaign());}
  function openCampaign(){
    if(!canOpenCampaign())return;
    title();
    $('titleScreen').classList.add('hidden');
    campaignUI.open();
  }
  // Read-only snapshot used by local smoke tests and performance inspection.
  window.neonGame={getSnapshot:()=>({state:engine.state,paused,hold,sector:engine.sector?.id||null,threat:engine.threat,resonance:{...engine.resonance},routeOptions:engine.routeOptions.map(option=>option.id),floor:engine.floor,hp:engine.player.hp,heat:engine.player.heat,energy:engine.player.energy,score:engine.score,kills:engine.kills,elapsed:engine.elapsed,enemies:engine.enemies.length,bullets:engine.bullets.length,particles:renderer.particles.length,upgrades:[...engine.upgrades],loadout:engine.loadout,player:{x:engine.player.x,y:engine.player.y},fps:Math.round(fps)}),getPerf:()=>perfReport()};
  let fps=60;
  // Frame-time meter: open index.html?perf or press F2. It samples real frame intervals during
  // combat only (paused frames and menus are skipped), so the numbers describe actual play.
  const perf={on:/[?&]perf\b/.test(location.search),el:null,samples:[],worst:0,peak:0,tick:0};
  function perfReport(){const sorted=perf.samples.slice().sort((a,b)=>a-b),n=sorted.length;if(!n)return null;const avg=sorted.reduce((a,b)=>a+b,0)/n;return{frames:n,fps:+(1000/avg).toFixed(1),p95Ms:+sorted[Math.floor(n*.95)].toFixed(1),over20Pct:+(sorted.filter(v=>v>20).length/n*100).toFixed(1),worstMs:+perf.worst.toFixed(1),peakParticles:perf.peak,fx:renderer.ultra?'ULTRA':'LITE'};}
  function perfSample(ms){if(ms>500)return;perf.samples.push(ms);if(perf.samples.length>600)perf.samples.shift();perf.worst=Math.max(perf.worst,ms);perf.peak=Math.max(perf.peak,renderer.particles.length);if(!perf.on||++perf.tick%30)return;if(!perf.el){perf.el=document.createElement('div');perf.el.style.cssText='position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:30;padding:6px 12px;background:#050a13e6;border:1px solid #5af6f355;color:#5af6f3;font:11px monospace;letter-spacing:1px;pointer-events:none;white-space:nowrap';$('stage').append(perf.el);}const r=perfReport();perf.el.textContent=`FPS ${r.fps} · p95 ${r.p95Ms}ms · 20ms超 ${r.over20Pct}% · 最悪 ${r.worstMs}ms · 粒子最大 ${r.peakParticles} · FX ${r.fx}（直近${r.frames}フレーム）`;}
  function togglePerf(){perf.on=!perf.on;if(perf.el)perf.el.style.display=perf.on?'':'none';perf.samples=[];perf.worst=0;perf.peak=0;toast(perf.on?'PERF // 戦闘中のフレーム時間を表示':'PERF // 非表示');}
  function resolveAppearance(loadout,upgrades){return appearance?.resolve?appearance.resolve(loadout,upgrades):{loadout,body:null,total:0,stage:0,stageLabel:'BASE BODY',stageLabelEn:'BASE BODY',dominant:null,families:[],signature:`${loadout}|s0|none`};}
  function drawBodyPreview(canvas,visual){if(canvas&&typeof renderer.drawBodyPreview==='function')renderer.drawBodyPreview(canvas,visual);}
  function syncRendererAppearance(){const visual=resolveAppearance(engine.loadout,engine.upgrades);if(typeof renderer.setAppearance==='function')renderer.setAppearance(engine.loadout,engine.upgrades.slice());drawBodyPreview($('hudBodyPreview'),visual);updateAppearanceHud(visual);return visual;}
  function updateTitleBodyVisual(){const visual=resolveAppearance(selected,[]),body=appearance?.BODIES?.[selected];if(typeof renderer.setPreviewLoadout==='function')renderer.setPreviewLoadout(selected);drawBodyPreview($('titleBodyPreview'),visual);const portrait=$('titlePortrait');if(portrait){portrait.src=body?.portrait||`assets/characters/${selected}.png`;portrait.alt=`${body?.label||bodies[selected]} の全身ポートレート`;}$('titleBodyName').textContent=body?.label||bodies[selected];$('titleBodyRole').textContent=body?.role||'';$('titleBodyStage').textContent=visual.stageLabelEn||'BASE BODY';document.querySelectorAll('.loadout').forEach(button=>button.classList.toggle('selected',button.dataset.loadout===selected));}
  function updateAppearanceHud(visual=resolveAppearance(engine.loadout,engine.upgrades)){const stage=$('appearanceStageLabel');if(stage)stage.textContent=visual.stageLabelEn||visual.stageLabel||'BASE BODY';const meter=$('appearanceStageMeter');if(meter){meter.replaceChildren();for(let i=1;i<=3;i++){const pip=document.createElement('i');pip.className=i<=visual.stage?'active':'';meter.append(pip);}}drawBodyPreview($('hudBodyPreview'),visual);}
  function whenAssetsReady(fn){const ready=renderer.assetsReady;if(ready&&typeof ready.then==='function')ready.then(fn,fn);else fn();}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
  function animate(el){el.classList.remove('show');void el.offsetWidth;el.classList.add('show');}
  // Hit-stop freezes the simulation for a few frames; slow motion stretches the set-piece beats.
  // Both take the maximum rather than accumulating, and hit-stop is skipped for reduced motion.
  // Routine hit-stops share a cooldown: late floors kill heavies constantly, and unthrottled
  // freezes were eating 15-17% of play time there.
  function hitStop(seconds,cooldown=0){if(renderer.reduced)return;if(cooldown&&lastTime-lastStop<cooldown*1000)return;lastStop=lastTime;freeze=Math.max(freeze,seconds);}
  function slowMotion(seconds,scale){slowTime=Math.max(slowTime,seconds);slowScale=scale;}
  function pulse(el,name){el.classList.remove(name);void el.offsetWidth;el.classList.add(name);}
  function handleEvent(e){renderer.event(e);audio.event(e);
    if(e.type==='kill'){if(e.enemyType==='boss')slowMotion(.9,.25);else if(e.midboss)hitStop(.09);else if(e.enemyType==='tank'||e.enemyType==='elite')hitStop(.04,.8);}
    if(e.type==='damage'){hitStop(.05,.4);pulse($('hud'),'hurt');}
    if(e.type==='ultimate'){hitStop(.07);slowMotion(.3,.5);}
    if(e.type==='death')slowMotion(1,.3);
    if(e.type==='chestOpen')hitStop(.08);
    if(e.type==='boss'){pulse($('bossBar'),'enter');addFeed(`${e.name||'CERBERUS'} // 適応装甲 ONLINE`);toast('適応装甲 // 過剰な火力は減衰される。弾幕を避けて削り切れ');}
    if(e.type==='bossPhase'){hitStop(.1);slowMotion(.5,.4);pulse($('bossBar'),'enter');$('bossBar').classList.add('rage');addFeed(`${engine.contract?.bossName||'CERBERUS'} // LIMITER RELEASED`);toast('第2形態 // 弾幕が激化。ダッシュの無敵で抜けろ');}
    if(e.type==='midboss'){
      pulse($('bossBar'),'enter');
      toast('撃破でEPIC DATA VAULT');
    }
    if(e.type==='floorClear')banner('SECTOR CLEARED','CLEAR',floorName(e.floor),'clear-banner');
    if(e.type==='shield')addFeed('PHASE SHIELD // 被弾を無効化');if(e.type==='floor')announce(e.floor,e.sector);if(e.type==='threat')addFeed(`THREAT LEVEL ${e.amount} // 敵が強化された`);if(e.type==='resonance'){toast(`${e.name} Lv${e.level} // ${e.text}`);addFeed(`RESONANCE // ${e.name} Lv${e.level}`);updateResonance();}if(e.type==='chestDrop')toast('DATA VAULT出現 // 光の柱へ。ダッシュで回収できる');if(e.type==='ultimate')animate($('ultimateBanner'));if(e.type==='overheat')toast('CORE OVERHEAT // 冷却中は攻撃停止。回避に集中！');if(e.type==='kill'&&e.combo>0&&e.combo%10===0)addFeed(`${e.combo} CHAIN // SYSTEM COLLAPSE`);if(e.type==='hack')addFeed('SYSTEM HACK // 敵システムを一時停止');if(e.type==='damage'&&engine.player.hp<25)toast('装甲限界。ダッシュで離脱し、緑の医療セルを回収');}
  function floorName(floor){
    if(!engine.contract)return names[floor-1]?.split(' / ')[0]||'';
    if(floor===engine.finalFloor)return engine.contract.bossName;
    return floor===1?engine.contract.entranceName:engine.contract.facilityName;
  }
  function announce(floor,sector){
    const banner=$('announcement'),boss=floor===engine.finalFloor;
    banner.classList.remove('clear-banner');
    banner.classList.toggle('sector-banner',!boss);
    banner.classList.toggle('boss-warning',boss);
    banner.querySelector('small').textContent=boss?'WARNING // FINAL BREACH':'';
    banner.querySelector('strong').textContent=boss?(engine.contract?.bossName||'CERBERUS'):`SECTOR ${String(floor).padStart(2,'0')}`;
    banner.querySelector('span').textContent=(boss&&engine.contract?engine.contract.facilityName:floorName(floor))+(sector?' — '+sector.label:'');
    banner.style.setProperty('--sector-color',sector?.color||'');
    animate(banner);
    updateResonance();
  }
  // Resonance chips: one per family the run has grown, with filled pips for its level.
  function updateResonance(){
    const box=$('resonanceIcons');if(!box)return;box.replaceChildren();
    for(const def of NeonEngine.RESONANCE){const level=engine.resonance?.[def.family]||0;if(!level)continue;const family=NeonEngine.FAMILIES.find(item=>item.id===def.family);const chip=document.createElement('span');chip.className='resonance-chip';chip.style.setProperty('--family-color',family.color);chip.textContent=family.label+' '+'●'.repeat(level)+'○'.repeat(3-level);chip.title=def.name+'\n'+def.levels.slice(0,level).join('\n');box.append(chip);}
    box.classList.toggle('hidden',!box.children.length);
  }
  function banner(small,strong,span,className){
    const el=$('announcement');
    el.classList.remove('sector-banner','boss-warning','clear-banner');
    el.classList.add(className);
    el.querySelector('small').textContent=small;
    el.querySelector('strong').textContent=strong;
    el.querySelector('span').textContent=span;
    animate(el);
  }
  function addFeed(text){const el=document.createElement('span');el.textContent=text;$('killFeed').prepend(el);while($('killFeed').children.length>4)$('killFeed').lastChild.remove();setTimeout(()=>el.remove(),4100);}
  function start(body=selected,contract=null){
    settlement=null;
    runSerial++;
    lastStop=-1e9;
    $('resonanceIcons')?.replaceChildren();
    freeze=0;
    slowTime=0;
    hold=0;
    holdAction=null;
    lastCombo=0;
    $('bossBar').classList.remove('rage','enter');
    lab.open=false;
    lab.inGameplay=false;
    clearInput();
    paused=false;
    inRun=true;
    campaignUI?.close();
    renderer.clear();
    upgradeInfo.clear();
    $('killFeed').replaceChildren();
    $('buildIcons').replaceChildren();
    for(const id of ['titleScreen','pauseScreen','choiceScreen','resultScreen','bodyLabScreen','chestScreen','lootTracker']){
      $(id).classList.add('hidden');
    }
    $('hud').classList.remove('hidden');
    audio.unlock();
    engine.start(body,contract);
    globalThis.gtag?.('event', 'game_start');
    updateControls();
    if(typeof renderer.setAppearance==='function')renderer.setAppearance(body,[]);
    lastState='playing';
    $('bodyLabel').textContent=bodies[body];
    syncRendererAppearance();
    updateHud();
    toast(touchInput.matches?'左スティックで移動 · 攻撃は自動':'WASDで移動 · SPACEで無敵ダッシュ · 攻撃は自動');
    $('startButton').blur();
  }
  function title(){
    if(assignment){
      if(campaign.settle(profile,assignment.receipt,false))saveProfile();
      assignment=null;
    }
    campaignUI?.close();
    runSerial++;
    freeze=0;
    slowTime=0;
    hold=0;
    holdAction=null;
    inRun=false;
    paused=false;
    clearInput();
    lab.open=false;
    lab.inGameplay=false;
    renderer.clear();
    for(const id of ['hud','pauseScreen','choiceScreen','resultScreen','bodyLabScreen','chestScreen','lootTracker']){
      $(id).classList.add('hidden');
    }
    updateControls();
    $('titleScreen').classList.remove('hidden');
    $('titleScreen').scrollTop=0;
    $('announcement').classList.remove('show');
    $('ultimateBanner').classList.remove('show');
    $('toast').classList.remove('show');
    lastState='title';
    updateBest();
    updateCampaignEntry();
    updateTitleBodyVisual();
  }
  function setPause(value){
    if(!inRun||lab.open||engine.state!=='playing')return;
    paused=value;
    clearInput();
    $('pauseScreen').classList.toggle('hidden',!paused);
    updateControls();
  }
  function updateBest(){const best=storage.get('best',0);$('bestScore').textContent=best?'BEST '+String(best).padStart(6,'0'):'BEST —';}
  function updateHud(){updateLootTracker();const p=engine.player,s=engine.build.stats,contract=engine.contract;$('hpValue').textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;$('hpBar').style.width=Math.max(0,p.hp/p.maxHp*100)+'%';$('hpBar').style.background=p.hp<30?'#ff4e8b':'#5af6f3';const heat=Math.min(100,p.heat/(s.heat||100)*100);$('heatValue').textContent=Math.round(heat)+'%';$('heatBar').style.width=heat+'%';$('heatLabel').textContent=p.overheated?'!! OVERHEAT — COOLING':'CORE TEMPERATURE';$('heatBar').style.background=p.overheated?'#ff4e8b':'#ffac57';$('scoreValue').textContent=String(Math.floor(engine.score)).padStart(6,'0');$('runTime').textContent=formatTime(engine.elapsed);$('floorLabel').textContent=`SECTOR ${String(engine.floor).padStart(2,'0')} / ${String(engine.finalFloor).padStart(2,'0')}`+(contract?' · 危険 '+NeonCampaignUI.format(contract.rank):'')+(engine.sector?' · '+engine.sector.label:'')+(engine.threat?' · 脅威度 '+engine.threat:'');$('floorLabel').style.color=engine.sector?.color||contract?.color||'';$('floorName').textContent=floorName(engine.floor);$('floorProgress').style.width=Math.min(100,engine.floorKills/Math.max(1,engine.floorQuota)*100)+'%';$('objective').textContent=engine.floor===engine.finalFloor?(contract?`防衛機を破壊して${contract.objective}を回収`:'管理AIを破壊し、所有権を奪還せよ'):`警備ユニット排除 ${engine.floorKills} / ${engine.floorQuota}`;$('combo').style.opacity=engine.combo>=3?'1':'0';$('combo').querySelector('strong').textContent=engine.combo;$('combo').dataset.tier=engine.combo>=50?'3':engine.combo>=25?'2':engine.combo>=10?'1':'0';if(engine.combo>lastCombo&&engine.combo>=3)pulse($('combo'),'bump');lastCombo=engine.combo;$('hud').classList.toggle('critical',p.hp/p.maxHp<.3&&engine.state==='playing');updateAppearanceHud();
    showCooldown('dash',p.dashCooldown,Math.max(.35,engine._stats?.dashCooldown||.9));
    showCooldown('hack',p.hackCooldown,6);
    const energy=Math.min(100,p.energy/(p.maxEnergy||100)*100);
    const charged=energy>=100;
    for(const display of abilityDisplays.ultimate){
      const label=charged?(display.matches('button')?'READY':'READY // 解放可能'):Math.floor(energy)+'%';
      showAbilityStatus(display,label,energy);
      display.classList.toggle('ready',charged);
    }
    const guard=engine.enemies.find(e=>e.type==='boss'||e.midboss);
    const bar=$('bossBar');
    bar.classList.toggle('hidden',!guard);
    bar.classList.toggle('raid-guard',!!(contract&&guard));
    $('lootTracker').classList.toggle('under-raid-guard',!!(contract&&guard));
    if(guard){
      bar.querySelector('span').textContent=guard.midboss?`中ボス · ${guard.name}`:guard.name||'SECURITY GOD // CERBERUS';
      bar.querySelector('i').style.width=Math.max(0,guard.hp/guard.maxHp*100)+'%';
    }
    updateEnemyIntel(guard||engine._nearestEnemy(),guard);
  }
  function updateEnemyIntel(enemy,guard){
    const readout=$('enemyIntel'),weakness=enemy?.weakness;
    if(!readout)return;
    readout.classList.toggle('hidden',!weakness);
    if(!weakness)return;
    const container=guard?$('bossBar'):$('objective').parentElement;
    if(readout.parentElement!==container)container.append(readout);
    const identity=guard?'':`${enemy.name} · `;
    const text=`${identity}${weakness.glyph} 弱点 ${weakness.label}`;
    if(readout.textContent!==text)readout.textContent=text;
    readout.title=`${enemy.name}　弱点 ${weakness.label}　耐性 ${weakness.resistLabel}`;
    readout.style.setProperty('--weak-color',weakness.color);
  }
  function showAbilityStatus(display,label,progress){
    display.querySelector('small').textContent=label;
    display.querySelector('i').style.width=progress+'%';
  }
  function showCooldown(action,cooldown,max){
    const label=cooldown>0?cooldown.toFixed(1)+'s':'READY';
    const progress=(1-Math.min(1,cooldown/max))*100;
    for(const display of abilityDisplays[action])showAbilityStatus(display,label,progress);
  }
  function formatTime(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');}
  function upgradeComparison(id){
    const preview=engine.previewUpgrade(id);
    const comparison=document.createElement('span');
    comparison.className='upgrade-comparison';
    if(preview.changes.length){
      const heading=document.createElement('span');
      heading.className='upgrade-comparison-heading';
      heading.textContent='現在 → 装着後';
      comparison.append(heading);
    }
    for(const {label,before,after} of preview.changes){
      const row=document.createElement('span');
      row.className='upgrade-stat';
      const name=document.createElement('span');
      const value=document.createElement('span');
      const changed=document.createElement('strong');
      name.textContent=label;
      value.textContent=before+' → ';
      changed.textContent=after;
      value.append(changed);
      row.append(name,value);
      comparison.append(row);
    }
    if(preview.note){
      const note=document.createElement('span');
      note.className='upgrade-stat-note';
      note.textContent=preview.note;
      comparison.append(note);
    }
    return comparison;
  }
  function renderChoices(){
    const isUpgrade=engine.state==='upgrade';
    const screen=$('choiceScreen');
    screen.classList.toggle('upgrade-screen',isUpgrade);
    screen.classList.toggle('route-screen',!isUpgrade);
    $('choiceEyebrow').textContent=isUpgrade?'SECTOR CLEARED // AUGMENTATION AVAILABLE':'CHOOSE YOUR NEXT CONNECTION';
    const beforeBoss=engine.floor+1>=engine.finalFloor;
    $('choiceTitle').textContent=isUpgrade?'限界を書き換えろ。':beforeBoss?'最後の扉の前で。':'次の区画を、選べ。';
    $('choiceDescription').textContent=isUpgrade?'インプラントを1つ選択。':beforeBoss?`次は最終層 ${engine.contract?.bossName||'CERBERUS'}。備えるか、代償を払って火力を取るか。`:`次は第${engine.floor+1}層（現在の脅威度 ${engine.threat}）。休むか、区画を制圧して共鳴を育てるか、取引するか。`;
    $('choiceFootnote').textContent=(touchInput.matches?'':isUpgrade?'1 / 2 / 3 キーでも選択できます。':'1〜5 キーでも選択できます。')+(isUpgrade?'効果は重複します。':'区画は次の層の敵・報酬を変え、制圧するとその系統の共鳴が1段階上がります（最大3）。');
    const cards=$('choiceCards');
    cards.replaceChildren();
    const options=isUpgrade?engine.offeredUpgrades:engine.routeOptions;
    options.forEach((option,index)=>{
      const card=document.createElement('button');
      card.type='button';
      card.className='choice-card';
      card.style.setProperty('--accent',option.color||'#5af6f3');
      card.innerHTML='<span class="card-index"></span><span class="card-tag"></span><h3></h3><p></p><span class="card-select"></span>';
      card.querySelector('.card-index').textContent='0'+(index+1);
      card.querySelector('.card-tag').textContent=isUpgrade?option.tag+(option.focus?' // SECTOR FOCUS':''):option.tag;
      card.classList.toggle('focus-card',isUpgrade&&!!option.focus);
      if(!isUpgrade)card.dataset.kind=option.kind;
      card.querySelector('h3').textContent=option.name;
      card.querySelector('p').textContent=option.description;
      const action=card.querySelector('.card-select');
      action.textContent=isUpgrade?'INSTALL AUGMENT ↗':'SELECT ROUTE ↗';
      if(isUpgrade){
        upgradeInfo.set(option.id,option);
        const family=appearance?.UPGRADE_FAMILY?.[option.id]||'lightning';
        const proposed=resolveAppearance(engine.loadout,[...engine.upgrades,option.id]);
        const visuals=document.createElement('span');
        visuals.className='card-visuals';
        const itemIcon=createItemIcon(option.id,'item-icon-choice');
        const bodyPreview=document.createElement('canvas');
        bodyPreview.className='choice-body-preview';
        bodyPreview.width=180;
        bodyPreview.height=130;
        bodyPreview.setAttribute('aria-label','改造後の主人公プレビュー');
        visuals.append(itemIcon,bodyPreview);
        card.querySelector('h3').before(visuals);
        drawBodyPreview(bodyPreview,proposed);
        const caption=document.createElement('span');
        caption.className='card-visual-caption';
        caption.textContent=`${proposed.stageLabelEn} / ${family.toUpperCase()} ${proposed.families.find(item=>item.id===family)?.count||1}`;
        action.before(upgradeComparison(option.id),caption);
      }else{
        const symbol=document.createElement('span');
        symbol.className='card-symbol';
        symbol.textContent=option.symbol||'◇';
        card.querySelector('.card-tag').before(symbol);
        // What the route does to the next floor, what it pays, and what it grows.
        const list=document.createElement('span');
        list.className='route-effects';
        const line=(className,text)=>{const row=document.createElement('span');row.className=className;row.textContent=text;list.append(row);};
        for(const effect of option.effects||[])line('route-effect',effect);
        if(option.threat)line('route-threat',`代償：脅威度 +${option.threat}（以後の敵のHP +${Math.round(NeonEngine.DIFFICULTY.threatHp*100*option.threat)}%・攻撃力 +${Math.round(NeonEngine.DIFFICULTY.threatDamage*100*option.threat)}%）`);
        if(option.loot)line('route-loot','戦利品：'+option.loot);
        if(option.resonance)line('route-resonance',option.resonance.next?`${option.resonance.name} Lv${option.resonance.level} → Lv${option.resonance.next}：${option.resonance.text}`:`${option.resonance.name} は最大（Lv3）`);
        if(list.children.length)action.before(list);
      }
      card.addEventListener('click',()=>choose(index));
      cards.append(card);
    });
    screen.classList.remove('hidden');
    screen.scrollTop=0;
  }
  function choose(index){if(!inRun||hold>0)return;const upgrading=engine.state==='upgrade';if(!upgrading&&engine.state!=='route')return;const options=upgrading?engine.offeredUpgrades:engine.routeOptions,option=options[index];if(!option)return;if(upgrading){engine.chooseUpgrade(option.id);addFeed('INSTALLED // '+option.name);updateBuild();syncRendererAppearance();}else engine.chooseRoute(option.id);syncState();}
  function updateBuild(){
    const box=$('buildIcons'),counts=new Map();
    box.replaceChildren();
    for(const id of engine.upgrades)counts.set(id,(counts.get(id)||0)+1);
    for(const [id,count] of counts){
      const item=upgradeInfo.get(id)||NeonEngine.UPGRADES.find(upgrade=>upgrade.id===id);
      const slot=document.createElement('span');
      slot.className='build-icon';
      slot.title=`${item?.name||id} ×${count} — ${item?.description||''}`;
      const icon=createItemIcon(id,'item-icon-build');
      icon.alt=item?.name||id;
      slot.append(icon);
      if(count>1){
        const badge=document.createElement('sup');
        badge.textContent='×'+count;
        slot.append(badge);
      }
      box.append(slot);
    }
  }
  function labCounts(){const counts={lightning:0,heat:0,drone:0,virus:0,armor:0,mobility:0};for(const id of lab.upgrades){const family=appearance?.UPGRADE_FAMILY?.[id];if(family)counts[family]++;}return counts;}
  function labUpgradesFromCounts(counts){const upgrades=[];for(const family of Object.keys(familyPreviewIds)){for(let i=0;i<Math.min(3,counts[family]||0);i++)upgrades.push(familyPreviewIds[family]);}return upgrades;}
  function renderLab(focusFamily=null){if(!lab.open)return;const visual=resolveAppearance(lab.loadout,lab.upgrades),body=appearance?.BODIES?.[lab.loadout];$('labBodyName').textContent=body?.label||bodies[lab.loadout];$('labStageName').textContent=visual.stageLabelEn||visual.stageLabel;const activeLabels=visual.families.map(family=>`${family.labelJa||family.label} T${family.tier}`).join(' · ');$('labSignature').textContent=activeLabels||'改造パーツなし';$('labPartsCount').textContent=`${visual.total} PARTS / ${visual.stage} STAGE`;$('labDominant').textContent=visual.dominant?`${visual.dominant.toUpperCase()} // DOMINANT SIGNAL`:'NO DOMINANT SIGNAL';const portrait=$('labPortrait');if(portrait){portrait.closest('.lab-portrait-column').classList.toggle('hidden',!body?.portrait);if(body?.portrait)portrait.src=body.portrait;portrait.alt=`${body?.label||bodies[lab.loadout]} の全身ポートレート`;}drawBodyPreview($('labBodyPreview'),visual);const catalog=new Map((globalThis.NeonEngine?.UPGRADES||[]).map(upgrade=>[upgrade.id,upgrade]));const ownedNames=lab.upgrades.map(id=>catalog.get(id)?.name||id);$('labOwnedUpgrades').previousElementSibling.textContent=lab.inGameplay?'OWNED AUGMENTS':'FITTED AUGMENTS';$('labOwnedUpgrades').textContent=ownedNames.length?ownedNames.join(' / '):(lab.inGameplay?'このランで取得した改造はまだありません':'試着中の改造はありません');$('labOwnedFamilies').textContent=activeLabels||'アクティブ系統なし';const bodyChoices=$('labBodyChoices');bodyChoices.replaceChildren();for(const id of ['runner','samurai','summoner']){const descriptor=appearance?.BODIES?.[id];const button=document.createElement('button');button.type='button';button.className='lab-body-choice'+(id===lab.loadout?' selected':'');button.dataset.loadout=id;button.innerHTML=`<img src="${descriptor?.portrait||`assets/characters/${id}.png`}" alt=""><span><b>${descriptor?.label||bodies[id]}</b><small>${descriptor?.role||''}</small></span><i>${id===lab.loadout?'ACTIVE':'SELECT'}</i>`;button.addEventListener('click',()=>{lab.loadout=id;renderLab();});bodyChoices.append(button);}
    const familyChoices=$('labFamilyChoices');familyChoices.replaceChildren();const counts=labCounts();for(const family of appearance?.FAMILIES||[]){const button=document.createElement('button');button.type='button';button.className='lab-family-choice'+(counts[family.id]>0?' active':'');button.style.setProperty('--family-color',family.color);button.dataset.family=family.id;button.innerHTML=`<span class="family-glyph">${familySymbols[family.id]||'◇'}</span><span><b>${family.label}</b><small>${family.labelJa||''}</small></span><strong>${counts[family.id]||0}<em>/3</em></strong>`;button.title=`クリックで${family.label}のティアを変更`;button.addEventListener('click',()=>{const next=((counts[family.id]||0)+1)%4;counts[family.id]=next;lab.upgrades=labUpgradesFromCounts(counts);renderLab(family.id);});familyChoices.append(button);}if(focusFamily)familyChoices.querySelector(`[data-family="${focusFamily}"]`)?.focus();
  }
  function refreshLabPreview(){if(!lab.open)return;drawBodyPreview($('labBodyPreview'),resolveAppearance(lab.loadout,lab.upgrades));}
  function openBodyLab(inGameplay=false){if(lab.open||inGameplay&&engine.state!=='playing')return;lab.open=true;lab.inGameplay=inGameplay;lab.previousPaused=paused;clearInput();lab.loadout=inGameplay?engine.loadout:selected;lab.upgrades=inGameplay?engine.upgrades.slice():[];if(inGameplay){paused=true;$('pauseScreen').classList.add('hidden');updateControls();$('labModeDescription').textContent='現在のランの所有パーツを確認しています。試着用の編集はロックされています。';}else{$('labModeDescription').textContent='3つの初期ボディと6系統の改造を試着できます。';}$('labBodyChoices').classList.toggle('hidden',inGameplay);$('labEditor').classList.toggle('hidden',inGameplay);$('labApply').classList.toggle('hidden',inGameplay);$('labReset').classList.toggle('hidden',inGameplay);$('bodyLabScreen').classList.remove('hidden');renderLab();}
  function closeBodyLab(){if(!lab.open)return;const resumeGameplay=lab.inGameplay;const previous=lab.previousPaused;lab.open=false;lab.inGameplay=false;clearInput();$('bodyLabScreen').classList.add('hidden');if(resumeGameplay){paused=previous;$('pauseScreen').classList.toggle('hidden',paused);updateControls();}}

  function updateLootTracker(){const el=$('lootTracker'),visible=inRun&&engine.state==='playing'&&!lab.open&&!paused;el.classList.toggle('hidden',!visible);if(!visible)return;const count=(engine.chests||[]).length;el.textContent=count?`⬡ DATA VAULT ×${count} — 光の柱を回収`:`AUGMENTS ×${engine.upgrades.length} · 敵を倒して金庫を奪え`;el.classList.toggle('has-loot',count>0);}
  function renderChest(){
    const reward=engine.chestReward;if(!reward)return;
    for(const id of ['toast','announcement','ultimateBanner'])$(id).classList.remove('show');
    const choosing=reward.remaining>0;
    const floorCleared=engine.chestEndsFloor();
    const rarity=reward.rarity,col={rare:'#5af6f3',epic:'#c37aff',legendary:'#eaff63'}[rarity];
    const screen=$('chestScreen'),continueButton=$('chestContinue');
    screen.style.setProperty('--loot-color',col);
    screen.dataset.rarity=rarity;
    screen.classList.toggle('chest-complete',!choosing);
    $('chestRarity').textContent='DATA VAULT / '+rarity.toUpperCase();
    $('chestTitle').textContent=choosing?`改造を選べ。 ${reward.items.length+1} / ${reward.total}`:`${reward.total}個の改造を装着`;
    $('chestDescription').textContent=choosing?'クリック / 1・2・3 で選択。選択中は戦闘が停止します。':'';
    const owned=new Map();
    for(const item of reward.items)owned.set(item.name,(owned.get(item.name)||0)+1);
    const installedNames=[...owned].map(([name,count])=>count>1?`${name} ×${count}`:name);
    $('chestHistory').textContent=owned.size?'装着済み：'+installedNames.join(' ／ '):'';
    const box=$('chestItems');box.replaceChildren();
    const round=reward.items.length;
    for(const [i,item] of reward.choices.entries()){
      const card=document.createElement('button');
      card.type='button';
      card.className='loot-card loot-choice';
      card.style.setProperty('--item-color',item.color||col);
      const tag=document.createElement('small');tag.textContent=String(i+1).padStart(2,'0')+' / '+item.tag+(item.focus?' // SECTOR FOCUS':'');
      card.classList.toggle('focus-card',!!item.focus);
      const art=createItemIcon(item.id,'item-icon-loot');
      const title=document.createElement('h3');title.textContent=item.name;
      const desc=document.createElement('p');desc.textContent=item.description;
      const installed=document.createElement('b');const count=engine.upgrades.filter(id=>id===item.id).length;
      installed.textContent=`所持 ×${count} → ×${count+1} / 選択して装着 ↗`;
      card.append(tag,art,title,desc,upgradeComparison(item.id),installed);
      card.addEventListener('click',()=>{if(engine.chestReward===reward&&reward.items.length===round)chooseChest(i);});
      box.append(card);
    }
    updateBuild();const visual=syncRendererAppearance();drawBodyPreview($('chestBodyPreview'),visual);
    $('chestBuildStats').textContent=`${engine.upgrades.length} AUGMENTS / ${visual.stageLabelEn}`;
    $('chestPowerStats').textContent=`DAMAGE ×${(engine.build.stats.damageMultiplier||1).toFixed(2)} / DRONES ${engine.build.stats.drones} / CHAIN ${engine.build.stats.chain}`;
    continueButton.querySelector('span').textContent=floorCleared?'制圧報酬へ進む':'戦場へ戻る';
    continueButton.classList.toggle('hidden',choosing);
    continueButton.disabled=choosing;
    $('chestHint').textContent=choosing||touchInput.matches?'':'Enter / Space でも進めます';
    $('lootTracker').classList.add('hidden');screen.classList.remove('hidden');
    (choosing?$('chestTitle'):continueButton).focus({preventScroll:true});screen.scrollTop=0;
  }
  function chooseChest(index){
    if(!inRun||hold>0||engine.state!=='chest'||!engine.chooseChest(index))return;
    const installed=engine.chestReward.items.at(-1);
    upgradeInfo.set(installed.id,installed);
    renderChest();
    updateHud();
  }
  function continueChest(){
    if(hold>0||engine.state!=='chest'||!engine.continueChest())return;
    syncState();
    updateHud();
    $('chestContinue').blur();
  }

  // The identity of the finished run: which resonances it grew and where its damage came from.
  const sourceLabels={shot:'射撃',drone:'ドローン',chain:'連鎖',slash:'斬撃',dash:'ダッシュ',wire:'拘束ワイヤー',hack:'ハック',virus:'感染',heat:'延焼・熱波',counter:'反撃波',ultimate:'BLACKOUT'};
  function runSummary(){
    const grown=NeonEngine.RESONANCE.filter(def=>engine.resonance?.[def.family]>0).map(def=>`${def.name} Lv${engine.resonance[def.family]}`);
    const dealt=Object.entries(engine.damageDealt||{}).sort((a,b)=>b[1]-a[1]),total=dealt.reduce((sum,[,value])=>sum+value,0)||1;
    const top=dealt.slice(0,3).map(([key,value])=>`${sourceLabels[key]||key} ${Math.round(value/total*100)}%`);
    return `共鳴：${grown.length?grown.join('・'):'なし'}　｜　脅威度 ${engine.threat||0}　｜　ダメージ源：${top.join('・')||'—'}`;
  }
  function settleRun(won){
    if(assignment){
      settlement=campaign.settle(profile,assignment.receipt,won);
      if(settlement&&!saveProfile())settlement=null;
      return;
    }
    storage.set('best',Math.max(storage.get('best',0),engine.score));
    if(won){
      storage.set('clears',storage.get('clears',0)+1);
      if(profile){campaign.unlock(profile);saveProfile();}
    }
  }
  function result(){
    const won=engine.state==='won';
    const offer=assignment?.offer;
    $('resultEyebrow').textContent=offer?`${offer.companyName} · 危険ランク ${NeonCampaignUI.format(offer.rank)}`:(won?'OWNERSHIP TRANSFERRED // YOU ARE FREE':'CONNECTION LOST // BODY DESTROYED');
    $('resultTitle').textContent=offer?(won?'依頼達成':'回収失敗'):(won?'この身体は、誰のものでもない。':'まだ、燃え尽きない。');
    $('resultDescription').textContent=offer?(won?(settlement?`${offer.client}「${offer.response}」`:'別の記録が優先されたため、今回の精算は取り消されました。'):'現場から離脱。報酬は発生しません。'):(won?'CERBERUSを破壊し、義体の制御権を取り戻した。三人宛てに街から依頼が届く。':'次は、もっと危険な身体で。別の組み合わせが待っている。');
    const next=offer||won&&canOpenCampaign();
    $('retryButton').firstChild.textContent=next?'依頼掲示板へ ':'もう一度侵入 ';
    $('retryButton').querySelector('b').textContent=next?'CONTRACTS ↗':'RUN IT BACK ↗';
    const stats=offer?[[NeonCampaignUI.format(settlement?.reward??0n),'報酬']]:[[Math.floor(engine.score),'SCORE']];
    stats.push([engine.kills,'KILLS'],[engine.bestCombo,'BEST CHAIN'],[formatTime(engine.elapsed),'RUN TIME']);
    $('resultStats').replaceChildren();
    for(const [value,label] of stats){
      const d=document.createElement('div'),b=document.createElement('b'),s=document.createElement('span');
      b.textContent=value;s.textContent=label;d.append(b,s);$('resultStats').append(d);
    }
    $('resultSummary').textContent=runSummary();
    const owned=new Map();
    for(const id of engine.upgrades)owned.set(id,(owned.get(id)||0)+1);
    $('resultBuild').textContent=[...owned].map(([id,count])=>(upgradeInfo.get(id)?.name||NeonEngine.UPGRADES.find(u=>u.id===id)?.name||id)+(count>1?' ×'+count:'')).join(' / ');
    $('resultScreen').classList.remove('hidden');
    $('resultScreen').scrollTop=0;
  }
  function openShare(resultText=''){
    if(!shareDialog||!publicUrl||shareDialog.open)return;
    shareData={title:'NEON OVERCLOCK',url:publicUrl};
    if(resultText)shareData.text=resultText;
    $('shareHeading').textContent=resultText?'戦績を共有':'ゲームを共有';
    const field=$('shareContent');
    field.rows=resultText?5:1;
    field.value=resultText?`${resultText}\n${publicUrl}`:publicUrl;
    const xUrl=new URL('https://x.com/intent/tweet');
    xUrl.searchParams.set('text',resultText||'NEON OVERCLOCK — ブラウザで遊べるサイバーパンク・アクションローグライク');
    xUrl.searchParams.set('url',publicUrl);
    $('shareX').href=xUrl.href;
    $('shareTextCopy').hidden=!resultText;
    $('shareNative').hidden=typeof navigator.share!=='function'||(typeof navigator.canShare==='function'&&!navigator.canShare(shareData));
    $('shareStatus').textContent='';
    shareDialog.showModal();
  }
  function shareResultText(){
    const won=engine.state==='won',offer=assignment?.offer;
    const mission=offer?`${offer.companyName} · ${offer.facilityName} · 危険ランク ${NeonCampaignUI.format(offer.rank)}`:'CERBERUS序章';
    const outcome=won?(offer?'依頼達成':'クリア'):(offer?'回収失敗':'未クリア');
    const stats=[bodies[engine.loadout],formatTime(engine.elapsed),`撃破 ${engine.kills}体`];
    if(!offer)stats.push(`スコア ${Math.floor(engine.score).toLocaleString('ja-JP')}`);
    return ['NEON OVERCLOCK',`${mission} · ${outcome}`,stats.join(' · ')].join('\n');
  }
  async function copyShare(includeResult){
    const data=shareData,field=$('shareContent');
    const value=includeResult?field.value:publicUrl;
    try{
      await navigator.clipboard.writeText(value);
      if(shareDialog.open&&shareData===data)$('shareStatus').textContent=includeResult?'戦績とリンクをコピーしました。':'公開リンクをコピーしました。';
    }catch{
      if(!shareDialog.open||shareData!==data)return;
      field.focus();
      field.setSelectionRange(field.value.length-value.length,field.value.length);
      $('shareStatus').textContent='選択した内容を端末のコピー操作でコピーできます。';
    }
  }
  async function openNativeShare(){
    const data=shareData;
    try{await navigator.share(data);}
    catch(error){
      if(shareDialog.open&&shareData===data&&error?.name!=='AbortError')$('shareStatus').textContent='共有メニューが開けませんでした。内容をコピーして共有できます。';
    }
  }
  function showState(){if(engine.state==='chest'){$('choiceScreen').classList.add('hidden');renderChest();return;}if(engine.state==='upgrade'||engine.state==='route')renderChoices();else{$('choiceScreen').classList.add('hidden');if(engine.state==='won'||engine.state==='dead')result();else if(engine.state==='playing')$('bodyLabScreen').classList.add('hidden');}}
  // Seconds the arena stays visible after leaving combat, so the explosion, vault burst or
  // boss collapse is seen before a modal covers it. Input for the next screen is held as well.
  const stateHold={chest:.5,upgrade:1.1,won:3.6,dead:1.4};
  function syncState(){if(engine.state===lastState)return;const previous=lastState;lastState=engine.state;if(lastState==='won'||lastState==='dead')settleRun(lastState==='won');clearInput();paused=false;updateControls();$('pauseScreen').classList.add('hidden');$('chestScreen').classList.add('hidden');hold=previous==='playing'?stateHold[engine.state]||0:0;if(hold>0){const serial=runSerial,state=engine.state;holdAction=()=>{if(serial===runSerial&&inRun&&engine.state===state)showState();};$('lootTracker').classList.add('hidden');return;}holdAction=null;showState();}
  function loop(time){const raw=(time-lastTime)/1000||.016;const dt=Math.min(.04,raw);lastTime=time;fps+=((1/Math.max(.001,raw))-fps)*.03;
    if(inRun&&!paused&&engine.state==='playing')perfSample(raw*1000);
    let timeScale=1;if(!paused){if(freeze>0){freeze-=raw;timeScale=0;}else if(slowTime>0){slowTime-=raw;timeScale=slowScale;}if(hold>0){hold-=Math.min(.25,raw);if(hold<=0){hold=0;const action=holdAction;holdAction=null;action?.();}}}
    if(inRun&&!paused&&timeScale>0){engine.update(dt*timeScale,{x:(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+touch.x,y:(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0)+touch.y,dash:!!keys.Space||queued.dash,hack:!!keys.KeyE||queued.hack,ultimate:!!keys.KeyQ||queued.ultimate});syncState();}if(timeScale>0||!inRun)queued={};renderer.update(paused?0:dt*(timeScale||.1),engine,!inRun);renderer.render(engine,!inRun);audio.update(inRun&&!paused&&engine.state==='playing',engine.player.heat/(engine.build.stats.heat||100));if(lab.open&&time-previewLast>100){previewLast=time;refreshLabPreview();}hudTimer+=dt;if(hudTimer>.12){if(inRun)updateHud();$('game').dataset.fps=String(Math.round(fps));$('game').dataset.particles=String(renderer.particles.length);$('game').dataset.playerX=String(Math.round(engine.player.x));$('game').dataset.playerY=String(Math.round(engine.player.y));hudTimer=0;}requestAnimationFrame(loop);}
  document.querySelectorAll('.loadout').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.loadout;updateTitleBodyVisual();}));
  $('startButton').onclick=()=>start();
  if(shareDialog){
    $('shareGameButton').onclick=()=>openShare();
    $('shareResultButton').onclick=()=>openShare(shareResultText());
    $('shareLinkCopy').onclick=()=>copyShare(false);
    $('shareTextCopy').onclick=()=>copyShare(true);
    $('shareNative').onclick=openNativeShare;
  }
  if($('campaignButton'))$('campaignButton').onclick=openCampaign;
  $('retryButton').onclick=()=>{if(assignment||engine.state==='won'&&canOpenCampaign())openCampaign();else start();};
  $('quitButton').onclick=()=>{if(assignment)openCampaign();else title();};
  $('menuButton').onclick=title;$('resumeButton').onclick=()=>setPause(false);$('pauseButton').onclick=()=>setPause(true);$('bodyLabButton').onclick=()=>openBodyLab(false);$('bodyLabHudButton').onclick=()=>{if(engine.state==='playing')openBodyLab(true);};$('chestContinue').onclick=continueChest;$('bodyLabClose').onclick=closeBodyLab;$('labReset').onclick=()=>{lab.upgrades=[];renderLab();};$('labApply').onclick=()=>{selected=lab.loadout;updateTitleBodyVisual();closeBodyLab();};
  $('brand').onclick=e=>{e.preventDefault();if(inRun)setPause(true);};
  $('soundButton').onclick=()=>{$('soundButton').textContent=audio.toggle()?'SOUND: ON':'SOUND: OFF';storage.set('sound',audio.enabled);};
  $('effectsButton').onclick=()=>{renderer.ultra=!renderer.ultra;renderer.resize();$('effectsButton').textContent=renderer.ultra?'FX: ULTRA':'FX: LITE';storage.set('ultra',renderer.ultra);toast(renderer.ultra?'ULTRA // 全エフェクトを解放':'LITE // 発光と粒子を軽減');};
  $('fullscreenButton').hidden=!document.fullscreenEnabled;
  $('fullscreenButton').onclick=()=>{
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
    else document.documentElement.requestFullscreen().catch(()=>toast('このブラウザでは全画面にできません'));
  };
  window.addEventListener('keydown',e=>{if(shareDialog?.open)return;if(campaignUI&&!$('campaignScreen').classList.contains('hidden')){if(e.code==='Escape'&&!e.repeat){e.preventDefault();title();}return;}if(e.code==='F2'&&!e.repeat){e.preventDefault();togglePerf();return;}if(inRun&&hold>0){if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();return;}if(inRun&&engine.state==='chest'&&!lab.open){if(e.repeat){e.preventDefault();return;}if(/^Digit[123]$/.test(e.code)){e.preventDefault();chooseChest(Number(e.code.slice(-1))-1);}else if(['Enter','Space'].includes(e.code)&&engine.chestReward?.remaining===0){e.preventDefault();continueChest();}return;}if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'&&!e.repeat){if(lab.open){closeBodyLab();return;}setPause(!paused);return;}if(!e.repeat&&e.code==='KeyI'){if(lab.open){closeBodyLab();return;}if(inRun&&engine.state==='playing')openBodyLab(true);else if(!inRun)openBodyLab(false);return;}if(inRun&&!paused&&(engine.state==='upgrade'||engine.state==='route')&&/^Digit[1-5]$/.test(e.code)&&!e.repeat){choose(Number(e.code.slice(-1))-1);return;}const action={Space:'dash',KeyE:'hack',KeyQ:'ultimate'}[e.code];if(action&&e.repeat)return;if(action)queueAction(action);keys[e.code]=true;});window.addEventListener('keyup',e=>{keys[e.code]=false;});window.addEventListener('blur',()=>{keys={};if(inRun&&!lab.open)setPause(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&inRun&&!lab.open)setPause(true);});
  function moveJoystick(event){
    if(event.pointerId!==joystickPointer)return;
    const bounds=joy.getBoundingClientRect();
    const dx=event.clientX-(bounds.left+bounds.width/2);
    const dy=event.clientY-(bounds.top+bounds.height/2);
    const length=Math.hypot(dx,dy);
    const reach=bounds.width*.28;
    const strength=Math.min(1,Math.max(0,(length-5)/(reach-5)));
    touch.x=length?dx/length*strength:0;
    touch.y=length?dy/length*strength:0;
    joy.firstElementChild.style.transform=
      `translate(${touch.x*reach}px,${touch.y*reach}px)`;
  }
  joy.addEventListener('pointerdown',event=>{
    if(joystickPointer!==null||event.button!==0||!canAct())return;
    event.preventDefault();
    joystickPointer=event.pointerId;
    joy.setPointerCapture(event.pointerId);
    moveJoystick(event);
  });
  joy.addEventListener('pointermove',moveJoystick);
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    joy.addEventListener(type,event=>{
      if(event.pointerId===joystickPointer)resetJoystick();
    });
  }
  for(const button of actionButtons){
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();
      queueAction(button.dataset.action);
    });
    button.addEventListener('click',event=>{
      if(event.detail===0)queueAction(button.dataset.action);
    });
  }
  function syncTouchMode(){
    resetJoystick();
    document.documentElement.classList.toggle('touch-interface',touchInput.matches);
    updateControls();
  }
  touchInput.addEventListener('change',syncTouchMode);
  syncTouchMode();
  renderer.ultra=storage.get('ultra',!touchInput.matches);
  $('effectsButton').textContent=renderer.ultra?'FX: ULTRA':'FX: LITE';
  renderer.resize();
  if(storage.get('sound',false)){
    $('soundButton').textContent='SOUND: ON';
    audio.enabled=true;
  }
  updateBest();
  updateCampaignEntry();
  updateTitleBodyVisual();
  whenAssetsReady(()=>{
    updateTitleBodyVisual();
    if(inRun)syncRendererAppearance();
    if(lab.open)renderLab();
    if(hold>0)return;
    if(engine.state==='chest')renderChest();
    else if(engine.state==='upgrade')renderChoices();
  });
  requestAnimationFrame(loop);
})();
