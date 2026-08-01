import * as THREE from 'three';
console.log('[City] BUILD v26 RESTORE');

const CONFIG = {
  moveSpeed: 8.2, jumpForce: 9.2, gravity: -22,
  playerHeight: 1.65, playerRadius: 0.4,
  lookSens: 0.0028, lookSensDesktop: 0.002, maxPitch: Math.PI / 2.25,
  worldSize: 140, blockSize: 14, streetWidth: 9,
  camModes: ['1st', '3rd', 'Front']
};

let scene, camera, renderer, clock;
let player = { pos: new THREE.Vector3(0, 4, 10), vel: new THREE.Vector3(), onGround: false, yaw: Math.PI, pitch: -0.05 };
let colliders = [], footprints = [], doors = [];
let moveInput = { x: 0, y: 0 }, keys = {}, lastLookX = 0, lastLookY = 0;
let fpsEl, camLabelEl, frameCount = 0, lastFpsTime = 0, started = false, camMode = 0;
let cars = [], npcs = [], animals = [];
let playerBody = null, walkPhase = 0, walkAmt = 0;
let interiorActive = null, interiorExitPos = null, interiorGroup = null, outdoorColliders = null;
let INTERIOR_EXIT_WORLD = null;
const INT_ORIGIN = new THREE.Vector3(0, -80, 0);
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3();
const _lookDir = new THREE.Vector3(), _tmp = new THREE.Vector3();
let interactEl = null, currentDoorTarget = null, doorAnim = null, lockedDoor = null;
let trafficLights = [];
const INTERACT_DIST = 6.0, INTERACT_DOT = 0.4;

const BRICK = [0xb85c38, 0xc4784a, 0xa0522d, 0x8b4513];
const CREAM = [0xe8dcc8, 0xf5e6d3, 0xddd0b8];
const GLASS = [0x4a6a8a, 0x5a7a9a, 0x3a5a7a];
const BTYPES = {
  house: { cols: CREAM, roof: 0x5c4033, h: [6, 10], label: 'HOUSE', sign: null, enter: true },
  restaurant: { cols: [0xc0392b, 0xa93226], roof: 0x2c3e50, h: [7, 11], label: 'EATERY', sign: 0xe74c3c, enter: true },
  cafe: { cols: CREAM, roof: 0x5d4e37, h: [6, 9], label: 'CAFE', sign: 0xf39c12, enter: true },
  hospital: { cols: [0xecf0f1, 0xffffff], roof: 0x3498db, h: [12, 16], label: 'HOSPITAL', sign: 0xe74c3c, enter: true },
  school: { cols: [0xf9e79f, 0xf5d76e], roof: 0x1a5276, h: [9, 13], label: 'SCHOOL', sign: 0x2980b9, enter: true },
  police: { cols: [0x2c3e50, 0x34495e], roof: 0x1a1a2e, h: [8, 12], label: 'POLICE', sign: 0x3498db, enter: true },
  office: { cols: GLASS, roof: 0x1a1a2e, h: [14, 24], label: null, sign: null, enter: false },
  shop: { cols: BRICK, roof: 0x3d2914, h: [6, 11], label: 'SHOP', sign: 0x2ecc71, enter: true },
  brick: { cols: BRICK, roof: 0x3d2914, h: [8, 14], label: null, sign: null, enter: false }
};

function isClear(x, z, rad = 1.2) {
  for (const f of footprints)
    if (x + rad > f.x0 && x - rad < f.x1 && z + rad > f.z0 && z - rad < f.z1) return false;
  return true;
}
function addFoot(cx, cz, bw, bd, pad = 0.4) {
  footprints.push({ x0: cx - bw / 2 - pad, x1: cx + bw / 2 + pad, z0: cz - bd / 2 - pad, z1: cz + bd / 2 + pad });
}

function init() {
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    const go = (e) => { e.preventDefault(); e.stopPropagation(); startGame(); };
    startBtn.addEventListener('click', go);
    startBtn.addEventListener('touchend', go, { passive: false });
    startBtn.addEventListener('pointerup', go);
    console.log('[City] start-btn early');
  }
  const dbg = document.getElementById('door-debug');
  if (dbg) { dbg.style.display = 'none'; dbg.remove(); }

  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87B8D8);
    scene.fog = new THREE.Fog(0x87B8D8, 50, 180);
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 250);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    clock = new THREE.Clock();
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.15);
    sun.position.set(40, 70, 30);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize), new THREE.MeshLambertMaterial({ color: 0x4a7a42 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    try { placeRoads(); } catch (e) { console.error('[City] roads', e); }
    try { placeBuildings(); } catch (e) { console.error('[City] buildings', e); }
    try { placeProps(); } catch (e) { console.error('[City] props', e); }
    try { spawnCars(); } catch (e) { console.error('[City] cars', e); }
    try { spawnNpcs(); } catch (e) { console.error('[City] npcs', e); }
    try { spawnAnimals(); } catch (e) { console.error('[City] animals', e); }
    try { buildPlayerBody(); } catch (e) { console.error('[City] player', e); }
    try { buildInteriorRoom(); } catch (e) { console.error('[City] interior', e); }

    interactEl = document.getElementById('interact-btn');
    fpsEl = document.getElementById('fps');
    camLabelEl = document.getElementById('cam-label');
    setupControls();
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    });
    animate();
    console.log('[City] v26 ready doors', doors.length, 'cars', cars.length, 'npcs', npcs.length, 'animals', animals.length);
  } catch (e) {
    console.error('[City] init FATAL', e);
  }
}

function startGame() {
  if (started) return;
  document.getElementById('start-screen')?.classList.add('hidden');
  document.getElementById('hud')?.classList.remove('hidden');
  started = true;
}

