import * as THREE from 'three';
const CONFIG={moveSpeed:8.2,sprintMult:1.55,jumpForce:9.2,gravity:-22,playerHeight:1.65,playerRadius:0.4,lookSens:0.0028,lookSensDesktop:0.002,maxPitch:Math.PI/2.25,worldSize:280,terrainRes:48,blockSize:14,streetWidth:9,camModes:['1st','3rd','Front']};
let scene,camera,renderer,clock;
let player={pos:new THREE.Vector3(0,4,0),vel:new THREE.Vector3(),onGround:false,yaw:0,pitch:-0.05};
let heightData,colliders=[],footprints=[],doors=[];
let moveInput={x:0,y:0},lastLookX=0,lastLookY=0,keys={};
let fpsEl,camLabelEl,frameCount=0,lastFpsTime=0,started=false,camMode=0;
let cars=[],npcs=[],audioCtx=null,footstepTimer=0;
let playerBody=null,walkPhase=0,walkAmt=0;
let interiorActive=null,interiorExitPos=null,interiorGroup=null,interiorFurniture=null;
let outdoorColliders=null;
const INT_ORIGIN=new THREE.Vector3(0,-80,0);
const _f=new THREE.Vector3(),_r=new THREE.Vector3(),_w=new THREE.Vector3();
const _t=new THREE.Vector3(),_o=new THREE.Vector3();
const _lookDir=new THREE.Vector3(),_tmp=new THREE.Vector3();
let interactEl=null,currentDoorTarget=null,INTERIOR_EXIT_WORLD=null,debugEl=null;
const INTERACT_DIST=6.0,INTERACT_DOT=0.4;
let trafficLights=[],doorAnim=null,lockedDoor=null;
console.log('[City] BUILD v25 LOADING');
// NOTE: Full file is 42k. If this is truncated by the API, the local sandbox has the complete version.
// Please hard-refresh (Ctrl+Shift+R) after this push and check the debug overlay top-left.
