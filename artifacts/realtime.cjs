// Real-time run in an isolated headless Chrome (temporary profile, never the user's own).
// usage: node realtime.cjs <projectDir> <seconds> <fx: ultra|lite> <screenshotPath>
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const os = require('os');
const project = path.resolve(process.argv[2]); const seconds = Number(process.argv[3] || 60); const fxMode = process.argv[4] || 'ultra'; const shot = process.argv[5];
const PORT = 47911, DEBUG = 9347;
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-headless-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const server = spawn(process.execPath, ['server.cjs'], { cwd: project, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--window-size=1600,900', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  const cleanup = () => { try { chrome.kill(); } catch {} try { server.kill(); } catch {} setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 500); };
  try {
    let target;
    for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { const list = await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json(); target = list.find(t => t.type === 'page'); } catch {} }
    if (!target) throw new Error('chrome did not start');
    const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    const evaluate = async (expression) => { const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (m.result && m.result.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400)); return m.result.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    // Never write the real save, and record anything the engine's event try/catch would swallow.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `Storage.prototype.setItem=function(){};window.__swallowed=[];window.__errors=[];window.addEventListener('error',e=>__errors.push(e.message));let E;Object.defineProperty(window,'NeonEngine',{configurable:true,get:()=>E,set:C=>{E=class extends C{constructor(o={}){const f=o.onEvent;super({...o,onEvent:f&&(e=>{try{f(e);}catch(err){window.__swallowed.push(e.type+': '+err.message);throw err;}})});}};}});` });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?perf` });
    await sleep(2500);
    const env = await evaluate(`(async()=>{let n=0;const t0=performance.now();await new Promise(r=>{const f=()=>{n++;performance.now()-t0>1000?r():requestAnimationFrame(f)};requestAnimationFrame(f)});const c=document.createElement('canvas').getContext('webgl');const ext=c&&c.getExtension('WEBGL_debug_renderer_info');return JSON.stringify({idleFps:n,size:innerWidth+'x'+innerHeight,dpr:devicePixelRatio,gpu:ext?c.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'});})()`);
    await evaluate(`(()=>{if('${fxMode}'==='lite'&&document.getElementById('effectsButton').textContent.includes('ULTRA'))document.getElementById('effectsButton').click();document.getElementById('soundButton').click();
      const key=(code,type='keydown')=>window.dispatchEvent(new KeyboardEvent(type,{code}));
      const sectors=['foundry','arc_grid','hangar','quarantine','bunker','speedway','kill_zone'];
      window.__log={ults:0,routes:[],samples:[],states:{}};let i=0,n=0;
      document.getElementById('startButton').click();
      window.__pilot=setInterval(()=>{i++;const s=neonGame.getSnapshot();window.__log.states[s.state]=(window.__log.states[s.state]||0)+1;
        if(i%90===0){key(['KeyW','KeyD','KeyS','KeyA'][(i/90)%4|0],'keyup');key(['KeyD','KeyS','KeyA','KeyW'][(i/90)%4|0]);}
        if(i%45===0)key('Space');if(i%45===2)key('Space','keyup');
        if(i%200===0){key('KeyE');if(s.energy>=100)window.__log.ults++;key('KeyQ');}if(i%200===2){key('KeyE','keyup');key('KeyQ','keyup');}
        if(i%600===0){const p=neonGame.getPerf();if(p)window.__log.samples.push({t:Math.round(s.elapsed),floor:s.floor,...p});}
        if(s.hold>0||i%12)return;
        if(s.state==='chest'){const d='Digit'+(1+(n++%3));key(d);key(d,'keyup');key('Enter');key('Enter','keyup');}
        else if(s.state==='upgrade'){const d='Digit'+(1+(n++%3));key(d);key(d,'keyup');}
        else if(s.state==='route'){let k=s.routeOptions.findIndex(o=>sectors.includes(o));if(k<0)k=0;window.__log.routes.push(s.routeOptions[k]);const d='Digit'+(k+1);key(d);key(d,'keyup');}
        else if(s.state==='dead'||s.state==='won'){clearInterval(window.__pilot);window.__done=s.state;}
      },16);return 'started';})()`);
    const started = Date.now(); let shotDone = false; let lastFloor = 0, floorAt = 0, floorShot = true; const sectorDir = process.argv[6];
    while (Date.now() - started < seconds * 1000) {
      await sleep(sectorDir ? 1000 : 2000);
      const done = await evaluate('window.__done||""');
      // Optional: one screenshot a few seconds into every floor, named after its sector.
      if (sectorDir) { const st = JSON.parse(await evaluate('JSON.stringify((()=>{const s=neonGame.getSnapshot();return {floor:s.floor,sector:s.sector,state:s.state,enemies:s.enemies};})())')); if (st.floor !== lastFloor) { lastFloor = st.floor; floorAt = Date.now(); floorShot = false; } if (!floorShot && st.state === 'playing' && Date.now() - floorAt > 5000 && st.enemies >= 5) { const m = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); if (m.result && m.result.data) fs.writeFileSync(path.join(sectorDir, 'floor' + st.floor + '-' + (st.sector || 'none') + '.jpg'), Buffer.from(m.result.data, 'base64')); floorShot = true; } }
      if (!shotDone && shot && Date.now() - started > 25000) { const m = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); if (m.result && m.result.data) { fs.writeFileSync(shot, Buffer.from(m.result.data, 'base64')); shotDone = true; } }
      if (done) break;
    }
    const out = await evaluate(`JSON.stringify({done:window.__done||'running',snap:(()=>{const s=neonGame.getSnapshot();return {state:s.state,floor:s.floor,elapsed:Math.round(s.elapsed),kills:s.kills,hp:Math.round(s.hp),threat:s.threat,resonance:s.resonance,fps:s.fps,paused:s.paused};})(),perf:neonGame.getPerf(),log:window.__log,swallowed:window.__swallowed,errors:window.__errors,sound:document.getElementById('soundButton').textContent,perfText:(document.querySelector('#stage>div[style*=monospace]')||{}).textContent})`);
    console.log(JSON.stringify({ fx: fxMode, wallSeconds: Math.round((Date.now() - started) / 1000), env: JSON.parse(env), result: JSON.parse(out), screenshot: shotDone ? shot : null }, null, 1));
  } catch (err) { console.log('FAILED: ' + err.message); }
  cleanup(); await sleep(900); process.exit(0);
})();