function placeRoads() {
  const cell = CONFIG.blockSize + CONFIG.streetWidth;
  const half = CONFIG.worldSize * 0.42;
  const sw = CONFIG.streetWidth;
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x333338 });
  const lineM = new THREE.MeshBasicMaterial({ color: 0xf0f0e0 });
  const zebraM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let g = -half; g <= half; g += cell) {
    const hStrip = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.worldSize * 0.9, sw), asphalt);
    hStrip.rotation.x = -Math.PI / 2; hStrip.position.set(0, 0.02, g + sw * 0.5); scene.add(hStrip);
    const vStrip = new THREE.Mesh(new THREE.PlaneGeometry(sw, CONFIG.worldSize * 0.9), asphalt);
    vStrip.rotation.x = -Math.PI / 2; vStrip.position.set(g + sw * 0.5, 0.02, 0); scene.add(vStrip);
  }
  let tl = 0;
  for (let gx = -half; gx <= half; gx += cell) {
    for (let gz = -half; gz <= half; gz += cell) {
      const ix = gx + sw * 0.5, iz = gz + sw * 0.5;
      for (let s = -3; s <= 3; s++) {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, sw * 0.85), zebraM);
        a.position.set(ix + s * 0.72, 0.05, iz); scene.add(a);
        const b = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.85, 0.06, 0.55), zebraM);
        b.position.set(ix, 0.05, iz + s * 0.72); scene.add(b);
      }
      for (let x = -half; x < half; x += 3.6) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.12), lineM);
        dash.position.set(x + 0.8, 0.045, iz); scene.add(dash);
      }
      for (let z = -half; z < half; z += 3.6) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 1.6), lineM);
        dash.position.set(ix, 0.045, z + 0.8); scene.add(dash);
      }
      if (tl < 12 && (Math.abs(ix) > 8 || Math.abs(iz) > 8)) {
        addTrafficLight(ix + sw * 0.4, iz + sw * 0.4, 0);
        addTrafficLight(ix - sw * 0.4, iz - sw * 0.4, Math.PI);
        tl += 2;
      }
    }
  }
}

function addTrafficLight(x, z, rotY) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.8, 6), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  pole.position.y = 1.9; g.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.0, 0.3), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  head.position.y = 3.9; g.add(head);
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0x440000 }));
  red.position.set(0, 4.2, 0.14); g.add(red);
  const yel = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0x443300 }));
  yel.position.set(0, 3.9, 0.14); g.add(yel);
  const grn = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0x004400 }));
  grn.position.set(0, 3.6, 0.14); g.add(grn);
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  trafficLights.push({ red, yel, grn, timer: (Math.abs(x) + Math.abs(z)) * 0.07 % 12, state: 0, x, z });
  setTL(trafficLights[trafficLights.length - 1]);
}
function setTL(tl) {
  tl.red.material.color.setHex(tl.state === 2 ? 0xff1a1a : 0x440000);
  tl.yel.material.color.setHex(tl.state === 1 ? 0xffcc00 : 0x443300);
  tl.grn.material.color.setHex(tl.state === 0 ? 0x22ff55 : 0x004400);
}
function updateTrafficLights(dt) {
  if (interiorActive) return;
  for (const tl of trafficLights) {
    tl.timer += dt;
    const t = tl.timer % 12;
    const ns = t < 5 ? 0 : t < 6.5 ? 1 : 2;
    if (ns !== tl.state) { tl.state = ns; setTL(tl); }
  }
}
function lightStateNear(x, z, axis, dir) {
  for (const tl of trafficLights) {
    if (axis === 'x') {
      if (Math.abs(tl.z - z) > 5) continue;
      const a = (tl.x - x) * dir;
      if (a > 0 && a < 9 && tl.state !== 0) return true;
    } else {
      if (Math.abs(tl.x - x) > 5) continue;
      const a = (tl.z - z) * dir;
      if (a > 0 && a < 9 && tl.state !== 0) return true;
    }
  }
  return false;
}

function makeBldg(typeKey, bw, bh, bd) {
  const t = BTYPES[typeKey], g = new THREE.Group();
  const col = t.cols[Math.floor(Math.random() * t.cols.length)];
  const bodyMat = new THREE.MeshLambertMaterial({ color: col });
  const roofMat = new THREE.MeshLambertMaterial({ color: t.roof });
  const winMat = new THREE.MeshLambertMaterial({ color: 0x1a2a38 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bodyMat);
  body.position.y = bh / 2; g.add(body);
  const corn = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.05, 0.22, bd * 1.05), roofMat);
  corn.position.y = bh + 0.1; g.add(corn);
  if (typeKey === 'house') {
    const rh = 1.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(bw, bd) * 0.7, rh, 4), roofMat);
    roof.position.y = bh + rh / 2 + 0.1; roof.rotation.y = Math.PI / 4; g.add(roof);
  }
  const rows = Math.min(5, Math.max(1, Math.floor((bh - 2) / 2)));
  const colsN = Math.max(2, Math.floor(bw / 1.9));
  for (let r = 0; r < rows; r++) for (let c = 0; c < colsN; c++) {
    if (Math.random() < 0.15) continue;
    const wy = 1.5 + r * 2.0; if (wy + 0.4 > bh - 0.3) continue;
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.08), winMat);
    w.position.set(-bw / 2 + 1 + c * ((bw - 2) / Math.max(1, colsN - 1)), wy, bd / 2 + 0.04);
    g.add(w);
  }
  const dw = Math.min(1.2, bw * 0.28), dh = Math.min(2.2, bh * 0.35);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.28, dh + 0.22, 0.12), new THREE.MeshLambertMaterial({ color: 0x555555 }));
  frame.position.set(0, dh / 2, bd / 2 + 0.04); g.add(frame);
  const hinge = new THREE.Group();
  hinge.position.set(-dw * 0.5, 0, bd / 2 + 0.1);
  const door = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.1), new THREE.MeshLambertMaterial({ color: 0x2a1810 }));
  door.position.set(dw * 0.5, dh / 2, 0); hinge.add(door);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), new THREE.MeshLambertMaterial({ color: 0xd4a84b }));
  handle.position.set(dw * 0.85, dh * 0.5, 0.08); hinge.add(handle);
  g.add(hinge);
  g.userData.doorHinge = hinge;
  if (t.sign) {
    const aw = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.6, 0.12, 1.1), new THREE.MeshLambertMaterial({ color: t.sign }));
    aw.position.set(0, 2.6, bd / 2 + 0.55); g.add(aw);
  }
  if (t.label) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(bw * 0.5, 3), 0.45, 0.1), new THREE.MeshBasicMaterial({ color: t.sign || 0x3dff9a }));
    sign.position.set(0, bh - 0.6, bd / 2 + 0.08); g.add(sign);
  }
  return g;
}

