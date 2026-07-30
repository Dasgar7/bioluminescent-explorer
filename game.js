import * as THREE from 'three';

// Config — bright stylized daytime, mobile-safe
const CONFIG = {
  moveSpeed: 7.4,
  sprintMult: 1.5,
  jumpForce: 9.2,
  gravity: -22,
  playerHeight: 1.65,
  playerRadius: 0.38,
  lookSens: 0.0026,
  lookSensDesktop: 0.0020,
  maxPitch: Math.PI / 2.2,
  worldSize: 170,
  terrainRes: 96,
  maxLights: 18,
  sporeCount: 140
};

let scene, camera, renderer, clock;
let player = { pos: new THREE.Vector3(0, 16, 0), vel: new THREE.Vector3(0, 0, 0), onGround: false, yaw: 0, pitch: -0.08 };
let heightData, colliders = [], moveInput = { x: 0, z: 0 };
let lastLookX = 0, lastLookY = 0, keys = {};
let fpsEl, frameCount = 0, lastFpsTime = 0, started = false;
let spores = null, sporeVel = null, sunLight;

function init() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x87ceeb);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc8e4f0, 0.0095);
  scene.background = new THREE.Color(0x87ceeb);

  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.15, 260);
  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffe8c8, 0x6a9e6a, 0.75));
  sunLight = new THREE.DirectionalLight(0xfff0d8, 1.35);
  sunLight.position.set(45, 80, 30);
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0xa8d0ff, 0.28);
  fill.position.set(-40, 30, -50);
  scene.add(fill);

  buildSkyDome();
  buildTerrain();
  placeFloatingRocks();
  placeStructures();
  placeGiantMushrooms();
  placeGlowFlora();
  placeCrystalClusters();
  createSpores();

  player.pos.y = getHeight(0, 0) + CONFIG.playerHeight + 1.5;
  setupControls();
  window.addEventListener('resize', onResize, { passive: true });
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.body.addEventListener('touchmove', (e) => { if (started) e.preventDefault(); }, { passive: false });
  fpsEl = document.getElementById('fps');
  animate();
}

function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  started = true;
  if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
}

function buildSkyDome() {
  const geo = new THREE.SphereGeometry(220, 24, 16);
  geo.scale(-1, 1, 1);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y / 220 + 0.35) / 1.1, 0, 1);
    let r, g, b;
    if (t < 0.35) { const k = t / 0.35; r = 1.0 - k * 0.15; g = 0.55 + k * 0.25; b = 0.45 + k * 0.35; }
    else if (t < 0.7) { const k = (t - 0.35) / 0.35; r = 0.85 - k * 0.35; g = 0.8 - k * 0.15; b = 0.8 + k * 0.1; }
    else { const k = (t - 0.7) / 0.3; r = 0.5 - k * 0.15; g = 0.65 + k * 0.1; b = 0.9 + k * 0.08; }
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false }));
  sun.position.copy(sunLight.position).normalize().multiplyScalar(180);
  scene.add(sun);
}

function noise2(x, z) { const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return n - Math.floor(n); }
function fbm(x, z, octaves = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) { v += a * (noise2(x * f, z * f) * 2 - 1); a *= 0.5; f *= 2.03; }
  return v;
}

