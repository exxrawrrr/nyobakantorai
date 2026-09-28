const W = 1280, H = 720, CELL = 32;
const palette = { ink: "#30372d", line: "#5d604d", cream: "#efe6d1", wall: "#e3d5b7", wood: "#b99366", wood2: "#c9a778", olive: "#697a4c", olive2: "#89936a", leaf: "#506844", brown: "#72523b", blue: "#9bbbc0", rug: "#acae86" };
const deskPoints = {
  praroro: [330, 430], paijo: [540, 420], subagjo: [750, 430],
  alex: [390, 610], sumiati: [610, 595], siti: [830, 610],
};
const roomObstacles = [
  [0,0,1280,88], [0,0,42,720], [1238,0,42,720], [0,682,1280,38],
  [60,112,255,145], [358,105,360,170], [756,104,245,145], [1034,92,185,205],
  [245,350,170,92], [455,340,170,92], [665,350,170,92], [305,525,170,90], [525,515,170,90], [745,525,170,90],
];
const employees = ["praroro", "paijo", "subagjo", "alex", "sumiati", "siti"];

function rect(ctx, x, y, w, h, fill, stroke = "") { ctx.fillStyle = fill; ctx.fillRect(x,y,w,h); if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=3; ctx.strokeRect(x+1.5,y+1.5,w-3,h-3); } }
function label(ctx, text, x, y, size=13, align="left") { ctx.fillStyle=palette.ink; ctx.font=`700 ${size}px ui-monospace, Consolas, monospace`; ctx.textAlign=align; ctx.fillText(text,x,y); }
function plant(ctx,x,y,s=1) { rect(ctx,x-12*s,y-17*s,24*s,20*s,"#9a7150",palette.line); for (const [dx,dy,r] of [[0,-32,-.1],[-10,-25,-.6],[11,-24,.55],[-4,-42,-.25]]) { ctx.save(); ctx.translate(x+dx*s,y+dy*s); ctx.rotate(r); ctx.fillStyle=palette.leaf; ctx.fillRect(-5*s,-15*s,10*s,23*s); ctx.restore(); } }
function chair(ctx,x,y,angle=0) { ctx.save(); ctx.translate(x,y); ctx.rotate(angle); rect(ctx,-18,-16,36,34,"#6b745a",palette.line); rect(ctx,-14,16,6,12,palette.brown); rect(ctx,8,16,6,12,palette.brown); ctx.restore(); }
function desk(ctx,x,y,w=150) { ctx.save(); ctx.shadowColor="rgba(67,45,27,.2)";ctx.shadowBlur=8;ctx.shadowOffsetY=7;rect(ctx,x,y,w,58,"#9f754e",palette.line);ctx.shadowColor="transparent";rect(ctx,x+12,y+45,10,35,"#684b37");rect(ctx,x+w-22,y+45,10,35,"#684b37");rect(ctx,x+w/2-26,y-19,52,34,"#39433c",palette.ink);rect(ctx,x+w/2-20,y-13,40,22,"#91b6a2");rect(ctx,x+w/2-4,y+12,8,12,palette.ink);rect(ctx,x+10,y+12,30,6,"#e2d4b8");ctx.restore(); }
function windowPanel(ctx,x,y,w,h) { rect(ctx,x,y,w,h,"#a9c6c3",palette.line); rect(ctx,x+7,y+7,w-14,h-14,"#c8dcda"); ctx.fillStyle="rgba(255,255,255,.45)";ctx.fillRect(x+15,y+10,5,h-22); }
function sofa(ctx,x,y,w=200) { rect(ctx,x,y,w,52,"#788367",palette.line);rect(ctx,x+8,y-21,w-16,30,"#8f9877",palette.line);rect(ctx,x+12,y+42,10,17,palette.brown);rect(ctx,x+w-22,y+42,10,17,palette.brown);rect(ctx,x+42,y+10,4,35,palette.line);rect(ctx,x+w-46,y+10,4,35,palette.line); }
function drawRoom(ctx) {
  rect(ctx,0,0,W,H,"#d7c6a4");
  rect(ctx,42,88,1196,594,palette.cream,palette.line);
  for (let y=88;y<682;y+=32) for(let x=42;x<1238;x+=64){ctx.fillStyle=((x/64+y/32)%2)?palette.wood:palette.wood2;ctx.globalAlpha=.23;ctx.fillRect(x,y,64,31);ctx.globalAlpha=1;}
  rect(ctx,42,88,1196,20,"#c6a777",palette.line);
  for(let x=72;x<980;x+=145) windowPanel(ctx,x,20,116,58);
  label(ctx,"LOUNGE",70,128,12); label(ctx,"MEETING",376,128,12); label(ctx,"COFFEE",775,128,12); label(ctx,"SMOKING / OUTDOOR",1045,128,11);
  rect(ctx,60,112,255,145,"#d8cfad",palette.line);rect(ctx,87,148,185,80,palette.rug);sofa(ctx,80,177,155);rect(ctx,248,150,45,68,"#8a664d",palette.line);plant(ctx,282,235,.8);plant(ctx,75,234,.75);
  rect(ctx,358,105,360,170,"rgba(220,230,218,.72)",palette.line);rect(ctx,420,163,235,68,"#a9855f",palette.line);for(const p of [[410,144,0],[665,144,0],[410,246,Math.PI],[665,246,Math.PI],[535,143,0],[535,247,Math.PI]])chair(ctx,...p);rect(ctx,520,177,36,25,"#d7c8a7");
  rect(ctx,756,104,245,145,"#d0c09f",palette.line);rect(ctx,775,126,205,46,"#7e5c42",palette.line);for(let x=788;x<970;x+=42){rect(ctx,x,136,28,27,"#b7c5a2",palette.line);}rect(ctx,780,186,70,48,"#98714f",palette.line);rect(ctx,870,184,100,50,"#b58b5f",palette.line);label(ctx,"BREW",920,218,10,"center");plant(ctx,988,232,.65);
  rect(ctx,1025,88,213,215,"#bfc5a3",palette.line);for(let x=1042;x<1220;x+=28){ctx.strokeStyle="rgba(72,80,57,.2)";ctx.beginPath();ctx.moveTo(x,96);ctx.lineTo(x,294);ctx.stroke();}rect(ctx,1070,170,105,43,"#8d6a4d",palette.line);chair(ctx,1080,236,.2);chair(ctx,1160,238,-.2);plant(ctx,1202,274,.85);rect(ctx,1015,88,10,215,"#697052");
  rect(ctx,58,302,935,24,"#ded0b4",palette.line);label(ctx,"WORKSTATIONS",70,320,11);
  desk(ctx,245,350);desk(ctx,455,340);desk(ctx,665,350);desk(ctx,305,525);desk(ctx,525,515);desk(ctx,745,525);
  chair(ctx,327,457,.04);chair(ctx,537,447,.04);chair(ctx,747,457,.04);chair(ctx,387,632,.04);chair(ctx,607,622,.04);chair(ctx,827,632,.04);
  plant(ctx,92,646,1);plant(ctx,960,652,.95);plant(ctx,1000,344,.75);plant(ctx,216,493,.65);
  rect(ctx,1018,326,198,330,"#e3d6bb",palette.line);label(ctx,"QUIET CORNER",1036,352,11);sofa(ctx,1045,405,143);rect(ctx,1085,482,68,47,"#aa835e",palette.line);plant(ctx,1185,628,1);plant(ctx,1045,620,.85);rect(ctx,1053,550,120,18,"#8a6848",palette.line);label(ctx,"READ · THINK",1113,565,9,"center");
  for(const [x,y] of [[340,336],[550,326],[760,336],[400,511],[620,501],[840,511]]){ctx.fillStyle="rgba(255,211,120,.24)";ctx.beginPath();ctx.arc(x,y,52,0,Math.PI*2);ctx.fill();rect(ctx,x-7,y-12,14,16,"#e6bd67",palette.line);}
}

