// Esc closes only our own native popup, never sends a key to a game.
document.addEventListener("keydown",e=>{if(e.key==="Escape")window.chrome?.webview?.postMessage("menu-close");});
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
let restarting = false;
let latestState;
function advanced(show) {
  if(show&&window.companionMenu){window.companionMenu.openAdvanced('updates');return;}
  $('advanced-panel').hidden=!show;
  $('advanced-toggle').setAttribute('aria-expanded',String(show));
  $('advanced-toggle').textContent=show?'Erweitert schließen':'Erweitert';
}
function tab(name) {
  for(const button of document.querySelectorAll('.tab')) button.setAttribute('aria-selected',String(button.dataset.tab===name));
  for(const panel of document.querySelectorAll('.tab-panel')) panel.hidden=panel.dataset.panel!==name;
}
for(const button of document.querySelectorAll('.tab')) button.addEventListener('click',()=>tab(button.dataset.tab));
function showAdvanced(name){if(window.companionMenu){window.companionMenu.openAdvanced(name);return;}advanced(true);tab(name);$('advanced-panel').scrollIntoView({behavior:'smooth'});}
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
  $('activity-note').textContent=state.active?(running?.job.title || 'Der Companion arbeitet lokal. Den Fortschritt siehst du auch auf der Webseite.'):latest?.status==='error'||lastDownload?.status==='error'?'Die Details findest du unter „Erweitert“ im Aufnahme- oder Download-Protokoll.':latest?.status==='done'?'Das Ergebnis steht bereit. Auf der Webseite gestartete Videos werden dort automatisch übernommen; lokale Aufträge findest du unter „Erweitert“.':latest?.status==='ready'?'Öffne „Erweitert“, um die Originaldemo zu wählen und den importierten Auftrag zu starten.':'Aufnahme-Tools starten erst bei Bedarf. Wähle deine Highlights auf TecMon.';
}
async function api(url, body) {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-tecmon-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  // Neuer Sitzungsschlüssel nach Neustart des Dienstes (z. B. Update): Seite einmal neu laden.
  if (response.status === 401) { let last = 0; try { last = Number(sessionStorage.getItem('tecmon-reload') || 0); sessionStorage.setItem('tecmon-reload', String(Date.now())); } catch {} if (Date.now() - last > 30000) { location.reload(); return new Promise(() => {}); } }
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
function notice(error) { $('notice').textContent = error.message || String(error); }
function el(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
const statuses = { preparing:'VISUALS WERDEN GEPRÜFT', branding:'VIDEO-BRANDING LÄUFT', ready: 'BEREIT', analyzing: 'DEMO WIRD GEPRÜFT', recording: 'AUFNAHME LÄUFT', done: 'FERTIG', error: 'FEHLER', downloading:'DEMO WIRD GELADEN' };
const tipLabels={economy:'Wirtschaft',buy:'Kauf-Check',death:'Nach dem Tod',habit:'Gewohnheit',mindset:'Kopf',summary:'Zusammenfassung',weapon:'Waffe',map:'Map',warmup:'Aufwärmen',praise:'Stark',history:'Deine Matches',team:'Team',farm:'Farm',buyback:'Buyback',actives:'Items',gold:'Gold'};
let tipsSignature='';let featuresSignature='';
function gameTips(gsi){
  if(!gsi)return;
  $('tips-heading').textContent=!gsi.enabled?'Rundentipps sind aus':gsi.connected?`Live: ${gsi.map||'Hauptmenü'}${gsi.side?` · ${gsi.side}`:''}`:'Eingeschaltet · wartet auf CS2';
  const toggle=$('tips-toggle');toggle.textContent=gsi.enabled?'Ausschalten':'Einschalten';toggle.className=gsi.enabled?'subtle':'';toggle.disabled=!gsi.enabled&&!gsi.available;
  /* Fehler bleiben auch in der Ansicht „Einfach“ sichtbar (sonst ist die lange Erklärung dort ausgeblendet). */
  const problem=gsi.error?`Konfiguration konnte nicht geschrieben werden: ${gsi.error}`:!gsi.available&&!gsi.enabled?'CS2 wurde auf diesem PC nicht gefunden.':'';
  if(problem){$('tips-note').textContent=problem;$('tips-note').removeAttribute('data-expert');}
  const featureNext=JSON.stringify(gsi.features||[]);
  if(featureNext!==featuresSignature){
    featuresSignature=featureNext;
    const boxes=(gsi.features||[]).map(f=>{const label=el('label');const box=document.createElement('input');box.type='checkbox';box.checked=f.enabled;box.addEventListener('change',async()=>{if(box.checked&&f.notice&&!confirm(`${f.label}\n\n${f.notice}\n\nTrotzdem einschalten?`)){box.checked=false;return;}box.disabled=true;try{await api('/api/gsi/features',{features:{[f.id]:box.checked}});await refresh();}catch(error){notice(error);box.checked=!box.checked;}finally{box.disabled=false;}});label.append(box,document.createTextNode(f.label));if(f.notice)label.append(el('small',f.notice));return label;});
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
/* Desktop-Figur: Darstellung und Schalter, gespeichert im Companion (desktop.json). */
let figureState;
function showFigure(desktop){
  figureState=desktop;
  for(const [id,key,fallback] of [['figure-menu-key','menuKey','none'],['figure-menu-modifier','menuModifier','none'],['figure-bubble-placement','bubblePlacement','both']])if($(id)&&!$(id).disabled)$(id).value=desktop[key]??fallback;
  if($('figure-motion'))$('figure-motion').value=desktop.motion||(desktop.wander===false?'still':'chill');
  for(const b of document.querySelectorAll('#figure-quality [data-quality]'))b.setAttribute('aria-checked',String(b.dataset.quality===desktop.quality));
  for(const box of document.querySelectorAll('.figure-flags [data-flag]'))if(!box.disabled)box.checked=!!desktop[box.dataset.flag];
  applyUi(desktop.ui);
  const hint=document.querySelector('[data-fold="cat-figur"] .cat-hint');
  if(hint)hint.textContent=`Ansicht ${desktop.ui==='simple'?'Einfach':'Erweitert'} · Figur ${desktop.quality==='low'?'Bilder':'3D'}${desktop.autostart?' · Autostart':''}`;
  if(Number.isInteger(desktop.tutorial)&&desktop.tutorial<TOUR_VERSION&&!tourOffered){tourOffered=true;startTutorial();}
}
async function figureSettings(change,control){
  if(control)control.disabled=true;
  try{const r=await api('/api/desktop/settings',change);if(control)control.disabled=false;showFigure(r.desktop);}
  catch(error){notice(error);if(control)control.disabled=false;if(figureState)showFigure(figureState);}
}
$('figure-motion')?.addEventListener('change',e=>figureSettings({motion:e.target.value},e.target));
if($('figure-menu-key'))for(const key of [...Array.from({length:12},(_,i)=>`F${i+1}`),...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789','Home','End','Insert','PageUp','PageDown','Pause']){const option=el('option',key);option.value=key;$('figure-menu-key').append(option);}
for(const [id,key] of [['figure-menu-key','menuKey'],['figure-menu-modifier','menuModifier'],['figure-bubble-placement','bubblePlacement']])$(id)?.addEventListener('change',e=>figureSettings({[key]:e.target.value},e.target));
for(const b of document.querySelectorAll('#figure-quality [data-quality]'))b.addEventListener('click',()=>figureSettings({quality:b.dataset.quality}));
for(const box of document.querySelectorAll('.figure-flags [data-flag]'))box.addEventListener('change',()=>figureSettings({[box.dataset.flag]:box.checked},box));
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
  if(state.desktop)showFigure(state.desktop);
  if($('figure-menu-key-status')){const r=state.desktopRuntime,d=state.desktop;$('figure-menu-key-status').textContent=d?.menuKey==='none'?'Keine Menütaste eingerichtet. Maus und Tray funktionieren weiterhin.':!r?.connected||r.key!==d?.menuKey||r.modifier!==d?.menuModifier?'Warte auf Rückmeldung der Desktop-Figur …':r.registered?'Menütaste ist aktiv. Erneut drücken schließt das Popup.':'Diese Taste ist belegt oder von Windows reserviert. Bitte eine andere wählen.';}
  showVideoTools(state.videoTools);
  panelHints(state);
  if(crosshairInfo&&state.overlay)showOverlay({...crosshairInfo.overlay,...state.overlay});
  gameTips(state.gsi);
  if(state.auto)showAuto(state.auto);
  showBacklog(state.backlog);
  if(state.skins)showSkins(state.skins,!!state.managed);
  dotaTips(state.dota);
  renderExternalUpdates(state.updates?.external);
  $('auto-update-row').hidden=!state.updates?.available; $('auto-update').checked=!!state.updates?.auto; $('auto-update-note').textContent=state.updates?.auto?'Neue Versionen werden nach der Prüfung von Größe und Prüfsumme selbst installiert, nie während eines Downloads oder einer Aufnahme. Danach startet der Companion neu.':'Aus: Neue Versionen erscheinen als Hinweis und werden erst nach deinem Klick installiert.';
  $('cs2-status').textContent = state.detected.cs2 ? 'CS2 erkannt' : state.cs2Check && !state.cs2Check.ok ? `CS2 abgelehnt: ${state.cs2Check.reason}` : 'CS2 nicht gefunden';
  $('engine-status').textContent = state.managed ? 'TecMon-Engine bereit' : 'Nur im installierten Windows-Companion';
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
        try { await api('/api/start', { id: job.id, demo: draft.demo.trim().replace(/^"|"$/g, ''), confirm: draft.confirm, quality: $('quality').value }); $('notice').textContent = ''; await refresh(); } catch (err) { notice(err); start.disabled = false; }
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
  try { await api('/api/demos/download',{format:'tecmon-match-download',version:1,shareCodes:$('share-codes').value.trim().split(/\s+/),confirm:$('download-confirm').checked}); $('notice').textContent='Demo-Download läuft direkt auf deinem PC.'; await refresh(); }
  catch(error){notice(error);}
});
function askShutdown(show){$('shutdown').hidden=show;$('shutdown-confirm').hidden=!show;}
/* Esc schließt offene Rückfragen und aufgeklappte Optionen. */
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('shutdown-confirm').hidden){askShutdown(false);return;}const open=document.querySelector('details[open]');if(open)open.open=false;});
$('shutdown').addEventListener('click',()=>askShutdown(true));
$('shutdown-no').addEventListener('click',()=>askShutdown(false));
$('shutdown-yes').addEventListener('click', async () => { askShutdown(false); try { await api('/api/shutdown', {}); clearInterval(timer); $('notice').textContent = 'Companion beendet. Du kannst dieses Fenster schließen.'; } catch (err) { notice(err); } });
$('auto-update').addEventListener('change',async()=>{const box=$('auto-update');box.disabled=true;try{await api('/api/update/auto',{auto:box.checked});await refresh();}catch(error){notice(error);box.checked=!box.checked;}finally{box.disabled=false;}});
let latestUpdate=null;
function updateOffer(result){
  latestUpdate=result.available?result:null;
  $('update-banner').hidden=!latestUpdate;
  if(latestUpdate){$('update-banner-title').textContent=`Update ${result.latest} verfügbar`;$('update-check').textContent=`Update ${result.latest} installieren`;}
  else $('update-check').textContent='Auf Updates prüfen';
  $('update-status').textContent=latestUpdate?`Version ${result.latest} ist verfügbar. Die Installation ersetzt nur Companion-Dateien und startet den Companion neu.`:`Du hast die aktuelle Version${result.latest?` (${result.latest})`:''}.`;
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
/* Allgemeiner Fadenkreuz-Editor mit optionalem CS2-cfg-Export; statische Vorschau. */
let crosshair=null,crosshairInfo=null,overlayDraft=null;
let artStudio=null,cs2Draft=null;
const studioModes=['games','classic','custom'];
function showGameCrosshairs(){
  const select=$('crosshair-game'),list=$('crosshair-game-presets');if(!select||!list)return;
  const game=(crosshairInfo.gamePresets||[]).find(g=>g.id===select.value);
  $('crosshair-game-note').textContent=game?.note||'';if($('crosshair-cs2-open'))$('crosshair-cs2-open').hidden=game?.id!=='cs2';
  list.replaceChildren(...(game?.presets||[]).map(p=>{
    const key=game.id+':'+p.id,b=el('button','', 'game-crosshair-choice');b.type='button';b.setAttribute('aria-pressed',String(overlayDraft.gamePreset===key));
    const canvas=el('canvas');canvas.width=96;canvas.height=96;canvas.setAttribute('aria-hidden','true');
    const g=canvas.getContext('2d');g.translate(48,48);globalThis.TecMonArt?.draw(g,p.artwork,72);
    b.append(canvas,el('span',p.label));b.addEventListener('click',()=>{
      overlayDraft.artwork={...p.artwork};overlayDraft.shape='image';overlayDraft.imageSize=p.imageSize;overlayDraft.rotation=0;overlayDraft.gamePreset=key;
      artStudio?.load(overlayDraft.artwork);showCrosshair();showOverlayEditor();showGameCrosshairs();
      $('crosshair-game-status').textContent=game.label+' · '+p.label+' gewählt. Zum Übernehmen Einstellungen speichern.';
    });return b;
  }));
}
function loadGameCrosshairs(){
  const select=$('crosshair-game');if(!select)return;
  select.replaceChildren(...(crosshairInfo.gamePresets||[]).map(g=>{const option=el('option',g.label);option.value=g.id;return option;}));
  select.value=(overlayDraft.gamePreset||'cs2:').split(':')[0];showGameCrosshairs();
}
$('crosshair-game')?.addEventListener('change',()=>{showGameCrosshairs();$('crosshair-game-status').textContent='Spiel gewählt. Eine Vorlage anklicken, um sie zu übernehmen.';});
const overlayNumeric=['radius','dotSize','scale','rotation','monitor','offsetX','offsetY','imageSize'];
function studioMode(mode){
  for(const key of studioModes){const active=key===mode;$('crosshair-tab-'+key)?.setAttribute('aria-selected',String(active));if($('crosshair-panel-'+key))$('crosshair-panel-'+key).hidden=!active;}
}
function crosshairControls(){
  if(!crosshair||!overlayDraft)return;
  const circle=overlayDraft.shape==='circle',image=overlayDraft.shape==='image';
  $('overlay-shape').value=image?'image':circle?'circle':crosshair.tStyle?'t':'cross';
  for(const key of ['size','gap'])$('crosshair-'+key).disabled=circle||image;
  for(const key of ['thickness','color','outline','dot','tStyle'])$('crosshair-'+key).disabled=image;
  if($('overlay-imageSize'))$('overlay-imageSize').disabled=!image;

  $('overlay-radius').disabled=!circle;
  $('overlay-dotSize').disabled=image||!crosshair.dot;
  $('crosshair-outlineThickness').disabled=image||!crosshair.outline;
}
function chooseCrosshairShape(shape){
  overlayDraft.shape=['circle','image'].includes(shape)?shape:'cross';crosshair.tStyle=shape==='t';
  if(shape!=='circle'&&crosshair.size===0)crosshair.size=3;
}
function showOverlayEditor(){if(!overlayDraft)return;for(const key of [...overlayNumeric,'shape','target','app','hotkey']){const input=$('overlay-'+key);input.value=overlayDraft[key];if(input.nextElementSibling?.tagName==='OUTPUT')input.nextElementSibling.textContent=overlayDraft[key];}$('overlay-monitor').disabled=overlayDraft.target!=='monitor';crosshairControls();drawCrosshair();}
const crossKeys=['size','gap','thickness','outlineThickness','alpha'];
const hex=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
function crossCommands(c){const b=v=>v?1:0;return [`cl_crosshairstyle ${c.style}`,`cl_crosshairsize ${c.size}`,`cl_crosshairgap ${c.gap}`,`cl_crosshairthickness ${c.thickness}`,`cl_crosshair_drawoutline ${b(c.outline)}`,`cl_crosshair_outlinethickness ${c.outlineThickness}`,'cl_crosshaircolor 5',`cl_crosshaircolor_r ${c.color[0]}`,`cl_crosshaircolor_g ${c.color[1]}`,`cl_crosshaircolor_b ${c.color[2]}`,`cl_crosshairusealpha ${b(c.alpha<255)}`,`cl_crosshairalpha ${c.alpha}`,`cl_crosshairdot ${b(c.dot)}`,`cl_crosshair_t ${b(c.tStyle)}`,'cl_crosshairgap_useweaponvalue 0'];}
function drawCrosshair(canvas=$('crosshair-preview'),c=crosshair,o2=overlayDraft||{}){
  if(!canvas||!c)return;const g=canvas.getContext('2d'),w=canvas.width,s=Math.min(2*(o2.scale||1),(w-16)/(2*((o2.shape==='circle'?(o2.radius||8):Math.round(c.size*2)+Math.max(0,Math.round(c.gap+4)))+Math.max(3,(o2.dotSize||2),c.thickness*2)+c.outlineThickness)));
  const sky=g.createLinearGradient(0,0,0,w);sky.addColorStop(0,'#c9b48a');sky.addColorStop(.55,'#9c8763');sky.addColorStop(.56,'#6d5b44');sky.addColorStop(1,'#4b3e2f');g.fillStyle=sky;g.fillRect(0,0,w,w);
  if(o2.shape==='image'){
    const size=Math.min((o2.imageSize||32)*(o2.scale||1)*2,(w-20)/Math.SQRT2);
    g.save();g.translate(w/2,w/2);g.rotate((o2.rotation||0)*Math.PI/180);g.globalAlpha=c.alpha/255;
    globalThis.TecMonArt?.draw(g,o2.artwork,size);g.restore();return;
  }
  const t=Math.max(1,Math.round(Math.max(.5,c.thickness)*2))*s,len=Math.round(c.size*2)*s,gap=Math.max(0,Math.round(c.gap+4))*s,half=Math.floor(t/2),o=c.outline&&c.outlineThickness>0?c.outlineThickness*s/2:0;
  const rects=[];if(o2.shape!=='circle'&&len>0){rects.push([gap,-half,len,t],[-gap-len,-half,len,t],[-half,gap,t,len]);if(!c.tStyle)rects.push([-half,-gap-len,t,len]);}if(c.dot){const dot=Math.max(1,Math.round((o2.dotSize||2)*s));rects.push([-Math.floor(dot/2),-Math.floor(dot/2),dot,dot]);}
  g.save();g.translate(w/2,w/2);g.rotate((o2.rotation||0)*Math.PI/180);g.globalAlpha=c.alpha/255;
  if(o2.shape==='circle'){const radius=(o2.radius||8)*s;g.beginPath();g.arc(0,0,radius,0,2*Math.PI);if(o){g.strokeStyle='#000';g.lineWidth=t+2*o;g.stroke();}g.strokeStyle=hex(c.color);g.lineWidth=t;g.stroke();}
  if(o){g.fillStyle='#000';for(const r of rects)g.fillRect(r[0]-o,r[1]-o,r[2]+2*o,r[3]+2*o);}
  g.fillStyle=hex(c.color);for(const r of rects)g.fillRect(...r);g.restore();
}
function showCrosshair(){
  if(!crosshair)return;if(overlayDraft?.shape==='circle')crosshair.tStyle=false;const c=crosshair;
  for(const k of crossKeys){const input=$('crosshair-'+k);input.value=c[k];input.nextElementSibling.textContent=c[k];}
  $('crosshair-style').value=c.style;$('crosshair-color').value=hex(c.color);for(const k of ['outline','dot','tStyle'])$('crosshair-'+k).checked=c[k];
  crosshairControls();drawCrosshair();
}
async function loadCrosshair(){
  if(!$('crosshair-preview'))return;
  try{crosshairInfo=await api('/api/crosshair');crosshair=crosshairInfo.crosshair;cs2Draft=structuredClone(crosshairInfo.cs2Crosshair||crosshair);showCs2Crosshair();$('crosshair-exec').textContent=crosshairInfo.exec;
    $('cs2-crosshair-style').replaceChildren(...crosshairInfo.styles.map(s=>{const o=el('option',s.label);o.value=s.id;return o;}));
    $('crosshair-presets').replaceChildren(...crosshairInfo.presets.map(p=>{const b=el('button',p.label,'subtle');b.type='button';b.addEventListener('click',()=>{crosshair={...p.crosshair,color:[...p.crosshair.color]};if(overlayDraft){overlayDraft.shape='cross';overlayDraft.gamePreset='';showGameCrosshairs();}showCrosshair();showOverlayEditor();});return b;}));
    overlayDraft={...crosshairInfo.overlay};
    if(globalThis.TecMonArt&&$('art-canvas')){
      artStudio=globalThis.TecMonArt.create({onChange:artwork=>{overlayDraft.artwork=artwork;overlayDraft.shape='image';overlayDraft.gamePreset='';showGameCrosshairs();if($('crosshair-game-status'))$('crosshair-game-status').textContent='Eigenes Design geändert. Zum Übernehmen Einstellungen speichern.';showCrosshair();showOverlayEditor();}});
      artStudio.load(overlayDraft.artwork);
    }
    loadGameCrosshairs();studioMode('games');showCs2Crosshair();showCrosshair();showOverlayEditor();showOverlay(crosshairInfo.overlay);}catch(error){notice(error);}
}
for(const mode of studioModes)$('crosshair-tab-'+mode)?.addEventListener('click',()=>{
  studioMode(mode);if(!overlayDraft)return;
  if(mode==='classic'&&overlayDraft.shape==='image'){overlayDraft.gamePreset='';chooseCrosshairShape('cross');showGameCrosshairs();}
  if(mode==='custom'&&overlayDraft.artwork)chooseCrosshairShape('image');
  showCrosshair();showOverlayEditor();
});
for(const mode of studioModes)$('crosshair-tab-'+mode)?.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?studioModes[0]:e.key==='End'?studioModes.at(-1):studioModes[(studioModes.indexOf(mode)+(e.key==='ArrowRight'?1:studioModes.length-1))%studioModes.length];$('crosshair-tab-'+next).click();$('crosshair-tab-'+next).focus();});
for(const k of crossKeys)$('crosshair-'+k)?.addEventListener('input',e=>{crosshair[k]=Number(e.target.value);showCrosshair();});
for(const k of ['outline','dot','tStyle'])$('crosshair-'+k)?.addEventListener('change',e=>{crosshair[k]=e.target.checked;if(k==='tStyle'&&e.target.checked&&overlayDraft)chooseCrosshairShape('t');showCrosshair();});
$('crosshair-style')?.addEventListener('change',e=>{crosshair.style=Number(e.target.value);showCrosshair();});
$('crosshair-color')?.addEventListener('input',e=>{const v=e.target.value;crosshair.color=[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));showCrosshair();});
$('crosshair-import')?.addEventListener('click',async()=>{try{const result=await api('/api/crosshair/decode',{code:$('crosshair-code').value});cs2Draft=result.crosshair;showCs2Crosshair();$('crosshair-cfg-status').textContent='Code in den CS2-Entwurf übernommen. Noch nicht gespeichert.';}catch(error){notice(error);}});
$('crosshair-copy')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(crossCommands(cs2Draft).join('; '));$('crosshair-cfg-status').textContent='CS2-Befehle kopiert. In der CS2-Konsole einfügen.';}catch(error){notice(error);}});
$('crosshair-save')?.addEventListener('click',async()=>{const button=$('crosshair-save');button.disabled=true;try{const result=await api('/api/crosshair/profile',{crosshair,overlay:overlayDraft});crosshair=result.crosshair;overlayDraft={...result.overlay};artStudio?.saved();if($('crosshair-game-status'))$('crosshair-game-status').textContent='Gespeichert. Die Spielauswahl filtert nur die Vorlagen; dein Fadenkreuz bleibt erhalten.';showCrosshair();showOverlayEditor();showOverlay(result.overlay);notice({message:result.message});}catch(error){notice(error);}finally{button.disabled=false;}});
loadCrosshair();
/* Fadenkreuz-Overlay: erst nach gelesenem und bestätigtem Hinweis. */
function showOverlay(o){
  if(!o||!$('overlay-toggle'))return;crosshairInfo.overlay=o;
  const status=$('overlay-status');status.textContent=!o.enabled?'Aus':o.runtime?.paused?'An · per Taste ausgeblendet':'An';
  $('overlay-runtime').textContent=o.enabled&&!o.runtime?.connected?'Warte auf die native Windows-Figur. Im Browser allein erscheint kein Bildschirm-Overlay.':o.enabled&&o.hotkey!=='none'&&o.runtime?.hotkey===false?'Tastenkombination nicht verfügbar. Andere Taste wählen und speichern.':o.enabled?'Overlay aktiv. Mit der gewählten Taste vorübergehend ausblenden.':'';status.classList.toggle('on',o.enabled);
  $('overlay-notice').replaceChildren(...o.notice.map(t=>el('li',t)));
  $('overlay-toggle').textContent=o.enabled?'Overlay ausschalten':o.accepted?'Overlay einschalten':'Overlay einschalten …';
  if(o.enabled||o.accepted)$('overlay-consent').hidden=true;
}
$('overlay-toggle')?.addEventListener('click',async()=>{
  const o=crosshairInfo&&crosshairInfo.overlay;if(!o)return;const button=$('overlay-toggle');
  if(!o.enabled&&!o.accepted){
    const box=$('overlay-consent');
    if(box.hidden){box.hidden=false;button.textContent='Zustimmen und einschalten';$('overlay-accept').focus();return;}
    if(!$('overlay-accept').checked){notice({message:'Bitte erst den Hinweis bestätigen.'});$('overlay-accept').focus();return;}
  }
  button.disabled=true;
  try{if(!o.enabled){await api('/api/crosshair/profile',{crosshair,overlay:overlayDraft});}const result=await api('/api/crosshair/overlay',{enabled:!o.enabled,accept:o.noticeVersion});showOverlay(result.overlay);notice({message:result.message});}catch(error){notice(error);}finally{button.disabled=false;}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('overlay-consent')&&!$('overlay-consent').hidden&&!(crosshairInfo&&crosshairInfo.overlay.accepted)){$('overlay-consent').hidden=true;$('overlay-accept').checked=false;showOverlay(crosshairInfo.overlay);}});

