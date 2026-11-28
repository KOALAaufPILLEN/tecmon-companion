import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

function setup(hash=''){
  const {window,document}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
  const originals=[...document.querySelectorAll('button,input,select,textarea')];
  let changes=0;document.getElementById('share-codes').addEventListener('input',()=>changes++);
  const storage=new Map();
  const context=vm.createContext({window,document,Element:window.Element,location:{hash},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(readFileSync(new URL('../public/menu.js',import.meta.url),'utf8'),context);
  const menu=window.TecMonCockpit(document);
  return {window,document,menu,originals,changes:()=>changes};
}
test('Cockpit erhält jedes bestehende Eingabefeld und dessen Listener genau einmal',()=>{
  const {window,document,originals,changes}=setup();
  for(const node of originals){assert.ok(document.contains(node),node.id||node.textContent);if(node.id)assert.equal(document.querySelectorAll('[id="'+node.id+'"]').length,1,node.id);}
  assert.deepEqual([...document.querySelectorAll('.cockpit-nav button')].map(b=>b.textContent),['Start','Spiele','Videos','Overlays','TecMon','Einstellungen']);
  assert.ok(document.querySelector('#external-updates').closest('[data-menu-page="start"]'));
  assert.ok(document.querySelector('#import').closest('[data-menu-page="videos"]'));
  assert.ok(document.querySelector('#share-codes').closest('[data-menu-page="videos"]'));
  document.getElementById('share-codes').dispatchEvent(new window.Event('input'));
  assert.equal(changes(),1,'Vor dem Umbau gebundener Listener geht verloren');
});
test('Spielauswahl trennt Optionen und Paketverwaltung, einschließlich weiterer Pakete',()=>{
  const {window,document,menu}=setup();menu.select('games');
  for(const id of ['cs2','dota2','wardogs','deadlock']){const row=document.createElement('li');row.dataset.package=id;document.getElementById('game-library').append(row);}
  document.querySelector('[data-pick-game="dota2"]').dispatchEvent(new window.Event('click'));
  assert.equal(document.querySelector('[data-menu-game="cs2"]').hidden,true);
  assert.equal(document.querySelector('[data-menu-game="dota2"]').hidden,false);
  assert.equal(document.querySelector('[data-package="cs2"]').hidden,true);
  assert.equal(document.querySelector('[data-package="dota2"]').hidden,false);
  document.querySelector('[data-pick-game="other"]').dispatchEvent(new window.Event('click'));
  assert.equal(document.querySelector('[data-package="deadlock"]').hidden,false);
  assert.equal(document.querySelector('[data-package="dota2"]').hidden,true);
});
test('Direkte Menüsprünge öffnen Zielseite und Spiel ohne vorhandene Eingaben zu verlieren',()=>{
  const {document,menu}=setup('#fadenkreuz');
  assert.equal(document.querySelector('[data-menu-page="overlays"]').hidden,false);
  const input=document.getElementById('share-codes');input.value='unfertiger Entwurf';
  menu.openAdvanced('demos');
  assert.equal(document.querySelector('[data-menu-page="videos"]').hidden,false);
  assert.equal(input.value,'unfertiger Entwurf');
  menu.reveal(document.getElementById('dota-tipps'));
  assert.equal(document.querySelector('[data-menu-page="games"]').hidden,false);
  assert.equal(document.querySelector('[data-menu-game="dota2"]').hidden,false);
  assert.equal(document.querySelector('[data-pick-game="dota2"]').getAttribute('aria-pressed'),'true');
});

test('Erweitert-Karten stehen immer am Ende ihres Bereichs, Titel sind feste Namen mit Zustand rechts',()=>{
  const {document}=setup();
  for(const page of document.querySelectorAll('[data-menu-page]')){
    const folds=[...page.querySelectorAll(':scope>.cockpit-fold')];const first=folds.findIndex(f=>f.hasAttribute('data-expert'));
    if(first<0)continue;
    assert.ok(folds.slice(first).every(f=>f.hasAttribute('data-expert')),page.dataset.menuPage+': Erweitert mitten im Bereich');
    assert.ok(page.querySelector(':scope>.cockpit-divider[data-expert]'),page.dataset.menuPage+': Trenner fehlt');
  }
  const clips=document.getElementById('clips').closest('.cockpit-fold');
  assert.equal(clips.querySelector('.fold-name').textContent,'Clip-Puffer');
  assert.equal(clips.querySelector('.fold-state').textContent,'aus');
  assert.equal(clips.hasAttribute('data-expert'),false,'Clip-Puffer gehört in Einfach');
});
test('Alte gespeicherte Bereiche landen auf den neuen sechs Bereichen',()=>{
  const {window,document}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
  const storage=new Map([['tecmon-cockpit',JSON.stringify({page:'system',game:'dota2'})]]);
  const context=vm.createContext({window,document,Element:window.Element,location:{hash:''},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(readFileSync(new URL('../public/menu.js',import.meta.url),'utf8'),context);
  const menu=window.TecMonCockpit(document);
  assert.equal(document.querySelector('[data-menu-page="start"]').hidden,false);
  menu.select('gallery');
  assert.equal(document.querySelector('[data-menu-page="videos"]').hidden,false);
});

test('CS2 native crosshair belongs to Games/CS2 with values before imports; overlay stays under Overlays',()=>{
 const {window,document}=setup('#cs2-fadenkreuz');
 const card=document.getElementById('cs2-fadenkreuz');
 assert.equal(card.closest('[data-menu-page]').dataset.menuPage,'games');
 assert.equal(card.closest('[data-menu-game]').dataset.menuGame,'cs2');
 assert.equal(card.closest('details').open,true);
 assert.equal(document.getElementById('fadenkreuz').closest('[data-menu-page]').dataset.menuPage,'overlays');
 const controls=[...card.querySelectorAll('input,select,textarea')].map(n=>n.id);
 assert.ok(controls.indexOf('cs2-crosshair-size')<controls.indexOf('crosshair-cfg-text'));
 document.querySelector('[data-pick-game="dota2"]').dispatchEvent(new window.Event('click'));
 assert.equal(card.closest('[data-menu-game]').hidden,true);
});

test('Fortgeschrittene divider disappears for games without visible advanced cards',()=>{
 const {window,document,menu}=setup();menu.select('games');
 const page=document.querySelector('[data-menu-page="games"]'),divider=page.querySelector('.cockpit-divider');
 assert.equal(divider.hidden,false,'CS2 has an available Configs card');
 for(const game of ['dota2','wardogs','other']){
   document.querySelector('[data-pick-game="'+game+'"]').dispatchEvent(new window.Event('click'));
   assert.equal(divider.hidden,true,game+' has no advanced card');
 }
 document.querySelector('[data-pick-game="cs2"]').dispatchEvent(new window.Event('click'));
 assert.equal(divider.hidden,false);
 document.getElementById('cfgs').hidden=true;menu.filterGames();
 assert.equal(divider.hidden,true,'hidden package-specific card must not leave an orphan heading');
 document.getElementById('cfgs').hidden=false;menu.filterGames();assert.equal(divider.hidden,false);
});
