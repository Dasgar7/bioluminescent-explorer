import * as THREE from 'three';

const CONFIG = {
  moveSpeed: 8.2, sprintMult: 1.55, jumpForce: 9.2, gravity: -22,
  playerHeight: 1.65, playerRadius: 0.38, lookSens: 0.0028, lookSensDesktop: 0.002,
  maxPitch: Math.PI/2.25, worldSize: 300, terrainRes: 56, blockSize: 16, streetWidth: 7,
  camModes: ['1st','3rd','Front']
};

let scene, camera, renderer, clock;
let player = { pos: new THREE.Vector3(0,4,0), vel: new THREE.Vector3(), onGround:false, yaw:0, pitch:-0.05 };
let heightData, colliders=[], footprints=[], doors=[];
let moveInput={x:0,y:0}, lastLookX=0, lastLookY=0, keys={};
let fpsEl, camLabelEl, frameCount=0, lastFpsTime=0, started=false, camMode=0;
let cars=[], npcs=[], animals=[], audioCtx=null, footstepTimer=0;
let playerBody=null, walkPhase=0, walkAmt=0;
let interiorActive=null, interiorExitPos=null, interiorGroup=null, interiorFurniture=null;
let outdoorColliders=null;
const INT_ORIGIN = new THREE.Vector3(0, -80, 0);
const _f=new THREE.Vector3(), _r=new THREE.Vector3(), _w=new THREE.Vector3();
const _t=new THREE.Vector3(), _o=new THREE.Vector3();
const _lookDir=new THREE.Vector3(), _tmp=new THREE.Vector3();
let interactEl=null, currentDoorTarget=null, INTERIOR_EXIT_WORLD=null;
const INTERACT_DIST=4.2, INTERACT_DOT=0.86;

const BTYPES = {
  house:{cols:[0xe8d5b7,0xd4c4a8],roof:0x8b4513,h:[5,9],label:'HOUSE',sign:null,enter:true},
  restaurant:{cols:[0xc0392b,0xe74c3c],roof:0x2c3e50,h:[6,10],label:'RESTAURANT',sign:0xe74c3c,enter:true},
  cafe:{cols:[0xf5cba7,0xd5a574],roof:0x5d4e37,h:[5,8],label:'CAFE',sign:0xf39c12,enter:true},
  hospital:{cols:[0xecf0f1,0xffffff],roof:0x3498db,h:[10,15],label:'HOSPITAL',sign:0xe74c3c,enter:true},
  school:{cols:[0xf9e79f,0xf7dc6f],roof:0x1a5276,h:[8,12],label:'SCHOOL',sign:0x2980b9,enter:true},
  police:{cols:[0x2c3e50,0x34495e],roof:0x1a1a2e,h:[7,11],label:'POLICE',sign:0x3498db,enter:true},
  office:{cols:[0xbdc3c7,0xaab7b8],roof:0x566573,h:[12,20],label:null,sign:null,enter:false},
  shop:{cols:[0xaed6f1,0x85c1e9],roof:0x2874a6,h:[5,9],label:'SHOP',sign:0x2ecc71,enter:true}
};

function isClear(x,z,rad=1.2){
  for(const f of footprints)
    if(x+rad>f.x0&&x-rad<f.x1&&z+rad>f.z0&&z-rad<f.z1) return false;
  return true;
}
function addFoot(cx,cz,bw,bd,pad=0.4){
  footprints.push({x0:cx-bw/2-pad,x1:cx+bw/2+pad,z0:cz-bd/2-pad,z1:cz+bd/2+pad});
}

function init(){
  const btn=document.getElementById('start-btn');
  if(btn){
    const go=e=>{e.preventDefault();e.stopPropagation();console.log('[City] Enter');startGame();};
    btn.addEventListener('click',go);
    btn.addEventListener('touchend',go,{passive:false});
  }
  const canvas=document.getElementById('c');
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(window.innerWidth,window.innerHeight,false);
  renderer.setClearColor(0x87CEEB,1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=false;

  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x87CEEB);
  scene.fog=new THREE.Fog(0xB8D4E8,70,250);
  camera=new THREE.PerspectiveCamera(68,window.innerWidth/window.innerHeight,0.15,360);
  clock=new THREE.Clock();

  scene.add(new THREE.AmbientLight(0xffffff,0.6));
  scene.add(new THREE.HemisphereLight(0xffe8c0,0x6a9a6a,0.55));
  const sun=new THREE.DirectionalLight(0xfff5e0,1.5);
  sun.position.set(80,120,50); scene.add(sun);
  const fill=new THREE.DirectionalLight(0xaaccff,0.3);
  fill.position.set(-40,50,-60); scene.add(fill);
  const sunMesh=new THREE.Mesh(new THREE.SphereGeometry(9,12,12),new THREE.MeshBasicMaterial({color:0xfff2a0,fog:false}));
  sunMesh.position.copy(sun.position).normalize().multiplyScalar(200); scene.add(sunMesh);

  try{
    buildGround(); placeBuildings(); placeProps();
    spawnCars(); spawnNpcs(); spawnAnimals();
    buildPlayerBody(); buildInteriorRoom();
  }catch(e){console.error('[City] build error',e);}

  console.log('[City] children:',scene.children.length,'doors:',doors.length);
  player.pos.set(0,CONFIG.playerHeight+0.5,0);
  setupControls();
  window.addEventListener('resize',onResize,{passive:true});
  document.body.addEventListener('touchmove',e=>{if(started)e.preventDefault();},{passive:false});
  fpsEl=document.getElementById('fps');
  camLabelEl=document.getElementById('cam-label');
  interactEl=document.getElementById('interact-btn');
  animate();
  console.log('[City] ready');
}