for(const key of [...overlayNumeric,'shape','target','app','hotkey'])$('overlay-'+key)?.addEventListener('input',e=>{if(!overlayDraft)return;if(overlayNumeric.includes(key)&&e.target.value==='')return;if(key==='shape'){chooseCrosshairShape(e.target.value);showCrosshair();}else overlayDraft[key]=overlayNumeric.includes(key)?Number(e.target.value):e.target.value;if(e.target.nextElementSibling?.tagName==='OUTPUT')e.target.nextElementSibling.textContent=e.target.value;$('overlay-monitor').disabled=overlayDraft.target!=='monitor';drawCrosshair();});
$('crosshair-reset')?.addEventListener('click',()=>{crosshair={...crosshairInfo.presets[0].crosshair,color:[...crosshairInfo.presets[0].crosshair.color]};overlayDraft={...crosshairInfo.overlayDefaults};artStudio?.load(null);loadGameCrosshairs();studioMode('games');showCs2Crosshair();showCrosshair();showOverlayEditor();notice({message:'Standard geladen. Zum Übernehmen speichern.'});});
function showCs2Crosshair(){
  if(!cs2Draft)return;
  for(const k of ['size','gap','thickness','alpha','outlineThickness']){const n=$('cs2-crosshair-'+k);if(n){n.value=cs2Draft[k];n.nextElementSibling.textContent=cs2Draft[k];}}
  for(const k of ['dot','tStyle','outline'])if($('cs2-crosshair-'+k))$('cs2-crosshair-'+k).checked=cs2Draft[k];
  if($('cs2-crosshair-color'))$('cs2-crosshair-color').value=hex(cs2Draft.color);
  if($('cs2-crosshair-style'))$('cs2-crosshair-style').value=cs2Draft.style;
  $('crosshair-commands').textContent=crossCommands(cs2Draft).join('\n');
  drawCrosshair($('cs2-crosshair-preview'),cs2Draft,{shape:'cross',scale:1,rotation:0,dotSize:2});
}
for(const k of ['size','gap','thickness','alpha','outlineThickness','style','color','dot','tStyle','outline'])$('cs2-crosshair-'+k)?.addEventListener('input',e=>{
  if(!cs2Draft)return;
  cs2Draft[k]=k==='color'?[1,3,5].map(i=>parseInt(e.target.value.slice(i,i+2),16)):['dot','tStyle','outline'].includes(k)?e.target.checked:Number(e.target.value);
  showCs2Crosshair();$('crosshair-cfg-status').textContent='CS2-Entwurf geändert. Noch nicht gespeichert.';
});
$('crosshair-cs2-open')?.addEventListener('click',()=>{location.hash='cs2-fadenkreuz';$('cs2-fadenkreuz').scrollIntoView({block:'start',behavior:'smooth'});});
$('crosshair-cfg-save')?.addEventListener('click',async()=>{try{const result=await api('/api/crosshair/cs2-save',{crosshair:cs2Draft});cs2Draft=result.cs2Crosshair;showCs2Crosshair();$('crosshair-cfg-status').textContent=result.message;notice(result);}catch(error){notice(error);}});
async function importCrosshairCfg(){
  try{const result=await api('/api/crosshair/import-cfg',{text:$('crosshair-cfg-text').value,crosshair:cs2Draft});
    cs2Draft=result.crosshair;showCs2Crosshair();
    $('crosshair-cfg-status').textContent=result.imported+' Fadenkreuzwerte übernommen · '+result.ignored+' andere Befehle ignoriert.'+(result.unsupported.length?' Nicht unterstützte Fadenkreuzbefehle: '+result.unsupported.join(', ')+'.':'')+(result.rounded?.length?' Auf Editor-Schrittweite gerundet: '+result.rounded.join(', ')+'.':'')+' Noch nicht gespeichert. CFG herunterladen oder bewusst in CS2 speichern.';
  }catch(error){$('crosshair-cfg-status').textContent=error.message;notice(error);}
}
$('crosshair-cfg-import')?.addEventListener('click',importCrosshairCfg);
$('crosshair-cfg-file')?.addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>65536)throw Error('CFG bitte höchstens 64 KB groß wählen.');$('crosshair-cfg-text').value=await file.text();await importCrosshairCfg();}catch(error){$('crosshair-cfg-status').textContent=error.message;notice(error);}finally{e.target.value='';}});
$('crosshair-cfg-download')?.addEventListener('click',async()=>{try{const result=await api('/api/crosshair/export-cfg',{crosshair:cs2Draft});const url=URL.createObjectURL(new Blob([result.text],{type:'text/plain;charset=utf-8'}));const a=el('a');a.href=url;a.download='tecmon_crosshair.cfg';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);$('crosshair-cfg-status').textContent='CFG-Download gestartet. In den CS2-cfg-Ordner legen und mit exec tecmon_crosshair laden.';}catch(error){notice(error);}});