function placeBuildings() {
  const half = CONFIG.worldSize * 0.38;
  const cell = CONFIG.blockSize + CONFIG.streetWidth;
  {
    const bw = 8, bd = 7, bh = 7, cx = 0, cz = -4;
    const grp = makeBldg('house', bw, bh, bd);
    grp.position.set(cx, 0, cz); scene.add(grp);
    addFoot(cx, cz, bw, bd);
    colliders.push({ min: new THREE.Vector3(cx - bw / 2, 0, cz - bd / 2), max: new THREE.Vector3(cx + bw / 2, bh + 1, cz + bd / 2) });
    doors.push({ type: 'house', hinge: grp.userData.doorHinge, openAngle: -Math.PI * 0.62, dx: cx, dy: 1.1, dz: cz + bd / 2, exitSpot: new THREE.Vector3(cx, CONFIG.playerHeight, cz + bd / 2 + 1.8) });
  }
  const types = ['hospital', 'school', 'police', 'restaurant', 'cafe', 'shop', 'house', 'brick', 'office', 'shop', 'brick', 'cafe'];
  let bi = 0;
  for (let gx = -half; gx < half; gx += cell) {
    for (let gz = -half; gz < half; gz += cell) {
      if (Math.abs(gx) < cell * 0.7 && Math.abs(gz) < cell * 0.7) continue;
      if (Math.random() < 0.08) continue;
      const typeKey = types[bi++ % types.length];
      const t = BTYPES[typeKey];
      const bw = CONFIG.blockSize * (0.55 + Math.random() * 0.3);
      const bd = CONFIG.blockSize * (0.55 + Math.random() * 0.3);
      const bh = t.h[0] + Math.random() * (t.h[1] - t.h[0]);
      const cx = gx + CONFIG.streetWidth + CONFIG.blockSize * 0.5;
      const cz = gz + CONFIG.streetWidth + CONFIG.blockSize * 0.5;
      const grp = makeBldg(typeKey, bw, bh, bd);
      grp.position.set(cx, 0, cz); scene.add(grp);
      addFoot(cx, cz, bw, bd);
      colliders.push({ min: new THREE.Vector3(cx - bw / 2 - 0.05, 0, cz - bd / 2 - 0.05), max: new THREE.Vector3(cx + bw / 2 + 0.05, bh + 1, cz + bd / 2 + 0.05) });
      if (t.enter && bw > 5) {
        doors.push({ type: typeKey, hinge: grp.userData.doorHinge, openAngle: -Math.PI * 0.62, dx: cx, dy: 1.1, dz: cz + bd / 2, exitSpot: new THREE.Vector3(cx, CONFIG.playerHeight, cz + bd / 2 + 1.8) });
      }
    }
  }
}

function placeProps() {
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3a48 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  const half = CONFIG.worldSize * 0.36;
  const cell = CONFIG.blockSize + CONFIG.streetWidth;
  for (let gx = -half; gx < half; gx += cell) {
    for (let gz = -half; gz < half; gz += cell) {
      const px = gx + CONFIG.streetWidth * 0.35, pz = gz + CONFIG.streetWidth * 0.5;
      if (!isClear(px, pz, 0.6)) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 5), lampMat);
      pole.position.set(px, 1.6, pz); scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 5, 4), glowMat);
      bulb.position.set(px, 3.25, pz); scene.add(bulb);
    }
  }
  let trees = 0;
  for (let i = 0; i < 40 && trees < 12; i++) {
    const a = Math.random() * Math.PI * 2, d = 14 + Math.random() * (CONFIG.worldSize * 0.3);
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;
    if (!isClear(px, pz, 1.2)) continue;
    const tg = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.5, 6), new THREE.MeshLambertMaterial({ color: 0x5a4030 }));
    trunk.position.y = 0.75; tg.add(trunk);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.85 + Math.random() * 0.3, 7, 6), new THREE.MeshLambertMaterial({ color: 0x2d8a3e }));
    leaf.position.y = 2.0; leaf.scale.y = 0.9; tg.add(leaf);
    tg.position.set(px, 0, pz); scene.add(tg); trees++;
  }
}

function makeCar(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a3a4a, transparent: true, opacity: 0.7 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  let L = 2.0, H = 0.42, W = 0.95;
  if (kind === 'bus') { L = 3.4; H = 0.9; W = 1.15; }
  else if (kind === 'taxi') { L = 2.1; }
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), bodyMat);
  body.position.y = 0.35 + H * 0.15; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(kind === 'bus' ? L * 0.85 : 0.95, kind === 'bus' ? 0.55 : 0.38, W * 0.9), glass);
  cabin.position.set(kind === 'bus' ? 0 : -0.08, 0.55 + H * 0.4, 0); g.add(cabin);
  for (const wz of [W * 0.35, -W * 0.35]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.16), new THREE.MeshBasicMaterial({ color: 0xfff8e0 }));
    hl.position.set(L * 0.5, 0.38, wz); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.14), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    tl.position.set(-L * 0.5, 0.38, wz); g.add(tl);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.22), new THREE.MeshBasicMaterial({ color: 0xffdd00 }));
    sign.position.set(-0.05, 1.05, 0); g.add(sign);
  }
  const wheels = [];
  for (const [wx, wz] of [[L * 0.3, W * 0.48], [L * 0.3, -W * 0.48], [-L * 0.3, W * 0.48], [-L * 0.3, -W * 0.48]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 8), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.17, wz); g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

