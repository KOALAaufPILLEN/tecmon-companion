/* Pixel workspace. Browser-only PNG decoding; the native renderer receives bounded RGBA. */
(() => {
  const blank = (width = 32, height = width) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
  const clone = a => ({ width: a.width, height: a.height, data: a.data.slice() });
  function unpack(a) {
    if (!a) return blank();
    const bytes = atob(a.pixels);
    return { width: a.width, height: a.height, data: Uint8ClampedArray.from(bytes, c => c.charCodeAt(0)) };
  }
  const pack = a => ({ width: a.width, height: a.height, pixels: btoa(String.fromCharCode(...a.data)) });
  function line(x0, y0, x1, y1, visit) {
    const dx = Math.abs(x1-x0), dy = -Math.abs(y1-y0), sx = x0<x1?1:-1, sy = y0<y1?1:-1;
    let err = dx+dy;
    for (;;) { visit(x0,y0); if(x0===x1&&y0===y1)break; const e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;} }
  }
  function paint(a,x,y,color,mx=false,my=false) {
    for (const px of new Set([x,...(mx?[a.width-1-x]:[])])) for (const py of new Set([y,...(my?[a.height-1-y]:[])]))
      if(px>=0&&py>=0&&px<a.width&&py<a.height)a.data.set(color,(py*a.width+px)*4);
  }
  function resize(a,width,height=width) {
    const b=blank(width,height), dx=Math.floor((width-a.width)/2),dy=Math.floor((height-a.height)/2);
    for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++)paint(b,x+dx,y+dy,a.data.subarray((y*a.width+x)*4,(y*a.width+x+1)*4));
    return b;
  }
  function pngDimensions(bytes) {
    const b=new Uint8Array(bytes),v=new DataView(bytes);
    if(b.length<33||![137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)||v.getUint32(8)!==13||String.fromCharCode(...b.slice(12,16))!=="IHDR")throw Error("Bitte eine gültige PNG-Datei wählen.");
    const width=v.getUint32(16),height=v.getUint32(20);
    if(!width||!height||width>512||height>512)throw Error("PNG bitte höchstens 512 × 512 Pixel groß wählen.");
    return {width,height};
  }
  function surface(a) { const c=document.createElement('canvas');c.width=a.width;c.height=a.height;c.getContext('2d').putImageData(new ImageData(a.data,a.width,a.height),0,0);return c; }
  function draw(g,art,size) {
    if(!art)return;const a=unpack(art),ratio=size/Math.max(a.width,a.height);
    g.imageSmoothingEnabled=false;g.drawImage(surface(a),-a.width*ratio/2,-a.height*ratio/2,a.width*ratio,a.height*ratio);
  }
  function create({onChange}) {
    const $=id=>document.getElementById(id),canvas=$('art-canvas'),g=canvas.getContext('2d');
    let art=blank(),undo=[],redo=[],stroke=null,cursor={x:15,y:15},changed=false,saved=false;
    const remember=()=>{undo.push(clone(art));if(undo.length>40)undo.shift();redo=[];};
    function render() {
      const cell=12;canvas.width=art.width*cell;canvas.height=art.height*cell;
      for(let y=0;y<art.height;y++)for(let x=0;x<art.width;x++){g.fillStyle=(x+y)%2?'#37323f':'#24212c';g.fillRect(x*cell,y*cell,cell,cell);}
      g.imageSmoothingEnabled=false;g.drawImage(surface(art),0,0,canvas.width,canvas.height);
      g.strokeStyle='#ffffff18';g.lineWidth=1;g.beginPath();for(let x=0;x<=art.width;x++){g.moveTo(x*cell+.5,0);g.lineTo(x*cell+.5,canvas.height);}for(let y=0;y<=art.height;y++){g.moveTo(0,y*cell+.5);g.lineTo(canvas.width,y*cell+.5);}g.stroke();
      g.strokeStyle='#e8c57399';g.beginPath();g.moveTo(canvas.width/2,0);g.lineTo(canvas.width/2,canvas.height);g.moveTo(0,canvas.height/2);g.lineTo(canvas.width,canvas.height/2);g.stroke();
      if(document.activeElement===canvas){g.strokeStyle='#fff';g.strokeRect(cursor.x*cell+.5,cursor.y*cell+.5,cell-1,cell-1);}
      $('art-undo').disabled=!undo.length;$('art-redo').disabled=!redo.length;
      $('art-status').textContent=`${art.width} × ${art.height} Pixel · ${changed?'Entwurf – zum Anwenden speichern':saved?'gespeichert':'lokaler Editor'}`;
    }
    const emit=()=>{changed=true;render();onChange(pack(art));};
    const color=()=>{const hex=$('art-color').value;return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).concat(Number($('art-opacity').value));};
    function dab(x,y,erase=false) {
      if($('art-tool').value==='pick'&&!erase){const p=(y*art.width+x)*4;$('art-color').value='#'+[...art.data.slice(p,p+3)].map(n=>n.toString(16).padStart(2,'0')).join('');$('art-opacity').value=art.data[p+3];return;}
      paint(art,x,y,erase||$('art-tool').value==='erase'?[0,0,0,0]:color(),$('art-mirror-x').checked,$('art-mirror-y').checked);
    }
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(art.width-1,Math.floor((e.clientX-r.left)/r.width*art.width))),y:Math.max(0,Math.min(art.height-1,Math.floor((e.clientY-r.top)/r.height*art.height)))};};
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;e.preventDefault();canvas.focus();cursor=point(e);if(e.button===0&&$('art-tool').value==='pick'){dab(cursor.x,cursor.y);render();return;}remember();stroke={id:e.pointerId,...cursor,erase:e.button===2};canvas.setPointerCapture(e.pointerId);dab(cursor.x,cursor.y,stroke.erase);emit();});
    canvas.addEventListener('pointermove',e=>{if(!stroke||e.pointerId!==stroke.id)return;const p=point(e);line(stroke.x,stroke.y,p.x,p.y,(x,y)=>dab(x,y,stroke.erase));stroke={...stroke,...p};cursor=p;emit();});
    const end=e=>{if(stroke&&e.pointerId===stroke.id){stroke=null;render();}};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,end);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('focus',render);canvas.addEventListener('blur',render);
    canvas.addEventListener('keydown',e=>{const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(d){e.preventDefault();cursor={x:Math.max(0,Math.min(art.width-1,cursor.x+d[0])),y:Math.max(0,Math.min(art.height-1,cursor.y+d[1]))};render();}else if(e.key===' '||e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remember();dab(cursor.x,cursor.y,e.key!==' ');emit();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('art-'+(e.shiftKey?'redo':'undo')).click();}});
    $('art-undo').onclick=()=>{if(!undo.length)return;redo.push(clone(art));art=undo.pop();emit();};
    $('art-redo').onclick=()=>{if(!redo.length)return;undo.push(clone(art));art=redo.pop();emit();};
    $('art-clear').onclick=()=>{remember();art=blank(art.width,art.height);emit();};
    $('art-resize').onclick=()=>{remember();art=resize(art,Number($('art-grid-size').value));cursor={x:Math.floor(art.width/2),y:Math.floor(art.height/2)};emit();};
    $('art-export').onclick=()=>surface(art).toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tecmon-fadenkreuz.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');
    $('art-file').addEventListener('change',async e=>{
      const file=e.target.files[0];if(!file)return;
      try{
        if(file.size>2*1024*1024)throw Error('PNG bitte höchstens 2 MB groß wählen.');
        const dimensions=pngDimensions(await file.arrayBuffer()),image=await createImageBitmap(file);
        try{
          if(image.width!==dimensions.width||image.height!==dimensions.height)throw Error('PNG-Abmessungen sind ungültig.');
          const ratio=Math.min(1,64/Math.max(image.width,image.height)),w=Math.max(1,Math.round(image.width*ratio)),h=Math.max(1,Math.round(image.height*ratio));
          const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0,w,h);
          const next={width:w,height:h,data:ctx.getImageData(0,0,w,h).data};
          if(!next.data.some((n,i)=>i%4===3&&n>0))throw Error('Dieses PNG enthält keine sichtbaren Pixel.');
          remember();art=next;cursor={x:Math.floor(w/2),y:Math.floor(h/2)};emit();
          $('art-status').textContent=`PNG geladen · ${w} × ${h} Pixel${ratio<1?' · auf maximal 64 Pixel verkleinert':''} · zum Anwenden speichern`;
        }finally{image.close();}
      }catch(error){$('art-status').textContent=error.message;}finally{e.target.value='';}
    });
    render();
    return { saved(){changed=false;saved=true;render();},load(value){art=unpack(value);undo=[];redo=[];changed=false;saved=!!value;cursor={x:Math.floor(art.width/2),y:Math.floor(art.height/2)};render();} };
  }
  globalThis.TecMonArt={blank,clone,pack,unpack,line,paint,resize,pngDimensions,draw,create};
})();