/* CFG-Sammlung: feste Einträge vom Companion, Tasten nur aus der Liste. */
const cfgOpen=new Set(['pro']);
function showCfgs(info){
  const list=$('cfg-list');if(!list||!info)return;
  list.replaceChildren(...info.groups.map(g=>{
    const items=info.items.filter(i=>i.group===g.id);if(!items.length)return el('div','');
    const box=document.createElement('details');box.className='cfg-group';box.open=cfgOpen.has(g.id);
    const active=items.filter(i=>i.installed).length;const head=document.createElement('summary');head.append(el('span',g.label));if(active)head.append(el('span',active+' aktiv','cfg-count'));box.append(head);
    box.addEventListener('toggle',()=>{if(box.open)cfgOpen.add(g.id);else cfgOpen.delete(g.id);});
    for(const item of [...items].sort((a,b)=>a.label.localeCompare(b.label,'de'))){
      const card=el('div','','cfg-item'+(item.installed?' on':''));
      const row=el('div','','cfg-row');row.append(el('strong',item.label));
      let select=null;
      if(item.bind){select=document.createElement('select');select.setAttribute('aria-label','Taste für '+item.label);select.replaceChildren(...info.keys.map(k=>{const o=el('option',k.toUpperCase());o.value=k;return o;}));select.value=item.key||item.defaultKey;row.append(select);}
      const install=el('button',item.installed?'Neu speichern':'In CS2 speichern');install.type='button';
      install.addEventListener('click',async()=>{install.disabled=true;try{const r=await api('/api/cfgs/install',{id:item.id,key:select?select.value:''});showCfgs(r);notice({message:r.message});}catch(error){notice(error);}finally{install.disabled=false;}});
      row.append(install);
      if(item.installed){const remove=el('button','Entfernen','subtle');remove.type='button';remove.addEventListener('click',async()=>{remove.disabled=true;try{const r=await api('/api/cfgs/remove',{id:item.id});showCfgs(r);notice({message:r.message});}catch(error){notice(error);}finally{remove.disabled=false;}});row.append(remove);}
      card.append(row,el('p',item.description));
      if(item.source)card.append(el('small','Quelle: '+item.source+'. Profis ändern ihre Einstellungen öfter.'));
      const exec=el('p','');exec.append('Laden in CS2: ',el('code',item.exec));card.append(exec);
      const details=document.createElement('details');details.append(el('summary','Befehle ansehen'),el('pre',item.commands.join('\n')));card.append(details);
      box.append(card);
    }
    return box;
  }));
}
async function loadCfgs(){if(!$('cfg-list'))return;try{showCfgs(await api('/api/cfgs'));}catch(error){notice(error);}}
loadCfgs();
/* TecMon: Werte, Persönlichkeit, Interaktionen und Mini-Spiele. Alles lokal; die Figur zeigt die Antworten. */
let pet=null;
function showPet(state){
  if(!state||!$('pet-heading'))return;pet=state;
  $('pet-heading').textContent=`Level ${state.level}`;const mode=state.modes.find(m=>m.id===state.mode);$('pet-mode-badge').textContent=mode?mode.label:state.mode;
  $('pet-xp').max=state.next;$('pet-xp').value=state.xp;$('pet-xp-text').textContent=`${state.xp}/${state.next}`;
  for(const k of ['mood','energy','friendship']){$('pet-'+k).value=state[k];$(`pet-${k}-text`).textContent=state[k];}
  if(state.event)$('pet-says').textContent=`„${state.event.text}“`;
  $('pet-sleep').textContent=state.asleep?'Aufwecken':'Schlafen';$('pet-sleep').dataset.pet=state.asleep?'wake':'sleep';
  const modes=$('pet-modes');if(modes.childElementCount!==state.modes.length)modes.replaceChildren(...state.modes.map(m=>{const b=el('button',m.label);b.type='button';b.dataset.mode=m.id;b.setAttribute('role','radio');b.addEventListener('click',()=>{if(m.id==='huan'&&pet&&pet.mode!=='huan'&&!confirm('HUAN-Modus (ab 18) einschalten?\n\nTecMon wird derb: Flüche und harter Trashtalk über dein Aim, deine Waffenwahl, dein Quiz-Wissen und deine Spielweise. Keine Beleidigungen von Menschen.'))return;petCall('/api/pet/mode',{mode:m.id});});return b;}));
  for(const b of modes.children){const on=b.dataset.mode===state.mode;b.className=on?'':'subtle';b.setAttribute('aria-checked',on);}
  const c=state.counts||{},games=['reaction','rps','quiz','guess','memory','price','aim'].reduce((n,g)=>n+(c['game_'+g]||0),0);
  $('pet-counts').textContent=`Angestupst ${c.poke||0}× · Witze ${c.joke||0} · Tricks ${c.trick||0} · Spiele ${games}`;
  const best=state.best||{};$('game-best').textContent=[best.reaction?`Bester Reaktionstest: ${best.reaction} ms`:'',c.win_rps?`Schere-Stein-Papier gewonnen: ${c.win_rps}×`:'',c.win_quiz?`Quiz richtig: ${c.win_quiz}×`:'',best.aim?`Ziele: ${(best.aim/1000).toFixed(2)} s`:'',best.memory?`Muster: ${best.memory}`:'',best.guess?`Zahl geraten in ${best.guess} Versuchen`:'',c.win_price?`Preise richtig: ${c.win_price}×`:''].filter(Boolean).join(' · ');
}
/* Dota 2: eigener Schalter, eigenes Token, gleiche Regeln (nur eigene Werte, nur in Pausen). */
let dotaTipsSignature='';let dotaFeaturesSignature='';
function dotaTips(dota){
  if(!dota)return;
  $('dota-tips-heading').textContent=!dota.enabled?'Dota-2-Tipps sind aus':dota.connected?(dota.quiet?'Live: Dota 2 · ich bin still':'Live: Dota 2'):'Eingeschaltet · wartet auf Dota 2';
  const toggle=$('dota-toggle');toggle.textContent=dota.enabled?'Ausschalten':'Einschalten';toggle.className=dota.enabled?'subtle':'';toggle.disabled=!dota.enabled&&!dota.available;
  if(dota.error)$('dota-note').textContent=`Konfiguration konnte nicht geschrieben werden: ${dota.error}`;
  else if(!dota.available&&!dota.enabled)$('dota-note').textContent='Dota 2 wurde auf diesem PC nicht gefunden.';
  const featureNext=JSON.stringify(dota.features||[]);
  if(featureNext!==dotaFeaturesSignature){
    dotaFeaturesSignature=featureNext;
    $('dota-features').replaceChildren(...(dota.features||[]).map(f=>{const label=el('label');const box=document.createElement('input');box.type='checkbox';box.checked=f.enabled;box.addEventListener('change',async()=>{box.disabled=true;try{await api('/api/dota2/features',{features:{[f.id]:box.checked}});await refresh();}catch(error){notice(error);box.checked=!box.checked;}finally{box.disabled=false;}});label.append(box,document.createTextNode(f.label));return label;}));
  }
  const next=JSON.stringify((dota.history||[]).map(t=>t.id));
  if(next===dotaTipsSignature)return;dotaTipsSignature=next;
  $('dota-list').replaceChildren(...(dota.history||[]).slice(0,5).map(t=>{const li=el('li','','tip-item');li.append(el('small',tipLabels[t.category]||'Tipp'),document.createTextNode(t.text));return li;}));
}
$('dota-toggle').addEventListener('click',async()=>{const button=$('dota-toggle');button.disabled=true;try{const on=latestState?.dota?.enabled;const result=await api(on?'/api/dota2/disable':'/api/dota2/enable',on?{}:{confirm:true});notice({message:result.message});await refresh();}catch(error){notice(error);}finally{button.disabled=false;}});
async function petCall(url,body){try{const result=await api(url,body);showPet(result.pet);return result.pet;}catch(error){notice(error);}}
document.querySelectorAll('[data-pet]').forEach(b=>b.addEventListener('click',()=>petCall('/api/pet/interact',{action:b.dataset.pet})));
async function loadPet(){try{const state=await api('/api/state');showPet(state.pet);if(state.games)showGames(state.games);}catch(error){}}
/* Spiel-Pakete: installieren oder entfernen; geplante Spiele nur als Hinweis. */
let gamesSignature='';
function showGames(list){
  const cs2=list.find(g=>g.id==='cs2');document.querySelectorAll('.cs2-only').forEach(n=>{n.hidden=!(cs2&&cs2.installed);});
  const dota=list.find(g=>g.id==='dota2');document.querySelectorAll('.dota2-only').forEach(n=>{n.hidden=!(dota&&dota.installed);});
  const wardogs=list.find(g=>g.id==='wardogs');document.querySelectorAll('.wardogs-only').forEach(n=>{n.hidden=!(wardogs&&wardogs.installed);});
  const signature=JSON.stringify(list.map(g=>[g.id,g.installed,g.status]));if(signature===gamesSignature)return;gamesSignature=signature;
  $('game-library').replaceChildren(...list.map(g=>{
    const row=el('li','','game-row'+(g.installed?' installed':''));row.dataset.package=g.id;const info=el('div','');info.append(el('b',g.label));
    const note=g.status==='planned'?(g.web?`Geplant · Schon jetzt: ${g.web}`:'Geplant'):g.installed?`Installiert · ${g.features.join(', ')}`:`Nicht installiert · ${g.features.join(', ')}`;info.append(el('small',note));
    const button=el('button','');button.type='button';
    if(g.status==='planned'){button.textContent='Herunterladen';button.disabled=true;button.className='subtle';button.title='Kommt in einem späteren Update.';}
    else if(g.installed){button.textContent='Entfernen';button.className='subtle';button.addEventListener('click',async()=>{
      if(!confirm(`${g.label} entfernen?\n\nGelöscht werden: ${g.data.join('; ')}.\nTipps für dieses Spiel werden ausgeschaltet. Du kannst das Paket jederzeit wieder installieren.`))return;
      try{const r=await api('/api/games/remove',{id:g.id,confirm:true});notice(r.message);showGames(r.games);}catch(error){notice(error);}});}
    else{button.textContent='⬇ Installieren';button.addEventListener('click',async()=>{try{const r=await api('/api/games/install',{id:g.id});notice(r.message);showGames(r.games);}catch(error){notice(error);}});}
    row.append(info,button);return row;}));
  window.companionMenu?.filterGames();
}
let gameArea=$('game-area');const area=()=>gameArea;
function gameDone(game,win,score){return petCall('/api/pet/game',{game,win,score});}
/* Quiz und Preisfrage: TecMons Spruch direkt unter dem Ergebnis zeigen. */
function petReply(result,game,ok){gameDone(game,ok,ok?1:0).then(p=>{if(p&&p.event&&p.event.text&&result.isConnected)result.append(el('small',`TecMon: „${p.event.text}“`,'pet-reply'));});}
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
    row.append(...q.options.map((o,i)=>{const b=el('button',o);b.type='button';b.addEventListener('click',()=>{for(const x of row.children)x.disabled=true;const ok=i===q.answer;b.className=ok?'':'subtle';result.textContent=ok?'Richtig!':`Falsch, richtig ist ${q.options[q.answer]}.`;petReply(result,'quiz',ok);const next=el('button','Nächste Frage','subtle');next.type='button';next.addEventListener('click',quizGame);result.append(' ',next);});return b;}));
    area().replaceChildren(el('p',q.question,'quiz-question'),row,result);}catch(error){notice(error);}
}
/* Waffenpreis-Quiz: was kostet die Waffe in CS2? */
const PRICES=[['AK-47',2700],['M4A4',3100],['M4A1-S',2900],['AWP',4750],['Desert Eagle',700],['Galil AR',1800],['FAMAS',2050],['MP9',1250],['MAC-10',1050],['SSG 08',1700],['P250',300],['Five-SeveN',500],['Tec-9',500],['UMP-45',1200],['AUG',3300],['SG 553',3000],['Zeus x27',200],['Kevlar + Helm',1000]];
function priceGame(){
  const [name,price]=PRICES[Math.floor(Math.random()*PRICES.length)];const set=new Set([price]);
  while(set.size<4)set.add(PRICES[Math.floor(Math.random()*PRICES.length)][1]);
  const options=[...set].sort(()=>Math.random()-.5);const result=el('p','');const row=el('div','','pet-buttons');
  row.append(...options.map(o=>{const b=el('button',`$${o}`);b.type='button';b.addEventListener('click',()=>{for(const x of row.children)x.disabled=true;const ok=o===price;b.className=ok?'':'subtle';result.textContent=ok?'Richtig!':`Falsch, ${name} kostet $${price}.`;petReply(result,'price',ok);const next=el('button','Nächste Waffe','subtle');next.type='button';next.addEventListener('click',priceGame);result.append(' ',next);});return b;}));
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
document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>(gameArea=b.closest('.card').querySelector('.game-area'),{reaction:reactionGame,rps:rpsGame,quiz:quizGame,price:priceGame,aim:aimGame,memory:memoryGame,guess:guessGame})[b.dataset.game]()));
loadPet();setInterval(loadPet,5000);
if(['#spiele','#tecmon','#games','#clips','#wardogs','#quiz','#rundentipps','#chat','#fadenkreuz','#videos'].includes(location.hash))setTimeout(()=>document.querySelector(location.hash)?.scrollIntoView({behavior:'smooth'}),300);