function startGame(){
  if(started) return;
  document.getElementById('start-screen')?.classList.add('hidden');
  document.getElementById('hud')?.classList.remove('hidden');
  started=true; initAudio();
  if(screen.orientation?.lock) screen.orientation.lock('landscape').catch(()=>{});
}
function initAudio(){
  try{
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended') audioCtx.resume();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
    o.type='sawtooth';o.frequency.value=55;f.type='lowpass';f.frequency.value=180;g.gain.value=0.02;
    o.connect(f);f.connect(g);g.connect(audioCtx.destination);o.start();
  }catch(_){}
}
function playFootstep(){
  if(!audioCtx) return;
  const t=audioCtx.currentTime;
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.06,audioCtx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*0.25));
  const s=audioCtx.createBufferSource(); s.buffer=buf;
  const f=audioCtx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=800;
  const g=audioCtx.createGain(); g.gain.setValueAtTime(0.1,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.06);
  s.connect(f);f.connect(g);g.connect(audioCtx.destination);s.start(t);
}
function playUiClick(){
  if(!audioCtx) return;
  const t=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type='sine';o.frequency.setValueAtTime(880,t);o.frequency.exponentialRampToValueAtTime(440,t+0.08);
  g.gain.setValueAtTime(0.07,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.08);
  o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+0.09);
}

function buildGround(){
  const res=CONFIG.terrainRes,size=CONFIG.worldSize;
  const geo=new THREE.PlaneGeometry(size,size,res-1,res-1); geo.rotateX(-Math.PI/2);
  heightData=new Float32Array(res*res);
  const pos=geo.attributes.position, cols=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i);
    const h=Math.sin(x*0.03)*Math.cos(z*0.028)*0.2;
    pos.setY(i,h); heightData[i]=h;
    const cell=CONFIG.blockSize+CONFIG.streetWidth;
    const mx=((x%cell)+cell)%cell, mz=((z%cell)+cell)%cell;
    const street=mx<CONFIG.streetWidth||mz<CONFIG.streetWidth;
    if(street){cols[i*3]=0.28;cols[i*3+1]=0.29;cols[i*3+2]=0.31;}
    else{cols[i*3]=0.72;cols[i*3+1]=0.74;cols[i*3+2]=0.70;}
  }
  geo.setAttribute('color',new THREE.BufferAttribute(cols,3)); geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true})));
}
function getHeight(x,z){
  if(interiorActive) return INT_ORIGIN.y;
  const res=CONFIG.terrainRes,size=CONFIG.worldSize,half=size/2;
  const u=(x+half)/size,v=(z+half)/size;
  if(u<=0||u>=1||v<=0||v>=1) return 0;
  const fx=u*(res-1),fz=v*(res-1);
  const ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz;
  const i00=iz*res+ix,i10=iz*res+Math.min(ix+1,res-1);
  const i01=Math.min(iz+1,res-1)*res+ix,i11=Math.min(iz+1,res-1)*res+Math.min(ix+1,res-1);
  return ((heightData[i00]??0)*(1-tx)+(heightData[i10]??0)*tx)*(1-tz)+((heightData[i01]??0)*(1-tx)+(heightData[i11]??0)*tx)*tz;
}

function pickType(bi){
  const s=['hospital','school','police','restaurant','cafe','shop','house','house'];
  if(bi<s.length) return s[bi];
  const r=Math.random();
  if(r<0.25) return 'house'; if(r<0.4) return 'shop'; if(r<0.5) return 'cafe';
  if(r<0.55) return 'restaurant'; return 'office';
}

function makeBldg(typeKey,bw,bh,bd){
  const t=BTYPES[typeKey], g=new THREE.Group();
  const col=t.cols[Math.floor(Math.random()*t.cols.length)];
  const bodyMat=new THREE.MeshLambertMaterial({color:col});
  const roofMat=new THREE.MeshLambertMaterial({color:t.roof});
  const winMat=new THREE.MeshLambertMaterial({color:0x1a2a38,emissive:0x223344,emissiveIntensity:0.12});
  const winLit=new THREE.MeshBasicMaterial({color:0xffe8a0});
  const doorMat=new THREE.MeshLambertMaterial({color:0x3d2914});
  const frameMat=new THREE.MeshLambertMaterial({color:0x666666});
  const body=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),bodyMat);
  body.position.y=bh/2; g.add(body);
  if(typeKey==='house'){
    const rh=1.3+Math.random()*0.5;
    const roof=new THREE.Mesh(new THREE.ConeGeometry(Math.max(bw,bd)*0.7,rh,4),roofMat);
    roof.position.y=bh+rh/2; roof.rotation.y=Math.PI/4; g.add(roof);
  } else {
    const roof=new THREE.Mesh(new THREE.BoxGeometry(bw*1.04,0.2,bd*1.04),roofMat);
    roof.position.y=bh+0.1; g.add(roof);
  }
  const dw=Math.min(1.15,bw*0.28), dh=Math.min(2.15,bh*0.38);
  const frame=new THREE.Mesh(new THREE.BoxGeometry(dw+0.25,dh+0.2,0.1),frameMat);
  frame.position.set(0,dh/2,bd/2+0.02); g.add(frame);
  const door=new THREE.Mesh(new THREE.BoxGeometry(dw,dh,0.08),doorMat);
  door.position.set(0,dh/2,bd/2+0.06); g.add(door);
  const handle=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.12),new THREE.MeshLambertMaterial({color:0xc0a060}));
  handle.position.set(dw*0.28,dh*0.5,bd/2+0.12); g.add(handle);
  if(bh>5){
    const rows=Math.min(5,Math.floor(bh/2.3)), cols=Math.max(2,Math.floor(bw/2.1));
    for(let r=1;r<rows;r++) for(let c=0;c<cols;c++){
      if(Math.random()<0.18) continue;
      const w=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.55,0.06),Math.random()<0.2?winLit:winMat);
      w.position.set(-bw/2+1+c*((bw-2)/Math.max(1,cols-1)),1.4+r*2.1,bd/2+0.04);
      g.add(w);
    }
  }
  if(typeKey==='cafe'||typeKey==='restaurant'||typeKey==='shop'){
    const aw=new THREE.Mesh(new THREE.BoxGeometry(bw*0.65,0.08,1.1),new THREE.MeshLambertMaterial({color:t.sign||0xe74c3c}));
    aw.position.set(0,2.5,bd/2+0.55); g.add(aw);
  }
  if(t.label){
    const sign=new THREE.Mesh(new THREE.BoxGeometry(Math.min(bw*0.5,3),0.45,0.1),new THREE.MeshBasicMaterial({color:t.sign||0x3dff9a}));
    sign.position.set(0,bh-0.6,bd/2+0.08); g.add(sign);
    if(typeKey==='hospital'){
      const cv=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.85,0.1),new THREE.MeshBasicMaterial({color:0xe74c3c}));
      cv.position.set(0,bh+1.0,0); g.add(cv);
      const ch=new THREE.Mesh(new THREE.BoxGeometry(0.65,0.2,0.1),new THREE.MeshBasicMaterial({color:0xe74c3c}));
      ch.position.set(0,bh+1.15,0); g.add(ch);
    }
    if(typeKey==='police'){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(bw*0.3,0.16,0.25),new THREE.MeshBasicMaterial({color:0x3498db}));
      bar.position.set(0,bh+0.3,0); g.add(bar);
    }
  }
  return g;
}

