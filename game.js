import * as THREE from 'three';

const CONFIG = {
  moveSpeed: 8.2, sprintMult: 1.55, jumpForce: 9.2, gravity: -22,
  playerHeight: 1.65, playerRadius: 0.38, lookSens: 0.0028, lookSensDesktop: 0.0020,
  maxPitch: Math.PI / 2.25, worldSize: 320, terrainRes: 64, sporeCount: 24,
  blockSize: 16, streetWidth: 7, camModes: ['1st', '3rd', 'Front']
};

let scene, camera, renderer, clock;
let player = { pos: new THREE.Vector3(0, 4, 0), vel: new THREE.Vector3(), onGround: false, yaw: 0, pitch: -0.05 };
let heightData, colliders = [], moveInput = { x: 0, y: 0 }, lastLookX = 0, lastLookY = 0, keys = {};
let fpsEl, camLabelEl, frameCount = 0, lastFpsTime = 0, started = false, camMode = 0;
let cars = [], npcs = [], animals = [], birds = [];
let audioCtx = null, footstepTimer = 0;
const _forward = new THREE.Vector3(), _right = new THREE.Vector3(), _wish = new THREE.Vector3();
const _camTarget = new THREE.Vector3(), _camOffset = new THREE.Vector3();

function init() {
  // CRITICAL: attach start button FIRST so world-build errors cannot block starting
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    const go = (e) => { e.preventDefault(); e.stopPropagation(); console.log('[City] Enter City'); startGame(); };
    startBtn.addEventListener('click', go);
    startBtn.addEventListener('touchend', go, { passive: false });
  } else console.error('[City] #start-btn missing');

  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x87CEEB, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0xB8D4E8, 70, 260);
  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.15, 380);
  clock = new THREE.Clock();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xffe8c0, 0x6a9a6a, 0.55));
  const sun = new THREE.DirectionalLight(0xfff5e0, 1.6);
  sun.position.set(80, 120, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
  sun.shadow.camera.left = -80; sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xaaccff, 0.28);
  fill.position.set(-40, 50, -60); scene.add(fill);

  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false }));
  sunMesh.position.copy(sun.position).normalize().multiplyScalar(200); scene.add(sunMesh);
  const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(16, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.3, fog: false, depthWrite: false }));
  sunGlow.position.copy(sunMesh.position); scene.add(sunGlow);

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const a = (i / 10) * Math.PI * 2, r = 90 + (i % 4) * 22;
    g.position.set(Math.cos(a) * r, 45 + (i % 3) * 8, Math.sin(a) * r);
    for (let j = 0; j < 3; j++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(6 + Math.random() * 4, 8, 6), cloudMat);
      c.position.set((j - 1) * 7, Math.random() * 2, (Math.random() - 0.5) * 4);
      g.add(c);
    }
    scene.add(g);
  }

  try {
    buildCityGround(); placeCityBuildings(); placeCityProps();
    spawnCars(); spawnNpcs(); spawnAnimals(); createSpores(); addAccentLights();
  } catch (err) { console.error('[City] World build error:', err); }

  player.pos.set(0, CONFIG.playerHeight + 0.5, 0);
  setupControls();
  window.addEventListener('resize', onResize, { passive: true });
  document.body.addEventListener('touchmove', (e) => { if (started) e.preventDefault(); }, { passive: false });
  fpsEl = document.getElementById('fps'); camLabelEl = document.getElementById('cam-label');
  animate();
  console.log('[City] init complete');
}