/* Clip-Puffer: Einstellungen, Liste, Branding. Hochladen zu YouTube läuft auf der Webseite. */
const CLIP_GAMES=[['cs2','CS2'],['valorant','Valorant'],['dota2','Dota 2'],['deadlock','Deadlock'],['wardogs','Wardogs'],['lol','League of Legends'],['other','Anderes Spiel']];
let clipBuffer=null,clipSignature='';
function clipStatus(clip){return clip.status==='branding'?'Branding läuft …':clip.status==='error'?`Fehler: ${clip.error||'Branding fehlgeschlagen'}`:clip.branded?'Mit TecMon-Branding fertig · auf TecMon hochladen':'Rohclip';}
function showClipBuffer(buffer){
  clipBuffer=buffer;const on=buffer.recording;
  $('clips-heading').textContent=on?`Clip-Puffer läuft · letzte ${buffer.seconds} s`:buffer.enabled?'Clip-Puffer startet …':'Clip-Puffer ist aus';
  $('clips-toggle').textContent=buffer.enabled?'Ausschalten':'Einschalten';$('clips-toggle').disabled=!buffer.available;
  $('clips-save').disabled=!on;
  if(!buffer.available)$('clips-note').textContent='Der Clip-Puffer braucht den installierten Windows-Companion mit FFmpeg.';
  else if(buffer.error)$('clips-note').textContent=buffer.error;
  for(const key of ['seconds','fps','height'])if(document.activeElement!==$(`clips-${key}`))$(`clips-${key}`).value=String(buffer[key]);
  const audio=$('clips-audio');if(buffer.audioDevice&&![...audio.options].some(o=>o.value===buffer.audioDevice))audio.append(new Option(buffer.audioDevice,buffer.audioDevice));audio.value=buffer.audioDevice||'';
}
async function loadClips(){
  const {clips,buffer}=await api('/api/clips');showClipBuffer(buffer);
  const next=JSON.stringify(clips);if(next===clipSignature)return;clipSignature=next;
  const list=$('clips-list');list.replaceChildren();
  if(!clips.length){list.append(el('li','Noch keine Clips.','recent-empty'));return;}
  for(const clip of clips.slice(0,20)){
    const item=el('li','','recent-item');const text=el('div');text.append(el('b',clip.title||clip.id),el('small',`${timeLabel(clip.time)} · ${sizeLabel(clip.size)} · ${clipStatus(clip)}`));
    const actions=el('div','','actions');
    const play=el('button','▶ Abspielen');play.type='button';play.addEventListener('click',()=>api('/api/clips/open',{id:clip.id,branded:clip.branded}).catch(notice));
    const game=document.createElement('select');game.setAttribute('aria-label','Spiel');for(const [id,label] of CLIP_GAMES)game.append(new Option(label,id));game.value=clip.game||'other';
    const title=document.createElement('input');title.maxLength=80;title.placeholder='Titel, z. B. 1v3 Clutch';title.value=clip.title||'';title.setAttribute('aria-label','Titel');
    const brand=el('button',clip.branded?'Neu branden':'Branding erstellen','subtle');brand.type='button';brand.disabled=clip.status==='branding';
    brand.addEventListener('click',()=>api('/api/clips/brand',{id:clip.id,game:game.value,title:title.value}).then(()=>{clipSignature='';loadClips();}).catch(notice));
    const remove=el('button','Löschen','subtle');remove.type='button';remove.addEventListener('click',()=>{if(confirm('Clip und seine TecMon-Fassung löschen?'))api('/api/clips/remove',{id:clip.id}).then(()=>{clipSignature='';loadClips();}).catch(notice);});
    actions.append(play,game,title,brand,remove);item.append(text,actions);list.append(item);
  }
}
const clipSettings=body=>api('/api/clips/settings',body).then(r=>{showClipBuffer(r.buffer);if(r.message)$('notice').textContent=r.message;}).catch(notice);
$('clips-toggle').addEventListener('click',()=>clipSettings({enabled:!clipBuffer?.enabled}));
for(const key of ['seconds','fps','height'])$(`clips-${key}`).addEventListener('change',e=>clipSettings({[key]:Number(e.target.value)}));
$('clips-audio').addEventListener('change',e=>clipSettings({audioDevice:e.target.value}));
$('clips-devices').addEventListener('click',()=>api('/api/clips/devices').then(({devices})=>{const audio=$('clips-audio'),current=audio.value;audio.replaceChildren(new Option('ohne Ton',''));for(const d of devices)audio.append(new Option(d,d));audio.value=current;if(!devices.length)$('notice').textContent='Keine Tonquelle gefunden. In Windows „Stereomix“ aktivieren.';}).catch(notice));
$('clips-save').addEventListener('click',()=>api('/api/clips/save',{}).then(r=>{$('notice').textContent=r.message;clipSignature='';loadClips();}).catch(notice));
$('clips-folder').addEventListener('click',()=>api('/api/clips/folder',{}).catch(notice));
loadClips().catch(()=>{});setInterval(()=>{if(!restarting)loadClips().catch(()=>{});},4000);