function placeBuildings(){
  const half=CONFIG.worldSize*0.42, cell=CONFIG.blockSize+CONFIG.streetWidth;
  let bi=0, enterCount=0;
  for(let gx=-half;gx<half;gx+=cell){
    for(let gz=-half;gz<half;gz+=cell){
      if(Math.abs(gx)<cell*1.05&&Math.abs(gz)<cell*1.05) continue;
      if(Math.random()<0.08) continue;
      const typeKey=pickType(bi++);
      const t=BTYPES[typeKey];
      const bw=CONFIG.blockSize*(0.5+Math.random()*0.36);
      const bd=CONFIG.blockSize*(0.5+Math.random()*0.36);
      const bh=t.h[0]+Math.random()*(t.h[1]-t.h[0]);
      const cx=gx+CONFIG.streetWidth+CONFIG.blockSize*0.5;
      const cz=gz+CONFIG.streetWidth+CONFIG.blockSize*0.5;
      const py=getHeight(cx,cz);
      const grp=makeBldg(typeKey,bw,bh,bd);
      grp.position.set(cx,py,cz); scene.add(grp);
      addFoot(cx,cz,bw,bd);
      if(t.enter){
        colliders.push({min:new THREE.Vector3(cx-bw/2-0.1,py,cz-bd/2-0.1),max:new THREE.Vector3(cx-0.9,py+bh+1,cz+bd/2+0.1)});
        colliders.push({min:new THREE.Vector3(cx+0.9,py,cz-bd/2-0.1),max:new THREE.Vector3(cx+bw/2+0.1,py+bh+1,cz+bd/2+0.1)});
        colliders.push({min:new THREE.Vector3(cx-bw/2-0.1,py,cz-bd/2-0.1),max:new THREE.Vector3(cx+bw/2+0.1,py+bh+1,cz+0.15)});
        doors.push({
          type:typeKey,
          min:new THREE.Vector3(cx-0.85,py,cz+bd/2-0.3),
          max:new THREE.Vector3(cx+0.85,py+2.4,cz+bd/2+1.0),
          exitSpot:new THREE.Vector3(cx,py+CONFIG.playerHeight,cz+bd/2+1.5)
        });
        enterCount++;
      } else {
        colliders.push({
          min:new THREE.Vector3(cx-bw/2-0.1,py,cz-bd/2-0.1),
          max:new THREE.Vector3(cx+bw/2+0.1,py+bh+1,cz+bd/2+0.1)
        });
      }
    }
  }
  console.log('[City] enterable doors:',enterCount);
}

function buildInteriorRoom(){
  interiorGroup=new THREE.Group();
  interiorGroup.position.copy(INT_ORIGIN);
  const wallM=new THREE.MeshLambertMaterial({color:0xf0ebe3});
  const floorM=new THREE.MeshLambertMaterial({color:0xc4a882});
  const ceilM=new THREE.MeshLambertMaterial({color:0xf5f5f5});
  const W=10, D=8, H=3.2;
  const floor=new THREE.Mesh(new THREE.BoxGeometry(W,0.1,D),floorM); floor.position.y=0.05; interiorGroup.add(floor);
  const ceil=new THREE.Mesh(new THREE.BoxGeometry(W,0.1,D),ceilM); ceil.position.y=H; interiorGroup.add(ceil);
  const back=new THREE.Mesh(new THREE.BoxGeometry(W,H,0.2),wallM); back.position.set(0,H/2,-D/2); interiorGroup.add(back);
  const left=new THREE.Mesh(new THREE.BoxGeometry(0.2,H,D),wallM); left.position.set(-W/2,H/2,0); interiorGroup.add(left);
  const right=new THREE.Mesh(new THREE.BoxGeometry(0.2,H,D),wallM); right.position.set(W/2,H/2,0); interiorGroup.add(right);
  const pl=new THREE.PointLight(0xfff5e0,0.9,14,2); pl.position.set(0,H-0.4,0); interiorGroup.add(pl);
  const exitMark=new THREE.Mesh(new THREE.BoxGeometry(2,0.06,0.8),new THREE.MeshBasicMaterial({color:0x3dff9a}));
  exitMark.position.set(0,0.08,D/2-0.5); interiorGroup.add(exitMark);
  interiorFurniture=new THREE.Group(); interiorGroup.add(interiorFurniture);
  interiorGroup.visible=false;
  scene.add(interiorGroup);
  INTERIOR_EXIT_WORLD=INT_ORIGIN.clone().add(new THREE.Vector3(0,CONFIG.playerHeight,D/2-0.5));
}

