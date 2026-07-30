import * as THREE from 'three';

// Bright daytime city explorer — standard FPS controls
const CONFIG = {
  moveSpeed: 7.4,
  sprintMult: 1.5,
  jumpForce: 9.2,
  gravity: -22,
  playerHeight: 1.65,
  playerRadius: 0.38,
  lookSens: 0.0028,
  lookSensDesktop: 0.0020,
  maxPitch: Math.PI / 2.2,
  worldSize: 160,
  terrainRes: 64,
  sporeCount: 40,
  blockSize: 14,
  streetWidth: 6
};

let scene, camera, renderer, clock;
let player = {
  pos: new THREE.Vector3(0, 4, 0),
  vel: new THREE.Vector3(0, 0, 0),
  onGround: false,
  yaw: 0,
  pitch: -0.08
};
let heightData;
let colliders = [];
// joystick: x = strafe (-1 left .. +1 right), y = forward (-1 back .. +1 forward)
let moveInput = { x: 0, y: 0 };
let lastLookX = 0, lastLookY = 0;
let keys = {};
let fpsEl, frameCount = 0, lastFpsTime = 0;
let started = false;
let spores = null;
let sporeVel = null;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _wish = new THREE.Vector3();

function init() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'high-performance', alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x87CEEB, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0xB8D4E8, 50, 170);

  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.15, 230);
  clock = new THREE.Clock();

  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.75));
  scene.add(new THREE.HemisphereLight(0xFFE8C0, 0x88BB88, 0.65));
  const sun = new THREE.DirectionalLight(0xFFF5E0, 1.8);
  sun.position.set(50, 90, 40);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xAACCFF, 0.35);
  fill.position.set(-30, 40, -50);
  scene.add(fill);

  buildCityGround();
  placeCityBuildings();
  placeCityProps();
  createSpores();
  addAccentLights();

  player.pos.set(0, CONFIG.playerHeight + 0.5, 0);

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
  if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
}

function buildCityGround() {
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
    let h = Math.sin(x * 0.04) * Math.cos(z * 0.035) * 0.35;
    h += Math.sin(x * 0.015 + z * 0.012) * 0.25;
    pos.setY(i, h);
    heightData[i] = h;

    const cell = CONFIG.blockSize + CONFIG.streetWidth;
    const mx = ((x % cell) + cell) % cell;
    const mz = ((z % cell) + cell) % cell;
    const isStreet = mx < CONFIG.streetWidth || mz < CONFIG.streetWidth;

    if (isStreet) {
      colors[i * 3] = 0.35; colors[i * 3 + 1] = 0.36; colors[i * 3 + 2] = 0.38;
    } else {
      colors[i * 3] = 0.72; colors[i * 3 + 1] = 0.74; colors[i * 3 + 2] = 0.70;
    }
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
}

function sampleHeight(x, z) {
  const res = CONFIG.terrainRes, size = CONFIG.worldSize, half = size / 2;
  const u = (x + half) / size, v = (z + half) / size;
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
  const fx = u * (res - 1), fz = v * (res - 1);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const i00 = iz * res + ix, i10 = iz * res + Math.min(ix + 1, res - 1);
  const i01 = Math.min(iz + 1, res - 1) * res + ix;
  const i11 = Math.min(iz + 1, res - 1) * res + Math.min(ix + 1, res - 1);
  const h0 = (heightData[i00] ?? 0) * (1 - tx) + (heightData[i10] ?? 0) * tx;
  const h1 = (heightData[i01] ?? 0) * (1 - tx) + (heightData[i11] ?? 0) * tx;
  return h0 * (1 - tz) + h1 * tz;
}
function getHeight(x, z) { return sampleHeight(x, z); }

