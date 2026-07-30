import * as THREE from 'three';

// Bright daytime + mobile performance
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
  worldSize: 160,
  terrainRes: 80,
  sporeCount: 60
};

let scene, camera, renderer, clock;
let player = {
  pos: new THREE.Vector3(0, 16, 0),
  vel: new THREE.Vector3(0, 0, 0),
  onGround: false,
  yaw: 0,
  pitch: -0.08
};
let heightData;
let colliders = [];
let moveInput = { x: 0, z: 0 };
let lastLookX = 0, lastLookY = 0;
let keys = {};
let fpsEl, frameCount = 0, lastFpsTime = 0;
let started = false;
let spores = null;
let sporeVel = null;

function init() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x87CEEB, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0xB8D4E8, 40, 160);

  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.15, 220);
  clock = new THREE.Clock();

  // Strong ambient so nothing is black
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.75));
  scene.add(new THREE.HemisphereLight(0xFFE8C0, 0x88BB88, 0.65));

  // Strong sun
  const sun = new THREE.DirectionalLight(0xFFF5E0, 1.8);
  sun.position.set(50, 90, 40);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xAACCFF, 0.35);
  fill.position.set(-30, 40, -50);
  scene.add(fill);

  buildTerrain();
  placeDecor();
  createSpores();
  addAccentLights();

  player.pos.y = getHeight(0, 0) + CONFIG.playerHeight + 1.5;

  setupControls();
  window.addEventListener('resize', onResize, { passive: true });
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.body.addEventListener('touchmove', (e) => {
    if (started) e.preventDefault();
  }, { passive: false });

  fpsEl = document.getElementById('fps');
  animate();
}

function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  started = true;
  if (screen.orientation?.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}

function noise2(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function fbm(x, z, octaves = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * (noise2(x * f, z * f) * 2 - 1);
    a *= 0.5;
    f *= 2.03;
  }
  return v;
}

function buildTerrain() {
  const res = CONFIG.terrainRes;
  const size = CONFIG.worldSize;
  const geo = new THREE.PlaneGeometry(size, size, res - 1, res - 1);
  geo.rotateX(-Math.PI / 2);

  heightData = new Float32Array(res * res);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const biomes = [
    { r: 0.45, g: 0.72, b: 0.42 },
    { r: 0.62, g: 0.55, b: 0.75 },
    { r: 0.75, g: 0.65, b: 0.40 },
    { r: 0.40, g: 0.68, b: 0.72 },
    { r: 0.70, g: 0.48, b: 0.52 }
  ];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let h = fbm(x * 0.035, z * 0.035, 4) * 6;
    h += fbm(x * 0.012, z * 0.012, 3) * 10;
    h += Math.sin(x * 0.04) * Math.cos(z * 0.035) * 2;
    const dist = Math.hypot(x, z);
    h *= 0.5 + 0.5 * Math.min(1, dist / 48);
    pos.setY(i, h);
    heightData[i] = h;

    const bx = fbm(x * 0.02 + 40, z * 0.02, 2);
    const bi = Math.floor(((bx + 1) * 0.5 * 0.99) * biomes.length);
    const b = biomes[THREE.MathUtils.clamp(bi, 0, biomes.length - 1)];
    const ht = THREE.MathUtils.clamp((h + 4) / 20, 0, 1);
    colors[i * 3]     = Math.min(1, b.r * (0.9 + ht * 0.25));
    colors[i * 3 + 1] = Math.min(1, b.g * (0.9 + ht * 0.2));
    colors[i * 3 + 2] = Math.min(1, b.b * (0.9 + ht * 0.2));
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
}

function sampleHeight(x, z) {
  const res = CONFIG.terrainRes;
  const size = CONFIG.worldSize;
  const half = size / 2;
  const u = (x + half) / size;
  const v = (z + half) / size;
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
  const fx = u * (res - 1);
  const fz = v * (res - 1);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const i00 = iz * res + ix;
  const i10 = iz * res + Math.min(ix + 1, res - 1);
  const i01 = Math.min(iz + 1, res - 1) * res + ix;
  const i11 = Math.min(iz + 1, res - 1) * res + Math.min(ix + 1, res - 1);
  const h0 = (heightData[i00] ?? 0) * (1 - tx) + (heightData[i10] ?? 0) * tx;
  const h1 = (heightData[i01] ?? 0) * (1 - tx) + (heightData[i11] ?? 0) * tx;
  return h0 * (1 - tz) + h1 * tz;
}
function getHeight(x, z) { return sampleHeight(x, z); }