function blocked(x,y) { return roomObstacles.some(([ox,oy,ow,oh]) => x>ox-15 && x<ox+ow+15 && y>oy-15 && y<oy+oh+15); }
function path(start, goal) {
  const cols=Math.floor(W/CELL),rows=Math.floor(H/CELL), key=(x,y)=>`${x},${y}`;
  const s=[Math.max(1,Math.min(cols-2,Math.round(start[0]/CELL))),Math.max(3,Math.min(rows-2,Math.round(start[1]/CELL)))];
  const g=[Math.max(1,Math.min(cols-2,Math.round(goal[0]/CELL))),Math.max(3,Math.min(rows-2,Math.round(goal[1]/CELL)))];
  if(blocked(g[0]*CELL,g[1]*CELL)) return [];
  const queue=[s], prev=new Map([[key(...s),null]]);
  for(let i=0;i<queue.length;i++){const [x,y]=queue[i];if(x===g[0]&&y===g[1])break;for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){const k=key(nx,ny);if(nx<1||ny<3||nx>=cols-1||ny>=rows-1||prev.has(k)||blocked(nx*CELL,ny*CELL))continue;prev.set(k,[x,y]);queue.push([nx,ny]);}}
  if(!prev.has(key(...g)))return [];
  const result=[];for(let at=g;at;at=prev.get(key(...at)))result.push([at[0]*CELL,at[1]*CELL]);return result.reverse().slice(1);
}

