import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { createEnvironment } from "./environment.js";
import { createMenu } from "./menu.js";
import { createTouchControls } from "./touch.js";

// === QUERY PARAMS FOR TESTING / PRESETS ===
const params = new URLSearchParams(window.location.search);
const AUTOSTART = params.get("autostart") === "1";
const PARAM_TIME = params.get("time");
const PARAM_BIOME = params.get("biome");

// === DOM ELEMENTS ===
const appEl = document.getElementById("app");
const hudTopLeft = document.querySelector(".hud-top-left");
const hudBottom = document.querySelector(".hud-bottom");
const boostBarWrap = document.getElementById("boost-bar-wrap");
const boostFill = document.getElementById("boost-fill");
const dropHintEl = document.getElementById("drop-hint");
const altEl = document.getElementById("hud-alt");
const spdEl = document.getElementById("hud-spd");
const mailEl = document.getElementById("hud-mail");
const comboEl = document.getElementById("hud-combo");
const scoreEl = document.getElementById("hud-score");

const btnPause = document.getElementById("btn-pause");
const toastEl = document.getElementById("toast");

const photoBar = document.getElementById("photo-bar");
const btnSnap = document.getElementById("btn-snap");
const btnResumePhoto = document.getElementById("btn-resume-photo");

const sumScore = document.getElementById("sum-score");
const sumPerfect = document.getElementById("sum-perfect");
const sumBridges = document.getElementById("sum-bridges");
const sumCombo = document.getElementById("sum-combo");
const sumDist = document.getElementById("sum-dist");
const sumBest = document.getElementById("sum-best");
let menu = null;
let touch = null;

// Phones and tablets: lighter rendering and on-screen controls.
const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const MAX_PIXEL_RATIO = IS_TOUCH ? 1.5 : 2;
document.body.classList.toggle("touch", IS_TOUCH);

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

// === RENDERER, SCENE & POST-PROCESSING ===
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !IS_TOUCH;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 1600);

const GhibliGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.7) },
    uSunFacing: { value: 0.0 },
    uAspect: { value: window.innerWidth / window.innerHeight },
    uSunKey: { value: new THREE.Vector3(1.12, 1.07, 0.93) },
    uShadowCol: { value: new THREE.Vector3(0.42, 0.65, 0.80) },
    uTime: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunScreen;
    uniform float uSunFacing;
    uniform float uAspect;
    uniform vec3 uSunKey;
    uniform vec3 uShadowCol;
    uniform float uTime;
    varying vec2 vUv;

    float grainHash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (!(col.r >= 0.0)) col.r = 0.0;
      if (!(col.g >= 0.0)) col.g = 0.0;
      if (!(col.b >= 0.0)) col.b = 0.0;
      col = clamp(col, vec3(0.0), vec3(4.0));

      col = min(col, 0.88) + max(col - 0.88, 0.0) / (1.0 + max(col - 0.88, 0.0) * 1.25);

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = mix(vec3(0.95, 0.98, 1.05), vec3(1.0), smoothstep(0.05, 0.42, luma));
      vec3 hiTint = mix(vec3(1.0), mix(vec3(1.0), uSunKey, 0.15), smoothstep(0.45, 0.98, luma));
      col = col * shadowTint * hiTint;

      // cool, deep-blue shadows like the reference: push dark areas toward saturated blue
      float shade = 1.0 - smoothstep(0.10, 0.62, luma);
      col = mix(col, col * vec3(0.62, 0.80, 1.28), shade * 0.38);

      float l2 = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l2), col, 1.12);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);

      float dSun = length((vUv - uSunScreen) * vec2(uAspect, 1.0));
      col += uSunKey * 0.82 * exp(-dSun * 3.0) * uSunFacing * 0.14;

      float vigDist = length((vUv - 0.5) * vec2(1.1, 1.0));
      col *= mix(1.0, 0.94, smoothstep(0.48, 1.15, vigDist));

      col += (grainHash(vUv * 512.0 + fract(uTime * 0.3)) - 0.5) * 0.011;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  type: THREE.HalfFloatType,
  samples: IS_TOUCH ? 0 : 4,
});
const composer = new EffectComposer(renderer, renderTarget);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.30,
  0.70,
  1.05
);
composer.addPass(bloomPass);
const ghibliGradePass = new ShaderPass(GhibliGradeShader);
composer.addPass(ghibliGradePass);

const SUN_DIR = new THREE.Vector3(0.42, 0.72, -0.55).normalize();
const hemiLight = new THREE.HemisphereLight("#bfe2ff", "#658d3f", 1.05);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight("#fff5dc", 2.2);
sunLight.castShadow = !IS_TOUCH;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 2;
sunLight.shadow.camera.far = 160;
sunLight.shadow.camera.left = -28;
sunLight.shadow.camera.right = 28;
sunLight.shadow.camera.top = 28;
sunLight.shadow.camera.bottom = -28;
sunLight.shadow.bias = -0.0006;
scene.add(sunLight);
scene.add(sunLight.target);

// === GHIBLI ENVIRONMENT ===
const env = createEnvironment(scene, SUN_DIR);
const lState = env.getLightingState();