function placeDecor() {
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a7a98 });
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x6a6080 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a });
  const stemMat = new THREE.MeshLambertMaterial({ color: 0xf0e8d8 });
  const plantStem = new THREE.MeshLambertMaterial({ color: 0x2a5a32 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x5affb0 });
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0x2aff9a });
  const capColors = [0xff6b9a, 0x7b5cff, 0xffb347, 0x4ecdc4, 0xc44569];

  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 18 + Math.random() * 50;
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;
    const py = getHeight(px, pz) + 7 + Math.random() * 10;
    const s = 1.6 + Math.random() * 2.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.position.set(px, py, pz);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(rock);
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.12, s * 1.4, 0.12), glowMat);
    vein.position.set(px, py - s * 0.15, pz);
    scene.add(vein);
  }

  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 12 + Math.random() * 55;
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;
    const py = getHeight(px, pz);
    const h = 4 + Math.random() * 7;
    const r = 0.45 + Math.random() * 0.35;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, h, 6), pillarMat);
    pillar.position.set(px, py + h / 2, pz);
    scene.add(pillar);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.07, 5, 12), glowMat);
    ring.position.set(px, py + h * 0.9, pz);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    colliders.push({
      min: new THREE.Vector3(px - r - 0.12, py, pz - r - 0.12),
      max: new THREE.Vector3(px + r + 0.12, py + h, pz + r + 0.12)
    });
  }

  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * 55;
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;
    const py = getHeight(px, pz);
    const scale = 1.3 + Math.random() * 2.2;
    const stemH = 2.0 * scale;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.35 * scale, stemH, 6), stemMat);
    stem.position.set(px, py + stemH / 2, pz);
    scene.add(stem);
    const capMat = new THREE.MeshLambertMaterial({ color: capColors[i % capColors.length] });
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1.0 * scale, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      capMat
    );
    cap.position.set(px, py + stemH * 0.95, pz);
    cap.scale.y = 0.55;
    scene.add(cap);
    if (scale > 1.8) {
      colliders.push({
        min: new THREE.Vector3(px - 0.3 * scale, py, pz - 0.3 * scale),
        max: new THREE.Vector3(px + 0.3 * scale, py + stemH, pz + 0.3 * scale)
      });
    }
  }

  for (let i = 0; i < 35; i++) {
    const px = (Math.random() - 0.5) * CONFIG.worldSize * 0.85;
    const pz = (Math.random() - 0.5) * CONFIG.worldSize * 0.85;
    const py = getHeight(px, pz);
    const h = 1.2 + Math.random() * 2.5;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, h, 4), plantStem);
    stem.position.set(px, py + h / 2, pz);
    stem.rotation.z = (Math.random() - 0.5) * 0.25;
    scene.add(stem);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14 + Math.random() * 0.1, 5, 4), bulbMat);
    bulb.position.set(px, py + h + 0.05, pz);
    scene.add(bulb);
  }

  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 8 + Math.random() * 60;
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;
    const py = getHeight(px, pz);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const ch = 0.7 + Math.random() * 1.8;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.15 + Math.random() * 0.12, ch, 5), crystalMat);
      c.position.set(px + (Math.random() - 0.5) * 1.0, py + ch / 2, pz + (Math.random() - 0.5) * 1.0);
      c.rotation.z = (Math.random() - 0.5) * 0.35;
      scene.add(c);
    }
  }
}

function addAccentLights() {
  const spots = [[12, 8], [-15, 10], [20, -18], [-10, -22]];
  for (const [x, z] of spots) {
    const y = getHeight(x, z) + 3;
    const l = new THREE.PointLight(0x3dff9a, 1.2, 14, 2);
    l.position.set(x, y, z);
    scene.add(l);
  }
}

function createSpores() {
  const n = CONFIG.sporeCount;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(n * 3);
  sporeVel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * CONFIG.worldSize * 0.85;
    const z = (Math.random() - 0.5) * CONFIG.worldSize * 0.85;
    positions[i * 3] = x;
    positions[i * 3 + 1] = getHeight(x, z) + 1.5 + Math.random() * 8;
    positions[i * 3 + 2] = z;
    sporeVel[i * 3] = (Math.random() - 0.5) * 0.3;
    sporeVel[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
    sporeVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  spores = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x9dffc8,
    size: 0.2,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    sizeAttenuation: true
  }));
  scene.add(spores);
}

function updateSpores(dt) {
  if (!spores) return;
  const pos = spores.geometry.attributes.position.array;
  for (let i = 0; i < CONFIG.sporeCount; i++) {
    const i3 = i * 3;
    pos[i3] += sporeVel[i3] * dt;
    pos[i3 + 1] += sporeVel[i3 + 1] * dt;
    pos[i3 + 2] += sporeVel[i3 + 2] * dt;
    if (pos[i3 + 1] < 1) sporeVel[i3 + 1] *= -0.5;
    if (pos[i3 + 1] > 18) sporeVel[i3 + 1] *= -0.5;
  }
  spores.geometry.attributes.position.needsUpdate = true;
}