function placeCityBuildings() {
  const half = CONFIG.worldSize * 0.42;
  const cell = CONFIG.blockSize + CONFIG.streetWidth;
  const buildingColors = [0xc8d0d8, 0xb0bcc8, 0xd4c8b8, 0xa8b8c0, 0xe0d8d0, 0x9aa8b4, 0xc0b0a0, 0xb8c4cc];
  const accentColors = [0x3dff9a, 0x5affb0, 0x2aff80];
  let bi = 0;

  for (let gx = -half; gx < half; gx += cell) {
    for (let gz = -half; gz < half; gz += cell) {
      if (Math.abs(gx) < cell * 0.8 && Math.abs(gz) < cell * 0.8) continue;
      if (Math.random() < 0.12) continue;

      const bw = CONFIG.blockSize * (0.55 + Math.random() * 0.4);
      const bd = CONFIG.blockSize * (0.55 + Math.random() * 0.4);
      const bh = 4 + Math.random() * 18 + (Math.random() < 0.15 ? Math.random() * 12 : 0);
      const cx = gx + CONFIG.streetWidth + CONFIG.blockSize * 0.5;
      const cz = gz + CONFIG.streetWidth + CONFIG.blockSize * 0.5;
      const py = getHeight(cx, cz);
      const color = buildingColors[bi++ % buildingColors.length];

      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshLambertMaterial({ color }));
      building.position.set(cx, py + bh / 2, cz);
      scene.add(building);

      if (Math.random() < 0.35) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(bw * 0.9, 0.15, bd * 0.9),
          new THREE.MeshBasicMaterial({ color: accentColors[bi % 3] })
        );
        strip.position.set(cx, py + bh + 0.08, cz);
        scene.add(strip);
      }

      if (bh > 8 && Math.random() < 0.55) {
        const winMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
        const rows = Math.floor(bh / 2.5);
        const cols = Math.max(2, Math.floor(bw / 2.2));
        for (let r = 1; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (Math.random() < 0.3) continue;
            const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.08), winMat);
            w.position.set(
              cx - bw / 2 + 1.2 + c * ((bw - 2.4) / Math.max(1, cols - 1)),
              py + 1.5 + r * 2.3,
              cz + bd / 2 + 0.05
            );
            scene.add(w);
          }
        }
      }

      colliders.push({
        min: new THREE.Vector3(cx - bw / 2 - 0.1, py, cz - bd / 2 - 0.1),
        max: new THREE.Vector3(cx + bw / 2 + 0.1, py + bh, cz + bd / 2 + 0.1)
      });
    }
  }
}

function placeCityProps() {
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x444450 });
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6a5040 });
  const treeTrunk = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  const treeLeaf = new THREE.MeshLambertMaterial({ color: 0x3a8a4a });
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a });
  const half = CONFIG.worldSize * 0.4;
  const cell = CONFIG.blockSize + CONFIG.streetWidth;

  for (let gx = -half; gx < half; gx += cell) {
    for (let gz = -half; gz < half; gz += cell * 0.5) {
      if (Math.random() < 0.45) continue;
      const px = gx + CONFIG.streetWidth * 0.5;
      const pz = gz + 1;
      const py = getHeight(px, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 5), lampMat);
      pole.position.set(px, py + 1.6, pz);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), lampGlow);
      bulb.position.set(px, py + 3.3, pz);
      scene.add(bulb);
    }
  }

  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 8 + Math.random() * 50;
    const px = Math.cos(a) * d, pz = Math.sin(a) * d, py = getHeight(px, pz);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.5), benchMat);
    seat.position.set(px, py + 0.45, pz); scene.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), benchMat);
    back.position.set(px, py + 0.75, pz - 0.2); scene.add(back);
  }

  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * 55;
    const px = Math.cos(a) * d, pz = Math.sin(a) * d, py = getHeight(px, pz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.8, 5), treeTrunk);
    trunk.position.set(px, py + 0.9, pz); scene.add(trunk);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.1 + Math.random() * 0.5, 6, 5), treeLeaf);
    leaf.position.set(px, py + 2.4, pz); scene.add(leaf);
  }

  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 15 + Math.random() * 50;
    const px = Math.cos(a) * d, pz = Math.sin(a) * d, py = getHeight(px, pz);
    const h = 0.8 + Math.random() * 1.2;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, h, 5), crystalMat);
    c.position.set(px, py + h / 2, pz); scene.add(c);
  }
}