// === TOON GRADIENT FOR FALLBACK PLANE ===
function createToonGradient() {
  const data = new Uint8Array([110, 110, 110, 255, 188, 188, 188, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
const TOON_GRADIENT = createToonGradient();
const toonMat = (color, extra = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: TOON_GRADIENT, ...extra });

// === SUNLIT AIRCRAFT SHADER (SYNCED TO TIME-OF-DAY) ===
const ghibliPlaneMat = new THREE.ShaderMaterial({
  vertexColors: true,
  uniforms: {
    uSunDir: { value: lState.sunDir },
    uSunKey: { value: lState.sunKey },
    uShadowCol: { value: lState.shadowCol },
    uCamPos: { value: new THREE.Vector3() },
  },
  vertexShader: `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec3 vColor;
    void main() {
      #if defined(USE_COLOR_ALPHA) || defined(USE_COLOR)
        vColor = color.rgb;
      #else
        vColor = vec3(0.92, 0.90, 0.86);
      #endif
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec3 vColor;
    uniform vec3 uSunDir;
    uniform vec3 uSunKey;
    uniform vec3 uShadowCol;
    uniform vec3 uCamPos;
    void main() {
      vec3 N = normalize(vWorldNormal);
      vec3 L = normalize(uSunDir);
      vec3 V = normalize(uCamPos - vWorldPos);
      vec3 H = normalize(L + V);

      vec3 baseCol = pow(max(vColor, vec3(0.0001)), vec3(1.0 / 2.2));
      float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
      baseCol = mix(vec3(lum), baseCol, 1.12) * vec3(1.04, 1.01, 0.95);

      float ndl = dot(N, L);
      float wrap = clamp((ndl + 0.25) / 1.25, 0.0, 1.0);
      float lightMix = mix(smoothstep(0.06, 0.84, wrap), smoothstep(-0.06, 0.38, ndl), 0.55);
      vec3 keyLight = uSunKey * 0.90;
      vec3 skyShadow = uShadowCol * 0.96;
      vec3 litCol = baseCol * mix(skyShadow, keyLight, lightMix);

      litCol += baseCol * max(-N.y, 0.0) * vec3(0.08, 0.14, 0.07);
      litCol += uSunKey * pow(max(dot(N, H), 0.0001), 36.0) * 0.24;
      float rim = pow(max(1.0 - max(dot(N, V), 0.0), 0.0001), 3.0);
      litCol += mix(vec3(0.55, 0.82, 1.0), uSunKey, 0.35) * rim * 0.24;

      gl_FragColor = vec4(litCol, 1.0);
    }
  `,
});

// === AIRCRAFT SETUP ===
const planeRoot = new THREE.Group();
scene.add(planeRoot);

const outlineMat = new THREE.MeshBasicMaterial({ color: "#261c1d", side: THREE.BackSide });
function addOutlined(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(rx, ry, rz);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  const o = new THREE.Mesh(geo, outlineMat);
  o.scale.setScalar(1.06);
  g.add(o);
  parent.add(g);
  return g;
}

let proceduralPlane = new THREE.Group();
let propSpinGroup = null;

function buildBushPlane() {
  const g = new THREE.Group();
  const creamMat = toonMat("#f7f4eb");
  const stripeMat = toonMat("#5e2e2d");
  const darkMetalMat = toonMat("#323a45");
  const redMarkMat = toonMat("#d84334");
  const glassMat = new THREE.MeshStandardMaterial({
    color: "#334d68",
    emissive: "#1a3047",
    roughness: 0.15,
    metalness: 0.4,
  });

  addOutlined(g, new THREE.BoxGeometry(0.92, 0.9, 1.9), creamMat, 0, 0, 0);
  addOutlined(g, new THREE.BoxGeometry(0.84, 0.72, 1.15), creamMat, 0, -0.08, -1.45, 0.08, 0, 0);
  addOutlined(g, new THREE.ConeGeometry(0.45, 2.3, 8), creamMat, 0, 0.04, 1.9, Math.PI / 2, 0, 0);
  addOutlined(g, new THREE.BoxGeometry(0.96, 0.18, 2.1), stripeMat, 0, -0.05, 0.15);
  addOutlined(g, new THREE.BoxGeometry(0.48, 0.14, 1.9), stripeMat, 0, 0.03, 1.85);
  addOutlined(g, new THREE.BoxGeometry(0.82, 0.4, 0.5), glassMat, 0, 0.34, -0.68, -0.45, 0, 0);
  addOutlined(g, new THREE.BoxGeometry(0.95, 0.3, 0.88), glassMat, 0, 0.2, 0.1);
  addOutlined(g, new THREE.BoxGeometry(7.2, 0.14, 1.25), creamMat, 0, 0.54, -0.05);
  addOutlined(g, new THREE.BoxGeometry(0.65, 0.15, 1.22), stripeMat, -3.3, 0.54, -0.05);
  addOutlined(g, new THREE.BoxGeometry(0.65, 0.15, 1.22), stripeMat, 3.3, 0.54, -0.05);
  addOutlined(g, new THREE.CylinderGeometry(0.24, 0.24, 0.04, 5), redMarkMat, -2.15, 0.62, -0.05);
  addOutlined(g, new THREE.CylinderGeometry(0.24, 0.24, 0.04, 5), redMarkMat, 2.15, 0.62, -0.05);
  addOutlined(g, new THREE.BoxGeometry(2.5, 0.1, 0.72), creamMat, 0, 0.22, 2.65);
  addOutlined(g, new THREE.BoxGeometry(0.12, 1.05, 0.85), creamMat, 0, 0.68, 2.62, -0.18, 0, 0);

  propSpinGroup = new THREE.Group();
  propSpinGroup.position.set(0, -0.08, -2.08);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.13, 0.04), darkMetalMat);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.88, 20),
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.2, side: THREE.DoubleSide })
  );
  propSpinGroup.add(blade, disc);
  g.add(propSpinGroup);
  return g;
}

proceduralPlane = buildBushPlane();
planeRoot.add(proceduralPlane);

// Wingtip Contrails (turn gold on Slipstream Combos >= 3!)
const TRAIL_LEN = 42;
function createContrail() {
  const positions = new Float32Array(TRAIL_LEN * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.68 });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  return { line, mat, positions, points: [] };
}
const trailL = createContrail();
const trailR = createContrail();

function pushTrail(trail, worldVec) {
  trail.points.unshift(worldVec.clone());
  if (trail.points.length > TRAIL_LEN) trail.points.pop();
  for (let i = 0; i < TRAIL_LEN; i++) {
    const pt = trail.points[Math.min(i, trail.points.length - 1)] || worldVec;
    trail.positions[i * 3] = pt.x;
    trail.positions[i * 3 + 1] = pt.y;
    trail.positions[i * 3 + 2] = pt.z;
  }
  trail.line.geometry.attributes.position.needsUpdate = true;
}

function clearTrails() {
  trailL.points.length = 0;
  trailR.points.length = 0;
}

// === WIND STREAKS & WATER-SKIM SPRAY ===
const STREAK_COUNT = 55;
const streaks = [];
const streakGeo = new THREE.BoxGeometry(0.06, 0.06, 3.6);
const streakMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.28 });
for (let i = 0; i < STREAK_COUNT; i++) {
  const m = new THREE.Mesh(streakGeo, streakMat);
  m.position.set((Math.random() - 0.5) * 70, 20 + Math.random() * 45, -Math.random() * 140);
  scene.add(m);
  streaks.push(m);
}

const wakeDrops = [];
const wakeGeo = new THREE.SphereGeometry(0.26, 6, 5);
const wakeMat = new THREE.MeshBasicMaterial({ color: "#eafcff", transparent: true, opacity: 0.8 });
function spawnWakeDrop(x, y, z) {
  const m = new THREE.Mesh(wakeGeo, wakeMat.clone());
  m.position.set(x + (Math.random() - 0.5) * 1.4, y + 0.15, z);
  scene.add(m);
  wakeDrops.push({
    mesh: m,
    vx: (Math.random() - 0.5) * 4.5,
    vy: 2.2 + Math.random() * 3.0,
    vz: (Math.random() - 0.5) * 2.5,
    life: 0.75,
  });
}

// === PARACHUTED MAIL PARCELS + CELEBRATION BURSTS ===
const activeParcels = [];
const dropBursts = [];
const parcelBoxGeo = new THREE.BoxGeometry(0.95, 0.72, 0.95);
const parcelBoxMat = new THREE.MeshStandardMaterial({ color: "#d79e5e", roughness: 0.7 });
const parcelRibbonGeo = new THREE.BoxGeometry(1.0, 0.2, 0.22);
const parcelRibbonMat = new THREE.MeshBasicMaterial({ color: "#d64038" });
const chuteGeo = new THREE.SphereGeometry(1.35, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
const chuteMat = new THREE.MeshStandardMaterial({ color: "#fff6e3", roughness: 0.5, side: THREE.DoubleSide });
const burstGeo = new THREE.SphereGeometry(0.28, 6, 5);

function createParcelMesh() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(parcelBoxGeo, parcelBoxMat);
  const rib1 = new THREE.Mesh(parcelRibbonGeo, parcelRibbonMat);
  const rib2 = new THREE.Mesh(parcelRibbonGeo, parcelRibbonMat);
  rib2.rotation.y = Math.PI / 2;
  const chute = new THREE.Mesh(chuteGeo, chuteMat);
  chute.position.y = 1.9;
  g.add(box, rib1, rib2, chute);
  return g;
}

function spawnDropBurst(x, y, z, isPerfect) {
  const count = isPerfect ? 26 : 16;
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? "#ffd86b" : "#ffa8c5",
      transparent: true,
      opacity: 0.95,
    });
    const m = new THREE.Mesh(burstGeo, mat);
    m.position.set(x, y + 1.5, z);
    scene.add(m);
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const spd = 6 + Math.random() * 9;
    dropBursts.push({
      mesh: m,
      vx: Math.cos(ang) * spd,
      vy: 6 + Math.random() * 8,
      vz: Math.sin(ang) * spd,
      life: 1.4,
    });
  }
}