function spawnCars() {
  const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xffffff, 0x2c3e50];
  const cell = CONFIG.blockSize + CONFIG.streetWidth;
  const half = CONFIG.worldSize * 0.34;
  let id = 0;
  for (let gz = -half; gz < half; gz += cell) {
    if (id >= 8) break;
    const kind = id % 5 === 0 ? 'taxi' : id % 7 === 0 ? 'bus' : 'car';
    const col = kind === 'taxi' ? 0xf1c40f : kind === 'bus' ? 0xf39c12 : colors[id % colors.length];
    const body = makeCar(col, kind);
    const dir = id % 2 === 0 ? 1 : -1;
    body.position.set((Math.random() - 0.5) * CONFIG.worldSize * 0.5, 0.5, gz + CONFIG.streetWidth * 0.5 + (dir > 0 ? -1.4 : 1.4));
    body.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(body);
    cars.push({ mesh: body, axis: 'x', dir, speed: 6 + Math.random() * 5, baseSpeed: 6 + Math.random() * 5, bound: half });
    id++;
  }
  for (let gx = -half; gx < half; gx += cell) {
    if (id >= 14) break;
    const kind = id % 5 === 0 ? 'taxi' : id % 7 === 0 ? 'bus' : 'car';
    const col = kind === 'taxi' ? 0xf1c40f : kind === 'bus' ? 0xf39c12 : colors[id % colors.length];
    const body = makeCar(col, kind);
    const dir = id % 2 === 0 ? 1 : -1;
    body.position.set(gx + CONFIG.streetWidth * 0.5 + (dir > 0 ? -1.4 : 1.4), 0.5, (Math.random() - 0.5) * CONFIG.worldSize * 0.45);
    body.rotation.y = dir > 0 ? 0 : Math.PI;
    scene.add(body);
    cars.push({ mesh: body, axis: 'z', dir, speed: 6 + Math.random() * 5, baseSpeed: 6 + Math.random() * 5, bound: half });
    id++;
  }
}

function updateCars(dt) {
  if (interiorActive) return;
  for (const c of cars) {
    const red = lightStateNear(c.mesh.position.x, c.mesh.position.z, c.axis, c.dir);
    const target = red ? 0 : c.baseSpeed;
    c.speed += (target - c.speed) * Math.min(1, dt * 3);
    if (c.axis === 'x') {
      c.mesh.position.x += c.dir * c.speed * dt;
      if (c.mesh.position.x > c.bound) c.mesh.position.x = -c.bound;
      if (c.mesh.position.x < -c.bound) c.mesh.position.x = c.bound;
    } else {
      c.mesh.position.z += c.dir * c.speed * dt;
      if (c.mesh.position.z > c.bound) c.mesh.position.z = -c.bound;
      if (c.mesh.position.z < -c.bound) c.mesh.position.z = c.bound;
    }
    const wheels = c.mesh.userData.wheels;
    if (wheels) for (const w of wheels) w.rotation.x += c.speed * dt * 2.5;
  }
}

function makeCharacter(shirtCol, opts = {}) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin || 0xf0c8a0 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtCol });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants || 0x2c3e50 });
  const shoe = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const hairM = new THREE.MeshLambertMaterial({ color: opts.hair || 0x3b2a1a });
  const jacket = new THREE.MeshLambertMaterial({ color: opts.jacket || shirtCol });
  const legL = new THREE.Group(); legL.position.set(-0.12, 0.78, 0);
  const thighL = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.34, 8), pants); thighL.position.y = -0.17; legL.add(thighL);
  const shinL = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 0.3, 8), pants); shinL.position.y = -0.47; legL.add(shinL);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), shoe); shoeL.position.set(0, -0.64, 0.04); legL.add(shoeL);
  g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.12, 0.78, 0);
  const thighR = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.34, 8), pants); thighR.position.y = -0.17; legR.add(thighR);
  const shinR = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 0.3, 8), pants); shinR.position.y = -0.47; legR.add(shinR);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), shoe); shoeR.position.set(0, -0.64, 0.04); legR.add(shoeR);
  g.add(legR);
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.155, 0.15, 10), pants); hips.position.y = 0.82; g.add(hips);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.175, 0.44, 10), shirt); torso.position.y = 1.1; g.add(torso);
  const jacketMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.19, 0.4, 10), jacket); jacketMesh.position.y = 1.12; g.add(jacketMesh);
  const armL = new THREE.Group(); armL.position.set(-0.23, 1.26, 0);
  const upperL = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.3, 7), jacket); upperL.position.y = -0.15; armL.add(upperL);
  const lowerL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.26, 7), skin); lowerL.position.y = -0.41; armL.add(lowerL);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), skin); handL.position.y = -0.56; armL.add(handL);
  g.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.23, 1.26, 0);
  const upperR = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.3, 7), jacket); upperR.position.y = -0.15; armR.add(upperR);
  const lowerR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.26, 7), skin); lowerR.position.y = -0.41; armR.add(lowerR);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), skin); handR.position.y = -0.56; armR.add(handR);
  g.add(armR);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.11, 8), skin); neck.position.y = 1.36; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin); head.position.y = 1.52; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), hairM); hair.position.y = 1.58; hair.scale.set(1.05, 0.72, 1.05); g.add(hair);
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.06), hairM); fringe.position.set(0, 1.58, 0.11); g.add(fringe);
  const eyeW = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const eyeP = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
  const eL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), eyeW); eL.position.set(-0.048, 1.54, 0.115); g.add(eL);
  const pL = new THREE.Mesh(new THREE.SphereGeometry(0.015, 5, 4), eyeP); pL.position.set(-0.048, 1.54, 0.135); g.add(pL);
  const eR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), eyeW); eR.position.set(0.048, 1.54, 0.115); g.add(eR);
  const pR = new THREE.Mesh(new THREE.SphereGeometry(0.015, 5, 4), eyeP); pR.position.set(0.048, 1.54, 0.135); g.add(pR);
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.014, 0.02), hairM); browL.position.set(-0.048, 1.58, 0.125); g.add(browL);
  const browR = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.014, 0.02), hairM); browR.position.set(0.048, 1.58, 0.125); g.add(browR);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), skin); nose.position.set(0, 1.51, 0.135); g.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.014, 0.016), new THREE.MeshLambertMaterial({ color: 0xb06060 }));
  mouth.position.set(0, 1.455, 0.13); g.add(mouth);
  g.userData = { legL, legR, armL, armR, torso };
  return g;
}