function fillInterior(type){
  while(interiorFurniture.children.length) interiorFurniture.remove(interiorFurniture.children[0]);
  const wood=new THREE.MeshLambertMaterial({color:0x8b6914});
  const white=new THREE.MeshLambertMaterial({color:0xecf0f1});
  const dark=new THREE.MeshLambertMaterial({color:0x2c3e50});
  function box(w,h,d,mat,x,y,z){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x,y,z); interiorFurniture.add(m);
  }
  if(type==='cafe'||type==='restaurant'){
    box(4,1.0,0.7,wood,0,0.5,-1.5);
    for(const [tx,tz] of [[-2.5,1.5],[0,1.5],[2.5,1.5]]){
      const t=new THREE.Mesh(new THREE.CylinderGeometry(0.45,0.45,0.7,8),wood);
      t.position.set(tx,0.35,tz); interiorFurniture.add(t);
    }
  } else if(type==='hospital'){
    box(2.5,1.05,0.7,white,0,0.52,-1.5);
    for(const tx of [-2.5,2.5]){ box(2.2,0.5,1.0,white,tx,0.55,0.5); }
  } else if(type==='school'){
    for(let i=0;i<4;i++) box(1.2,0.7,0.55,wood,-3+i*2,0.35,1.0);
    box(5,1.2,0.1,new THREE.MeshLambertMaterial({color:0x1a3a1a}),0,2.0,-3.9);
  } else if(type==='police'){
    box(2.5,1.0,0.7,dark,0,0.5,-1.5);
  } else if(type==='house'){
    box(2.0,0.5,1.5,wood,-2.5,0.4,0);
    box(2.0,0.15,1.5,new THREE.MeshLambertMaterial({color:0x5b8def}),-2.5,0.7,0);
    box(1.2,0.7,0.7,wood,2,0.35,1);
  } else {
    box(3,1.0,0.7,wood,0,0.5,-1.5);
  }
}

function getLookDir(out){
  const cp=Math.cos(player.pitch);
  out.set(-Math.sin(player.yaw)*cp, Math.sin(player.pitch), -Math.cos(player.yaw)*cp);
  return out;
}
function updateInteract(){
  if(!interactEl) return;
  currentDoorTarget=null;
  getLookDir(_lookDir);
  const eye=player.pos;
  if(!interiorActive){
    let best=null, bestDot=INTERACT_DOT;
    for(const d of doors){
      const cx=(d.min.x+d.max.x)*0.5, cz=(d.min.z+d.max.z)*0.5;
      const cy=THREE.MathUtils.clamp(eye.y, d.min.y, d.max.y);
      _tmp.set(cx,cy,cz).sub(eye);
      const dist=_tmp.length();
      if(dist>INTERACT_DIST||dist<0.001) continue;
      _tmp.multiplyScalar(1/dist);
      const dot=_tmp.dot(_lookDir);
      if(dot>bestDot){bestDot=dot;best=d;}
    }
    currentDoorTarget=best;
    interactEl.textContent='ENTER';
  } else if(INTERIOR_EXIT_WORLD){
    _tmp.copy(INTERIOR_EXIT_WORLD).sub(eye);
    const dist=_tmp.length();
    if(dist<=INTERACT_DIST&&dist>0.001){
      _tmp.multiplyScalar(1/dist);
      if(_tmp.dot(_lookDir)>INTERACT_DOT) currentDoorTarget='exit';
    }
    interactEl.textContent='EXIT';
  }
  interactEl.classList.toggle('hidden',!currentDoorTarget);
}
function doInteract(){
  if(!currentDoorTarget) return;
  playUiClick();
  if(currentDoorTarget==='exit') exitInterior();
  else enterInterior(currentDoorTarget);
  currentDoorTarget=null;
  if(interactEl) interactEl.classList.add('hidden');
}
function enterInterior(door){
  interiorExitPos=door.exitSpot.clone();
  interiorActive=door.type;
  outdoorColliders=colliders;
  colliders=[];
  fillInterior(door.type);
  interiorGroup.visible=true;
  player.pos.set(INT_ORIGIN.x, INT_ORIGIN.y+CONFIG.playerHeight, INT_ORIGIN.z+2.5);
  player.vel.set(0,0,0);
  scene.fog.near=30; scene.fog.far=40;
  scene.background=new THREE.Color(0x2a2a30);
  console.log('[City] entered',door.type);
}
function exitInterior(){
  if(!interiorActive) return;
  interiorGroup.visible=false;
  interiorActive=null;
  colliders=outdoorColliders||[];
  player.pos.copy(interiorExitPos);
  player.vel.set(0,0,0);
  scene.fog.near=70; scene.fog.far=250;
  scene.background=new THREE.Color(0x87CEEB);
  console.log('[City] exited building');
}