// === COLLECTIBLE GOLDEN WIND RINGS ===
const ringGeo = new THREE.TorusGeometry(4.2, 0.28, 10, 28);
const ringMat = new THREE.MeshStandardMaterial({
  color: "#ffea85",
  emissive: "#ffbd38",
  emissiveIntensity: 1.4,
  roughness: 0.25,
});
const windRings = [];
for (let i = 0; i < 8; i++) {
  const wz = -85 - i * 88;
  const wx = env.riverCenterX(wz) + Math.sin(i * 1.4) * 14;
  const wy = Math.max(env.getSafeAltitude(wx, wz, 5.5) + 8.5, 28 + Math.sin(i * 0.9) * 8);
  const mesh = new THREE.Mesh(ringGeo, ringMat);
  mesh.position.set(wx, wy, wz);
  scene.add(mesh);
  windRings.push({ mesh, passed: false, idx: i });
}

// === DUAL PRELOADED .GLB PLANES WITH DISTINCT HANDLING ===
const gltfLoader = new GLTFLoader();
const planeEntries = [null, null];
let activePlaneIdx = -1;

const PLANE_SPECS = [
  {
    name: "Light Aircraft",
    url: "./assets/models/light-aircraft.glb",
    targetSpan: 7.4,
    propNames: ["propeller", "prop"],
    propSpeedBase: 34,
    propSpeedBoost: 52,
    tipY: -0.18,
    tipZ: 0.35,
    cruiseSpeed: 35,
    boostSpeed: 58,
    turnRate: 1.05,
    rollLerp: 5.0,
  },
  {
    name: "Scrap Aeroplane",
    url: "./assets/models/scrap-aeroplane.glb",
    targetSpan: 7.2,
    propNames: ["prop", "propeller"],
    propSpeedBase: 32,
    propSpeedBoost: 50,
    tipYFactor: 0.72,
    tipZ: -0.15,
    cruiseSpeed: 28,
    boostSpeed: 48,
    turnRate: 1.48,
    rollLerp: 6.8,
  },
];

function findNamedControl(root, names) {
  for (const n of names) {
    const obj = root.getObjectByName(n);
    if (obj) return { obj, baseRx: obj.rotation.x, baseRy: obj.rotation.y };
  }
  return null;
}

function preparePlaneEntry(gltfScene, spec) {
  const wrapper = new THREE.Group();
  gltfScene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      const hasVertexColor = Boolean(obj.geometry?.attributes?.color);
      const hasTex = Boolean(obj.material?.map);
      if (hasVertexColor && !hasTex) obj.material = ghibliPlaneMat;
    }
  });

  const box1 = new THREE.Box3().setFromObject(gltfScene);
  const size1 = new THREE.Vector3();
  box1.getSize(size1);
  const spanRef = size1.x > 0.01 ? size1.x : Math.max(size1.x, size1.y, size1.z) || 1;
  gltfScene.scale.setScalar((spec.targetSpan || 7.2) / spanRef);
  gltfScene.rotation.y = spec.rotateY ?? Math.PI;
  wrapper.add(gltfScene);
  wrapper.updateMatrixWorld(true);

  const box2 = new THREE.Box3().setFromObject(wrapper);
  const center2 = new THREE.Vector3();
  const size2 = new THREE.Vector3();
  box2.getCenter(center2);
  box2.getSize(size2);
  gltfScene.position.sub(center2);

  const halfX = (size2.x * 0.5) * 0.96;
  const halfY = size2.y * 0.5;
  const tipY = spec.tipY !== undefined ? spec.tipY : halfY * (spec.tipYFactor ?? 0.25);
  const tipZ = spec.tipZ ?? 0.15;

  wrapper.visible = false;
  planeRoot.add(wrapper);

  return {
    name: spec.name,
    wrapper,
    prop: findNamedControl(gltfScene, spec.propNames || ["propeller", "prop"]),
    aileronL: findNamedControl(gltfScene, ["aileron-l"]),
    aileronR: findNamedControl(gltfScene, ["aileron-r"]),
    elevator: findNamedControl(gltfScene, ["elevator"]),
    rudder: findNamedControl(gltfScene, ["rudder"]),
    propSpeedBase: spec.propSpeedBase || 32,
    propSpeedBoost: spec.propSpeedBoost || 50,
    cruiseSpeed: spec.cruiseSpeed || 33,
    boostSpeed: spec.boostSpeed || 54,
    turnRate: spec.turnRate || 1.15,
    rollLerp: spec.rollLerp || 5.4,
    tipL: new THREE.Vector3(-halfX, tipY, tipZ),
    tipR: new THREE.Vector3(halfX, tipY, tipZ),
  };
}

function activatePlane(idx, notify = false) {
  const entry = planeEntries[idx];
  if (!entry) return;
  proceduralPlane.visible = false;
  for (let i = 0; i < planeEntries.length; i++) {
    if (planeEntries[i]) planeEntries[i].wrapper.visible = i === idx;
  }
  activePlaneIdx = idx;
  clearTrails();
  menu?.refresh();
  if (notify) showToast(`Plane: ${entry.name}`);
}

function switchPlane() {
  const ready = planeEntries.map((e, i) => (e ? i : -1)).filter((i) => i !== -1);
  if (ready.length === 0) return;
  const nextIdx = ready[(ready.indexOf(activePlaneIdx) + 1) % ready.length];
  activatePlane(nextIdx, true);
}

PLANE_SPECS.forEach((spec, idx) => {
  gltfLoader.load(
    spec.url,
    (gltf) => {
      planeEntries[idx] = preparePlaneEntry(gltf.scene, spec);
      if (idx === 0 || activePlaneIdx === -1) activatePlane(idx, false);
    },
    undefined,
    (err) => console.warn(`Failed to preload ${spec.url}:`, err)
  );
});

// === REALISTIC CESSNA 172 PISTON-PROP + AIRFLOW + WATER-SKIM AUDIO ===
let audioCtx = null;
let masterAudioGain = null;
let pistonOsc = null;
let subOsc = null;
let harmOsc = null;
let engineFilter = null;
let engineGain = null;
let propLfo = null;
let propThrumGain = null;
let windLowGain = null;
let windRushFilter = null;
let windRushGain = null;
let skimGain = null;
let soundEnabled = false;

function initAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new Ctx();

  masterAudioGain = audioCtx.createGain();
  masterAudioGain.gain.value = 0;
  masterAudioGain.connect(audioCtx.destination);

  // Smooth pink noise buffer for organic prop blade-pass & airflow
  const bufSize = audioCtx.sampleRate * 3;
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
    b6 = white * 0.115926;
  }

  // Soft analog muffler saturation curve
  const shaper = audioCtx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 255 - 1;
    curve[i] = Math.tanh(x * 1.65);
  }
  shaper.curve = curve;

  // Layer 1: Warm damped 4-cylinder piston core
  pistonOsc = audioCtx.createOscillator();
  pistonOsc.type = "sawtooth";
  pistonOsc.frequency.value = 72;

  subOsc = audioCtx.createOscillator();
  subOsc.type = "triangle";
  subOsc.frequency.value = 36;

  harmOsc = audioCtx.createOscillator();
  harmOsc.type = "triangle";
  harmOsc.frequency.value = 108;

  const subMix = audioCtx.createGain();
  subMix.gain.value = 0.55;
  const harmMix = audioCtx.createGain();
  harmMix.gain.value = 0.22;

  engineFilter = audioCtx.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 230;
  engineFilter.Q.value = 1.4;

  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0.13;

  pistonOsc.connect(shaper);
  subOsc.connect(subMix);
  subMix.connect(shaper);
  harmOsc.connect(harmMix);
  harmMix.connect(shaper);
  shaper.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(masterAudioGain);

  pistonOsc.start();
  subOsc.start();
  harmOsc.start();

  // Layer 2: Propeller blade-pass thrum (pink noise modulated at blade rate)
  const propSrc = audioCtx.createBufferSource();
  propSrc.buffer = buf;
  propSrc.loop = true;

  const propBand = audioCtx.createBiquadFilter();
  propBand.type = "bandpass";
  propBand.frequency.value = 155;
  propBand.Q.value = 1.05;

  const propModNode = audioCtx.createGain();
  propModNode.gain.value = 0.65;
  propLfo = audioCtx.createOscillator();
  propLfo.type = "sine";
  propLfo.frequency.value = 36;
  const propLfoDepth = audioCtx.createGain();
  propLfoDepth.gain.value = 0.28;
  propLfo.connect(propLfoDepth);
  propLfoDepth.connect(propModNode.gain);
  propLfo.start();

  propThrumGain = audioCtx.createGain();
  propThrumGain.gain.value = 0.22;

  propSrc.connect(propBand);
  propBand.connect(propModNode);
  propModNode.connect(propThrumGain);
  propThrumGain.connect(masterAudioGain);
  propSrc.start();

  // Layer 3: Natural cabin airflow & canopy wind rush
  const windSrc = audioCtx.createBufferSource();
  windSrc.buffer = buf;
  windSrc.loop = true;

  const windLow = audioCtx.createBiquadFilter();
  windLow.type = "lowpass";
  windLow.frequency.value = 220;
  windLowGain = audioCtx.createGain();
  windLowGain.gain.value = 0.26;
  windSrc.connect(windLow);
  windLow.connect(windLowGain);
  windLowGain.connect(masterAudioGain);

  windRushFilter = audioCtx.createBiquadFilter();
  windRushFilter.type = "bandpass";
  windRushFilter.frequency.value = 640;
  windRushFilter.Q.value = 0.55;
  windRushGain = audioCtx.createGain();
  windRushGain.gain.value = 0.14;
  windSrc.connect(windRushFilter);
  windRushFilter.connect(windRushGain);
  windRushGain.connect(masterAudioGain);
  windSrc.start();

  // Layer 4: Subtle water-skim spray rush
  const skimSrc = audioCtx.createBufferSource();
  skimSrc.buffer = buf;
  skimSrc.loop = true;
  const skimBand = audioCtx.createBiquadFilter();
  skimBand.type = "bandpass";
  skimBand.frequency.value = 1150;
  skimBand.Q.value = 0.7;
  skimGain = audioCtx.createGain();
  skimGain.gain.value = 0;
  skimSrc.connect(skimBand);
  skimBand.connect(skimGain);
  skimGain.connect(masterAudioGain);
  skimSrc.start();
}

function playChime(notes = [523.25, 659.25]) {
  if (!soundEnabled || !audioCtx || !masterAudioGain) return;
  const now = audioCtx.currentTime;
  notes.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now + idx * 0.05);
    g.gain.exponentialRampToValueAtTime(0.05, now + idx * 0.05 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.05 + 0.36);
    osc.connect(g);
    g.connect(masterAudioGain);
    osc.start(now + idx * 0.05);
    osc.stop(now + idx * 0.05 + 0.4);
  });
}

function toggleSound() {
  initAudio();
  if (audioCtx.state === "suspended") audioCtx.resume();
  soundEnabled = !soundEnabled;
  if (masterAudioGain) {
    masterAudioGain.gain.setTargetAtTime(soundEnabled ? 1.0 : 0.0, audioCtx.currentTime, 0.16);
  }
  menu?.refresh();
  showToast(soundEnabled ? "Cessna Engine & Wind Enabled" : "Engine Sound Muted");
}

// === BIOME / MAP SWITCHER (EMERALD VALLEY <-> AZURE COAST) ===
function repositionRingsForBiome() {
  for (const r of windRings) {
    const wz = r.mesh.position.z;
    const nx = env.getBiome() === "coast"
      ? Math.sin(r.idx * 1.4 + wz * 0.01) * 42
      : env.riverCenterX(wz) + Math.sin(r.idx * 1.4 + wz * 0.01) * 18;
    const ny = Math.max(env.getSafeAltitude(nx, wz, 5.5) + 8.5, 28 + Math.sin(r.idx * 0.9) * 9);
    r.mesh.position.set(nx, ny, wz);
  }
}

function setActiveBiome(biomeName, notify = true) {
  const b = biomeName === "coast" ? "coast" : "valley";
  env.setBiome(b);
  menu?.refresh();
  repositionRingsForBiome();
  if (notify) showToast(`Map: ${b === "coast" ? "Azure Coast" : "Emerald Valley"}`);
}
if (PARAM_BIOME === "coast") setActiveBiome("coast", false);

// === TIME-OF-DAY PRESET CYCLER ===
const TIME_MODES = [
  { key: "auto", label: "Auto", phase: null },
  { key: "noon", label: "Noon", phase: 0.0 },
  { key: "sunset", label: "Sunset", phase: 0.5 },
  { key: "dusk", label: "Dusk", phase: 1.0 },
];
let timeModeIdx = 0;
if (PARAM_TIME) {
  const found = TIME_MODES.findIndex((m) => m.key === PARAM_TIME);
  if (found !== -1) timeModeIdx = found;
}

function stepTimeMode(dir = 1, notify = false) {
  timeModeIdx = (timeModeIdx + dir + TIME_MODES.length) % TIME_MODES.length;
  if (notify) showToast(`Time: ${TIME_MODES[timeModeIdx].label}`);
  menu?.refresh();
}
function cycleTimeMode() {
  stepTimeMode(1, true);
}

// === CAMERA MODES & PHOTO MODE ===
const CAM_MODES = [
  { name: "Valley Chase", offset: new THREE.Vector3(-4.2, 12.0, 14.8), lookAhead: new THREE.Vector3(0, -2.8, -22), fov: 50 },
  { name: "Side-Wing Clouds", offset: new THREE.Vector3(-12.2, 1.8, 8.2), lookAhead: new THREE.Vector3(3.8, 1.4, -18), fov: 48 },
  { name: "Mountain Panorama", offset: new THREE.Vector3(0, 6.2, 22.5), lookAhead: new THREE.Vector3(0, 2.2, -36), fov: 58 },
];
let camModeIdx = 0;

function stepCamera(dir = 1, notify = false) {
  camModeIdx = (camModeIdx + dir + CAM_MODES.length) % CAM_MODES.length;
  if (notify) showToast(`Camera: ${CAM_MODES[camModeIdx].name}`);
  menu?.refresh();
}
function cycleCamera() {
  stepCamera(1, true);
}

let hudHidden = false;
function applyHudVisibility() {
  const inFlight = gameState === "PLAYING" || gameState === "CRASHED" || gameState === "PAUSED";
  const showHud = !hudHidden && inFlight;
  hudTopLeft.style.display = showHud ? "flex" : "none";
  hudBottom.style.display = showHud ? "flex" : "none";
  boostBarWrap.style.display = showHud ? "block" : "none";
  btnPause.parentElement.style.display = inFlight ? "block" : "none";
  touch?.setVisible(showHud && (gameState === "PLAYING" || gameState === "CRASHED"));
}

let invertPitch = false;
function toggleInvertPitch() {
  invertPitch = !invertPitch;
  menu?.refresh();
}

let photoYaw = -0.35;
let photoPitch = 0.25;
let photoDist = 15.0;
let isDraggingPhoto = false;
let prevDragX = 0;
let prevDragY = 0;