function addAccentLights() {
  for (const [x, z] of [[10, 8], [-12, 10], [18, -14], [-8, -18]]) {
    const l = new THREE.PointLight(0x3dff9a, 0.9, 12, 2);
    l.position.set(x, getHeight(x, z) + 4, z);
    scene.add(l);
  }
}

function createSpores() {
  const n = CONFIG.sporeCount;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(n * 3);
  sporeVel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * CONFIG.worldSize * 0.8;
    const z = (Math.random() - 0.5) * CONFIG.worldSize * 0.8;
    positions[i * 3] = x;
    positions[i * 3 + 1] = 2 + Math.random() * 10;
    positions[i * 3 + 2] = z;
    sporeVel[i * 3] = (Math.random() - 0.5) * 0.25;
    sporeVel[i * 3 + 1] = (Math.random() - 0.5) * 0.15;
    sporeVel[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  spores = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x9dffc8, size: 0.18, transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true
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
    if (pos[i3 + 1] < 1.5) sporeVel[i3 + 1] *= -0.5;
    if (pos[i3 + 1] > 14) sporeVel[i3 + 1] *= -0.5;
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
    moveInput.y = -ny / maxStick;
  }
  function resetStick() {
    knob.style.transform = 'translate(0px, 0px)';
    moveInput.x = 0;
    moveInput.y = 0;
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
        player.yaw += dx * CONFIG.lookSens;
        player.pitch = THREE.MathUtils.clamp(
          player.pitch + dy * CONFIG.lookSens,
          -CONFIG.maxPitch,
          CONFIG.maxPitch
        );
      }
    }
  }, { passive: false });

  lookZone.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  });
  lookZone.addEventListener('touchcancel', (e) => {
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
      player.yaw += e.movementX * CONFIG.lookSensDesktop;
      player.pitch = THREE.MathUtils.clamp(
        player.pitch + e.movementY * CONFIG.lookSensDesktop,
        -CONFIG.maxPitch,
        CONFIG.maxPitch
      );
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
  // 1. Apply camera rotation from accumulated yaw/pitch
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  // 2. Camera-relative horizontal axes (Minecraft-style)
  camera.getWorldDirection(_forward);
  _forward.y = 0;
  if (_forward.lengthSq() < 1e-6) {
    _forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  } else {
    _forward.normalize();
  }
  _right.crossVectors(_forward, _worldUp).normalize();

  // 3. Wish direction from joystick + keyboard
  let mx = moveInput.x;
  let my = moveInput.y;
  if (keys['KeyW'] || keys['ArrowUp'])    my += 1;
  if (keys['KeyS'] || keys['ArrowDown'])  my -= 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;

  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }

  const speed = CONFIG.moveSpeed * (
    (keys['ShiftLeft'] || keys['ShiftRight']) ? CONFIG.sprintMult : 1
  );

  _wish.set(0, 0, 0);
  _wish.addScaledVector(_forward, my);
  _wish.addScaledVector(_right, mx);
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(speed);

  player.vel.x = _wish.x;
  player.vel.z = _wish.z;
  player.vel.y += CONFIG.gravity * dt;

  // 4. Integrate + collide
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
      if (halfX - Math.abs(dx) < halfZ - Math.abs(dz)) {
        nx = cx + Math.sign(dx || 1) * halfX;
      } else {
        nz = cz + Math.sign(dz || 1) * halfZ;
      }
    }
  }

  const bound = CONFIG.worldSize * 0.47;
  nx = THREE.MathUtils.clamp(nx, -bound, bound);
  nz = THREE.MathUtils.clamp(nz, -bound, bound);

  player.pos.set(nx, ny, nz);
  camera.position.copy(player.pos);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.048);
  if (started) {
    updatePlayer(dt);
    updateSpores(dt);
  } else {
    const t = clock.elapsedTime;
    camera.position.set(Math.sin(t * 0.12) * 22, 14 + Math.sin(t * 0.15) * 1.5, Math.cos(t * 0.12) * 22);
    camera.lookAt(0, 5, 0);
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