function buildTerrain() {
  const res = CONFIG.terrainRes, size = CONFIG.worldSize;
  const geo = new THREE.PlaneGeometry(size, size, res - 1, res - 1);
  geo.rotateX(-Math.PI / 2);
  heightData = new Float32Array(res * res);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const biomes = [
    { r: 0.25, g: 0.55, b: 0.35 }, { r: 0.45, g: 0.35, b: 0.55 }, { r: 0.55, g: 0.45, b: 0.25 },
    { r: 0.30, g: 0.50, b: 0.55 }, { r: 0.50, g: 0.28, b: 0.35 }
  ];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = fbm(x * 0.032, z * 0.032, 5) * 7.5;
    h += fbm(x * 0.011, z * 0.011, 3) * 12;
    h += Math.sin(x * 0.04) * Math.cos(z * 0.035) * 2.5;
    h += Math.max(0, fbm(x * 0.008, z * 0.008, 2)) * 8;
    h *= 0.45 + 0.55 * Math.min(1, Math.hypot(x, z) / 50);
    pos.setY(i, h); heightData[i] = h;
    const bx = fbm(x * 0.018 + 40, z * 0.018, 2), bz = fbm(x * 0.015, z * 0.015 + 20, 2);
    const bi = Math.floor(((bx + 1) * 0.5 * 0.99) * biomes.length);
    const bj = Math.floor(((bz + 1) * 0.5 * 0.99) * biomes.length);
    const b0 = biomes[THREE.MathUtils.clamp(bi, 0, biomes.length - 1)];
    const b1 = biomes[THREE.MathUtils.clamp(bj, 0, biomes.length - 1)];
    const mix = (noise2(x * 0.05, z * 0.05) + 1) * 0.5;
    const ht = THREE.MathUtils.clamp((h + 4) / 22, 0, 1);
    colors[i * 3] = (b0.r * (1 - mix) + b1.r * mix) * (0.75 + ht * 0.35);
    colors[i * 3 + 1] = (b0.g * (1 - mix) + b1.g * mix) * (0.75 + ht * 0.3);
    colors[i * 3 + 2] = (b0.b * (1 - mix) + b1.b * mix) * (0.8 + ht * 0.25);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.05 })));
}

function sampleHeight(x, z) {
  const res = CONFIG.terrainRes, size = CONFIG.worldSize, half = size / 2;
  const u = (x + half) / size, v = (z + half) / size;
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
  const fx = u * (res - 1), fz = v * (res - 1);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const i00 = iz * res + ix, i10 = iz * res + Math.min(ix + 1, res - 1);
  const i01 = Math.min(iz + 1, res - 1) * res + ix, i11 = Math.min(iz + 1, res - 1) * res + Math.min(ix + 1, res - 1);
  const h0 = (heightData[i00] ?? 0) * (1 - tx) + (heightData[i10] ?? 0) * tx;
  const h1 = (heightData[i01] ?? 0) * (1 - tx) + (heightData[i11] ?? 0) * tx;
  return h0 * (1 - tz) + h1 * tz;
}
function getHeight(x, z) { return sampleHeight(x, z); }

function placeFloatingRocks() {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a5a78, roughness: 0.7, metalness: 0.15, emissive: 0x1a0a28, emissiveIntensity: 0.08 });
  const veinMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 9; i++) {
    const angle = Math.random() * Math.PI * 2, dist = 20 + Math.random() * 55;
    const px = Math.cos(angle) * dist, pz = Math.sin(angle) * dist;
    const baseY = getHeight(px, pz), floatH = 6 + Math.random() * 14;
    const group = new THREE.Group(); group.position.set(px, baseY + floatH, pz);
    const s = 1.8 + Math.random() * 2.8;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.rotation.set(Math.random(), Math.random(), Math.random()); group.add(rock);
    for (let j = 0; j < 2 + (i % 2); j++) {
      const cs = 0.4 + Math.random() * 0.9;
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(cs, 0), rockMat);
      const a = Math.random() * Math.PI * 2;
      chunk.position.set(Math.cos(a) * (s + 1.2), (Math.random() - 0.5) * 2, Math.sin(a) * (s + 1.2));
      chunk.rotation.set(Math.random(), Math.random(), Math.random()); group.add(chunk);
    }
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.12, s * 1.6, 0.12), veinMat);
    vein.position.y = -s * 0.2; group.add(vein);
    if (i < 8) { const light = new THREE.PointLight(0x3dff9a, 1.1, 10, 1.8); light.position.set(0, -s * 0.8, 0); group.add(light); }
    scene.add(group);
  }
}