window.addEventListener("pointerdown", (e) => {
  if (gameState !== "PHOTO") return;
  isDraggingPhoto = true;
  prevDragX = e.clientX;
  prevDragY = e.clientY;
});
window.addEventListener("pointermove", (e) => {
  if (gameState !== "PHOTO" || !isDraggingPhoto) return;
  photoYaw -= (e.clientX - prevDragX) * 0.008;
  photoPitch = Math.max(-0.4, Math.min(1.15, photoPitch + (e.clientY - prevDragY) * 0.006));
  prevDragX = e.clientX;
  prevDragY = e.clientY;
});
window.addEventListener("pointerup", () => { isDraggingPhoto = false; });

function togglePhotoMode() {
  if (gameState === "TITLE" || gameState === "SUMMARY" || gameState === "PAUSED") return;
  if (gameState === "PLAYING") {
    gameState = "PHOTO";
    photoBar.classList.add("show");
    dropHintEl.classList.remove("show");
  } else {
    gameState = "PLAYING";
    photoBar.classList.remove("show");
  }
  applyHudVisibility();
}
btnResumePhoto.addEventListener("click", togglePhotoMode);

btnSnap.addEventListener("click", () => {
  composer.render();
  const a = document.createElement("a");
  a.href = renderer.domElement.toDataURL("image/png");
  a.download = "sky-drift-photo.png";
  a.click();
  showToast("Screenshot Saved!");
});

// === GAME STATE, FLIGHT & COURIER PROGRESSION ===
const COURIER_GOAL = 5;
let gameState = AUTOSTART ? "PLAYING" : "TITLE";
let gameMode = "courier";
let dropCooldown = 0;
let currentSkimming = false;

const flight = {
  x: 0,
  y: 35,
  z: 0,
  heading: 0,
  pitch: -0.02,
  roll: 0,
  speed: 33,
  boostEnergy: 100,
  boostTimer: 0,
  deliveries: 0,
  perfectDrops: 0,
  bridgesCleared: 0,
  combo: 1,
  maxCombo: 1,
  score: 0,
  dist: 0,
  time: 0,
  dayClock: 0,
};

function startSession(mode) {
  planeRoot.visible = true;
  gameMode = mode;
  gameState = "PLAYING";
  menu.closeAll();
  flight.deliveries = 0;
  flight.perfectDrops = 0;
  flight.bridgesCleared = 0;
  flight.combo = 1;
  flight.maxCombo = 1;
  flight.score = 0;
  flight.boostEnergy = 100;
  applyHudVisibility();
  showToast(mode === "courier" ? "Deliver 5 Mail Parcels!" : "Free Roam — Enjoy the Sky!");
}

applyHudVisibility();

function dropMailParcel() {
  if (gameState !== "PLAYING" || dropCooldown > 0) return;
  dropCooldown = 0.45;
  const mesh = createParcelMesh();
  mesh.position.set(planeRoot.position.x, planeRoot.position.y - 1.1, planeRoot.position.z);
  scene.add(mesh);
  activeParcels.push({
    mesh,
    vx: -Math.sin(flight.heading) * flight.speed * 0.25,
    vy: -4.0,
    vz: -Math.cos(flight.heading) * flight.speed * 0.25,
    age: 0,
  });
  playChime([380, 480]);
}

// === SOFT CRASH: hit a building, plane breaks apart, respawn a moment later ===
let crashTimer = 0;
const crashDebris = [];
const debrisGeo = new THREE.IcosahedronGeometry(0.5, 0);
const debrisCols = ["#ffffff", "#ff7a3d", "#ffd166", "#5aa9ff"];

function crashPlane() {
  gameState = "CRASHED";
  crashTimer = 2.2;
  flight.combo = 1;
  flight.boostTimer = 0;
  planeRoot.visible = false;
  dropHintEl.classList.remove("show");
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(
      debrisGeo,
      new THREE.MeshBasicMaterial({ color: debrisCols[i % debrisCols.length], transparent: true })
    );
    m.position.copy(planeRoot.position);
    m.scale.setScalar(0.5 + Math.random() * 1.1);
    scene.add(m);
    crashDebris.push({
      m,
      vx: (Math.random() - 0.5) * 18,
      vy: Math.random() * 12 + 2,
      vz: (Math.random() - 0.5) * 18,
      life: 1.6 + Math.random() * 0.6,
    });
  }
  playChime([196, 147]);
  showToast("Plane down! Back in the air shortly...");
}

function updateCrashDebris(dt) {
  for (let i = crashDebris.length - 1; i >= 0; i--) {
    const d = crashDebris[i];
    d.life -= dt;
    d.vy -= dt * 22;
    d.m.position.x += d.vx * dt;
    d.m.position.y += d.vy * dt;
    d.m.position.z += d.vz * dt;
    d.m.material.opacity = Math.max(0, Math.min(1, d.life));
    if (d.life <= 0) {
      scene.remove(d.m);
      d.m.material.dispose();
      crashDebris.splice(i, 1);
    }
  }
}

function respawnAfterCrash() {
  // back to a safe spot over the river / open water, level, same progress
  flight.x = env.getBiome() === "coast" ? 0 : env.riverCenterX(flight.z);
  flight.y = Math.max(40, env.getSafeAltitude(flight.x, flight.z, 6) + 10);
  flight.heading = 0;
  flight.pitch = -0.02;
  flight.roll = 0;
  planeRoot.visible = true;
  gameState = "PLAYING";
}

function finishCourierRun() {
  gameState = "SUMMARY";
  applyHudVisibility();
  dropHintEl.classList.remove("show");
  const prevBest = Number(localStorage.getItem("skyDriftBest") || "0");
  const best = Math.max(prevBest, flight.score);
  localStorage.setItem("skyDriftBest", String(best));

  sumScore.textContent = String(flight.score);
  sumPerfect.textContent = String(flight.perfectDrops);
  sumBridges.textContent = String(flight.bridgesCleared);
  sumCombo.textContent = `x${flight.maxCombo}`;
  sumDist.textContent = `${(flight.dist / 1000).toFixed(1)} km`;
  sumBest.textContent = String(best);
  menu.replace("results");
}

// === ACCESSIBILITY (saved in the browser) ===
const A11Y_KEY = "skyDriftAccess";
const UI_SCALES = [
  { label: "Normal", value: 1 },
  { label: "Large", value: 1.25 },
  { label: "Extra large", value: 1.5 },
];
const a11y = (() => {
  const defaults = {
    uiScale: 0,
    contrast: false,
    reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    crashProtection: false,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(A11Y_KEY) || "{}") };
  } catch {
    return defaults;
  }
})();
a11y.uiScale = Math.max(0, Math.min(UI_SCALES.length - 1, Number(a11y.uiScale) || 0));

function applyAccessibility() {
  document.documentElement.style.setProperty("--ui-scale", String(UI_SCALES[a11y.uiScale].value));
  document.body.classList.toggle("high-contrast", a11y.contrast);
  document.body.classList.toggle("reduce-motion", a11y.reduceMotion);
  localStorage.setItem(A11Y_KEY, JSON.stringify(a11y));
  menu?.refresh();
}

// === MENU WIRING ===
function pauseGame() {
  if (gameState !== "PLAYING") return;
  keys.clear();
  gameState = "PAUSED";
  dropHintEl.classList.remove("show");
  applyHudVisibility();
  menu.open("pause");
}

function resumeGame() {
  menu.closeAll();
  gameState = "PLAYING";
  applyHudVisibility();
}

function returnToMainMenu() {
  gameState = "TITLE";
  planeRoot.visible = true;
  photoBar.classList.remove("show");
  dropHintEl.classList.remove("show");
  applyHudVisibility();
  menu.replace("main");
}

