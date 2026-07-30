import * as THREE from 'three';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const CONFIG = {
  moveSpeed: 7.5,
  sprintMult: 1.55,
  jumpForce: 9.2,
  gravity: -22,
  playerHeight: 1.7,
  playerRadius: 0.35,
  lookSens: 0.0028,
  lookSensDesktop: 0.0022,
  maxPitch: Math.PI / 2.15,
  fogNear: 8,
  fogFar: 95,
  worldSize: 180,
  terrainRes: 128,
  maxLights: 28
};

// ─────────────────────────────────────────────
// Globals
// ─────────────────────────────────────────────
let scene, camera, renderer, clock;
let player = {
  pos: new THREE.Vector3(0, 12, 0),
  vel: new THREE.Vector3(0, 0, 0),
  onGround: false,
  yaw: 0,
  pitch: 0
};
let terrainMesh, heightData;
let colliders = [];
let moveInput = { x: 0, z: 0 };
let lookActive = false;
let lastLookX = 0, lastLookY = 0;
let keys = {};
let fpsEl, frameCount = 0, lastFpsTime = 0;
let started = false;

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
function init() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x02040a);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02040a, 0.018);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.12, 220);
  clock = new THREE.Clock();

  const amb = new THREE.AmbientLight(0x0a1a14, 0.35);
  scene.add(amb);

  const moon = new THREE.DirectionalLight(0x304050, 0.25);
  moon.position.set(30, 60, -20);
  scene.add(moon);

  buildTerrain();
  placeStructures();
  placeGlowFlora();
  placeMushrooms();

  player.pos.y = getHeight(player.pos.x, player.pos.z) + CONFIG.playerHeight + 0.5;

  setupControls();
  window.addEventListener('resize', onResize);
  document.getElementById('start-btn').addEventListener('click', startGame);

  fpsEl = document.getElementById('fps');
  animate();
}

function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  started = true;
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}

// ─────────────────────────────────────────────
// Terrain
// ─────────────────────────────────────────────
function noise2(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x, z, octaves = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * (noise2(x * f, z * f) * 2 - 1);
    a *= 0.5;
    f *= 2.05;
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

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let h = fbm(x * 0.035, z * 0.035, 5) * 6.5;
    h += fbm(x * 0.012, z * 0.012, 3) * 11;
    h += Math.sin(x * 0.04) * Math.cos(z * 0.035) * 2.2;
    const dist = Math.sqrt(x * x + z * z);
    h *= 0.55 + 0.45 * Math.min(1, dist / 55);

    pos.setY(i, h);
    heightData[i] = h;

    const t = (h + 8) / 22;
    colors[i * 3] = 0.02 + t * 0.04;
    colors[i * 3 + 1] = 0.05 + t * 0.12;
    colors[i * 3 + 2] = 0.06 + t * 0.08;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.05,
    flatShading: false
  });

  terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  for (let i = 0; i < 18; i++) {
    const px = (Math.random() - 0.5) * size * 0.85;
    const pz = (Math.random() - 0.5) * size * 0.85;
    const py = sampleHeight(px, pz) + 0.05;
    const g = new THREE.Mesh(
      new THREE.CircleGeometry(2.5 + Math.random() * 4, 16),
      new THREE.MeshBasicMaterial({
        color: 0x1aff6a,
        transparent: true,
        opacity: 0.07 + Math.random() * 0.06,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(px, py, pz);
    scene.add(g);
  }
}

function sampleHeight(x, z) {
  const res = CONFIG.terrainRes;
  const size = CONFIG.worldSize;
  const half = size / 2;
  const u = (x + half) / size;
  const v = (z + half) / size;
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

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

  const h00 = heightData[i00] ?? 0;
  const h10 = heightData[i10] ?? 0;
  const h01 = heightData[i01] ?? 0;
  const h11 = heightData[i11] ?? 0;

  const h0 = h00 * (1 - tx) + h10 * tx;
  const h1 = h01 * (1 - tx) + h11 * tx;
  return h0 * (1 - tz) + h1 * tz;
}

function getHeight(x, z) {
  return sampleHeight(x, z);
}

// ─────────────────────────────────────────────
// Structures
// ─────────────────────────────────────────────
function placeStructures() {
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x0a1210,
    roughness: 0.75,
    metalness: 0.2,
    emissive: 0x0a2a18,
    emissiveIntensity: 0.15
  });
  const glowEdgeMat = new THREE.MeshBasicMaterial({
    color: 0x3dff9a,
    transparent: true,
    opacity: 0.85
  });

  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * 65;
    const px = Math.cos(angle) * dist;
    const pz = Math.sin(angle) * dist;
    const py = getHeight(px, pz);

    const h = 3.5 + Math.random() * 5.5;
    const r = 0.45 + Math.random() * 0.35;

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.85, r, h, 7),
      pillarMat
    );
    pillar.position.set(px, py + h / 2, pz);
    pillar.rotation.y = Math.random() * Math.PI;
    scene.add(pillar);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.15, 0.07, 8, 20),
      glowEdgeMat
    );
    ring.position.set(px, py + h * 0.92, pz);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    if (i < CONFIG.maxLights) {
      const light = new THREE.PointLight(0x3dff9a, 1.8, 14, 1.6);
      light.position.set(px, py + h + 0.3, pz);
      scene.add(light);
    }

    colliders.push({
      min: new THREE.Vector3(px - r - 0.15, py, pz - r - 0.15),
      max: new THREE.Vector3(px + r + 0.15, py + h, pz + r + 0.15)
    });
  }

  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 25 + Math.random() * 50;
    const px = Math.cos(angle) * dist;
    const pz = Math.sin(angle) * dist;
    const py = getHeight(px, pz);
    const w = 4 + Math.random() * 2.5;
    const h = 5 + Math.random() * 3;

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.55, h, 0.55), pillarMat);
    left.position.set(px - w / 2, py + h / 2, pz);
    scene.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.55, h, 0.55), pillarMat);
    right.position.set(px + w / 2, py + h / 2, pz);
    scene.add(right);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.55, 0.4, 0.55), pillarMat);
    top.position.set(px, py + h, pz);
    scene.add(top);

    const line = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.06, 0.08),
      glowEdgeMat
    );
    line.position.set(px, py + h + 0.15, pz);
    scene.add(line);

    const light = new THREE.PointLight(0x2aff80, 1.4, 12, 1.5);
    light.position.set(px, py + h + 0.8, pz);
    scene.add(light);

    colliders.push({
      min: new THREE.Vector3(px - w / 2 - 0.4, py, pz - 0.5),
      max: new THREE.Vector3(px - w / 2 + 0.4, py + h, pz + 0.5)
    });
    colliders.push({
      min: new THREE.Vector3(px + w / 2 - 0.4, py, pz - 0.5),
      max: new THREE.Vector3(px + w / 2 + 0.4, py + h, pz + 0.5)
    });
  }
}