function startGame() {
  if (started) return;
  console.log('[City] startGame()');
  const ss = document.getElementById('start-screen');
  if (ss) ss.classList.add('hidden');
  const hud = document.getElementById('hud');
  if (hud) hud.classList.remove('hidden');
  started = true;
  initAudio();
  if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
}

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), filter = audioCtx.createBiquadFilter();
    osc.type = 'sawtooth'; osc.frequency.value = 55; filter.type = 'lowpass'; filter.frequency.value = 180; gain.gain.value = 0.025;
    osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination); osc.start();
    const osc2 = audioCtx.createOscillator(), gain2 = audioCtx.createGain();
    osc2.type = 'sine'; osc2.frequency.value = 110; gain2.gain.value = 0.012;
    osc2.connect(gain2); gain2.connect(audioCtx.destination); osc2.start();
  } catch (e) { console.warn('Audio failed', e); }
}
function playFootstep() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.06, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.25));
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800;
  const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  src.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination); src.start(t);
}
function playUiClick() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(880, t); osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);
  gain.gain.setValueAtTime(0.07, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t + 0.09);
}

function buildCityGround() {
  const res = CONFIG.terrainRes, size = CONFIG.worldSize;
  const geo = new THREE.PlaneGeometry(size, size, res - 1, res - 1); geo.rotateX(-Math.PI / 2);
  heightData = new Float32Array(res * res);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = Math.sin(x * 0.03) * Math.cos(z * 0.028) * 0.2;
    pos.setY(i, h); heightData[i] = h;
    const cell = CONFIG.blockSize + CONFIG.streetWidth;
    const mx = ((x % cell) + cell) % cell, mz = ((z % cell) + cell) % cell;
    const isStreet = mx < CONFIG.streetWidth || mz < CONFIG.streetWidth;
    if (isStreet) { colors[i*3]=0.28; colors[i*3+1]=0.29; colors[i*3+2]=0.31; }
    else { colors[i*3]=0.72; colors[i*3+1]=0.74; colors[i*3+2]=0.70; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true; scene.add(mesh);
}
function sampleHeight(x, z) {
  const res = CONFIG.terrainRes, size = CONFIG.worldSize, half = size / 2;
  const u = (x + half) / size, v = (z + half) / size;
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
  const fx = u * (res - 1), fz = v * (res - 1);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const i00 = iz * res + ix, i10 = iz * res + Math.min(ix + 1, res - 1);
  const i01 = Math.min(iz + 1, res - 1) * res + ix, i11 = Math.min(iz + 1, res - 1) * res + Math.min(ix + 1, res - 1);
  return ((heightData[i00]??0)*(1-tx)+(heightData[i10]??0)*tx)*(1-tz)+((heightData[i01]??0)*(1-tx)+(heightData[i11]??0)*tx)*tz;
}
function getHeight(x, z) { return sampleHeight(x, z); }

function placeCityBuildings() {
  const half = CONFIG.worldSize * 0.44, cell = CONFIG.blockSize + CONFIG.streetWidth;
  const buildingColors = [0xd0d8e0,0xb8c4d0,0xe0d8c8,0xc0c8d0,0xd8d0c0,0xa8b4c0,0xc8b8a8,0xb0bcc8,0xe8e0d8,0x9aa8b8,0xd4ccc0,0xb8c0c8];
  const accentColors = [0x3dff9a,0x5affb0,0x2aff80,0x7b5cff];
  let bi = 0;
  const winMat = new THREE.MeshLambertMaterial({ color: 0x1a2a38, emissive: 0x223344, emissiveIntensity: 0.15 });
  const winLitMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0 });
  for (let gx = -half; gx < half; gx += cell) {
    for (let gz = -half; gz < half; gz += cell) {
      if (Math.abs(gx) < cell * 1.1 && Math.abs(gz) < cell * 1.1) continue;
      if (Math.random() < 0.07) continue;
      const bw = CONFIG.blockSize * (0.52 + Math.random() * 0.4);
      const bd = CONFIG.blockSize * (0.52 + Math.random() * 0.4);
      const bh = 6 + Math.random() * 20 + (Math.random() < 0.1 ? Math.random() * 12 : 0);
      const cx = gx + CONFIG.streetWidth + CONFIG.blockSize * 0.5;
      const cz = gz + CONFIG.streetWidth + CONFIG.blockSize * 0.5;
      const py = getHeight(cx, cz), color = buildingColors[bi++ % buildingColors.length];
      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshLambertMaterial({ color }));
      building.position.set(cx, py + bh / 2, cz); building.castShadow = true; building.receiveShadow = true; scene.add(building);
      if (bh > 7) {
        const rows = Math.min(7, Math.floor(bh / 2.4)), cols = Math.max(2, Math.floor(bw / 2.0));
        for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.22) continue;
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.06), Math.random() < 0.25 ? winLitMat : winMat);
          w.position.set(cx - bw/2 + 1.0 + c*((bw-2)/Math.max(1,cols-1)), py + 1.6 + r*2.2, cz + bd/2 + 0.04);
          scene.add(w);
        }
      }
      if (Math.random() < 0.28) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(bw*0.9, 0.12, bd*0.9), new THREE.MeshBasicMaterial({ color: accentColors[bi % accentColors.length] }));
        strip.position.set(cx, py + bh + 0.06, cz); scene.add(strip);
      }
      colliders.push({ min: new THREE.Vector3(cx-bw/2-0.1,py,cz-bd/2-0.1), max: new THREE.Vector3(cx+bw/2+0.1,py+bh,cz+bd/2+0.1) });
    }
  }
}