function buildPlayerBody() {
  playerBody = makeCharacter(0x3498db, { jacket: 0x2980b9 });
  playerBody.visible = false;
  scene.add(playerBody);
}

function spawnNpcs() {
  const cols = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe91e63, 0xffffff];
  const half = CONFIG.worldSize * 0.3;
  for (let i = 0; i < 10; i++) {
    const mesh = makeCharacter(cols[i % cols.length], { jacket: cols[(i + 3) % cols.length] });
    let x, z, tries = 0;
    do { x = (Math.random() - 0.5) * half * 2; z = (Math.random() - 0.5) * half * 2; tries++; }
    while (!isClear(x, z, 0.6) && tries < 20);
    mesh.position.set(x, 0, z); scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    npcs.push({ mesh, vx: Math.cos(a) * (0.8 + Math.random()), vz: Math.sin(a) * (0.8 + Math.random()), timer: 1.5 + Math.random() * 3, bound: half, phase: Math.random() * 10 });
  }
}

function updateNpcs(dt) {
  if (interiorActive) return;
  for (const n of npcs) {
    n.timer -= dt; n.phase += dt * 8;
    if (n.timer <= 0) {
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random();
      n.vx = Math.cos(a) * s; n.vz = Math.sin(a) * s; n.timer = 1.5 + Math.random() * 3;
    }
    let nx = n.mesh.position.x + n.vx * dt, nz = n.mesh.position.z + n.vz * dt;
    if (!isClear(nx, nz, 0.45)) { n.vx *= -1; n.vz *= -1; nx = n.mesh.position.x; nz = n.mesh.position.z; }
    if (Math.abs(nx) > n.bound) { n.vx *= -1; nx = THREE.MathUtils.clamp(nx, -n.bound, n.bound); }
    if (Math.abs(nz) > n.bound) { n.vz *= -1; nz = THREE.MathUtils.clamp(nz, -n.bound, n.bound); }
    n.mesh.position.x = nx; n.mesh.position.z = nz; n.mesh.position.y = 0;
    n.mesh.rotation.y = Math.atan2(n.vx, n.vz);
    const ud = n.mesh.userData;
    if (ud && ud.legL) {
      const sw = Math.sin(n.phase) * 0.4;
      ud.legL.rotation.x = sw; ud.legR.rotation.x = -sw;
      if (ud.armL) { ud.armL.rotation.x = -sw * 0.7; ud.armR.rotation.x = sw * 0.7; }
    }
  }
}

function spawnAnimals() {
  const dogCols = [0x8b6914, 0x4a3728, 0xd4a574];
  const half = CONFIG.worldSize * 0.28;
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: dogCols[i % 3] });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 0.28), mat); body.position.set(0, 0.32, 0); g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), mat); head.position.set(0.32, 0.38, 0); g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.12), mat); snout.position.set(0.45, 0.32, 0); g.add(snout);
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), mat); earL.position.set(0.3, 0.5, 0.08); g.add(earL);
    const earR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), mat); earR.position.set(0.3, 0.5, -0.08); g.add(earR);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.07), mat); tail.position.set(-0.35, 0.38, 0); tail.rotation.z = 0.4; g.add(tail);
    for (const [lx, lz] of [[0.18, 0.1], [0.18, -0.1], [-0.18, 0.1], [-0.18, -0.1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), mat);
      leg.position.set(lx, 0.11, lz); g.add(leg);
    }
    let x, z, tries = 0;
    do { x = (Math.random() - 0.5) * half * 2; z = (Math.random() - 0.5) * half * 2; tries++; }
    while (!isClear(x, z, 0.5) && tries < 12);
    g.position.set(x, 0, z); scene.add(g);
    const a = Math.random() * Math.PI * 2;
    animals.push({ mesh: g, vx: Math.cos(a) * 1.3, vz: Math.sin(a) * 1.3, timer: 1.5 + Math.random() * 3, bound: half });
  }
  for (let i = 0; i < 4; i++) {
    const bird = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    const a = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 30;
    bird.position.set(Math.cos(a) * r, 12 + Math.random() * 6, Math.sin(a) * r);
    scene.add(bird);
    animals.push({ mesh: bird, vx: 0, vz: 0, timer: 0, bound: 40, bird: true, angle: a, radius: r, height: bird.position.y, speed: 0.4 + Math.random() * 0.3 });
  }
}

