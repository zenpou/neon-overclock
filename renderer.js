/* NEON OVERCLOCK — dependency-free procedural canvas renderer. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const palette = {cyan:'#5af6f3',yellow:'#eaff63',pink:'#ff4e8b',orange:'#ff9a4d',blue:'#719eff',green:'#80ffb2'};
  const threat = {edge:'#190a17', warning:'#ff7b9d', imminent:'#ffd0d9', shot:'#ff426d', core:'#fff2f5'};
  const factionStyle = Object.freeze({
    power: Object.freeze({ color: '#46e9ff', edge: '#bafcff', dark: '#102b38', accent: '#eaff63' }),
    logistics: Object.freeze({ color: '#eaff63', edge: '#f8ffd0', dark: '#28301c', accent: '#ffac57' }),
    medical: Object.freeze({ color: '#c37aff', edge: '#f0d9ff', dark: '#2b1837', accent: '#9cff68' })
  });
  const rand = (a,b) => a + Math.random()*(b-a);
  class NeonRenderer {
    constructor(canvas) {
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.time=0;this.particles=[];this.rings=[];this.bolts=[];this.texts=[];this.trails=[];this.slashes=[];this.flares=[];this.pillars=[];this.raybursts=[];this.decals=[];this.timers=[];this.shake=0;this.flash=0;this.zoom=0;this.aberr=0;this.speed=0;this.dim=0;this.hurt=0;this.lastDt=0;this.ultra=true;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.camera={x:800,y:500};this.glows={};
      this.map=document.createElement('canvas');this.map.width=1800;this.map.height=1200;this.makeMap();this.facilityMap=null;this.facilityKey='';this.bloom=document.createElement('canvas');this.bloomCtx=this.bloom.getContext('2d');
      this.rain=Array.from({length:140},()=>({x:rand(-200,1800),y:rand(-200,1200),speed:rand(500,900),len:rand(12,38)}));
      this.splashes=Array.from({length:26},()=>({x:rand(80,1520),y:rand(100,900),life:rand(.05,.6),total:.6}));
      this.appearance=NeonAppearance.resolve('runner',[]);this.previewLoadout='runner';this.assets={};this.composites=new Map();
      this.assetsReady=Promise.all(Object.entries({actors:'assets/sprites/actors.png',players:'assets/sprites/players.png',augments:'assets/sprites/augments.png',runner:'assets/characters/runner.png',samurai:'assets/characters/samurai.png',summoner:'assets/characters/summoner.png'}).map(([name,path])=>new Promise(resolve=>{const image=new Image();this.assets[name]={image,status:'loading',path};image.onload=()=>{this.assets[name].status='ready';this.composites.clear();resolve(name);};image.onerror=()=>{this.assets[name].status='missing';resolve(name);};image.src=path;})));
      this.resize();
      this.resizeObserver=new ResizeObserver(()=>this.resize());
      this.resizeObserver.observe(this.canvas);
    }
    setAppearance(loadout,upgrades){this.appearance=NeonAppearance.resolve(loadout,upgrades);return this.appearance;}
    setPreviewLoadout(loadout){this.previewLoadout=NeonAppearance.resolve(loadout,[]).loadout;}
    imageStatus(){return Object.fromEntries(Object.entries(this.assets).map(([key,asset])=>[key,asset.status]));}
    atlas(c,name,cell,x,y,w,h=w){const asset=this.assets[name];if(asset?.status!=='ready')return false;const cols=name==='players'?4:3,rows=name==='augments'?2:3,sw=asset.image.naturalWidth/cols,sh=asset.image.naturalHeight/rows;c.drawImage(asset.image,(cell%cols)*sw,Math.floor(cell/cols)*sh,sw,sh,x,y,w,h);return true;}
    bodyComposite(appearance,direction=0){
      if(this.assets.actors?.status!=='ready')return null;
      const key=appearance.signature+'/d'+direction;if(this.composites.has(key))return this.composites.get(key);
      const image=document.createElement('canvas');image.width=image.height=256;const c=image.getContext('2d');c.translate(128,128);
      // Hardware has physical attachment points, so hybrid builds retain every
      // installed family. Layers are cached per build, never recomputed per frame.
      const mounts={mobility:[-24,0,166],heat:[-30,18,105],drone:[-24,-31,105],virus:[-9,34,91],armor:[6,0,139],lightning:[-1,-22,112]};
      const ordered=[...appearance.families].sort((a,b)=>['mobility','heat','drone','armor','virus','lightning'].indexOf(a.id)-['mobility','heat','drone','armor','virus','lightning'].indexOf(b.id));
      c.save();c.rotate(direction*Math.PI/2);for(const f of ordered.filter(f=>['mobility','heat','drone'].includes(f.id))){const [x,y,size]=mounts[f.id],s=size*(1+(f.tier-1)*.12);this.atlas(c,'augments',f.slot,x-s/2,y-s/2,s);}c.restore();
      if(appearance.body.portrait){
        if(!this.atlas(c,'players',appearance.body.actorCell*4+direction,-85,-85,170))this.atlas(c,'actors',appearance.body.actorCell,-85,-85,170);
      }else{
        c.save();c.rotate(direction*Math.PI/2);c.filter='hue-rotate(135deg)';this.atlas(c,'actors',appearance.body.actorCell,-85,-85,170);c.restore();
      }
      c.save();c.rotate(direction*Math.PI/2);
      for(const f of ordered.filter(f=>!['mobility','heat','drone'].includes(f.id))){const [x,y,size]=mounts[f.id],s=size*(1+(f.tier-1)*.1);this.atlas(c,'augments',f.slot,x-s/2,y-s/2,s);}
      // Repeated upgrades create additional outboard hardware, rather than only
      // recolouring the same silhouette. These remain visible with mixed builds.
      for(const f of ordered){if(f.tier<2)continue;const side=f.slot%2?1:-1;const s=42+f.tier*5;this.atlas(c,'augments',f.slot,-61-s/2,side*52-s/2,s);if(f.tier>=3)this.atlas(c,'augments',f.slot,24-s/2,-side*60-s/2,s);}
      c.restore();if(this.composites.size>=96)this.composites.delete(this.composites.keys().next().value);this.composites.set(key,image);return image;
    }
    drawPartIcon(canvas,familyId,tier=1){if(!canvas)return;const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,f=NeonAppearance.FAMILIES.find(f=>f.id===familyId);c.clearRect(0,0,w,h);if(!f)return;const g=c.createRadialGradient(w/2,h/2,1,w/2,h/2,w*.48);g.addColorStop(0,f.color+'28');g.addColorStop(1,f.color+'00');c.fillStyle=g;c.fillRect(0,0,w,h);const s=Math.min(w,h)*1.3;this.atlas(c,'augments',f.slot,(w-s)/2,(h-s)/2,s);}
    drawBodyPreview(canvas,appearance){
      if(!canvas)return;const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,t=this.time;const color=appearance.families.find(f=>f.id===appearance.dominant)?.color||appearance.body.color;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,w,h);c.fillStyle='#08111b';c.fillRect(0,0,w,h);c.strokeStyle='#76b4c715';c.lineWidth=1;for(let x=0;x<w;x+=25){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=0;y<h;y+=25){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
      const cx=w/2,cy=h*.48,r=Math.min(w,h)*.35;const glow=c.createRadialGradient(cx,cy,5,cx,cy,r*1.4);glow.addColorStop(0,color+'22');glow.addColorStop(1,color+'00');c.fillStyle=glow;c.fillRect(0,0,w,h);c.strokeStyle=color+'55';c.setLineDash([10,7]);c.beginPath();c.arc(cx,cy,r,0,TAU);c.stroke();c.setLineDash([]);c.strokeStyle='#c8e8f122';c.beginPath();c.arc(cx,cy,r*.76,0,TAU);c.stroke();
      const image=this.bodyComposite(appearance);if(image){const size=Math.min(w,h)*(w<120?1.6:1.2);c.save();c.translate(cx,cy+Math.sin(t*2)*2);c.drawImage(image,-size/2,-size/2,size,size);this.hardwareEffects(c,appearance,t,size/160);c.restore();}else{c.fillStyle='#8aadb9';c.font='11px monospace';c.textAlign='center';c.fillText('LOADING BODY DATA',cx,cy);}
      if(w>=120){c.textAlign='center';c.fillStyle=color;c.font='bold 11px monospace';c.fillText(appearance.stageLabelEn,cx,h-35);c.fillStyle='#86a6b4';c.font='9px monospace';c.fillText(`${String(appearance.total).padStart(2,'0')} AUGMENTS / ${appearance.families.length} SYSTEMS ONLINE`,cx,h-18);c.textAlign='left';}canvas.dataset.appearance=appearance.signature;canvas.dataset.stage=String(appearance.stage);canvas.dataset.families=appearance.families.map(f=>f.id+':'+f.tier).join(',');
    }
    hardwareEffects(c,appearance,t,scale=1){
      c.save();c.scale(scale,scale);c.globalCompositeOperation='lighter';
      for(const f of appearance.families){c.strokeStyle=f.color;c.fillStyle=f.color;c.lineWidth=1.4;c.shadowColor=f.color;c.shadowBlur=this.ultra?8:0;
        if(f.id==='lightning'){for(let i=0;i<f.tier;i++){const y=-21+i*19;c.beginPath();c.moveTo(-25,y);c.lineTo(-15,y-4-Math.sin(t*12+i)*3);c.lineTo(-6,y+3);c.lineTo(7,y-2);c.stroke();}}
        if(f.id==='heat'){for(let i=0;i<f.tier+1;i++){const y=-9+i*7;c.globalAlpha=.6+.25*Math.sin(t*13+i);c.beginPath();c.moveTo(-33,y);c.lineTo(-48-5*Math.sin(t*19+i),y-2);c.lineTo(-34,y+3);c.fill();}}
        if(f.id==='drone'){for(let i=0;i<f.tier;i++){const a=t*.7+i*TAU/f.tier,x=Math.cos(a)*48,y=Math.sin(a)*48;c.globalAlpha=.65;c.beginPath();c.moveTo(-18,-17);c.lineTo(x,y);c.stroke();c.globalAlpha=1;c.fillRect(x-2,y-2,4,4);}}
        if(f.id==='virus'){for(let i=0;i<f.tier+1;i++){const a=t*.8+i*2.4;c.globalAlpha=.7;c.beginPath();c.arc(-13+Math.cos(a)*25,23+Math.sin(a)*13,2.5,0,TAU);c.fill();}}
        if(f.id==='armor'){c.globalAlpha=.32;c.lineWidth=1+f.tier*.5;c.beginPath();for(let i=0;i<=6;i++){const a=i*TAU/6,x=Math.cos(a)*(35+f.tier*4),y=Math.sin(a)*(35+f.tier*4);i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}
        if(f.id==='mobility'){c.globalAlpha=.5;for(let s of [-1,1]){c.beginPath();c.moveTo(-24,s*30);c.lineTo(-43-f.tier*8-Math.sin(t*18)*4,s*38);c.stroke();}}
        c.globalAlpha=1;
      }c.restore();
    }
    rasterActor(x,y,angle,color,type,t,data){
      const player=type==='player'||type==='ghost';const appearance=this.appearance;
      // Campaign enemies carry their own faction/variant art contract. Keep
      // prologue actors on the atlas path, while the campaign silhouettes are
      // drawn procedurally below so every company reads at a glance.
      if(data&&(data.faction||data.variant||data.midboss))return this.drawCampaignEnemy(x,y,angle,color,type,t,data);
      const cell=NeonAppearance.ACTOR_CELLS[type];if(!player&&cell===undefined)return false;
      const direction=(Math.round(angle/(Math.PI/2))+4)%4;const image=player?this.bodyComposite(appearance,direction):null;if(player&&!image||!player&&this.assets.actors?.status!=='ready')return false;
      const c=this.ctx,ghost=type==='ghost',size=player?148+appearance.stage*7:type==='boss'?285:type==='tank'?135:type==='elite'?122:type==='drone'?58:105;
      c.save();c.translate(x,y);if(!ghost){c.fillStyle='#0007';c.beginPath();c.ellipse(5,12,size*.29,size*.15,0,0,TAU);c.fill();}
      if(type==='boss'||type==='drone')c.rotate(angle);else if(!player&&Math.cos(angle)<0)c.scale(-1,1);const pulse=1+Math.sin(t*5+(data.id||0))*.012+(data.hitFlash>0?data.hitFlash*.9:0);c.scale(pulse,pulse);
      if(player){if(!ghost){c.globalAlpha=.8;c.strokeStyle=appearance.body.color;c.lineWidth=1.2;c.beginPath();c.arc(0,0,25,angle-1.2,angle+1.2);c.stroke();c.globalAlpha=1;}c.drawImage(image,-size/2,-size/2,size,size);if(!ghost){c.save();c.rotate(direction*Math.PI/2);this.hardwareEffects(c,appearance,t,size/160);c.restore();}}
      else {this.atlas(c,'actors',cell,-size/2,-size/2,size);
        // Additive redraw of the sprite: a hit reads as a white-hot flash without a per-enemy filter.
        if(data.hitFlash>0){c.globalCompositeOperation='lighter';c.globalAlpha=Math.min(.75,data.hitFlash*9);this.atlas(c,'actors',cell,-size/2,-size/2,size);c.globalAlpha=1;c.globalCompositeOperation='source-over';}
        if(type==='boss'){c.strokeStyle=color;c.lineWidth=2;c.globalAlpha=.65;c.rotate(t*.4);c.setLineDash([12,8]);c.beginPath();c.arc(0,0,83,0,TAU);c.stroke();c.setLineDash([]);}}
      c.restore();if(data.stun>0&&!player){c.save();c.strokeStyle=palette.yellow;c.lineWidth=2;c.globalAlpha=.85;c.setLineDash([5,7]);c.lineDashOffset=-t*40;c.beginPath();c.arc(x,y-size*.3,10,0,TAU);c.stroke();c.restore();}
      if(data.burn>0){c.save();c.globalCompositeOperation='lighter';this.light(x,y,size*.55,palette.orange,.35+.15*Math.sin(t*18+(data.id||0)));c.restore();}
      if(data.infected>0){c.save();c.strokeStyle=palette.green;c.lineWidth=2;c.setLineDash([3,5]);c.beginPath();c.arc(x,y,size*.3,0,TAU);c.stroke();c.restore();}
      if(data.hp<data.maxHp&&!player&&type!=='boss'){const r=data.r||20;c.fillStyle='#000a';c.fillRect(x-r,y-size*.32,r*2,3);c.fillStyle=color;c.fillRect(x-r,y-size*.32,r*2*Math.max(0,data.hp/data.maxHp),3);}return true;
    }
    resize(){this.w=this.canvas.clientWidth;this.h=this.canvas.clientHeight;this.dpr=Math.min(devicePixelRatio||1,this.ultra?1.75:1.25);this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.bloom.width=Math.max(1,Math.round(this.w/4));this.bloom.height=Math.max(1,Math.round(this.h/4));}
    glow(color){if(this.glows[color])return this.glows[color];const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d'),g=x.createRadialGradient(48,48,0,48,48,48);g.addColorStop(0,color);g.addColorStop(.13,color+'aa');g.addColorStop(.4,color+'35');g.addColorStop(1,color+'00');x.fillStyle=g;x.fillRect(0,0,96,96);return this.glows[color]=c;}
    light(x,y,r,color,alpha=1){const c=this.ctx;c.globalAlpha=alpha;c.drawImage(this.glow(color),x-r,y-r,r*2,r*2);c.globalAlpha=1;}
    line(points,color,width=2,glow=0){const c=this.ctx;c.strokeStyle=color;c.lineWidth=width;c.shadowColor=color;c.shadowBlur=this.ultra?glow:0;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();c.shadowBlur=0;}
    mapFor(contract){
      if(!contract)return this.map;
      const key=contract.companyId+'|'+contract.facilityName;
      if(this.facilityKey!==key){
        this.facilityMap ||= document.createElement('canvas');
        this.facilityMap.width=1800;this.facilityMap.height=1200;
        this.makeMap(this.facilityMap,contract);
        this.facilityKey=key;
      }
      return this.facilityMap;
    }
    makeMap(map=this.map,contract=null){
      const c=map.getContext('2d');c.translate(100,100);c.fillStyle='#090f18';c.fillRect(-100,-100,1800,1200);
      const g=c.createLinearGradient(0,0,1600,1000);g.addColorStop(0,'#14212a');g.addColorStop(.45,'#101a25');g.addColorStop(1,'#14212b');c.fillStyle=g;c.fillRect(50,55,1500,890);
      // Massive beveled roof plates, service lanes and rain-slick seams.
      for(let y=80;y<940;y+=80)for(let x=60;x<1540;x+=100){c.fillStyle=((x/100+y/80)|0)%3===0?'#ffffff03':'#00000012';c.fillRect(x+2,y+2,96,76);c.strokeStyle='#6c9cae0b';c.strokeRect(x,y,100,80);c.fillStyle='#4d697344';c.fillRect(x+6,y+6,2,2);c.fillRect(x+91,y+70,2,2);}
      c.strokeStyle='#445e6644';c.lineWidth=2;c.strokeRect(94,104,1412,792);c.strokeRect(103,113,1394,774);
      c.fillStyle='#03091299';c.fillRect(360,80,18,840);c.fillRect(1230,80,18,840);c.fillRect(60,725,1480,15);
      for(let y=85;y<920;y+=14){c.fillStyle='#51646b44';c.fillRect(362,y,14,2);c.fillRect(1232,y,14,2);}
      for(let x=65;x<1540;x+=14){c.fillStyle='#51646b44';c.fillRect(x,728,2,10);}
      // Industrial markings and inset reactor landing rings.
      c.strokeStyle='#98c8cf12';c.lineWidth=2;c.beginPath();c.arc(800,500,220,0,TAU);c.stroke();c.setLineDash([20,14]);c.beginPath();c.arc(800,500,235,0,TAU);c.stroke();c.setLineDash([]);c.beginPath();c.moveTo(540,500);c.lineTo(1060,500);c.moveTo(800,240);c.lineTo(800,760);c.stroke();
      c.save();c.translate(800,500);c.rotate(-Math.PI/2);c.fillStyle='#9cafbd13';c.font='bold 82px monospace';c.textAlign='center';c.fillText('RESTRICTED',0,28);c.restore();
      c.font='11px monospace';c.fillStyle='#b4d0ce45';c.fillText(contract?.companyName||'VOLT//GRID · NEURAL SYSTEMS DIVISION',120,148);c.fillText('AUTHORIZED PERSONNEL ONLY',1180,858);c.fillText('LANDING PAD / 09',670,821);
      c.font='bold 27px monospace';c.fillStyle='#d3de8655';c.fillText('進入禁止',122,845);c.fillText(contract?.facilityName||'09 — VOLT',1180,155);
      if(contract)this.facilityFloor(c,contract);
      // Caution rails.
      for(const y of [62,920]){c.fillStyle='#050a11';c.fillRect(58,y,1484,15);for(let x=60;x<1540;x+=28){c.fillStyle='#c0cd6340';c.beginPath();c.moveTo(x,y);c.lineTo(x+13,y);c.lineTo(x+3,y+15);c.lineTo(x-10,y+15);c.fill();}}
      // Edge structures: roof HVAC, ducts, windows and luminous corporate billboards.
      for(let x=-80;x<1700;x+=180){this.structure(c,x,-76,150,112,x%360?'#5af6f3':'#ff4e8b');this.structure(c,x,968,155,130,x%360?'#ff4e8b':'#5af6f3');}
      for(let y=100;y<1000;y+=210){this.structure(c,-93,y,110,170,'#5af6f3');this.structure(c,1583,y,110,170,'#eaff63');}
      // Puddles and scattered luminous reflections.
      for(let i=0;i<110;i++){const x=rand(90,1510),y=rand(110,890);c.fillStyle=i%2?'#55b7ce05':'#c469bb04';c.beginPath();c.ellipse(x,y,rand(10,75),rand(2,8),-.2,0,TAU);c.fill();}
      for(let i=0;i<350;i++){c.fillStyle=i%4?'#e5f8ff05':'#00000035';c.fillRect(rand(80,1520),rand(90,910),rand(1,4),rand(1,3));}
    }
    facilityFloor(c,contract){
      const color=contract.color;
      c.lineWidth=4;c.strokeStyle=color+'42';
      if(contract.companyId==='power'){
        for(const x of [190,1280]){
          for(let i=0;i<3;i++){
            const cx=x+i*44;
            c.beginPath();c.moveTo(cx,72);c.lineTo(cx,400);c.lineTo(cx+85,485);c.lineTo(cx+85,925);c.stroke();
          }
        }
      }else if(contract.companyId==='logistics'){
        c.setLineDash([28,12]);
        for(const y of [270,400,600,730]){c.beginPath();c.moveTo(72,y);c.lineTo(1528,y);c.stroke();}
        c.setLineDash([]);
        for(const y of [100,760])for(let x=170;x<=1440;x+=135){c.strokeRect(x,y,98,130);c.strokeRect(x+12,y+6,74,118);}
      }else{
        c.fillStyle=color+'23';
        for(const x of [260,1090])for(const y of [206,590]){
          c.strokeRect(x,y,250,193);c.fillRect(x+108,y+51,34,90);c.fillRect(x+81,y+80,88,32);
        }
      }
    }
    structure(c,x,y,w,h,color){c.fillStyle='#0008';c.fillRect(x+9,y+18,w+9,h+9);c.fillStyle='#172330';c.fillRect(x,y,w,h);c.fillStyle='#213342';c.fillRect(x,y,w,9);c.fillStyle='#0c141e';c.fillRect(x+w-9,y,9,h);c.strokeStyle='#6a8c9d44';c.strokeRect(x+.5,y+.5,w-1,h-1);c.fillStyle=color;c.shadowColor=color;c.shadowBlur=14;c.fillRect(x+12,y+h-9,w-24,3);c.shadowBlur=0;for(let yy=y+20;yy<y+h-20;yy+=12){c.fillStyle='#070d15';c.fillRect(x+15,yy,w-35,5);c.fillStyle='#7294a322';c.fillRect(x+15,yy,w-35,1);}c.fillStyle=color+'55';c.fillRect(x+w-22,y+16,5,5);}
    // ---- Effect emitters. Every list is capped, decays in update() and is reset by clear(). ----
    cap(list,max){if(list.length>max)list.splice(0,list.length-max);}
    burst(x,y,color,count=25,power=1,priority=false){
      const max=this.ultra?1500:500;let n=count*(this.ultra?1:.45);
      // Routine bursts thin out as the pool fills, so set-piece moments keep their headroom.
      if(!priority){const load=this.particles.length/max;if(load>.55)n*=Math.max(.2,1-(load-.55)*2);}
      for(let i=0;i<n;i++){if(this.particles.length>=max){if(!priority)break;this.particles.shift();}
        const a=rand(0,TAU),s=rand(35,310)*power,life=rand(.2,.85);this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,max:life,color,size:rand(1,3),kind:Math.random()>.35?'spark':'dot',drag:2.5});}
    }
    spawnParticles(count,make){const max=this.ultra?1500:500,n=count*(this.ultra?1:.5);for(let i=0;i<n;i++){if(this.particles.length>=max)break;this.particles.push(make());}}
    shards(x,y,color,count=8,power=1){this.spawnParticles(count,()=>{const a=rand(0,TAU),s=rand(90,420)*power,life=rand(.45,1.1);return{x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,max:life,color,size:rand(4,9),kind:'shard',rot:rand(0,TAU),vr:rand(-14,14),drag:3.2};});}
    embers(x,y,color,count=10,spread=30){this.spawnParticles(count,()=>{const life=rand(.7,1.6);return{x:x+rand(-spread,spread),y:y+rand(-spread*.6,spread*.6),vx:rand(-25,25),vy:rand(-95,-30),life,max:life,color,size:rand(1,2.4),kind:'ember',drag:.6};});}
    glyphs(x,y,color,count=12,power=1){this.spawnParticles(count,()=>{const a=rand(0,TAU),s=rand(60,260)*power,life=rand(.5,1.1);return{x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,max:life,color,size:2,kind:'glyph',ch:'01<>/#ϟ'[Math.floor(Math.random()*7)],drag:3};});}
    directional(x,y,angle,color,count=6,power=1,spread=.5){this.spawnParticles(count,()=>{const a=angle+rand(-spread,spread),s=rand(140,460)*power,life=rand(.12,.4);return{x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,max:life,color,size:rand(1,2.6),kind:'spark',drag:3};});}
    ring(x,y,max,color,life=.4,o={}){this.rings.push({x,y,r:o.from??6,max,life,total:life,color,width:o.width??8,sides:o.sides||0,rot:rand(0,TAU),fill:!!o.fill});this.cap(this.rings,90);}
    flare(x,y,r,color,life=.18){this.flares.push({x,y,r,color,life,total:life});this.cap(this.flares,70);}
    pillar(x,y,color,life=.5,width=26,height=420){this.pillars.push({x,y,color,life,total:life,width,height});this.cap(this.pillars,40);}
    rays(x,y,color,count=16,len=600,life=.9){this.raybursts.push({x,y,color,count,len,life,total:life,rot:rand(0,TAU)});this.cap(this.raybursts,10);}
    decal(x,y,r,color){this.decals.push({x,y,r,color,life:5,total:5});this.cap(this.decals,this.ultra?36:14);}
    label(x,y,text,color,size=16,life=.9,o={}){this.texts.push({x,y,text,color,size,life,total:life,vx:o.vx||0,vy:o.vy??-35,font:o.font||'monospace'});}
    damageText(x,y,amount,color){const big=amount>=80,huge=amount>=250;this.label(x+rand(-14,14),y-22,Math.round(amount)+(huge?'!':''),huge?'#ffffff':big?palette.yellow:color,huge?30:big?22:amount>25?16:13,big?.85:.6,{vx:rand(-22,22),vy:-55,font:big?'Impact':'monospace'});}
    after(delay,fn){this.timers.push({t:delay,fn});this.cap(this.timers,80);}
    kick(shake=0,zoom=0,aberr=0){this.shake=Math.max(this.shake,shake);this.zoom=Math.max(this.zoom,zoom);this.aberr=Math.max(this.aberr,aberr);}
    bolt(x,y,tx,ty,color,life=.2,width=5,branch=true){
      const d=Math.hypot(tx-x,ty-y),n=Math.max(4,Math.min(14,Math.round(d/45))),j=Math.min(26,10+d*.03),points=[[x,y]];
      for(let i=1;i<n;i++){const t=i/n;points.push([x+(tx-x)*t+rand(-j,j),y+(ty-y)*t+rand(-j,j)]);}points.push([tx,ty]);
      this.bolts.push({points,life,total:life,color,width});
      if(branch&&this.ultra&&d>120){const forks=d>320?2:1;for(let f=0;f<forks;f++){const p=points[1+Math.floor(Math.random()*(points.length-2))],a=Math.atan2(ty-y,tx-x)+rand(-1.1,1.1),len=rand(40,110),fork=[[p[0],p[1]]];for(let i=1;i<=3;i++)fork.push([p[0]+Math.cos(a)*len*i/3+rand(-9,9),p[1]+Math.sin(a)*len*i/3+rand(-9,9)]);this.bolts.push({points:fork,life:life*.8,total:life*.8,color,width:width*.5});}}
      this.cap(this.bolts,80);
    }
    firework(x,y,color){this.burst(x,y,color,90,2,true);this.ring(x,y,rand(150,240),color,.6,{fill:true});this.flare(x,y,170,color,.25);this.embers(x,y,color,12,50);}
    bossDeath(x,y,color,name='CERBERUS'){
      const P=palette;this.kick(18,.8,1);this.flash=.5;this.dim=1;this.ring(x,y,500,'#ffffff',.5,{width:14});this.burst(x,y,color,120,2,true);
      // A chain of secondary detonations, then the core goes.
      for(let i=0;i<9;i++)this.after(.1+i*.12,()=>{const ex=x+rand(-120,120),ey=y+rand(-100,100),col=[P.pink,P.orange,P.yellow,'#ffffff'][i%4];this.burst(ex,ey,col,55,1.5,true);this.shards(ex,ey,'#9fb2c4',8,1.3);this.ring(ex,ey,rand(110,200),col,.4,{fill:true});this.flare(ex,ey,150,col,.2);this.pillar(ex,ey,col,.35,18,500);this.kick(9,.2,.3);});
      this.after(1.25,()=>{this.flash=.9;this.dim=1;this.kick(30,1.2,1.2);this.rays(x,y,P.yellow,28,1500,1.6);this.rays(x,y,P.pink,14,1100,1.3);this.ring(x,y,1700,'#ffffff',1.2,{width:16});this.ring(x,y,1300,P.pink,1.5,{width:16});this.ring(x,y,900,P.yellow,1.8,{width:16});this.burst(x,y,P.yellow,260,3.2,true);this.burst(x,y,P.pink,160,2.4,true);this.shards(x,y,'#c5d3df',60,1.8);this.flare(x,y,620,'#ffffff',.5);this.decal(x,y,170,P.pink);this.label(x,Math.max(300,y-120),name + ' // TERMINATED',P.yellow,44,2.4,{vy:-14,font:'Impact'});});
    }
    midbossDeath(x,y,color,name='MIDBOSS'){
      this.kick(11,.45,.65);this.flash=.22;this.ring(x,y,260,color,.65,{width:11});this.ring(x,y,130,'#ffffff',.38,{fill:true});
      this.burst(x,y,color,100,1.9,true);this.shards(x,y,'#d9e6ee',24,1.4);this.rays(x,y,color,12,520,.8);this.flare(x,y,220,color,.32);this.decal(x,y,92,color);
      this.label(x,Math.max(240,y-90),name+' // BREAK',color,25,1.6,{vy:-18,font:'Impact'});
    }
    campaignStyle(data,color){
      const base=factionStyle[data?.faction]||factionStyle.power;
      return { color: data?.color||base.color||color, edge: base.edge, dark: base.dark, accent: base.accent };
    }
    drawCampaignEnemy(x,y,angle,color,type,t,data){
      const c=this.ctx,style=this.campaignStyle(data,color),variant=data.variant||type;
      const boss=type==='boss',midboss=!!data.midboss,baseR=data.r|| (boss?58:midboss?34:22),scale=(boss?1.7:midboss?1.28:1);
      const points=(list,fill=style.dark,stroke=style.color,width=2)=>{
        c.beginPath();list.forEach((point,index)=>index?c.lineTo(point[0],point[1]):c.moveTo(point[0],point[1]));c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=width;c.stroke();
      };
      const wheel=(wx,wy,wr,fill=style.color)=>{c.fillStyle='#081119';c.strokeStyle=style.edge;c.lineWidth=2;c.beginPath();c.arc(wx,wy,wr,0,TAU);c.fill();c.stroke();c.fillStyle=fill;c.fillRect(wx-wr*.18,wy-wr*.72,wr*.36,wr*1.44);};
      c.save();c.translate(x,y);c.globalAlpha=.97;c.fillStyle='#0008';c.beginPath();c.ellipse(6,baseR*.56,baseR*1.12,baseR*.43,0,0,TAU);c.fill();c.rotate(angle);c.scale(scale,scale);
      const r=baseR/scale;
      c.shadowColor=style.color;c.shadowBlur=this.ultra&&(midboss||boss)?18:0;
      if(boss||variant==='command'){
        c.save();c.rotate(t*.34);for(let i=0;i<8;i++){c.rotate(TAU/8);points([[r*.55,-r*.24],[r*1.28,-r*.35],[r*1.55,0],[r*1.28,r*.35],[r*.55,r*.24]],style.dark,style.color,2.2);c.fillStyle=style.accent;c.fillRect(r*1.12,-4,r*.17,8);}c.restore();
        c.fillStyle=style.dark;c.strokeStyle=style.edge;c.lineWidth=4;c.beginPath();c.arc(0,0,r*.88,0,TAU);c.fill();c.stroke();c.strokeStyle=style.color;c.lineWidth=3;c.setLineDash([18,10]);c.beginPath();c.arc(0,0,r*.66,0,TAU);c.stroke();c.setLineDash([]);c.fillStyle=style.edge;c.shadowColor=style.color;c.shadowBlur=26;c.beginPath();c.arc(0,0,r*.26+Math.sin(t*6)*2,0,TAU);c.fill();
      }else if(variant==='spark-scout'){
        points([[r*-1.05,0],[r*.05,-r*.75],[r*1.05,0],[r*.05,r*.75]],style.dark,style.color,2);c.strokeStyle=style.accent;c.lineWidth=2;c.beginPath();c.moveTo(0,-r*.7);c.lineTo(0,-r*1.3);c.stroke();c.fillStyle=style.accent;c.fillRect(-3,-r*1.43,6,5);c.strokeStyle=style.color;c.beginPath();c.moveTo(r*.18,-r*.3);c.lineTo(r*.75,-r*.62);c.lineTo(r*.9,-r*.45);c.stroke();
      }else if(variant==='relay-sniper'){
        points([[r*-1.05,-r*.55],[r*.2,-r*.66],[r*.72,-r*.32],[r*.72,r*.32],[r*.2,r*.66],[r*-1.05,r*.55]],style.dark,style.color,2);c.fillStyle=style.accent;c.fillRect(r*.05,-r*.3,r*.9,r*.15);c.fillStyle=style.color;c.fillRect(r*.58,-r*.11,r*1.12,r*.22);c.fillStyle=style.edge;c.fillRect(-r*.7,-r*.18,r*.3,r*.36);
      }else if(variant==='capacitor-tank'){
        points([[r*-1.05,-r*.72],[r*.72,-r*.72],[r*1.05,-r*.35],[r*1.05,r*.35],[r*.72,r*.72],[r*-1.05,r*.72],[r*-1.28,r*.3],[r*-1.28,-r*.3]],style.dark,style.color,2.5);c.fillStyle=style.accent;c.fillRect(-r*.55,-r*.62,r*.24,r*1.24);c.fillRect(-r*.12,-r*.62,r*.24,r*1.24);c.fillStyle=style.color;c.fillRect(r*.55,-r*.18,r*.68,r*.36);
      }else if(variant==='arc-warden'){
        c.fillStyle=style.dark;c.strokeStyle=style.color;c.lineWidth=2.5;c.beginPath();c.arc(0,0,r*.8,0,TAU);c.fill();c.stroke();c.strokeStyle=style.accent;c.lineWidth=5;c.beginPath();c.arc(0,0,r*1.05,-1.12,1.12);c.stroke();c.fillStyle=style.edge;c.fillRect(r*.12,-r*.16,r*.58,r*.32);
      }else if(variant==='transformer'){
        points([[r*-1.1,-r*.72],[r*.55,-r*.8],[r*1.12,-r*.35],[r*1.12,r*.35],[r*.55,r*.8],[r*-1.1,r*.72],[r*-1.35,0]],style.dark,style.color,3);c.fillStyle=style.accent;c.fillRect(-r*.58,-r*.57,r*.22,r*1.14);c.fillRect(-r*.1,-r*.57,r*.22,r*1.14);c.fillStyle=style.edge;c.beginPath();c.arc(r*.52,0,r*.2,0,TAU);c.fill();c.strokeStyle=style.accent;c.lineWidth=3;c.beginPath();c.arc(0,0,r*1.2,0,TAU);c.stroke();
      }else if(variant==='belt-runner'){
        points([[r*-1.2,-r*.34],[r*.8,-r*.34],[r*1.2,0],[r*.8,r*.34],[r*-1.2,r*.34],[r*-1.38,0]],style.dark,style.color,2);wheel(-r*.72,r*.5,r*.25);wheel(r*.62,r*.5,r*.25);c.fillStyle=style.accent;c.fillRect(-r*.65,-r*.12,r*1.25,r*.24);
      }else if(variant==='marker-drone'){
        points([[0,-r*.95],[r*.78,0],[0,r*.95],[-r*.78,0]],style.dark,style.color,2);c.fillStyle=style.accent;c.fillRect(-r*.12,-r*.12,r*.24,r*.24);c.strokeStyle=style.color;c.lineWidth=2;c.beginPath();c.moveTo(0,-r*.88);c.lineTo(0,-r*1.4);c.stroke();c.fillStyle=style.accent;c.fillRect(-3,-r*1.5,6,6);
      }else if(variant==='cargo-hauler'){
        points([[r*-1.1,-r*.7],[r*.55,-r*.7],[r*1.1,-r*.35],[r*1.1,r*.7],[r*-1.1,r*.7]],style.dark,style.color,2.5);c.strokeStyle=style.accent;c.lineWidth=3;c.strokeRect(-r*.72,-r*.44,r*1.24,r*.92);wheel(-r*.68,r*.86,r*.22);wheel(r*.7,r*.86,r*.22);
      }else if(variant==='pursuit-unit'){
        points([[r*-1.1,0],[r*.32,-r*.76],[r*1.14,-r*.35],[r*1.14,r*.35],[r*.32,r*.76]],style.dark,style.color,2);c.fillStyle=style.accent;c.fillRect(r*.2,-r*.2,r*.65,r*.4);wheel(-r*.58,r*.7,r*.2);wheel(-r*.58,-r*.7,r*.2);
      }else if(variant==='freight-breaker'){
        points([[r*-1.28,-r*.72],[r*.55,-r*.78],[r*1.25,-r*.2],[r*1.05,r*.8],[r*-1.18,r*.68]],style.dark,style.color,3);c.strokeStyle=style.accent;c.lineWidth=4;c.strokeRect(-r*.7,-r*.5,r*1.2,r*.52);c.fillStyle=style.edge;c.fillRect(r*.68,-r*.22,r*.65,r*.44);wheel(-r*.76,r*.82,r*.22);wheel(r*.72,r*.82,r*.22);
      }else if(variant==='suture-probe'){
        points([[r*-1.1,0],[r*.45,-r*.36],[r*1.15,0],[r*.45,r*.36]],style.dark,style.color,2);c.fillStyle=style.accent;c.beginPath();c.arc(r*.65,0,r*.17,0,TAU);c.fill();c.strokeStyle=style.edge;c.lineWidth=2;c.beginPath();c.moveTo(r*1.05,0);c.lineTo(r*1.5,0);c.stroke();
      }else if(variant==='dose-turret'){
        c.fillStyle=style.dark;c.strokeStyle=style.color;c.lineWidth=2.5;c.beginPath();c.arc(0,0,r*.7,0,TAU);c.fill();c.stroke();c.fillStyle=style.accent;c.fillRect(-r*.82,-r*.18,r*.28,r*.56);c.fillRect(r*.54,-r*.18,r*.28,r*.56);c.fillStyle=style.edge;c.fillRect(r*.15,-r*.1,r*.7,r*.2);
      }else if(variant==='graft-shell'){
        c.fillStyle=style.dark;c.strokeStyle=style.color;c.lineWidth=3;c.beginPath();c.arc(0,0,r*.8,0,TAU);c.fill();c.stroke();c.strokeStyle=style.accent;c.lineWidth=3;c.beginPath();c.arc(0,0,r*.52,-1.2,1.2);c.stroke();c.fillStyle=style.edge;c.fillRect(-r*.1,-r*.18,r*.55,r*.36);
      }else if(variant==='quarantine-unit'){
        points([[r*-1,-r*.7],[r*.62,-r*.7],[r*1.05,0],[r*.62,r*.7],[r*-1,r*.7],[r*-1.25,0]],style.dark,style.color,2.5);c.strokeStyle=style.accent;c.lineWidth=3;c.setLineDash([5,4]);c.strokeRect(-r*.72,-r*.47,r*1.18,r*.94);c.setLineDash([]);c.fillStyle=style.edge;c.fillRect(r*.2,-r*.15,r*.44,r*.3);
      }else if(variant==='graft-curator'){
        c.fillStyle=style.dark;c.strokeStyle=style.color;c.lineWidth=3;c.beginPath();c.arc(0,0,r*.72,0,TAU);c.fill();c.stroke();c.strokeStyle=style.accent;c.lineWidth=4;c.beginPath();c.arc(0,0,r*1.02,0,TAU);c.stroke();c.fillStyle=style.edge;c.beginPath();c.arc(0,0,r*.22,0,TAU);c.fill();for(let i=0;i<4;i++){const a=i*TAU/4;c.fillStyle=style.accent;c.fillRect(Math.cos(a)*r*.93-3,Math.sin(a)*r*.93-3,6,6);}
      }else{
        points([[r*-1,-r*.56],[r*.45,-r*.7],[r,r*0],[r*.45,r*.7],[r*-1,r*.56]],style.dark,style.color,2);
        c.fillStyle=style.accent;c.fillRect(r*.18,-r*.25,r*.18,r*.5);
      }
      c.shadowBlur=0;c.restore();
      this.drawCampaignStatus(x,y,type,t,data,style,baseR,scale);
      return true;
    }
    drawCampaignStatus(x,y,type,t,data,style,r,scale){
      const c=this.ctx,midboss=!!data.midboss;
      if(data.hp<data.maxHp&&type!=='boss'){
        const width=r*2*scale;c.fillStyle='#000b';c.fillRect(x-width/2,y-r*scale-14,width,midboss?6:3);c.fillStyle=style.color;c.fillRect(x-width/2,y-r*scale-14,width*Math.max(0,data.hp/data.maxHp),midboss?6:3);
      }
      if(midboss){
        c.save();c.globalAlpha=.82+.12*Math.sin(t*6);c.strokeStyle=style.accent;c.lineWidth=2;c.setLineDash([8,5]);c.beginPath();c.arc(x,y,r*scale+14,0,TAU);c.stroke();c.setLineDash([]);c.restore();
      }
      const status=data.stun>0?palette.yellow:data.burn>0?palette.orange:data.infected>0?palette.green:data.hitFlash>0?'#ffffff':null;
      if(status){
        c.save();c.strokeStyle=status;c.lineWidth=2;c.globalAlpha=.76;c.setLineDash(data.stun>0?[6,4]:[]);
        c.beginPath();c.arc(x,y,r+6,0,TAU);c.stroke();c.restore();
      }
      const weakness=data.weakness;
      if(weakness&&(midboss||data.focused||data.focusWeakness||weakness.visible)){
        const wx=x,wy=y-r*scale-31,wcolor=weakness.color||style.accent,glyph=weakness.glyph||'◎',short=weakness.short||weakness.label||'WEAK';
        c.save();c.globalAlpha=.94+.06*Math.sin(t*7);c.fillStyle='#06101ad9';c.strokeStyle=wcolor;c.lineWidth=1.5;c.beginPath();c.arc(wx,wy,10,0,TAU);c.fill();c.stroke();c.fillStyle=wcolor;c.font='bold 12px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(glyph,wx,wy+.5);if(midboss){c.font='bold 8px monospace';c.textBaseline='alphabetic';c.fillText(short.toUpperCase(),wx,wy-15);}c.restore();
      }
    }
    event(e){const x=e.x??800,y=e.y??500,color=e.color&&e.color[0]==='#'&&e.color.length===7?e.color:palette.cyan,P=palette;switch(e.type){
      case 'start':this.pillar(x,y,P.cyan,.7,46,700);this.ring(x,y,150,P.cyan,.6);this.burst(x,y,P.cyan,50,1.3);this.glyphs(x,y,P.cyan,14);this.kick(5,.5,.4);break;
      case 'shot':{const a=Math.atan2((e.ty??y)-y,(e.tx??x+1)-x),mx=x+Math.cos(a)*26,my=y+Math.sin(a)*26;this.flare(mx,my,22,color,.07);this.directional(mx,my,a,color,3,.5,.45);break;}
      case 'hit':this.burst(x,y,color,5,.45);this.flare(x,y,16,color,.09);if(e.amount)this.damageText(x,y,e.amount,'#e0f8ff');break;
      case 'kill':{const type=e.enemyType,heavy=type==='tank'||type==='elite';if(type==='boss'){this.bossDeath(x,y,color,e.name);break;}if(e.midboss){this.midbossDeath(x,y,color,e.name||'MIDBOSS');break;}
        this.burst(x,y,color,heavy?46:22,heavy?1.5:1.15);this.shards(x,y,'#9fb2c4',heavy?12:5,heavy?1.2:.9);this.shards(x,y,color,heavy?6:2,1);
        this.ring(x,y,heavy?120:60,color,.35);this.flare(x,y,heavy?120:64,color,.16);this.decal(x,y,heavy?52:30,color);this.kick(heavy?7:2.5,heavy?.45:0,heavy?.35:0);
        if(e.combo>0&&e.combo%10===0){this.label(x,y-58,e.combo+' CHAIN',e.combo>=50?P.pink:e.combo>=25?P.yellow:P.cyan,e.combo>=50?40:32,1.1,{vy:-28,font:'Impact'});this.ring(x,y,190,P.yellow,.5,{width:4});}
        break;}
      case 'explosion':{if(e.enemyType==='boss')break;const r=e.r||e.amount||17;this.burst(x,y,color,14+r,1.3+r*.02);this.ring(x,y,e.radius||r*5,color,.5,{from:4,fill:true});if(this.ultra)this.embers(x,y,P.orange,4,r);this.shake=Math.max(this.shake,2+r*.14);break;}
      case 'dash':this.burst(x,y,P.cyan,40,1.2);this.ring(x,y,70,P.cyan,.3);this.flare(x,y,90,P.cyan,.14);this.speed=Math.max(this.speed,.75);this.kick(3,.3,.25);
        if(Number.isFinite(e.tx)){this.ring(e.tx,e.ty,48,P.cyan,.3,{width:4});this.bolts.push({points:[[e.tx,e.ty],[x,y]],life:.32,total:.32,color:P.cyan,width:5});const a=Math.atan2(y-e.ty,x-e.tx);for(let i=0;i<7;i++)this.trails.push({x:e.tx+(x-e.tx)*i/7,y:e.ty+(y-e.ty)*i/7,angle:a,life:.5,color:P.cyan});this.directional(x,y,a+Math.PI,P.cyan,10,.8,.35);}break;
      case 'lightning':{const tx=e.tx??e.targetX??x+100,ty=e.ty??e.targetY??y;this.bolt(x,y,tx,ty,P.cyan,.2,5);this.flare(tx,ty,46,P.cyan,.12);this.burst(tx,ty,P.cyan,9,.5);break;}
      case 'hack':this.ring(x,y,300,P.green,.85,{sides:6,width:10,from:10});this.ring(x,y,230,P.green,.6,{sides:6,width:4,from:10});this.ring(x,y,300,P.green,.7,{fill:true,from:10});this.burst(x,y,P.green,60,1.4);this.glyphs(x,y,P.green,36,1.5);this.flare(x,y,200,P.green,.25);this.kick(5,.35,.7);break;
      case 'ultimate':this.dim=1.25;this.speed=1;this.flash=.22;this.kick(22,1,1);this.rays(x,y,P.yellow,26,1500,1.2);this.rays(x,y,P.cyan,13,1000,.9);
        this.ring(x,y,1600,P.yellow,1.3,{from:1,width:14});this.ring(x,y,1300,P.cyan,1.5,{from:1});this.ring(x,y,900,'#ffffff',.7,{from:1,width:10});this.flare(x,y,420,'#ffffff',.3);
        this.burst(x,y,P.yellow,240,3,true);this.shards(x,y,P.yellow,24,1.6);this.glyphs(x,y,P.cyan,30,2.2);break;
      case 'damage':this.kick(10,.3,.9);this.flash=-.3;this.hurt=1;this.burst(x,y,P.pink,20,.7);this.shards(x,y,'#d9e6ee',5,.8);this.ring(x,y,80,P.pink,.3);
        if(Number.isFinite(e.tx)&&Number.isFinite(e.ty))this.directional(x,y,Math.atan2(y-e.ty,x-e.tx),P.pink,12,1.2,.6);
        this.label(x,y-40,'−'+Math.ceil(e.amount||0),P.pink,27,1,{font:'Impact'});break;
      case 'slash':{const angle=e.angle??Math.atan2((e.ty??y)-y,(e.tx??x)-x),r=e.radius||170;this.slashes.push({x,y,angle,r,life:.32,total:.32,color:P.orange});
        this.after(.06,()=>{this.slashes.push({x,y,angle:angle+.12,r:r*1.12,life:.24,total:.24,color:P.yellow});this.cap(this.slashes,24);});
        this.burst(x,y,P.orange,18,1);this.directional(x,y,angle,P.orange,14,1.3,.9);this.flare(x+Math.cos(angle)*r*.5,y+Math.sin(angle)*r*.5,r*.7,P.orange,.12);this.kick(2.5,.15,0);break;}
      case 'drone':{const a=Math.atan2((e.ty??y)-y,(e.tx??x+1)-x);this.bolts.push({points:[[x,y],[x+Math.cos(a)*30,y+Math.sin(a)*30]],life:.12,total:.12,color:'#c37aff',width:4});this.flare(x,y,18,'#c37aff',.08);break;}
      case 'damageEnemy':
        if(e.source==='ultimate'){this.pillar(x,y,P.yellow,.5,22,640);this.flare(x,y,110,P.yellow,.25);this.bolt(x+rand(-60,60),y-520,x,y,P.yellow,.28,4,false);}
        else if(e.source==='hack')this.glyphs(x,y,P.green,4,.6);
        else if(e.source==='slash'){this.directional(x,y,rand(0,TAU),P.orange,6,.9,.5);this.flare(x,y,30,P.orange,.1);}
        if(e.source!=='shot'&&e.amount>5)this.damageText(x,y,e.amount,e.source==='ultimate'?P.yellow:color);break;
      case 'spawn':this.rings.push({x,y,r:50,max:8,life:.6,total:.6,color:P.pink,width:8});this.pillar(x,y,color,.4,12,280);this.glyphs(x,y,color,3,.6);break;
      case 'pickup':this.burst(x,y,color,20,.65);this.ring(x,y,44,color,.3,{width:4});this.label(x,y-26,{heal:'+HP',cool:'COOL',energy:'+EN'}[e.pickup]||'+',color,12,.7);break;
      case 'chestDrop':{const tier={rare:1,epic:2,legendary:3}[e.rarity]||1,col={rare:P.cyan,epic:'#c37aff',legendary:P.yellow}[e.rarity]||P.yellow;
        this.rings.push({x,y,r:100,max:34,life:1,total:1,color:col,width:8});this.burst(x,y,col,30+tier*20,1,tier>1);this.pillar(x,y,col,1.1,22+tier*12,700);this.flare(x,y,90+tier*40,col,.3);
        this.label(x,y-92,(e.rarity||'data').toUpperCase()+' VAULT',col,12+tier*5,1.4,{vy:-16,font:'Impact'});
        if(tier===3){this.rays(x,y,col,18,520,1.2);this.kick(7,.4,.4);this.flash=.25;}else if(tier===2)this.kick(4,.2,.2);break;}
      case 'chestOpen':{const tier={rare:1,epic:2,legendary:3}[e.rarity]||1,col={rare:P.cyan,epic:'#c37aff',legendary:P.yellow}[e.rarity]||P.yellow;
        this.burst(x,y,col,70+tier*50,2,true);this.ring(x,y,300,col,1,{from:20});this.ring(x,y,180+tier*60,'#ffffff',.5,{from:20,fill:true});this.pillar(x,y,col,.9,40+tier*14,800);this.flare(x,y,200+tier*70,col,.35);this.embers(x,y,col,10+tier*6,60);
        if(tier>1)this.rays(x,y,col,10+tier*5,400+tier*220,1);this.flash=.15*tier;this.kick(5+tier*3,.3+tier*.2,.25*tier);break;}
      case 'upgrade':this.pillar(x,y,color,.8,40,600);this.ring(x,y,130,color,.5,{sides:6});this.embers(x,y,color,16,40);this.flare(x,y,120,color,.3);this.glyphs(x,y,color,8);break;
      case 'overheat':this.burst(x,y,P.orange,40,1);this.ring(x,y,140,P.orange,.5,{fill:true});this.embers(x,y,P.orange,20,30);this.label(x,y-52,'OVERHEAT',P.orange,22,1,{font:'Impact',vy:-20});this.kick(6,.2,.5);break;
      case 'cool':this.rings.push({x,y,r:120,max:20,life:.45,total:.45,color:P.cyan,width:5});this.burst(x,y,P.cyan,14,.5);this.label(x,y-48,'SYSTEM COOLED',P.cyan,12,.9);break;
      case 'shield':this.ring(x,y,90,'#79a7ff',.4,{sides:6,width:6});this.shards(x,y,'#79a7ff',14,1.1);this.flare(x,y,100,'#79a7ff',.2);this.label(x,y-48,'SHIELD BREAK','#79a7ff',15,.9,{font:'Impact'});this.kick(5,.2,.4);break;
      case 'midboss':{
        const style=this.campaignStyle(e,e.color||color);
        this.ring(x,y,205,style.color,.7,{width:8});
        this.ring(x,y,90,style.accent,.45);
        this.pillar(x,y,style.color,.7,34,580);
        this.burst(x,y,style.color,40,1.6,true);
        break;
      }
      case 'weakPoint':this.ring(x,y,e.radius||44,e.color||P.yellow,.35,{sides:6,width:4});this.flare(x,y,e.radius||40,e.color||P.yellow,.2);if(e.glyph)this.label(x,y-25,e.glyph,e.color||P.yellow,16,.6);break;
      case 'boss':this.dim=.9;this.flash=-.35;this.kick(16,.6,.9);this.pillar(x,y,P.pink,1.2,90,900);this.glyphs(x,y,P.pink,40,2);this.burst(x,y,P.pink,120,2,true);this.rays(x,y,P.pink,16,700,1.2);
        for(let i=0;i<3;i++)this.after(i*.22,()=>this.ring(x,y,520+i*160,P.pink,.9,{width:12}));break;
      case 'bossPhase':this.dim=.8;this.flash=-.4;this.kick(20,.8,1);this.ring(x,y,700,P.pink,.9,{width:14});this.ring(x,y,420,'#ffffff',.5,{width:10,fill:true});this.burst(x,y,P.pink,150,2.4,true);this.shards(x,y,'#c5d3df',20,1.5);this.rays(x,y,P.pink,20,800,1.1);
        this.label(x,Math.max(300,y-130),'LIMITER RELEASED',P.pink,34,1.8,{vy:-12,font:'Impact'});break;
      case 'resonance':this.pillar(x,y,color,1.1,60,800);this.rays(x,y,color,16,520,1.1);this.ring(x,y,260,color,.8,{sides:6,width:10});this.ring(x,y,170,'#ffffff',.5,{fill:true});this.embers(x,y,color,24,60);this.glyphs(x,y,color,16,1.4);this.flare(x,y,220,color,.4);this.kick(6,.5,.5);this.label(x,y-110,(e.name||'RESONANCE')+' Lv'+(e.level||1),color,30,1.8,{vy:-14,font:'Impact'});break;
      case 'heatwave':this.ring(x,y,e.radius||320,P.orange,.55,{width:16,fill:true});this.ring(x,y,(e.radius||320)*.7,P.yellow,.4,{width:6});this.burst(x,y,P.orange,90,2.2,true);this.embers(x,y,P.orange,26,90);this.flare(x,y,260,P.orange,.3);this.kick(9,.5,.6);break;
      case 'counter':this.ring(x,y,e.radius||240,'#79a7ff',.45,{sides:6,width:12});this.ring(x,y,(e.radius||240)*.6,'#ffffff',.3,{fill:true});this.shards(x,y,'#79a7ff',12,1.2);this.flare(x,y,180,'#79a7ff',.25);this.kick(6,.3,.4);break;
      case 'viralBurst':this.ring(x,y,e.radius||170,P.green,.4,{width:6,fill:true});this.glyphs(x,y,P.green,8,1.1);this.burst(x,y,P.green,14,.9);break;
      case 'splash':this.ring(x,y,e.radius||90,'#c37aff',.25,{width:4,fill:true});break;
      case 'scorch':this.ring(x,y,e.radius||140,P.orange,.35,{width:6,fill:true});this.burst(x,y,P.orange,16,1.1);this.embers(x,y,P.orange,6,40);this.flare(x,y,90,P.orange,.16);break;
      case 'shieldUp':this.ring(x,y,60,'#79a7ff',.5,{sides:6,width:5,from:110});this.flare(x,y,70,'#79a7ff',.2);this.label(x,y-46,'SHIELD ONLINE','#79a7ff',12,.9);break;
      case 'surge':this.ring(x,y,120,'#53ffcf',.4,{width:6});this.directional(x,y,rand(0,TAU),'#53ffcf',14,1.2,3.1);this.speed=Math.max(this.speed,.6);break;
      case 'radial':this.ring(x,y,e.radius||150,e.radius?color:P.pink,.3,{width:5});this.shake=Math.max(this.shake,3);break;
      case 'fan':this.flare(x,y,70,P.pink,.12);break;
      case 'enemyShot':this.flare(x,y,34,color,.1);break;
      case 'floorClear':this.flash=.3;this.kick(6,.6,.3);this.rays(x,y,P.yellow,20,900,1.2);this.ring(x,y,600,P.yellow,1,{width:10});this.ring(x,y,380,P.cyan,.8);
        for(let i=0;i<6;i++)this.after(i*.12,()=>this.firework(x+rand(-380,380),y+rand(-240,240),[P.yellow,P.cyan,P.pink][i%3]));break;
      case 'victory':this.flash=.5;this.shake=Math.max(this.shake,15);for(let i=0;i<12;i++)this.after(1.6+i*.2,()=>this.firework(rand(200,1400),rand(180,820),[P.yellow,P.cyan,P.pink][i%3]));break;
      case 'death':this.dim=1;this.flash=-.5;this.hurt=1;this.kick(18,.9,1.2);this.burst(x,y,P.pink,150,2,true);this.shards(x,y,'#c5d3df',40,1.5);this.ring(x,y,420,P.pink,.9,{width:12});this.ring(x,y,220,'#ffffff',.5,{fill:true});this.flare(x,y,300,P.pink,.4);this.glyphs(x,y,P.pink,30,1.6);
        for(let i=0;i<5;i++)this.after(.15+i*.16,()=>{this.burst(x+rand(-50,50),y+rand(-40,40),i%2?P.pink:P.orange,45,1.3,true);this.kick(7,.1,.3);});break;
    }}
    update(dt,engine,attract){this.time+=dt;this.lastDt=dt;this.shake*=Math.exp(-dt*8);this.flash*=Math.exp(-dt*5);this.zoom*=Math.exp(-dt*6);this.aberr*=Math.exp(-dt*5.5);this.speed*=Math.exp(-dt*3.2);this.dim*=Math.exp(-dt*2.4);this.hurt*=Math.exp(-dt*2.8);
      if(this.timers.length){const due=[];this.timers=this.timers.filter(timer=>{timer.t-=dt;if(timer.t>0)return true;due.push(timer);return false;});for(const timer of due)timer.fn();}
      const p=engine?.player,alive=p&&!attract&&engine.state!=='dead';
      if(alive){this.trails.push({x:p.x,y:p.y,angle:p.angle||0,life:.3,color:p.invuln>0?palette.cyan:palette.blue});if(this.trails.length>35)this.trails.shift();}
      // Ambient sparks live here rather than in render(), so a paused frame never accumulates them.
      if(alive&&dt>0&&this.ultra){if(p.energy>=(p.maxEnergy||100)&&Math.random()<dt*12)this.embers(p.x,p.y+8,palette.yellow,1,22);const boss=engine.enemies?.find(enemy=>enemy.type==='boss');if(boss&&boss.phase===2&&Math.random()<dt*18)this.embers(boss.x,boss.y,palette.pink,1,80);for(const enemy of engine.enemies||[])if(enemy.burn>0&&Math.random()<dt*9)this.embers(enemy.x,enemy.y,palette.orange,1,14);if((engine.combo||0)>=25&&Math.random()<dt*10)this.embers(p.x,p.y+10,engine.combo>=50?palette.pink:palette.yellow,1,26);}
      for(const a of this.particles){a.life-=dt;a.x+=a.vx*dt;a.y+=a.vy*dt;const drag=Math.exp(-dt*a.drag);a.vx*=drag;a.vy*=drag;if(a.kind==='shard')a.rot+=a.vr*dt;}
      this.particles=this.particles.filter(a=>a.life>0);
      for(const name of ['rings','bolts','texts','trails','slashes','flares','pillars','raybursts','decals']){const list=this[name];let dead=false;for(const a of list){a.life-=dt;if(a.life<=0)dead=true;}if(dead)this[name]=list.filter(a=>a.life>0);}
      for(const a of this.texts){a.x+=a.vx*dt;a.y+=a.vy*dt;const drag=Math.exp(-dt*2.2);a.vx*=drag;a.vy*=drag;}
      for(const r of this.rain){r.y+=r.speed*dt;r.x-=r.speed*.23*dt;if(r.y>1150){r.y=-100;r.x=rand(-100,1800);}}
      for(const s of this.splashes){s.life-=dt;if(s.life<=0){s.x=rand(80,1520);s.y=rand(100,900);s.total=s.life=rand(.25,.6);}}
      if(attract&&Math.random()<dt*7){let x=rand(750,1400),y=rand(240,780);this.burst(x,y,Math.random()>.5?palette.cyan:palette.pink,18,.7);if(Math.random()>.6)this.event({type:'lightning',x:1100,y:490,tx:x,ty:y});}
    }
    render(engine,attract=false){const c=this.ctx,w=this.w,h=this.h,t=this.time,motion=!this.reduced;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#070c14';c.fillRect(0,0,w,h);let scale=Math.min(w/1600,h/1000);
      const p=engine?.player;
      let cx=800,cy=500;
      if(w<h&&!attract&&p){
        scale=Math.max(w/900,h/1150);
        // Keep a full fighting view near the arena edges without letting the player leave it.
        const halfViewWidth=Math.min(800,w/(2*scale));
        const halfViewHeight=Math.min(500,h/(2*scale));
        cx=Math.max(halfViewWidth,Math.min(1600-halfViewWidth,p.x));
        cy=Math.max(halfViewHeight,Math.min(1000-halfViewHeight,p.y));
      }
      this.camera.x+=(cx-this.camera.x)*.12;this.camera.y+=(cy-this.camera.y)*.12;
      // Impact zoom-kick. It is part of the world transform, so telegraphs drawn last stay registered.
      if(motion)scale*=1+Math.min(1.5,this.zoom)*.035;
      const sx=motion?rand(-this.shake,this.shake):0,sy=motion?rand(-this.shake,this.shake):0;c.translate(w/2+sx,h/2+sy);c.scale(scale,scale);c.translate(-this.camera.x,-this.camera.y);c.drawImage(this.mapFor(!attract?engine?.contract:null),-100,-100);
      c.globalCompositeOperation='lighter';this.light(120,200,340,palette.cyan,.16);this.light(1490,780,380,palette.pink,.2);this.light(800,490,480,palette.blue,.06);
      // The active sector tints the whole rooftop, so each route reads differently at a glance.
      const tint=!attract&&(engine?.sector?.color||engine?.contract?.color);if(tint&&tint.length===7){this.light(800,500,1100,tint,.1);this.light(800,60,520,tint,.12);this.light(800,940,520,tint,.12);}
      // Searchlight sweeps and holographic perimeter rails.
      for(let i=0;i<3;i++){c.save();c.translate(i*700+100,-50);c.rotate(Math.sin(t*.16+i)*.3);const g=c.createLinearGradient(0,0,0,1100);g.addColorStop(0,'#79cfff12');g.addColorStop(1,'#79cfff00');c.fillStyle=g;c.beginPath();c.moveTo(0,0);c.lineTo(-200,1100);c.lineTo(200,1100);c.closePath();c.fill();c.restore();}
      this.line([[68,90],[68,910]],'#5af6f3',2,15);this.line([[1530,90],[1530,910]],'#ff4e8b',2,15);c.globalAlpha=.18+Math.sin(t*2)*.05;this.line([[400,64],[720,64]],palette.cyan,4,20);this.line([[920,935],[1250,935]],palette.pink,4,20);c.globalAlpha=1;
      if(this.ultra){c.strokeStyle='#bfe6ff';c.lineWidth=1;for(const s of this.splashes){const q=s.life/s.total;c.globalAlpha=q*.22;c.beginPath();c.ellipse(s.x,s.y,(1-q)*13+2,(1-q)*5+1,0,0,TAU);c.stroke();}c.globalAlpha=1;}
      c.globalCompositeOperation='source-over';this.drawDecals();
      if(attract)this.attractScene(t);else if(engine){
        const alive=p&&engine.state!=='dead';
        for(const pickup of engine.pickups||[]){const col=pickup.type==='heal'?palette.green:pickup.type==='cool'?palette.cyan:palette.yellow;this.light(pickup.x,pickup.y,28,col,.65);c.save();c.translate(pickup.x,pickup.y+Math.sin(t*5)*3);c.strokeStyle=col;c.lineWidth=2;c.strokeRect(-7,-7,14,14);if(pickup.type==='heal'){c.fillStyle=col;c.fillRect(-4,-1,8,2);c.fillRect(-1,-4,2,8);}else{c.rotate(t);c.strokeRect(-3,-3,6,6);}c.restore();}
        for(const chest of engine.chests||[])this.drawChest(chest,t);
        if(alive)this.playerAura(engine,p,t);
        if(engine.wire){const {from,to,ttl}=engine.wire;c.save();c.globalAlpha=Math.min(1,ttl*3);this.line([[from.x,from.y],[to.x,to.y]],'#91ffc4',4,16);c.restore();}
        c.globalCompositeOperation='lighter';for(const a of this.trails){c.globalAlpha=a.life*.3;this.actor(a.x,a.y,a.angle,a.color,'ghost',t);c.globalAlpha=1;}c.globalCompositeOperation='source-over';
        const focused=engine.contract&&engine._nearestEnemy();
        for(const enemy of engine.enemies||[]){const enemyColor=enemy.faction?enemy.color:enemy.type==='tank'?palette.orange:enemy.type==='shooter'||enemy.type==='boss'?palette.pink:palette.cyan;if(enemy.type==='boss'){const rage=enemy.phase===2;c.globalCompositeOperation='lighter';this.light(enemy.x,enemy.y,rage?340:250,enemyColor,(rage?.3:.17)+.06*Math.sin(t*(rage?9:4)));c.globalCompositeOperation='source-over';}this.actor(enemy.x,enemy.y,enemy.angle||0,enemyColor,enemy.type,t,enemy===focused?{...enemy,focused:true}:enemy);}
        for(const d of engine.drones||[]){this.actor(d.x,d.y,d.angle||t,palette.yellow,'drone',t);}
        // BLACKOUT / boss beats sink the arena into darkness; the player and every effect stay lit above it.
        if(this.dim>.02){c.globalAlpha=Math.min(.74,this.dim*.62);c.fillStyle='#02040a';c.fillRect(-100,-100,1800,1200);c.globalAlpha=1;}
        if(alive){const heat=p.heat/(engine.build.stats.heat||100);if(heat>.35){c.save();c.globalCompositeOperation='lighter';this.light(p.x,p.y,110,palette.orange,heat*.6);c.restore();if(this.lastDt>0&&Math.random()<heat*.4)this.burst(p.x+rand(-13,13),p.y+rand(-10,10),palette.orange,2,.3);}this.actor(p.x,p.y,p.angle||0,p.overheated?palette.orange:palette.cyan,'player',t,p);if(p.invuln>0){c.strokeStyle=palette.cyan;c.lineWidth=2;c.globalAlpha=.5+Math.sin(t*25)*.3;c.beginPath();c.arc(p.x,p.y,31,0,TAU);c.stroke();c.globalAlpha=1;}}
        c.globalCompositeOperation='lighter';for(const b of engine.bullets||[]){if(b.enemy)continue;const col=b.color||palette.yellow;const v=Math.hypot(b.vx||0,b.vy||0)||1;this.light(b.x,b.y,19,col,.9);this.line([[b.x-(b.vx||0)/v*34,b.y-(b.vy||0)/v*34],[b.x,b.y]],col,3,this.ultra?10:0);c.fillStyle='#fff0eb';c.beginPath();c.arc(b.x,b.y,1.5,0,TAU);c.fill();}
        c.globalCompositeOperation='source-over';
      }
      this.drawEffects();
      // Rain and reflected streaks are screen-space coherent with the rooftop.
      if(this.ultra){c.strokeStyle='#9bc4dc';c.lineWidth=.7;c.globalAlpha=.14;c.beginPath();for(const r of this.rain){c.moveTo(r.x,r.y);c.lineTo(r.x-r.len*.23,r.y+r.len);}c.stroke();c.globalAlpha=1;}
      c.save();
      c.setTransform(this.dpr,0,0,this.dpr,0,0);
      // Quarter-resolution highlight bloom. Contrast suppresses dark floor values;
      // the blurred highlights are then composited over the sharp combat image.
      if(this.ultra){const b=this.bloomCtx;b.clearRect(0,0,this.bloom.width,this.bloom.height);b.filter='blur(2px) brightness(1.7) contrast(2) saturate(1.2)';b.drawImage(this.canvas,0,0,this.bloom.width,this.bloom.height);b.filter='none';c.globalCompositeOperation='screen';c.globalAlpha=.45;c.drawImage(this.bloom,0,0,w,h);
        // Heavy impacts smear the highlights sideways for a few frames (lens shock).
        if(motion&&this.aberr>.04){const o=Math.min(9,this.aberr*8);c.globalAlpha=Math.min(.4,this.aberr*.4);c.drawImage(this.bloom,-o,0,w,h);c.drawImage(this.bloom,o,0,w,h);}
        c.globalAlpha=1;c.globalCompositeOperation='source-over';}
      if(motion&&this.speed>.05){const mx=w/2,my=h/2,R=Math.hypot(w,h)/2,spin=Math.floor(t*30)*1.7;c.globalCompositeOperation='lighter';c.strokeStyle='#cfffff';c.lineWidth=1.5;c.globalAlpha=Math.min(.45,this.speed*.45);c.beginPath();for(let i=0;i<34;i++){const a=i*2.399+spin,r1=R*(.5+((i*37)%17)/17*.25),r2=r1+R*(.1+this.speed*.2);c.moveTo(mx+Math.cos(a)*r1,my+Math.sin(a)*r1);c.lineTo(mx+Math.cos(a)*r2,my+Math.sin(a)*r2);}c.stroke();c.globalAlpha=1;c.globalCompositeOperation='source-over';}
      if(Math.abs(this.flash)>.01&&motion){c.globalAlpha=Math.min(.35,Math.abs(this.flash));c.fillStyle=this.flash>0?'#d8ffff':'#ff1449';c.fillRect(0,0,w,h);c.globalAlpha=1;}
      // Red edge pressure: a pulse on every hit, and a steady heartbeat while armor is critical.
      const critical=!attract&&p&&engine.state==='playing'&&p.hp/p.maxHp<.3,red=Math.max(critical?.3+(motion?.14*Math.sin(t*7):0):0,motion?this.hurt*.55:0);
      if(red>.02){const g=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.32,w/2,h/2,Math.max(w,h)*.72);g.addColorStop(0,'#ff144900');g.addColorStop(1,'#ff1449');c.globalAlpha=Math.min(.6,red);c.fillStyle=g;c.fillRect(0,0,w,h);c.globalAlpha=1;}
      // Fine cyan/pink lens fringe along the image boundaries.
      const v=c.createRadialGradient(w/2,h/2,h*.15,w/2,h/2,Math.max(w,h)*.65);v.addColorStop(0,'#02061200');v.addColorStop(1,'#020612aa');c.fillStyle=v;c.fillRect(0,0,w,h);
      c.restore();
      // Keep incoming attacks legible over rain, bloom and player effects at either FX setting.
      if(!attract&&engine){
        for(const enemy of engine.enemies||[])this.telegraph(enemy);
        for(const bullet of engine.bullets||[])if(bullet.enemy)this.hostileBullet(bullet);
      }
    }
    playerAura(engine,p,t){
      const c=this.ctx,combo=engine.combo||0;c.save();c.globalCompositeOperation='lighter';
      if(combo>=10){const col=combo>=50?palette.pink:combo>=25?palette.yellow:palette.cyan,r=44+Math.min(26,combo*.3);this.light(p.x,p.y+8,r*2.1,col,.2+.06*Math.sin(t*9));c.strokeStyle=col;c.lineWidth=2;c.globalAlpha=.7;c.setLineDash([14,9]);c.lineDashOffset=-t*60;c.beginPath();c.ellipse(p.x,p.y+10,r,r*.55,0,0,TAU);c.stroke();if(combo>=25){c.setLineDash([4,12]);c.lineDashOffset=t*45;c.beginPath();c.ellipse(p.x,p.y+10,r*1.25,r*.69,0,0,TAU);c.stroke();}c.setLineDash([]);c.lineDashOffset=0;c.globalAlpha=1;}
      if(engine.resonance?.armor>=1){c.strokeStyle='#79a7ff';c.lineWidth=1.5;c.globalAlpha=.35+.12*Math.sin(t*5);c.beginPath();for(let i=0;i<=6;i++){const a=t*.5+i*TAU/6,x=p.x+Math.cos(a)*130,y=p.y+Math.sin(a)*130;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();c.globalAlpha=1;this.light(p.x,p.y,150,'#79a7ff',.08);}
      if(p.energy>=(p.maxEnergy||100)){this.light(p.x,p.y,95,palette.yellow,.22+.1*Math.sin(t*6));c.fillStyle=palette.yellow;for(let i=0;i<3;i++){const a=t*3+i*TAU/3;c.fillRect(p.x+Math.cos(a)*38-2,p.y+Math.sin(a)*22+4,4,4);}}
      c.restore();
    }
    drawDecals(){const c=this.ctx;for(const d of this.decals){const q=d.life/d.total;c.globalAlpha=Math.min(1,q*1.6)*.45;c.fillStyle='#02050a';c.beginPath();c.ellipse(d.x,d.y,d.r,d.r*.62,0,0,TAU);c.fill();c.globalCompositeOperation='lighter';this.light(d.x,d.y,d.r*1.5,d.color,q*q*.32);c.globalCompositeOperation='source-over';}c.globalAlpha=1;}
    telegraph(enemy){
      const telegraph=enemy.telegraph;
      if(!telegraph)return;
      const c=this.ctx,{x,y}=enemy;
      const angle=telegraph.angle??enemy.angle;
      const imminent=telegraph.ttl<=.15;
      c.save();
      c.lineCap='round';
      c.lineJoin='round';
      c.beginPath();
      if(telegraph.type==='aim'){
        c.moveTo(x,y);
        c.lineTo(x+Math.cos(angle)*(telegraph.length||600),y+Math.sin(angle)*(telegraph.length||600));
      }else if(telegraph.type==='fan'){
        const spread=Number.isFinite(telegraph.spread)?telegraph.spread:enemy.type==='boss'&&enemy.phase===2?.36:.18;
        c.moveTo(x,y);
        c.arc(x,y,telegraph.radius||220,angle-spread,angle+spread);
        c.closePath();
      }else{
        c.arc(x,y,telegraph.radius||90,0,TAU);
      }
      if(telegraph.type!=='aim'){
        c.fillStyle='#ff426d22';
        c.fill();
      }else if(telegraph.width){
        c.strokeStyle='#ff426d36';
        c.lineWidth=telegraph.width;
        c.stroke();
      }
      c.strokeStyle=threat.edge;
      c.lineWidth=7;
      c.stroke();
      c.strokeStyle=imminent?threat.imminent:threat.warning;
      c.lineWidth=imminent?3.6:2.8;
      if(!imminent)c.setLineDash([14,9]);
      c.stroke();
      c.restore();
    }
    hostileBullet(bullet){
      const c=this.ctx,{x,y,vx,vy,r}=bullet;
      const speed=Math.hypot(vx,vy)||1;
      c.save();
      c.lineCap='round';
      const trail=[[x-vx/speed*24,y-vy/speed*24],[x,y]];
      this.line(trail,threat.edge,12);
      this.line(trail,threat.shot,5);
      c.beginPath();
      c.arc(x,y,r,0,TAU);
      c.lineWidth=4;
      c.strokeStyle=threat.edge;
      c.stroke();
      c.fillStyle=threat.shot;
      c.fill();
      c.beginPath();
      c.arc(x,y,r*.52,0,TAU);
      c.fillStyle=threat.core;
      c.fill();
      c.restore();
    }
    actor(x,y,angle,color,type,t,data={}){const c=this.ctx;if(!Number.isFinite(x)||!Number.isFinite(y))return;if(this.rasterActor(x,y,angle,color,type,t,data))return;const boss=type==='boss',r=boss?58:type==='tank'?25:type==='elite'?23:type==='drone'?10:15;
      if(type!=='ghost'){c.fillStyle='#0007';c.beginPath();c.ellipse(x+6,y+12,r*1.25,r*.65,0,0,TAU);c.fill();c.save();c.globalCompositeOperation='lighter';this.light(x,y+10,r*2,color,.14);c.restore();}
      c.save();c.translate(x,y);c.rotate(angle);if(boss){c.save();c.rotate(t*.4);for(let i=0;i<8;i++){c.rotate(TAU/8);c.fillStyle='#24303f';c.strokeStyle=color+'88';c.lineWidth=2;c.beginPath();c.moveTo(35,-12);c.lineTo(66,-19);c.lineTo(79,0);c.lineTo(66,19);c.lineTo(35,12);c.closePath();c.fill();c.stroke();c.fillStyle=color;c.fillRect(60,-7,5,14);}c.restore();c.fillStyle='#0a1221';c.strokeStyle='#718492';c.lineWidth=4;c.beginPath();c.arc(0,0,43,0,TAU);c.fill();c.stroke();c.rotate(-t);c.strokeStyle=color;c.lineWidth=3;c.setLineDash([18,10]);c.beginPath();c.arc(0,0,32,0,TAU);c.stroke();c.setLineDash([]);c.fillStyle='#ffe2ef';c.shadowColor=color;c.shadowBlur=25;c.beginPath();c.arc(0,0,15+Math.sin(t*6)*3,0,TAU);c.fill();c.shadowBlur=0;
      }else if(type==='player'||type==='ghost'){
        // A complete silhouette: armored shoulders, animated feet, split coat, weapon and visor.
        const step=Math.sin(t*16)*3;c.fillStyle='#07101a';c.beginPath();c.moveTo(-8,-12);c.lineTo(-31,-17+step);c.lineTo(-23,-2);c.lineTo(-34,12-step);c.lineTo(-8,11);c.closePath();c.fill();c.strokeStyle=color+'77';c.lineWidth=1;c.stroke();c.fillStyle='#263a4a';c.fillRect(-12,-13+step,12,7);c.fillRect(-12,7-step,12,7);c.fillStyle='#9fb7c3';c.fillRect(-6,-17,15,8);c.fillRect(-6,10,15,8);c.fillStyle='#1f3546';c.strokeStyle='#9cd1da';c.lineWidth=1.3;c.beginPath();c.moveTo(-12,-8);c.lineTo(6,-10);c.lineTo(14,0);c.lineTo(6,10);c.lineTo(-12,8);c.closePath();c.fill();c.stroke();c.fillStyle='#d1eff3';c.fillRect(6,6,23,5);c.fillStyle='#354f62';c.fillRect(19,5,14,7);c.fillStyle=color;c.shadowColor=color;c.shadowBlur=this.ultra?12:0;c.fillRect(31,6,3,4);c.fillRect(4,-6,8,3);c.fillRect(-10,-6,3,12);c.shadowBlur=0;c.fillStyle='#e9f8fc';c.fillRect(0,-2,7,3);
      }else if(type==='drone'){c.rotate(t);c.strokeStyle=color;c.lineWidth=1.5;c.fillStyle='#213243';c.beginPath();c.moveTo(14,0);c.lineTo(0,9);c.lineTo(-14,0);c.lineTo(0,-9);c.closePath();c.fill();c.stroke();c.fillStyle='#fff';c.fillRect(-3,-3,6,6);for(let i of [-1,1]){c.strokeStyle=color+'88';c.beginPath();c.arc(0,15*i,7,0,TAU);c.stroke();}}
      else {c.fillStyle='#222d3d';c.strokeStyle=type==='rush'?'#53809b':'#697b8c';c.lineWidth=2;const legs=type==='tank'?4:3;for(let i=0;i<legs;i++){const ly=(i-(legs-1)/2)*12;c.fillStyle='#0b1420';c.fillRect(-r+3,ly-4,r*1.4,7);c.fillStyle='#4b5e71';c.fillRect(-r+Math.sin(t*12+i)*3,ly-4,7,7);}c.fillStyle='#233245';c.beginPath();c.moveTo(-r*.8,-r*.65);c.lineTo(r*.45,-r*.8);c.lineTo(r,0);c.lineTo(r*.45,r*.8);c.lineTo(-r*.8,r*.65);c.closePath();c.fill();c.stroke();c.fillStyle=color;c.shadowColor=color;c.shadowBlur=this.ultra?10:0;c.fillRect(r*.2,-r*.4,4,r*.8);c.shadowBlur=0;if(type==='shooter'){c.fillStyle='#69798d';c.fillRect(5,-4,26,8);c.fillStyle=color;c.fillRect(28,-3,4,6);}if(type==='tank'){c.fillStyle='#3e4c5e';c.fillRect(-15,-28,32,10);c.fillRect(-15,18,32,10);}if(data.infected||data.virus>0){c.strokeStyle=palette.green;c.lineWidth=2;c.beginPath();c.arc(0,0,r+6,0,TAU);c.stroke();}}
      c.restore();if(data.hp<data.maxHp&&type!=='player'&&type!=='ghost'&&!boss){c.fillStyle='#000a';c.fillRect(x-r,y-r-14,r*2,3);c.fillStyle=color;c.fillRect(x-r,y-r-14,r*2*Math.max(0,data.hp/data.maxHp),3);}
    }
    attractScene(t){const c=this.ctx;const x=1100,y=450;
      c.save();c.globalCompositeOperation='lighter';this.light(x,y,310,palette.cyan,.23);this.light(x+100,y+100,250,palette.pink,.12);for(let i=0;i<4;i++){c.strokeStyle=i%2?'#5af6f344':'#eaff6322';c.lineWidth=i===0?3:1;c.setLineDash([20,30,5,12]);c.beginPath();c.arc(x,y,100+i*48,t*(i%2?.1:-.1),TAU+t*(i%2?.1:-.1));c.stroke();}c.setLineDash([]);c.restore();
      const actualAppearance=this.appearance;this.appearance=NeonAppearance.resolve(this.previewLoadout,[]);this.actor(x,y,Math.sin(t*.4)*.5,palette.cyan,'player',t);this.appearance=actualAppearance;for(let i=0;i<4;i++){const a=t*.3+i*TAU/4;this.actor(x+Math.cos(a)*95,y+Math.sin(a)*75,a,palette.yellow,'drone',t);}for(let i=0;i<7;i++){const a=i*TAU/7;this.actor(x+Math.cos(a)*(260+i%2*40),y+Math.sin(a)*230,a+Math.PI,palette.pink,i%3===0?'tank':'shooter',t);}
      c.save();c.globalAlpha=.5;c.font='9px monospace';c.fillStyle=palette.cyan;c.fillText('NEURAL LINK // 99.8%',x+50,y-50);c.fillStyle=palette.yellow;c.fillText('UNREGISTERED BODY DETECTED',x-110,y+140);c.restore();
    }
    drawEffects(){const c=this.ctx,ultra=this.ultra;c.globalCompositeOperation='lighter';
      for(const p of this.pillars){const q=p.life/p.total,w=p.width*(.35+.65*q);c.save();c.translate(p.x,p.y);const g=c.createLinearGradient(0,-p.height,0,0);g.addColorStop(0,p.color+'00');g.addColorStop(.55,p.color+'55');g.addColorStop(1,p.color+'ee');c.globalAlpha=q;c.fillStyle=g;c.fillRect(-w,-p.height,w*2,p.height);c.globalAlpha=q*.8;c.fillStyle='#ffffff';c.fillRect(-w*.2,-p.height*.8,w*.4,p.height*.8);c.restore();this.light(p.x,p.y,w*3.2,p.color,q*.9);}
      for(const r of this.raybursts){const q=r.life/r.total,grow=1-Math.pow(q,3);c.save();c.translate(r.x,r.y);c.rotate(r.rot+(1-q)*.35);const fade=c.createRadialGradient(0,0,0,0,0,Math.max(1,r.len*grow));fade.addColorStop(0,r.color);fade.addColorStop(.35,r.color+'aa');fade.addColorStop(1,r.color+'00');c.fillStyle=fade;for(let i=0;i<r.count;i++){const a=i*TAU/r.count,len=r.len*grow*(i%2?.62:1),half=(i%3?.016:.03);c.globalAlpha=q*(i%2?.4:.7);c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a-half)*len,Math.sin(a-half)*len);c.lineTo(Math.cos(a+half)*len,Math.sin(a+half)*len);c.closePath();c.fill();}c.restore();}
      for(const r of this.rings){const q=1-r.life/r.total,rr=r.r+(r.max-r.r)*(1-Math.pow(1-q,2));if(rr<=0)continue;c.globalAlpha=(1-q)*.8;c.strokeStyle=r.color;c.lineWidth=2+(r.width??8)*(1-q);c.beginPath();if(r.sides){for(let i=0;i<=r.sides;i++){const a=r.rot+i*TAU/r.sides;i?c.lineTo(r.x+Math.cos(a)*rr,r.y+Math.sin(a)*rr):c.moveTo(r.x+Math.cos(a)*rr,r.y+Math.sin(a)*rr);}}else c.arc(r.x,r.y,rr,0,TAU);c.stroke();if(r.fill){c.globalAlpha=(1-q)*(1-q)*.16;c.fillStyle=r.color;c.fill();}if(ultra){c.globalAlpha=(1-q)*.8;c.lineWidth=1;c.beginPath();c.arc(r.x,r.y,rr*.88,0,TAU);c.stroke();}c.globalAlpha=1;}
      for(const f of this.flares){const q=f.life/f.total;this.light(f.x,f.y,f.r*(1.25-.25*q),f.color,q);}
      for(const s of this.slashes){const q=s.life/s.total,R=s.r*(1-q*.3);c.save();c.translate(s.x,s.y);c.rotate(s.angle);c.globalAlpha=q;c.fillStyle=s.color;c.shadowColor=s.color;c.shadowBlur=ultra?22:0;c.beginPath();c.arc(0,0,R,-1.05,1.05);c.arc(-R*.22,0,R*1.02,.82,-.82,true);c.closePath();c.fill();c.shadowBlur=0;c.strokeStyle='#fff1d2';c.lineWidth=2.5*q+.5;c.beginPath();c.arc(0,0,R+3,-1,1.05);c.stroke();c.globalAlpha=q*.5;c.strokeStyle=s.color;c.lineWidth=3;c.beginPath();c.moveTo(R*.5,0);c.lineTo(R*(1.1+(1-q)*.5),0);c.stroke();c.restore();}
      for(const b of this.bolts){const w=b.width||5;c.globalAlpha=Math.min(1,b.life*8);this.line(b.points,b.color,w,ultra&&w>=4?20:0);this.line(b.points,'#ecffff',Math.max(1,w*.3));c.globalAlpha=1;}
      c.font='bold 11px monospace';c.textAlign='center';
      for(const p of this.particles){const a=p.life/p.max;c.globalAlpha=a;c.strokeStyle=p.color;c.fillStyle=p.color;
        if(p.kind==='spark'){c.lineWidth=p.size*.6;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.025,p.y-p.vy*.025);c.stroke();}
        else if(p.kind==='shard'){const cs=Math.cos(p.rot),sn=Math.sin(p.rot),s=p.size*(.4+.6*a);c.beginPath();c.moveTo(p.x+cs*s,p.y+sn*s);c.lineTo(p.x-sn*s*.55-cs*s*.5,p.y+cs*s*.55-sn*s*.5);c.lineTo(p.x+sn*s*.55-cs*s*.5,p.y-cs*s*.55-sn*s*.5);c.closePath();c.fill();continue;}
        else if(p.kind==='glyph'){c.fillText(p.ch,p.x,p.y);continue;}
        else if(p.kind==='ember'){c.fillRect(p.x,p.y,p.size,p.size);if(ultra)this.light(p.x,p.y,7,p.color,a*.5);continue;}
        else c.fillRect(p.x,p.y,p.size*a+1,p.size*a+1);
        if(ultra&&p.size>2.6)this.light(p.x,p.y,12,p.color,a*.45);}
      c.globalAlpha=1;c.globalCompositeOperation='source-over';c.lineJoin='round';
      for(const a of this.texts){const q=a.total?a.life/a.total:0,pop=1+Math.max(0,q-.8)*3;c.globalAlpha=Math.min(1,a.life*4);c.font=`bold ${Math.round(a.size*pop)}px ${a.font||'monospace'}`;c.lineWidth=Math.max(2,a.size*.16);c.strokeStyle='#04070dcc';c.strokeText(a.text,a.x,a.y);c.fillStyle=a.color;c.fillText(a.text,a.x,a.y);}
      c.globalAlpha=1;c.textAlign='left';c.lineJoin='miter';if(this.texts.length>120)this.texts.splice(0,this.texts.length-120);
    }
    drawChest(chest,t){
      const c=this.ctx,col={rare:palette.cyan,epic:'#c37aff',legendary:palette.yellow}[chest.rarity]||palette.cyan,tier={rare:1,epic:2,legendary:3}[chest.rarity]||1;
      c.save();c.translate(chest.x,chest.y);
      // Rarity reads from across the arena: wider beam, turning light spokes, rising motes.
      c.globalCompositeOperation='lighter';const bw=14+tier*7+Math.sin(t*4+chest.id)*3,beam=c.createLinearGradient(0,-170-tier*40,0,0);beam.addColorStop(0,col+'00');beam.addColorStop(1,col+(tier>1?'88':'55'));c.fillStyle=beam;c.fillRect(-bw,-170-tier*40,bw*2,170+tier*40);
      if(tier>1){c.fillStyle=col;const spokes=tier*4;for(let i=0;i<spokes;i++){const a=t*(.5+tier*.15)+i*TAU/spokes,len=70+tier*26+Math.sin(t*3+i)*10;c.globalAlpha=.1+tier*.03;c.beginPath();c.moveTo(0,4);c.lineTo(Math.cos(a-.07)*len,4+Math.sin(a-.07)*len*.5);c.lineTo(Math.cos(a+.07)*len,4+Math.sin(a+.07)*len*.5);c.closePath();c.fill();}c.globalAlpha=1;}
      this.light(0,0,60+tier*22,col,.3+.1*Math.sin(t*5));
      for(let i=0;i<2+tier*2;i++){const q=(t*.45+i*.37+chest.id*.11)%1;c.globalAlpha=(1-q)*.9;c.fillStyle=col;c.fillRect(Math.sin(i*4.1+chest.id)*(16+tier*6)-1,-q*(120+tier*30),2,2+tier);}
      c.globalAlpha=1;c.globalCompositeOperation='source-over';
      c.strokeStyle=col;c.lineWidth=2;c.setLineDash([8,6]);c.beginPath();c.ellipse(0,13,48+Math.sin(t*3)*4,21,0,0,TAU);c.stroke();c.setLineDash([]);c.translate(0,Math.sin(t*3+chest.id)*3);
      c.fillStyle='#050b15';c.strokeStyle=col;c.lineWidth=2;c.shadowColor=col;c.shadowBlur=this.ultra?13:0;c.beginPath();c.moveTo(-32,-18);c.lineTo(-20,-30);c.lineTo(25,-30);c.lineTo(36,-17);c.lineTo(36,15);c.lineTo(25,26);c.lineTo(-24,26);c.lineTo(-32,17);c.closePath();c.fill();c.stroke();c.shadowBlur=0;
      c.fillStyle='#263445';c.fillRect(-27,-14,58,23);c.strokeStyle='#d5e9ef77';c.strokeRect(-21,-26,43,9);c.fillStyle=col;c.fillRect(-29,-3,58,3);c.fillRect(-23,13,5,8);c.fillRect(22,13,5,8);c.fillStyle='#08111b';c.fillRect(-9,-12,18,22);c.strokeStyle=col;c.strokeRect(-9,-12,18,22);c.fillStyle=col;c.font='bold 16px monospace';c.textAlign='center';c.fillText('N',0,5);c.font='bold 11px monospace';c.fillText('DATA VAULT',0,-43);c.font='9px monospace';c.fillText('接触 / DASHで回収',0,44);c.restore();
    }
    clear(){this.particles=[];this.rings=[];this.bolts=[];this.texts=[];this.trails=[];this.slashes=[];this.flares=[];this.pillars=[];this.raybursts=[];this.decals=[];this.timers=[];this.shake=0;this.flash=0;this.zoom=0;this.aberr=0;this.speed=0;this.dim=0;this.hurt=0;}
  }
  globalThis.NeonRenderer=NeonRenderer;
})();
