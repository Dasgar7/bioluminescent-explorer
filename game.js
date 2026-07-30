import * as THREE from 'three';

const CONFIG = {
  moveSpeed: 8.2, sprintMult: 1.55, jumpForce: 9.2, gravity: -22,
  playerHeight: 1.65, playerRadius: 0.38, lookSens: 0.0028, lookSensDesktop: 0.0020,
  maxPitch: Math.PI / 2.25, worldSize: 360, terrainRes: 72, sporeCount: 30,
  blockSize: 16, streetWidth: 7, camModes: ['1st', '3rd', 'Front']
};

let scene, camera, renderer, clock;
let player = { pos: new THREE.Vector3(0, 4, 0), vel: new THREE.Vector3(), onGround: false, yaw: 0, pitch: -0.05 };
let heightData, colliders = [], moveInput = { x: 0, y: 0 }, lastLookX = 0, lastLookY = 0, keys = {};
let fpsEl, camLabelEl, frameCount = 0, lastFpsTime = 0, started = false, camMode = 0;
let cars = [], npcs = [], audioCtx = null, footstepTimer = 0;
const _forward = new THREE.Vector3(), _right = new THREE.Vector3(), _wish = new THREE.Vector3();
const _camTarget = new THREE.Vector3(), _camOffset = new THREE.Vector3();

function init() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x87CEEB, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0xB8D4E8, 80, 280);
  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.15, 400);
  clock = new THREE.Clock();
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.75));
  scene.add(new THREE.HemisphereLight(0xFFE8C0, 0x88BB88, 0.65));
  const sun = new THREE.DirectionalLight(0xFFF5E0, 1.8);
  sun.position.set(80, 120, 50); scene.add(sun);
  scene.add(Object.assign(new THREE.DirectionalLight(0xAACCFF, 0.3), { position: new THREE.Vector3(-40, 50, -60) }));
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false }));
  sunMesh.position.copy(sun.position).normalize().multiplyScalar(220); scene.add(sunMesh);
  const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.35, fog: false, depthWrite: false }));
  sunGlow.position.copy(sunMesh.position); scene.add(sunGlow);
  buildCityGround(); placeCityBuildings(); placeCityProps(); spawnCars(); spawnNpcs(); createSpores(); addAccentLights();
  player.pos.set(0, CONFIG.playerHeight + 0.5, 0);
  setupControls();
  window.addEventListener('resize', onResize, { passive: true });
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.body.addEventListener('touchmove', (e) => { if (started) e.preventDefault(); }, { passive: false });
  fpsEl = document.getElementById('fps'); camLabelEl = document.getElementById('cam-label');
  animate();
}

function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  started = true; initAudio();
  if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
}

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), filter = audioCtx.createBiquadFilter();
    osc.type = 'sawtooth'; osc.frequency.value = 55; filter.type = 'lowpass'; filter.frequency.value = 180; gain.gain.value = 0.03;
    osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination); osc.start();
    const osc2 = audioCtx.createOscillator(), gain2 = audioCtx.createGain();
    osc2.type = 'sine'; osc2.frequency.value = 110; gain2.gain.value = 0.015;
    osc2.connect(gain2); gain2.connect(audioCtx.destination); osc2.start();
  } catch (_) {}
}
function playFootstep() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.06, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.25));
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800;
  const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  src.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination); src.start(t);
}
function playUiClick() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(880, t); osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);
  gain.gain.setValueAtTime(0.08, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t + 0.09);
}