function updateAnimals(dt) {
  if (interiorActive) return;
  for (const d of animals) {
    if (d.bird) {
      d.angle += d.speed * dt;
      d.mesh.position.x = Math.cos(d.angle) * d.radius;
      d.mesh.position.z = Math.sin(d.angle) * d.radius;
      d.mesh.position.y = d.height + Math.sin(d.angle * 3) * 0.8;
      continue;
    }
    d.timer -= dt;
    if (d.timer <= 0) {
      const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 1.5;
      d.vx = Math.cos(a) * s; d.vz = Math.sin(a) * s; d.timer = 1.5 + Math.random() * 3;
    }
    let nx = d.mesh.position.x + d.vx * dt, nz = d.mesh.position.z + d.vz * dt;
    if (!isClear(nx, nz, 0.4)) { d.vx *= -1; d.vz *= -1; nx = d.mesh.position.x; nz = d.mesh.position.z; }
    if (Math.abs(nx) > d.bound) { d.vx *= -1; nx = THREE.MathUtils.clamp(nx, -d.bound, d.bound); }
    if (Math.abs(nz) > d.bound) { d.vz *= -1; nz = THREE.MathUtils.clamp(nz, -d.bound, d.bound); }
    d.mesh.position.x = nx; d.mesh.position.z = nz; d.mesh.position.y = 0;
    d.mesh.rotation.y = Math.atan2(d.vx, d.vz);
  }
}

function buildInteriorRoom() {
  interiorGroup = new THREE.Group();
  interiorGroup.visible = false;
  scene.add(interiorGroup);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0xc4a574 }));
  floor.position.set(INT_ORIGIN.x, INT_ORIGIN.y, INT_ORIGIN.z); interiorGroup.add(floor);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 8), new THREE.MeshLambertMaterial({ color: 0xf5e6d3, side: THREE.BackSide }));
  walls.position.set(INT_ORIGIN.x, INT_ORIGIN.y + 2, INT_ORIGIN.z); interiorGroup.add(walls);
  const light = new THREE.PointLight(0xfff0d0, 1.2, 20);
  light.position.set(INT_ORIGIN.x, INT_ORIGIN.y + 3.5, INT_ORIGIN.z); interiorGroup.add(light);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1), new THREE.MeshLambertMaterial({ color: 0x8b4513 }));
  table.position.set(INT_ORIGIN.x, INT_ORIGIN.y + 0.75, INT_ORIGIN.z); interiorGroup.add(table);
  const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x5c3317 });
  for (const [ox, oz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) {
    const l = new THREE.Mesh(legGeo, legMat);
    l.position.set(INT_ORIGIN.x + ox, INT_ORIGIN.y + 0.35, INT_ORIGIN.z + oz);
    interiorGroup.add(l);
  }
  const couch = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.9), new THREE.MeshLambertMaterial({ color: 0x6b3a3a }));
  couch.position.set(INT_ORIGIN.x, INT_ORIGIN.y + 0.4, INT_ORIGIN.z - 2.5); interiorGroup.add(couch);
  INTERIOR_EXIT_WORLD = new THREE.Vector3(INT_ORIGIN.x, INT_ORIGIN.y + 1.1, INT_ORIGIN.z + 3.5);
}

