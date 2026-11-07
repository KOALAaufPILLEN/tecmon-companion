const token = document.querySelector('meta[name="tecmon-token"]').content;
const $ = id => document.getElementById(id);
const drafts = new Map();
let signature = '';
let populated = false;
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
const statuses = { ready: 'BEREIT', analyzing: 'DEMO WIRD GEPRÜFT', recording: 'AUFNAHME LÄUFT', done: 'FERTIG', error: 'FEHLER' };
async function refresh() {
  const state = await api('/api/state');
  databaseState(state.postgres);
  $('csdm-open').hidden = !state.managed;
  $('database-port').disabled = state.managed;
  if (state.managed && state.postgres.ready) $('database-note').textContent = `TecMon-Datenbank automatisch eingerichtet und unter 127.0.0.1:${state.postgres.port} erreichbar. Alle Tool-Pfade sind hinterlegt.`;
  $('cs2-status').textContent = state.detected.cs2 ? 'CS2 erkannt' : 'CS2 nicht gefunden';
  $('engine-status').textContent = state.detected.csdm ? 'CS Demo Manager erkannt' : 'CS Demo Manager fehlt';
  if (!populated) { $('engine').value = state.detected.csdm; $('database-port').value = state.postgres.port; populated = true; }
  const next = JSON.stringify(state.jobs.map(j => [j.id, j.status, j.log, j.files]));
  if (signature === next) return; signature = next;
  if (!state.jobs.length) return;
  const container = $('jobs'); container.replaceChildren();
  for (const job of state.jobs) {
    const card = el('article', '', 'job'); const head = el('div', '', 'jobhead');
    head.append(el('h3', job.job.title), el('span', statuses[job.status], 'badge')); card.append(head);
    card.append(el('p', `${job.job.map} · ${job.job.sequences.length} Szenen · ${Math.round(job.job.sequences.reduce((n,s) => n+s.endTick-s.startTick,0)/job.job.tickRate)} Sekunden`));
    card.append(el('div', [...new Set(job.job.sequences.map(s => s.playerName))].join(' / '), 'sequence'));
    if (job.status === 'ready') {
      const draft = drafts.get(job.id) || { demo: '', confirm: false }; drafts.set(job.id, draft);
      const label = el('label', 'Originaldemo · vollständiger Dateipfad (.dem)');
      const input = el('input'); input.placeholder = 'C:\\…\\match.dem'; input.value = draft.demo; input.spellcheck = false; input.addEventListener('input', () => { draft.demo = input.value; }); label.append(input); card.append(label);
      const browse = el('button', 'Demo wählen …'); browse.className='subtle'; browse.addEventListener('click', async () => { try { const selected=await api('/api/pick',{kind:'demo'}); if(selected.path) { draft.demo=selected.path; input.value=selected.path; } } catch(error) { notice(error); } }); card.append(browse);
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
  try { const file = event.target.files[0]; if (!file) return; if (file.size > 65536) throw new Error('Auftrag zu groß.'); await api('/api/import', JSON.parse(await file.text())); $('notice').textContent = ''; await refresh(); } catch (err) { notice(err); } finally { event.target.value = ''; }
});
$('shutdown').addEventListener('click', async () => { try { await api('/api/shutdown', {}); clearInterval(timer); $('notice').textContent = 'Companion beendet. Du kannst dieses Fenster schließen.'; } catch (err) { notice(err); } });
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
$('csdm-open').addEventListener('click', async () => { try { const result=await api('/api/csdm/open',{}); $('notice').textContent=result.message; } catch(error) { notice(error); } });
const timer = setInterval(() => refresh().catch(notice), 2000);
refresh().catch(notice);