function placeCityProps() {
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3a48 });
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  const treeTrunk = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  const treeLeaf = new THREE.MeshLambertMaterial({ color: 0x3a8a4a });
  const half = CONFIG.worldSize * 0.4, cell = CONFIG.blockSize + CONFIG.streetWidth;
  for (let gx = -half; gx < half; gx += cell) {
    for (let gz = -half; gz < half; gz += cell) {
      if (Math.random() < 0.5) continue;
      const px = gx + CONFIG.streetWidth * 0.45, pz = gz + CONFIG.streetWidth * 0.5, py = getHeight(px, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.1, 5), lampMat);
      pole.position.set(px, py + 1.55, pz); scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 5, 4), lampGlow);
      bulb.position.set(px, py + 3.2, pz); scene.add(bulb);
    }
  }
  for (let i = 0; i < 32; i++) {
    const a = Math.random()*Math.PI*2, d = 14+Math.random()*(CONFIG.worldSize*0.36);
    const px = Math.cos(a)*d, pz = Math.sin(a)*d, py = getHeight(px, pz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.17,1.6,5), treeTrunk);
    trunk.position.set(px, py+0.8, pz); scene.add(trunk);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.95+Math.random()*0.35,6,5), treeLeaf);
    leaf.position.set(px, py+2.2, pz); scene.add(leaf);
  }
}

function makeCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.5,0.9), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.32; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.85,0.38,0.8), new THREE.MeshLambertMaterial({ color: 0x88ccee }));
  cabin.position.set(-0.12, 0.7, 0); g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const [wx,wz] of [[0.5,0.45],[0.5,-0.45],[-0.5,0.45],[-0.5,-0.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.1,8), wheelMat);
    w.rotation.z = Math.PI/2; w.position.set(wx, 0.16, wz); g.add(w);
  }
  return g;
}
function spawnCars() {
  const carColors = [0xe74c3c,0x3498db,0x2ecc71,0xf1c40f,0x9b59b6,0xe67e22,0xecf0f1];
  const cell = CONFIG.blockSize + CONFIG.streetWidth, half = CONFIG.worldSize * 0.38;
  let id = 0;
  for (let gz = -half; gz < half; gz += cell) {
    if (Math.abs(gz) < cell*0.5 || id >= 12) continue;
    const body = makeCar(carColors[id%carColors.length]), dir = id%2===0?1:-1;
    body.position.set((Math.random()-0.5)*CONFIG.worldSize*0.65, 0.5, gz+CONFIG.streetWidth*0.5);
    body.rotation.y = dir>0?Math.PI/2:-Math.PI/2; scene.add(body);
    cars.push({ mesh: body, axis: 'x', dir, speed: 6+Math.random()*5, bound: half }); id++;
  }
  for (let gx = -half; gx < half; gx += cell) {
    if (Math.abs(gx) < cell*0.5 || id >= 18) continue;
    const body = makeCar(carColors[id%carColors.length]), dir = id%2===0?1:-1;
    body.position.set(gx+CONFIG.streetWidth*0.5, 0.5, (Math.random()-0.5)*CONFIG.worldSize*0.65);
    body.rotation.y = dir>0?0:Math.PI; scene.add(body);
    cars.push({ mesh: body, axis: 'z', dir, speed: 6+Math.random()*5, bound: half }); id++;
  }
}
function updateCars(dt) {
  for (const c of cars) {
    if (c.axis==='x') { c.mesh.position.x += c.dir*c.speed*dt; if (c.mesh.position.x>c.bound) c.mesh.position.x=-c.bound; if (c.mesh.position.x<-c.bound) c.mesh.position.x=c.bound; }
    else { c.mesh.position.z += c.dir*c.speed*dt; if (c.mesh.position.z>c.bound) c.mesh.position.z=-c.bound; if (c.mesh.position.z<-c.bound) c.mesh.position.z=c.bound; }
    c.mesh.position.y = getHeight(c.mesh.position.x, c.mesh.position.z) + 0.32;
  }
}