/* Highlight-Video nach dem Match (seit 0.48.5 standardmäßig an). */
let autoState=null;
const AUTO_STATUS={waiting:'Wartet, bis CS2 geschlossen ist. Danach lädt TecMon die Demo.',downloading:'Lade die Demo deines letzten Matches …',ready:'Demo bereit. Die TecMon-Seite erstellt das Video.',done:'Aufnahme gestartet. Fortschritt auf der TecMon-Seite.'};
let backlogState=null;
/* „Stats hochladen?“ beim Schließen von CS2 (recent-matches-v1); nur mit installiertem Companion. */
function showBacklog(backlog){
  backlogState=backlog||null;
  $('stats-backlog').hidden=!backlog;
  if(!backlog)return;
  $('backlog-heading').textContent=backlog.ask?'Beim Schließen von CS2 nach Stats fragen: an':'Beim Schließen von CS2 nach Stats fragen: aus';
  $('backlog-toggle').textContent=backlog.ask?'Ausschalten':'Einschalten';
  const when=backlog.checkedAt?` Zuletzt bei Steam nachgesehen: ${new Date(backlog.checkedAt).toLocaleString('de-DE')}.`:'';
  $('backlog-open').hidden=!backlog.open||Boolean(backlog.offer);$('backlog-open').textContent=`Jetzt auswerten (${Math.min(backlog.open,10)})`;
  $('backlog-status').textContent=backlog.offer?'Antworte auf die Frage der Figur.':`${backlog.open?`${backlog.open} Match${backlog.open===1?'':'es'} noch nicht ausgewertet.`:'Keine offenen Matches bekannt.'}${when}${backlog.error?` ${backlog.error}`:''}`;
}
function showAuto(auto){
  autoState=auto;
  $('auto-heading').textContent=auto.enabled?'Highlight-Video nach dem Match ist an':'Highlight-Video nach dem Match ist aus';
  $('auto-toggle').textContent=auto.enabled?'Ausschalten':'Einschalten';
  const run=auto.run;
  $('auto-status').textContent=auto.offer?`Match auf ${auto.offer.map} vorbei: Antworte auf die Frage der Figur.`:run?(run.status==='error'?run.error:AUTO_STATUS[run.status]||''):'';
  $('auto-check').textContent=auto.enabled?autoCheck(auto):'';
}
/* Zeigt, ob CS2 überhaupt Daten schickt und was der Companion erkannt hat. */
function autoCheck(auto){
  if(auto.gsiAgo==null)return 'Noch keine Daten von CS2 empfangen. CS2 nach dem Einschalten einmal neu starten.';
  const ago=auto.gsiAgo<90?`vor ${auto.gsiAgo} s`:`vor ${Math.round(auto.gsiAgo/60)} min`;
  const s=auto.seen;let what='';
  if(s&&s.phase==='menu')what='Hauptmenü';
  else if(s)what=`${s.map||'Map'} · ${s.mode||'Modus unbekannt'} · ${s.phase||'?'}${s.demo?'':' (für diesen Modus gibt es keine Demo, daher keine Frage)'}`;
  const match=auto.match?` Erkanntes Match: ${auto.match.map}, ${auto.match.finished?'fertig gespielt':'läuft noch'}.`:'';
  return `Letzte Daten von CS2 ${ago}: ${what}.${match}`;
}
$('backlog-open').addEventListener('click',()=>api('/api/backlog/open',{}).then(r=>{showBacklog(r.backlog);if(r.message)$('notice').textContent=r.message;}).catch(notice));
$('backlog-toggle').addEventListener('click',()=>api('/api/backlog/settings',{ask:!backlogState?.ask}).then(r=>{showBacklog(r.backlog);if(r.message)$('notice').textContent=r.message;}).catch(notice));
$('auto-toggle').addEventListener('click',()=>api('/api/auto/settings',{enabled:!autoState?.enabled}).then(r=>{showAuto(r.auto);if(r.message)$('notice').textContent=r.message;}).catch(notice));
/*
 * Fenster der Figur (Linksklick): statt einer langen Liste Bereiche mit Reitern.
 * Sprünge aus dem Figurmenü (scrollIntoView auf eine Karte) öffnen den passenden Reiter.
 */