function getLookDir(out) {
  const cp = Math.cos(player.pitch);
  out.set(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
  return out;
}

function updateInteract() {
  if (!interactEl) return;
  getLookDir(_lookDir);
  const eye = player.pos;
  let nearestDist = 999, nearestDot = -1, nearest = null;
  if (!interiorActive) {
    for (const d of doors) {
      _tmp.set(d.dx, d.dy, d.dz).sub(eye);
      const dist = _tmp.length();
      if (dist < 0.01) continue;
      _tmp.multiplyScalar(1 / dist);
      const dot = _tmp.dot(_lookDir);
      if (dist < nearestDist) { nearestDist = dist; nearestDot = dot; nearest = d; }
    }
    currentDoorTarget = null;
    if (nearest && nearestDist <= INTERACT_DIST && (nearestDot >= INTERACT_DOT || nearestDist < 3.2)) {
      currentDoorTarget = nearest; lockedDoor = nearest; interactEl.textContent = 'OPEN DOOR';
    } else if (lockedDoor && lockedDoor !== 'exit') {
      const d = lockedDoor;
      const dd = _tmp.set(d.dx, eye.y, d.dz).sub(eye).length();
      if (dd > INTERACT_DIST + 2.5) lockedDoor = null;
      else { currentDoorTarget = lockedDoor; interactEl.textContent = 'OPEN DOOR'; }
    }
  } else if (INTERIOR_EXIT_WORLD) {
    _tmp.copy(INTERIOR_EXIT_WORLD).sub(eye);
    const dist = _tmp.length(); nearestDist = dist;
    if (dist > 0.01) { _tmp.multiplyScalar(1 / dist); nearestDot = _tmp.dot(_lookDir); }
    if (dist <= INTERACT_DIST && (nearestDot > 0.4 || dist < 2.5)) {
      currentDoorTarget = 'exit'; lockedDoor = 'exit'; interactEl.textContent = 'EXIT';
    } else if (lockedDoor === 'exit' && dist > INTERACT_DIST + 2) {
      lockedDoor = null; currentDoorTarget = null;
    } else if (lockedDoor === 'exit') {
      currentDoorTarget = 'exit'; interactEl.textContent = 'EXIT';
    }
  }
  if (!doorAnim) {
    const show = !!(currentDoorTarget || lockedDoor);
    interactEl.classList.toggle('hidden', !show);
    if (show) {
      interactEl.style.display = 'block';
      interactEl.style.opacity = '1';
      interactEl.style.pointerEvents = 'auto';
    } else interactEl.style.display = 'none';
  }
}

function doInteract() {
  const target = lockedDoor || currentDoorTarget;
  if (!target || doorAnim) return;
  if (interactEl) { interactEl.classList.add('hidden'); interactEl.style.display = 'none'; }
  if (target === 'exit') { startExit(); return; }
  startDoorOpen(target);
}

function startDoorOpen(door) {
  lockedDoor = null; currentDoorTarget = null;
  if (door.hinge) door.hinge.rotation.y = 0;
  doorAnim = { mode: 'open', hinge: door.hinge, t: 0, dur: 0.35, door, targetAngle: door.openAngle || -1.95, done: false };
  player.vel.set(0, 0, 0);
}

function startExit() {
  lockedDoor = null; currentDoorTarget = null;
  const door = doors.find(d => d.type === interiorActive) || doors[0];
  exitInterior();
  if (door && door.hinge) {
    door.hinge.rotation.y = door.openAngle || -1.95;
    doorAnim = { mode: 'close', hinge: door.hinge, t: 0, dur: 0.35, door, targetAngle: 0, done: false };
  }
}

function updateDoorAnim(dt) {
  if (!doorAnim) return;
  doorAnim.t += dt;
  const k = Math.min(1, doorAnim.t / doorAnim.dur);
  const e = 1 - Math.pow(1 - k, 3);
  if (doorAnim.hinge) {
    if (doorAnim.mode === 'open') doorAnim.hinge.rotation.y = e * doorAnim.targetAngle;
    else doorAnim.hinge.rotation.y = (1 - e) * (doorAnim.door.openAngle || -1.95);
  }
  if (k >= 1 && !doorAnim.done) {
    doorAnim.done = true;
    const door = doorAnim.door, mode = doorAnim.mode;
    doorAnim = null;
    if (mode === 'open') enterInterior(door);
  }
}

function enterInterior(door) {
  interiorExitPos = door.exitSpot.clone();
  interiorActive = door.type;
  outdoorColliders = colliders; colliders = [];
  if (interiorGroup) interiorGroup.visible = true;
  player.pos.set(INT_ORIGIN.x, INT_ORIGIN.y + CONFIG.playerHeight, INT_ORIGIN.z + 2.5);
  player.vel.set(0, 0, 0);
  scene.fog.near = 20; scene.fog.far = 30;
  scene.background = new THREE.Color(0x2a2a30);
}

function exitInterior() {
  if (!interiorActive) return;
  if (interiorGroup) interiorGroup.visible = false;
  interiorActive = null;
  colliders = outdoorColliders || [];
  if (interiorExitPos) player.pos.copy(interiorExitPos);
  player.vel.set(0, 0, 0);
  scene.fog.near = 50; scene.fog.far = 180;
  scene.background = new THREE.Color(0x87B8D8);
}

function setupControls() {
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  const lookZone = document.getElementById('look-zone');
  const jumpBtn = document.getElementById('jump-btn');
  const camBtn = document.getElementById('cam-btn');
  const maxStick = 40;
  let stickId = null, lookId = null;
  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy) || 0.0001;
    const c = Math.min(len, maxStick);
    const nx = (dx / len) * c, ny = (dy / len) * c;
    if (knob) knob.style.transform = `translate(${nx}px,${ny}px)`;
    moveInput.x = nx / maxStick; moveInput.y = -ny / maxStick;
  }
  function resetStick() {
    if (knob) knob.style.transform = 'translate(0px,0px)';
    moveInput.x = 0; moveInput.y = 0; stickId = null;
  }
  if (base) {
    base.addEventListener('touchstart', e => {
      e.preventDefault(); if (stickId !== null) return;
      const t = e.changedTouches[0]; stickId = t.identifier;
      const r = base.getBoundingClientRect();
      setStick(t.clientX - (r.left + r.width / 2), t.clientY - (r.top + r.height / 2));
    }, { passive: false });
    base.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === stickId) {
        const r = base.getBoundingClientRect();
        setStick(t.clientX - (r.left + r.width / 2), t.clientY - (r.top + r.height / 2));
      }
    }, { passive: false });
    const end = e => { for (const t of e.changedTouches) if (t.identifier === stickId) resetStick(); };
    base.addEventListener('touchend', end); base.addEventListener('touchcancel', end);
  }
  if (lookZone) {
    lookZone.addEventListener('touchstart', e => {
      const t0 = e.changedTouches[0];
      if (interactEl && !interactEl.classList.contains('hidden')) {
        const r = interactEl.getBoundingClientRect();
        if (t0.clientX >= r.left - 12 && t0.clientX <= r.right + 12 && t0.clientY >= r.top - 12 && t0.clientY <= r.bottom + 12) return;
      }
      e.preventDefault(); if (lookId !== null) return;
      lookId = t0.identifier; lastLookX = t0.clientX; lastLookY = t0.clientY;
    }, { passive: false });
    lookZone.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === lookId) {
        const dx = t.clientX - lastLookX, dy = t.clientY - lastLookY;
        lastLookX = t.clientX; lastLookY = t.clientY;
        player.yaw -= dx * CONFIG.lookSens;
        player.pitch = THREE.MathUtils.clamp(player.pitch - dy * CONFIG.lookSens, -CONFIG.maxPitch, CONFIG.maxPitch);
      }
    }, { passive: false });
    lookZone.addEventListener('touchend', e => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    });
  }
  if (jumpBtn) {
    jumpBtn.textContent = 'JMP';
    jumpBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      if (player.onGround) { player.vel.y = CONFIG.jumpForce; player.onGround = false; }
    }, { passive: false });
  }
  if (interactEl) {
    let tapped = false;
    const fire = e => {
      if (interactEl.classList.contains('hidden') && !lockedDoor) return;
      e.preventDefault(); e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (tapped) return; tapped = true; setTimeout(() => tapped = false, 400);
      doInteract();
    };
    ['pointerup', 'pointerdown', 'touchend', 'touchstart', 'click', 'mouseup'].forEach(ev => {
      interactEl.addEventListener(ev, fire, { passive: false, capture: true });
    });
    document.addEventListener('touchend', e => {
      if (!started || !interactEl || interactEl.classList.contains('hidden') || doorAnim) return;
      const t = e.changedTouches && e.changedTouches[0]; if (!t) return;
      const r = interactEl.getBoundingClientRect();
      if (t.clientX >= r.left - 28 && t.clientX <= r.right + 28 && t.clientY >= r.top - 28 && t.clientY <= r.bottom + 28) {
        e.preventDefault(); fire(e);
      }
    }, { passive: false, capture: true });
  }
  if (camBtn) {
    camBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      camMode = (camMode + 1) % 3;
      if (camLabelEl) camLabelEl.textContent = CONFIG.camModes[camMode];
    }, { passive: false });
  }
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space' && player.onGround) { player.vel.y = CONFIG.jumpForce; player.onGround = false; }
    if (e.code === 'KeyE' || e.code === 'KeyF') doInteract();
    if (e.code === 'KeyC') {
      camMode = (camMode + 1) % 3;
      if (camLabelEl) camLabelEl.textContent = CONFIG.camModes[camMode];
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  document.addEventListener('click', () => {
    if (started && !('ontouchstart' in window)) document.body.requestPointerLock?.();
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement) {
      player.yaw -= e.movementX * CONFIG.lookSensDesktop;
      player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * CONFIG.lookSensDesktop, -CONFIG.maxPitch, CONFIG.maxPitch);
    }
  });
}