function placeStructures() {
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x4a4060, roughness: 0.75, metalness: 0.12, emissive: 0x0a1820, emissiveIntensity: 0.1 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2, dist = 14 + Math.random() * 60;
    const px = Math.cos(angle) * dist, pz = Math.sin(angle) * dist, py = getHeight(px, pz);
    const h = 4 + Math.random() * 9, r = 0.5 + Math.random() * 0.45;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 1.1, h, 6), pillarMat);
    pillar.position.set(px, py + h / 2, pz); pillar.rotation.y = Math.random() * Math.PI; scene.add(pillar);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.07, 6, 14), glowMat);
    ring.position.set(px, py + h * 0.92, pz); ring.rotation.x = Math.PI / 2; scene.add(ring);
    if (i < CONFIG.maxLights) { const light = new THREE.PointLight(0x3dff9a, 1.4, 11, 1.7); light.position.set(px, py + h + 0.3, pz); scene.add(light); }
    colliders.push({ min: new THREE.Vector3(px - r - 0.15, py, pz - r - 0.15), max: new THREE.Vector3(px + r + 0.15, py + h, pz + r + 0.15) });
  }
  for (let i = 0; i < 3; i++) {
    const angle = Math.random() * Math.PI * 2, dist = 25 + Math.random() * 40;
    const px = Math.cos(angle) * dist, pz = Math.sin(angle) * dist, py = getHeight(px, pz);
    const w = 4.2 + Math.random() * 2, h = 5.5 + Math.random() * 3;
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.55, h, 0.55), pillarMat); left.position.set(px - w / 2, py + h / 2, pz); scene.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.55, h, 0.55), pillarMat); right.position.set(px + w / 2, py + h / 2, pz); scene.add(right);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.55, 0.4, 0.55), pillarMat); top.position.set(px, py + h, pz); scene.add(top);
    const line = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.06, 0.08), glowMat); line.position.set(px, py + h + 0.14, pz); scene.add(line);
    const light = new THREE.PointLight(0x2aff80, 1.15, 10, 1.6); light.position.set(px, py + h + 0.7, pz); scene.add(light);
    colliders.push({ min: new THREE.Vector3(px - w / 2 - 0.4, py, pz - 0.5), max: new THREE.Vector3(px - w / 2 + 0.4, py + h, pz + 0.5) });
    colliders.push({ min: new THREE.Vector3(px + w / 2 - 0.4, py, pz - 0.5), max: new THREE.Vector3(px + w / 2 + 0.4, py + h, pz + 0.5) });
  }
}

function placeGiantMushrooms() {
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.85 });
  const capColors = [0xff6b9a, 0x7b5cff, 0xffb347, 0x4ecdc4, 0xc44569];
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2, dist = 12 + Math.random() * 65;
    const px = Math.cos(angle) * dist, pz = Math.sin(angle) * dist, py = getHeight(px, pz);
    const scale = 1.2 + Math.random() * 2.8, stemH = 2.2 * scale;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.4 * scale, stemH, 8), stemMat);
    stem.position.set(px, py + stemH / 2, pz); scene.add(stem);
    const capMat = new THREE.MeshStandardMaterial({ color: capColors[i % capColors.length], roughness: 0.55, metalness: 0.05, emissive: new THREE.Color(capColors[i % capColors.length]).multiplyScalar(0.15), emissiveIntensity: 0.35 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.1 * scale, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.set(px, py + stemH * 0.95, pz); cap.scale.y = 0.55; scene.add(cap);
    if (scale > 2.5) { const light = new THREE.PointLight(0x3dff9a, 0.7, 7, 2); light.position.set(px, py + stemH * 0.5, pz); scene.add(light); }
    if (scale > 1.8) colliders.push({ min: new THREE.Vector3(px - 0.35 * scale, py, pz - 0.35 * scale), max: new THREE.Vector3(px + 0.35 * scale, py + stemH, pz + 0.35 * scale) });
  }
}

function placeGlowFlora() {
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x1a3a22, roughness: 0.8, emissive: 0x0a4a22, emissiveIntensity: 0.4 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x5affb0, transparent: true, opacity: 0.95 });
  for (let i = 0; i < 80; i++) {
    const px = (Math.random() - 0.5) * CONFIG.worldSize * 0.88, pz = (Math.random() - 0.5) * CONFIG.worldSize * 0.88;
    const py = getHeight(px, pz), h = 1.3 + Math.random() * 3.2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, h, 4), stemMat);
    stem.position.set(px, py + h / 2, pz); stem.rotation.z = (Math.random() - 0.5) * 0.3; stem.rotation.x = (Math.random() - 0.5) * 0.25; scene.add(stem);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14 + Math.random() * 0.12, 6, 5), bulbMat);
    bulb.position.set(px + Math.sin(stem.rotation.z) * h * 0.45, py + h + 0.06, pz); scene.add(bulb);
    if (i % 6 === 0) { const light = new THREE.PointLight(0x4dff9a, 0.6, 5.5, 2.1); light.position.copy(bulb.position); scene.add(light); }
  }
}

