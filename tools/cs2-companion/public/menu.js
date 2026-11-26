/* Bestehende Karten verschieben, nie kopieren: IDs, Eingaben und Listener bleiben erhalten. */
window.TecMonCockpit=function(document){
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const groups=[
    ['buddy','TecMon',[['#figur','Darstellung & Bedienung'],['#tecmon','Werte & Persönlichkeit'],['#spiele','Mit TecMon spielen']]],
    ['games','Spiele & Tipps',[['#rundentipps','CS2-Rundentipps'],['#quiz','CS2-Quiz'],['#dota-tipps','Dota-2-Tipps'],['#wardogs','Wardogs: Scoreboard-Foto'],['#games','Spiel-Paket verwalten']]],
    ['record','Aufnahmen',[['.activity-summary','Aktueller Auftrag'],['#auto-highlights','Highlights nach dem Match'],['#skin-tausch','Skins & Agenten für Videos'],['[data-panel="setup"]','Aufnahme-Setup'],['[data-panel="jobs"]','Aufträge & Szenen']]],
    ['stats','Demos & Stats',[['#stats-backlog','Stats nach dem Spielen'],['[data-panel="demos"]','Demos lokal herunterladen']]],
    ['overlay','Overlays & Chat',[['#fadenkreuz','Fadenkreuz für alle Spiele'],['#chat','Chat übersetzen'],['#cfgs','CS2-Configs']]],
    ['gallery','Clips & Galerie',[['#clips','Clip-Puffer'],['#videos','Letzte Videos']]],
    ['system','System',[['.connection-summary','Browser-Verbindung'],['[data-panel="updates"]','Updates & externe Komponenten']]]
  ];
  const gameNames={cs2:'Counter-Strike 2',dota2:'Dota 2',wardogs:'Wardogs',other:'Weitere Pakete'};
  const gameCards={'rundentipps':'cs2',quiz:'cs2','dota-tipps':'dota2',wardogs:'wardogs'};
  let current='buddy',game='cs2';
  try{const saved=JSON.parse(localStorage.getItem('tecmon-cockpit')||'{}');if(groups.some(g=>g[0]===saved.page))current=saved.page;if(Object.hasOwn(gameNames,saved.game))game=saved.game;}catch{}
  const shell=make('div','','companion-cockpit'),nav=make('nav','','cockpit-nav'),content=make('div','','cockpit-content');nav.setAttribute('aria-label','Companion-Bereiche');shell.append(nav,content);
  document.querySelector('.minimal-hero').after(shell);
  const pages=new Map(),buttons=new Map();
  function save(){try{localStorage.setItem('tecmon-cockpit',JSON.stringify({page:current,game}));}catch{}}
  function filterGames(){
    for(const n of content.querySelectorAll('[data-menu-game]'))n.hidden=n.dataset.menuGame!==game;
    for(const row of document.querySelectorAll('#game-library [data-package]'))row.hidden=game==='other'?Object.hasOwn(gameCards,row.dataset.package)||['cs2','dota2','wardogs'].includes(row.dataset.package):row.dataset.package!==game;
    for(const b of content.querySelectorAll('[data-pick-game]'))b.setAttribute('aria-pressed',String(b.dataset.pickGame===game));
  }
  function select(page){if(!pages.has(page))return;current=page;for(const [key,node] of pages)node.hidden=key!==page;for(const [key,node] of buttons)node.setAttribute('aria-current',key===page?'page':'false');save();}
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
    for(const [selector,label] of cards){
      const card=document.querySelector(selector);if(!card)continue;
      const wrapper=make('details','','card-fold cockpit-fold');wrapper.append(make('summary',label));wrapper.dataset.fold='card-'+(card.id||key+'-'+page.children.length);
      if(gameCards[card.id])wrapper.dataset.menuGame=gameCards[card.id];
      if(card.matches('.tab-panel')){card.hidden=false;card.classList.add('cockpit-legacy-panel');}
      wrapper.append(card);page.append(wrapper);
      wrapper.addEventListener('toggle',()=>{if(wrapper.open)for(const sibling of page.querySelectorAll(':scope>.cockpit-fold'))if(sibling!==wrapper)sibling.open=false;});
    }
  }
  // Erweitert ist jetzt ein direkter Zugang zu System; alte Sprünge bleiben gültig.
  const advanced=document.getElementById('advanced-panel');if(advanced)advanced.hidden=true;
  const oldScroll=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(options){if(shell.contains(this))reveal(this);return oldScroll?.call(this,options);};
  const hash=()=>{let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const node=document.getElementById(id);if(node)reveal(node);};
  window.addEventListener('hashchange',hash);
  window.companionMenu={filterGames,reveal,select,openAdvanced(name){const card=document.querySelector(`[data-panel="${['setup','jobs','demos','updates'].includes(name)?name:'updates'}"]`);if(card){card.hidden=false;reveal(card);card.scrollIntoView({behavior:'smooth'});}},status(state){const button=buttons.get('system');button.dataset.pending=String(!!state.bridge?.pending?.length);}};
  filterGames();select(current);hash();return window.companionMenu;
};
