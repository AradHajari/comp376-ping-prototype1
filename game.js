const canvas = document.querySelector('#game');
const overlay = document.querySelector('#overlay');
const overlayTitle = document.querySelector('#overlayTitle');
const overlayText = document.querySelector('#overlayText');
const primary = document.querySelector('#primary');
const scanState = document.querySelector('#scanState');
const status = document.querySelector('#status');
const toast = document.querySelector('#toast');

const W = canvas.width;
const H = canvas.height;
const COLS = 19;
const ROWS = 11;
const CELL = 44;
const OX = Math.round((W - COLS * CELL) / 2);
const OY = 100;
const START = { x: 2.5, y: 5.5 };
const EXIT = { x: 16.5, y: 5.5 };
const GUARD = { x: 15.5, y: 5.5 };
const WALLS = new Set();
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ||
      (x >= 7 && x <= 11 && y >= 3 && y <= 7)) WALLS.add(`${x},${y}`);
  }
}

const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
if (!gl) {
  overlayTitle.textContent = 'WebGL is unavailable';
  overlayText.textContent = 'Open this page in a browser with WebGL enabled to play.';
  primary.style.display = 'none';
  throw new Error('WebGL context unavailable');
}

const vertexSource = `
attribute vec2 a_pos;
attribute vec4 a_color;
uniform vec2 u_resolution;
varying vec4 v_color;
void main() {
  vec2 clip = a_pos / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_color = a_color;
}`;
const fragmentSource = `
precision mediump float;
varying vec4 v_color;
void main() { gl_FragColor = v_color; }`;

function shader(type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
const program = gl.createProgram();
gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
const stride = 6 * 4;
const aPos = gl.getAttribLocation(program, 'a_pos');
const aColor = gl.getAttribLocation(program, 'a_color');
gl.enableVertexAttribArray(aPos);
gl.enableVertexAttribArray(aColor);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 8);
gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), W, H);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.viewport(0, 0, W, H);

let verts = [];
function v(x, y, c) { verts.push(x, y, c[0], c[1], c[2], c[3] ?? 1); }
function tri(a, b, c, color) { v(a[0], a[1], color); v(b[0], b[1], color); v(c[0], c[1], color); }
function rect(x, y, w, h, color) {
  tri([x,y], [x+w,y], [x,y+h], color);
  tri([x+w,y], [x+w,y+h], [x,y+h], color);
}
function diamond(cx, cy, r, color) {
  tri([cx,cy-r], [cx+r,cy], [cx,cy+r], color);
  tri([cx,cy-r], [cx,cy+r], [cx-r,cy], color);
}
function ring(cx, cy, r, thickness, color, count=48) {
  for(let i=0;i<count;i++) {
    const a=i*Math.PI*2/count, b=(i+1)*Math.PI*2/count;
    const p1=[cx+Math.cos(a)*r,cy+Math.sin(a)*r];
    const p2=[cx+Math.cos(b)*r,cy+Math.sin(b)*r];
    const p3=[cx+Math.cos(a)*(r-thickness),cy+Math.sin(a)*(r-thickness)];
    const p4=[cx+Math.cos(b)*(r-thickness),cy+Math.sin(b)*(r-thickness)];
    tri(p1,p2,p3,color);tri(p2,p4,p3,color);
  }
}
function px(x) { return OX + x * CELL; }
function py(y) { return OY + y * CELL; }
function wall(x,y) { return WALLS.has(`${x},${y}`); }
function blocked(x,y,r=.23) {
  return wall(Math.floor(x-r),Math.floor(y-r)) ||
    wall(Math.floor(x+r),Math.floor(y-r)) ||
    wall(Math.floor(x-r),Math.floor(y+r)) ||
    wall(Math.floor(x+r),Math.floor(y+r));
}
function tryMove(dx,dy) {
  if(!blocked(player.x+dx,player.y))player.x+=dx;
  if(!blocked(player.x,player.y+dy))player.y+=dy;
}