function makeNpc(shirtColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.9, 8), new THREE.MeshLambertMaterial({ color: shirtColor }));
  body.position.y = 0.85; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf0c8a0 }));
  head.position.y = 1.5; g.add(head);
  return g;
}
function spawnNpcs() {
  const colors = [0x3498db,0xe74c3c,0x2ecc71,0xf39c12,0x9b59b6,0x1abc9c,0xe91e63];
  const half = CONFIG.worldSize * 0.36;
  for (let i = 0; i < 22; i++) {
    const mesh = makeNpc(colors[i%colors.length]);
    const x = (Math.random()-0.5)*half*2, z = (Math.random()-0.5)*half*2;
    mesh.position.set(x, getHeight(x,z), z); scene.add(mesh);
    const angle = Math.random()*Math.PI*2;
    npcs.push({ mesh, vx: Math.cos(angle)*(1.1+Math.random()*1.4), vz: Math.sin(angle)*(1.1+Math.random()*1.4), timer: 2+Math.random()*5, bound: half });
  }
}
function updateNpcs(dt) {
  for (const n of npcs) {
    n.timer -= dt;
    if (n.timer <= 0) { const a = Math.random()*Math.PI*2, s = 1.1+Math.random()*1.4; n.vx=Math.cos(a)*s; n.vz=Math.sin(a)*s; n.timer=2+Math.random()*5; }
    let nx = n.mesh.position.x+n.vx*dt, nz = n.mesh.position.z+n.vz*dt;
    if (Math.abs(nx)>n.bound) { n.vx*=-1; nx=THREE.MathUtils.clamp(nx,-n.bound,n.bound); }
    if (Math.abs(nz)>n.bound) { n.vz*=-1; nz=THREE.MathUtils.clamp(nz,-n.bound,n.bound); }
    n.mesh.position.x=nx; n.mesh.position.z=nz; n.mesh.position.y=getHeight(nx,nz);
    n.mesh.rotation.y = Math.atan2(n.vx, n.vz);
  }
}

