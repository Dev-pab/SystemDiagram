'use strict';
const $ = s => document.querySelector(s);
$('#world').insertAdjacentHTML('afterbegin','<svg id="drawings" aria-label="Dessins et textes"></svg>');
$('#world').insertAdjacentHTML('beforeend','<svg id="drawing-handles" aria-label="Poignées des dessins"></svg>');
const TYPES = ['Logique','Analogique','I2C','UART','SPI','PWM','5V','3.3V','12V','GND','Custom'];
const KINDS = ['MCU','Capteur','Actionneur','Alimentation','Communication','IHM','Autre'];
const icons = {MCU:'▦',Capteur:'◉',Actionneur:'⚙',Alimentation:'ϟ',Communication:'⇄',IHM:'▣',Autre:'◇'};
const color = type => ['5V','3.3V','12V','GND'].includes(type) ? '#d89b39' : ['I2C','UART','SPI'].includes(type) ? '#8b7bec' : type === 'Analogique' ? '#42a893' : '#5898cf';
const uid = () => crypto.randomUUID();
const clone = v => JSON.parse(JSON.stringify(v));
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const GRID=10, BLOCK_WIDTH=200;
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const port = (name,type,direction) => ({id:uid(),name,type,direction});
const defaults = [
  {id:'esp32',name:'ESP32',kind:'MCU',description:'Microcontrôleur · Wi-Fi / Bluetooth',ports:[port('VCC','3.3V','in'),port('GND','GND','in'),port('SDA / SCL','I2C','io'),port('ADC','Analogique','in'),port('GPIO','Logique','out'),port('TX / RX','UART','io')]},
  {id:'arduino',name:'Arduino Uno',kind:'MCU',description:'Microcontrôleur · ATmega328P',ports:[port('VCC','5V','in'),port('GND','GND','in'),port('SDA / SCL','I2C','io'),port('A0','Analogique','in'),port('D3','PWM','out')]},
  {id:'bme280',name:'BME280',kind:'Capteur',description:'Température · Humidité · Pression',ports:[port('VCC','3.3V','in'),port('GND','GND','in'),port('SDA / SCL','I2C','io')]},
  {id:'analog',name:'Capteur analogique',kind:'Capteur',description:'Acquisition · Sortie analogique',ports:[port('VCC','5V','in'),port('GND','GND','in'),port('Signal','Analogique','out')]},
  {id:'relay',name:'Module relais',kind:'Actionneur',description:'Commutation · Commande logique',ports:[port('VCC','5V','in'),port('GND','GND','in'),port('Commande','Logique','in')]},
  {id:'power',name:'Alimentation DC',kind:'Alimentation',description:'Distribution · 5 V / 3,3 V',ports:[port('5V','5V','out'),port('3.3V','3.3V','out'),port('GND','GND','out')]},
  {id:'display',name:'Écran OLED',kind:'IHM',description:'Affichage · Interface utilisateur',ports:[port('VCC','3.3V','in'),port('GND','GND','in'),port('SDA / SCL','I2C','io')]}
];
let library = clone(defaults), project = {name:'Station de mesure',blocks:[],wires:[]};
function makeBlock(c,x,y){const b={...clone(c),id:uid(),...snapPoint({x,y}),ports:c.ports.map(p=>({...p,id:uid()}))};if(b.width||b.height)resizeBlock(b,blockWidth(b),blockHeight(b));return b;}
const initial = () => {
  const power=makeBlock(defaults[5],65,170), mcu=makeBlock(defaults[0],370,240), sensor=makeBlock(defaults[2],65,420), relay=makeBlock(defaults[4],675,310);
  project.blocks=[power,mcu,sensor,relay];
  const wire=(a,ai,b,bi)=>({id:uid(),from:{block:a.id,port:a.ports[ai].id},to:{block:b.id,port:b.ports[bi].id}});
  project.wires=[wire(power,1,mcu,0),wire(power,0,relay,0),wire(sensor,2,mcu,2),wire(mcu,4,relay,2)];
};
initial();
try { const saved=JSON.parse(localStorage.getItem('systemdiagram-v1')); if(saved && validProject(saved.project) && validLibrary(saved.library)) {project=saved.project;library=saved.library;} } catch {}
if(!library.some(c=>c.kind==='IHM'))library.push(clone(defaults[6]));
let selected=null, mode='select', pending=null, drag=null, view={x:0,y:0,scale:1}, filter='all', past=[], future=[], toastTimer;
let showPower=true,showSignal=true;
function isSelected(kind,id){return selected?.kind===kind&&selected.id===id||selected?.kind==='multi'&&selected.items.some(i=>i.kind===kind&&i.id===id);}
function objectsInRectangle(start,end){
  const r={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),right:Math.max(start.x,end.x),bottom:Math.max(start.y,end.y)};
  const overlaps=(x,y,width,height)=>x<=r.right&&x+width>=r.x&&y<=r.bottom&&y+height>=r.y;
  const items=project.blocks.filter(b=>overlaps(b.x,b.y,blockWidth(b),blockHeight(b))).map(b=>({kind:'block',id:b.id}));
  (project.annotations||[]).filter(a=>overlaps(a.x,a.y,a.width,a.height)).forEach(a=>items.push({kind:'annotation',id:a.id}));
  project.wires.filter(w=>{const ps=wirePoints(w);return ps.length&&visiblePort(ps[0].p)&&visiblePort(ps.at(-1).p)&&ps.some((p,i)=>i&&overlaps(Math.min(p.x,ps[i-1].x),Math.min(p.y,ps[i-1].y),Math.abs(p.x-ps[i-1].x),Math.abs(p.y-ps[i-1].y)));}).forEach(w=>items.push({kind:'wire',id:w.id}));
  return items;
}
function startGroupDrag(event,p){const el=event.target.closest('[data-block],[data-wire],[data-annotation]');if(!el)return false;const kind=el.dataset.block?'block':el.dataset.wire?'wire':'annotation',id=el.dataset.block||el.dataset.wire||el.dataset.annotation;if(!isSelected(kind,id))return false;drag={kind:'group',start:p,baseline:{...clone(project),wires:project.wires.map(w=>({...clone(w),points:wirePoints(w).slice(1,-1).map(p=>({x:p.x,y:p.y}))}))},changed:false};return true;}
function moveSelection(base,delta){
  const blocks=new Set(selected.items.filter(i=>i.kind==='block').map(i=>i.id));
  base.wires.forEach(w=>{if(isSelected('wire',w.id)||(blocks.has(w.from.block)&&blocks.has(w.to.block))){const live=project.wires.find(q=>q.id===w.id);const points=w.points?.length?w.points:wirePoints(w).slice(1,-1);live.points=points.map(p=>({x:p.x+delta.x,y:p.y+delta.y}));}});
  base.blocks.forEach(b=>{if(blocks.has(b.id))Object.assign(project.blocks.find(q=>q.id===b.id),{x:b.x+delta.x,y:b.y+delta.y});});
  (base.annotations||[]).forEach(a=>{if(isSelected('annotation',a.id))Object.assign(project.annotations.find(q=>q.id===a.id),{x:a.x+delta.x,y:a.y+delta.y});});
}
const isPower = p => ['5V','3.3V','12V','GND'].includes(p.type) || p.category==='power';
const visiblePort = p => isPower(p)?showPower:showSignal;
const typeName = p => p.type==='Custom'?(p.customType?.trim()||'Custom'):p.type;
const compatible = (a,b) => a.type===b.type && (a.type!=='Custom'||(a.customType?.trim()&&a.customType.trim()===b.customType?.trim()));
function blockWidth(b){return b.width||BLOCK_WIDTH;}
function minimumHeight(b){return Math.max(160,130+Math.max(0,b.ports.length-1)*10);}
function blockHeight(b){return Math.max(minimumHeight(b),b.height||120+b.ports.length*30);}
function resizeBlock(b,width,height){const oldW=blockWidth(b),oldH=blockHeight(b);const w=Math.max(140,Math.min(3000,Math.round(width/GRID)*GRID)),h=Math.max(minimumHeight(b),Math.min(3000,Math.round(height/GRID)*GRID));b.ports.forEach(p=>{if(p.position){p.position={x:p.position.x===oldW?w:Math.min(w,p.position.x),y:p.position.y===oldH?h:Math.min(h,p.position.y)};}});b.width=w;b.height=h;}
const formatCurrent = n => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(n)+' mA';
function validPort(p){return p && typeof p.id==='string' && typeof p.name==='string' && TYPES.includes(p.type) && ['in','out','io'].includes(p.direction) && (p.customType===undefined||typeof p.customType==='string') && (p.category===undefined||['power','signal'].includes(p.category)) && (p.position===undefined||(finitePoint(p.position)&&p.position.x>=0&&p.position.x<=3000&&p.position.y>=0));}
function validComponent(c){return c && typeof c.id==='string' && typeof c.name==='string' && KINDS.includes(c.kind) && ['width','height'].every(k=>c[k]===undefined||(Number.isFinite(c[k])&&c[k]>=140&&c[k]<=3000)) && (c.showCurrent===undefined||typeof c.showCurrent==='boolean') && (c.currentMa===undefined||(Number.isFinite(c.currentMa)&&c.currentMa>=0)) && (c.description===undefined || typeof c.description==='string') && Array.isArray(c.ports) && c.ports.length<=100 && c.ports.every(validPort) && new Set(c.ports.map(p=>p.id)).size===c.ports.length;}
function validLibrary(l){return Array.isArray(l) && l.length<=500 && l.every(validComponent) && new Set(l.map(c=>c.id)).size===l.length;}
function validProject(p){return p && typeof p.name==='string' && Array.isArray(p.blocks) && p.blocks.length<=500 && p.blocks.every(b=>validComponent(b)&&Number.isFinite(b.x)&&Number.isFinite(b.y)) && new Set(p.blocks.map(b=>b.id)).size===p.blocks.length && Array.isArray(p.wires) && p.wires.length<=5000 && new Set(p.wires.map(w=>w.id)).size===p.wires.length && p.wires.every(w=>typeof w.id==='string' && ['from','to'].every(k=>w[k]&&p.blocks.some(b=>b.id===w[k].block&&b.ports.some(q=>q.id===w[k].port))) && w.from.block!==w.to.block && (w.points===undefined||(Array.isArray(w.points)&&w.points.length<=1000&&w.points.every(finitePoint))) && (w.customType===undefined||typeof w.customType==='string')) && (p.annotations===undefined||(Array.isArray(p.annotations)&&p.annotations.length<=1000&&p.annotations.every(validAnnotation)&&new Set(p.annotations.map(a=>a.id)).size===p.annotations.length));}
function normalizeProject(p){p.annotations??=[];if(p.visibility?.current!==undefined){p.blocks.forEach(b=>{if(b.showCurrent===undefined)b.showCurrent=p.visibility.current!==false;});delete p.visibility.current;}p.blocks.forEach(b=>{Object.assign(b,snapPoint(b));if(b.width||b.height)resizeBlock(b,blockWidth(b),blockHeight(b));b.ports.forEach((q,i)=>{if(q.position)q.position=portPosition(b,q,i);});});p.wires.forEach(w=>{if(w.points)w.points=w.points.map(snapPoint);});return p;}
// Sum distinct reachable loads over directed supply connections; GND and signals are excluded.
function powerBudget(rootId){
  const edges=new Map(),parents=new Map();
  project.wires.forEach(w=>{const a=endpoint(w.from),b=endpoint(w.to);if(!a||!b||!isPower(a.p)||!isPower(b.p)||a.p.type==='GND'||b.p.type==='GND'||!compatible(a.p,b.p)||a.p.direction==='in'||b.p.direction==='out')return;
    if(!edges.has(a.b.id))edges.set(a.b.id,new Set());edges.get(a.b.id).add(b.b.id);
    if(!parents.has(b.b.id))parents.set(b.b.id,new Set());parents.get(b.b.id).add(a.b.id);
  });
  const seen=new Set([rootId]),active=new Set(),loads=[];let cycle=false,ambiguous=false;
  function visit(id){active.add(id);for(const next of edges.get(id)||[]){if(active.has(next)){cycle=true;continue;}if(seen.has(next))continue;seen.add(next);const b=project.blocks.find(b=>b.id===next);if(b)loads.push(b);if((parents.get(next)?.size||0)>1)ambiguous=true;visit(next);}active.delete(id);}
  visit(rootId);return {total:loads.reduce((sum,b)=>sum+(b.currentMa||0),0),loads,cycle,ambiguous};
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function save(){try{localStorage.setItem('systemdiagram-v1',JSON.stringify({project,library}));$('#save-status').textContent='Enregistré localement';}catch{$('#save-status').textContent='Exportez pour sauvegarder';}}
function checkpoint(){past.push(clone({project,library}));if(past.length>60)past.shift();future=[];}
function mutate(fn){checkpoint();fn();save();render();}
function history(back){const source=back?past:future,target=back?future:past;if(!source.length)return;target.push(clone({project,library}));({project,library}=source.pop());selected=null;pending=null;save();render();}
function setMode(m){mode=m;pending=null;drawingDraft=null;['select','wire','pan','pin','rect','text'].forEach(t=>$('#'+t+'-tool').classList.toggle('active',t===m));$('#canvas').style.cursor=m==='pan'?'grab':['wire','rect'].includes(m)?'crosshair':m==='text'?'text':'default';renderBlocks();renderWires();renderAnnotations();}
function renderLibrary(){
  $('#library-count').textContent=library.length;
  const search=$('#search').value.toLowerCase();const visible=library.filter(c=>(filter==='all'||c.kind===filter)&&(c.name+' '+c.description).toLowerCase().includes(search));
  $('#library-list').innerHTML=KINDS.map(kind=>{const items=visible.filter(c=>c.kind===kind);return items.length?`<div class="library-group-title">${esc(kind.toUpperCase())}</div>`+items.map(c=>`<div class="library-item"><button class="component-card" data-component="${esc(c.id)}" title="Ajouter ${esc(c.name)} au synoptique"><span class="component-icon">${icons[c.kind]}</span><span><strong>${esc(c.name)}</strong><small>${c.ports.length} ports · ${esc(c.kind)}</small></span><span class="add">＋</span></button><button class="library-edit button" data-edit-component="${esc(c.id)}" aria-label="Modifier ${esc(c.name)}" title="Modifier dans la bibliothèque">✎</button></div>`).join(''):'';}).join('') || '<p class="muted">Aucun composant trouvé.</p>';
}
function renderBlocks(){
  $('#blocks').innerHTML=project.blocks.map(b=>{
    const budget=b.kind==='Alimentation'?powerBudget(b.id):null;
    return `<article class="block ${isSelected('block',b.id)?'selected':''}" data-block="${esc(b.id)}" style="left:${b.x}px;top:${b.y}px;width:${blockWidth(b)}px;height:${blockHeight(b)}px"><div class="block-header"><span class="component-icon">${icons[b.kind]}</span><div><div class="block-name">${esc(b.name)}</div><div class="block-kind">${esc(b.kind)}${b.description?' · '+esc(b.description.split('·')[0].trim().slice(0,22)):''}</div></div></div>${b.ports.map((p,i)=>{
      const pos=portPosition(b,p,i),right=pos.x>blockWidth(b)/2;
      return `<div class="positioned-port ${right?'right':'left'} ${mode==='pin'?'movable':''}" style="left:${pos.x}px;top:${pos.y}px;--type-color:${color(p.type)};${visiblePort(p)?'':'display:none'}"><button class="port-dot pin-${p.direction} ${pending?.block===b.id&&pending.port===p.id?'pending':''}" data-port="${esc(p.id)}" title="${esc(p.name)} · ${esc(typeName(p))} · ${p.direction==='in'?'Entrée (carré)':p.direction==='out'?'Sortie (triangle)':'Bidirectionnel (losange)'}" aria-label="Connecter ${esc(b.name)} ${esc(p.name)}"></button><span class="positioned-label"><span>${esc(p.name)}</span><span class="port-type">${esc(typeName(p))}</span></span></div>`;
    }).join('')}<div class="block-current" ${b.showCurrent===false?'hidden':''}>${budget?'ϟ Charge aval : '+formatCurrent(budget.total)+(budget.cycle||budget.ambiguous?' ⚠':''):'Consommation : '+formatCurrent(b.currentMa||0)}</div><button class="block-resize" data-resize-block="${esc(b.id)}" title="Redimensionner le bloc" aria-label="Redimensionner ${esc(b.name)}"></button></article>`;
  }).join('');
  $('#empty-hint').hidden=project.blocks.length!==0;
}
function portPosition(b,p,i=b.ports.indexOf(p)){const step=b.ports.length>1?Math.min(30,Math.floor((blockHeight(b)-130)/(b.ports.length-1)/GRID)*GRID):30;return p.position?{x:Math.max(0,Math.min(blockWidth(b),snapPoint(p.position).x)),y:Math.max(0,Math.min(blockHeight(b),snapPoint(p.position).y))}:{x:p.direction==='in'?0:blockWidth(b),y:90+i*step};}
function endpoint(e){const b=project.blocks.find(b=>b.id===e.block),i=b?.ports.findIndex(p=>p.id===e.port);if(!b||i<0)return null;const p=b.ports[i],pos=portPosition(b,p,i);return {x:b.x+pos.x,y:b.y+pos.y,p,b};}
function snapPoint(p){return {x:Math.round(p.x/GRID)*GRID,y:Math.round(p.y/GRID)*GRID};}
function polyline(points){return points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ');}
function orthogonalRoute(points,verticalFirst=false){
  const result=[];const push=p=>{const last=result.at(-1);if(!last||last.x!==p.x||last.y!==p.y)result.push({x:p.x,y:p.y,...(p.p?{p:p.p,b:p.b}:{})});else if(p.p){last.p=p.p;last.b=p.b;}};
  points.forEach((p,i)=>{const q=snapPoint(p),last=result.at(-1);if(last&&last.x!==q.x&&last.y!==q.y){const vertical=i===1?verticalFirst:(result.length>1?result.at(-2).x===last.x:verticalFirst);push(vertical?{x:last.x,y:q.y}:{x:q.x,y:last.y});}push({...p,...q});});
  for(let i=1;i<result.length-1;){const a=result[i-1],b=result[i],c=result[i+1];if((a.x===b.x&&b.x===c.x&&(b.y-a.y)*(c.y-b.y)>=0)||(a.y===b.y&&b.y===c.y&&(b.x-a.x)*(c.x-b.x)>=0))result.splice(i,1);else i++;}
  return result;
}
function pinNormal(e){const pos=portPosition(e.b,e.p);return pos.x===0?{x:-1,y:0}:pos.x===blockWidth(e.b)?{x:1,y:0}:pos.y===0?{x:0,y:-1}:pos.y===blockHeight(e.b)?{x:0,y:1}:{x:e.p.direction==='in'?-1:1,y:0};}
function wirePoints(w){const a=endpoint(w.from),b=endpoint(w.to);if(!a||!b)return [];const na=pinNormal(a),nb=pinNormal(b);if(w.points?.length)return orthogonalRoute([a,...w.points,b],!!na.y);const s={x:a.x+na.x*20,y:a.y+na.y*20},t={x:b.x+nb.x*20,y:b.y+nb.y*20};let middle=[];if(na.x&&nb.x){const x=na.x===nb.x?(na.x>0?Math.max(s.x,t.x)+20:Math.min(s.x,t.x)-20):snapPoint({x:(s.x+t.x)/2,y:0}).x;middle=[{x,y:s.y},{x,y:t.y}];}else if(na.y&&nb.y){const y=na.y===nb.y?(na.y>0?Math.max(s.y,t.y)+20:Math.min(s.y,t.y)-20):snapPoint({x:0,y:(s.y+t.y)/2}).y;middle=[{x:s.x,y},{x:t.x,y}];}return orthogonalRoute([a,s,...middle,t,b],!!na.y);}
function moveSegment(points,index,delta){
  const result=points.map(p=>({x:p.x,y:p.y})),a=result[index],b=result[index+1],axis=a.y===b.y?'y':'x';
  const movedA={...a,[axis]:a[axis]+delta},movedB={...b,[axis]:b[axis]+delta};
  if(index===0)result.splice(1,0,movedA);else result[index]=movedA;
  const bi=index+(index===0?2:1);if(index+1===points.length-1)result.splice(bi,0,movedB);else result[bi]=movedB;
  return result.slice(1,-1);
}
function moveCorner(points,index,pos){const result=points.map(p=>({x:p.x,y:p.y})),old=result[index];if(index>1){if(result[index-1].x===old.x)result[index-1].x=pos.x;else result[index-1].y=pos.y;}if(index<result.length-2){if(result[index+1].x===old.x)result[index+1].x=pos.x;else result[index+1].y=pos.y;}result[index]=pos;return result.slice(1,-1);}
const wireType = (w,a=endpoint(w.from)) => w.customType?.trim()||typeName(a.p);
function renderWires(){
  $('#wires').innerHTML=project.wires.map(w=>{const a=endpoint(w.from),b=endpoint(w.to);if(!a||!b||!visiblePort(a.p)||!visiblePort(b.p))return '';const points=wirePoints(w);if(points.length<2)return '';const d=polyline(points),mid=points[Math.floor((points.length-1)/2)],next=points[Math.floor((points.length-1)/2)+1];const hits=points.slice(0,-1).map((p,i)=>`<path class="wire-hit" data-segment="${i}" d="${polyline([p,points[i+1]])}"/>`).join('');return `<g data-wire="${esc(w.id)}">${hits}<path class="wire ${isSelected('wire',w.id)?'selected':''}" stroke="${color(a.p.type)}" d="${d}"/><text class="wire-label" x="${(mid.x+next.x)/2}" y="${(mid.y+next.y)/2-9}" text-anchor="middle">${esc(wireType(w,a))}</text></g>`;}).join('');
  let handles='';
  const w=selected?.kind==='wire'&&project.wires.find(w=>w.id===selected.id);
  if(w&&visiblePort(endpoint(w.from).p)&&visiblePort(endpoint(w.to).p)){
    handles=wirePoints(w).slice(1,-1).map((p,i)=>`<rect class="angle-handle" data-angle="${i+1}" data-wire-id="${esc(w.id)}" x="${p.x-5}" y="${p.y-5}" width="10" height="10" rx="2"><title>Déplacer l’angle ${i+1}</title></rect>`).join('');
    handles+=['from','to'].map(k=>{const p=endpoint(w[k]);return `<circle class="endpoint-handle" data-endpoint="${k}" data-wire-id="${esc(w.id)}" cx="${p.x}" cy="${p.y}" r="7"><title>Déplacer le pin ${esc(p.p.name)} sur son bloc</title></circle>`;}).join('');
  }
  if(pending){const a=endpoint(pending);if(a){const points=orthogonalRoute([a,...(pending.points||[]),...(pending.cursor?[pending.cursor]:[])],!!pinNormal(a).y);$('#wires').insertAdjacentHTML('beforeend',`<path class="wire" stroke="${color(a.p.type)}" stroke-dasharray="5 5" d="${polyline(points)}"/>`);handles+=(pending.points||[]).map(p=>`<circle class="draft-angle" cx="${p.x}" cy="${p.y}" r="4"/>`).join('');}}
  $('#wire-handles').innerHTML=handles;
}
const options=(list,value)=>list.map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(v)}</option>`).join('');
$('#component-form select[name="kind"]').innerHTML=options(KINDS,'MCU');
function portEditor(p){return `<div class="port-editor" data-edit-port="${esc(p.id)}"><input data-port-prop="name" value="${esc(p.name)}" maxlength="60" aria-label="Nom du port"><button class="remove-port" title="Supprimer le port et ses connexions">×</button><div class="port-settings"><select data-port-prop="direction" aria-label="Direction du port"><option value="in" ${p.direction==='in'?'selected':''}>← Entrée</option><option value="out" ${p.direction==='out'?'selected':''}>→ Sortie</option><option value="io" ${p.direction==='io'?'selected':''}>↔ Bidirectionnel</option></select><select data-port-prop="type" aria-label="Type du port">${options(TYPES,p.type)}</select></div>${p.type==='Custom'?`<input class="custom-input" data-port-prop="customType" value="${esc(p.customType||'')}" placeholder="Type personnalisé, ex. CAN" aria-label="Type personnalisé du port" maxlength="60"><select class="custom-input" data-port-prop="category" aria-label="Famille du port personnalisé"><option value="signal" ${!isPower(p)?'selected':''}>Signal</option><option value="power" ${isPower(p)?'selected':''}>Alimentation</option></select>`:''}<button class="reset-pin" data-reset-pin="${esc(p.id)}" title="Rétablir la position automatique">↺ Position automatique</button></div>`;}
function renderInspector(){
  $('.inspector').classList.toggle('has-selection',!!selected);
  const target=$('#inspector-content');
  if(selected?.kind==='multi'){target.innerHTML=`<div class="empty-inspector"><strong>${selected.items.length} objets sélectionnés</strong><p>Glissez un objet sélectionné pour déplacer l’ensemble. Suppr pour supprimer. Cliquez dans une zone vide pour recommencer une sélection.</p></div>`;
  }else if(selected?.kind==='annotation'){
    const a=(project.annotations||[]).find(a=>a.id===selected.id);if(!a){selected=null;return renderInspector();}target.innerHTML=annotationInspector(a);
  }else if(['block','library'].includes(selected?.kind)){
    const b=(selected.kind==='library'?library:project.blocks).find(b=>b.id===selected.id);if(!b){selected=null;return renderInspector();}
    const budget=b.kind==='Alimentation'?powerBudget(b.id):null;
    target.innerHTML=`<div class="selection-header"><span class="component-icon">${icons[b.kind]}</span><div><strong>${esc(b.name)}</strong><small>${selected.kind==='library'?'Bibliothèque · modifications enregistrées':'Composant sélectionné'}</small></div></div><label class="field">Nom<input data-prop="name" value="${esc(b.name)}" maxlength="80"></label><div class="drawing-dimensions"><label class="field">Largeur du bloc (px)<input data-prop="width" type="number" min="140" max="3000" step="10" value="${blockWidth(b)}"></label><label class="field">Hauteur du bloc (px)<input data-prop="height" type="number" min="${minimumHeight(b)}" max="3000" step="10" value="${blockHeight(b)}"></label></div><label class="field">Type de composant<select data-prop="kind">${options(KINDS,b.kind)}</select></label><label class="field">Description<textarea data-prop="description" maxlength="200">${esc(b.description||'')}</textarea></label><label class="field">Courant consommé propre (mA)<input data-prop="currentMa" type="number" min="0" step="any" value="${b.currentMa||0}"></label><button class="button full pin-filter" id="toggle-block-current" aria-pressed="${b.showCurrent!==false}">${b.showCurrent===false?'Afficher':'Masquer'} ${budget?'la charge aval':'la consommation'} dans la vue</button>${budget?`<div class="power-budget"><span>COURANT À FOURNIR AUX BLOCS AVAL</span><strong>${formatCurrent(budget.total)}</strong><small>${budget.loads.length} blocs distincts · propre : ${formatCurrent(b.currentMa||0)}</small>${budget.loads.map(load=>`<div>${esc(load.name)} <b>${formatCurrent(load.currentMa||0)}</b></div>`).join('')}${budget.cycle?'<p>⚠ Boucle d’alimentation détectée.</p>':''}${budget.ambiguous?'<p>⚠ Plusieurs sources alimentent un bloc aval : répartition non définie, charge entière attribuée à chaque source.</p>':''}<p>Somme des consommations déclarées, hors GND ; sans conversion de tension ni rendement.</p></div>`:''}<div class="inspector-subtitle">Entrées & sorties <span>${b.ports.length} PORTS</span></div>${b.ports.map(portEditor).join('')}<button class="button full" id="add-port">＋ Ajouter un port</button>${selected.kind==='library'?'<p class="inspector-note">Les modifications concernent les futurs blocs ajoutés. Les instances déjà placées conservent leurs réglages.</p>':'<button class="button full" id="store-component">◇ Enregistrer en bibliothèque</button>'}<p class="inspector-note">Connexion : cliquez sur un pin, puis dans la vue pour poser les angles, puis sur le pin de destination. Positionner les pins : glissez un pin sur le pourtour du bloc. Alt + glisser : placement libre dans le bloc.</p>`;
  }else if(selected?.kind==='wire'){
    const w=project.wires.find(w=>w.id===selected.id),a=w&&endpoint(w.from),b=w&&endpoint(w.to);if(!a||!b){selected=null;return renderInspector();}
    target.innerHTML=`<div class="selection-header"><span class="component-icon" style="color:${color(a.p.type)}">⌁</span><div><strong>Connexion ${esc(wireType(w,a))}</strong><small>Tracé horizontal / vertical</small></div></div><label class="field">Origine<input readonly value="${esc(a.b.name+' · '+a.p.name)}"></label><label class="field">Destination<input readonly value="${esc(b.b.name+' · '+b.p.name)}"></label><label class="field">Type de connexion<select data-wire-prop="type"><option value="inherited" ${!w.customType?'selected':''}>Hérité : ${esc(typeName(a.p))}</option><option value="custom" ${w.customType?'selected':''}>Custom</option></select></label>${w.customType?`<label class="field">Type personnalisé<input data-wire-prop="customType" value="${esc(w.customType)}" maxlength="60" placeholder="Ex. Faisceau moteur"></label>`:''}<div class="inspector-subtitle">Angles <span>${wirePoints(w).slice(1,-1).length}</span></div>${wirePoints(w).slice(1,-1).map((p,i)=>`<div class="angle-row">Angle ${i+1} · ${Math.round(p.x)}, ${Math.round(p.y)}<button class="icon-button" data-remove-angle="${i}" title="Supprimer cet angle">×</button></div>`).join('')}<button class="button full" id="straighten-wire">Routage automatique</button><p class="inspector-note">Tirez directement sur un segment pour le déplacer. Les pins restent attachés aux blocs. Glissez les poignées carrées pour déplacer les angles. Double-cliquez sur un segment pour ajouter un angle. Glissez les poignées rondes aux extrémités pour repositionner les pins sur leur bloc. Alt + glisser : placement libre dans le bloc.</p><button class="button full" id="remove-wire">Supprimer la connexion</button>`;
  }else target.innerHTML='<div class="empty-inspector"><span>◇</span><p>Sélectionnez un composant, une connexion ou un dessin pour modifier ses propriétés.</p></div><p class="inspector-note">Pins : □ entrée · ▶ sortie · ◇ bidirectionnel.<br>Cliquez sur un pin pour démarrer un fil ; cliquez dans la vue pour placer les points de passage ; terminez sur un pin. Tirez sur un segment pour le déplacer. Les fils restent horizontaux ou verticaux.<br>R rectangle : glisser. T texte : cliquer.<br>V sélection, W connexion, H déplacer, P positionner les pins. Suppr supprimer, Ctrl+Z annuler. Échap annuler une création. Molette pour zoomer ; espace + glisser pour déplacer.</p>';
}
function render(){showPower=project.visibility?.power!==false;showSignal=project.visibility?.signal!==false;$('#toggle-power').setAttribute('aria-pressed',String(showPower));$('#toggle-signal').setAttribute('aria-pressed',String(showSignal));renderLibrary();renderBlocks();renderWires();renderAnnotations();renderInspector();$('#project-name').value=project.name;$('#canvas-title').textContent=project.name;$('#stats').textContent=`${project.blocks.length} composants · ${project.wires.length} connexions · ${(project.annotations||[]).length} dessins`;$('#undo').disabled=!past.length;$('#redo').disabled=!future.length;}
function updateView(){ $('#world').style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;$('#zoom-label').textContent=Math.round(view.scale*100)+' %';$('#canvas').style.backgroundSize=`${GRID*view.scale}px ${GRID*view.scale}px`;$('#canvas').style.backgroundPosition=`${view.x-GRID*view.scale/2}px ${view.y-GRID*view.scale/2}px`; }
function point(event){const r=$('#canvas').getBoundingClientRect();return{x:(event.clientX-r.left-view.x)/view.scale,y:(event.clientY-r.top-view.y)/view.scale};}
function zoom(factor,cx,cy){const r=$('#canvas').getBoundingClientRect(),x=cx??r.width/2,y=cy??r.height/2,s=Math.max(.3,Math.min(2,view.scale*factor));view.x=x-(x-view.x)*s/view.scale;view.y=y-(y-view.y)*s/view.scale;view.scale=s;updateView();}
function fit(){if(!project.blocks.length&&!(project.annotations||[]).length){view={x:0,y:0,scale:1};return updateView();}const r=$('#canvas').getBoundingClientRect(),all=project.blocks.flatMap(b=>[{x:b.x,y:b.y},{x:b.x+blockWidth(b),y:b.y+blockHeight(b)}]).concat(project.wires.flatMap(w=>w.points||[])).concat((project.annotations||[]).flatMap(a=>[{x:a.x,y:a.y},{x:a.x+a.width,y:a.y+a.height}])),minX=Math.min(...all.map(p=>p.x)),minY=Math.min(...all.map(p=>p.y)),maxX=Math.max(...all.map(p=>p.x)),maxY=Math.max(...all.map(p=>p.y));view.scale=Math.max(.3,Math.min(1,(r.width-80)/(maxX-minX),(r.height-170)/(maxY-minY)));view.x=(r.width-(maxX-minX)*view.scale)/2-minX*view.scale;view.y=120+(r.height-160-(maxY-minY)*view.scale)/2-minY*view.scale;updateView();}
function removeSelected(){if(!selected)return;mutate(()=>{if(selected.kind==='multi'){const ids=k=>new Set(selected.items.filter(i=>i.kind===k).map(i=>i.id)),blocks=ids('block'),wires=ids('wire'),annotations=ids('annotation');project.blocks=project.blocks.filter(b=>!blocks.has(b.id));project.wires=project.wires.filter(w=>!wires.has(w.id)&&!blocks.has(w.from.block)&&!blocks.has(w.to.block));project.annotations=(project.annotations||[]).filter(a=>!annotations.has(a.id));}else if(selected.kind==='block'){project.blocks=project.blocks.filter(b=>b.id!==selected.id);project.wires=project.wires.filter(w=>w.from.block!==selected.id&&w.to.block!==selected.id);}else if(selected.kind==='annotation')project.annotations=project.annotations.filter(a=>a.id!==selected.id);else project.wires=project.wires.filter(w=>w.id!==selected.id);selected=null;pending=null;});}
function connect(e){const a=endpoint(e);if(!a)return;if(!pending){pending={...e,points:[]};selected=null;renderBlocks();renderWires();renderInspector();toast('Clic gauche : ajouter un angle · Terminez sur un pin · Échap : annuler');return;}let from={block:pending.block,port:pending.port},to=e,points=clone(pending.points||[]);const start=endpoint(from);if(!start){pending=null;return;}if(from.block===to.block){toast('Choisissez un port sur un autre composant.');return;}if(!compatible(start.p,a.p)){toast(`Types incompatibles : ${typeName(start.p)} et ${typeName(a.p)}. Renseignez les types Custom des deux ports.`);return;}if(start.p.direction==='in'&&a.p.direction!=='in'){[from,to]=[to,from];points.reverse();}else if(start.p.direction==='in'||a.p.direction==='out'){toast('Reliez une sortie à une entrée, ou deux ports bidirectionnels.');return;}if(project.wires.some(w=>(w.from.block===from.block&&w.from.port===from.port&&w.to.block===to.block&&w.to.port===to.port)||(w.to.block===from.block&&w.to.port===from.port&&w.from.block===to.block&&w.from.port===to.port))){toast('Ces ports sont déjà connectés.');return;}mutate(()=>{const w={id:uid(),from,to,points};project.wires.push(w);selected={kind:'wire',id:w.id};pending=null;});toast('Connexion '+typeName(start.p)+' créée.');}
function pinOnBorder(b,p){const h=blockHeight(b),x=Math.max(0,Math.min(blockWidth(b),Math.round((p.x-b.x)/GRID)*GRID)),y=Math.max(0,Math.min(h,Math.round((p.y-b.y)/GRID)*GRID));if(p.free)return {x,y};const candidates=[{x:0,y},{x:blockWidth(b),y},{x,y:0},{x,y:h}];return candidates.reduce((best,pos)=>Math.hypot(b.x+pos.x-p.x,b.y+pos.y-p.y)<Math.hypot(b.x+best.x-p.x,b.y+best.y-p.y)?pos:best,candidates[0]);}
function closestSegment(points,p){let best=0,distance=Infinity;for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(d<distance){distance=d;best=i;}}return best;}
function segmentDistance(a,b,p){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
$('#library-list').addEventListener('click',event=>{const edit=event.target.closest('[data-edit-component]');if(edit){selected={kind:'library',id:edit.dataset.editComponent};renderBlocks();renderWires();renderAnnotations();renderInspector();return;}const card=event.target.closest('[data-component]');if(!card)return;const c=library.find(c=>c.id===card.dataset.component),r=$('#canvas').getBoundingClientRect();mutate(()=>{const b=makeBlock(c,(r.width/2-view.x)/view.scale-102+project.blocks.length%4*15,(r.height/2-view.y)/view.scale-50+project.blocks.length%4*15);project.blocks.push(b);selected={kind:'block',id:b.id};});});
$('#search').addEventListener('input',renderLibrary);
document.querySelectorAll('[data-filter]').forEach(el=>el.onclick=()=>{filter=el.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===el));renderLibrary();});
let spaceDown=false;
$('#canvas').addEventListener('pointerdown',event=>{
  if(event.target.closest('.zoom-controls'))return;
  if(event.button!==0&&event.button!==1)return;
  const dot=event.target.closest('[data-port]'),block=event.target.closest('[data-block]'),wire=event.target.closest('[data-wire]'),angle=event.target.closest('[data-angle]'),handle=event.target.closest('[data-endpoint]');
  if(mode==='pan'||spaceDown||event.button===1){event.preventDefault();drag={kind:'pan',startX:event.clientX,startY:event.clientY,x:view.x,y:view.y};}
  else if((mode==='rect'||mode==='text')&&drawingPointerDown(event,point(event))){}
  else if(event.target.closest('[data-resize-block]')){const id=event.target.closest('[data-resize-block]').dataset.resizeBlock,b=project.blocks.find(b=>b.id===id);selected={kind:'block',id};drag={kind:'resize-block',id,start:snapPoint(point(event)),baseline:clone(b),changed:false};renderInspector();}
  else if(angle){const w=project.wires.find(w=>w.id===angle.dataset.wireId);drag={kind:'angle',wire:w.id,index:Number(angle.dataset.angle),baseline:wirePoints(w).map(p=>({x:p.x,y:p.y})),changed:false};}
  else if(handle||(dot&&mode==='pin')){const e=handle?project.wires.find(w=>w.id===handle.dataset.wireId)[handle.dataset.endpoint]:{block:block.dataset.block,port:dot.dataset.port};drag={kind:'pin',block:e.block,port:e.port,changed:false};if(!handle){selected={kind:'block',id:e.block};renderInspector();}}
  else if(dot){connect({block:block.dataset.block,port:dot.dataset.port});return;}
  else if(pending){pending.points.push(snapPoint(point(event)));pending.cursor=null;renderWires();return;}
  else if(mode==='select'&&selected?.kind==='multi'&&startGroupDrag(event,point(event))){}
  else if(drawingPointerDown(event,point(event))){}
  else if(block){selected={kind:'block',id:block.dataset.block};const b=project.blocks.find(b=>b.id===selected.id);const p=point(event);drag={kind:'block',id:b.id,dx:p.x-b.x,dy:p.y-b.y,oldX:b.x,oldY:b.y,changed:false};renderBlocks();renderWires();renderInspector();}
  else if(wire){const w=project.wires.find(w=>w.id===wire.dataset.wire),route=wirePoints(w),p=point(event);selected={kind:'wire',id:w.id};drag={kind:'segment',wire:w.id,index:closestSegment(route,p),baseline:route.map(p=>({x:p.x,y:p.y})),start:snapPoint(p),changed:false};renderWires();renderInspector();}
  else{selected=null;pending=null;drag={kind:'marquee',start:point(event),end:point(event)};renderBlocks();renderWires();renderInspector();}
  renderAnnotations();if(drag)$('#canvas').setPointerCapture(event.pointerId);
});
$('#canvas').addEventListener('pointermove',event=>{
  const p=point(event);
  if(drag?.kind==='pan'){view.x=drag.x+event.clientX-drag.startX;view.y=drag.y+event.clientY-drag.startY;updateView();}
  else if(drag?.kind==='marquee'){drag.end=p;selected={kind:'multi',items:objectsInRectangle(drag.start,p)};renderBlocks();renderWires();renderAnnotations();renderInspector();}
  else if(drag?.kind==='group'){const delta=snapPoint({x:p.x-drag.start.x,y:p.y-drag.start.y});if(!drag.changed&&(delta.x||delta.y)){checkpoint();drag.changed=true;}if(drag.changed){moveSelection(drag.baseline,delta);renderBlocks();renderWires();renderAnnotations();}}
  else if(drawingPointerMove(p)){}
  else if(drag?.kind==='resize-block'){const b=project.blocks.find(b=>b.id===drag.id),pos=snapPoint(p),dx=pos.x-drag.start.x,dy=pos.y-drag.start.y;if(!drag.changed&&(dx||dy)){checkpoint();drag.changed=true;}if(drag.changed){b.ports=clone(drag.baseline.ports);b.width=blockWidth(drag.baseline);b.height=blockHeight(drag.baseline);resizeBlock(b,b.width+dx,b.height+dy);renderBlocks();renderWires();}}
  else if(drag?.kind==='block'){const b=project.blocks.find(b=>b.id===drag.id);if(!b)return;const pos=snapPoint({x:p.x-drag.dx,y:p.y-drag.dy});if(!drag.changed&&(pos.x!==b.x||pos.y!==b.y)){checkpoint();drag.changed=true;}Object.assign(b,pos);const el=document.querySelector(`[data-block="${b.id}"]`);el.style.left=b.x+'px';el.style.top=b.y+'px';renderWires();}
  else if(drag?.kind==='segment'){const w=project.wires.find(w=>w.id===drag.wire);if(!w)return;const a=drag.baseline[drag.index],b=drag.baseline[drag.index+1],horizontal=a.y===b.y,pos=snapPoint(p),delta=horizontal?pos.y-drag.start.y:pos.x-drag.start.x;if(!drag.changed&&delta){checkpoint();drag.changed=true;}if(drag.changed){w.points=moveSegment(drag.baseline,drag.index,delta);renderWires();}}
  else if(drag?.kind==='angle'){const w=project.wires.find(w=>w.id===drag.wire),pos=snapPoint(p),old=drag.baseline[drag.index];if(!w)return;if(!drag.changed&&(old.x!==pos.x||old.y!==pos.y)){checkpoint();drag.changed=true;}if(drag.changed){w.points=moveCorner(drag.baseline,drag.index,pos);renderWires();}}
  else if(drag?.kind==='pin'){const b=project.blocks.find(b=>b.id===drag.block),pin=b?.ports.find(q=>q.id===drag.port);if(!pin)return;const pos=pinOnBorder(b,{...p,free:event.altKey}),old=portPosition(b,pin);if(!drag.changed&&(pos.x!==old.x||pos.y!==old.y)){checkpoint();drag.changed=true;}if(drag.changed){pin.position=pos;renderBlocks();renderWires();}}
  else if(pending){pending.cursor=snapPoint(p);renderWires();}
});
function finishDrag(){if(finishDrawing())return;if(drag?.kind==='marquee'){if(!selected?.items?.length)selected=null;drag=null;renderBlocks();renderWires();renderAnnotations();renderInspector();return;}if(drag?.changed){save();renderInspector();$('#undo').disabled=!past.length;$('#redo').disabled=!future.length;}drag=null;}
$('#canvas').addEventListener('pointerup',finishDrag);$('#canvas').addEventListener('pointercancel',()=>{if(drawingDraft){drawingDraft=null;drag=null;renderAnnotations();}else finishDrag();});
$('#canvas').addEventListener('dblclick',event=>{if(pending||mode==='pan'||mode==='pin'||event.target.closest('[data-block]')||event.target.closest('.zoom-controls'))return;const el=event.target.closest('[data-wire]'),raw=point(event);let w=el&&project.wires.find(w=>w.id===el.dataset.wire);if(!w){let distance=10/view.scale;project.wires.forEach(candidate=>{const points=wirePoints(candidate);if(!visiblePort(points[0].p)||!visiblePort(points.at(-1).p))return;const i=closestSegment(points,raw),d=segmentDistance(points[i],points[i+1],raw);if(d<distance){distance=d;w=candidate;}});}if(!w)return;const p=snapPoint(raw),index=closestSegment(wirePoints(w),p);mutate(()=>{w.points=wirePoints(w).slice(1,-1).map(p=>({x:p.x,y:p.y}));w.points.splice(index,0,p);selected={kind:'wire',id:w.id};});});
$('#canvas').addEventListener('wheel',event=>{event.preventDefault();const r=$('#canvas').getBoundingClientRect();zoom(event.deltaY<0?1.1:1/1.1,event.clientX-r.left,event.clientY-r.top);},{passive:false});
// Keep text and numeric edits live without rebuilding the field being edited.
let liveInput=null;
const liveFields=new WeakSet();
$('#inspector-content').addEventListener('input',event=>{
  const el=event.target;if(!el.matches('input,textarea'))return;
  const b=(selected?.kind==='library'?library:project.blocks).find(b=>b.id===selected?.id),w=selected?.kind==='wire'&&project.wires.find(w=>w.id===selected.id);
  let obj,key,value;
  if(w&&el.dataset.wireProp==='customType'){obj=w;key='customType';value=el.value.trim()||'Personnalisé';}
  else if(b&&el.dataset.prop){obj=b;key=el.dataset.prop;value=key==='currentMa'?Number(el.value):el.value.trim()||(key==='name'?'Sans nom':'');if(key==='currentMa'&&(!Number.isFinite(value)||value<0))return;}
  else if(b&&el.dataset.portProp){obj=b.ports.find(p=>p.id===el.closest('[data-edit-port]').dataset.editPort);key=el.dataset.portProp;value=el.value.trim()||(key==='name'?'Port':'');}
  else return;
  if(liveInput!==el){checkpoint();liveInput=el;}liveFields.add(el);if(['width','height'].includes(key)){const n=Number(el.value);if(!Number.isFinite(n)||n<=0)return;resizeBlock(b,key==='width'?n:blockWidth(b),key==='height'?n:blockHeight(b));}else obj[key]=value;save();if(selected?.kind==='library')renderLibrary();renderBlocks();renderWires();$('#undo').disabled=!past.length;$('#redo').disabled=!future.length;
  const heading=$('#inspector-content .selection-header strong');if(heading)heading.textContent=w?'Connexion '+wireType(w):b.name;
});
$('#inspector-content').addEventListener('focusout',event=>{
  const el=event.target;if(liveInput!==el)return;liveInput=null;
  if(['width','height'].includes(el.dataset.prop)){const b=(selected?.kind==='library'?library:project.blocks).find(b=>b.id===selected?.id);if(b)el.value=el.dataset.prop==='width'?blockWidth(b):blockHeight(b);}
  if(el.dataset.prop==='currentMa'&&(!Number.isFinite(Number(el.value))||Number(el.value)<0)){const b=(selected?.kind==='library'?library:project.blocks).find(b=>b.id===selected?.id);el.value=b?.currentMa||0;toast('Saisissez un courant positif ou nul en mA.');}
  if(el.dataset.portProp==='customType'){const b=(selected?.kind==='library'?library:project.blocks).find(b=>b.id===selected?.id),p=b?.ports.find(p=>p.id===el.closest('[data-edit-port]').dataset.editPort);if(p){const count=project.wires.length;project.wires=project.wires.filter(w=>{if(![w.from.port,w.to.port].includes(p.id))return true;const a=endpoint(w.from),z=endpoint(w.to);return compatible(a.p,z.p);});if(count!==project.wires.length)toast('Les connexions devenues incompatibles ont été retirées.');save();renderWires();}}
});
$('#inspector-content').addEventListener('change',event=>{
  const el=event.target;
  if(liveFields.has(el))return;
  if(selected?.kind==='wire'&&el.dataset.wireProp){const w=project.wires.find(w=>w.id===selected.id);mutate(()=>{if(el.dataset.wireProp==='type'){if(el.value==='custom')w.customType='Personnalisé';else delete w.customType;}else w.customType=el.value.trim()||'Personnalisé';});return;}
  const b=(selected?.kind==='library'?library:project.blocks).find(b=>b.id===selected?.id);if(!b)return;
  if(el.dataset.prop){const key=el.dataset.prop;if(['width','height'].includes(key)){const n=Number(el.value);if(!Number.isFinite(n)||n<=0)return;mutate(()=>resizeBlock(b,key==='width'?n:blockWidth(b),key==='height'?n:blockHeight(b)));return;}if(key==='currentMa'){const n=Number(el.value);if(!Number.isFinite(n)||n<0){toast('Saisissez un courant positif ou nul en mA.');el.value=b.currentMa||0;return;}mutate(()=>b.currentMa=n);}else mutate(()=>b[key]=el.value.trim()||(key==='name'?'Sans nom':''));}
  else if(el.dataset.portProp){const p=b.ports.find(p=>p.id===el.closest('[data-edit-port]').dataset.editPort),key=el.dataset.portProp;mutate(()=>{p[key]=el.value.trim()||(key==='name'?'Port':'');if(['type','direction','customType'].includes(key)){const count=project.wires.length;project.wires=project.wires.filter(w=>{if(![w.from.port,w.to.port].includes(p.id))return true;const a=endpoint(w.from),z=endpoint(w.to);return compatible(a.p,z.p)&&a.p.direction!=='in'&&z.p.direction!=='out';});if(count!==project.wires.length)toast('Les connexions devenues incompatibles ont été retirées.');}pending=null;});}
});
$('#inspector-content').addEventListener('click',event=>{
  if(event.target.id==='remove-wire'){removeSelected();return;}
  if(selected?.kind==='wire'){const w=project.wires.find(w=>w.id===selected.id);if(event.target.id==='straighten-wire')mutate(()=>w.points=[]);if(event.target.dataset.removeAngle!==undefined)mutate(()=>{w.points=wirePoints(w).slice(1,-1).map(p=>({x:p.x,y:p.y}));w.points.splice(Number(event.target.dataset.removeAngle),1);});return;}
  const b=(selected?.kind==='library'?library:project.blocks).find(b=>b.id===selected?.id);if(!b)return;
  if(event.target.id==='toggle-block-current'){mutate(()=>b.showCurrent=b.showCurrent===false);}
  else if(event.target.dataset.resetPin){const p=b.ports.find(p=>p.id===event.target.dataset.resetPin);mutate(()=>delete p.position);}
  else if(event.target.closest('.remove-port')){const id=event.target.closest('[data-edit-port]').dataset.editPort;mutate(()=>{b.ports=b.ports.filter(p=>p.id!==id);project.wires=project.wires.filter(w=>w.from.port!==id&&w.to.port!==id);pending=null;});}
  else if(event.target.id==='add-port'){if(b.ports.length>=100){toast('Limite : 100 ports par bloc.');return;}mutate(()=>b.ports.push(port('Nouveau port','Logique','in')));}
  else if(event.target.id==='store-component'){mutate(()=>{library.push({...clone(b),id:uid(),ports:b.ports.map(p=>({...p,id:uid()})),x:undefined,y:undefined});});toast('Composant ajouté à votre bibliothèque.');}
});
['select','wire','pan','pin','rect','text'].forEach(m=>$('#'+m+'-tool').onclick=()=>setMode(m));
function togglePins(key){pending=null;mutate(()=>{project.visibility??={power:true,signal:true};project.visibility[key]=project.visibility[key]===false;});}
$('#toggle-power').onclick=()=>togglePins('power');$('#toggle-signal').onclick=()=>togglePins('signal');

$('#undo').onclick=()=>history(true);$('#redo').onclick=()=>history(false);$('#delete').onclick=removeSelected;
$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);$('#fit').onclick=fit;
$('#project-name').onchange=event=>mutate(()=>project.name=event.target.value.trim()||'Sans titre');
$('#new-component').onclick=()=>$('#component-dialog').showModal();
$('#close-dialog').onclick=$('#cancel-dialog').onclick=()=>$('#component-dialog').close();
$('#component-form').onsubmit=event=>{event.preventDefault();const data=new FormData(event.target);mutate(()=>library.push({id:uid(),name:data.get('name').trim()||'Composant',kind:data.get('kind'),description:data.get('description').trim(),ports:[]}));$('#component-dialog').close();event.target.reset();filter='all';document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));$('#search').value='';renderLibrary();toast('Composant créé. Cliquez dessus pour le placer et définir ses ports.');};
function download(value,name){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function diagramSvg(){
  const dark=darkTheme,bg=dark?'#111b22':'#ffffff',fg=dark?'#d7e5e3':'#293c43',panel=dark?'#1b2931':'#ffffff';
  const boxes=project.blocks.map(b=>({x:b.x,y:b.y,width:blockWidth(b),height:blockHeight(b)})).concat(project.annotations||[]),points=boxes.flatMap(b=>[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y+b.height}]).concat(project.wires.flatMap(w=>wirePoints(w)));
  const x=points.length?Math.min(...points.map(p=>p.x))-40:0,y=points.length?Math.min(...points.map(p=>p.y))-40:0,width=points.length?Math.max(...points.map(p=>p.x))-x+40:800,height=points.length?Math.max(...points.map(p=>p.y))-y+40:600;
  const text=(x,y,s,size=12)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fg}">${esc(s)}</text>`;
  const wires=project.wires.map(w=>{const ps=wirePoints(w);if(!ps.length||!visiblePort(ps[0].p)||!visiblePort(ps.at(-1).p))return '';const a=ps[Math.floor((ps.length-1)/2)],b=ps[Math.floor((ps.length-1)/2)+1];return `<path d="${polyline(ps)}" fill="none" stroke="${color(ps[0].p.type)}" stroke-width="2"/>`+text((a.x+b.x)/2,(a.y+b.y)/2-8,wireType(w),10);}).join('');
  const blocks=project.blocks.map(b=>`<g><rect x="${b.x}" y="${b.y}" width="${blockWidth(b)}" height="${blockHeight(b)}" rx="9" fill="${panel}" stroke="#6f9487"/>${text(b.x+16,b.y+28,b.name,16)}${text(b.x+16,b.y+48,b.kind,11)}${b.ports.filter(visiblePort).map(p=>{const e=endpoint({block:b.id,port:p.id}),right=e.x-b.x>blockWidth(b)/2,c=color(p.type),shape=p.direction==='in'?`<rect x="${e.x-5}" y="${e.y-5}" width="10" height="10"/>`:p.direction==='io'?`<path d="M ${e.x} ${e.y-6} l 6 6 -6 6 -6 -6 Z"/>`:`<path d="M ${e.x+(right?-5:5)} ${e.y-6} L ${e.x+(right?6:-6)} ${e.y} L ${e.x+(right?-5:5)} ${e.y+6} Z"/>`;return `<g stroke="${c}" stroke-width="2" fill="${panel}">${shape}</g><text x="${e.x+(right?-12:12)}" y="${e.y+4}" text-anchor="${right?'end':'start'}" font-size="10" fill="${fg}">${esc(p.name+' · '+typeName(p))}</text>`;}).join('')}${b.showCurrent===false?'':text(b.x+12,b.y+blockHeight(b)-12,b.kind==='Alimentation'?'Charge aval : '+formatCurrent(powerBudget(b.id).total):'Consommation : '+formatCurrent(b.currentMa||0),11)}</g>`).join('');
  return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" font-family="Segoe UI, sans-serif"><title>${esc(project.name)}</title><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${bg}"/>${(project.annotations||[]).map(a=>annotationSvg(a).replace(/class="[^"]*"/g,'')).join('')}${wires}${blocks}</svg>`};
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();toast('Export généré : '+name);setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export-diagram').onclick=async()=>{try{const {svg,width,height}=diagramSvg(),name=project.name.replace(/[^a-zA-Z0-9_-]/g,'-')||'synoptique';if($('#export-format').value==='svg'){downloadBlob(new Blob([svg],{type:'image/svg+xml'}),name+'.svg');return;}const scale=Math.min(2,4096/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const img=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error();downloadBlob(blob,name+'.png');}finally{URL.revokeObjectURL(url);}}catch{toast('Impossible de générer l’image. Essayez l’export SVG.');}};
$('#save-project').onclick=()=>download({format:'systemdiagram-project',version:1,project},(project.name.replace(/[^a-zA-Z0-9_-]/g,'-')||'projet')+'.json');
$('#export-library').onclick=()=>download({format:'systemdiagram-library',version:1,components:library},'bibliotheque-systemdiagram.json');
let importMode;
$('#open-project').onclick=()=>{importMode='project';$('#file-input').click();};$('#import-library').onclick=()=>{importMode='library';$('#file-input').click();};
$('#file-input').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>5e6)throw Error('Le fichier dépasse 5 Mo.');const data=JSON.parse(await file.text());if(importMode==='project'){if(data.format!=='systemdiagram-project'||data.version!==1||!validProject(data.project))throw Error('Format de projet invalide.');mutate(()=>{project=normalizeProject(data.project);selected=null;pending=null;});fit();toast('Projet ouvert. Ctrl+Z permet de revenir au précédent.');}else{if(data.format!=='systemdiagram-library'||data.version!==1||!validLibrary(data.components))throw Error('Format de bibliothèque invalide.');mutate(()=>data.components.forEach(c=>library.push({...clone(c),id:uid(),ports:c.ports.map(p=>({...p,id:uid()}))})));toast(data.components.length+' composants importés.');}}catch(error){toast('Import impossible : '+error.message);}};
document.addEventListener('keydown',event=>{if(event.target.matches('input,textarea,select')||$('#component-dialog').open)return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();history(!event.shiftKey);}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();history(false);}else if(event.key==='Backspace'&&pending){event.preventDefault();pending.points.pop();renderWires();}else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeSelected();}else if(event.key==='Escape'){pending=null;drawingDraft=null;drag=null;selected=null;setMode('select');render();}else if(event.key===' '){event.preventDefault();spaceDown=true;}else if(event.key.toLowerCase()==='v')setMode('select');else if(event.key.toLowerCase()==='w')setMode('wire');else if(event.key.toLowerCase()==='h')setMode('pan');else if(event.key.toLowerCase()==='p')setMode('pin');else if(event.key.toLowerCase()==='r')setMode('rect');else if(event.key.toLowerCase()==='t')setMode('text');});
document.addEventListener('keyup',event=>{if(event.key===' ')spaceDown=false;});window.addEventListener('blur',()=>{spaceDown=false;finishDrag();});
normalizeProject(project);setupDrawingTools();render();save();requestAnimationFrame(fit);



let darkTheme=false;try{darkTheme=localStorage.getItem('systemdiagram-theme')==='dark';}catch{}
function applyTheme(){document.documentElement.dataset.theme=darkTheme?'dark':'light';$('#theme-toggle').setAttribute('aria-pressed',String(darkTheme));$('#theme-toggle').textContent=darkTheme?'☀ Mode clair':'☾ Mode sombre';}
$('#theme-toggle').onclick=()=>{darkTheme=!darkTheme;try{localStorage.setItem('systemdiagram-theme',darkTheme?'dark':'light');}catch{}applyTheme();};applyTheme();