function buildPlayerBody(){
  playerBody=new THREE.Group();
  const skin=new THREE.MeshLambertMaterial({color:0xf0c8a0});
  const shirt=new THREE.MeshLambertMaterial({color:0x3498db});
  const pants=new THREE.MeshLambertMaterial({color:0x2c3e50});
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.48,0.24),shirt);
  torso.position.y=1.05; playerBody.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,6),skin);
  head.position.y=1.45; playerBody.add(head);
  const eyeM=new THREE.MeshBasicMaterial({color:0x222222});
  const eL=new THREE.Mesh(new THREE.SphereGeometry(0.03,5,4),eyeM); eL.position.set(-0.06,1.48,0.14); playerBody.add(eL);
  const eR=new THREE.Mesh(new THREE.SphereGeometry(0.03,5,4),eyeM); eR.position.set(0.06,1.48,0.14); playerBody.add(eR);
  const legL=new THREE.Group(); legL.position.set(-0.12,0.8,0);
  const legLM=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.55,0.14),pants); legLM.position.y=-0.28; legL.add(legLM);
  playerBody.add(legL);
  const legR=new THREE.Group(); legR.position.set(0.12,0.8,0);
  const legRM=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.55,0.14),pants); legRM.position.y=-0.28; legR.add(legRM);
  playerBody.add(legR);
  const armL=new THREE.Group(); armL.position.set(-0.26,1.2,0);
  const armLM=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.45,0.11),shirt); armLM.position.y=-0.22; armL.add(armLM);
  playerBody.add(armL);
  const armR=new THREE.Group(); armR.position.set(0.26,1.2,0);
  const armRM=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.45,0.11),shirt); armRM.position.y=-0.22; armR.add(armRM);
  playerBody.add(armR);
  playerBody.userData={legL,legR,armL,armR,torso};
  playerBody.visible=false;
  scene.add(playerBody);
}

function updatePlayerAnim(dt, moving, speed){
  if(!playerBody) return;
  playerBody.visible = camMode !== 0;
  const target = moving ? Math.min(1, speed/CONFIG.moveSpeed) : 0;
  walkAmt += (target - walkAmt) * Math.min(1, dt*8);
  if(walkAmt > 0.05) walkPhase += dt * 10 * walkAmt;
  else walkPhase *= 0.9;
  const swing = Math.sin(walkPhase) * 0.55 * walkAmt;
  const bob = Math.abs(Math.sin(walkPhase*2)) * 0.04 * walkAmt;
  const ud = playerBody.userData;
  ud.legL.rotation.x = swing;
  ud.legR.rotation.x = -swing;
  ud.armL.rotation.x = -swing * 0.8;
  ud.armR.rotation.x = swing * 0.8;
  ud.torso.position.y = 1.05 + bob;
  playerBody.position.set(player.pos.x, player.pos.y - CONFIG.playerHeight, player.pos.z);
  playerBody.rotation.y = player.yaw;
}

function placeProps(){
  const lampMat=new THREE.MeshLambertMaterial({color:0x3a3a48});
  const glowMat=new THREE.MeshBasicMaterial({color:0xfff2a0});
  const half=CONFIG.worldSize*0.38, cell=CONFIG.blockSize+CONFIG.streetWidth;
  for(let gx=-half;gx<half;gx+=cell){
    for(let gz=-half;gz<half;gz+=cell){
      if(Math.random()<0.5) continue;
      const px=gx+CONFIG.streetWidth*0.4, pz=gz+CONFIG.streetWidth*0.5;
      if(!isClear(px,pz,0.8)) continue;
      const py=getHeight(px,pz);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,3.0,5),lampMat);
      pole.position.set(px,py+1.5,pz); scene.add(pole);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.16,5,4),glowMat);
      bulb.position.set(px,py+3.1,pz); scene.add(bulb);
    }
  }
  let trees=0;
  for(let i=0;i<60&&trees<22;i++){
    const a=Math.random()*Math.PI*2, d=16+Math.random()*(CONFIG.worldSize*0.34);
    const px=Math.cos(a)*d, pz=Math.sin(a)*d;
    if(!isClear(px,pz,1.3)) continue;
    const py=getHeight(px,pz);
    const tg=new THREE.Group();
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,1.6,6),new THREE.MeshLambertMaterial({color:0x5a4030}));
    trunk.position.y=0.8; tg.add(trunk);
    const leaf=new THREE.Mesh(new THREE.SphereGeometry(1.0+Math.random()*0.25,7,6),new THREE.MeshLambertMaterial({color:0x2d8a3e}));
    leaf.position.y=2.2; leaf.scale.y=0.85; tg.add(leaf);
    tg.position.set(px,py,pz); scene.add(tg); trees++;
  }
}

