import * as THREE from 'three';
console.log('[City] BUILD v25 DOOR FIX');
const CONFIG={moveSpeed:8.2,jumpForce:9.2,gravity:-22,playerHeight:1.65,playerRadius:0.4,lookSens:0.0028,lookSensDesktop:0.002,maxPitch:Math.PI/2.25,worldSize:80,camModes:['1st','3rd','Front']};
let scene,camera,renderer,clock;
let player={pos:new THREE.Vector3(0,4,6),vel:new THREE.Vector3(),onGround:false,yaw:Math.PI,pitch:-0.05};
let colliders=[],doors=[],moveInput={x:0,y:0},keys={},lastLookX=0,lastLookY=0;
let fpsEl,camLabelEl,frameCount=0,lastFpsTime=0,started=false,camMode=0;
let playerBody=null,walkPhase=0,walkAmt=0;
let interiorActive=null,interiorExitPos=null,interiorGroup=null,outdoorColliders=null;
const INT_ORIGIN=new THREE.Vector3(0,-80,0);
const _f=new THREE.Vector3(),_r=new THREE.Vector3(),_w=new THREE.Vector3(),_lookDir=new THREE.Vector3(),_tmp=new THREE.Vector3();
let interactEl=null,currentDoorTarget=null,debugEl=null,doorAnim=null,lockedDoor=null;
const INTERACT_DIST=6.0,INTERACT_DOT=0.4;
function init(){
scene=new THREE.Scene();scene.background=new THREE.Color(0x87B8D8);scene.fog=new THREE.Fog(0x87B8D8,40,120);
camera=new THREE.PerspectiveCamera(70,window.innerWidth/window.innerHeight,0.1,200);
renderer=new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true});
renderer.setSize(window.innerWidth,window.innerHeight,false);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
clock=new THREE.Clock();
const amb=new THREE.AmbientLight(0xffffff,0.7);scene.add(amb);
const sun=new THREE.DirectionalLight(0xfff5e0,1.1);sun.position.set(30,50,20);scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.worldSize,CONFIG.worldSize),new THREE.MeshLambertMaterial({color:0x5a8a4a}));
ground.rotation.x=-Math.PI/2;scene.add(ground);
const road=new THREE.Mesh(new THREE.PlaneGeometry(12,CONFIG.worldSize),new THREE.MeshLambertMaterial({color:0x333338}));
road.rotation.x=-Math.PI/2;road.position.y=0.02;scene.add(road);
buildTestHouse();
buildInteriorRoom();
buildPlayerBody();
setupControls();
interactEl=document.getElementById('interact-btn');
debugEl=document.getElementById('door-debug');
fpsEl=document.getElementById('fps');camLabelEl=document.getElementById('cam-label');
window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight,false);});
document.getElementById('start-btn')?.addEventListener('click',startGame);
document.getElementById('start-btn')?.addEventListener('touchend',e=>{e.preventDefault();startGame();},{passive:false});
animate();
console.log('[City]v25 doors',doors.length,'colliders',colliders.length);
}
function startGame(){
if(started)return;
document.getElementById('start-screen')?.classList.add('hidden');
document.getElementById('hud')?.classList.remove('hidden');
started=true;
}
function buildTestHouse(){
const bw=8,bd=7,bh=7,cx=0,cz=-2,py=0;
const g=new THREE.Group();
const body=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),new THREE.MeshLambertMaterial({color:0xe8dcc8}));
body.position.y=bh/2;g.add(body);
const roof=new THREE.Mesh(new THREE.ConeGeometry(6,1.4,4),new THREE.MeshLambertMaterial({color:0x5c4033}));
roof.position.y=bh+0.8;roof.rotation.y=Math.PI/4;g.add(roof);
const winMat=new THREE.MeshLambertMaterial({color:0x1a2a38});
for(let i=0;i<3;i++){const w=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.7,0.08),winMat);w.position.set(-2+i*2,3.5,bd/2+0.05);g.add(w);}
const dw=1.2,dh=2.2;
const frame=new THREE.Mesh(new THREE.BoxGeometry(dw+0.3,dh+0.25,0.12),new THREE.MeshLambertMaterial({color:0x555555}));
frame.position.set(0,dh/2,bd/2+0.04);g.add(frame);
const hinge=new THREE.Group();
hinge.position.set(-dw*0.5,0,bd/2+0.1);
const door=new THREE.Mesh(new THREE.BoxGeometry(dw,dh,0.1),new THREE.MeshLambertMaterial({color:0x2a1810}));
door.position.set(dw*0.5,dh/2,0);hinge.add(door);
const handle=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.14),new THREE.MeshLambertMaterial({color:0xd4a84b}));
handle.position.set(dw*0.85,dh*0.5,0.08);hinge.add(handle);
g.add(hinge);
g.position.set(cx,py,cz);scene.add(g);
colliders.push({min:new THREE.Vector3(cx-bw/2,py,cz-bd/2),max:new THREE.Vector3(cx+bw/2,py+bh+1,cz+bd/2)});
const frontZ=cz+bd/2;
doors.push({type:'house',hinge:hinge,openAngle:-Math.PI*0.62,dx:cx,dy:py+1.1,dz:frontZ,exitSpot:new THREE.Vector3(cx,py+CONFIG.playerHeight,frontZ+1.8)});
for(const [x,z,col,label] of [[14,-2,0xc0392b,'eatery'],[-14,-2,0x3498db,'hospital'],[0,-16,0xf9e79f,'school']]){
const gg=new THREE.Group();
const bb=new THREE.Mesh(new THREE.BoxGeometry(7,8,6),new THREE.MeshLambertMaterial({color:col}));
bb.position.y=4;gg.add(bb);
const hh=new THREE.Group();hh.position.set(-0.6,0,3.1);
const dd=new THREE.Mesh(new THREE.BoxGeometry(1.2,2.1,0.1),new THREE.MeshLambertMaterial({color:0x2a1810}));
dd.position.set(0.6,1.05,0);hh.add(dd);gg.add(hh);
gg.position.set(x,0,z);scene.add(gg);
colliders.push({min:new THREE.Vector3(x-3.5,0,z-3),max:new THREE.Vector3(x+3.5,9,z+3)});
doors.push({type:label,hinge:hh,openAngle:-Math.PI*0.62,dx:x,dy:1.1,dz:z+3,exitSpot:new THREE.Vector3(x,CONFIG.playerHeight,z+3+1.8)});
}
}
function buildInteriorRoom(){
interiorGroup=new THREE.Group();interiorGroup.visible=false;scene.add(interiorGroup);
const floor=new THREE.Mesh(new THREE.BoxGeometry(10,0.2,8),new THREE.MeshLambertMaterial({color:0xc4a574}));
floor.position.set(INT_ORIGIN.x,INT_ORIGIN.y,INT_ORIGIN.z);interiorGroup.add(floor);
const walls=new THREE.Mesh(new THREE.BoxGeometry(10,4,8),new THREE.MeshLambertMaterial({color:0xf5e6d3,side:THREE.BackSide}));
walls.position.set(INT_ORIGIN.x,INT_ORIGIN.y+2,INT_ORIGIN.z);interiorGroup.add(walls);
const light=new THREE.PointLight(0xfff0d0,1.2,20);light.position.set(INT_ORIGIN.x,INT_ORIGIN.y+3.5,INT_ORIGIN.z);interiorGroup.add(light);
const table=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.1,1),new THREE.MeshLambertMaterial({color:0x8b4513}));
table.position.set(INT_ORIGIN.x,INT_ORIGIN.y+0.75,INT_ORIGIN.z);interiorGroup.add(table);
const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.7,6),new THREE.MeshLambertMaterial({color:0x5c3317}));
for(const [ox,oz] of [[-0.7,-0.35],[0.7,-0.35],[-0.7,0.35],[0.7,0.35]]){const l=leg.clone();l.position.set(INT_ORIGIN.x+ox,INT_ORIGIN.y+0.35,INT_ORIGIN.z+oz);interiorGroup.add(l);}
const couch=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.6,0.9),new THREE.MeshLambertMaterial({color:0x6b3a3a}));
couch.position.set(INT_ORIGIN.x,INT_ORIGIN.y+0.4,INT_ORIGIN.z-2.5);interiorGroup.add(couch);
INTERIOR_EXIT_WORLD=new THREE.Vector3(INT_ORIGIN.x,INT_ORIGIN.y+1.1,INT_ORIGIN.z+3.5);
}
function makeCharacter(shirtCol,opts={}){
const g=new THREE.Group();
const skin=new THREE.MeshLambertMaterial({color:opts.skin||0xf0c8a0});
const shirt=new THREE.MeshLambertMaterial({color:shirtCol});
const pants=new THREE.MeshLambertMaterial({color:opts.pants||0x2c3e50});
const shoe=new THREE.MeshLambertMaterial({color:0x1a1a1a});
const hairM=new THREE.MeshLambertMaterial({color:opts.hair||0x3b2a1a});
const jacket=new THREE.MeshLambertMaterial({color:opts.jacket||shirtCol});
const legL=new THREE.Group();legL.position.set(-0.12,0.78,0);
legL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.068,0.34,8),pants).translateY(-0.17));
legL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.062,0.052,0.3,8),pants).translateY(-0.47));
legL.add(new THREE.Mesh(new THREE.BoxGeometry(0.13,0.08,0.22),shoe).translateY(-0.64).translateZ(0.04));
g.add(legL);
const legR=new THREE.Group();legR.position.set(0.12,0.78,0);
legR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.068,0.34,8),pants).translateY(-0.17));
legR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.062,0.052,0.3,8),pants).translateY(-0.47));
legR.add(new THREE.Mesh(new THREE.BoxGeometry(0.13,0.08,0.22),shoe).translateY(-0.64).translateZ(0.04));
g.add(legR);
const hips=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.155,0.15,10),pants);hips.position.y=0.82;g.add(hips);
const torso=new THREE.Mesh(new THREE.CylinderGeometry(0.155,0.175,0.44,10),shirt);torso.position.y=1.1;g.add(torso);
const jacketMesh=new THREE.Mesh(new THREE.CylinderGeometry(0.175,0.19,0.4,10),jacket);jacketMesh.position.y=1.12;g.add(jacketMesh);
const armL=new THREE.Group();armL.position.set(-0.23,1.26,0);
armL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.048,0.042,0.3,7),jacket).translateY(-0.15));
armL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.036,0.26,7),skin).translateY(-0.41));
armL.add(new THREE.Mesh(new THREE.SphereGeometry(0.042,6,5),skin).translateY(-0.56));
g.add(armL);
const armR=new THREE.Group();armR.position.set(0.23,1.26,0);
armR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.048,0.042,0.3,7),jacket).translateY(-0.15));
armR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.036,0.26,7),skin).translateY(-0.41));
armR.add(new THREE.Mesh(new THREE.SphereGeometry(0.042,6,5),skin).translateY(-0.56));
g.add(armR);
const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.052,0.06,0.11,8),skin);neck.position.y=1.36;g.add(neck);
const head=new THREE.Mesh(new THREE.SphereGeometry(0.14,12,10),skin);head.position.y=1.52;g.add(head);
const hair=new THREE.Mesh(new THREE.SphereGeometry(0.145,10,8),hairM);hair.position.y=1.58;hair.scale.set(1.05,0.72,1.05);g.add(hair);
const fringe=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.05,0.06),hairM);fringe.position.set(0,1.58,0.11);g.add(fringe);
const eyeW=new THREE.MeshLambertMaterial({color:0xffffff});const eyeP=new THREE.MeshLambertMaterial({color:0x1a1a2e});
g.add(new THREE.Mesh(new THREE.SphereGeometry(0.03,6,5),eyeW).translateX(-0.048).translateY(1.54).translateZ(0.115));
g.add(new THREE.Mesh(new THREE.SphereGeometry(0.015,5,4),eyeP).translateX(-0.048).translateY(1.54).translateZ(0.135));
g.add(new THREE.Mesh(new THREE.SphereGeometry(0.03,6,5),eyeW).translateX(0.048).translateY(1.54).translateZ(0.115));
g.add(new THREE.Mesh(new THREE.SphereGeometry(0.015,5,4),eyeP).translateX(0.048).translateY(1.54).translateZ(0.135));
g.add(new THREE.Mesh(new THREE.BoxGeometry(0.055,0.014,0.02),hairM).translateX(-0.048).translateY(1.58).translateZ(0.125));
g.add(new THREE.Mesh(new THREE.BoxGeometry(0.055,0.014,0.02),hairM).translateX(0.048).translateY(1.58).translateZ(0.125));
g.add(new THREE.Mesh(new THREE.SphereGeometry(0.022,5,4),skin).translateY(1.51).translateZ(0.135));
g.add(new THREE.Mesh(new THREE.BoxGeometry(0.055,0.014,0.016),new THREE.MeshLambertMaterial({color:0xb06060})).translateY(1.455).translateZ(0.13));
g.userData={legL,legR,armL,armR,torso};
return g;
}
function buildPlayerBody(){playerBody=makeCharacter(0x3498db,{jacket:0x2980b9});playerBody.visible=false;scene.add(playerBody);}
function getLookDir(out){const cp=Math.cos(player.pitch);out.set(-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp);return out;}
function updateInteract(){
if(!interactEl)return;
getLookDir(_lookDir);
const eye=player.pos;
let nearestDist=999,nearestDot=-1,nearest=null;
if(!interiorActive){
for(const d of doors){
_tmp.set(d.dx,d.dy,d.dz).sub(eye);
const dist=_tmp.length();if(dist<0.01)continue;
_tmp.multiplyScalar(1/dist);const dot=_tmp.dot(_lookDir);
if(dist<nearestDist){nearestDist=dist;nearestDot=dot;nearest=d;}
}
currentDoorTarget=null;
if(nearest&&nearestDist<=INTERACT_DIST&&(nearestDot>=INTERACT_DOT||nearestDist<3.2)){
currentDoorTarget=nearest;lockedDoor=nearest;interactEl.textContent='OPEN DOOR';
}else if(lockedDoor&&lockedDoor!=='exit'){
const d=lockedDoor;const dd=_tmp.set(d.dx,eye.y,d.dz).sub(eye).length();
if(dd>INTERACT_DIST+2.5)lockedDoor=null;else{currentDoorTarget=lockedDoor;interactEl.textContent='OPEN DOOR';}
}
}else if(INTERIOR_EXIT_WORLD){
_tmp.copy(INTERIOR_EXIT_WORLD).sub(eye);const dist=_tmp.length();nearestDist=dist;
if(dist>0.01){_tmp.multiplyScalar(1/dist);nearestDot=_tmp.dot(_lookDir);}
if(dist<=INTERACT_DIST&&(nearestDot>0.4||dist<2.5)){currentDoorTarget='exit';lockedDoor='exit';interactEl.textContent='EXIT';}
else if(lockedDoor==='exit'&&dist>INTERACT_DIST+2){lockedDoor=null;currentDoorTarget=null;}
else if(lockedDoor==='exit'){currentDoorTarget='exit';interactEl.textContent='EXIT';}
}
if(!doorAnim){
const show=!!(currentDoorTarget||lockedDoor);
interactEl.classList.toggle('hidden',!show);
if(show){interactEl.style.display='block';interactEl.style.opacity='1';interactEl.style.pointerEvents='auto';}
else interactEl.style.display='none';
}
if(debugEl){
const hid=interactEl.classList.contains('hidden');
debugEl.innerHTML='DOOR DBG v25<br>doors:'+doors.length+' col:'+colliders.length+'<br>dist:'+(nearestDist<900?nearestDist.toFixed(2):'—')+' dot:'+(nearestDot>-1?nearestDot.toFixed(2):'—')+'<br>btnHidden:'+hid+' target:'+(currentDoorTarget?(currentDoorTarget==='exit'?'exit':currentDoorTarget.type):'none')+'<br>anim:'+(doorAnim?doorAnim.mode:'—')+'<br>pos:'+player.pos.x.toFixed(1)+','+player.pos.z.toFixed(1);
}
}
function doInteract(){
const target=lockedDoor||currentDoorTarget;
console.log('[City]TAP doInteract',target==='exit'?'exit':(target&&target.type),'anim',!!doorAnim);
if(!target||doorAnim)return;
if(interactEl){interactEl.classList.add('hidden');interactEl.style.display='none';}
if(target==='exit'){startExit();return;}
startDoorOpen(target);
}
function startDoorOpen(door){
console.log('[City]startDoorOpen',door.type);
lockedDoor=null;currentDoorTarget=null;
if(door.hinge)door.hinge.rotation.y=0;
doorAnim={mode:'open',hinge:door.hinge,t:0,dur:0.35,door:door,targetAngle:door.openAngle||-1.95,done:false};
player.vel.set(0,0,0);
}
function startExit(){
lockedDoor=null;currentDoorTarget=null;
const door=doors.find(d=>d.type===interiorActive)||doors[0];
exitInterior();
if(door&&door.hinge){door.hinge.rotation.y=door.openAngle||-1.95;doorAnim={mode:'close',hinge:door.hinge,t:0,dur:0.35,door:door,targetAngle:0,done:false};}
}
function updateDoorAnim(dt){
if(!doorAnim)return;
doorAnim.t+=dt;const k=Math.min(1,doorAnim.t/doorAnim.dur);const e=1-Math.pow(1-k,3);
if(doorAnim.hinge){
if(doorAnim.mode==='open')doorAnim.hinge.rotation.y=e*doorAnim.targetAngle;
else doorAnim.hinge.rotation.y=(1-e)*(doorAnim.door.openAngle||-1.95);
}
if(k>=1&&!doorAnim.done){
doorAnim.done=true;const door=doorAnim.door,mode=doorAnim.mode;doorAnim=null;
if(mode==='open'){console.log('[City]enterInterior',door.type);enterInterior(door);}
}
}
function enterInterior(door){
console.log('[City]ENTERED',door.type);
interiorExitPos=door.exitSpot.clone();interiorActive=door.type;
outdoorColliders=colliders;colliders=[];
interiorGroup.visible=true;
player.pos.set(INT_ORIGIN.x,INT_ORIGIN.y+CONFIG.playerHeight,INT_ORIGIN.z+2.5);
player.vel.set(0,0,0);
scene.fog.near=20;scene.fog.far=30;scene.background=new THREE.Color(0x2a2a30);
}
function exitInterior(){
if(!interiorActive)return;
console.log('[City]EXITED');
interiorGroup.visible=false;interiorActive=null;
colliders=outdoorColliders||[];
if(interiorExitPos)player.pos.copy(interiorExitPos);
player.vel.set(0,0,0);
scene.fog.near=40;scene.fog.far=120;scene.background=new THREE.Color(0x87B8D8);
}
function setupControls(){
const base=document.getElementById('joystick-base'),knob=document.getElementById('joystick-knob');
const lookZone=document.getElementById('look-zone'),jumpBtn=document.getElementById('jump-btn'),camBtn=document.getElementById('cam-btn');
const maxStick=40;let stickId=null,lookId=null;
function setStick(dx,dy){const len=Math.hypot(dx,dy)||0.0001,c=Math.min(len,maxStick);const nx=(dx/len)*c,ny=(dy/len)*c;if(knob)knob.style.transform=`translate(${nx}px,${ny}px)`;moveInput.x=nx/maxStick;moveInput.y=-ny/maxStick;}
function resetStick(){if(knob)knob.style.transform='translate(0px,0px)';moveInput.x=0;moveInput.y=0;stickId=null;}
if(base){
base.addEventListener('touchstart',e=>{e.preventDefault();if(stickId!==null)return;const t=e.changedTouches[0];stickId=t.identifier;const r=base.getBoundingClientRect();setStick(t.clientX-(r.left+r.width/2),t.clientY-(r.top+r.height/2));},{passive:false});
base.addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches)if(t.identifier===stickId){const r=base.getBoundingClientRect();setStick(t.clientX-(r.left+r.width/2),t.clientY-(r.top+r.height/2));}},{passive:false});
const end=e=>{for(const t of e.changedTouches)if(t.identifier===stickId)resetStick();};
base.addEventListener('touchend',end);base.addEventListener('touchcancel',end);
}
if(lookZone){
lookZone.addEventListener('touchstart',e=>{const t0=e.changedTouches[0];if(interactEl&&!interactEl.classList.contains('hidden')){const r=interactEl.getBoundingClientRect();if(t0.clientX>=r.left-12&&t0.clientX<=r.right+12&&t0.clientY>=r.top-12&&t0.clientY<=r.bottom+12)return;}e.preventDefault();if(lookId!==null)return;lookId=t0.identifier;lastLookX=t0.clientX;lastLookY=t0.clientY;},{passive:false});
lookZone.addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches)if(t.identifier===lookId){const dx=t.clientX-lastLookX,dy=t.clientY-lastLookY;lastLookX=t.clientX;lastLookY=t.clientY;player.yaw-=dx*CONFIG.lookSens;player.pitch=THREE.MathUtils.clamp(player.pitch-dy*CONFIG.lookSens,-CONFIG.maxPitch,CONFIG.maxPitch);}},{passive:false});
lookZone.addEventListener('touchend',e=>{for(const t of e.changedTouches)if(t.identifier===lookId)lookId=null;});
}
if(jumpBtn){jumpBtn.addEventListener('touchstart',e=>{e.preventDefault();if(player.onGround){player.vel.y=CONFIG.jumpForce;player.onGround=false;}},{passive:false});}
if(interactEl){
let tapped=false;
const fire=e=>{if(interactEl.classList.contains('hidden')&&!lockedDoor)return;e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();if(tapped)return;tapped=true;setTimeout(()=>tapped=false,400);console.log('[City]BUTTON FIRE');doInteract();};
['pointerup','pointerdown','touchend','touchstart','click','mouseup'].forEach(ev=>{interactEl.addEventListener(ev,fire,{passive:false,capture:true});});
document.addEventListener('touchend',e=>{if(!started||!interactEl||interactEl.classList.contains('hidden')||doorAnim)return;const t=e.changedTouches&&e.changedTouches[0];if(!t)return;const r=interactEl.getBoundingClientRect();if(t.clientX>=r.left-28&&t.clientX<=r.right+28&&t.clientY>=r.top-28&&t.clientY<=r.bottom+28){e.preventDefault();fire(e);}},{passive:false,capture:true});
}
if(camBtn){camBtn.addEventListener('touchstart',e=>{e.preventDefault();camMode=(camMode+1)%3;if(camLabelEl)camLabelEl.textContent=CONFIG.camModes[camMode];},{passive:false});}
window.addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space'&&player.onGround){player.vel.y=CONFIG.jumpForce;player.onGround=false;}if(e.code==='KeyE'||e.code==='KeyF')doInteract();if(e.code==='KeyC'){camMode=(camMode+1)%3;if(camLabelEl)camLabelEl.textContent=CONFIG.camModes[camMode];}});
window.addEventListener('keyup',e=>{keys[e.code]=false;});
document.addEventListener('click',()=>{if(started&&!('ontouchstart'in window))document.body.requestPointerLock?.();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement){player.yaw-=e.movementX*CONFIG.lookSensDesktop;player.pitch=THREE.MathUtils.clamp(player.pitch-e.movementY*CONFIG.lookSensDesktop,-CONFIG.maxPitch,CONFIG.maxPitch);}});
}
function updatePlayer(dt){
let mx=moveInput.x,my=moveInput.y;
if(keys['KeyW']||keys['ArrowUp'])my+=1;if(keys['KeyS']||keys['ArrowDown'])my-=1;
if(keys['KeyA']||keys['ArrowLeft'])mx-=1;if(keys['KeyD']||keys['ArrowRight'])mx+=1;
const len=Math.hypot(mx,my);if(len>1){mx/=len;my/=len;}
_f.set(-Math.sin(player.yaw),0,-Math.cos(player.yaw));_r.set(Math.cos(player.yaw),0,-Math.sin(player.yaw));
const speed=CONFIG.moveSpeed*(keys['ShiftLeft']||keys['ShiftRight']?1.55:1);
_w.set(0,0,0);_w.addScaledVector(_f,my);_w.addScaledVector(_r,mx);if(_w.lengthSq()>0)_w.normalize().multiplyScalar(speed);
player.vel.x=_w.x;player.vel.z=_w.z;player.vel.y+=CONFIG.gravity*dt;
let nx=player.pos.x+player.vel.x*dt,ny=player.pos.y+player.vel.y*dt,nz=player.pos.z+player.vel.z*dt;
const groundY=CONFIG.playerHeight;
if(ny<=groundY){ny=groundY;player.vel.y=0;player.onGround=true;}else player.onGround=false;
const pr=CONFIG.playerRadius;
for(const c of colliders){
if(nx>c.min.x-pr&&nx<c.max.x+pr&&nz>c.min.z-pr&&nz<c.max.z+pr&&ny>c.min.y&&ny-CONFIG.playerHeight<c.max.y){
const cx=(c.min.x+c.max.x)*0.5,cz=(c.min.z+c.max.z)*0.5,dx=nx-cx,dz=nz-cz;
const hx=(c.max.x-c.min.x)*0.5+pr,hz=(c.max.z-c.min.z)*0.5+pr;
if(hx-Math.abs(dx)<hz-Math.abs(dz))nx=cx+Math.sign(dx||1)*hx;else nz=cz+Math.sign(dz||1)*hz;
}
}
if(!interiorActive){nx=THREE.MathUtils.clamp(nx,-35,35);nz=THREE.MathUtils.clamp(nz,-35,35);}
else{nx=THREE.MathUtils.clamp(nx,INT_ORIGIN.x-4.5,INT_ORIGIN.x+4.5);nz=THREE.MathUtils.clamp(nz,INT_ORIGIN.z-3.5,INT_ORIGIN.z+3.8);}
player.pos.set(nx,ny,nz);
const spd=Math.hypot(player.vel.x,player.vel.z);const moving=spd>0.5&&player.onGround;
if(playerBody){
playerBody.visible=camMode!==0;
const target=moving?Math.min(1,spd/CONFIG.moveSpeed):0;
walkAmt+=(target-walkAmt)*Math.min(1,dt*8);
if(walkAmt>0.05)walkPhase+=dt*10*walkAmt;else walkPhase*=0.9;
const swing=Math.sin(walkPhase)*0.55*walkAmt,bob=Math.abs(Math.sin(walkPhase*2))*0.03*walkAmt;
const ud=playerBody.userData;
if(ud.legL){ud.legL.rotation.x=swing;ud.legR.rotation.x=-swing;}
if(ud.armL){ud.armL.rotation.x=-swing*0.8;ud.armR.rotation.x=swing*0.8;}
if(ud.torso)ud.torso.position.y=1.1+bob;
playerBody.position.set(player.pos.x,player.pos.y-CONFIG.playerHeight,player.pos.z);
playerBody.rotation.y=player.yaw;
}
}
function updateCamera(){
if(camMode===0){
camera.position.set(player.pos.x,player.pos.y+0.15,player.pos.z);
const cp=Math.cos(player.pitch),sp=Math.sin(player.pitch);
camera.lookAt(player.pos.x-Math.sin(player.yaw)*cp*2,player.pos.y+0.15+sp*2,player.pos.z-Math.cos(player.yaw)*cp*2);
}else if(camMode===1){
const back=3.5,up=1.8;
camera.position.set(player.pos.x+Math.sin(player.yaw)*back,player.pos.y+up,player.pos.z+Math.cos(player.yaw)*back);
camera.lookAt(player.pos.x,player.pos.y+0.6,player.pos.z);
}else{
camera.position.set(player.pos.x-Math.sin(player.yaw)*3,player.pos.y+1.5,player.pos.z-Math.cos(player.yaw)*3);
camera.lookAt(player.pos.x,player.pos.y+0.8,player.pos.z);
}
}
function animate(){
requestAnimationFrame(animate);
const dt=Math.min(clock.getDelta(),0.05);
if(started){updatePlayer(dt);updateDoorAnim(dt);updateInteract();updateCamera();}
frameCount++;const now=performance.now();
if(now-lastFpsTime>500){if(fpsEl)fpsEl.textContent=String(Math.round(frameCount*1000/(now-lastFpsTime)));frameCount=0;lastFpsTime=now;}
renderer.render(scene,camera);
}
init();