function route(from, to) {
  const start = [Math.floor(from.x), Math.floor(from.y)];
  const goal = [Math.floor(to.x), Math.floor(to.y)];
  const q = [start], seen = new Set([start.join(',')]), parent = new Map();
  for(let i=0;i<q.length;i++) {
    const [x,y]=q[i];
    if(x===goal[0]&&y===goal[1]) break;
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;
      if(!wall(nx,ny)&&nx>=0&&ny>=0&&nx<COLS&&ny<ROWS&&!seen.has(key)) {
        seen.add(key);parent.set(key,`${x},${y}`);q.push([nx,ny]);
      }
    }
  }
  const end=goal.join(',');
  if(!seen.has(end)) return [];
  const cells=[];
  let cur=end;
  while(cur!==start.join(',')) {
    const [x,y]=cur.split(',').map(Number);cells.push({x:x+.5,y:y+.5});cur=parent.get(cur);
  }
  return cells.reverse();
}

let mode='intro';
let keys=new Set();
let player={...START};
let enemy={...GUARD,mode:'guard',target:null,path:[],wait:0,patrol:1};
let pingTime=0;
let pingCooldown=0;
let pingOrigin={...START};
let ripple=0;
let scanCount=0;
let time=0;
let toastTime=0;
let last=performance.now();

function setToast(message, seconds=2.1) {
  toast.textContent=message;
  toast.classList.add('show');
  toastTime=seconds;
}
function reset() {
  player={...START};
  enemy={...GUARD,mode:'guard',target:null,path:[],wait:0,patrol:1};
  pingTime=0;pingCooldown=0;ripple=0;scanCount=0;time=0;
  mode='playing';overlay.classList.add('hidden');
  status.textContent='SIGNAL ACTIVE';
  setToast('Find the exit. Scan when you need to see.',2.8);
}
function end(won) {
  mode=won?'win':'caught';
  keys.clear();
  overlayTitle.innerHTML=won?'You found the way out.':'The signal found you.';
  overlayText.textContent=won
    ? `You escaped after ${scanCount} scan${scanCount===1?'':'s'}. Try a different route or scan strategy.`
    : 'The pursuer caught you. Try another route.';
  primary.innerHTML=won?'PLAY AGAIN <span>→</span>':'TRY AGAIN <span>→</span>';
  overlay.classList.remove('hidden');
  status.textContent=won?'SIGNAL CLEAR':'SIGNAL LOST';
}
function scan() {
  if(mode!=='playing'||pingCooldown>0) return;
  pingTime=2.35;
  pingCooldown=1.1;
  pingOrigin={x:player.x,y:player.y};
  ripple=.01;
  scanCount++;
  enemy.mode='investigate';
  enemy.target={...pingOrigin};
  enemy.path=route(enemy,pingOrigin);
  enemy.wait=0;
  setToast('ROOM REVEALED',1.55);
}
primary.addEventListener('click',reset);
window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d','enter'].includes(k))e.preventDefault();
  if(k==='enter'&&mode!=='playing'){reset();return;}
  if(k===' '&&!e.repeat)scan();
  if(mode==='playing'&&!e.repeat){
    const step=.22;
    if(k==='a'||k==='arrowleft')tryMove(-step,0);
    if(k==='d'||k==='arrowright')tryMove(step,0);
    if(k==='w'||k==='arrowup')tryMove(0,-step);
    if(k==='s'||k==='arrowdown')tryMove(0,step);
  }
  keys.add(k);
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());

function moveEnemy(dt) {
  if(enemy.mode==='guard') {
    enemy.y+=enemy.patrol*1.35*dt;
    if(enemy.y>7.35){enemy.y=7.35;enemy.patrol=-1;}
    if(enemy.y<3.65){enemy.y=3.65;enemy.patrol=1;}
    return;
  }
  if(enemy.mode==='search') {
    enemy.wait-=dt;
    if(enemy.wait<=0){enemy.mode='return';enemy.path=route(enemy,GUARD);}
    return;
  }
  if(enemy.path.length===0) {
    if(enemy.mode==='investigate'){enemy.mode='search';enemy.wait=1.5;}
    else {enemy.mode='guard';enemy.patrol=1;}
    return;
  }
  let travel=2.05*dt;
  while(travel>0&&enemy.path.length) {
    const next=enemy.path[0];
    const dx=next.x-enemy.x,dy=next.y-enemy.y,dist=Math.hypot(dx,dy);
    if(dist<=travel){enemy.x=next.x;enemy.y=next.y;enemy.path.shift();travel-=dist;}
    else{enemy.x+=dx/dist*travel;enemy.y+=dy/dist*travel;travel=0;}
  }
}
function update(dt) {
  if(mode!=='playing')return;
  time+=dt;
  pingTime=Math.max(0,pingTime-dt);
  pingCooldown=Math.max(0,pingCooldown-dt);
  if(ripple>0)ripple+=dt*5.5;
  if(ripple>9)ripple=0;
  let dx=0,dy=0;
  if(keys.has('a')||keys.has('arrowleft'))dx--;
  if(keys.has('d')||keys.has('arrowright'))dx++;
  if(keys.has('w')||keys.has('arrowup'))dy--;
  if(keys.has('s')||keys.has('arrowdown'))dy++;
  const mag=Math.hypot(dx,dy)||1;
  dx=dx/mag*3.45*dt;dy=dy/mag*3.45*dt;
  tryMove(dx,dy);
  moveEnemy(dt);
  if(Math.hypot(player.x-enemy.x,player.y-enemy.y)<.47){end(false);return;}
  if(Math.hypot(player.x-EXIT.x,player.y-EXIT.y)<.5){end(true);return;}
  scanState.innerHTML=pingCooldown>0?`${pingCooldown.toFixed(1)}S <span class="keycap">SPACE</span>`:'READY <span class="keycap">SPACE</span>';
}