function spawnAnimals() {
  const dogColors = [0x8b6914,0x4a3728,0xd4a574,0x2c2c2c];
  const half = CONFIG.worldSize * 0.34;
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.28,0.28), new THREE.MeshLambertMaterial({ color: dogColors[i%4] }));
    body.position.y = 0.28; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.2,0.2), new THREE.MeshLambertMaterial({ color: dogColors[i%4] }));
    head.position.set(0.32, 0.32, 0); g.add(head);
    const x = (Math.random()-0.5)*half*2, z = (Math.random()-0.5)*half*2;
    g.position.set(x, getHeight(x,z), z); scene.add(g);
    const a = Math.random()*Math.PI*2;
    animals.push({ mesh: g, vx: Math.cos(a)*1.5, vz: Math.sin(a)*1.5, timer: 1.5+Math.random()*3, bound: half });
  }
  const birdMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.12,5,4), birdMat));
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.35,0.03,0.12), birdMat); wingL.position.set(0,0,0.15); g.add(wingL);
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.35,0.03,0.12), birdMat); wingR.position.set(0,0,-0.15); g.add(wingR);
    const x = (Math.random()-0.5)*half*1.6, z = (Math.random()-0.5)*half*1.6;
    g.position.set(x, 8+Math.random()*12, z); scene.add(g);
    birds.push({ mesh: g, wingL, wingR, phase: Math.random()*Math.PI*2, radius: 8+Math.random()*18, height: 6+Math.random()*12, speed: 0.4+Math.random()*0.6, cx: x, cz: z });
  }
}
function updateAnimals(dt) {
  for (const d of animals) {
    d.timer -= dt;
    if (d.timer <= 0) { const a = Math.random()*Math.PI*2, s = 1.2+Math.random()*1.8; d.vx=Math.cos(a)*s; d.vz=Math.sin(a)*s; d.timer=1.5+Math.random()*3; }
    let nx = d.mesh.position.x+d.vx*dt, nz = d.mesh.position.z+d.vz*dt;
    if (Math.abs(nx)>d.bound) { d.vx*=-1; nx=THREE.MathUtils.clamp(nx,-d.bound,d.bound); }
    if (Math.abs(nz)>d.bound) { d.vz*=-1; nz=THREE.MathUtils.clamp(nz,-d.bound,d.bound); }
    d.mesh.position.x=nx; d.mesh.position.z=nz; d.mesh.position.y=getHeight(nx,nz);
    d.mesh.rotation.y = Math.atan2(d.vx, d.vz);
  }
  const t = clock.elapsedTime;
  for (const b of birds) {
    b.phase += b.speed * dt;
    b.mesh.position.x = b.cx + Math.cos(b.phase) * b.radius;
    b.mesh.position.z = b.cz + Math.sin(b.phase) * b.radius;
    b.mesh.position.y = b.height + Math.sin(b.phase * 2) * 1.5;
    b.mesh.rotation.y = b.phase + Math.PI / 2;
    const flap = Math.sin(t * 12 + b.phase) * 0.4;
    b.wingL.rotation.x = flap; b.wingR.rotation.x = -flap;
  }
}

function addAccentLights() {
  for (const [x,z] of [[12,10],[-14,12],[20,-16],[-10,-20]]) {
    const l = new THREE.PointLight(0x3dff9a, 0.7, 12, 2);
    l.position.set(x, getHeight(x,z)+4, z); scene.add(l);
  }
}
function createSpores() {
  const n = CONFIG.sporeCount, geo = new THREE.BufferGeometry();
  const positions = new Float32Array(n*3), vel = new Float32Array(n*3);
  for (let i = 0; i < n; i++) {
    positions[i*3]=(Math.random()-0.5)*70; positions[i*3+1]=2+Math.random()*10; positions[i*3+2]=(Math.random()-0.5)*70;
    vel[i*3]=(Math.random()-0.5)*0.18; vel[i*3+1]=(Math.random()-0.5)*0.1; vel[i*3+2]=(Math.random()-0.5)*0.18;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9dffc8, size: 0.15, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true }));
  pts.userData.vel = vel; scene.add(pts); scene.userData.spores = pts;
}
function updateSpores(dt) {
  const pts = scene.userData.spores; if (!pts) return;
  const pos = pts.geometry.attributes.position.array, vel = pts.userData.vel;
  for (let i = 0; i < CONFIG.sporeCount; i++) {
    const i3=i*3; pos[i3]+=vel[i3]*dt; pos[i3+1]+=vel[i3+1]*dt; pos[i3+2]+=vel[i3+2]*dt;
    if (pos[i3+1]<1.2) vel[i3+1]*=-0.5; if (pos[i3+1]>12) vel[i3+1]*=-0.5;
  }
  pts.geometry.attributes.position.needsUpdate = true;
}