function updatePlayer(dt) {
  let mx = moveInput.x, my = moveInput.y;
  if (keys['KeyW'] || keys['ArrowUp']) my += 1;
  if (keys['KeyS'] || keys['ArrowDown']) my -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
  const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
  _f.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _r.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const speed = CONFIG.moveSpeed * (keys['ShiftLeft'] || keys['ShiftRight'] ? 1.55 : 1);
  _w.set(0, 0, 0); _w.addScaledVector(_f, my); _w.addScaledVector(_r, mx);
  if (_w.lengthSq() > 0) _w.normalize().multiplyScalar(speed);
  player.vel.x = _w.x; player.vel.z = _w.z; player.vel.y += CONFIG.gravity * dt;
  let nx = player.pos.x + player.vel.x * dt;
  let ny = player.pos.y + player.vel.y * dt;
  let nz = player.pos.z + player.vel.z * dt;
  const groundY = CONFIG.playerHeight;
  if (ny <= groundY) { ny = groundY; player.vel.y = 0; player.onGround = true; }
  else player.onGround = false;
  const pr = CONFIG.playerRadius;
  for (const c of colliders) {
    if (nx > c.min.x - pr && nx < c.max.x + pr && nz > c.min.z - pr && nz < c.max.z + pr && ny > c.min.y && ny - CONFIG.playerHeight < c.max.y) {
      const cx = (c.min.x + c.max.x) * 0.5, cz = (c.min.z + c.max.z) * 0.5;
      const dx = nx - cx, dz = nz - cz;
      const hx = (c.max.x - c.min.x) * 0.5 + pr, hz = (c.max.z - c.min.z) * 0.5 + pr;
      if (hx - Math.abs(dx) < hz - Math.abs(dz)) nx = cx + Math.sign(dx || 1) * hx;
      else nz = cz + Math.sign(dz || 1) * hz;
    }
  }
  if (!interiorActive) {
    const b = CONFIG.worldSize * 0.45;
    nx = THREE.MathUtils.clamp(nx, -b, b);
    nz = THREE.MathUtils.clamp(nz, -b, b);
  } else {
    nx = THREE.MathUtils.clamp(nx, INT_ORIGIN.x - 4.5, INT_ORIGIN.x + 4.5);
    nz = THREE.MathUtils.clamp(nz, INT_ORIGIN.z - 3.5, INT_ORIGIN.z + 3.8);
  }
  player.pos.set(nx, ny, nz);
  const spd = Math.hypot(player.vel.x, player.vel.z);
  const moving = spd > 0.5 && player.onGround;
  if (playerBody) {
    playerBody.visible = camMode !== 0;
    const target = moving ? Math.min(1, spd / CONFIG.moveSpeed) : 0;
    walkAmt += (target - walkAmt) * Math.min(1, dt * 8);
    if (walkAmt > 0.05) walkPhase += dt * 10 * walkAmt; else walkPhase *= 0.9;
    const swing = Math.sin(walkPhase) * 0.55 * walkAmt;
    const bob = Math.abs(Math.sin(walkPhase * 2)) * 0.03 * walkAmt;
    const ud = playerBody.userData;
    if (ud.legL) { ud.legL.rotation.x = swing; ud.legR.rotation.x = -swing; }
    if (ud.armL) { ud.armL.rotation.x = -swing * 0.8; ud.armR.rotation.x = swing * 0.8; }
    if (ud.torso) ud.torso.position.y = 1.1 + bob;
    playerBody.position.set(player.pos.x, player.pos.y - CONFIG.playerHeight, player.pos.z);
    playerBody.rotation.y = player.yaw;
  }
}

function updateCamera() {
  if (camMode === 0) {
    camera.position.set(player.pos.x, player.pos.y + 0.15, player.pos.z);
    const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    camera.lookAt(player.pos.x - Math.sin(player.yaw) * cp * 2, player.pos.y + 0.15 + sp * 2, player.pos.z - Math.cos(player.yaw) * cp * 2);
  } else if (camMode === 1) {
    camera.position.set(player.pos.x + Math.sin(player.yaw) * 3.5, player.pos.y + 1.8, player.pos.z + Math.cos(player.yaw) * 3.5);
    camera.lookAt(player.pos.x, player.pos.y + 0.6, player.pos.z);
  } else {
    camera.position.set(player.pos.x - Math.sin(player.yaw) * 3, player.pos.y + 1.5, player.pos.z - Math.cos(player.yaw) * 3);
    camera.lookAt(player.pos.x, player.pos.y + 0.8, player.pos.z);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (started) {
    updatePlayer(dt);
    updateDoorAnim(dt);
    updateInteract();
    updateCars(dt);
    updateNpcs(dt);
    updateAnimals(dt);
    updateTrafficLights(dt);
    updateCamera();
  }
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime > 500) {
    if (fpsEl) fpsEl.textContent = String(Math.round(frameCount * 1000 / (now - lastFpsTime)));
    frameCount = 0; lastFpsTime = now;
  }
  renderer.render(scene, camera);
}

init();
