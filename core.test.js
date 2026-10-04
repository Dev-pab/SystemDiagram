const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');

// Minimal DOM boundary; tests exercise model rules without a browser dependency.
function app(saved=null) {
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, {value:'',style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(name,fn){this.handlers??={};this.handlers[name]=fn;},insertAdjacentHTML(){},getBoundingClientRect(){return {width:1000,height:700,left:0,top:0};}});
    return elements.get(key);
  };
  const context = vm.createContext({
    console,crypto:{randomUUID},CSS:{escape:s=>s},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame(){},
    localStorage:{getItem:()=>saved===null?null:JSON.stringify(saved),setItem(){}},
    document:{documentElement:{dataset:{}},querySelector:element,querySelectorAll:()=>[],addEventListener(){}},
    window:{addEventListener(){}}
  });
  vm.runInContext(fs.readFileSync('drawings.js','utf8'),context);
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return code=>vm.runInContext(code,context);
}

test('project validation rejects missing endpoints and duplicate IDs',()=>{
  const run=app();
  assert.equal(run('validProject(project)'),true);
  assert.equal(run('const bad=clone(project);bad.wires[0].to.port="missing";validProject(bad)'),false);
  assert.equal(run('const duplicate=clone(project);duplicate.blocks[1].id=duplicate.blocks[0].id;validProject(duplicate)'),false);
});
test('connections inherit source type and reject mismatched ports',()=>{
  const run=app();
  run('const power=project.blocks[0],mcu=project.blocks[1];connect({block:power.id,port:power.ports[2].id});connect({block:mcu.id,port:mcu.ports[1].id});');
  assert.equal(run('project.wires.length'),5);
  assert.equal(run('endpoint(project.wires[4].from).p.type'),'GND');
  run('connect({block:power.id,port:power.ports[0].id});connect({block:mcu.id,port:mcu.ports[0].id});');
  assert.equal(run('project.wires.length'),5);
});
test('input-first connection reverses endpoints, duplicate connection is rejected',()=>{
  const run=app();
  run('const power=project.blocks[0],mcu=project.blocks[1];connect({block:mcu.id,port:mcu.ports[1].id});connect({block:power.id,port:power.ports[2].id});');
  assert.equal(run('endpoint(project.wires[4].from).p.direction'),'out');
  run('connect({block:power.id,port:power.ports[2].id});connect({block:mcu.id,port:mcu.ports[1].id});');
  assert.equal(run('project.wires.length'),5);
});
test('two inputs cannot connect; bidirectional bus ports can connect',()=>{
  const run=app();
  run('project.wires=[];const mcu=project.blocks[1],sensor=project.blocks[2];connect({block:mcu.id,port:mcu.ports[0].id});connect({block:sensor.id,port:sensor.ports[0].id});');
  assert.equal(run('project.wires.length'),0);
  run('pending=null;connect({block:sensor.id,port:sensor.ports[2].id});connect({block:mcu.id,port:mcu.ports[2].id});');
  assert.equal(run('project.wires.length'),1);
});
test('deleting a block cleans wires and undo/redo restores consistent state',()=>{
  const run=app();
  run('selected={kind:"block",id:project.blocks[1].id};removeSelected();');
  assert.equal(run('project.blocks.length'),3);
  assert.equal(run('project.wires.length'),1);
  assert.equal(run('validProject(project)'),true);
  run('history(true);');
  assert.equal(run('project.blocks.length'),4);
  assert.equal(run('project.wires.length'),4);
  run('history(false);');
  assert.equal(run('project.blocks.length'),3);
});
test('project and library roundtrip through JSON',()=>{
  const run=app();
  assert.equal(run('validProject(JSON.parse(JSON.stringify(project)))'),true);
  assert.equal(run('validLibrary(JSON.parse(JSON.stringify(library)))'),true);
});

test('straight segments preserve click order and reverse input-first routes',()=>{
  const run=app();
  run('const power=project.blocks[0],mcu=project.blocks[1];connect({block:mcu.id,port:mcu.ports[1].id});pending.points=[{x:350,y:180},{x:180,y:180}];connect({block:power.id,port:power.ports[2].id});');
  assert.equal(run('JSON.stringify(project.wires[4].points)'),JSON.stringify([{x:180,y:180},{x:350,y:180}]));
  assert.equal(run('polyline(wirePoints(project.wires[4])).includes("C")'),false);
  assert.equal(run('validProject(project)'),true);
  run('history(true)');assert.equal(run('project.wires.length'),4);
  run('history(false)');assert.equal(run('project.wires[4].points.length'),2);
});