function placeCrystalClusters() {
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x2aff9a, roughness: 0.25, metalness: 0.35, emissive: 0x1aff80, emissiveIntensity: 0.7, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2, dist = 10 + Math.random() * 70;
    const px = Math.cos(angle) * dist, pz = Math.sin(angle) * dist, py = getHeight(px, pz);
    const count = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < count; j++) {
      const h = 0.8 + Math.random() * 2.2;
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.18 + Math.random() * 0.15, h, 5), crystalMat);
      crystal.position.set(px + (Math.random() - 0.5) * 1.2, py + h / 2, pz + (Math.random() - 0.5) * 1.2);
      crystal.rotation.z = (Math.random() - 0.5) * 0.4; crystal.rotation.x = (Math.random() - 0.5) * 0.3; scene.add(crystal);
    }
    if (i % 3 === 0) { const light = new THREE.PointLight(0x3dff9a, 1.0, 7, 1.9); light.position.set(px, py + 1.5, pz); scene.add(light); }
  }
}

function createSpores() {
  const n = CONFIG.sporeCount;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(n * 3); sporeVel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * CONFIG.worldSize * 0.9, z = (Math.random() - 0.5) * CONFIG.worldSize * 0.9;
    positions[i * 3] = x; positions[i * 3 + 1] = getHeight(x, z) + 1.2 + Math.random() * 10; positions[i * 3 + 2] = z;
    sporeVel[i * 3] = (Math.random() - 0.5) * 0.4; sporeVel[i * 3 + 1] = (Math.random() - 0.5) * 0.28; sporeVel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  spores = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9dffc8, size: 0.22, transparent: true, opacity: 0.8, depthWrite: false, sizeAttenuation: true }));
  scene.add(spores);
}

function updateSpores(dt) {
  if (!spores) return;
  const pos = spores.geometry.attributes.position.array;
  for (let i = 0; i < CONFIG.sporeCount; i++) {
    const i3 = i * 3;
    pos[i3] += sporeVel[i3] * dt; pos[i3 + 1] += sporeVel[i3 + 1] * dt; pos[i3 + 2] += sporeVel[i3 + 2] * dt;
    const ground = getHeight(pos[i3], pos[i3 + 2]) + 0.6;
    if (pos[i3 + 1] < ground) { pos[i3 + 1] = ground; sporeVel[i3 + 1] *= -0.55; }
    if (pos[i3 + 1] > ground + 14) sporeVel[i3 + 1] *= -0.5;
    const dx = player.pos.x - pos[i3], dz = player.pos.z - pos[i3 + 2], d = Math.hypot(dx, dz);
    if (d < 20 && d > 2) { sporeVel[i3] += (dx / d) * 0.07 * dt; sporeVel[i3 + 2] += (dz / d) * 0.07 * dt; }
  }
  spores.geometry.attributes.position.needsUpdate = true;
}