let skinState=null;
function showSkins(skins,managed){
  skinState=skins;
  $('skin-tausch').hidden=!managed;
  $('skins-heading').textContent=skins.enabled?'Skin-Tausch für Videos ist an':'Skin-Tausch für Videos ist aus';
  $('skins-toggle').textContent=skins.enabled?'Ausschalten':(skins.needsNotice?'Einschalten …':'Einschalten');
  $('skins-notice').textContent=skins.notice||'';
  $('skins-status').textContent=skins.enabled?'Aktiv. Skins, Messer und Handschuhe wählst du auf tecmon.online im Demo-Manager.':'';
}
$('skins-toggle').addEventListener('click',async()=>{
  const button=$('skins-toggle');const on=!skinState?.enabled;
  if(on&&skinState?.needsNotice&&$('skins-consent').hidden){$('skins-consent').hidden=false;return;}
  if(on&&skinState?.needsNotice&&!$('skins-accept').checked){notice({message:'Bitte zuerst den Hinweis bestätigen.'});return;}
  button.disabled=true;
  try{const r=await api('/api/skins/settings',{enabled:on,accept:on?skinState?.noticeVersion:undefined});$('skins-consent').hidden=true;showSkins(r.skins,true);if(r.message)$('notice').textContent=r.message;}
  catch(error){notice(error);}finally{button.disabled=false;}
});
/* Linksklick-Fenster und Companion-Seite im Browser: dieselben sechs Bereiche, Karten bleiben mit ihren Listenern erhalten. */
function panelHints(state){window.companionMenu?.status(state);}
(function desktopSections(){
  window.TecMonCockpit(document);
})();

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('skins-consent').hidden){$('skins-consent').hidden=true;$('skins-accept').checked=false;}});
/* Ansicht „Einfach“/„Erweitert“ (Nutzerwunsch 25.11.2026, desktop.json `ui`). „Einfach“ zeigt nur das Nötigste mit
   kurzen Erklärungen; alles mit data-expert erscheint erst in „Erweitert“. Neue Karten für Fortgeschrittene hier eintragen. */
const EXPERT_ONLY=['#advanced-toggle','#advanced-panel','#skin-tausch','#cfgs','#tips-options','#dota-tipps .tips-options','#wardogs .tips-options','#auto-note','#tips-note','#chat>p:first-of-type','.bridge-devices'];
const SIMPLE_HINTS=[
  ['.activity-summary','Hier siehst du, was TecMon gerade macht, zum Beispiel eine Demo laden oder ein Video aufnehmen.'],
  ['#auto-highlights','Nach deinem Match fragt TecMon, ob ein Video mit deinen besten Szenen entstehen soll. Du klickst nur „Ja“.'],
  ['#stats-backlog','Wenn du CS2 schließt, fragt TecMon, ob deine neuen Matches auf TecMon.online ausgewertet werden sollen.'],
  ['#rundentipps','In der Kaufzeit gibt dir TecMon kurze Tipps, zum Beispiel was du dir leisten kannst. TecMon liest nur deine eigenen Werte aus der offiziellen CS2-Schnittstelle (VAC-sicher).'],
  ['#chat','Übersetzt den Chat im Spiel in deine Sprache. Läuft offline auf deinem PC. Einmal einrichten: Anleitung unten aufklappen.'],
  ['#dota-tipps','Kurze Tipps in Pausen und nach deinem Tod in Dota 2.'],
  ['#videos','Hier landen deine fertigen Videos.'],
];
function markExpert(){
  for(const selector of EXPERT_ONLY)for(const node of document.querySelectorAll(selector)){node.dataset.expert='';if(node.matches('.card'))node.closest('.card-fold')?.setAttribute('data-expert','');}
  /* Kategorien im Fenster, in denen nur Karten für Fortgeschrittene stecken, verschwinden in „Einfach“ ganz. */
  for(const cat of document.querySelectorAll('.panel-cat')){
    const cards=[...cat.querySelectorAll(':scope>.card,:scope>.card-fold>.card')];
    if(cards.length&&cards.every(card=>card.hasAttribute('data-expert')))cat.dataset.expert='';
  }
  for(const [selector,text] of SIMPLE_HINTS){
    const card=document.querySelector(selector);if(!card||card.querySelector(':scope>.explain'))continue;
    const hint=el('p',text,'explain simple-only');
    const head=card.querySelector(':scope>.section-head')||card.querySelector(':scope>div:not(.status-orb)>h2')?.parentElement?.querySelector('h2');
    if(head)head.after(hint);else card.prepend(hint);
  }
}
markExpert();
function applyUi(mode){
  const simple=mode==='simple';
  document.body.classList.toggle('ui-simple',simple);
  for(const b of document.querySelectorAll('#ui-mode [data-ui]'))b.setAttribute('aria-checked',String(b.dataset.ui===(simple?'simple':'advanced')));
  if(simple&&!$('advanced-panel').hidden)advanced(false);
  try{localStorage.setItem('tecmon-ui',simple?'simple':'advanced');}catch{}
}
try{if(localStorage.getItem('tecmon-ui')==='simple')applyUi('simple');}catch{}
for(const b of document.querySelectorAll('#ui-mode [data-ui]'))b.addEventListener('click',()=>{applyUi(b.dataset.ui);figureSettings({ui:b.dataset.ui});});

/* Video-Aufnahme nachinstallieren (Setup „Nur Stats und Tipps“). */
function showVideoTools(tools){
  const box=$('video-tools');
  if(!tools){box.hidden=true;return;}
  const missing=!tools.installed?.hlae||!tools.installed?.ffmpeg;
  box.hidden=!missing&&!tools.busy&&!tools.message;
  $('video-tools-install').hidden=!missing;$('video-tools-install').disabled=!!tools.busy;
  $('video-tools-install').textContent=tools.busy?'Wird installiert …':tools.error?'Erneut versuchen':'Video-Aufnahme nachinstallieren';
  $('video-tools-note').textContent=missing?'Für Highlight-Videos braucht TecMon zwei kostenlose Programme (HLAE und FFmpeg). Sie kommen direkt vom Hersteller und werden vor dem Start geprüft. Stats, Tipps und Chat-Übersetzer gehen auch ohne.':'HLAE und FFmpeg sind installiert. TecMon kann Highlight-Videos aufnehmen.';
  $('video-tools-status').textContent=tools.error?`Hat nicht geklappt: ${tools.error}`:tools.message||'';
}
$('video-tools-install').addEventListener('click',async()=>{$('video-tools-install').disabled=true;try{await api('/api/video-tools/install',{});await refresh();}catch(error){notice(error);$('video-tools-install').disabled=false;}});

/* Rundgang für Einsteiger: beim ersten Start nach dem Setup (desktop.json `tutorial` < TOUR_VERSION), sonst über
   „Rundgang starten“ in den Einstellungen oder das Figurmenü (#tutorial). Zeigt nur, ändert nichts. */