test('custom protocol requires matching manually entered type names',()=>{
  const run=app();
  run('project.wires=[];const a=project.blocks[1],b=project.blocks[2];a.ports[2].type=b.ports[2].type="Custom";a.ports[2].customType="CAN";b.ports[2].customType="RS485";connect({block:a.id,port:a.ports[2].id});connect({block:b.id,port:b.ports[2].id});');
  assert.equal(run('project.wires.length'),0);
  run('b.ports[2].customType="CAN";connect({block:b.id,port:b.ports[2].id});');
  assert.equal(run('project.wires.length'),1);
  assert.equal(run('wireType(project.wires[0])'),'CAN');
});

test('power budget sums declared currents and excludes signal and ground links',()=>{
  const run=app();
  run('project.blocks[1].currentMa=120;project.blocks[2].currentMa=15;project.blocks[3].currentMa=80;');
  assert.equal(run('powerBudget(project.blocks[0].id).total'),200);
  run('const power=project.blocks[0],sensor=project.blocks[2];connect({block:power.id,port:power.ports[2].id});connect({block:sensor.id,port:sensor.ports[1].id});');
  assert.equal(run('powerBudget(power.id).total'),200);
  run('connect({block:power.id,port:power.ports[1].id});connect({block:sensor.id,port:sensor.ports[0].id});');
  assert.equal(run('powerBudget(power.id).total'),215);
  run('togglePins("power");');
  assert.equal(run('powerBudget(power.id).total'),215);
  assert.equal(run('visiblePort(power.ports[0])'),false);
  assert.equal(run('visiblePort(sensor.ports[2])'),true);
});

test('power graph counts each reachable consumer once and reports loops and multiple sources',()=>{
  const run=app();
  run(`project.blocks=[];project.wires=[];
    const supply=makeBlock(defaults[5],0,0),left=makeBlock(defaults[5],300,0),right=makeBlock(defaults[5],300,300),load=makeBlock(defaults[4],600,0);
    left.ports.push(port('Entrée','5V','in'));right.ports.push(port('Entrée','5V','in'));supply.ports.push(port('Entrée','5V','in'));
    left.currentMa=10;right.currentMa=20;load.currentMa=50;project.blocks=[supply,left,right,load];
    function edge(a,p,b,q){project.wires.push({id:uid(),from:{block:a.id,port:a.ports[p].id},to:{block:b.id,port:b.ports[q].id}});}
    edge(supply,0,left,3);edge(supply,0,right,3);edge(left,0,load,0);edge(right,0,load,0);`);
  assert.equal(run('powerBudget(supply.id).total'),80);
  assert.equal(run('powerBudget(supply.id).ambiguous'),true);
  run('edge(left,0,supply,3)');
  assert.equal(run('powerBudget(supply.id).cycle'),true);
  assert.equal(run('powerBudget(supply.id).total'),80);
});

test('pin positions follow the block and snap to all four sides',()=>{
  const run=app();
  run('const b=project.blocks[1],p=b.ports[0];p.position=pinOnBorder(b,{x:b.x+90,y:b.y-10});');
  assert.equal(run('p.position.y'),0);
  assert.equal(run('p.position.x'),90);
  assert.equal(run('endpoint({block:b.id,port:p.id}).x'),460);
  run('b.x+=50');assert.equal(run('endpoint({block:b.id,port:p.id}).x'),510);
  assert.equal(run('pinOnBorder(b,{x:b.x+300,y:b.y+110}).x'),200);
  assert.equal(run('pinOnBorder(b,{x:b.x-100,y:b.y+110}).x'),0);
  assert.equal(run('pinOnBorder(b,{x:b.x+100,y:b.y+500}).y'),run('blockHeight(b)'));
  assert.equal(run('JSON.stringify(pinOnBorder(b,{x:b.x+100,y:b.y+110,free:true}))'),JSON.stringify({x:100,y:110}));
});

test('new fields survive JSON, and malformed geometry or negative currents are rejected',()=>{
  const run=app();
  run('project.blocks[1].currentMa=23.5;project.blocks[1].kind="IHM";project.blocks[1].ports[0].position={x:204,y:150};project.wires[0].points=[{x:250,y:200}];project.wires[0].customType="Faisceau";');
  assert.equal(run('validProject(JSON.parse(JSON.stringify(project)))'),true);
  assert.equal(run('validProject({...project,blocks:project.blocks.map(b=>({...b,currentMa:-1}))})'),false);
  run('project.wires[0].points=[{x:"bad",y:20}]');
  assert.equal(run('validProject(project)'),false);
});