const planeStats = (() => {
  const maxBoost = Math.max(...PLANE_SPECS.map((s) => s.boostSpeed));
  const maxTurn = Math.max(...PLANE_SPECS.map((s) => s.turnRate ?? 1.15));
  const taglines = [
    "Touring cruiser. Higher top speed and a smooth, steady cruise.",
    "Sky tinkerer. Tighter turns and agile precision for drops.",
  ];
  return PLANE_SPECS.map((s, i) => ({
    name: s.name,
    tagline: taglines[i] || "",
    bars: { Speed: s.boostSpeed / maxBoost, Agility: (s.turnRate ?? 1.15) / maxTurn },
  }));
})();

menu = createMenu({
  planes: planeStats,
  getState: () => gameState,
  getMap: () => env.getBiome(),
  setMap: (key) => setActiveBiome(key, false),
  getPlaneIdx: () => activePlaneIdx,
  setPlane: (i) => activatePlane(i, false),
  best: () => Number(localStorage.getItem("skyDriftBest") || "0"),
  settings: [
    {
      id: "time", label: "Time of day", hint: "Auto drifts slowly from noon toward sunset",
      get: () => TIME_MODES[timeModeIdx].label, step: (d) => stepTimeMode(d),
    },
    {
      id: "camera", label: "Camera", hint: "Where the camera sits behind the plane",
      get: () => CAM_MODES[camModeIdx].name, step: (d) => stepCamera(d),
    },
    {
      id: "pitch", label: "Pitch controls", hint: "Inverted: W dives, S climbs",
      get: () => (invertPitch ? "Inverted" : "Normal"), step: () => toggleInvertPitch(),
    },
    {
      id: "sound", label: "Engine sound", hint: "Engine hum and wind",
      get: () => (soundEnabled ? "On" : "Off"), step: () => toggleSound(),
    },
    ...(document.fullscreenEnabled
      ? [{
          id: "fullscreen", label: "Fullscreen", hint: "Hides the browser bars for more room",
          get: () => (document.fullscreenElement ? "On" : "Off"),
          step: () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen().catch(() => {});
            setTimeout(() => menu.refresh(), 250);
          },
        }]
      : []),
    {
      id: "uiScale", label: "Text and HUD size", hint: "Makes the in-flight numbers and hints bigger",
      get: () => UI_SCALES[a11y.uiScale].label,
      step: (d) => { a11y.uiScale = (a11y.uiScale + d + UI_SCALES.length) % UI_SCALES.length; applyAccessibility(); },
    },
    {
      id: "contrast", label: "High contrast", hint: "Solid dark panels and brighter borders, easier to read",
      get: () => (a11y.contrast ? "On" : "Off"),
      step: () => { a11y.contrast = !a11y.contrast; applyAccessibility(); },
    },
    {
      id: "reduceMotion", label: "Reduce motion", hint: "Turns off menu animations and the plane's gentle bobbing",
      get: () => (a11y.reduceMotion ? "On" : "Off"),
      step: () => { a11y.reduceMotion = !a11y.reduceMotion; applyAccessibility(); },
    },
    {
      id: "crashProtection", label: "Crash protection", hint: "On: the plane glides over buildings instead of breaking",
      get: () => (a11y.crashProtection ? "On" : "Off"),
      step: () => { a11y.crashProtection = !a11y.crashProtection; applyAccessibility(); },
    },
  ],
  actions: {
    courier: () => startSession("courier"),
    fly: () => startSession("courier"),
    free: () => startSession("free"),
    again: () => startSession("courier"),
    restart: () => startSession(gameMode),
    continue: () => {
      gameMode = "free";
      resumeGame();
    },
    resume: resumeGame,
    pause: pauseGame,
    main: returnToMainMenu,
    photo: () => {
      menu.closeAll();
      gameState = "PHOTO";
      photoBar.classList.add("show");
      applyHudVisibility();
    },
  },
});
btnPause.addEventListener("click", pauseGame);
applyAccessibility();
if (!AUTOSTART) {
  menu.replace("main");
  if (!localStorage.getItem("skyDriftSeenHowTo")) {
    localStorage.setItem("skyDriftSeenHowTo", "1");
    menu.open("howto");
  }
}
menu.refresh();

// === INPUT ===
const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (menu.isOpen() || e.code === "Escape") return;
  keys.add(e.code);
  if (e.code === "KeyB") setActiveBiome(env.getBiome() === "coast" ? "valley" : "coast", true);
  if (e.code === "KeyP") switchPlane();
  if (e.code === "KeyT") cycleTimeMode();
  if (e.code === "KeyC" && gameState === "PLAYING") cycleCamera();
  if (e.code === "KeyM") toggleSound();
  if (e.code === "KeyF") togglePhotoMode();
  if (e.code === "KeyE") dropMailParcel();
  if (e.code === "KeyH" && gameState === "PLAYING") {
    hudHidden = !hudHidden;
    applyHudVisibility();
    if (hudHidden) showToast("HUD hidden. Press H to show it again");
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
if (IS_TOUCH) {
  touch = createTouchControls({ keys, onDrop: dropMailParcel });
  applyHudVisibility();
}

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  ghibliGradePass.uniforms.uAspect.value = w / h;
});