function buildCityGround() {
  const res = CONFIG.terrainRes, size = CONFIG.worldSize;
  const geo = new THREE.PlaneGeometry(size, size, res - 1, res - 1); geo.rotateX(-Math.PI / 2);
  heightData = new Float32Array(res * res);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = Math.sin(x * 0.03) * Math.cos(z * 0.028) * 0.25;
    pos.setY(i, h); heightData[i] = h;
    const cell = CONFIG.blockSize + CONFIG.streetWidth;
    const mx = ((x % cell) + cell) % cell, mz = ((z % cell) + cell) % cell;
    const isStreet = mx < CONFIG.streetWidth || mz < CONFIG.streetWidth;
    if (isStreet) { colors[i*3]=0.32; colors[i*3+1]=0.33; colors[i*3+2]=0.35; }
    else { colors[i*3]=0.70; colors[i*3+1]=0.72; colors[i*3+2]=0.68; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
}
function sampleHeight(x, z) {
  const res = CONFIG.terrainRes, size = CONFIG.worldSize, half = size / 2;
  const u = (x + half) / size, v = (z + half) / size;
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
  const fx = u * (res - 1), fz = v * (res - 1);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const i00 = iz * res + ix, i10 = iz * res + Math.min(ix + 1, res - 1);
  const i01 = Math.min(iz + 1, res - 1) * res + ix, i11 = Math.min(iz + 1, res - 1) * res + Math.min(ix + 1, res - 1);
  const h0 = (heightData[i00]??0)*(1-tx)+(heightData[i10]??0)*tx;
  const h1 = (heightData[i01]??0)*(1-tx)+(heightData[i11]??0)*tx;
  return h0*(1-tz)+h1*tz;
}
function getHeight(x, z) { return sampleHeight(x, z); }

function placeCityBuildings() {
  const half = CONFIG.worldSize * 0.45, cell = CONFIG.blockSize + CONFIG.streetWidth;
  const buildingColors = [0xc8d0d8,0xb0bcc8,0xd4c8b8,0xa8b8c0,0xe0d8d0,0x9aa8b4,0xc0b0a0,0xb8c4cc];
  const accentColors = [0x3dff9a,0x5affb0,0x2aff80]; let bi = 0;
  for (let gx = -half; gx < half; gx += cell) {
    for (let gz = -half; gz < half; gz += cell) {
      if (Math.abs(gx) < cell * 1.2 && Math.abs(gz) < cell * 1.2) continue;
      if (Math.random() < 0.08) continue;
      const bw = CONFIG.blockSize * (0.5 + Math.random() * 0.42);
      const bd = CONFIG.blockSize * (0.5 + Math.random() * 0.42);
      const bh = 5 + Math.random() * 22 + (Math.random() < 0.12 ? Math.random() * 14 : 0);
      const cx = gx + CONFIG.streetWidth + CONFIG.blockSize * 0.5;
      const cz = gz + CONFIG.streetWidth + CONFIG.blockSize * 0.5;
      const py = getHeight(cx, cz), color = buildingColors[bi++ % buildingColors.length];
      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshLambertMaterial({ color }));
      building.position.set(cx, py + bh / 2, cz); scene.add(building);
      if (Math.random() < 0.3) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(bw*0.88,0.14,bd*0.88), new THREE.MeshBasicMaterial({ color: accentColors[bi%3] }));
        strip.position.set(cx, py + bh + 0.08, cz); scene.add(strip);
      }
      if (bh > 10 && Math.random() < 0.35) {
        const winMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
        const rows = Math.min(5, Math.floor(bh/3)), cols = Math.max(2, Math.floor(bw/2.5));
        for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.4) continue;
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.07), winMat);
          w.position.set(cx - bw/2 + 1.1 + c*((bw-2.2)/Math.max(1,cols-1)), py + 1.8 + r*2.6, cz + bd/2 + 0.04);
          scene.add(w);
        }
      }
      colliders.push({ min: new THREE.Vector3(cx-bw/2-0.1, py, cz-bd/2-0.1), max: new THREE.Vector3(cx+bw/2+0.1, py+bh, cz+bd/2+0.1) });
    }
  }
}

function placeCityProps() {
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x444450 });
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  const treeTrunk = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  const treeLeaf = new THREE.MeshLambertMaterial({ color: 0x3a8a4a });
  const half = CONFIG.worldSize * 0.42, cell = CONFIG.blockSize + CONFIG.streetWidth;
  for (let gx = -half; gx < half; gx += cell) {
    for (let gz = -half; gz < half; gz += cell) {
      if (Math.random() < 0.55) continue;
      const px = gx + CONFIG.streetWidth * 0.45, pz = gz + CONFIG.streetWidth * 0.5, py = getHeight(px, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 5), lampMat);
      pole.position.set(px, py + 1.6, pz); scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 5, 4), lampGlow);
      bulb.position.set(px, py + 3.3, pz); scene.add(bulb);
    }
  }
  for (let i = 0; i < 40; i++) {
    const a = Math.random()*Math.PI*2, d = 12+Math.random()*(CONFIG.worldSize*0.4);
    const px = Math.cos(a)*d, pz = Math.sin(a)*d, py = getHeight(px, pz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.18,1.7,5), treeTrunk);
    trunk.position.set(px, py+0.85, pz); scene.add(trunk);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1+Math.random()*0.4,6,5), treeLeaf);
    leaf.position.set(px, py+2.3, pz); scene.add(leaf);
  }
}

function makeCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.55,0.95), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.35; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.4,0.85), new THREE.MeshLambertMaterial({ color: 0x88ccee }));
  cabin.position.set(-0.15, 0.75, 0); g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const [wx,wz] of [[0.55,0.48],[0.55,-0.48],[-0.55,0.48],[-0.55,-0.48]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.12,8), wheelMat);
    w.rotation.z = Math.PI/2; w.position.set(wx, 0.18, wz); g.add(w);
  }
  return g;
}
function spawnCars() {
  const carColors = [0xe74c3c,0x3498db,0x2ecc71,0xf1c40f,0x9b59b6,0xe67e22,0xecf0f1];
  const cell = CONFIG.blockSize + CONFIG.streetWidth, half = CONFIG.worldSize * 0.4;
  let id = 0;
  for (let gz = -half; gz < half; gz += cell) {
    if (Math.abs(gz) < cell*0.5 || id >= 14) continue;
    const laneZ = gz + CONFIG.streetWidth*0.5, body = makeCar(carColors[id%carColors.length]);
    const dir = id%2===0?1:-1, speed = 6+Math.random()*5;
    body.position.set((Math.random()-0.5)*CONFIG.worldSize*0.7, 0.5, laneZ);
    body.rotation.y = dir>0 ? Math.PI/2 : -Math.PI/2; scene.add(body);
    cars.push({ mesh: body, axis: 'x', dir, speed, bound: half }); id++;
  }
  for (let gx = -half; gx < half; gx += cell) {
    if (Math.abs(gx) < cell*0.5 || id >= 22) continue;
    const laneX = gx + CONFIG.streetWidth*0.5, body = makeCar(carColors[id%carColors.length]);
    const dir = id%2===0?1:-1, speed = 6+Math.random()*5;
    body.position.set(laneX, 0.5, (Math.random()-0.5)*CONFIG.worldSize*0.7);
    body.rotation.y = dir>0 ? 0 : Math.PI; scene.add(body);
    cars.push({ mesh: body, axis: 'z', dir, speed, bound: half }); id++;
  }
}
function updateCars(dt) {
  for (const c of cars) {
    if (c.axis === 'x') {
      c.mesh.position.x += c.dir * c.speed * dt;
      if (c.mesh.position.x > c.bound) c.mesh.position.x = -c.bound;
      if (c.mesh.position.x < -c.bound) c.mesh.position.x = c.bound;
    } else {
      c.mesh.position.z += c.dir * c.speed * dt;
      if (c.mesh.position.z > c.bound) c.mesh.position.z = -c.bound;
      if (c.mesh.position.z < -c.bound) c.mesh.position.z = c.bound;
    }
    c.mesh.position.y = getHeight(c.mesh.position.x, c.mesh.position.z) + 0.35;
  }
}

function makeNpc(shirtColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 8), new THREE.MeshLambertMaterial({ color: shirtColor }));
  body.position.y = 0.9; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf0c8a0 }));
  head.position.y = 1.55; g.add(head);
  return g;
}
function spawnNpcs() {
  const colors = [0x3498db,0xe74c3c,0x2ecc71,0xf39c12,0x9b59b6,0x1abc9c,0xe91e63];
  const half = CONFIG.worldSize * 0.38;
  for (let i = 0; i < 28; i++) {
    const mesh = makeNpc(colors[i % colors.length]);
    const x = (Math.random()-0.5)*half*2, z = (Math.random()-0.5)*half*2;
    mesh.position.set(x, getHeight(x,z), z); scene.add(mesh);
    const angle = Math.random()*Math.PI*2;
    npcs.push({ mesh, vx: Math.cos(angle)*(1.2+Math.random()*1.5), vz: Math.sin(angle)*(1.2+Math.random()*1.5), timer: 2+Math.random()*5, bound: half });
  }
}
function updateNpcs(dt) {
  for (const n of npcs) {
    n.timer -= dt;
    if (n.timer <= 0) {
      const a = Math.random()*Math.PI*2, s = 1.2+Math.random()*1.5;
      n.vx = Math.cos(a)*s; n.vz = Math.sin(a)*s; n.timer = 2+Math.random()*5;
    }
    let nx = n.mesh.position.x + n.vx*dt, nz = n.mesh.position.z + n.vz*dt;
    if (Math.abs(nx) > n.bound) { n.vx *= -1; nx = THREE.MathUtils.clamp(nx, -n.bound, n.bound); }
    if (Math.abs(nz) > n.bound) { n.vz *= -1; nz = THREE.MathUtils.clamp(nz, -n.bound, n.bound); }
    n.mesh.position.x = nx; n.mesh.position.z = nz;
    n.mesh.position.y = getHeight(nx, nz);
    n.mesh.rotation.y = Math.atan2(n.vx, n.vz);
  }
}