function makeCar(color,taxi){
  const g=new THREE.Group();
  const bodyMat=new THREE.MeshLambertMaterial({color});
  const glass=new THREE.MeshLambertMaterial({color:0x226688,transparent:true,opacity:0.65});
  const wheelMat=new THREE.MeshLambertMaterial({color:0x222222});
  const dark=new THREE.MeshLambertMaterial({color:0x333333});
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.4,0.9),bodyMat);
  body.position.y=0.35; g.add(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.35,0.82),glass);
  cabin.position.set(-0.1,0.7,0); g.add(cabin);
  const hood=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.12,0.85),bodyMat);
  hood.position.set(0.65,0.52,0); g.add(hood);
  for(const wz of [0.3,-0.3]){
    const hl=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.1,0.14),new THREE.MeshBasicMaterial({color:0xfff8e0}));
    hl.position.set(0.98,0.38,wz); g.add(hl);
  }
  for(const wz of [0.3,-0.3]){
    const tl=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.08,0.12),new THREE.MeshBasicMaterial({color:0xff2222}));
    tl.position.set(-0.98,0.38,wz); g.add(tl);
  }
  for(const wz of [0.52,-0.52]){
    const mir=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.06,0.12),dark);
    mir.position.set(0.2,0.65,wz); g.add(mir);
  }
  if(taxi){
    const sign=new THREE.Mesh(new THREE.BoxGeometry(0.35,0.12,0.2),new THREE.MeshBasicMaterial({color:0xffdd00}));
    sign.position.set(-0.1,0.95,0); g.add(sign);
  }
  for(const [wx,wz] of [[0.5,0.42],[0.5,-0.42],[-0.5,0.42],[-0.5,-0.42]]){
    const w=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,0.1,8),wheelMat);
    w.rotation.z=Math.PI/2; w.position.set(wx,0.15,wz); g.add(w);
  }
  return g;
}
function spawnCars(){
  const colors=[0xe74c3c,0x3498db,0x2ecc71,0xf1c40f,0x9b59b6,0xe67e22];
  const cell=CONFIG.blockSize+CONFIG.streetWidth, half=CONFIG.worldSize*0.36;
  let id=0;
  for(let gz=-half;gz<half;gz+=cell){
    if(Math.abs(gz)<cell*0.5||id>=8) continue;
    const taxi=id%4===0;
    const body=makeCar(taxi?0xf1c40f:colors[id%colors.length],taxi);
    const dir=id%2===0?1:-1;
    body.position.set((Math.random()-0.5)*CONFIG.worldSize*0.6,0.5,gz+CONFIG.streetWidth*0.5);
    body.rotation.y=dir>0?Math.PI/2:-Math.PI/2; scene.add(body);
    cars.push({mesh:body,axis:'x',dir,speed:6+Math.random()*4,bound:half}); id++;
  }
  for(let gx=-half;gx<half;gx+=cell){
    if(Math.abs(gx)<cell*0.5||id>=14) continue;
    const taxi=id%4===0;
    const body=makeCar(taxi?0xf1c40f:colors[id%colors.length],taxi);
    const dir=id%2===0?1:-1;
    body.position.set(gx+CONFIG.streetWidth*0.5,0.5,(Math.random()-0.5)*CONFIG.worldSize*0.6);
    body.rotation.y=dir>0?0:Math.PI; scene.add(body);
    cars.push({mesh:body,axis:'z',dir,speed:6+Math.random()*4,bound:half}); id++;
  }
}
function updateCars(dt){
  if(interiorActive) return;
  for(const c of cars){
    if(c.axis==='x'){c.mesh.position.x+=c.dir*c.speed*dt;if(c.mesh.position.x>c.bound)c.mesh.position.x=-c.bound;if(c.mesh.position.x<-c.bound)c.mesh.position.x=c.bound;}
    else{c.mesh.position.z+=c.dir*c.speed*dt;if(c.mesh.position.z>c.bound)c.mesh.position.z=-c.bound;if(c.mesh.position.z<-c.bound)c.mesh.position.z=c.bound;}
    c.mesh.position.y=getHeight(c.mesh.position.x,c.mesh.position.z)+0.18;
  }
}

function makeNpc(col){
  const g=new THREE.Group();
  const skin=new THREE.MeshLambertMaterial({color:0xf0c8a0});
  const shirt=new THREE.MeshLambertMaterial({color:col});
  const pants=new THREE.MeshLambertMaterial({color:0x2c3e50});
  for(const lx of [-0.1,0.1]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.08,0.48,5),pants);leg.position.set(lx,0.24,0);g.add(leg);}
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.45,0.22),shirt); torso.position.set(0,0.72,0); g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.14,6,5),skin); head.position.set(0,1.12,0); g.add(head);
  const eyeM=new THREE.MeshBasicMaterial({color:0x222222});
  const eL=new THREE.Mesh(new THREE.SphereGeometry(0.025,4,3),eyeM); eL.position.set(-0.05,1.14,0.12); g.add(eL);
  const eR=new THREE.Mesh(new THREE.SphereGeometry(0.025,4,3),eyeM); eR.position.set(0.05,1.14,0.12); g.add(eR);
  for(const ax of [-0.24,0.24]){const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.4,5),shirt);arm.position.set(ax,0.7,0);g.add(arm);}
  return g;
}
function spawnNpcs(){
  const cols=[0x3498db,0xe74c3c,0x2ecc71,0xf39c12,0x9b59b6,0x1abc9c];
  const half=CONFIG.worldSize*0.34;
  for(let i=0;i<16;i++){
    const mesh=makeNpc(cols[i%cols.length]);
    let x,z,tries=0;
    do{x=(Math.random()-0.5)*half*2;z=(Math.random()-0.5)*half*2;tries++;}while(!isClear(x,z,0.7)&&tries<15);
    mesh.position.set(x,getHeight(x,z),z); scene.add(mesh);
    const a=Math.random()*Math.PI*2;
    npcs.push({mesh,vx:Math.cos(a)*(1+Math.random()),vz:Math.sin(a)*(1+Math.random()),timer:2+Math.random()*4,bound:half,phase:Math.random()*10});
  }
}
function updateNpcs(dt){
  if(interiorActive) return;
  for(const n of npcs){
    n.timer-=dt; n.phase+=dt*8;
    if(n.timer<=0){const a=Math.random()*Math.PI*2,s=1+Math.random();n.vx=Math.cos(a)*s;n.vz=Math.sin(a)*s;n.timer=2+Math.random()*4;}
    let nx=n.mesh.position.x+n.vx*dt, nz=n.mesh.position.z+n.vz*dt;
    if(!isClear(nx,nz,0.5)){n.vx*=-1;n.vz*=-1;nx=n.mesh.position.x;nz=n.mesh.position.z;}
    if(Math.abs(nx)>n.bound){n.vx*=-1;nx=THREE.MathUtils.clamp(nx,-n.bound,n.bound);}
    if(Math.abs(nz)>n.bound){n.vz*=-1;nz=THREE.MathUtils.clamp(nz,-n.bound,n.bound);}
    n.mesh.position.x=nx;n.mesh.position.z=nz;
    n.mesh.position.y=getHeight(nx,nz)+Math.abs(Math.sin(n.phase))*0.03;
    n.mesh.rotation.y=Math.atan2(n.vx,n.vz);
  }
}