function setupControls() {
  const base = document.getElementById('joystick-base'), knob = document.getElementById('joystick-knob');
  const lookZone = document.getElementById('look-zone'), jumpBtn = document.getElementById('jump-btn');
  const camBtn = document.getElementById('cam-btn'), maxStick = 40;
  let stickId = null, lookId = null;
  function setStick(dx, dy) {
    const len = Math.hypot(dx,dy)||0.0001, clamped = Math.min(len,maxStick);
    const nx=(dx/len)*clamped, ny=(dy/len)*clamped;
    if (knob) knob.style.transform = `translate(${nx}px, ${ny}px)`;
    moveInput.x = nx/maxStick; moveInput.y = -ny/maxStick;
  }
  function resetStick() { if (knob) knob.style.transform='translate(0px,0px)'; moveInput.x=0; moveInput.y=0; stickId=null; }
  if (base) {
    base.addEventListener('touchstart', (e) => {
      e.preventDefault(); if (stickId!==null) return;
      const t=e.changedTouches[0]; stickId=t.identifier;
      const rect=base.getBoundingClientRect();
      setStick(t.clientX-(rect.left+rect.width/2), t.clientY-(rect.top+rect.height/2));
    }, { passive: false });
    base.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier===stickId) {
        const rect=base.getBoundingClientRect();
        setStick(t.clientX-(rect.left+rect.width/2), t.clientY-(rect.top+rect.height/2));
      }
    }, { passive: false });
    const endStick=(e)=>{ for (const t of e.changedTouches) if (t.identifier===stickId) resetStick(); };
    base.addEventListener('touchend', endStick); base.addEventListener('touchcancel', endStick);
  }
  if (lookZone) {
    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault(); if (lookId!==null) return;
      const t=e.changedTouches[0]; lookId=t.identifier; lastLookX=t.clientX; lastLookY=t.clientY;
    }, { passive: false });
    lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier===lookId) {
        const dx=t.clientX-lastLookX, dy=t.clientY-lastLookY;
        lastLookX=t.clientX; lastLookY=t.clientY;
        player.yaw -= dx * CONFIG.lookSens;
        player.pitch = THREE.MathUtils.clamp(player.pitch - dy * CONFIG.lookSens, -CONFIG.maxPitch, CONFIG.maxPitch);
      }
    }, { passive: false });
    lookZone.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier===lookId) lookId=null; });
  }
  if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); tryJump(); }, { passive: false });
    jumpBtn.addEventListener('click', tryJump);
  }
  if (camBtn) {
    camBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); cycleCamera(); }, { passive: false });
    camBtn.addEventListener('click', cycleCamera);
  }
  window.addEventListener('keydown', (e) => {
    keys[e.code]=true;
    if (e.code==='Space') { e.preventDefault(); tryJump(); }
    if (e.code==='KeyC') cycleCamera();
  });
  window.addEventListener('keyup', (e) => { keys[e.code]=false; });
  document.addEventListener('click', () => { if (started && !('ontouchstart' in window)) document.body.requestPointerLock?.(); });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) {
      player.yaw -= e.movementX * CONFIG.lookSensDesktop;
      player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * CONFIG.lookSensDesktop, -CONFIG.maxPitch, CONFIG.maxPitch);
    }
  });
}
function cycleCamera() {
  camMode = (camMode + 1) % 3;
  if (camLabelEl) camLabelEl.textContent = CONFIG.camModes[camMode];
  playUiClick();
  const ch = document.getElementById('crosshair');
  if (ch) ch.style.opacity = camMode === 0 ? '1' : '0';
}
function tryJump() { if (player.onGround) { player.vel.y = CONFIG.jumpForce; player.onGround = false; } }