function addAccentLights() {
  for (const [x,z] of [[12,10],[-14,12],[20,-16],[-10,-20]]) {
    const l = new THREE.PointLight(0x3dff9a, 0.8, 14, 2);
    l.position.set(x, getHeight(x,z)+4, z); scene.add(l);
  }
}
function createSpores() {
  const n = CONFIG.sporeCount, geo = new THREE.BufferGeometry();
  const positions = new Float32Array(n*3), vel = new Float32Array(n*3);
  for (let i = 0; i < n; i++) {
    positions[i*3] = (Math.random()-0.5)*80; positions[i*3+1] = 2+Math.random()*12; positions[i*3+2] = (Math.random()-0.5)*80;
    vel[i*3] = (Math.random()-0.5)*0.2; vel[i*3+1] = (Math.random()-0.5)*0.12; vel[i*3+2] = (Math.random()-0.5)*0.2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9dffc8, size: 0.16, transparent: true, opacity: 0.65, depthWrite: false, sizeAttenuation: true }));
  pts.userData.vel = vel; scene.add(pts); scene.userData.spores = pts;
}
function updateSpores(dt) {
  const pts = scene.userData.spores; if (!pts) return;
  const pos = pts.geometry.attributes.position.array, vel = pts.userData.vel;
  for (let i = 0; i < CONFIG.sporeCount; i++) {
    const i3 = i*3;
    pos[i3]+=vel[i3]*dt; pos[i3+1]+=vel[i3+1]*dt; pos[i3+2]+=vel[i3+2]*dt;
    if (pos[i3+1]<1.2) vel[i3+1]*=-0.5; if (pos[i3+1]>14) vel[i3+1]*=-0.5;
  }
  pts.geometry.attributes.position.needsUpdate = true;
}