// ─────────────────────────────────────────────
// Flora
// ─────────────────────────────────────────────
function placeGlowFlora() {
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x061208,
    roughness: 0.8,
    emissive: 0x0a3a1a,
    emissiveIntensity: 0.3
  });
  const bulbMat = new THREE.MeshBasicMaterial({
    color: 0x5affb0,
    transparent: true,
    opacity: 0.9
  });

  for (let i = 0; i < 90; i++) {
    const px = (Math.random() - 0.5) * CONFIG.worldSize * 0.9;
    const pz = (Math.random() - 0.5) * CONFIG.worldSize * 0.9;
    const py = getHeight(px, pz);
    const h = 1.2 + Math.random() * 2.8;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.07, h, 5),
      stemMat
    );
    stem.position.set(px, py + h / 2, pz);
    stem.rotation.z = (Math.random() - 0.5) * 0.25;
    stem.rotation.x = (Math.random() - 0.5) * 0.2;
    scene.add(stem);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + Math.random() * 0.1, 8, 6),
      bulbMat
    );
    bulb.position.set(
      px + Math.sin(stem.rotation.z) * h * 0.5,
      py + h + 0.05,
      pz
    );
    scene.add(bulb);

    if (i % 4 === 0) {
      const light = new THREE.PointLight(0x4dff9a, 0.7, 6.5, 2);
      light.position.copy(bulb.position);
      scene.add(light);
    }
  }
}

function placeMushrooms() {
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x0c1a14,
    roughness: 0.6,
    emissive: 0x1aff80,
    emissiveIntensity: 0.55
  });
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x0a120e,
    roughness: 0.85
  });

  for (let i = 0; i < 55; i++) {
    const px = (Math.random() - 0.5) * CONFIG.worldSize * 0.88;
    const pz = (Math.random() - 0.5) * CONFIG.worldSize * 0.88;
    const py = getHeight(px, pz);
    const scale = 0.4 + Math.random() * 1.1;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, 0.5 * scale, 6),
      stemMat
    );
    stem.position.set(px, py + 0.25 * scale, pz);
    scene.add(stem);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.35 * scale, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      capMat
    );
    cap.position.set(px, py + 0.5 * scale, pz);
    cap.scale.y = 0.55;
    scene.add(cap);

    if (i % 3 === 0) {
      const light = new THREE.PointLight(0x3dff9a, 0.9, 5, 1.8);
      light.position.set(px, py + 0.7 * scale, pz);
      scene.add(light);
    }
  }
}