const TOUR_VERSION=1; // muss zu TUTORIAL_VERSION in desktop-settings.mjs passen
let tourOffered=false,tour=null;
const TOUR=[
  {title:'Hi, ich bin TecMon!',text:'Ich zeige dir in einer Minute, wo du was findest. Du kannst jederzeit beenden und den Rundgang später unter „Einstellungen“ wieder starten.'},
  {title:'Ich wohne auf deinem Desktop',text:'Die kleine Figur am Bildschirmrand bin ich. Klick mich an, dann geht dieses Fenster auf oder zu.',mouse:true},
  {sel:'.connection-summary',title:'Mit TecMon.online verbinden',text:'Auf tecmon.online einmal „Companion verbinden“ klicken und den Code hier bestätigen. Danach startest du Downloads und Videos bequem auf der Webseite.'},
  {sel:'.activity-summary',title:'Was gerade passiert',text:'Hier siehst du, ob TecMon gerade eine Demo lädt oder ein Video aufnimmt.'},
  {sel:'#auto-highlights',title:'Highlights nach dem Match',text:'Nach jedem Match fragt TecMon, ob ein Video mit deinen besten Szenen entstehen soll. Ein Klick auf „Ja“ reicht.'},
  {sel:'#rundentipps',title:'Tipps in der Kaufzeit',text:'Kurze Tipps, während du einkaufst. TecMon liest nur deine eigenen Werte aus der offiziellen CS2-Schnittstelle, VAC-sicher.'},
  {sel:'#chat',title:'Chat-Übersetzer',text:'Übersetzt den Chat im Spiel in deine Sprache, offline auf deinem PC. Die kurze Einrichtung steht in dieser Karte.'},
  {sel:'#videos',title:'Deine Videos',text:'Fertige Videos findest du hier. „Ordner öffnen“ zeigt sie auf deinem PC.'},
  {sel:'#figur',title:'Einstellungen',text:'Hier wählst du „Einfach“ oder „Erweitert“. In „Erweitert“ stellst du jede Option einzeln ein. Den Rundgang startest du hier jederzeit neu.'},
  {title:'Fertig!',text:'Öffne jetzt TecMon.online, wähle dein Match und deine Szenen. Den Rest erledige ich auf diesem PC.',finish:true},
];
function tourVisible(step){
  if(!step.sel)return true;
  const target=document.querySelector(step.sel);
  if(!target||target.closest('[hidden]'))return false;
  if(document.body.classList.contains('ui-simple')&&target.closest('[data-expert]'))return false;
  return getComputedStyle(target).display!=='none';
}
function startTutorial(){
  if(tour)return;
  const steps=TOUR.filter(tourVisible);
  const root=el('div','','tour');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','tour-title');
  const hole=el('div','','tour-hole');const card=el('div','','tour-card');
  const avatar=el('img');avatar.src='/desktop-avatar.png';avatar.alt='';avatar.width=56;avatar.height=56;
  const body=el('div','','tour-body');const count=el('span','','eyebrow gold');const title=el('h2');title.id='tour-title';const text=el('p');
  const mouse=el('div','','tour-mouse');mouse.append(el('span','Linksklick: Fenster auf und zu'),el('span','Rechtsklick: Schnellmenü mit den wichtigsten Schaltern'));
  const actions=el('div','','tour-actions');const skip=el('button','Beenden','subtle');const back=el('button','Zurück','subtle');const next=el('button','Weiter');
  for(const b of [skip,back,next])b.type='button';
  actions.append(skip,back,next);body.append(count,title,text,mouse,actions);card.append(avatar,body);root.append(hole,card);document.body.append(root);
  let index=0;const before=document.activeElement;
  const place=()=>{
    const step=steps[index],target=step.sel&&document.querySelector(step.sel);
    hole.hidden=!target;root.classList.toggle('tour-center',!target);
    const vw=innerWidth,vh=innerHeight;card.style.top=card.style.left='';
    if(!target){card.style.left=`${Math.max(12,(vw-card.offsetWidth)/2)}px`;card.style.top=`${Math.max(12,(vh-card.offsetHeight)/2)}px`;return;}
    const r=target.getBoundingClientRect(),pad=6;
    const top=Math.max(4,r.top-pad),bottom=Math.min(vh-4,r.bottom+pad);
    Object.assign(hole.style,{left:`${Math.max(4,r.left-pad)}px`,top:`${top}px`,width:`${Math.min(vw-8,r.width+2*pad)}px`,height:`${Math.max(24,bottom-top)}px`});
    const h=card.offsetHeight,w=card.offsetWidth;
    const y=vh-bottom>=h+16?bottom+10:top>=h+16?top-h-10:vh-h-12;
    card.style.top=`${Math.max(12,y)}px`;card.style.left=`${Math.min(Math.max(12,r.left),Math.max(12,vw-w-12))}px`;
  };
  const show=()=>{
    const step=steps[index];
    count.textContent=`RUNDGANG · ${index+1}/${steps.length}`;title.textContent=step.title;text.textContent=step.text;
    mouse.hidden=!step.mouse;back.hidden=index===0;skip.hidden=!!step.finish;
    next.textContent=step.finish?(document.body.classList.contains('desktop-panel')?'Los geht’s':'TecMon.online öffnen'):index===0?'Rundgang starten':'Weiter';
    const target=step.sel&&document.querySelector(step.sel);
    /* scrollIntoView klappt im Fenster die passende Kategorie auf (siehe desktopSections). */
    if(target)target.scrollIntoView({block:'center'});
    requestAnimationFrame(()=>requestAnimationFrame(place));next.focus({preventScroll:true});
  };
  const close=()=>{
    if(!tour)return;removeEventListener('resize',place);document.removeEventListener('keydown',keys,true);root.remove();tour=null;
    if(latestState?.desktop?.tutorial!==TOUR_VERSION)figureSettings({tutorial:TOUR_VERSION});
    if(before&&before.focus)before.focus({preventScroll:true});
  };
  const keys=e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(e.key==='ArrowRight'&&index<steps.length-1){index++;show();}
    else if(e.key==='ArrowLeft'&&index>0){index--;show();}
    else if(e.key==='Tab'){const list=[...actions.querySelectorAll('button:not([hidden])')];const at=list.indexOf(document.activeElement);e.preventDefault();list[(at+(e.shiftKey?-1:1)+list.length)%list.length].focus();}
  };
  next.addEventListener('click',()=>{if(steps[index].finish){if(!document.body.classList.contains('desktop-panel'))window.open('https://tecmon.online/games/cs2/replay','_blank','noreferrer');close();return;}index++;show();});
  back.addEventListener('click',()=>{if(index>0){index--;show();}});
  skip.addEventListener('click',close);
  addEventListener('resize',place);document.addEventListener('keydown',keys,true);
  tour={close};show();
}
window.startTutorial=startTutorial;
$('tutorial-start').addEventListener('click',startTutorial);
if(location.hash==='#tutorial'){tourOffered=true;setTimeout(startTutorial,300);}

/* Wardogs: Scoreboard-Foto (scoreboard.mjs). Werte nur der eigenen Zeile, Differenz zum vorigen Foto. */
const WARDOGS_LABELS={kills:'Kills',deaths:'Tode',assists:'Assists',revives:'Wiederbelebungen',score:'Punkte',money:'Geld',cash:'Kontostand'};
let wardogsState=null,wardogsSignature='';
function wardogsText(values,previous){
  return Object.keys(WARDOGS_LABELS).filter(k=>values[k]!==undefined).map(k=>{
    const diff=previous&&previous[k]!==undefined?values[k]-previous[k]:null;
    return `${WARDOGS_LABELS[k]} ${values[k].toLocaleString('de-DE')}${diff?` (${diff>0?'+':''}${diff.toLocaleString('de-DE')})`:''}`;
  }).join(' · ');
}
async function loadWardogs(){
  if($('wardogs').hidden)return;
  const {scoreboard,snapshots}=await api('/api/wardogs/scoreboard');wardogsState=scoreboard;
  $('wardogs-heading').textContent=scoreboard.enabled?`Scoreboard-Foto an · ${scoreboard.hotkey}`:'Scoreboard-Foto ist aus';
  $('wardogs-toggle').textContent=scoreboard.enabled?'Ausschalten':'Einschalten';
  $('wardogs-capture').disabled=!scoreboard.enabled||!scoreboard.available||scoreboard.busy;
  if(document.activeElement!==$('wardogs-name'))$('wardogs-name').value=scoreboard.playerName||'';
  if(!scoreboard.available)$('wardogs-note').dataset.hint='Braucht den installierten Windows-Companion.';
  const signature=JSON.stringify(snapshots.map(s=>s.time));if(signature===wardogsSignature)return;wardogsSignature=signature;
  const list=$('wardogs-list');list.replaceChildren();
  if(!snapshots.length){list.append(el('li','Noch keine Werte.','recent-empty'));return;}
  snapshots.slice(0,20).forEach((shot,i)=>{
    const row=el('li','');const previous=snapshots[i+1];
    const sameMatch=previous&&shot.time-previous.time<3*3600*1000&&(shot.values.kills??0)>=(previous.values.kills??0);
    row.append(el('b',new Date(shot.time).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})));
    row.append(el('span',' '+wardogsText(shot.values,sameMatch?previous.values:null)));
    if(shot.moneySource==='hud')row.append(el('small',' · Geld aus dem HUD'));
    const remove=el('button','Löschen','subtle');remove.type='button';
    remove.addEventListener('click',()=>api('/api/wardogs/remove',{time:shot.time}).then(()=>{wardogsSignature='';loadWardogs();}).catch(notice));
    row.append(remove);list.append(row);
  });
}
const wardogsSettings=body=>api('/api/wardogs/settings',body).then(r=>{if(r.message)$('notice').textContent=r.message;wardogsSignature='';return loadWardogs();}).catch(notice);
$('wardogs-toggle').addEventListener('click',()=>wardogsSettings({enabled:!wardogsState?.enabled,playerName:$('wardogs-name').value}));
$('wardogs-save').addEventListener('click',()=>wardogsSettings({playerName:$('wardogs-name').value}));
$('wardogs-capture').addEventListener('click',()=>{$('notice').textContent='Scoreboard-Foto läuft: Wardogs nach vorn holen und Tab halten …';api('/api/wardogs/capture',{}).then(r=>{$('notice').textContent=r.message;wardogsSignature='';loadWardogs();}).catch(notice);});
setInterval(()=>{if(!restarting)loadWardogs().catch(()=>{});},5000);setTimeout(()=>loadWardogs().catch(()=>{}),800);