function setupControls() {
  const base = document.getElementById('joystick-base'), knob = document.getElementById('joystick-knob');
  const lookZone = document.getElementById('look-zone'), jumpBtn = document.getElementById('jump-btn');
  const camBtn = document.getElementById('cam-btn'), maxStick = 40;
  let stickId = null, lookId = null;
  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy) || 0.0001, clamped = Math.min(len, maxStick);
    const nx = (dx/len)*clamped, ny = (dy/len)*clamped;
    knob.style.transform = `translate(${nx}px, ${ny}px)`;
    moveInput.x = nx/maxStick; moveInput.y = -ny/maxStick;
  }
  function resetStick() { knob.style.transform = 'translate(0px, 0px)'; moveInput.x = 0; moveInput.y = 0; stickId = null; }
  base.addEventListener('touchstart', (e) => {
    e.preventDefault(); if (stickId !== null) return;
    const t = e.changedTouches[0]; stickId = t.identifier;
    const rect = base.getBoundingClientRect();
    setStick(t.clientX-(rect.left+rect.width/2), t.clientY-(rect.top+rect.height/2));
  }, { passive: false });
  base.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === stickId) {
      const rect = base.getBoundingClientRect();
      setStick(t.clientX-(rect.left+rect.width/2), t.clientY-(rect.top+rect.height/2));
    }
  }, { passive: false });
  const endStick = (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) resetStick(); };
  base.addEventListener('touchend', endStick); base.addEventListener('touchcancel', endStick);
  lookZone.addEventListener('touchstart', (e) => {
    e.preventDefault(); if (lookId !== null) return;
    const t = e.changedTouches[0]; lookId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY;
  }, { passive: false });
  lookZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === lookId) {
      const dx = t.clientX - lastLookX, dy = t.clientY - lastLookY;
      lastLookX = t.clientX; lastLookY = t.clientY;
      // Swipe left = turn left (standard FPS: yaw -= dx)
      player.yaw -= dx * CONFIG.lookSens;
      player.pitch = THREE.MathUtils.clamp(player.pitch - dy * CONFIG.lookSens, -CONFIG.maxPitch, CONFIG.maxPitch);
    }
  }, { passive: false });
  lookZone.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; });
  jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); tryJump(); }, { passive: false });
  jumpBtn.addEventListener('click', tryJump);
  camBtn.addEventListener('touchstart', (e) => { e.preventDefault(); cycleCamera(); }, { passive: false });
  camBtn.addEventListener('click', cycleCamera);
  window.addEventListener('keydown', (e) => { keys[e.code]=true; if (e.code==='Space'){e.preventDefault();tryJump();} if (e.code==='KeyC') cycleCamera(); });
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
  const len = Math.hypot(mx, my); if (len > 1) { mx/=len; my/=len; }
  _forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const speed = CONFIG.moveSpeed * ((keys['ShiftLeft']||keys['ShiftRight']) ? CONFIG.sprintMult : 1);
  _wish.set(0,0,0); _wish.addScaledVector(_forward, my); _wish.addScaledVector(_right, mx);
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(speed);
  player.vel.x = _wish.x; player.vel.z = _wish.z; player.vel.y += CONFIG.gravity * dt;
  let nx = player.pos.x + player.vel.x*dt, ny = player.pos.y + player.vel.y*dt, nz = player.pos.z + player.vel.z*dt;
  const groundY = getHeight(nx, nz) + CONFIG.playerHeight;
  if (ny <= groundY) { ny = groundY; player.vel.y = 0; player.onGround = true; } else player.onGround = false;
  const pr = CONFIG.playerRadius;
  for (const c of colliders) {
    if (nx>c.min.x-pr && nx<c.max.x+pr && nz>c.min.z-pr && nz<c.max.z+pr && ny>c.min.y && ny-CONFIG.playerHeight<c.max.y) {
      const cx=(c.min.x+c.max.x)*0.5, cz=(c.min.z+c.max.z)*0.5, dx=nx-cx, dz=nz-cz;
      const halfX=(c.max.x-c.min.x)*0.5+pr, halfZ=(c.max.z-c.min.z)*0.5+pr;
      if (halfX-Math.abs(dx)<halfZ-Math.abs(dz)) nx=cx+Math.sign(dx||1)*halfX; else nz=cz+Math.sign(dz||1)*halfZ;
    }
  }
  const bound = CONFIG.worldSize * 0.47;
  nx = THREE.MathUtils.clamp(nx, -bound, bound); nz = THREE.MathUtils.clamp(nz, -bound, bound);
  player.pos.set(nx, ny, nz);
  const moving = Math.hypot(player.vel.x, player.vel.z) > 0.5 && player.onGround;
  if (moving) { footstepTimer -= dt; if (footstepTimer <= 0) { playFootstep(); footstepTimer = 0.32; } }
  else footstepTimer = 0;
  updateCamera();
}
function updateCamera() {
  const eye = _camTarget.copy(player.pos);
  if (camMode === 0) {
    camera.position.copy(eye);
    camera.rotation.order = 'YXZ'; camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
  } else if (camMode === 1) {
    _camOffset.set(Math.sin(player.yaw)*5.5, 2.2, Math.cos(player.yaw)*5.5);
    camera.position.copy(eye).add(_camOffset);
    camera.lookAt(eye.x, eye.y-0.2, eye.z);
  } else {
    _camOffset.set(-Math.sin(player.yaw)*4, 1.8, -Math.cos(player.yaw)*4);
    camera.position.copy(eye).add(_camOffset);
    camera.lookAt(eye.x, eye.y-0.1, eye.z);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.048);
  if (started) { updatePlayer(dt); updateCars(dt); updateNpcs(dt); updateSpores(dt); }
  else {
    const t = clock.elapsedTime;
    camera.position.set(Math.sin(t*0.1)*30, 18, Math.cos(t*0.1)*30); camera.lookAt(0, 4, 0);
  }
  renderer.render(scene, camera);
  frameCount++;
  if (clock.elapsedTime - lastFpsTime > 0.6) {
    if (fpsEl) fpsEl.textContent = Math.round(frameCount / (clock.elapsedTime - lastFpsTime));
    frameCount = 0; lastFpsTime = clock.elapsedTime;
  }
}
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
}
init();
