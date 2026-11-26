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
  assert.equal(document.querySelectorAll('.cockpit-nav button').length,7);
  assert.ok(document.querySelector('#external-updates').closest('[data-menu-page="system"]'));
  assert.ok(document.querySelector('#import').closest('[data-menu-page="record"]'));
  assert.ok(document.querySelector('#share-codes').closest('[data-menu-page="stats"]'));
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
  assert.equal(document.querySelector('[data-menu-page="overlay"]').hidden,false);
  const input=document.getElementById('share-codes');input.value='unfertiger Entwurf';
  menu.openAdvanced('demos');
  assert.equal(document.querySelector('[data-menu-page="stats"]').hidden,false);
  assert.equal(input.value,'unfertiger Entwurf');
  menu.reveal(document.getElementById('dota-tipps'));
  assert.equal(document.querySelector('[data-menu-page="games"]').hidden,false);
  assert.equal(document.querySelector('[data-menu-game="dota2"]').hidden,false);
  assert.equal(document.querySelector('[data-pick-game="dota2"]').getAttribute('aria-pressed'),'true');
});