// ─────────────────────────────────────────────
// Controls
// ─────────────────────────────────────────────
function setupControls() {
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  const lookZone = document.getElementById('look-zone');
  const jumpBtn = document.getElementById('jump-btn');

  const maxStick = 38;
  let stickId = null;
  let lookId = null;

  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, maxStick);
    const nx = len > 0 ? (dx / len) * clamped : 0;
    const ny = len > 0 ? (dy / len) * clamped : 0;
    knob.style.transform = `translate(${nx}px, ${ny}px)`;
    moveInput.x = nx / maxStick;
    moveInput.z = -ny / maxStick;
  }

  function resetStick() {
    knob.style.transform = 'translate(0, 0)';
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
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setStick(t.clientX - cx, t.clientY - cy);
  }, { passive: false });

  base.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        const rect = base.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        setStick(t.clientX - cx, t.clientY - cy);
      }
    }
  }, { passive: false });

  base.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) resetStick();
    }
  });
  base.addEventListener('touchcancel', resetStick);

  lookZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (lookId !== null) return;
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lastLookX = t.clientX;
    lastLookY = t.clientY;
    lookActive = true;
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
        player.pitch -= dy * CONFIG.lookSens;
        player.pitch = Math.max(-CONFIG.maxPitch, Math.min(CONFIG.maxPitch, player.pitch));
      }
    }
  }, { passive: false });

  lookZone.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) {
        lookId = null;
        lookActive = false;
      }
    }
  });

  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    tryJump();
  }, { passive: false });
  jumpBtn.addEventListener('click', tryJump);

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') tryJump();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  document.addEventListener('click', () => {
    if (started && !('ontouchstart' in window)) {
      document.body.requestPointerLock?.();
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) {
      player.yaw -= e.movementX * CONFIG.lookSensDesktop;
      player.pitch -= e.movementY * CONFIG.lookSensDesktop;
      player.pitch = Math.max(-CONFIG.maxPitch, Math.min(CONFIG.maxPitch, player.pitch));
    }
  });
}

function tryJump() {
  if (player.onGround) {
    player.vel.y = CONFIG.jumpForce;
    player.onGround = false;
  }
}

// ─────────────────────────────────────────────
// Physics
// ─────────────────────────────────────────────
function updatePlayer(dt) {
  let ix = moveInput.x;
  let iz = moveInput.z;
  if (keys['KeyW'] || keys['ArrowUp']) iz += 1;
  if (keys['KeyS'] || keys['ArrowDown']) iz -= 1;
  if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ix += 1;

  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }

  const speed = CONFIG.moveSpeed * (keys['ShiftLeft'] ? CONFIG.sprintMult : 1);

  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const mx = (ix * cos + iz * sin) * speed;
  const mz = (-ix * sin + iz * cos) * speed;

  player.vel.x = mx;
  player.vel.z = mz;
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
    const minX = c.min.x - pr;
    const maxX = c.max.x + pr;
    const minZ = c.min.z - pr;
    const maxZ = c.max.z + pr;
    const minY = c.min.y;
    const maxY = c.max.y;

    if (nx > minX && nx < maxX && nz > minZ && nz < maxZ &&
        ny > minY && ny - CONFIG.playerHeight < maxY) {
      const cx = (c.min.x + c.max.x) / 2;
      const cz = (c.min.z + c.max.z) / 2;
      const dx = nx - cx;
      const dz = nz - cz;
      const penX = (maxX - minX) / 2 - Math.abs(dx);
      const penZ = (maxZ - minZ) / 2 - Math.abs(dz);
      if (penX < penZ) {
        nx = cx + Math.sign(dx) * ((maxX - minX) / 2);
      } else {
        nz = cz + Math.sign(dz) * ((maxZ - minZ) / 2);
      }
    }
  }

  const bound = CONFIG.worldSize * 0.48;
  nx = Math.max(-bound, Math.min(bound, nx));
  nz = Math.max(-bound, Math.min(bound, nz));

  player.pos.set(nx, ny, nz);

  camera.position.copy(player.pos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

// ─────────────────────────────────────────────
// Loop
// ─────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (started) {
    updatePlayer(dt);
  } else {
    const t = clock.elapsedTime;
    camera.position.set(
      Math.sin(t * 0.15) * 18,
      9 + Math.sin(t * 0.2) * 1.5,
      Math.cos(t * 0.15) * 18
    );
    camera.lookAt(0, 4, 0);
  }

  renderer.render(scene, camera);

  frameCount++;
  if (clock.elapsedTime - lastFpsTime > 0.5) {
    fpsEl.textContent = Math.round(frameCount / (clock.elapsedTime - lastFpsTime));
    frameCount = 0;
    lastFpsTime = clock.elapsedTime;
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
}

init();