test('saved projects with routed wires and moved pins are restored at startup',()=>{
  const run=app();
  run('project.name="Projet conservé";project.blocks[1].currentMa=150;project.blocks[1].ports[0].position={x:100,y:0};project.wires[0].points=[{x:200,y:100},{x:300,y:100}];');
  const restored=app(JSON.parse(run('JSON.stringify({project,library})')));
  assert.equal(restored('project.name'),'Projet conservé');
  assert.equal(restored('project.wires[0].points.length'),2);
  assert.equal(restored('project.blocks[1].ports[0].position.x'),100);
  assert.equal(restored('project.blocks[1].currentMa'),150);
});

test('double click inserts an angle even if selection replaced the SVG target',()=>{
  const run=app();
  run(`const w=project.wires[0],route=wirePoints(w),a=route[0],b=route[1];$('#canvas').handlers.dblclick({clientX:(a.x+b.x)/2,clientY:(a.y+b.y)/2,target:{closest:()=>null}});`);
  assert.ok(run('project.wires[0].points.length')>=1);
  assert.equal(run('selected.id'),run('project.wires[0].id'));
});

test('every routed segment and pin is on the grid and orthogonal after loading older coordinates',()=>{
  const run=app();
  run('project.blocks[0].x=65;project.blocks[0].ports[0].position={x:204,y:87};project.wires[0].points=[{x:315,y:193},{x:357,y:234}];normalizeProject(project);');
  assert.equal(run('project.blocks.every(b=>b.ports.every(p=>{const e=endpoint({block:b.id,port:p.id});return e.x%GRID===0&&e.y%GRID===0;}))'),true);
  assert.equal(run('project.wires.every(w=>{const points=wirePoints(w);return points.every((p,i)=>p.x%GRID===0&&p.y%GRID===0&&(!i||p.x===points[i-1].x||p.y===points[i-1].y));})'),true);
});

test('pulling first, last or middle segment preserves anchors and orthogonality',()=>{
  const run=app();
  run('const route=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:200,y:100}];');
  for(const i of [0,1,2]){
    const points=JSON.parse(run(`JSON.stringify(orthogonalRoute([route[0],...moveSegment(route,${i},30),route.at(-1)]))`));
    assert.deepEqual({x:points[0].x,y:points[0].y},{x:0,y:0});
    assert.deepEqual({x:points.at(-1).x,y:points.at(-1).y},{x:200,y:100});
    assert.ok(points.every((p,i)=>!i||p.x===points[i-1].x||p.y===points[i-1].y));
  }
});

test('corner dragging and block moving never introduce diagonal wire segments',()=>{
  const run=app();
  run('const w=project.wires[0],points=wirePoints(w);w.points=moveCorner(points,1,{x:320,y:140});project.blocks[1].x+=100;project.blocks[1].y+=50;');
  assert.equal(run('wirePoints(w).every((p,i,ps)=>!i||p.x===ps[i-1].x||p.y===ps[i-1].y)'),true);
});

test('rectangle and formatted multiline text survive save, load, deletion and undo',()=>{
  const run=app();
  run(String.raw`const rect=makeAnnotation('rect',{x:15,y:15}),text=makeAnnotation('text',{x:20,y:30});drawingBounds(rect,{x:200,y:200},{x:10,y:20});rect.color='#ff0000';rect.lineStyle='dashed';text.text='Vue système\nAcquisition';text.fontFamily='Monospace';text.bold=true;text.fontSize=24;text.align='center';project.annotations=[rect,text];`);
  assert.equal(run('validProject(project)'),true);
  const restored=app(JSON.parse(run('JSON.stringify({project,library})')));
  assert.equal(restored('project.annotations[1].bold'),true);
  assert.equal(restored('project.annotations[0].lineStyle'),'dashed');
  restored('selected={kind:"annotation",id:project.annotations[0].id};removeSelected();');
  assert.equal(restored('project.annotations.length'),1);
  restored('history(true)');assert.equal(restored('project.annotations.length'),2);
  assert.equal(restored('project.wires.length'),4);
});

test('invalid drawing styles or dimensions are rejected on import',()=>{
  const run=app();
  run('const a=makeAnnotation("rect",{x:0,y:0});project.annotations=[a];');
  assert.equal(run('validProject(project)'),true);
  assert.equal(run('validAnnotation({...a,color:"url(https://example.com)"})'),false);
  assert.equal(run('validAnnotation({...a,fontSize:200})'),false);
  assert.equal(run('validAnnotation({...a,width:-1})'),false);
});