function spawnAnimals(){
  const dogCols=[0x8b6914,0x4a3728,0xd4a574];
  const half=CONFIG.worldSize*0.32;
  for(let i=0;i<6;i++){
    const g=new THREE.Group(), mat=new THREE.MeshLambertMaterial({color:dogCols[i%3]});
    const body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.24,0.24),mat); body.position.set(0,0.24,0); g.add(body);
    const head=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.16,0.16),mat); head.position.set(0.28,0.28,0); g.add(head);
    const snout=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.08,0.1),mat); snout.position.set(0.4,0.24,0); g.add(snout);
    let x,z,tries=0;
    do{x=(Math.random()-0.5)*half*2;z=(Math.random()-0.5)*half*2;tries++;}while(!isClear(x,z,0.5)&&tries<12);
    g.position.set(x,getHeight(x,z),z); scene.add(g);
    const a=Math.random()*Math.PI*2;
    animals.push({mesh:g,vx:Math.cos(a)*1.3,vz:Math.sin(a)*1.3,timer:1.5+Math.random()*3,bound:half});
  }
}
function updateAnimals(dt){
  if(interiorActive) return;
  for(const d of animals){
    d.timer-=dt;
    if(d.timer<=0){const a=Math.random()*Math.PI*2,s=1.2+Math.random()*1.5;d.vx=Math.cos(a)*s;d.vz=Math.sin(a)*s;d.timer=1.5+Math.random()*3;}
    let nx=d.mesh.position.x+d.vx*dt, nz=d.mesh.position.z+d.vz*dt;
    if(!isClear(nx,nz,0.4)){d.vx*=-1;d.vz*=-1;nx=d.mesh.position.x;nz=d.mesh.position.z;}
    if(Math.abs(nx)>d.bound){d.vx*=-1;nx=THREE.MathUtils.clamp(nx,-d.bound,d.bound);}
    if(Math.abs(nz)>d.bound){d.vz*=-1;nz=THREE.MathUtils.clamp(nz,-d.bound,d.bound);}
    d.mesh.position.x=nx;d.mesh.position.z=nz;d.mesh.position.y=getHeight(nx,nz);
    d.mesh.rotation.y=Math.atan2(d.vx,d.vz);
  }
}

function setupControls(){
  const base=document.getElementById('joystick-base'), knob=document.getElementById('joystick-knob');
  const lookZone=document.getElementById('look-zone'), jumpBtn=document.getElementById('jump-btn');
  const camBtn=document.getElementById('cam-btn'), maxStick=40;
  let stickId=null, lookId=null;
  function setStick(dx,dy){
    const len=Math.hypot(dx,dy)||0.0001,c=Math.min(len,maxStick);
    const nx=(dx/len)*c, ny=(dy/len)*c;
    if(knob) knob.style.transform=`translate(${nx}px,${ny}px)`;
    moveInput.x=nx/maxStick; moveInput.y=-ny/maxStick;
  }
  function resetStick(){if(knob)knob.style.transform='translate(0px,0px)';moveInput.x=0;moveInput.y=0;stickId=null;}
  if(base){
    base.addEventListener('touchstart',e=>{e.preventDefault();if(stickId!==null)return;const t=e.changedTouches[0];stickId=t.identifier;const r=base.getBoundingClientRect();setStick(t.clientX-(r.left+r.width/2),t.clientY-(r.top+r.height/2));},{passive:false});
    base.addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches)if(t.identifier===stickId){const r=base.getBoundingClientRect();setStick(t.clientX-(r.left+r.width/2),t.clientY-(r.top+r.height/2));}},{passive:false});
    const end=e=>{for(const t of e.changedTouches)if(t.identifier===stickId)resetStick();};
    base.addEventListener('touchend',end);base.addEventListener('touchcancel',end);
  }
  if(lookZone){
    lookZone.addEventListener('touchstart',e=>{e.preventDefault();if(lookId!==null)return;const t=e.changedTouches[0];lookId=t.identifier;lastLookX=t.clientX;lastLookY=t.clientY;},{passive:false});
    lookZone.addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches)if(t.identifier===lookId){const dx=t.clientX-lastLookX,dy=t.clientY-lastLookY;lastLookX=t.clientX;lastLookY=t.clientY;player.yaw-=dx*CONFIG.lookSens;player.pitch=THREE.MathUtils.clamp(player.pitch-dy*CONFIG.lookSens,-CONFIG.maxPitch,CONFIG.maxPitch);}},{passive:false});
    lookZone.addEventListener('touchend',e=>{for(const t of e.changedTouches)if(t.identifier===lookId)lookId=null;});
  }
  if(jumpBtn){jumpBtn.addEventListener('touchstart',e=>{e.preventDefault();tryJump();},{passive:false});jumpBtn.addEventListener('click',tryJump);}
  if(interactEl){interactEl.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();doInteract();},{passive:false});interactEl.addEventListener('click',doInteract);}
  if(camBtn){camBtn.addEventListener('touchstart',e=>{e.preventDefault();cycleCamera();},{passive:false});camBtn.addEventListener('click',cycleCamera);}
  window.addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space'){e.preventDefault();tryJump();}if(e.code==='KeyC')cycleCamera();});
  window.addEventListener('keyup',e=>{keys[e.code]=false;});
  document.addEventListener('click',()=>{if(started&&!('ontouchstart'in window))document.body.requestPointerLock?.();});
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement){player.yaw-=e.movementX*CONFIG.lookSensDesktop;player.pitch=THREE.MathUtils.clamp(player.pitch-e.movementY*CONFIG.lookSensDesktop,-CONFIG.maxPitch,CONFIG.maxPitch);}});
}
function cycleCamera(){camMode=(camMode+1)%3;if(camLabelEl)camLabelEl.textContent=CONFIG.camModes[camMode];playUiClick();const ch=document.getElementById('crosshair');if(ch)ch.style.opacity=camMode===0?'1':'0';}
function tryJump(){if(player.onGround){player.vel.y=CONFIG.jumpForce;player.onGround=false;}}