export function createOfficeScene(canvas, { onSelect, initialMotion = true } = {}) {
  const ctx=canvas.getContext("2d",{alpha:false});ctx.imageSmoothingEnabled=false;
  const images=new Map();
  for(const employee of employees)for(const state of ["idle","walk","think","work","role","seated","front","side","back"]){const image=new Image();image.src=`./assets/generated/characters/${employee}/${state}.svg`;images.set(`${employee}:${state}`,image);}
  const actors=employees.map((id,index)=>({id,x:deskPoints[id][0],y:deskPoints[id][1]+45,state:index%3===0?"think":"idle",route:[]}));
  let selected="praroro",motion=initialMotion,zoom=1,debug=false,last=performance.now(),frame=0;
  function draw(now){
    const dt=Math.min(.04,(now-last)/1000);last=now;frame++;
    if(motion)for(const actor of actors){if(actor.route.length){const [tx,ty]=actor.route[0],dx=tx-actor.x,dy=ty-actor.y,d=Math.hypot(dx,dy),step=105*dt;actor.state="walk";if(d<=step){actor.x=tx;actor.y=ty;actor.route.shift();if(!actor.route.length)actor.state="idle";}else{actor.x+=dx/d*step;actor.y+=dy/d*step;}}}
    ctx.save();ctx.clearRect(0,0,W,H);ctx.translate((W-W*zoom)/2,(H-H*zoom)/2);ctx.scale(zoom,zoom);drawRoom(ctx);
    if(debug){ctx.strokeStyle="rgba(138,79,58,.18)";ctx.lineWidth=1;for(let x=0;x<W;x+=CELL){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=CELL){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}}
    for(const actor of [...actors].sort((a,b)=>a.y-b.y)){const idleState=!actor.route.length&&motion&&Math.floor(now/3500+employees.indexOf(actor.id))%5===0?"role":actor.state;const image=images.get(`${actor.id}:${idleState}`);ctx.save();ctx.shadowColor="rgba(42,36,26,.22)";ctx.shadowBlur=5;ctx.drawImage(image,actor.x-55,actor.y-116,110,110);ctx.restore();if(actor.id===selected){ctx.strokeStyle="#b66042";ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(actor.x,actor.y-3,28,10,0,0,Math.PI*2);ctx.stroke();}label(ctx,actor.id.toUpperCase(),actor.x,actor.y+18,9,"center");}
    ctx.restore();requestAnimationFrame(draw);
  }
  function point(event){const box=canvas.getBoundingClientRect();return [(event.clientX-box.left)/box.width*W,(event.clientY-box.top)/box.height*H];}
  canvas.addEventListener("click",(event)=>{const [px,py]=point(event);const near=actors.find((actor)=>Math.hypot(actor.x-px,actor.y-55-py)<55);if(near){selected=near.id;onSelect?.(selected);return;}if(!motion)return;const actor=actors.find(({id})=>id===selected);actor.route=path([actor.x,actor.y],[px,py]);});
  canvas.addEventListener("keydown",(event)=>{const delta={ArrowLeft:[-CELL,0],ArrowRight:[CELL,0],ArrowUp:[0,-CELL],ArrowDown:[0,CELL]}[event.key];if(!delta||!motion)return;event.preventDefault();const actor=actors.find(({id})=>id===selected);actor.route=path([actor.x,actor.y],[actor.x+delta[0],actor.y+delta[1]]);});
  requestAnimationFrame(draw);
  return {
    select(id){if(employees.includes(id)){selected=id;onSelect?.(id);}},
    motion(value){motion=Boolean(value);if(!motion)actors.forEach((actor)=>{actor.route=[];actor.state="idle";});},
    zoom(delta=0){zoom=Math.max(.85,Math.min(1.2,zoom+delta));},
    reset(){zoom=1;actors.forEach((actor)=>{[actor.x,actor.y]=[deskPoints[actor.id][0],deskPoints[actor.id][1]+45];actor.route=[];actor.state="idle";});},
    debug(value){debug=Boolean(value);},
    selected(){return selected;},
  };
}
