/* Sechs Bereiche (MENU_AREAS). Bestehende Karten verschieben, nie kopieren: IDs, Eingaben und Listener bleiben erhalten. */
window.TecMonCockpit=function(document){
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  /* MENU_AREAS: sechs feste Bereiche in fester Reihenfolge, gleich im Schnellmenü (BuildQuick in TecMon.cs), im
     Linksklick-Fenster (klein/groß) und auf der Companion-Seite im Browser. Dritter Wert true = nur in „Erweitert“,
     steht dann immer am Ende des Bereichs. Kartennamen sind feste Namen, der Zustand steht rechts im Kopf. */
  const groups=[
    ['start','Start',[['.connection-summary','Verbindung zur Webseite'],['.activity-summary','Aktueller Auftrag'],['[data-panel="updates"]','Updates & Werkzeuge']]],
    ['games','Spiele',[['#cs2-fadenkreuz','CS2-Fadenkreuz'],['#rundentipps','Rundentipps'],['#stats-backlog','Stats nach dem Spielen'],['#quiz','Quiz'],['#dota-tipps','Dota-2-Tipps'],['#wardogs','Scoreboard-Foto'],['#games','Spiel-Pakete'],['#cfgs','Fertige Configs',true]]],
    ['videos','Videos',[['#auto-highlights','Highlight-Video nach dem Match'],['#clips','Clip-Puffer'],['#videos','Letzte Videos'],['#skin-tausch','Skins & Agenten für Videos',true],['[data-panel="setup"]','Aufnahme-Setup',true],['[data-panel="jobs"]','Aufträge & Szenen',true],['[data-panel="demos"]','Demos herunterladen',true]]],
    ['overlays','Overlays',[['#fadenkreuz','Fadenkreuz'],['#chat','Chat-Übersetzer und Chat-Overlay']]],
    ['tecmon','TecMon',[['#tecmon','Level und Persönlichkeit'],['#spiele','Minispiele']]],
    ['settings','Einstellungen',[['#figur','Figur, Ansicht und Autostart']]]
  ];
  const gameNames={cs2:'Counter-Strike 2',dota2:'Dota 2',wardogs:'Wardogs',other:'Weitere Pakete'};
  const gameCards={'cs2-fadenkreuz':'cs2','rundentipps':'cs2','stats-backlog':'cs2',quiz:'cs2',cfgs:'cs2','dota-tipps':'dota2',wardogs:'wardogs'};
  let current='start',game='cs2';
  /* Alte gespeicherte Seiten und Sprünge auf die neuen Bereiche abbilden. */
  const legacy={buddy:'tecmon',record:'videos',stats:'videos',overlay:'overlays',gallery:'videos',system:'start'};
  try{const saved=JSON.parse(localStorage.getItem('tecmon-cockpit')||'{}');const page=legacy[saved.page]||saved.page;if(groups.some(g=>g[0]===page))current=page;if(Object.hasOwn(gameNames,saved.game))game=saved.game;}catch{}
  const shell=make('div','','companion-cockpit'),nav=make('nav','','cockpit-nav'),content=make('div','','cockpit-content');nav.setAttribute('aria-label','Companion-Bereiche');shell.append(nav,content);
  document.querySelector('.minimal-hero').after(shell);
  const pages=new Map(),buttons=new Map(),states=[];
  function save(){try{localStorage.setItem('tecmon-cockpit',JSON.stringify({page:current,game}));}catch{}}
  function syncDividers(){
    for(const page of content.querySelectorAll('[data-menu-page]')){
      const divider=page.querySelector(':scope>.cockpit-divider');if(!divider)continue;
      const visible=[...page.querySelectorAll(':scope>.cockpit-fold[data-expert]')].some(fold=>!fold.hidden&&[...fold.children].some(card=>card.tagName!=='SUMMARY'&&!card.hidden));
      if(divider.hidden===visible)divider.hidden=!visible;
    }
  }
  function filterGames(){
    for(const n of content.querySelectorAll('[data-menu-game]'))n.hidden=n.dataset.menuGame!==game;
    for(const row of document.querySelectorAll('#game-library [data-package]'))row.hidden=game==='other'?Object.hasOwn(gameCards,row.dataset.package)||['cs2','dota2','wardogs'].includes(row.dataset.package):row.dataset.package!==game;
    for(const b of content.querySelectorAll('[data-pick-game]'))b.setAttribute('aria-pressed',String(b.dataset.pickGame===game));
    syncDividers();
  }
  function select(page){page=legacy[page]||page;if(!pages.has(page))return;current=page;for(const [key,node] of pages)node.hidden=key!==page;for(const [key,node] of buttons)node.setAttribute('aria-current',key===page?'page':'false');save();}
  function reveal(node){
    const page=node.closest('[data-menu-page]');if(page)select(page.dataset.menuPage);
    const owned=node.closest('[data-menu-game]');if(owned){game=owned.dataset.menuGame;filterGames();save();}
    for(let d=node.closest('details');d;d=d.parentElement?.closest('details'))d.open=true;
  }
  for(const [key,label,cards] of groups){
    const page=make('section','','cockpit-page');page.dataset.menuPage=key;page.id='companion-page-'+key;page.setAttribute('aria-labelledby',page.id+'-title');
    const title=make('h2',label);title.id=page.id+'-title';page.append(title);
    const button=make('button',label);button.type='button';button.setAttribute('aria-controls',page.id);button.addEventListener('click',()=>select(key));nav.append(button);buttons.set(key,button);pages.set(key,page);content.append(page);
    if(key==='games'){
      const picker=make('div','','cockpit-game-picker');picker.setAttribute('role','group');picker.setAttribute('aria-label','Spiel wählen');
      for(const [id,name] of Object.entries(gameNames)){const b=make('button',name);b.type='button';b.dataset.pickGame=id;b.addEventListener('click',()=>{game=id;filterGames();save();});picker.append(b);}page.append(picker);
    }
    let divider=null;
    for(const [selector,label,expert] of cards){
      const card=document.querySelector(selector);if(!card)continue;
      if(expert&&!divider){divider=make('p','Für Fortgeschrittene','cockpit-divider');divider.dataset.expert='';page.append(divider);}
      const wrapper=make('details','','card-fold cockpit-fold'),summary=make('summary'),name=make('span',label,'fold-name'),state=make('span','','fold-state');
      summary.append(name,state);wrapper.append(summary);wrapper.dataset.fold='card-'+(card.id||key+'-'+page.children.length);
      if(expert){wrapper.dataset.expert='';card.dataset.expert='';}
      if(gameCards[card.id])wrapper.dataset.menuGame=gameCards[card.id];
      if(card.matches('.tab-panel')){card.hidden=false;card.classList.add('cockpit-legacy-panel');}
      wrapper.append(card);page.append(wrapper);states.push([card,state]);
      wrapper.addEventListener('toggle',()=>{if(wrapper.open)for(const sibling of page.querySelectorAll(':scope>.cockpit-fold'))if(sibling!==wrapper)sibling.open=false;});
    }
  }
  /* Zustand statt Titel: die erste Kartenüberschrift (von app.js laufend gesetzt) wird kurz rechts im Kopf gezeigt. */
  function shortState(text){
    const t=(text||'').trim();
    if(/(ist|sind) aus$|: aus$|^Noch nicht/.test(t))return 'aus';
    if(/(ist|sind) an$|: an$|^Eingeschaltet|läuft|^Live|liest mit|^Scoreboard-Foto an|^Chat-Übersetzer an/.test(t))return 'an';
    return /^Level \d|^Bereit|verbunden|^Verbindung|^Auftrag|^Download|^Aufnahme läuft|Update/i.test(t)&&t.length<=28?t:'';
  }
  function syncStates(){syncDividers();for(const [card,state] of states){const h=card.querySelector('h2');const v=shortState(h&&h.textContent);if(state.textContent===v)continue;state.textContent=v;state.dataset.on=String(v==='an');}}
  syncStates();
  try{new window.MutationObserver(syncStates).observe(content,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});}catch{}
  // Der alte Erweitert-Bereich ist in Start/Videos aufgegangen; alte Sprünge bleiben gültig.
  const advanced=document.getElementById('advanced-panel');if(advanced)advanced.hidden=true;
  const oldScroll=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(options){if(shell.contains(this))reveal(this);return oldScroll?.call(this,options);};
  const hash=()=>{let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const node=document.getElementById(id);if(node)reveal(node);};
  window.addEventListener('hashchange',hash);
  window.companionMenu={filterGames,reveal,select,openAdvanced(name){const card=document.querySelector(`[data-panel="${['setup','jobs','demos','updates'].includes(name)?name:'updates'}"]`);if(card){card.hidden=false;reveal(card);card.scrollIntoView({behavior:'smooth'});}},status(state){const button=buttons.get('start');button.dataset.pending=String(!!state.bridge?.pending?.length);}};
  filterGames();select(current);hash();return window.companionMenu;
};