function updatePlayer(dt){
  let mx=moveInput.x,my=moveInput.y;
  if(keys['KeyW']||keys['ArrowUp'])my+=1;
  if(keys['KeyS']||keys['ArrowDown'])my-=1;
  if(keys['KeyA']||keys['ArrowLeft'])mx-=1;
  if(keys['KeyD']||keys['ArrowRight'])mx+=1;
  const len=Math.hypot(mx,my);if(len>1){mx/=len;my/=len;}
  _f.set(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
  _r.set(Math.cos(player.yaw),0,-Math.sin(player.yaw));
  const speed=CONFIG.moveSpeed*((keys['ShiftLeft']||keys['ShiftRight'])?CONFIG.sprintMult:1);
  _w.set(0,0,0);_w.addScaledVector(_f,my);_w.addScaledVector(_r,mx);
  if(_w.lengthSq()>0)_w.normalize().multiplyScalar(speed);
  player.vel.x=_w.x;player.vel.z=_w.z;player.vel.y+=CONFIG.gravity*dt;
  let nx=player.pos.x+player.vel.x*dt,ny=player.pos.y+player.vel.y*dt,nz=player.pos.z+player.vel.z*dt;
  const groundY=getHeight(nx,nz)+CONFIG.playerHeight;
  if(ny<=groundY){ny=groundY;player.vel.y=0;player.onGround=true;}else player.onGround=false;
  const pr=CONFIG.playerRadius;
  for(const c of colliders){
    if(nx>c.min.x-pr&&nx<c.max.x+pr&&nz>c.min.z-pr&&nz<c.max.z+pr&&ny>c.min.y&&ny-CONFIG.playerHeight<c.max.y){
      const cx=(c.min.x+c.max.x)*0.5,cz=(c.min.z+c.max.z)*0.5,dx=nx-cx,dz=nz-cz;
      const hx=(c.max.x-c.min.x)*0.5+pr,hz=(c.max.z-c.min.z)*0.5+pr;
      if(hx-Math.abs(dx)<hz-Math.abs(dz))nx=cx+Math.sign(dx||1)*hx;else nz=cz+Math.sign(dz||1)*hz;
    }
  }
  if(!interiorActive){
    const bound=CONFIG.worldSize*0.46;
    nx=THREE.MathUtils.clamp(nx,-bound,bound);nz=THREE.MathUtils.clamp(nz,-bound,bound);
  } else {
    nx=THREE.MathUtils.clamp(nx,INT_ORIGIN.x-4.5,INT_ORIGIN.x+4.5);
    nz=THREE.MathUtils.clamp(nz,INT_ORIGIN.z-3.5,INT_ORIGIN.z+3.8);
  }
  player.pos.set(nx,ny,nz);
  const spd=Math.hypot(player.vel.x,player.vel.z);
  const moving=spd>0.5&&player.onGround;
  if(moving){footstepTimer-=dt;if(footstepTimer<=0){playFootstep();footstepTimer=0.32;}}else footstepTimer=0;
  updatePlayerAnim(dt,moving,spd);
  updateInteract();
  updateCamera();
}
function updateCamera(){
  const eye=_t.copy(player.pos);
  if(camMode===0){camera.position.copy(eye);camera.rotation.order='YXZ';camera.rotation.y=player.yaw;camera.rotation.x=player.pitch;}
  else if(camMode===1){_o.set(Math.sin(player.yaw)*5.5,2.2,Math.cos(player.yaw)*5.5);camera.position.copy(eye).add(_o);camera.lookAt(eye.x,eye.y-0.2,eye.z);}
  else{_o.set(-Math.sin(player.yaw)*4,1.8,-Math.cos(player.yaw)*4);camera.position.copy(eye).add(_o);camera.lookAt(eye.x,eye.y-0.1,eye.z);}
}

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.048);
  if(started){updatePlayer(dt);updateCars(dt);updateNpcs(dt);updateAnimals(dt);}
  else{const t=clock.elapsedTime;camera.position.set(Math.sin(t*0.1)*26,14,Math.cos(t*0.1)*26);camera.lookAt(0,3,0);}
  renderer.render(scene,camera);
  frameCount++;
  if(clock.elapsedTime-lastFpsTime>0.6){if(fpsEl)fpsEl.textContent=Math.round(frameCount/(clock.elapsedTime-lastFpsTime));frameCount=0;lastFpsTime=clock.elapsedTime;}
}
function onResize(){
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight,false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
}
init();
