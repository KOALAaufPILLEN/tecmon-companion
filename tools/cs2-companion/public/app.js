if(new URLSearchParams(location.search).get('desktop')==='1'){
  document.body.classList.add('desktop-panel');
  document.getElementById('minimal-title').textContent='Dein Desktop-Companion';
  document.querySelector('.minimal-hero p').textContent='Hier findest du deine Verbindung und Einstellungen. Ein Klick auf mich klappt das Fenster wieder ein.';
}
const token = document.querySelector('meta[name="tecmon-token"]').content;
const $ = id => document.getElementById(id);
const drafts = new Map();
let signature = '';
let bridgeSignature = '';
let downloadSignature = '';
let populated = false;
let restarting = false;
let latestState;
function advanced(show) {
  $('advanced-panel').hidden=!show;
  $('advanced-toggle').setAttribute('aria-expanded',String(show));
  $('advanced-toggle').textContent=show?'Erweitert schließen':'Erweitert';
}
function tab(name) {
  for(const button of document.querySelectorAll('.tab')) button.setAttribute('aria-selected',String(button.dataset.tab===name));
  for(const panel of document.querySelectorAll('.tab-panel')) panel.hidden=panel.dataset.panel!==name;
}
for(const button of document.querySelectorAll('.tab')) button.addEventListener('click',()=>tab(button.dataset.tab));
function showAdvanced(name){advanced(true);tab(name);$('advanced-panel').scrollIntoView({behavior:'smooth'});}
$('advanced-toggle').addEventListener('click',()=>advanced($('advanced-panel').hidden));
function overview(state) {
  const devices=state.bridge?.devices || [];
  const pending=state.bridge?.pending || [];
  $('connection-heading').textContent=pending.length?'Verbindung bestätigen':devices.length?'Browser-Verbindung eingerichtet':'Noch nicht verbunden';
  $('connection-note').textContent=pending.length?'Vergleiche den Code auf der Webseite und bestätige die Anfrage hier.':devices.length?'Download und Aufnahme startest du auf der Webseite. Du kannst dieses Fenster minimieren; der Companion muss weiterlaufen.':'Öffne TecMon und wähle „Companion verbinden“. Bestätige den angezeigten Code einmal hier.';
  document.querySelector('.connection-summary').classList.toggle('is-connected',devices.length>0);
  const jobs=state.jobs || [];
  const downloads=state.downloads || [];
  const running=jobs.find(j=>['preparing','downloading','analyzing','recording','branding'].includes(j.status));
  const loading=downloads.find(d=>['queued','downloading'].includes(d.status));
  const latest=jobs.at(-1);
  const lastDownload=downloads.at(-1);
  $('activity-progress').hidden=!state.active;
  $('activity-count').textContent=`${jobs.filter(j=>j.status==='done' && j.files.length).length} Videos · ${downloads.filter(d=>d.status==='done').length} Demos`;
  $('activity-heading').textContent=state.active?(statuses[running?.status] || (loading?'DEMO WIRD GELADEN':'Auftrag läuft …')):latest?.status==='error'||lastDownload?.status==='error'?'Auftrag fehlgeschlagen':latest?.status==='done'?'Auftrag fertig':latest?.status==='ready'?'Manueller Auftrag importiert':'Bereit für den nächsten Auftrag';
  $('activity-note').textContent=state.active?(running?.job.title || 'Der Companion arbeitet lokal. Den Fortschritt siehst du auch auf der Webseite.'):latest?.status==='error'||lastDownload?.status==='error'?'Die Details findest du unter „Erweitert“ im Aufnahme- oder Download-Protokoll.':latest?.status==='done'?'Das Ergebnis steht bereit. Auf der Webseite gestartete Videos werden dort automatisch übernommen; lokale Aufträge findest du unter „Erweitert“.':latest?.status==='ready'?'Öffne „Erweitert“, um die Originaldemo zu wählen und den importierten Auftrag zu starten.':'Datenbank und Aufnahme-Tools starten erst bei Bedarf. Wähle deine Highlights auf TecMon.';
}
function databaseState(pg) {
  $('database-install').disabled = pg.supported;
  $('database-status').textContent = pg.installed ? `PostgreSQL-Tools ${pg.version} erkannt${pg.supported ? '' : ' · Version zu alt'}` : 'PostgreSQL nicht automatisch gefunden';
  $('database-note').textContent = pg.supported
    ? pg.ready ? `PostgreSQL antwortet unter 127.0.0.1:${pg.port}. Jetzt die Datenbank-Verbindung in CS Demo Manager prüfen.` : `Installation vorhanden. Unter 127.0.0.1:${pg.port} antwortet noch kein bereiter PostgreSQL-Server. Dienst starten bzw. Port korrigieren; keine Neuinstallation nötig.`
    : 'Für CS Demo Manager wird PostgreSQL ab Version 17 benötigt. Mit dem Installationsknopf wird PostgreSQL 18 über WinGet eingerichtet. Vorhandene Datenbanken werden nicht gelöscht.';
}
async function api(url, body) {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-tecmon-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
function notice(error) { $('notice').textContent = error.message || String(error); }
function el(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
const statuses = { preparing:'VISUALS WERDEN GEPRÜFT', branding:'VIDEO-BRANDING LÄUFT', ready: 'BEREIT', analyzing: 'DEMO WIRD GEPRÜFT', recording: 'AUFNAHME LÄUFT', done: 'FERTIG', error: 'FEHLER', downloading:'DEMO WIRD GELADEN' };
const tipLabels={economy:'Wirtschaft',buy:'Kauf-Check',death:'Nach dem Tod',habit:'Gewohnheit',mindset:'Kopf',summary:'Zusammenfassung',weapon:'Waffe',map:'Map',warmup:'Aufwärmen',praise:'Stark',history:'Deine Matches',team:'Team'};
let tipsSignature='';let featuresSignature='';
function gameTips(gsi){
  if(!gsi)return;
  $('tips-heading').textContent=!gsi.enabled?'Rundentipps sind aus':gsi.connected?`Live: ${gsi.map||'Hauptmenü'}${gsi.side?` · ${gsi.side}`:''}`:'Eingeschaltet · wartet auf CS2';
  const toggle=$('tips-toggle');toggle.textContent=gsi.enabled?'Ausschalten':'Einschalten';toggle.className=gsi.enabled?'subtle':'';toggle.disabled=!gsi.enabled&&!gsi.available;
  if(gsi.error)$('tips-note').textContent=`Konfiguration konnte nicht geschrieben werden: ${gsi.error}`;
  else if(!gsi.available&&!gsi.enabled)$('tips-note').textContent='CS2 wurde auf diesem PC nicht gefunden.';
  const featureNext=JSON.stringify(gsi.features||[]);
  if(featureNext!==featuresSignature){
    featuresSignature=featureNext;
    const boxes=(gsi.features||[]).map(f=>{const label=el('label');const box=document.createElement('input');box.type='checkbox';box.checked=f.enabled;box.addEventListener('change',async()=>{box.disabled=true;try{await api('/api/gsi/features',{features:{[f.id]:box.checked}});await refresh();}catch(error){notice(error);box.checked=!box.checked;}finally{box.disabled=false;}});label.append(box,document.createTextNode(f.label));return label;});
    $('tips-features').replaceChildren(...boxes);
  }
  const account=(gsi.insights||[])[0];
  $('tips-insights').textContent=account?`Match-Auswertung von TecMon: ${account.matches} Matches auf ${account.maps} Maps, übertragen am ${new Date(account.updatedAt).toLocaleString('de-DE')}. Öffne „Meine Stats“ auf TecMon, um sie zu aktualisieren.`:'Noch keine Match-Auswertung von TecMon. Öffne bei verbundenem Companion „Meine Stats“ auf TecMon, dann kommen Tipps aus deinen bisherigen Matches dazu.';
  $('tips-insights-clear').hidden=!account;
  const next=JSON.stringify((gsi.history||[]).map(t=>t.id));
  if(next===tipsSignature)return;tipsSignature=next;
  const items=(gsi.history||[]).slice(0,5).map(t=>{const li=el('li','','tip-item');li.append(el('small',tipLabels[t.category]||'Tipp'),document.createTextNode(t.text));return li;});
  $('tips-list').replaceChildren(...items);
}
$('tips-insights-clear').addEventListener('click',async()=>{const button=$('tips-insights-clear');button.disabled=true;try{await api('/api/gsi/insights/clear',{});await refresh();}catch(error){notice(error);}finally{button.disabled=false;}});
$('tips-toggle').addEventListener('click',async()=>{const button=$('tips-toggle');button.disabled=true;try{const on=latestState?.gsi?.enabled;const result=await api(on?'/api/gsi/disable':'/api/gsi/enable',on?{}:{confirm:true});notice({message:result.message});await refresh();}catch(error){notice(error);}finally{button.disabled=false;}});
async function refresh() {
  if(restarting)return;
  const state = await api('/api/state');
  latestState=state;
  overview(state);
  const bridgeNext=JSON.stringify(state.bridge);
  if(bridgeSignature !== bridgeNext) {
    bridgeSignature=bridgeNext;
    const container=$('bridge-connections');container.replaceChildren();
    for(const item of state.bridge?.pending || []) {
      const card=el('article','','job');card.append(el('b',item.origin),el('h3',`Verbindungscode: ${item.code}`));
      const approve=el('button','Diese Webseite verbinden');
      approve.addEventListener('click',async()=>{approve.disabled=true;try{await api('/api/bridge/approve',{id:item.id});await refresh();}catch(error){notice(error);approve.disabled=false;}});
      card.append(approve);container.append(card);
    }
    const connections=el('details','','bridge-devices');connections.append(el('summary',`Verbindungen verwalten (${state.bridge?.devices?.length || 0})`));
    for(const item of state.bridge?.devices || []) {
      const card=el('article','','job');card.append(el('b',item.origin));const revoke=el('button','Verbindung widerrufen');revoke.className='subtle';
      revoke.addEventListener('click',async()=>{try{await api('/api/bridge/revoke',{id:item.id});await refresh();}catch(error){notice(error);}});card.append(revoke);connections.append(card);
    }
    if(state.bridge?.devices?.length) container.append(connections);
  }
  gameTips(state.gsi);
  databaseState(state.postgres);
  $('auto-update-row').hidden=!state.updates?.available; $('auto-update').checked=!!state.updates?.auto; $('auto-update-note').textContent=state.updates?.auto?'Neue Versionen werden nach der Prüfung von Größe und Prüfsumme selbst installiert, nie während eines Downloads oder einer Aufnahme. Danach startet der Companion neu.':'Aus: Neue Versionen erscheinen als Hinweis und werden erst nach deinem Klick installiert.';
 $('own-engine-card').hidden=!state.engine?.available; $('own-engine').checked=!!state.engine?.internal; $('own-engine-note').textContent=state.engine?.internal?'Aktiv: Download und Aufnahme laufen ohne CS Demo Manager. Ältere Aufträge ohne Spieler-Slots nutzen automatisch weiter CS Demo Manager.':'Aus: Download und Aufnahme laufen wie bisher über CS Demo Manager und die lokale Datenbank.';
  $('csdm-open').hidden = !state.managed;
  $('database-port').disabled = state.managed;
  if(state.managed && state.postgres.lazy) { $('database-status').textContent='PostgreSQL startet erst bei Bedarf';$('database-note').textContent='Die lokale Datenbank wird beim ersten Demo-Download, bei einer Aufnahme oder beim Öffnen von CS Demo Manager gestartet.'; }
  if (state.managed && state.postgres.ready) $('database-note').textContent = `TecMon-Datenbank automatisch eingerichtet und unter 127.0.0.1:${state.postgres.port} erreichbar. Alle Tool-Pfade sind hinterlegt.`;
  $('cs2-status').textContent = state.detected.cs2 ? 'CS2 erkannt' : 'CS2 nicht gefunden';
  $('engine-status').textContent = state.detected.csdm ? 'CS Demo Manager erkannt' : 'CS Demo Manager fehlt';
  if (!populated) { $('engine').value = state.detected.csdm; $('database-port').value = state.postgres.port; populated = true; }
  const completed = (state.downloads || []).filter(d => d.status === 'done');
  $('download-start').disabled = state.active;
  const downloadNext = JSON.stringify(state.downloads || []);
  if(downloadSignature !== downloadNext) {
    downloadSignature = downloadNext;
    const container = $('downloads'); container.replaceChildren();
    for(const item of state.downloads || []) {
      const card = el('article', '', 'job');
      const labels = {queued:'WARTET',downloading:'LÄDT HERUNTER',done:'DEMO BEREIT',error:'FEHLER'};
      card.append(el('b', item.code), el('p', labels[item.status]));
      if(item.demo) { const location = el('input'); location.value=item.demo; location.readOnly=true; location.setAttribute('aria-label','Heruntergeladene Demo'); card.append(location); }
      if(item.log) { const details=el('details'); details.append(el('summary','Download-Protokoll'),el('pre',item.log)); card.append(details); }
      container.append(card);
    }
  }
  const next = JSON.stringify([state.active,state.jobs.map(j => [j.id, j.status, j.log, j.files]),completed.map(d=>[d.id,d.demo])]);
  if (signature === next) return; signature = next; loadVideos().catch(()=>{});
  if (!state.jobs.length) return;
  const container = $('jobs'); container.replaceChildren();
  for (const job of state.jobs) {
    const card = el('article', '', 'job'); const head = el('div', '', 'jobhead');
    head.append(el('h3', job.job.title), el('span', statuses[job.status], 'badge')); card.append(head);
    if(job.job.branding?.enabled) card.append(el('p','TecMon-Branding aktiv · geprüfte Visuals · lokale Verarbeitung'));
    card.append(el('p', `${job.job.map} · ${job.job.sequences.length} Szenen · ${Math.round(job.job.sequences.reduce((n,s) => n+s.endTick-s.startTick,0)/job.job.tickRate)} Sekunden`));
    card.append(el('div', [...new Set(job.job.sequences.map(s => s.playerName))].join(' / '), 'sequence'));
    if (job.status === 'ready') {
      const draft = drafts.get(job.id) || { demo: '', confirm: false }; drafts.set(job.id, draft);
      const matching = completed.find(d=>d.code === job.job.shareCode);
      if(!draft.demo && matching) draft.demo=matching.demo;
      const label = el('label', 'Originaldemo · vollständiger Dateipfad (.dem)');
      const input = el('input'); input.placeholder = 'C:\\…\\match.dem'; input.value = draft.demo; input.spellcheck = false; input.addEventListener('input', () => { draft.demo = input.value; }); label.append(input); card.append(label);
      const browse = el('button', 'Demo wählen …'); browse.className='subtle'; browse.addEventListener('click', async () => { try { const selected=await api('/api/pick',{kind:'demo'}); if(selected.path) { draft.demo=selected.path; input.value=selected.path; } } catch(error) { notice(error); } }); card.append(browse);
      if(job.job.shareCode) {
        const load=el('button','Sharecode für Demo-Download übernehmen'); load.className='subtle';
        load.addEventListener('click',()=>{ $('share-codes').value=job.job.shareCode; showAdvanced('demos'); $('notice').textContent='Sharecode übernommen. Steam anmelden, CS2 schließen und den lokalen Download unten bestätigen.'; }); card.append(load);
      }
      if(completed.length) {
        const selection=el('select'); selection.setAttribute('aria-label','Heruntergeladene Demo für diesen Auftrag wählen');
        const empty=el('option','Heruntergeladene Demo auswählen …'); empty.value=''; selection.append(empty);
        for(const demo of completed) { const option=el('option',demo.code); option.value=demo.id; selection.append(option); }
        selection.addEventListener('change',()=>{const demo=completed.find(d=>d.id===selection.value);if(demo){draft.demo=demo.demo;input.value=demo.demo;}}); card.append(selection);
      }
      const confirmLabel = el('label', '', 'confirm'); const confirm = el('input'); confirm.type = 'checkbox'; confirm.checked = draft.confirm; confirm.addEventListener('change', () => { draft.confirm = confirm.checked; });
      confirmLabel.append(confirm, el('span', 'Die Demo gehört zu diesen Szenen. CS2 ist geschlossen. HLAE ist für Demos eingerichtet, ein separater Config-Ordner ist gesetzt. Aufnahme jetzt starten.')); card.append(confirmLabel);
      const start = el('button', '● Lokal in CS2 aufnehmen'); start.disabled = state.active;
      start.addEventListener('click', async () => {
        start.disabled = true;
        try { await api('/api/start', { id: job.id, demo: draft.demo.trim().replace(/^"|"$/g, ''), csdm: $('engine').value.trim().replace(/^"|"$/g, ''), confirm: draft.confirm, quality: $('quality').value }); $('notice').textContent = ''; await refresh(); } catch (err) { notice(err); start.disabled = false; }
      }); card.append(start);
    }
    if (job.status === 'done') {
      const actions = el('div', '', 'actions');
      job.files.forEach((file, i) => {
        const download = el('button', `↓ MP4 speichern${job.files.length > 1 ? ` ${i+1}` : ''}`);
        download.addEventListener('click', async () => {
          download.disabled = true;
          try {
            const response = await fetch(`/api/video?job=${job.id}&file=${i}`, { headers: { 'x-tecmon-token': token } });
            if (!response.ok) throw new Error('Video konnte nicht geladen werden.');
            const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = el('a'); a.href = url; a.download = `tecmon-${job.id.slice(0,8)}-${i+1}.mp4`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (err) { notice(err); } finally { download.disabled = false; }
        }); actions.append(download);
      }); card.append(actions, el('p', 'MP4 im TecMon-Replay unter „In CS2 aufnehmen“ auswählen. Dort kannst du sie mit Spielername und Steam-Link auf YouTube veröffentlichen.'));
    }
    if (job.log) { const details = el('details'); details.append(el('summary', 'Aufnahme-Protokoll'), el('pre', job.log)); card.append(details); }
    container.append(card);
  }
}
$('import').addEventListener('change', async event => {
  try { const file = event.target.files[0]; if (!file) return; if (file.size > 65536) throw new Error('Auftrag zu groß.'); const value=JSON.parse(await file.text());
    if(value.format==='tecmon-match-download') { showAdvanced('demos'); if(value.version!==1 || !Array.isArray(value.shareCodes) || !value.shareCodes.length || value.shareCodes.length>10 || value.shareCodes.some(c=>typeof c!=='string')) throw new Error('Ungültige Match-Datei.'); $('share-codes').value=value.shareCodes.join('\n'); $('notice').textContent='Sharecodes übernommen. Bitte lokalen Download bestätigen.'; }
    else { await api('/api/import',value); $('notice').textContent=''; }
    await refresh(); } catch (err) { notice(err); } finally { event.target.value = ''; }
});
$('download-start').addEventListener('click',async()=>{
  try { await api('/api/demos/download',{format:'tecmon-match-download',version:1,shareCodes:$('share-codes').value.trim().split(/\s+/),csdm:$('engine').value.trim().replace(/^"|"$/g,''),confirm:$('download-confirm').checked}); $('notice').textContent='Demo-Download läuft direkt auf deinem PC.'; await refresh(); }
  catch(error){notice(error);}
});
function askShutdown(show){$('shutdown').hidden=show;$('shutdown-confirm').hidden=!show;}
$('shutdown').addEventListener('click',()=>askShutdown(true));
$('shutdown-no').addEventListener('click',()=>askShutdown(false));
$('shutdown-yes').addEventListener('click', async () => { askShutdown(false); try { await api('/api/shutdown', {}); clearInterval(timer); $('notice').textContent = 'Companion beendet. Du kannst dieses Fenster schließen.'; } catch (err) { notice(err); } });
$('database-check').addEventListener('click', async () => {
  $('database-check').disabled = true;
  try { databaseState(await api('/api/database/check', { port: Number($('database-port').value) })); $('notice').textContent = ''; }
  catch (error) { notice(error); }
  finally { $('database-check').disabled = false; }
});
$('database-install').addEventListener('click', async () => {
  $('database-install').disabled = true;
  try { const result = await api('/api/database/install', { confirm: true }); $('notice').textContent = result.message; }
  catch (error) { notice(error); }
  finally { await refresh().catch(notice); }
});
$('engine-browse').addEventListener('click', async () => { try { const selected=await api('/api/pick',{kind:'engine'}); if(selected.path) $('engine').value=selected.path; } catch(error) { notice(error); } });
$('auto-update').addEventListener('change',async()=>{const box=$('auto-update');box.disabled=true;try{await api('/api/update/auto',{auto:box.checked});await refresh();}catch(error){notice(error);box.checked=!box.checked;}finally{box.disabled=false;}});
$('own-engine').addEventListener('change',async()=>{const box=$('own-engine');box.disabled=true;try{await api('/api/engine',{internal:box.checked});await refresh();}catch(error){notice(error);box.checked=!box.checked;}finally{box.disabled=false;}});
$('csdm-open').addEventListener('click', async () => { try { const result=await api('/api/csdm/open',{}); $('notice').textContent=result.message; } catch(error) { notice(error); } });
let latestUpdate=null;
function updateOffer(result){
  latestUpdate=result.available?result:null;
  $('update-banner').hidden=!latestUpdate;
  if(latestUpdate){$('update-banner-title').textContent=`Update ${result.latest} verfügbar`;$('update-check').textContent=`Update ${result.latest} installieren`;}
  else $('update-check').textContent='Auf Updates prüfen';
  $('update-status').textContent=latestUpdate?`Version ${result.latest} ist verfügbar. Die Installation ersetzt nur Companion-Dateien und startet den Companion neu. CS Demo Manager vorher schließen.`:`Du hast die aktuelle Version${result.latest?` (${result.latest})`:''}.`;
}
async function checkUpdate(silent){
  try{updateOffer(await api('/api/update/check',{}));if(!silent&&!latestUpdate)$('notice').textContent='Companion ist aktuell.';}
  catch(error){if(!silent)notice(error);}
}
async function installUpdate(){
  if(!latestUpdate)return;
  for(const button of [$('update-check'),$('update-banner-install')])button.disabled=true;
  try {
    const result=await api('/api/update/install',{confirm:true});restarting=true;clearInterval(timer);$('notice').textContent=result.message+' Verbindung wird nach dem Neustart wiederhergestellt …';
    $('update-banner-title').textContent=`Update ${result.latest} wird installiert …`;
    for(let attempt=0;attempt<90;attempt++) {
      await new Promise(resolve=>setTimeout(resolve,1000));
      try {const response=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(2000)});const health=await response.json();if(health.version===result.latest){window.location.reload();return;}} catch { /* Expected while the local service restarts. */ }
    }
    throw new Error('Neustart noch nicht abgeschlossen. Companion erneut öffnen oder die Update-EXE aus GitHub Releases verwenden. Ein Update-Ergebnis steht im Programmordner unter update-result.json.');
  } catch(error){notice(error);restarting=false;clearInterval(timer);timer=setInterval(()=>refresh().catch(notice),2000);}
  finally{for(const button of [$('update-check'),$('update-banner-install')])button.disabled=false;}
}
$('update-check').addEventListener('click',async()=>{const button=$('update-check');button.disabled=true;try{if(latestUpdate)await installUpdate();else await checkUpdate(false);}finally{button.disabled=false;}});
$('update-banner-install').addEventListener('click',installUpdate);

/* Letzte Videos */
let videoSignature='';
const sizeLabel=bytes=>bytes>=1e9?`${(bytes/1e9).toFixed(1)} GB`:`${Math.max(1,Math.round(bytes/1e6))} MB`;
const timeLabel=ms=>new Date(ms).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
async function loadVideos(){
  const {videos}=await api('/api/videos');
  const next=JSON.stringify(videos);if(next===videoSignature)return;videoSignature=next;
  const list=$('recent-list');list.replaceChildren();
  if(!videos.length){list.append(el('li','Noch keine Videos. Fertige Aufnahmen erscheinen hier.','recent-empty'));return;}
  for(const video of videos){
    const item=el('li','','recent-item');const text=el('div');text.append(el('b',video.name),el('small',`${timeLabel(video.time)} · ${sizeLabel(video.size)}`));
    const play=el('button','▶ Abspielen');play.type='button';play.addEventListener('click',()=>api('/api/videos/open',{key:video.key}).catch(notice));
    const show=el('button','Im Ordner zeigen','subtle');show.type='button';show.addEventListener('click',()=>api('/api/videos/folder',{key:video.key}).catch(notice));
    const actions=el('div','','actions');actions.append(play,show);item.append(text,actions);list.append(item);
  }
}
const openFolder=event=>{event?.preventDefault();api('/api/videos/folder',{}).catch(notice);};
$('folder-open').addEventListener('click',openFolder);$('folder-open-side').addEventListener('click',openFolder);
fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(h=>{$('version-label').textContent=h.version;}).catch(()=>{});

let timer = setInterval(() => refresh().catch(notice), 2000);
refresh().then(()=>{if(latestState?.managed)checkUpdate(true);}).catch(notice);
loadVideos().catch(()=>{});setInterval(()=>{if(!restarting)loadVideos().catch(()=>{});},10000);
/* Fadenkreuz-Editor: nur CS2-eigene Einstellungen, Vorschau grob wie CS2 bei 1080 Zeilen (doppelt vergrößert). */
let crosshair=null,crosshairInfo=null;
const crossKeys=['size','gap','thickness','outlineThickness','alpha'];
const hex=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
function crossCommands(c){const b=v=>v?1:0;return [`cl_crosshairstyle ${c.style}`,`cl_crosshairsize ${c.size}`,`cl_crosshairgap ${c.gap}`,`cl_crosshairthickness ${c.thickness}`,`cl_crosshair_drawoutline ${b(c.outline)}`,`cl_crosshair_outlinethickness ${c.outlineThickness}`,'cl_crosshaircolor 5',`cl_crosshaircolor_r ${c.color[0]}`,`cl_crosshaircolor_g ${c.color[1]}`,`cl_crosshaircolor_b ${c.color[2]}`,`cl_crosshairusealpha ${b(c.alpha<255)}`,`cl_crosshairalpha ${c.alpha}`,`cl_crosshairdot ${b(c.dot)}`,`cl_crosshair_t ${b(c.tStyle)}`,'cl_crosshairgap_useweaponvalue 0'];}
function drawCrosshair(){
  const canvas=$('crosshair-preview');if(!canvas||!crosshair)return;const g=canvas.getContext('2d'),c=crosshair,s=2,w=canvas.width;
  const sky=g.createLinearGradient(0,0,0,w);sky.addColorStop(0,'#c9b48a');sky.addColorStop(.55,'#9c8763');sky.addColorStop(.56,'#6d5b44');sky.addColorStop(1,'#4b3e2f');g.fillStyle=sky;g.fillRect(0,0,w,w);
  const t=Math.max(1,Math.round(Math.max(.5,c.thickness)*2))*s,len=Math.round(c.size*2)*s,gap=Math.max(0,Math.round(c.gap+4))*s,half=Math.floor(t/2),o=c.outline?Math.max(1,Math.round(c.outlineThickness))*s/2:0;
  const rects=[];if(len>0){rects.push([gap,-half,len,t],[-gap-len,-half,len,t],[-half,gap,t,len]);if(!c.tStyle)rects.push([-half,-gap-len,t,len]);}if(c.dot)rects.push([-half,-half,t,t]);
  g.save();g.translate(w/2,w/2);g.globalAlpha=c.alpha/255;
  if(o){g.fillStyle='#000';for(const r of rects)g.fillRect(r[0]-o,r[1]-o,r[2]+2*o,r[3]+2*o);}
  g.fillStyle=hex(c.color);for(const r of rects)g.fillRect(...r);g.restore();
}
function showCrosshair(){
  if(!crosshair)return;const c=crosshair;
  for(const k of crossKeys){const input=$('crosshair-'+k);input.value=c[k];input.nextElementSibling.textContent=c[k];}
  $('crosshair-style').value=c.style;$('crosshair-color').value=hex(c.color);for(const k of ['outline','dot','tStyle'])$('crosshair-'+k).checked=c[k];
  $('crosshair-commands').textContent=crossCommands(c).join('\n');drawCrosshair();
}
async function loadCrosshair(){
  if(!$('crosshair-preview'))return;
  try{crosshairInfo=await api('/api/crosshair');crosshair=crosshairInfo.crosshair;$('crosshair-exec').textContent=crosshairInfo.exec;
    $('crosshair-style').replaceChildren(...crosshairInfo.styles.map(s=>{const o=el('option',s.label);o.value=s.id;return o;}));
    $('crosshair-presets').replaceChildren(...crosshairInfo.presets.map(p=>{const b=el('button',p.label,'subtle');b.type='button';b.addEventListener('click',()=>{crosshair={...p.crosshair,color:[...p.crosshair.color]};showCrosshair();});return b;}));
    if(!crosshairInfo.available)$('crosshair-save').textContent='Speichern';showCrosshair();}catch(error){notice(error);}
}
for(const k of crossKeys)$('crosshair-'+k)?.addEventListener('input',e=>{crosshair[k]=Number(e.target.value);showCrosshair();});
for(const k of ['outline','dot','tStyle'])$('crosshair-'+k)?.addEventListener('change',e=>{crosshair[k]=e.target.checked;showCrosshair();});
$('crosshair-style')?.addEventListener('change',e=>{crosshair.style=Number(e.target.value);showCrosshair();});
$('crosshair-color')?.addEventListener('input',e=>{const v=e.target.value;crosshair.color=[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));showCrosshair();});
$('crosshair-import')?.addEventListener('click',async()=>{try{const result=await api('/api/crosshair/decode',{code:$('crosshair-code').value});crosshair=result.crosshair;showCrosshair();notice({message:'Fadenkreuz-Code übernommen. Zum Anwenden „In CS2 speichern“.'});}catch(error){notice(error);}});
$('crosshair-copy')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(crossCommands(crosshair).join('; '));notice({message:'Befehle kopiert. In der CS2-Konsole einfügen.'});}catch(error){notice(error);}});
$('crosshair-save')?.addEventListener('click',async()=>{const button=$('crosshair-save');button.disabled=true;try{const result=await api('/api/crosshair/save',{crosshair});crosshair=result.crosshair;showCrosshair();notice({message:result.message});}catch(error){notice(error);}finally{button.disabled=false;}});
loadCrosshair();
/* TecMon: Werte, Persönlichkeit, Interaktionen und Mini-Spiele. Alles lokal; die Figur zeigt die Antworten. */
let pet=null;
function showPet(state){
  if(!state||!$('pet-heading'))return;pet=state;
  $('pet-heading').textContent=`Level ${state.level}`;const mode=state.modes.find(m=>m.id===state.mode);$('pet-mode-badge').textContent=mode?mode.label:state.mode;
  $('pet-xp').max=state.next;$('pet-xp').value=state.xp;$('pet-xp-text').textContent=`${state.xp}/${state.next}`;
  for(const k of ['mood','energy','friendship']){$('pet-'+k).value=state[k];$(`pet-${k}-text`).textContent=state[k];}
  if(state.event)$('pet-says').textContent=`„${state.event.text}“`;
  $('pet-sleep').textContent=state.asleep?'Aufwecken':'Schlafen';$('pet-sleep').dataset.pet=state.asleep?'wake':'sleep';
  const modes=$('pet-modes');if(modes.childElementCount!==state.modes.length)modes.replaceChildren(...state.modes.map(m=>{const b=el('button',m.label);b.type='button';b.dataset.mode=m.id;b.setAttribute('role','radio');b.addEventListener('click',()=>petCall('/api/pet/mode',{mode:m.id}));return b;}));
  for(const b of modes.children){const on=b.dataset.mode===state.mode;b.className=on?'':'subtle';b.setAttribute('aria-checked',on);}
  const c=state.counts||{},games=['reaction','rps','quiz','guess','memory','price','aim'].reduce((n,g)=>n+(c['game_'+g]||0),0);
  $('pet-counts').textContent=`Angestupst ${c.poke||0}× · Witze ${c.joke||0} · Tricks ${c.trick||0} · Spiele ${games}`;
  const best=state.best||{};$('game-best').textContent=[best.reaction?`Bester Reaktionstest: ${best.reaction} ms`:'',c.win_rps?`Schere-Stein-Papier gewonnen: ${c.win_rps}×`:'',c.win_quiz?`Quiz richtig: ${c.win_quiz}×`:'',best.aim?`Ziele: ${(best.aim/1000).toFixed(2)} s`:'',best.memory?`Muster: ${best.memory}`:'',best.guess?`Zahl geraten in ${best.guess} Versuchen`:'',c.win_price?`Preise richtig: ${c.win_price}×`:''].filter(Boolean).join(' · ');
}
async function petCall(url,body){try{const result=await api(url,body);showPet(result.pet);return result.pet;}catch(error){notice(error);}}
document.querySelectorAll('[data-pet]').forEach(b=>b.addEventListener('click',()=>petCall('/api/pet/interact',{action:b.dataset.pet})));
async function loadPet(){try{const state=await api('/api/state');showPet(state.pet);}catch(error){}}
const area=()=>$('game-area');
function gameDone(game,win,score){petCall('/api/pet/game',{game,win,score});}
/* Reaktionstest: warten, bis das Feld lila wird, dann so schnell wie möglich klicken. */
function reactionGame(){
  const box=el('button','Warte auf Lila …','reaction-box');box.type='button';let ready=0,timer=0,over=false;
  timer=setTimeout(()=>{ready=performance.now();box.classList.add('go');box.textContent='JETZT!';},1200+Math.random()*2500);
  box.addEventListener('click',()=>{if(over)return;over=true;clearTimeout(timer);
    if(!ready){box.textContent='Zu früh! Nochmal?';box.classList.add('fail');gameDone('reaction',false,0);return;}
    const ms=Math.round(performance.now()-ready);box.textContent=`${ms} ms`;gameDone('reaction',ms<300,ms);});
  area().replaceChildren(box,el('p','Klick, sobald das Feld lila wird. Unter 300 ms gilt als Sieg.'));
}
/* Schere, Stein, Papier gegen TecMon. */
function rpsGame(){
  const names=['Schere','Stein','Papier'],icons=['✌','✊','✋'];const result=el('p','Was nimmst du?');
  const buttons=names.map((n,i)=>{const b=el('button',`${icons[i]} ${n}`);b.type='button';b.addEventListener('click',()=>{const bot=Math.floor(Math.random()*3),diff=(i-bot+3)%3;
    result.textContent=`TecMon nimmt ${icons[bot]} ${names[bot]}. `+(diff===0?'Unentschieden.':diff===1?'Du gewinnst!':'TecMon gewinnt.');if(diff!==0)gameDone('rps',diff===1,0);});return b;});
  const row=el('div','','pet-buttons');row.append(...buttons);area().replaceChildren(row,result);
}
/* Callout-Quiz: auf welcher Map liegt der Ort? */
async function quizGame(){
  try{const q=await api('/api/pet/quiz');const result=el('p','');const row=el('div','','pet-buttons');
    row.append(...q.options.map((o,i)=>{const b=el('button',o);b.type='button';b.addEventListener('click',()=>{for(const x of row.children)x.disabled=true;const ok=i===q.answer;b.className=ok?'':'subtle';result.textContent=ok?'Richtig!':`Falsch, richtig ist ${q.options[q.answer]}.`;gameDone('quiz',ok,ok?1:0);const next=el('button','Nächste Frage','subtle');next.type='button';next.addEventListener('click',quizGame);result.append(' ',next);});return b;}));
    area().replaceChildren(el('p',q.question,'quiz-question'),row,result);}catch(error){notice(error);}
}
/* Waffenpreis-Quiz: was kostet die Waffe in CS2? */
const PRICES=[['AK-47',2700],['M4A4',3100],['M4A1-S',2900],['AWP',4750],['Desert Eagle',700],['Galil AR',1800],['FAMAS',2050],['MP9',1250],['MAC-10',1050],['SSG 08',1700],['P250',300],['Five-SeveN',500],['Tec-9',500],['UMP-45',1200],['AUG',3300],['SG 553',3000],['Zeus x27',200],['Kevlar + Helm',1000]];
function priceGame(){
  const [name,price]=PRICES[Math.floor(Math.random()*PRICES.length)];const set=new Set([price]);
  while(set.size<4)set.add(PRICES[Math.floor(Math.random()*PRICES.length)][1]);
  const options=[...set].sort(()=>Math.random()-.5);const result=el('p','');const row=el('div','','pet-buttons');
  row.append(...options.map(o=>{const b=el('button',`$${o}`);b.type='button';b.addEventListener('click',()=>{for(const x of row.children)x.disabled=true;const ok=o===price;b.className=ok?'':'subtle';result.textContent=ok?'Richtig!':`Falsch, ${name} kostet $${price}.`;gameDone('price',ok,ok?1:0);const next=el('button','Nächste Waffe','subtle');next.type='button';next.addEventListener('click',priceGame);result.append(' ',next);});return b;}));
  area().replaceChildren(el('p',`Was kostet ${name}?`,'quiz-question'),row,result);
}
/* Ziele treffen: 10 Ziele so schnell wie möglich anklicken. */
function aimGame(){
  const field=el('div','','aim-field');const info=el('p','Klick auf das erste Ziel, dann läuft die Zeit.');let hits=0,start=0;
  const target=el('button','','aim-target');target.type='button';target.setAttribute('aria-label','Ziel');
  const move=()=>{target.style.left=`${5+Math.random()*85}%`;target.style.top=`${8+Math.random()*75}%`;};
  target.addEventListener('click',()=>{if(!start)start=performance.now();hits++;
    if(hits>=10){const ms=Math.round(performance.now()-start);target.hidden=true;info.textContent=`10 Ziele in ${(ms/1000).toFixed(2)} s.`;gameDone('aim',ms<6000,ms);const again=el('button','Nochmal','subtle');again.type='button';again.addEventListener('click',aimGame);info.append(' ',again);return;}
    info.textContent=`${hits}/10`;move();});
  move();field.append(target);area().replaceChildren(field,info);
}
/* Muster merken: TecMon zeigt eine Folge, du klickst sie nach. */
function memoryGame(){
  const colors=['violet','gold','cyan','pink'],pads=colors.map(c=>{const b=el('button','',`memory-pad ${c}`);b.type='button';b.setAttribute('aria-label',c);return b;});
  const grid=el('div','','memory-grid');grid.append(...pads);const info=el('p','Schau gut hin …');let seq=[],pos=0,busy=true;
  const flash=(i)=>new Promise(r=>{pads[i].classList.add('lit');setTimeout(()=>{pads[i].classList.toggle('lit',false);setTimeout(r,180);},420);});
  const round=async()=>{busy=true;seq.push(Math.floor(Math.random()*4));pos=0;info.textContent=`Runde ${seq.length}: schau gut hin …`;await new Promise(r=>setTimeout(r,500));for(const i of seq)await flash(i);busy=false;info.textContent='Jetzt du!';};
  pads.forEach((b,i)=>b.addEventListener('click',()=>{if(busy)return;flash(i);
    if(i!==seq[pos]){busy=true;const score=seq.length-1;info.textContent=`Daneben! Du hast ${score} geschafft.`;gameDone('memory',score>=5,score);const again=el('button','Nochmal','subtle');again.type='button';again.addEventListener('click',memoryGame);info.append(' ',again);return;}
    if(++pos===seq.length){busy=true;setTimeout(round,600);}}));
  area().replaceChildren(grid,info);round();
}
/* Zahl raten: TecMon denkt sich eine Zahl von 1 bis 100. */
function guessGame(){
  const secret=1+Math.floor(Math.random()*100);let tries=0;const input=el('input');input.type='number';input.min='1';input.max='100';input.placeholder='1–100';input.className='guess-input';
  const go=el('button','Raten');go.type='button';const info=el('p','Ich denke an eine Zahl von 1 bis 100.');const row=el('div','','pet-buttons');row.append(input,go);
  const guess=()=>{const n=Number(input.value);if(!Number.isInteger(n)||n<1||n>100){info.textContent='Bitte eine Zahl von 1 bis 100.';return;}tries++;
    if(n===secret){info.textContent=`Richtig, ${secret}! ${tries} Versuche.`;go.disabled=input.disabled=true;gameDone('guess',tries<=7,tries);const again=el('button','Nochmal','subtle');again.type='button';again.addEventListener('click',guessGame);info.append(' ',again);return;}
    info.textContent=`${n} ist zu ${n<secret?'klein':'groß'}. Versuch ${tries}.`;input.select();};
  go.addEventListener('click',guess);input.addEventListener('keydown',e=>{if(e.key==='Enter')guess();});area().replaceChildren(row,info);input.focus();
}
document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>({reaction:reactionGame,rps:rpsGame,quiz:quizGame,price:priceGame,aim:aimGame,memory:memoryGame,guess:guessGame})[b.dataset.game]()));
loadPet();setInterval(loadPet,5000);
if(['#spiele','#tecmon','#games','#rundentipps','#fadenkreuz','#videos'].includes(location.hash))setTimeout(()=>document.querySelector(location.hash)?.scrollIntoView({behavior:'smooth'}),300);