/* CS2-Chat-Übersetzer (chat-translate.mjs): liest console.log, übersetzt lokal, Antwort per eigener cfg und Zwischenablage. */
let chatState=null,chatSignature='',chatOptions='';
const CHAT_STATUS={off:'',missing:'Wartet auf CS2: console.log fehlt. -condebug gehört in Steam unter Eigenschaften → Startoptionen, nicht in die CS2-Konsole.',stale:'console.log ist älter als 10 Minuten. Läuft CS2 mit -condebug?',active:'Liest mit.','no-cs2':'CS2 wurde auf diesem PC nicht gefunden.'};
const CHAT_ENGINE={download:' · Modell wird geladen …',loading:' · Übersetzung startet …',error:' · Übersetzung fehlgeschlagen'};
function chatLabel(m){return m.channel==='team'?(m.team==='ct'?'[CT]':m.team==='t'?'[T]':'[Team]'):m.channel==='spec'?'[Zuschauer]':'[Alle]';}
function fillSelect(select,entries,value){if(!select)return;select.replaceChildren(...entries.map(([v,t])=>{const o=el('option',t);o.value=v;return o;}));select.value=value;}
async function loadChat(){
  const card=$('chat');if(!card||card.hidden)return;
  const {chat,messages}=await api('/api/chat');chatState=chat;
  $('chat-heading').textContent=chat.enabled?(chat.condebug==='active'?'Chat-Übersetzer liest mit':'Chat-Übersetzer an · wartet auf CS2'):'Chat-Übersetzer ist aus';
  const toggle=$('chat-toggle');toggle.textContent=chat.enabled?'Ausschalten':'Einschalten';toggle.className=chat.enabled?'subtle':'';toggle.disabled=!chat.enabled&&!chat.available;
  $('chat-status').textContent=(CHAT_STATUS[chat.condebug]||'')+(chat.enabled?(CHAT_ENGINE[chat.engine]||''):'')+(chat.engineError?` (${chat.engineError})`:'');
  if(chat.condebug==='missing')$('chat-setup').open=true;
  $('chat-setup-exec').textContent=chat.setupExec;
  const options=JSON.stringify([chat.languages,chat.language,chat.keys]);
  if(options!==chatOptions&&!['chat-language','chat-key-all','chat-key-team','chat-reply-to'].includes(document.activeElement?.id)){
    chatOptions=options;const langs=Object.entries(chat.languages).sort((a,b)=>a[1].localeCompare(b[1],'de'));const keys=['F5','F6','F7','F8','F9','F10','F11'].map(k=>[k,k]);
    fillSelect($('chat-language'),langs,chat.language);fillSelect($('chat-key-all'),keys,chat.keys.all);fillSelect($('chat-key-team'),keys,chat.keys.team);
    const to=$('chat-reply-to').value||'auto';fillSelect($('chat-reply-to'),[['auto','Sprache der letzten Nachricht'],...langs],to);
  }
  $('chat-english').checked=chat.assumeEnglish;if($('chat-bubble'))$('chat-bubble').checked=Boolean(chat.bubble);
  if(document.activeElement!==$('chat-launch-options'))$('chat-launch-options').value=chat.launchOptions||'';
  const autoOption=$('chat-reply-to').querySelector('option[value="auto"]');if(autoOption)autoOption.textContent=`Sprache der letzten Nachricht (${chat.languages[chat.replyLanguage]||chat.replyLanguage})`;
  $('chat-overlay-status').textContent=chat.overlay?'An':'Aus';$('chat-overlay-status').classList.toggle('on',chat.overlay);
  $('chat-notice').replaceChildren(...chat.notice.map(t=>el('li',t)));
  $('chat-overlay-toggle').textContent=chat.overlay?'Overlay ausschalten':chat.accepted?'Overlay einschalten':'Overlay einschalten …';
  if($('chat-look')){const look=chat.look||{};$('chat-look').hidden=!(chat.enabled&&chat.overlay);
    const sel=$('chat-look-color');const names={weiss:'Weiß',gold:'Gold',lila:'Lila',gruen:'Grün',cyan:'Cyan',rot:'Rot'};
    if(!sel.options.length)for(const key of Object.keys(chat.colors||names)){const o=document.createElement('option');o.value=key;o.textContent=names[key]||key;sel.append(o);}
    for(const key of ['width','lines','font','background','seconds']){const el=$('chat-look-'+key);if(el&&document.activeElement!==el&&look[key]!=null)el.value=look[key];}
    if(document.activeElement!==sel&&look.color)sel.value=look.color;}
  if($('chat-window-wrap')){$('chat-window-wrap').hidden=!(chat.enabled&&chat.overlay);$('chat-window').checked=Boolean(chat.window);}
  $('chat-overlay-move').hidden=!(chat.enabled&&chat.overlay);$('chat-overlay-reset').hidden=!(chat.enabled&&chat.overlay);
  const hint=!chat.enabled?'':!chat.overlay?'Das Overlay ist aus: Übersetzungen erscheinen dann nur hier in der Liste. Schalte es ein, um sie im Spiel über dem Chat zu sehen.':chat.windowMode==='fullscreen'?'CS2 läuft im echten Vollbild: dort kann kein Fenster darüber liegen. Stelle in CS2 unter Video den Anzeigemodus auf „Vollbild-Fenstermodus“.':chat.windowMode==='windowed'?'CS2 läuft im Fenster: das Overlay erscheint nur im Vollbild-Fenstermodus.':'';
  $('chat-overlay-hint').textContent=hint;$('chat-overlay-hint').hidden=!hint;
  const next=JSON.stringify(messages.map(m=>[m.id,m.status]));if(next===chatSignature)return;chatSignature=next;
  const list=$('chat-list');list.replaceChildren();
  if(!messages.length){list.append(el('li',chat.enabled?'Noch keine Chatnachrichten.':'Einschalten, dann erscheinen hier die Chats aus CS2.','recent-empty'));return;}
  for(const m of messages){
    const row=el('li','',m.channel==='team'?'chat-team':'');
    row.append(el('b',`${chatLabel(m)} ${m.name}${m.dead?' ✝':''}${m.lang?` (${m.lang.toUpperCase()})`:''}: `));
    const main=m.status==='done'?m.translated:m.text;row.append(el('span',main));
    if(m.status==='done')row.append(el('small',`Original: ${m.text}`));
    else if(m.status==='pending')row.append(el('small','wird übersetzt …'));
    else if(m.status==='unsupported')row.append(el('small','Diese Sprache kann TecMon noch nicht übersetzen.'));
    else if(m.status==='error')row.append(el('small',m.error||'Übersetzung fehlgeschlagen.'));
    list.append(row);
  }
}
const chatSettings=body=>api('/api/chat/settings',body).then(r=>{if(r.message)$('notice').textContent=r.message;chatOptions='';chatSignature='';return loadChat();}).catch(notice);
$('chat-toggle')?.addEventListener('click',()=>{const on=!chatState?.enabled;chatSettings({enabled:on}).then(()=>{if(on&&chatState&&!chatState.overlay&&!chatState.accepted)$('chat-consent').hidden=false;});});
$('chat-language')?.addEventListener('change',e=>chatSettings({language:e.target.value}));
$('chat-key-all')?.addEventListener('change',e=>chatSettings({keys:{all:e.target.value,team:$('chat-key-team').value}}));
$('chat-key-team')?.addEventListener('change',e=>chatSettings({keys:{all:$('chat-key-all').value,team:e.target.value}}));
$('chat-english')?.addEventListener('change',e=>chatSettings({assumeEnglish:e.target.checked}));
$('chat-bubble')?.addEventListener('change',e=>chatSettings({bubble:e.target.checked}));
$('chat-window')?.addEventListener('change',e=>chatSettings({window:e.target.checked}));
for(const key of ['width','lines','font','background','seconds','color'])$('chat-look-'+key)?.addEventListener('change',e=>chatSettings({look:{[key]:key==='color'?e.target.value:Number(e.target.value)}}));
$('chat-launch-save')?.addEventListener('click',()=>chatSettings({launchOptions:$('chat-launch-options').value}));
$('chat-launch')?.addEventListener('click',()=>api('/api/chat/settings',{launchOptions:$('chat-launch-options').value}).then(()=>api('/api/chat/launch',{})).then(r=>{$('notice').textContent=r.message;}).catch(notice));
$('chat-copy-option')?.addEventListener('click',()=>navigator.clipboard.writeText(chatState?.launchOptions||'+cl_input_enable_raw_keyboard true -condebug').then(()=>{$('notice').textContent='Startoptionen kopiert. In Steam: Rechtsklick auf CS2 → Eigenschaften → Startoptionen einfügen (nicht in die CS2-Konsole).';}).catch(notice));
$('chat-overlay-toggle')?.addEventListener('click',async()=>{
  if(!chatState)return;const button=$('chat-overlay-toggle');
  if(!chatState.overlay&&!chatState.accepted){
    const box=$('chat-consent');
    if(box.hidden){box.hidden=false;button.textContent='Zustimmen und einschalten';$('chat-accept').focus();return;}
    if(!$('chat-accept').checked){notice({message:'Bitte erst den Hinweis bestätigen.'});$('chat-accept').focus();return;}
  }
  button.disabled=true;
  try{await chatSettings({overlay:!chatState.overlay,accept:chatState.noticeVersion});$('chat-consent').hidden=true;}finally{button.disabled=false;}
});
$('chat-overlay-move')?.addEventListener('click',()=>api('/api/chat/overlay-move',{}).then(r=>{$('notice').textContent=r.message;}).catch(notice));
$('chat-overlay-reset')?.addEventListener('click',()=>api('/api/desktop/settings',{chatPos:null}).then(()=>{$('notice').textContent='Chat-Overlay steht wieder ganz unten mittig.';}).catch(notice));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('chat-consent')&&!$('chat-consent').hidden){$('chat-consent').hidden=true;$('chat-accept').checked=false;loadChat().catch(()=>{});}});
$('chat-reply')?.addEventListener('submit',async e=>{
  e.preventDefault();const button=$('chat-reply-send');button.disabled=true;const out=$('chat-reply-out');
  try{
    const r=await api('/api/chat/reply',{text:$('chat-reply-text').value,to:$('chat-reply-to').value||'auto',team:$('chat-reply-team').checked});
    out.hidden=false;out.textContent=r.reply.text;
    let copied=false;try{await navigator.clipboard.writeText(r.reply.text);copied=true;}catch{}
    $('notice').textContent=r.reply.written?`Bereit: in CS2 ${r.reply.key} drücken${copied?' oder mit Strg+V in den Chat einfügen':''}.`:copied?'Übersetzt und in die Zwischenablage kopiert.':'Übersetzt.';
  }catch(error){notice(error);}finally{button.disabled=false;}
});
$('chat-reply-text')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chat-reply').requestSubmit();}});
setInterval(()=>{if(!restarting)loadChat().catch(()=>{});},1500);setTimeout(()=>loadChat().catch(()=>{}),900);

function renderExternalUpdates(state) {
  $('external-updates').hidden=!state;
  if(!state)return;
  $('external-auto').checked=state.auto;
  $('external-status').textContent=state.auto||state.running?state.message:'Automatische Hersteller-Updates sind ausgeschaltet. Manuelle Prüfung bleibt möglich.';
  $('external-check').disabled=state.running;
  $('external-checked').textContent=state.checkedAt?`Zuletzt geprüft: ${new Date(state.checkedAt).toLocaleString('de-DE')}`:'Noch kein vollständiger Prüflauf.';
  const labels={current:'Aktuell',updated:'Aktualisiert',pending:'Wartet',updating:'Wird aktualisiert',error:'Fehler – neuer Versuch folgt','not-installed':'Nicht installiert'};
  $('external-tools').replaceChildren(...state.tools.map(tool=>{const row=document.createElement('p');row.textContent=`${tool.label}: ${tool.installed||'nicht erkannt'}${tool.latest?` → ${tool.latest}`:''} · ${labels[tool.status]||tool.status}${tool.message?` · ${tool.message}`:''}`;return row;}));
  $('external-managed').replaceChildren(...state.managed.map(tool=>{const row=document.createElement('p');row.textContent=`${tool.label}: ${tool.channel}`;return row;}));
}
$('external-auto').addEventListener('change',async()=>{const box=$('external-auto');box.disabled=true;try{await api('/api/update/external/auto',{auto:box.checked});await refresh();}catch(error){notice(error);box.checked=!box.checked;}finally{box.disabled=false;}});
$('external-check').addEventListener('click',async()=>{try{await api('/api/update/external/check',{});await refresh();}catch(error){notice(error);}});