function setupControls() {
  const base = document.getElementById('joystick-base'), knob = document.getElementById('joystick-knob');
  const lookZone = document.getElementById('look-zone'), jumpBtn = document.getElementById('jump-btn');
  const maxStick = 40; let stickId = null, lookId = null;
  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy) || 0.0001, clamped = Math.min(len, maxStick);
    const nx = (dx / len) * clamped, ny = (dy / len) * clamped;
    knob.style.transform = `translate(${nx}px, ${ny}px)`;
    moveInput.x = nx / maxStick; moveInput.z = -ny / maxStick;
  }
  function resetStick() { knob.style.transform = 'translate(0px, 0px)'; moveInput.x = 0; moveInput.z = 0; stickId = null; }
  base.addEventListener('touchstart', (e) => { e.preventDefault(); if (stickId !== null) return; const t = e.changedTouches[0]; stickId = t.identifier; const rect = base.getBoundingClientRect(); setStick(t.clientX - (rect.left + rect.width / 2), t.clientY - (rect.top + rect.height / 2)); }, { passive: false });
  base.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stickId) { const rect = base.getBoundingClientRect(); setStick(t.clientX - (rect.left + rect.width / 2), t.clientY - (rect.top + rect.height / 2)); } }, { passive: false });
  const endStick = (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) resetStick(); };
  base.addEventListener('touchend', endStick); base.addEventListener('touchcancel', endStick);
  lookZone.addEventListener('touchstart', (e) => { e.preventDefault(); if (lookId !== null) return; const t = e.changedTouches[0]; lookId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY; }, { passive: false });
  lookZone.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === lookId) { const dx = t.clientX - lastLookX, dy = t.clientY - lastLookY; lastLookX = t.clientX; lastLookY = t.clientY; player.yaw -= dx * CONFIG.lookSens; player.pitch = THREE.MathUtils.clamp(player.pitch - dy * CONFIG.lookSens, -CONFIG.maxPitch, CONFIG.maxPitch); } }, { passive: false });
  lookZone.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; });
  jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); tryJump(); }, { passive: false });
  jumpBtn.addEventListener('click', tryJump);
  window.addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space') { e.preventDefault(); tryJump(); } });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  document.addEventListener('click', () => { if (started && !('ontouchstart' in window)) document.body.requestPointerLock?.(); });
  document.addEventListener('mousemove', (e) => { if (document.pointerLockElement) { player.yaw -= e.movementX * CONFIG.lookSensDesktop; player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * CONFIG.lookSensDesktop, -CONFIG.maxPitch, CONFIG.maxPitch); } });
}

function tryJump() { if (player.onGround) { player.vel.y = CONFIG.jumpForce; player.onGround = false; } }

function updatePlayer(dt) {
  let ix = moveInput.x, iz = moveInput.z;
  if (keys['KeyW'] || keys['ArrowUp']) iz += 1;
  if (keys['KeyS'] || keys['ArrowDown']) iz -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
  const speed = CONFIG.moveSpeed * (keys['ShiftLeft'] || keys['ShiftRight'] ? CONFIG.sprintMult : 1);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  player.vel.x = (ix * cos + iz * sin) * speed;
  player.vel.z = (-ix * sin + iz * cos) * speed;
  player.vel.y += CONFIG.gravity * dt;
  let nx = player.pos.x + player.vel.x * dt, ny = player.pos.y + player.vel.y * dt, nz = player.pos.z + player.vel.z * dt;
  const groundY = getHeight(nx, nz) + CONFIG.playerHeight;
  if (ny <= groundY) { ny = groundY; player.vel.y = 0; player.onGround = true; } else player.onGround = false;
  const pr = CONFIG.playerRadius;
  for (const c of colliders) {
    if (nx > c.min.x - pr && nx < c.max.x + pr && nz > c.min.z - pr && nz < c.max.z + pr && ny > c.min.y && ny - CONFIG.playerHeight < c.max.y) {
      const cx = (c.min.x + c.max.x) * 0.5, cz = (c.min.z + c.max.z) * 0.5;
      const dx = nx - cx, dz = nz - cz;
      const halfX = (c.max.x - c.min.x) * 0.5 + pr, halfZ = (c.max.z - c.min.z) * 0.5 + pr;
      if (halfX - Math.abs(dx) < halfZ - Math.abs(dz)) nx = cx + Math.sign(dx || 1) * halfX;
      else nz = cz + Math.sign(dz || 1) * halfZ;
    }
  }
  const bound = CONFIG.worldSize * 0.47;
  nx = THREE.MathUtils.clamp(nx, -bound, bound); nz = THREE.MathUtils.clamp(nz, -bound, bound);
  player.pos.set(nx, ny, nz);
  camera.position.copy(player.pos); camera.rotation.order = 'YXZ'; camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.048);
  if (started) { updatePlayer(dt); updateSpores(dt); }
  else {
    const t = clock.elapsedTime;
    camera.position.set(Math.sin(t * 0.1) * 18, 10 + Math.sin(t * 0.15) * 1.5, Math.cos(t * 0.1) * 18);
    camera.lookAt(0, 5, 0);
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
}

init();