const camPosSmooth = new THREE.Vector3(-4.2, 47, 14.8);
const camLookSmooth = new THREE.Vector3(0, 32, -22);
let wakeTimer = 0;
let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const dt = gameState === "PHOTO" || gameState === "SUMMARY" || gameState === "PAUSED" ? 0 : rawDt;

  flight.time += dt;
  flight.dayClock += dt;
  if (dropCooldown > 0) dropCooldown = Math.max(0, dropCooldown - dt);

  const activeEntry = activePlaneIdx >= 0 ? planeEntries[activePlaneIdx] : null;
  const specCruise = activeEntry ? activeEntry.cruiseSpeed : 33;
  const specBoost = activeEntry ? activeEntry.boostSpeed : 54;
  const specTurn = activeEntry ? activeEntry.turnRate : 1.15;
  const specRollLerp = activeEntry ? activeEntry.rollLerp : 5.2;

  currentSkimming = false;
  if (gameState === "PLAYING") {
    let steer = 0;
    let climb = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) steer += 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) steer -= 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) climb += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) climb -= 1;
    if (invertPitch) climb = -climb;

    const wantsBoost = keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("Space");
    const canBoost = wantsBoost && flight.boostEnergy > 4;
    if (flight.boostTimer > 0) flight.boostTimer = Math.max(0, flight.boostTimer - dt);

    currentSkimming = env.isOverWater(flight.x, flight.z) && flight.y < env.WATER_Y + 9.8;

    if (canBoost) {
      flight.boostEnergy = Math.max(0, flight.boostEnergy - dt * 26);
    } else {
      flight.boostEnergy = Math.min(100, flight.boostEnergy + dt * (currentSkimming ? 38 : 11));
    }
    if (currentSkimming) {
      wakeTimer += dt;
      if (wakeTimer > 0.055) {
        wakeTimer = 0;
        spawnWakeDrop(flight.x, env.WATER_Y, flight.z);
      }
    }

    const isBoosting = canBoost || flight.boostTimer > 0;
    const targetSpeed = isBoosting ? specBoost : specCruise + (flight.combo >= 3 ? 4 : 0);
    flight.speed += (targetSpeed - flight.speed) * Math.min(1, dt * 3.5);

    flight.roll += (steer * 0.65 - flight.roll) * Math.min(1, dt * specRollLerp);
    flight.pitch += (climb * 0.44 - flight.pitch) * Math.min(1, dt * 4.6);

    flight.heading += flight.roll * dt * specTurn;
    flight.heading = Math.max(-1.05, Math.min(1.05, flight.heading));
    if (steer === 0) flight.heading *= Math.max(0, 1 - dt * 0.25);

    const vx = -Math.sin(flight.heading) * Math.cos(flight.pitch) * flight.speed;
    const vy = Math.sin(flight.pitch) * flight.speed;
    const vz = -Math.cos(flight.heading) * Math.cos(flight.pitch) * flight.speed;

    flight.x += vx * dt;
    flight.y += vy * dt;
    flight.z += vz * dt;
    flight.dist += flight.speed * dt;
  } else if (gameState === "TITLE") {
    flight.speed = 24;
    flight.z -= flight.speed * dt;
    const targetX = env.getBiome() === "coast" ? Math.sin(flight.z * 0.008) * 18 : env.riverCenterX(flight.z);
    flight.heading += ((targetX - flight.x) * -0.025 - flight.heading) * Math.min(1, dt * 2.0);
    flight.x += (targetX - flight.x) * Math.min(1, dt * 1.4);
    flight.roll = Math.sin(flight.time * 0.8) * 0.14;
    flight.pitch = -0.02;
    flight.y = Math.max(32, env.getSafeAltitude(flight.x, flight.z, 4.6) + 8);
  }

  flight.x = Math.max(-95, Math.min(95, flight.x));
  const minFloor = env.getSafeAltitude(flight.x, flight.z, 4.6, gameState === "PLAYING" && !a11y.crashProtection);
  if (flight.y < minFloor) {
    flight.y += (minFloor - flight.y) * Math.min(1, dt * 8.5);
    if (flight.pitch < 0) flight.pitch *= 0.78;
  }
  if (flight.y > 95) {
    flight.y = 95;
    if (flight.pitch > 0) flight.pitch *= 0.8;
  }

  const bob = a11y.reduceMotion ? 0 : Math.sin(flight.time * 2.4) * 0.14;
  planeRoot.position.set(flight.x, flight.y + bob, flight.z);
  planeRoot.rotation.order = "YXZ";
  planeRoot.rotation.set(flight.pitch, flight.heading, flight.roll);
  planeRoot.updateMatrixWorld(true);

  if (activeEntry) {
    if (activeEntry.prop) {
      const fastProp = keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("Space") || flight.boostTimer > 0;
      activeEntry.prop.obj.rotation.z += dt * (fastProp ? activeEntry.propSpeedBoost : activeEntry.propSpeedBase);
    }
    if (activeEntry.aileronL) activeEntry.aileronL.obj.rotation.x = activeEntry.aileronL.baseRx - flight.roll * 0.35;
    if (activeEntry.aileronR) activeEntry.aileronR.obj.rotation.x = activeEntry.aileronR.baseRx + flight.roll * 0.35;
    if (activeEntry.elevator) activeEntry.elevator.obj.rotation.x = activeEntry.elevator.baseRx - flight.pitch * 0.40;
    if (activeEntry.rudder) activeEntry.rudder.obj.rotation.y = activeEntry.rudder.baseRy - flight.roll * 0.32;
  } else if (propSpinGroup) {
    propSpinGroup.rotation.z += dt * 34;
  }

  if (dt > 0) {
    const trailCol = flight.combo >= 3 ? "#ffe27a" : "#ffffff";
    trailL.mat.color.set(trailCol);
    trailR.mat.color.set(trailCol);
    const localTipL = activeEntry ? activeEntry.tipL : new THREE.Vector3(-3.55, 0.54, 0.15);
    const localTipR = activeEntry ? activeEntry.tipR : new THREE.Vector3(3.55, 0.54, 0.15);
    pushTrail(trailL, localTipL.clone().applyMatrix4(planeRoot.matrixWorld));
    pushTrail(trailR, localTipR.clone().applyMatrix4(planeRoot.matrixWorld));
  }

  // Update active parachuted mail parcels
  for (let i = activeParcels.length - 1; i >= 0; i--) {
    const p = activeParcels[i];
    p.age += dt;
    p.vy = Math.max(-10.5, p.vy - dt * 16);
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vx *= Math.max(0, 1 - dt * 1.4);
    p.vz *= Math.max(0, 1 - dt * 1.4);
    p.mesh.rotation.z = Math.sin(p.age * 4.5) * 0.14;

    const target = env.getNearestDelivery(p.mesh.position, 48);
    const groundY = env.terrainHeight(p.mesh.position.x, p.mesh.position.z);
    const distToTarget = target ? Math.hypot(p.mesh.position.x - target.x, p.mesh.position.z - target.z) : 999;

    if ((target && distToTarget < 18 && p.mesh.position.y <= target.topY + 6) || p.mesh.position.y <= groundY + 1.2) {
      scene.remove(p.mesh);
      activeParcels.splice(i, 1);

      if (target && distToTarget < 46) {
        const isPerfect = distToTarget < 21;
        const pts = (isPerfect ? 500 : 250) * flight.combo;
        flight.score += pts;
        flight.deliveries += 1;
        if (isPerfect) flight.perfectDrops += 1;
        flight.combo = Math.min(8, flight.combo + 1);
        flight.maxCombo = Math.max(flight.maxCombo, flight.combo);
        flight.boostEnergy = Math.min(100, flight.boostEnergy + 35);
        flight.boostTimer = 1.4;
        env.markDelivered(target.id);
        spawnDropBurst(target.x, target.topY, target.z, isPerfect);
        playChime(isPerfect ? [523.25, 659.25, 783.99] : [523.25, 659.25]);
        showToast(`${isPerfect ? "PERFECT DROP!" : "Delivered to " + target.name + "!"} +${pts}`);

        if (gameMode === "courier" && flight.deliveries >= COURIER_GOAL) {
          finishCourierRun();
        }
      } else {
        flight.combo = 1;
        showToast("Parcel missed!");
      }
    }
  }

  for (let i = wakeDrops.length - 1; i >= 0; i--) {
    const w = wakeDrops[i];
    w.life -= dt;
    w.vy -= dt * 9.5;
    w.mesh.position.x += w.vx * dt;
    w.mesh.position.y += w.vy * dt;
    w.mesh.position.z += w.vz * dt;
    w.mesh.material.opacity = Math.max(0, w.life * 0.9);
    if (w.life <= 0) {
      scene.remove(w.mesh);
      wakeDrops.splice(i, 1);
    }
  }
  for (let i = dropBursts.length - 1; i >= 0; i--) {
    const b = dropBursts[i];
    b.life -= dt;
    b.vy -= dt * 8.0;
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.y += b.vy * dt;
    b.mesh.position.z += b.vz * dt;
    b.mesh.material.opacity = Math.max(0, b.life * 0.7);
    if (b.life <= 0) {
      scene.remove(b.mesh);
      dropBursts.splice(i, 1);
    }
  }

  for (const st of streaks) {
    st.position.z += dt * 14;
    if (Math.hypot(st.position.x - flight.x, st.position.y - flight.y, st.position.z - flight.z) < 6.8) {
      st.position.x += (st.position.x >= flight.x ? 1 : -1) * 7.0;
    }
    if (st.position.z > flight.z + 25) {
      let sx = flight.x + (Math.random() - 0.5) * 65;
      if (Math.abs(sx - flight.x) < 6.5) sx += sx >= flight.x ? 7.0 : -7.0;
      st.position.set(sx, Math.max(minFloor + 3, flight.y + (Math.random() - 0.5) * 28), flight.z - 90 - Math.random() * 80);
    }
  }

  if (gameState === "PLAYING" && !a11y.crashProtection && env.checkBuildingCrash(planeRoot.position)) {
    crashPlane();
  }
  if (gameState === "CRASHED") {
    crashTimer -= dt;
    updateCrashDebris(dt);
    if (crashTimer <= 0) respawnAfterCrash();
  }

  if (gameState === "PLAYING") {
    const bridge = env.checkUnderBridge(planeRoot.position);
    if (bridge) {
      const pts = 400 * flight.combo;
      flight.score += pts;
      flight.bridgesCleared += 1;
      flight.combo = Math.min(8, flight.combo + 1);
      flight.maxCombo = Math.max(flight.maxCombo, flight.combo);
      flight.boostEnergy = Math.min(100, flight.boostEnergy + 35);
      flight.boostTimer = 1.6;
      playChime([587.33, 783.99]);
      showToast(`UNDER-BRIDGE STUNT! +${pts}`);
    }

    const nearTarget = env.getNearestDelivery(planeRoot.position, 64);
    if (nearTarget) {
      dropHintEl.replaceChildren();
      if (IS_TOUCH) {
        dropHintEl.append(`Tap DROP to send mail to ${nearTarget.name}!`);
      } else {
        const key = document.createElement("kbd");
        key.textContent = "E";
        dropHintEl.append(key, ` Drop Mail to ${nearTarget.name}!`);
      }
      dropHintEl.classList.add("show");
    } else {
      dropHintEl.classList.remove("show");
    }
  }

  for (const r of windRings) {
    r.mesh.rotation.z += dt * 0.9;
    if (gameState === "PLAYING" && !r.passed && r.mesh.position.distanceTo(planeRoot.position) < 6.4) {
      r.passed = true;
      r.mesh.visible = false;
      flight.combo = Math.min(8, flight.combo + 1);
      flight.maxCombo = Math.max(flight.maxCombo, flight.combo);
      const pts = 100 * flight.combo;
      flight.score += pts;
      flight.boostEnergy = Math.min(100, flight.boostEnergy + 20);
      flight.boostTimer = 1.5;
      playChime([523.25, 659.25]);
      showToast(`Wind Ring x${flight.combo}! +${pts}`);
    }
    if (r.mesh.position.z > flight.z + 40) {
      const nextZ = r.mesh.position.z - 8 * 88;
      const nx = env.getBiome() === "coast"
        ? Math.sin(r.idx * 1.4 + nextZ * 0.01) * 42
        : env.riverCenterX(nextZ) + Math.sin(r.idx * 1.4 + nextZ * 0.01) * 18;
      const ny = Math.max(env.getSafeAltitude(nx, nextZ, 5.5) + 8.5, 28 + Math.sin(r.idx * 0.9) * 9);
      r.mesh.position.set(nx, ny, nextZ);
      r.passed = false;
      r.mesh.visible = true;
    }
  }

  if (gameState === "PHOTO") {
    const ox = Math.sin(photoYaw) * Math.cos(photoPitch) * photoDist;
    const oy = Math.sin(photoPitch) * photoDist;
    const oz = Math.cos(photoYaw) * Math.cos(photoPitch) * photoDist;
    camera.position.set(planeRoot.position.x + ox, planeRoot.position.y + oy, planeRoot.position.z + oz);
    camera.lookAt(planeRoot.position);
  } else if (gameState === "TITLE") {
    const orbitAngle = flight.time * 0.22;
    camera.position.set(
      planeRoot.position.x + Math.sin(orbitAngle) * 15,
      planeRoot.position.y + 6.5,
      planeRoot.position.z + Math.cos(orbitAngle) * 15
    );
    camera.lookAt(planeRoot.position.x, planeRoot.position.y - 1.5, planeRoot.position.z - 8);
  } else {
    const mode = CAM_MODES[camModeIdx];
    if (Math.abs(camera.fov - mode.fov) > 0.1) {
      camera.fov += (mode.fov - camera.fov) * Math.min(1, rawDt * 4);
      camera.updateProjectionMatrix();
    }
    const rotY = new THREE.Matrix4().makeRotationY(flight.heading * 0.65);
    const desiredCam = mode.offset.clone().applyMatrix4(rotY).add(planeRoot.position);
    const desiredLook = mode.lookAhead.clone().applyMatrix4(rotY).add(planeRoot.position);
    camPosSmooth.lerp(desiredCam, Math.min(1, rawDt * 6));
    camLookSmooth.lerp(desiredLook, Math.min(1, rawDt * 7));
    camera.position.copy(camPosSmooth);
    camera.lookAt(camLookSmooth);
  }
  camera.updateMatrixWorld();

  const tm = TIME_MODES[timeModeIdx];
  // Auto: one slow noon -> sunset -> noon loop (about 9 minutes) that never reaches full dusk.
  const dayPhase = tm.phase !== null ? tm.phase : 0.6 * (0.5 - 0.5 * Math.cos(flight.dayClock * 0.0116));

  env.update(dt, flight.time, planeRoot.position, camera.position, dayPhase);

  ghibliPlaneMat.uniforms.uCamPos.value.copy(camera.position);
  ghibliGradePass.uniforms.uTime.value = flight.time;
  ghibliGradePass.uniforms.uSunKey.value.copy(lState.sunKey);
  ghibliGradePass.uniforms.uShadowCol.value.copy(lState.shadowCol);

  const sunWorld = camera.position.clone().addScaledVector(lState.sunDir, 800);
  const sunProj = sunWorld.project(camera);
  ghibliGradePass.uniforms.uSunScreen.value.set(sunProj.x * 0.5 + 0.5, sunProj.y * 0.5 + 0.5);
  const camFwd = new THREE.Vector3();
  camera.getWorldDirection(camFwd);
  const facing = THREE.MathUtils.smoothstep(camFwd.dot(lState.sunDir), 0.15, 0.95);
  ghibliGradePass.uniforms.uSunFacing.value = sunProj.z < 1.0 ? facing : 0.0;

  sunLight.position.copy(planeRoot.position).addScaledVector(lState.sunDir, 60);
  sunLight.target.position.copy(planeRoot.position);
  sunLight.target.updateMatrixWorld();

  // Dynamic realistic Cessna 172 piston, prop thrum, slipstream wind & water-skim modulation
  if (soundEnabled && audioCtx) {
    const nowT = audioCtx.currentTime;
    const spdNorm = Math.max(0, Math.min(1, (flight.speed - 22) / 36));
    const rpmHz = 68 + spdNorm * 34 - flight.pitch * 8;
    pistonOsc.frequency.setTargetAtTime(rpmHz, nowT, 0.14);
    subOsc.frequency.setTargetAtTime(rpmHz * 0.5, nowT, 0.14);
    harmOsc.frequency.setTargetAtTime(rpmHz * 1.5, nowT, 0.14);
    propLfo.frequency.setTargetAtTime(rpmHz * 0.5, nowT, 0.14);

    engineFilter.frequency.setTargetAtTime(190 + spdNorm * 140, nowT, 0.16);
    engineGain.gain.setTargetAtTime(0.11 + spdNorm * 0.06, nowT, 0.16);
    propThrumGain.gain.setTargetAtTime(0.18 + spdNorm * 0.12, nowT, 0.16);

    windLowGain.gain.setTargetAtTime(0.20 + spdNorm * 0.18, nowT, 0.16);
    windRushFilter.frequency.setTargetAtTime(520 + spdNorm * 580, nowT, 0.18);
    windRushGain.gain.setTargetAtTime(0.08 + spdNorm * 0.18, nowT, 0.16);
    skimGain.gain.setTargetAtTime(currentSkimming ? 0.14 : 0.0, nowT, 0.12);
  }

  altEl.textContent = `${Math.round(flight.y * 4.2)} m`;
  spdEl.textContent = `${Math.round(flight.speed * 2.6)} kt`;
  mailEl.textContent = gameMode === "courier" ? `${flight.deliveries} / ${COURIER_GOAL}` : String(flight.deliveries);
  comboEl.textContent = `x${flight.combo}`;
  scoreEl.textContent = String(flight.score);
  boostFill.style.width = `${Math.round(flight.boostEnergy)}%`;

  composer.render();
}

requestAnimationFrame(animate);