test('resizing blocks preserves border pins and grid-aligned orthogonal connections',()=>{
  const run=app();
  run('const b=project.blocks[1];b.ports[2].position={x:blockWidth(b),y:150};b.ports[3].position={x:100,y:blockHeight(b)};resizeBlock(b,315,425);');
  assert.equal(run('blockWidth(b)'),320);assert.equal(run('blockHeight(b)'),430);
  assert.equal(run('b.ports[2].position.x'),320);assert.equal(run('b.ports[3].position.y'),430);
  assert.equal(run('project.wires.every(w=>wirePoints(w).every((p,i,ps)=>!i||p.x===ps[i-1].x||p.y===ps[i-1].y))'),true);
  run('resizeBlock(b,10,10)');assert.equal(run('blockWidth(b)'),140);assert.equal(run('blockHeight(b)'),run('minimumHeight(b)'));
  assert.equal(run('b.ports.every(p=>portPosition(b,p).y<=blockHeight(b)-30||p.position)'),true);
});

test('resized blocks survive save and undo without losing wires',()=>{
  const run=app();run('mutate(()=>resizeBlock(project.blocks[1],400,500))');
  const restored=app(JSON.parse(run('JSON.stringify({project,library})')));
  assert.equal(restored('blockWidth(project.blocks[1])'),400);assert.equal(restored('blockHeight(project.blocks[1])'),500);
  run('history(true)');assert.equal(run('blockWidth(project.blocks[1])'),200);
  run('history(false)');assert.equal(run('blockWidth(project.blocks[1])'),400);
  assert.equal(run('project.wires.length'),4);
});

test('per-block consumption visibility persists and preserves budgets',()=>{
 const run=app(); const before=run('powerBudget(project.blocks[0].id).total');
 run('mutate(()=>project.blocks[1].showCurrent=false)');
 assert.equal(run('project.blocks[1].showCurrent'),false);
 assert.equal(run('project.blocks[0].showCurrent!==false'),true);
 assert.equal(run('powerBudget(project.blocks[0].id).total'),before);
 const restored=app(JSON.parse(run('JSON.stringify({project,library})')));
 assert.equal(restored('project.blocks[1].showCurrent'),false);
 assert.equal(restored('makeBlock(project.blocks[1],0,0).showCurrent'),false);
 assert.equal(restored('validComponent({...project.blocks[1],showCurrent:"false"})'),false);
 run('history(true)');assert.equal(run('project.blocks[1].showCurrent!==false'),true);
 run('history(false)');assert.equal(run('project.blocks[1].showCurrent'),false);
});
test('legacy global consumption filter migrates to independent block settings',()=>{
 const run=app();run('project.visibility={current:false};project.blocks[1].showCurrent=true;normalizeProject(project)');
 assert.equal(run('project.blocks[0].showCurrent'),false);
 assert.equal(run('project.blocks[1].showCurrent'),true);
 assert.equal(run('project.visibility.current'),undefined);
});

test('marquee selects objects and group movement keeps routes orthogonal with undoable deletion',()=>{
 const run=app();run('selected={kind:"multi",items:objectsInRectangle({x:-100,y:-100},{x:2000,y:2000})};const base=clone(project);base.wires.forEach(w=>w.points=wirePoints(w).slice(1,-1).map(p=>({x:p.x,y:p.y})));checkpoint();moveSelection(base,{x:50,y:20});');
 assert.equal(run('selected.items.length'),8);
 assert.equal(run('project.blocks[0].x'),run('base.blocks[0].x+50'));
 assert.equal(run('project.wires.every(w=>wirePoints(w).every((p,i,ps)=>!i||p.x===ps[i-1].x||p.y===ps[i-1].y))'),true);
 run('removeSelected()');assert.equal(run('project.blocks.length'),0);assert.equal(run('project.wires.length'),0);
 run('history(true)');assert.equal(run('project.blocks.length'),4);
});

test('editing library definitions preserves instances and SVG export respects visibility and escaping',()=>{
 const run=app();run('const original=project.blocks[1].name;mutate(()=>{library[0].name="MCU <test>";library[0].ports.push(port("Test","UART","io"));});');
 assert.equal(run('project.blocks[1].name'),run('original'));
 assert.equal(run('makeBlock(library[0],0,0).ports.length'),7);
 run('project.blocks[1].name="MCU <test>";project.blocks[1].showCurrent=false;darkTheme=true;');
 assert.equal(run('diagramSvg().svg.includes("MCU &lt;test&gt;")'),true);
 assert.equal(run('diagramSvg().svg.includes("#111b22")'),true);
 assert.equal(run('diagramSvg().svg.includes("foreignObject")'),false);
 assert.equal(run('diagramSvg().width>0'),true);
});