function render() {
  verts=[];
  rect(0,0,W,H,[.025,.055,.09,1]);
  // Fine frame and map ground.
  rect(OX-8,OY-8,COLS*CELL+16,ROWS*CELL+16,[.08,.16,.22,1]);
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const sx=px(x),sy=py(y),solid=wall(x,y);
    if(solid){
      rect(sx+1,sy+1,CELL-2,CELL-2,[.075,.17,.24,1]);
      rect(sx+2,sy+2,CELL-4,4,[.12,.29,.36,1]);
      rect(sx+4,sy+8,CELL-8,CELL-13,[.075,.14,.19,1]);
    }else{
      const checker=(x+y)%2;
      rect(sx+1,sy+1,CELL-2,CELL-2,checker?[.055,.12,.17,1]:[.06,.13,.18,1]);
      rect(sx+10,sy+10,2,2,[.11,.26,.29,.65]);
    }
  }
  // Exit and its marker.
  const ex=px(EXIT.x),ey=py(EXIT.y);
  ring(ex,ey,20,3,[.23,.92,.75,.65]);
  diamond(ex,ey,11,[.35,1,.82,1]);
  diamond(ex,ey,5,[.93,1,.87,1]);
  // Enemy: visible during scans or when very close.
  const nx=px(enemy.x),ny=py(enemy.y);
  ring(nx,ny,18+Math.sin(time*5)*2,2,[1,.29,.51,.33]);
  diamond(nx,ny,15,[1,.20,.43,1]);
  diamond(nx,ny,7,[1,.66,.72,1]);
  // Darkness fades locally; a scan temporarily exposes the whole map.
  const scanFade=pingTime>0?Math.min(1,pingTime/.45):0;
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const d=Math.hypot(x+.5-player.x,y+.5-player.y);
    const local=Math.max(0,Math.min(1,(d-1.25)/2.05));
    const alpha=Math.min(.93,local*.93)*(1-scanFade);
    if(alpha>.005)rect(px(x),py(y),CELL+1,CELL+1,[.005,.025,.045,alpha]);
  }
  // The ping ring remains visible as the map fades.
  if(ripple>0)ring(px(pingOrigin.x),py(pingOrigin.y),ripple*CELL,2.5,[.43,.92,1,Math.max(0,.8-ripple*.09)]);
  // Player always appears above the fog.
  const hx=px(player.x),hy=py(player.y);
  ring(hx,hy,19,2,[.29,.94,1,.35]);
  diamond(hx,hy,13,[.41,.94,1,1]);
  diamond(hx,hy,5,[.95,1,1,1]);
  // Scan origin briefly flashes so the enemy's destination can be inferred.
  if(pingTime>0){
    const qx=px(pingOrigin.x),qy=py(pingOrigin.y);
    ring(qx,qy,8+Math.sin(time*13)*2,2,[.72,.96,1,.7]);
  }
  gl.clearColor(.025,.055,.09,1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLES,0,verts.length/6);
}
function frame(now) {
  const dt=Math.min(.04,(now-last)/1000);last=now;
  if(toastTime>0){toastTime-=dt;if(toastTime<=0)toast.classList.remove('show');}
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Kept local for playtest review; no telemetry is sent anywhere.
window.PingPrototype={get state(){return {mode,player:{...player},enemy:{x:enemy.x,y:enemy.y,mode:enemy.mode},scans:scanCount,webgl:true};}};