function updatePlayer(dt) {
  let mx = moveInput.x, my = moveInput.y;
  if (keys['KeyW']||keys['ArrowUp']) my+=1;
  if (keys['KeyS']||keys['ArrowDown']) my-=1;
  if (keys['KeyA']||keys['ArrowLeft']) mx-=1;
  if (keys['KeyD']||keys['ArrowRight']) mx+=1;
  const len = Math.hypot(mx,my); if (len>1) { mx/=len; my/=len; }
  _forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const speed = CONFIG.moveSpeed * ((keys['ShiftLeft']||keys['ShiftRight']) ? CONFIG.sprintMult : 1);
  _wish.set(0,0,0); _wish.addScaledVector(_forward, my); _wish.addScaledVector(_right, mx);
  if (_wish.lengthSq()>0) _wish.normalize().multiplyScalar(speed);
  player.vel.x=_wish.x; player.vel.z=_wish.z; player.vel.y+=CONFIG.gravity*dt;
  let nx=player.pos.x+player.vel.x*dt, ny=player.pos.y+player.vel.y*dt, nz=player.pos.z+player.vel.z*dt;
  const groundY=getHeight(nx,nz)+CONFIG.playerHeight;
  if (ny<=groundY) { ny=groundY; player.vel.y=0; player.onGround=true; } else player.onGround=false;
  const pr=CONFIG.playerRadius;
  for (const c of colliders) {
    if (nx>c.min.x-pr&&nx<c.max.x+pr&&nz>c.min.z-pr&&nz<c.max.z+pr&&ny>c.min.y&&ny-CONFIG.playerHeight<c.max.y) {
      const cx=(c.min.x+c.max.x)*0.5, cz=(c.min.z+c.max.z)*0.5, dx=nx-cx, dz=nz-cz;
      const halfX=(c.max.x-c.min.x)*0.5+pr, halfZ=(c.max.z-c.min.z)*0.5+pr;
      if (halfX-Math.abs(dx)<halfZ-Math.abs(dz)) nx=cx+Math.sign(dx||1)*halfX; else nz=cz+Math.sign(dz||1)*halfZ;
    }
  }
  const bound=CONFIG.worldSize*0.47;
  nx=THREE.MathUtils.clamp(nx,-bound,bound); nz=THREE.MathUtils.clamp(nz,-bound,bound);
  player.pos.set(nx,ny,nz);
  const moving=Math.hypot(player.vel.x,player.vel.z)>0.5&&player.onGround;
  if (moving) { footstepTimer-=dt; if (footstepTimer<=0) { playFootstep(); footstepTimer=0.32; } } else footstepTimer=0;
  updateCamera();
}
function updateCamera() {
  const eye=_camTarget.copy(player.pos);
  if (camMode===0) {
    camera.position.copy(eye);
    camera.rotation.order='YXZ'; camera.rotation.y=player.yaw; camera.rotation.x=player.pitch;
  } else if (camMode===1) {
    _camOffset.set(Math.sin(player.yaw)*5.5, 2.2, Math.cos(player.yaw)*5.5);
    camera.position.copy(eye).add(_camOffset); camera.lookAt(eye.x, eye.y-0.2, eye.z);
  } else {
    _camOffset.set(-Math.sin(player.yaw)*4, 1.8, -Math.cos(player.yaw)*4);
    camera.position.copy(eye).add(_camOffset); camera.lookAt(eye.x, eye.y-0.1, eye.z);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.048);
  if (started) { updatePlayer(dt); updateCars(dt); updateNpcs(dt); updateAnimals(dt); updateSpores(dt); }
  else {
    const t=clock.elapsedTime;
    camera.position.set(Math.sin(t*0.1)*28, 16, Math.cos(t*0.1)*28); camera.lookAt(0,4,0);
  }
  renderer.render(scene, camera);
  frameCount++;
  if (clock.elapsedTime - lastFpsTime > 0.6) {
    if (fpsEl) fpsEl.textContent = Math.round(frameCount / (clock.elapsedTime - lastFpsTime));
    frameCount=0; lastFpsTime=clock.elapsedTime;
  }
}
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
}
init();