function setupControls() {
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  const lookZone = document.getElementById('look-zone');
  const jumpBtn = document.getElementById('jump-btn');
  const maxStick = 40;
  let stickId = null, lookId = null;

  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy) || 0.0001;
    const clamped = Math.min(len, maxStick);
    const nx = (dx / len) * clamped;
    const ny = (dy / len) * clamped;
    knob.style.transform = `translate(${nx}px, ${ny}px)`;
    moveInput.x = nx / maxStick;
    moveInput.z = -ny / maxStick;
  }
  function resetStick() {
    knob.style.transform = 'translate(0px, 0px)';
    moveInput.x = 0;
    moveInput.z = 0;
    stickId = null;
  }

  base.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (stickId !== null) return;
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const rect = base.getBoundingClientRect();
    setStick(t.clientX - (rect.left + rect.width / 2), t.clientY - (rect.top + rect.height / 2));
  }, { passive: false });
  base.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        const rect = base.getBoundingClientRect();
        setStick(t.clientX - (rect.left + rect.width / 2), t.clientY - (rect.top + rect.height / 2));
      }
    }
  }, { passive: false });
  const endStick = (e) => {
    for (const t of e.changedTouches) if (t.identifier === stickId) resetStick();
  };
  base.addEventListener('touchend', endStick);
  base.addEventListener('touchcancel', endStick);

  lookZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (lookId !== null) return;
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lastLookX = t.clientX;
    lastLookY = t.clientY;
  }, { passive: false });
  lookZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) {
        const dx = t.clientX - lastLookX;
        const dy = t.clientY - lastLookY;
        lastLookX = t.clientX;
        lastLookY = t.clientY;
        player.yaw -= dx * CONFIG.lookSens;
        player.pitch = THREE.MathUtils.clamp(player.pitch - dy * CONFIG.lookSens, -CONFIG.maxPitch, CONFIG.maxPitch);
      }
    }
  }, { passive: false });
  lookZone.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  });

  jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); tryJump(); }, { passive: false });
  jumpBtn.addEventListener('click', tryJump);

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); tryJump(); }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  document.addEventListener('click', () => {
    if (started && !('ontouchstart' in window)) document.body.requestPointerLock?.();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) {
      player.yaw -= e.movementX * CONFIG.lookSensDesktop;
      player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * CONFIG.lookSensDesktop, -CONFIG.maxPitch, CONFIG.maxPitch);
    }
  });
}

function tryJump() {
  if (player.onGround) {
    player.vel.y = CONFIG.jumpForce;
    player.onGround = false;
  }
}

function updatePlayer(dt) {
  let ix = moveInput.x, iz = moveInput.z;
  if (keys['KeyW'] || keys['ArrowUp']) iz += 1;
  if (keys['KeyS'] || keys['ArrowDown']) iz -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const speed = CONFIG.moveSpeed * (keys['ShiftLeft'] || keys['ShiftRight'] ? CONFIG.sprintMult : 1);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  player.vel.x = (ix * cos + iz * sin) * speed;
  player.vel.z = (-ix * sin + iz * cos) * speed;
  player.vel.y += CONFIG.gravity * dt;

  let nx = player.pos.x + player.vel.x * dt;
  let ny = player.pos.y + player.vel.y * dt;
  let nz = player.pos.z + player.vel.z * dt;

  const groundY = getHeight(nx, nz) + CONFIG.playerHeight;
  if (ny <= groundY) {
    ny = groundY;
    player.vel.y = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  const pr = CONFIG.playerRadius;
  for (const c of colliders) {
    if (nx > c.min.x - pr && nx < c.max.x + pr &&
        nz > c.min.z - pr && nz < c.max.z + pr &&
        ny > c.min.y && ny - CONFIG.playerHeight < c.max.y) {
      const cx = (c.min.x + c.max.x) * 0.5;
      const cz = (c.min.z + c.max.z) * 0.5;
      const dx = nx - cx, dz = nz - cz;
      const halfX = (c.max.x - c.min.x) * 0.5 + pr;
      const halfZ = (c.max.z - c.min.z) * 0.5 + pr;
      if (halfX - Math.abs(dx) < halfZ - Math.abs(dz)) nx = cx + Math.sign(dx || 1) * halfX;
      else nz = cz + Math.sign(dz || 1) * halfZ;
    }
  }

  const bound = CONFIG.worldSize * 0.47;
  nx = THREE.MathUtils.clamp(nx, -bound, bound);
  nz = THREE.MathUtils.clamp(nz, -bound, bound);
  player.pos.set(nx, ny, nz);
  camera.position.copy(player.pos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.048);
  if (started) {
    updatePlayer(dt);
    updateSpores(dt);
  } else {
    const t = clock.elapsedTime;
    camera.position.set(Math.sin(t * 0.1) * 16, 11 + Math.sin(t * 0.15) * 1.2, Math.cos(t * 0.1) * 16);
    camera.lookAt(0, 4, 0);
  }
  renderer.render(scene, camera);
  frameCount++;
  if (clock.elapsedTime - lastFpsTime > 0.6) {
    if (fpsEl) fpsEl.textContent = Math.round(frameCount / (clock.elapsedTime - lastFpsTime));
    frameCount = 0;
    lastFpsTime = clock.elapsedTime;
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
}

init();
