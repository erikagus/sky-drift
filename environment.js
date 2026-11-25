import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function createEnvironment(scene, initialSunDir) {
  function createToonGradient() {
    const data = new Uint8Array([
      105, 105, 105, 255,
      188, 188, 188, 255,
      255, 255, 255, 255,
    ]);
    const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }
  const TOON_GRAD = createToonGradient();
  const toonMat = (color, extra = {}) =>
    new THREE.MeshToonMaterial({ color, gradientMap: TOON_GRAD, ...extra });

  const texLoader = new THREE.TextureLoader();

  // === 0. DYNAMIC TIME-OF-DAY & BIOME STATE ===
  let currentBiome = "valley"; // "valley" | "coast"
  const uIsCoast = { value: 0.0 };

  const PRESETS = {
    noon: {
      sunDir: new THREE.Vector3(0.42, 0.72, -0.55).normalize(),
      skyZenith: new THREE.Vector3(0.02, 0.27, 0.78),
      skyMid: new THREE.Vector3(0.07, 0.50, 0.92),
      skyCyan: new THREE.Vector3(0.36, 0.79, 0.99),
      skyHorizon: new THREE.Vector3(0.84, 0.95, 1.00),
      mtnFar: new THREE.Vector3(0.46, 0.75, 0.94),
      mtnMid: new THREE.Vector3(0.28, 0.58, 0.84),
      mtnNear: new THREE.Vector3(0.15, 0.42, 0.68),
      sunKey: new THREE.Vector3(1.26, 1.15, 0.96),
      shadowCol: new THREE.Vector3(0.12, 0.30, 0.72),
      fogCol: new THREE.Vector3(0.30, 0.62, 0.96),
      cloudCrest: new THREE.Vector3(1.28, 1.22, 1.20),
      cloudMid: new THREE.Vector3(1.05, 0.90, 0.84),
      cloudShadow: new THREE.Vector3(0.40, 0.55, 0.82),
      duskAmt: 0.0,
    },
    sunset: {
      sunDir: new THREE.Vector3(0.46, 0.24, -0.85).normalize(),
      skyZenith: new THREE.Vector3(0.11, 0.19, 0.52),
      skyMid: new THREE.Vector3(0.54, 0.39, 0.64),
      skyCyan: new THREE.Vector3(0.96, 0.60, 0.42),
      skyHorizon: new THREE.Vector3(1.06, 0.82, 0.54),
      mtnFar: new THREE.Vector3(0.82, 0.62, 0.60),
      mtnMid: new THREE.Vector3(0.54, 0.39, 0.55),
      mtnNear: new THREE.Vector3(0.30, 0.25, 0.46),
      sunKey: new THREE.Vector3(1.28, 0.86, 0.54),
      shadowCol: new THREE.Vector3(0.24, 0.28, 0.54),
      fogCol: new THREE.Vector3(0.88, 0.66, 0.52),
      cloudCrest: new THREE.Vector3(1.22, 0.88, 0.64),
      cloudMid: new THREE.Vector3(0.92, 0.64, 0.68),
      cloudShadow: new THREE.Vector3(0.36, 0.32, 0.56),
      duskAmt: 0.35,
    },
    dusk: {
      sunDir: new THREE.Vector3(0.36, 0.14, -0.92).normalize(),
      skyZenith: new THREE.Vector3(0.10, 0.17, 0.46),
      skyMid: new THREE.Vector3(0.22, 0.32, 0.62),
      skyCyan: new THREE.Vector3(0.62, 0.46, 0.66),
      skyHorizon: new THREE.Vector3(0.96, 0.62, 0.52),
      mtnFar: new THREE.Vector3(0.52, 0.42, 0.60),
      mtnMid: new THREE.Vector3(0.34, 0.32, 0.54),
      mtnNear: new THREE.Vector3(0.22, 0.25, 0.44),
      sunKey: new THREE.Vector3(1.05, 0.76, 0.62),
      shadowCol: new THREE.Vector3(0.24, 0.32, 0.56),
      fogCol: new THREE.Vector3(0.44, 0.44, 0.64),
      cloudCrest: new THREE.Vector3(1.00, 0.78, 0.80),
      cloudMid: new THREE.Vector3(0.66, 0.54, 0.70),
      cloudShadow: new THREE.Vector3(0.28, 0.32, 0.52),
      duskAmt: 1.0,
    },
  };

  const LSTATE = {
    sunDir: initialSunDir.clone(),
    skyZenith: PRESETS.noon.skyZenith.clone(),
    skyMid: PRESETS.noon.skyMid.clone(),
    skyCyan: PRESETS.noon.skyCyan.clone(),
    skyHorizon: PRESETS.noon.skyHorizon.clone(),
    mtnFar: PRESETS.noon.mtnFar.clone(),
    mtnMid: PRESETS.noon.mtnMid.clone(),
    mtnNear: PRESETS.noon.mtnNear.clone(),
    sunKey: PRESETS.noon.sunKey.clone(),
    shadowCol: PRESETS.noon.shadowCol.clone(),
    fogCol: PRESETS.noon.fogCol.clone(),
    cloudCrest: PRESETS.noon.cloudCrest.clone(),
    cloudMid: PRESETS.noon.cloudMid.clone(),
    cloudShadow: PRESETS.noon.cloudShadow.clone(),
    duskAmt: { value: 0.0 },
  };

  function applyLightingState(phase) {
    const p = Math.max(0, Math.min(1, phase));
    const a = p < 0.5 ? PRESETS.noon : PRESETS.sunset;
    const b = p < 0.5 ? PRESETS.sunset : PRESETS.dusk;
    const t = p < 0.5 ? p * 2.0 : (p - 0.5) * 2.0;

    LSTATE.sunDir.lerpVectors(a.sunDir, b.sunDir, t).normalize();
    LSTATE.skyZenith.lerpVectors(a.skyZenith, b.skyZenith, t);
    LSTATE.skyMid.lerpVectors(a.skyMid, b.skyMid, t);
    LSTATE.skyCyan.lerpVectors(a.skyCyan, b.skyCyan, t);
    LSTATE.skyHorizon.lerpVectors(a.skyHorizon, b.skyHorizon, t);
    LSTATE.mtnFar.lerpVectors(a.mtnFar, b.mtnFar, t);
    LSTATE.mtnMid.lerpVectors(a.mtnMid, b.mtnMid, t);
    LSTATE.mtnNear.lerpVectors(a.mtnNear, b.mtnNear, t);
    LSTATE.sunKey.lerpVectors(a.sunKey, b.sunKey, t);
    LSTATE.shadowCol.lerpVectors(a.shadowCol, b.shadowCol, t);
    LSTATE.fogCol.lerpVectors(a.fogCol, b.fogCol, t);
    LSTATE.cloudCrest.lerpVectors(a.cloudCrest, b.cloudCrest, t);
    LSTATE.cloudMid.lerpVectors(a.cloudMid, b.cloudMid, t);
    LSTATE.cloudShadow.lerpVectors(a.cloudShadow, b.cloudShadow, t);
    LSTATE.duskAmt.value = a.duskAmt + (b.duskAmt - a.duskAmt) * t;
  }
  applyLightingState(0.0);

  // === A. DYNAMIC SKY DOME WITH DIAGONAL CIRRUS STREAKS, FAR MOON & MOUNTAINS ===
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: LSTATE.sunDir },
      uZenith: { value: LSTATE.skyZenith },
      uMid: { value: LSTATE.skyMid },
      uCyan: { value: LSTATE.skyCyan },
      uHorizon: { value: LSTATE.skyHorizon },
      uCrestCol: { value: LSTATE.cloudCrest },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uSunDir;
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uCyan;
      uniform vec3 uHorizon;
      uniform vec3 uCrestCol;

      float skyHash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.45);
        return fract(p.x * p.y);
      }

      float skyNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x),
          mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      float skyFbm(vec2 p) {
        return 0.56 * skyNoise(p) + 0.29 * skyNoise(p * 2.13 + 7.1) + 0.15 * skyNoise(p * 4.37 - 3.9);
      }

      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uCyan, smoothstep(0.0, 0.11, h));
        col = mix(col, uMid, smoothstep(0.09, 0.34, h));
        col = mix(col, uZenith, smoothstep(0.30, 0.80, h));

        // High-altitude diagonal Ghibli cirrus streaks
        vec2 skyUv = vDir.xz / (h + 0.16);
        vec2 rotUv = vec2(skyUv.x * 0.80 - skyUv.y * 0.60, skyUv.x * 0.60 + skyUv.y * 0.80);
        float cA = skyFbm(rotUv * vec2(1.05, 4.4) + vec2(0.0, 2.3));
        float cB = skyFbm(rotUv * vec2(2.3, 7.8) - vec2(1.4, 0.7));
        float cirrus = smoothstep(0.55, 0.78, cA * 0.68 + cB * 0.32);
        float cirrusMask = smoothstep(0.06, 0.24, h) * (1.0 - smoothstep(0.68, 0.96, h));
        col = mix(col, mix(uHorizon, uCrestCol, 0.55), cirrus * cirrusMask * 0.68);

        float sunAmt = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += vec3(1.0, 0.90, 0.68) * pow(max(sunAmt, 0.0001), 5.0) * 0.18;
        col += vec3(1.12, 1.00, 0.82) * pow(max(sunAmt, 0.0001), 48.0) * 0.26;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1250, 32, 20), skyMat);
  scene.add(skyDome);

  function createMoonTexture() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(128, 128, 22, 128, 128, 120);
    grad.addColorStop(0.0, "rgba(255,254,248,1)");
    grad.addColorStop(0.85, "rgba(234,245,255,0.96)");
    grad.addColorStop(0.92, "rgba(205,232,255,0.22)");
    grad.addColorStop(1.0, "rgba(205,232,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 128, 122, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-atop";
    const craters = [
      [96, 92, 26], [154, 112, 19], [116, 152, 23], [148, 162, 13], [84, 134, 15], [134, 78, 12],
    ];
    for (const [x, y, r] of craters) {
      ctx.fillStyle = "rgba(150, 190, 228, 0.34)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const moonSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createMoonTexture(),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  moonSprite.scale.set(115, 115, 1);
  scene.add(moonSprite);

  const mountainRingMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uOffsetZ: { value: 0 },
      uColFar: { value: LSTATE.mtnFar },
      uColMid: { value: LSTATE.mtnMid },
      uColNear: { value: LSTATE.mtnNear },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOffsetZ;
      uniform vec3 uColFar;
      uniform vec3 uColMid;
      uniform vec3 uColNear;

      float ridge(float x, float freq, float phase) {
        return sin(x * freq + phase) * 0.5
             + sin(x * freq * 2.13 + phase * 1.7) * 0.3
             + cos(x * freq * 4.7 - phase * 0.9) * 0.2;
      }

      void main() {
        float a = vUv.x * 6.2831853 + uOffsetZ * 0.00018;
        float y = vUv.y;

        float hFar = 0.28 + ridge(a, 5.0, 0.4) * 0.14;
        float hMid = 0.22 + ridge(a, 7.0, 2.1) * 0.11;
        float hNear = 0.16 + ridge(a, 9.0, 4.3) * 0.09;

        vec3 col = vec3(0.0);
        float alpha = 0.0;

        if (y < hFar) { col = uColFar; alpha = 0.88; }
        if (y < hMid) { col = uColMid; alpha = 0.94; }
        if (y < hNear) { col = uColNear; alpha = 0.98; }
        if (alpha <= 0.01) discard;
        gl_FragColor = vec4(col, alpha * smoothstep(0.0, 0.08, y));
      }
    `,
  });
  const mountainRing = new THREE.Mesh(
    new THREE.CylinderGeometry(820, 820, 260, 72, 1, true),
    mountainRingMat
  );
  scene.add(mountainRing);

  // === B. DUAL-BIOME RIVER / ARCHIPELAGO TERRAIN & SLOPE HELPERS ===
  const WATER_Y = -1.55;

  function riverCenterX(wz) {
    return Math.sin(wz * 0.0085) * 44.0 + Math.sin(wz * 0.019) * 18.0;
  }

  function riverWidth(wz) {
    return 9.8 + Math.sin(wz * 0.023) * 3.6 + Math.cos(wz * 0.049) * 1.8;
  }

  function valleyTerrainHeight(wx, wz) {
    const rx = riverCenterX(wz);
    const rw = riverWidth(wz);
    const distR = Math.abs(wx - rx);
    const riverMask = Math.min(1.0, Math.max(0.0, (distR - rw * 0.76) / 17.5));
    const smoothMask = riverMask * riverMask * (3.0 - 2.0 * riverMask);

    const hills =
      Math.sin(wx * 0.024 + wz * 0.017) * 3.6 +
      Math.cos(wx * 0.046 - wz * 0.031) * 1.8 +
      Math.sin(wz * 0.013) * 1.8;

    const ridgeDist = Math.max(0.0, distR - 54.0);
    const crag =
      Math.sin(wx * 0.065 + wz * 0.055) * 3.8 +
      Math.cos(wx * 0.11 - wz * 0.08) * 1.9;
    const ridge = Math.pow(ridgeDist * 0.021, 1.52) * (30.0 + crag);

    const landElev = Math.max(2.6, 8.2 + hills) + ridge;
    return -3.65 + smoothMask * landElev;
  }

  function coastTerrainHeight(wx, wz) {
    const a = Math.sin(wx * 0.017 + 0.6) * Math.cos(wz * 0.015 - 0.4);
    const b = Math.sin(wx * 0.031 - wz * 0.027 + 1.2) * 0.55;
    const c = Math.cos(wx * 0.009 + wz * 0.011) * 0.45;
    const raw = a + b + c;
    const island = Math.max(0.0, raw - 0.52);
    const peak = Math.pow(island, 1.45) * 34.0;
    const shoal = Math.max(0.0, raw + 0.35) * 1.15;
    const outer = Math.max(0.0, Math.abs(wx) - 145.0) * 0.16;
    return -4.4 + shoal + peak + outer;
  }

  function terrainHeight(wx, wz) {
    return currentBiome === "coast" ? coastTerrainHeight(wx, wz) : valleyTerrainHeight(wx, wz);
  }

  function isOverWater(wx, wz) {
    if (currentBiome === "coast") return coastTerrainHeight(wx, wz) < WATER_Y - 0.1;
    return Math.abs(wx - riverCenterX(wz)) < riverWidth(wz) + 3.0;
  }

  function terrainSlope(wx, wz, d = 2.4) {
    const hx = (terrainHeight(wx + d, wz) - terrainHeight(wx - d, wz)) / (2 * d);
    const hz = (terrainHeight(wx, wz + d) - terrainHeight(wx, wz - d)) / (2 * d);
    return Math.hypot(hx, hz);
  }

  function groundedY(wx, wz, pad = 2.0, sink = 0.25) {
    return (
      Math.min(
        terrainHeight(wx, wz),
        terrainHeight(wx - pad, wz - pad),
        terrainHeight(wx + pad, wz - pad),
        terrainHeight(wx - pad, wz + pad),
        terrainHeight(wx + pad, wz + pad)
      ) - sink
    );
  }

  // === C. TERRAIN & SEABED SHADER ===
  const valleyTex = texLoader.load("./assets/valley-patchwork.png");
  valleyTex.wrapS = THREE.RepeatWrapping;
  valleyTex.wrapT = THREE.RepeatWrapping;
  valleyTex.colorSpace = THREE.NoColorSpace;
  valleyTex.anisotropy = 8;

  const valleyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIsCoast: uIsCoast,
      uSunDir: { value: LSTATE.sunDir },
      uSunKey: { value: LSTATE.sunKey },
      uShadowCol: { value: LSTATE.shadowCol },
      uFogCol: { value: LSTATE.fogCol },
      uCamPos: { value: new THREE.Vector3() },
      uValleyTex: { value: valleyTex },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      uniform float uTime;
      uniform float uIsCoast;
      uniform vec3 uSunDir;
      uniform vec3 uSunKey;
      uniform vec3 uShadowCol;
      uniform vec3 uFogCol;
      uniform vec3 uCamPos;
      uniform sampler2D uValleyTex;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.45);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float riverX(float z) {
        return sin(z * 0.0085) * 44.0 + sin(z * 0.019) * 18.0;
      }

      float riverW(float z) {
        return 9.8 + sin(z * 0.023) * 3.6 + cos(z * 0.049) * 1.8;
      }

      void main() {
        vec2 xz = vWorldPos.xz;
        float ndl = dot(normalize(vWorldNormal), normalize(uSunDir));
        float wrap = clamp((ndl + 0.32) / 1.32, 0.0, 1.0);
        float slope = 1.0 - clamp(vWorldNormal.y, 0.0, 1.0);

        float direct = smoothstep(-0.08, 0.42, ndl);
        float lightMix = mix(smoothstep(0.05, 0.90, wrap), direct, 0.58);

        vec3 litCol;
        if (uIsCoast > 0.5) {
          float gVar = noise2(xz * 0.045);
          vec3 islandGrass = mix(vec3(0.13, 0.42, 0.15), vec3(0.40, 0.68, 0.22), gVar);
          // dense forest canopy on the hillsides: dark/light clumps like tree crowns seen from afar
          float canopy = noise2(xz * 0.55) * 0.55 + noise2(xz * 1.35 + 9.0) * 0.30 + noise2(xz * 0.17) * 0.15;
          vec3 forestCol = mix(vec3(0.05, 0.27, 0.13), vec3(0.32, 0.62, 0.20), smoothstep(0.32, 0.72, canopy));
          islandGrass = mix(islandGrass, forestCol, smoothstep(0.15, 1.9, vWorldPos.y) * (1.0 - smoothstep(0.28, 0.44, slope)) * 0.95);
          vec3 sandCol = mix(vec3(0.96, 0.89, 0.67), vec3(0.88, 0.80, 0.58), noise2(xz * 0.32));
          vec3 cliffCol = mix(vec3(0.50, 0.48, 0.56), vec3(0.72, 0.60, 0.50), noise2(xz * 0.16));

          vec3 landCol = mix(sandCol, islandGrass, smoothstep(0.1, 1.8, vWorldPos.y));
          landCol = mix(landCol, cliffCol, smoothstep(0.20, 0.44, slope));
          litCol = landCol * mix(uShadowCol * 1.12, uSunKey, lightMix);
          litCol += vec3(0.09, 0.11, 0.02) * smoothstep(0.50, 0.95, ndl) * (1.0 - slope) * uSunKey.g;

          float subDepth = clamp((-1.45 - vWorldPos.y) / 2.6, 0.0, 1.0);
          if (subDepth > 0.001) {
            float kelp = smoothstep(0.45, 0.75, noise2(xz * 0.22));
            vec3 reefFloor = mix(sandCol, vec3(0.10, 0.42, 0.34), kelp * 0.45);
            reefFloor = mix(reefFloor, vec3(0.10, 0.55, 0.60) * uSunKey.b, smoothstep(0.0, 0.95, subDepth));
            float c1 = sin(xz.x * 1.85 + uTime * 1.35 + noise2(xz * 0.42 + uTime * 0.16) * 3.8);
            float c2 = cos(xz.y * 1.65 - uTime * 1.15 + noise2(xz * 0.36 - uTime * 0.14) * 3.5);
            float caustic = pow(clamp(1.0 - abs(c1 + c2) * 0.82, 0.0001, 1.0), 4.0);
            reefFloor += vec3(0.24, 0.44, 0.36) * caustic * (0.35 + 0.45 * subDepth) * uSunKey;
            litCol = mix(litCol, reefFloor, smoothstep(0.0, 0.25, subDepth));
          }
        } else {
          float rx = riverX(xz.y);
          float rw = riverW(xz.y);
          float distR = abs(xz.x - rx) + (noise2(xz * 0.085) - 0.5) * 2.8;

          vec2 uv1 = xz * 0.0095;
          vec2 rotXz = vec2(xz.x * 0.866 - xz.y * 0.5, xz.x * 0.5 + xz.y * 0.866);
          vec2 uv2 = rotXz * 0.0052 + vec2(0.37, 0.71);
          float texBlend = noise2(xz * 0.014);
          vec3 painted = mix(texture2D(uValleyTex, uv1).rgb, texture2D(uValleyTex, uv2).rgb, texBlend * 0.65);

          float lum = dot(painted, vec3(0.299, 0.587, 0.114));
          painted = mix(vec3(lum), painted, 1.18) * vec3(1.05, 1.02, 0.94);

          vec3 cliffCol = mix(vec3(0.28, 0.42, 0.37), vec3(0.48, 0.53, 0.43), noise2(xz * 0.14));
          vec3 baseCol = mix(painted, cliffCol, smoothstep(0.26, 0.52, slope));
          litCol = baseCol * mix(uShadowCol * 1.12, uSunKey, lightMix);
          litCol += vec3(0.09, 0.11, 0.02) * smoothstep(0.50, 0.95, ndl) * (1.0 - slope) * uSunKey.g;

          float bankSand = 1.0 - smoothstep(rw - 0.6, rw + 2.4, distR);
          vec3 warmSand = mix(vec3(0.86, 0.80, 0.56), vec3(0.75, 0.71, 0.50), noise2(xz * 0.35)) * (uSunKey * 0.9);
          litCol = mix(litCol, warmSand, bankSand * 0.86);

          float inRiver = 1.0 - smoothstep(rw - 0.5, rw + 2.2, distR);
          float subDepth = clamp((-1.45 - vWorldPos.y) / 2.2, 0.0, 1.0) * inRiver;
          if (subDepth > 0.001) {
            vec3 bedAqua = mix(warmSand, vec3(0.16, 0.50, 0.58) * uSunKey.b, smoothstep(0.0, 0.78, subDepth));
            float c1 = sin(xz.x * 1.85 + uTime * 1.35 + noise2(xz * 0.42 + uTime * 0.16) * 3.8);
            float c2 = cos(xz.y * 1.65 - uTime * 1.15 + noise2(xz * 0.36 - uTime * 0.14) * 3.5);
            float caustic = pow(clamp(1.0 - abs(c1 + c2) * 0.82, 0.0001, 1.0), 4.0);
            bedAqua += vec3(0.26, 0.42, 0.38) * caustic * (0.30 + 0.40 * subDepth) * uSunKey;
            litCol = mix(litCol, bedAqua, smoothstep(0.0, 0.25, subDepth));
          }
        }

        float cShadowNoise = noise2(xz * 0.0105 + vec2(uTime * 0.020, -uTime * 0.013));
        float cloudShadow = smoothstep(0.55, 0.74, cShadowNoise);
        litCol = mix(litCol, litCol * vec3(0.46, 0.68, 0.90), cloudShadow * 0.55);

        float distCam = length(vWorldPos - uCamPos);
        float fogFactor = smoothstep(90.0, 640.0, distCam);
        gl_FragColor = vec4(mix(litCol, uFogCol, fogFactor), 1.0);
      }
    `,
  });

  // === C2. DUAL-BIOME TRANSLUCENT EMERALD-CYAN WATER SURFACE ===
  const ghibliWaterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uIsCoast: uIsCoast,
      uSunDir: { value: LSTATE.sunDir },
      uSunKey: { value: LSTATE.sunKey },
      uSkyHorizon: { value: LSTATE.skyHorizon },
      uSkyCyan: { value: LSTATE.skyCyan },
      uFogCol: { value: LSTATE.fogCol },
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.42 + uTime * 1.9) * cos(wp.z * 0.31 - uTime * 1.5) * 0.07;
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform float uIsCoast;
      uniform vec3 uSunDir;
      uniform vec3 uSunKey;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSkyCyan;
      uniform vec3 uFogCol;
      uniform vec3 uCamPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.45);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float riverX(float z) {
        return sin(z * 0.0085) * 44.0 + sin(z * 0.019) * 18.0;
      }

      float riverW(float z) {
        return 9.8 + sin(z * 0.023) * 3.6 + cos(z * 0.049) * 1.8;
      }

      float coastBedH(vec2 p) {
        float a = sin(p.x * 0.017 + 0.6) * cos(p.y * 0.015 - 0.4);
        float b = sin(p.x * 0.031 - p.y * 0.027 + 1.2) * 0.55;
        float c = cos(p.x * 0.009 + p.y * 0.011) * 0.45;
        float raw = a + b + c;
        float island = max(raw - 0.52, 0.0001);
        float peak = pow(island, 1.45) * 26.0 * step(0.52, raw);
        float shoal = max(raw + 0.35, 0.0) * 1.15;
        float outer = max(abs(p.x) - 145.0, 0.0) * 0.16;
        return -4.4 + shoal + peak + outer;
      }

      void main() {
        vec2 xz = vWorldPos.xz;
        float r1 = noise2(vec2(xz.x * 0.45 + uTime * 0.25, xz.y * 0.35 - uTime * 0.95));
        float r2 = noise2(vec2(xz.x * 0.92 - uTime * 0.30, xz.y * 0.72 - uTime * 1.35));
        vec3 N = normalize(vec3((r1 - 0.5) * 0.24 + (r2 - 0.5) * 0.16, 1.0, (r2 - 0.5) * 0.26));
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        vec3 H = normalize(L + V);

        float bankFeather = 1.0;
        float depth = 0.6;
        float shoreFoam = 0.0;

        if (uIsCoast > 0.5) {
          float wDepth = -1.55 - coastBedH(xz);
          if (wDepth <= -0.05) discard;
          bankFeather = smoothstep(-0.04, 0.28, wDepth);
          depth = clamp(wDepth / 5.2, 0.0, 1.0);
          shoreFoam = smoothstep(0.68, 0.04, wDepth) * bankFeather * (0.45 + 0.55 * r2);
        } else {
          float rx = riverX(xz.y);
          float rw = riverW(xz.y);
          float distR = abs(xz.x - rx) + (noise2(xz * 0.085) - 0.5) * 2.4;
          if (distR > rw + 1.8) discard;
          bankFeather = 1.0 - smoothstep(rw - 1.2, rw + 1.0, distR);
          depth = clamp(1.0 - smoothstep(rw * 0.25, rw + 0.6, distR), 0.0, 1.0);
          shoreFoam = smoothstep(rw - 1.25, rw - 0.15, distR) * bankFeather * (0.45 + 0.55 * r2);
        }

        // Rich emerald shallows -> vivid cyan mid -> deep coastal cerulean
        vec3 emeraldShallow = mix(vec3(0.04, 0.78, 0.62), vec3(0.46, 0.96, 0.84), uIsCoast) * mix(vec3(1.0), uSunKey, 0.55);
        vec3 vividCyan      = mix(vec3(0.04, 0.64, 0.86), vec3(0.12, 0.82, 0.80), uIsCoast) * mix(vec3(1.0), uSunKey, 0.50);
        vec3 deepCerulean   = mix(vec3(0.015, 0.34, 0.68), vec3(0.05, 0.54, 0.74), uIsCoast) * mix(vec3(1.0), uSunKey, 0.45);
        vec3 waterCol = mix(emeraldShallow, vividCyan, smoothstep(0.08, 0.45, depth));
        waterCol = mix(waterCol, deepCerulean, smoothstep(0.45, 0.95, depth));

        float fresnel = pow(max(1.0 - max(dot(N, V), 0.0), 0.0001), 3.2);
        vec3 skyRefl = mix(uSkyCyan, uSkyHorizon, smoothstep(0.45, 0.85, r1));
        waterCol = mix(waterCol, skyRefl, fresnel * 0.64);

        float spec = pow(max(dot(N, H), 0.0001), 72.0);
        float crestSpark = smoothstep(0.62, 0.82, r1 * r2) * 0.35;
        waterCol += uSunKey * (1.45 * spec + crestSpark);

        waterCol = mix(waterCol, mix(vec3(0.98, 1.0, 1.0), uSkyHorizon, 0.35), shoreFoam * 0.64);

        float alpha = mix(0.42, 0.84, depth) * bankFeather;
        alpha = max(alpha, max(shoreFoam * 0.88, clamp(spec * 1.5, 0.0, 0.95) * bankFeather));

        float distCam = length(vWorldPos - uCamPos);
        float fogFactor = smoothstep(90.0, 640.0, distCam);
        gl_FragColor = vec4(mix(waterCol, uFogCol, fogFactor), alpha);
      }
    `,
  });

  // === D. UNIFIED GHIBLI BUILDING (WITH DUSK WINDOW GLOW), TREE & CLIFF ROCK SHADERS ===
  const ghibliBuildingMat = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: LSTATE.sunDir },
      uSunKey: { value: LSTATE.sunKey },
      uShadowCol: { value: LSTATE.shadowCol },
      uFogCol: { value: LSTATE.fogCol },
      uDuskAmt: LSTATE.duskAmt,
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vColor;
      varying float vLocalY;
      void main() {
        vLocalY = position.y;
        #if defined(USE_COLOR_ALPHA) || defined(USE_COLOR)
          vColor = color.rgb;
        #else
          vColor = vec3(0.78, 0.74, 0.66);
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
      varying float vLocalY;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunKey;
      uniform vec3 uShadowCol;
      uniform vec3 uFogCol;
      uniform float uDuskAmt;
      uniform vec3 uCamPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.45);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec3 baseCol = pow(max(vColor, vec3(0.0001)), vec3(1.0 / 2.2));
        float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
        baseCol = mix(vec3(lum), baseCol, 1.16) * vec3(1.05, 1.01, 0.94);

        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 H = normalize(L + V);
        float ndl = dot(N, L);
        float wrap = clamp((ndl + 0.25) / 1.25, 0.0, 1.0);
        float lightMix = mix(smoothstep(0.06, 0.84, wrap), smoothstep(-0.06, 0.36, ndl), 0.62);
        // warm lavender shade instead of the deep sky-blue shadow, so roofs and walls keep their colour
        vec3 shadeTint = mix(uShadowCol, vec3(0.70, 0.64, 0.72), 0.62) * 1.08;
        vec3 litCol = baseCol * mix(shadeTint, uSunKey, lightMix);
        litCol += uSunKey * (0.08 * pow(max(ndl, 0.0001), 3.0) + 0.16 * pow(max(dot(N, H), 0.0001), 24.0));

        vec3 groundBounce = mix(vec3(0.82, 0.84, 0.82), vec3(1.0), smoothstep(-0.2, 1.2, vLocalY));
        litCol *= groundBounce;

        float isWallFace = 1.0 - smoothstep(0.35, 0.72, abs(vWorldNormal.y));
        float isWindowShade = (1.0 - smoothstep(0.14, 0.36, lum)) * smoothstep(0.6, 1.4, vLocalY);
        litCol += vec3(1.22, 0.82, 0.34) * isWallFace * isWindowShade * uDuskAmt * 0.95;

        float cShadowNoise = noise2(vWorldPos.xz * 0.0105 + vec2(uTime * 0.020, -uTime * 0.013));
        float cloudShadow = smoothstep(0.55, 0.74, cShadowNoise);
        litCol = mix(litCol, litCol * (uShadowCol * 1.18), cloudShadow * 0.42);

        float distCam = length(vWorldPos - uCamPos);
        float fogFactor = smoothstep(90.0, 640.0, distCam);
        gl_FragColor = vec4(mix(litCol, uFogCol, fogFactor), 1.0);
      }
    `,
  });

  const ghibliInstancedTreeMat = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: LSTATE.sunDir },
      uSunKey: { value: LSTATE.sunKey },
      uShadowCol: { value: LSTATE.shadowCol },
      uFogCol: { value: LSTATE.fogCol },
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vColor;
      varying float vLocalY;

      void main() {
        vLocalY = position.y;
        #if defined(USE_COLOR_ALPHA) || defined(USE_COLOR)
          vColor = color.rgb;
        #else
          vColor = vec3(0.42, 0.68, 0.32);
        #endif

        mat4 instMat = mat4(1.0);
        #ifdef USE_INSTANCING
          instMat = instanceMatrix;
        #endif

        vec3 pos = position;
        float sway = smoothstep(0.4, 2.4, pos.y) * sin(uTime * 1.6 + instMat[3].x * 0.15 + instMat[3].z * 0.12) * 0.08;
        pos.x += sway;
        pos.z += sway * 0.6;

        vec4 wp = modelMatrix * instMat * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * mat3(instMat) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vColor;
      varying float vLocalY;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunKey;
      uniform vec3 uShadowCol;
      uniform vec3 uFogCol;
      uniform vec3 uCamPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.45);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(uCamPos - vWorldPos);

        vec3 baseCol = pow(max(vColor, vec3(0.0001)), vec3(1.0 / 2.2));
        float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
        baseCol = mix(vec3(lum), baseCol, 1.18) * vec3(1.04, 1.02, 0.93);

        float isFoliage = smoothstep(0.03, 0.14, baseCol.g - baseCol.b) * smoothstep(0.35, 1.2, vLocalY);
        float ndl = dot(N, L);
        float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
        float lightMix = mix(smoothstep(0.08, 0.85, wrap), smoothstep(-0.08, 0.42, ndl), 0.55);
        vec3 coolShadow = uShadowCol * vec3(0.55, 0.90, 0.82);
        vec3 litCol = baseCol * mix(coolShadow, uSunKey * 1.08, lightMix);

        float sssBack = pow(clamp(dot(V, -L), 0.0001, 1.0), 3.0) * 0.48;
        float sssTop = smoothstep(0.35, 0.95, ndl) * smoothstep(0.4, 2.2, vLocalY);
        litCol += vec3(0.34, 0.38, 0.04) * uSunKey * isFoliage * (sssTop * 0.78 + sssBack);
        litCol += vec3(0.16, 0.12, 0.09) * uSunKey * (1.0 - isFoliage) * smoothstep(0.6, 2.0, vLocalY) * sssTop;

        float baseAo = mix(0.76, 1.0, smoothstep(0.0, 1.2, vLocalY));
        litCol *= baseAo;

        float cShadowNoise = noise2(vWorldPos.xz * 0.0105 + vec2(uTime * 0.020, -uTime * 0.013));
        float cloudShadow = smoothstep(0.55, 0.74, cShadowNoise);
        litCol = mix(litCol, litCol * (uShadowCol * 1.18), cloudShadow * 0.42);

        float distCam = length(vWorldPos - uCamPos);
        float fogFactor = smoothstep(90.0, 640.0, distCam);
        gl_FragColor = vec4(mix(litCol, uFogCol, fogFactor), 1.0);
      }
    `,
  });

  const ghibliCliffRockMat = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: LSTATE.sunDir },
      uSunKey: { value: LSTATE.sunKey },
      uShadowCol: { value: LSTATE.shadowCol },
      uFogCol: { value: LSTATE.fogCol },
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vColor;
      varying float vLocalY;
      void main() {
        vLocalY = position.y;
        #if defined(USE_COLOR_ALPHA) || defined(USE_COLOR)
          vColor = color.rgb;
        #else
          vColor = vec3(0.42, 0.46, 0.45);
        #endif
        mat4 instMat = mat4(1.0);
        #ifdef USE_INSTANCING
          instMat = instanceMatrix;
        #endif
        vec4 wp = modelMatrix * instMat * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * mat3(instMat) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vColor;
      varying float vLocalY;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunKey;
      uniform vec3 uShadowCol;
      uniform vec3 uFogCol;
      uniform vec3 uCamPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.45);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        vec3 baseCol = pow(max(vColor, vec3(0.0001)), vec3(1.0 / 2.2));

        float strata = noise2(vec2(vWorldPos.x * 0.45 + vWorldPos.z * 0.45, vWorldPos.y * 0.85));
        float detail = noise2(vWorldPos.xz * 1.1 + vWorldPos.y * 0.5);
        baseCol *= 0.88 + strata * 0.16 + detail * 0.10;

        float ndl = dot(N, L);
        float wrap = clamp((ndl + 0.25) / 1.25, 0.0, 1.0);
        vec3 litCol = baseCol * mix(uShadowCol * 0.82, uSunKey * 0.96, smoothstep(0.08, 0.85, wrap));

        float isMoss = smoothstep(0.50, 0.82, N.y);
        litCol += vec3(0.10, 0.13, 0.02) * uSunKey * isMoss * smoothstep(0.25, 0.90, ndl);

        float wetMask = 1.0 - smoothstep(-1.65, -0.75, vWorldPos.y);
        litCol = mix(litCol, litCol * vec3(0.56, 0.72, 0.78), wetMask * 0.55);

        float distCam = length(vWorldPos - uCamPos);
        float fogFactor = smoothstep(90.0, 640.0, distCam);
        gl_FragColor = vec4(mix(litCol, uFogCol, fogFactor), 1.0);
      }
    `,
  });

  function rockHash3(x, y, z, seed) {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.3) * 43758.5453;
    return h - Math.floor(h);
  }
  function rockNoise3(x, y, z, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);
    const lerp = (a, b, t) => a + (b - a) * t;
    return lerp(
      lerp(
        lerp(rockHash3(ix, iy, iz, seed), rockHash3(ix + 1, iy, iz, seed), ux),
        lerp(rockHash3(ix, iy + 1, iz, seed), rockHash3(ix + 1, iy + 1, iz, seed), ux),
        uy
      ),
      lerp(
        lerp(rockHash3(ix, iy, iz + 1, seed), rockHash3(ix + 1, iy, iz + 1, seed), ux),
        lerp(rockHash3(ix, iy + 1, iz + 1, seed), rockHash3(ix + 1, iy + 1, iz + 1, seed), ux),
        uy
      ),
      uz
    );
  }

  function buildCliffRockGeo(seed, tallness = 1.45) {
    const geo = new THREE.IcosahedronGeometry(1, 5);
    const pos = geo.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);

      const n1 = rockNoise3(vx * 2.4 + seed, vy * 1.4, vz * 2.4 - seed, seed);
      const n2 = rockNoise3(vx * 5.1, vy * 3.8, vz * 5.1, seed + 7);
      const n3 = rockNoise3(vx * 11.0, vy * 7.5, vz * 11.0, seed + 13);
      const flutes = 0.84 + n1 * 0.42 + (n2 - 0.5) * 0.22 + (n3 - 0.5) * 0.07;

      const yT = vy * 0.5 + 0.5;
      const taper = 1.15 - yT * 0.36;
      const x = vx * flutes * taper;
      const z = vz * flutes * taper;
      let y = yT * tallness * (0.86 + n1 * 0.28);
      if (yT > 0.78) y = tallness * 0.78 + (y - tallness * 0.78) * 0.35;

      pos.setXYZ(i, x, y, z);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) - minY - 0.75);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const norm = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const cRock = new THREE.Color().setRGB(0.48, 0.51, 0.49, THREE.SRGBColorSpace);
    const cDark = new THREE.Color().setRGB(0.30, 0.35, 0.38, THREE.SRGBColorSpace);
    const cMoss = new THREE.Color().setRGB(0.33, 0.55, 0.24, THREE.SRGBColorSpace);
    const tmpCol = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const ny = norm.getY(i);
      const yNorm = Math.max(0, Math.min(1, (pos.getY(i) + 0.75) / Math.max(0.1, maxY - minY)));
      const mossMix = Math.max(0, Math.min(1, (ny - 0.44) * 2.5)) * (0.4 + 0.6 * yNorm);
      tmpCol.copy(cDark).lerp(cRock, Math.min(1, 0.35 + yNorm * 0.65)).lerp(cMoss, mossMix);
      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.userData.topY = maxY - minY - 0.75;
    return geo;
  }

  const cliffGeos = [
    buildCliffRockGeo(3.1, 1.55),
    buildCliffRockGeo(11.7, 1.35),
    buildCliffRockGeo(23.4, 1.75),
  ];

  // === D2. HERO STONE ARCH BRIDGE & ANIMATED RED GHIBLI TRAWLER BOATS ===
  const bridgeLanternGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const bridgeLanternMat = new THREE.MeshBasicMaterial({ color: "#ffe58c" });

  let bridgeTemplate = null;

  function createStoneArchBridge() {
    const g = new THREE.Group();
    if (bridgeTemplate) g.add(bridgeTemplate.clone());
    for (const i of [1, 4, 7]) {
      const t = (i / 8) * 2 - 1;
      const x = t * 15.2;
      const archY = 14.8 - t * t * 3.4;
      for (const zSign of [-1, 1]) {
        const lant = new THREE.Mesh(bridgeLanternGeo, bridgeLanternMat);
        lant.position.set(x, archY + 2.85, zSign * 2.75);
        g.add(lant);
      }
    }
    return g;
  }

  // Animated 3D Red Ghibli Fishing Trawler Boats with foaming white wakes
  const wakeRibbonGeo = new THREE.PlaneGeometry(0.9, 10.5);
  wakeRibbonGeo.rotateX(-Math.PI / 2);

  function createTrawlerBoat() {
    const g = new THREE.Group();
    const mastLant = new THREE.Mesh(bridgeLanternGeo, bridgeLanternMat);
    mastLant.scale.setScalar(0.55);
    mastLant.position.set(0, 6.3, -0.35);

    const wakeMatL = new THREE.MeshBasicMaterial({ color: "#f6feff", transparent: true, opacity: 0.42, depthWrite: false });
    const wakeL = new THREE.Mesh(wakeRibbonGeo, wakeMatL);
    wakeL.position.set(-1.35, 0.08, 7.6);
    wakeL.rotation.y = 0.18;
    const wakeR = new THREE.Mesh(wakeRibbonGeo, wakeMatL);
    wakeR.position.set(1.35, 0.08, 7.6);
    wakeR.rotation.y = -0.18;

    g.add(mastLant, wakeL, wakeR);
    return g;
  }

  const TRAWLER_COUNT = 7;
  const trawlerBoats = [];
  for (let i = 0; i < TRAWLER_COUNT; i++) {
    const mesh = createTrawlerBoat();
    scene.add(mesh);
    trawlerBoats.push({
      mesh,
      x: (Math.random() - 0.5) * 90,
      z: -35 - i * 68,
      speed: 2.0 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      scale: 0.92 + Math.random() * 0.24,
    });
  }

  function placeBoatInOpenWater(b, zTarget) {
    b.z = zTarget;
    if (currentBiome === "valley") {
      b.x = riverCenterX(b.z) + (Math.random() - 0.5) * riverWidth(b.z) * 0.4;
      return;
    }
    // Coast biome: pick an open sea coordinate far from islands
    let bestX = 0;
    let lowestY = 999;
    for (let t = 0; t < 10; t++) {
      const candX = (Math.random() - 0.5) * 180;
      const h = coastTerrainHeight(candX, b.z);
      if (h < WATER_Y - 1.35) {
        b.x = candX;
        return;
      }
      if (h < lowestY) { lowestY = h; bestX = candX; }
    }
    b.x = bestX;
  }

  // Delivery Beacon & Smoke Helpers
  function createSmokeTexture() {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 96;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(48, 48, 6, 48, 48, 46);
    grad.addColorStop(0.0, "rgba(255,250,242,0.75)");
    grad.addColorStop(0.55, "rgba(245,248,255,0.28)");
    grad.addColorStop(1.0, "rgba(245,248,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(48, 48, 46, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const smokeTex = createSmokeTexture();

  const beaconRingGeo = new THREE.TorusGeometry(4.8, 0.24, 8, 28);
  beaconRingGeo.rotateX(Math.PI / 2);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: "#ffe27d",
    transparent: true,
    opacity: 0.85,
  });

  // === E. LOAD BUILDING & TREE GLBs + NORMALIZED PIVOTS + ANTI-CLIPPING SPAWNER ===
  const gltfLoader = new GLTFLoader();
  const buildingUrls = {
    kura: "./assets/models/kura-storehouse.glb",
    twoStory: "./assets/models/two-story-house.glb",
    pump: "./assets/models/water-pump-house.glb",
    tupa: "./assets/models/tupa-stone-tower.glb",
    market: "./assets/models/market-drum-tower.glb",
    pillar: "./assets/models/que-pillar-tower.glb",
    corner: "./assets/models/wall-corner-tower.glb",
    lighthouse: "./assets/models/lighthouse-cottage.glb",
  };
  const treeUrls = {
    sacredOak: "./assets/models/trees/leafy-oak.glb",
    cherry: "./assets/models/trees/leafy-round.glb",
    peach: "./assets/models/trees/leafy-tall.glb",
    bush: "./assets/models/trees/leafy-bush.glb",
  };
  const buildingTemplates = {};
  // Beach set pieces modelled in Blender (tools/blender/make_coast_assets.py)
  const coastUrls = {
    houses: ["a", "b", "c", "d"].map((k) => `./assets/models/coast/coast-house-${k}.glb`),
    rocks: ["a", "b"].map((k) => `./assets/models/coast/coast-rock-${k}.glb`),
    boats: ["a", "b", "c"].map((k) => `./assets/models/coast/coast-boat-${k}.glb`),
    pier: "./assets/models/coast/coast-pier.glb",
  };
  const coastTemplates = { houses: [], rocks: [], boats: [], pier: null };
  const valleyHouseUrls = ["a", "b", "c", "d"].map((k) => `./assets/models/valley/valley-house-${k}.glb`);
  const propUrls = {
    bridge: "./assets/models/props/stone-bridge.glb",
    trawler: "./assets/models/props/trawler.glb",
  };

  function prepareCoastModel(root) {
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = ghibliBuildingMat;
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    root.userData.radius = Math.hypot(size.x, size.z) * 0.38;
    root.userData.height = size.y;
    return root;
  }

  function loadCoastModel(url, assign) {
    return new Promise((resolve) => {
      gltfLoader.load(url, (gltf) => { assign(prepareCoastModel(gltf.scene)); resolve(); }, undefined, () => resolve());
    });
  }

  const buildingMetrics = {};
  const treeTemplates = {};
  const treeMetrics = {};

  function prepareBuildingTemplate(root, key) {
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = ghibliBuildingMat;
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const wrap = new THREE.Group();
    root.position.set(-center.x, -box.min.y, -center.z);
    wrap.add(root);

    const plinthGeo = new THREE.BoxGeometry(size.x * 1.04, 1.9, size.z * 1.04);
    const pCount = plinthGeo.attributes.position.count;
    const pCol = new Float32Array(pCount * 3);
    const stoneLin = new THREE.Color().setRGB(0.56, 0.56, 0.52, THREE.SRGBColorSpace);
    for (let i = 0; i < pCount; i++) {
      pCol[i * 3] = stoneLin.r;
      pCol[i * 3 + 1] = stoneLin.g;
      pCol[i * 3 + 2] = stoneLin.b;
    }
    plinthGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    const plinth = new THREE.Mesh(plinthGeo, ghibliBuildingMat);
    plinth.position.y = -0.92;
    plinth.receiveShadow = true;
    wrap.add(plinth);

    buildingMetrics[key] = {
      radius: Math.max(1.8, Math.hypot(size.x, size.z) * 0.52),
      height: size.y,
    };
    return wrap;
  }

  // Crown cards are flat quads; point their normals away from the crown centre so the whole
  // crown shades like one soft ball instead of a pile of flat cards.
  function smoothCrownNormals(geo) {
    geo.computeBoundingBox();
    const center = geo.boundingBox.getCenter(new THREE.Vector3());
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      n.set(pos.getX(i) - center.x, (pos.getY(i) - center.y) * 0.8 + 0.12, pos.getZ(i) - center.z).normalize();
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    nor.needsUpdate = true;
  }

  function extractTreeGeometries(root, key) {
    root.updateMatrixWorld(true);
    const geoms = [];
    const totalBox = new THREE.Box3();
    root.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const g = obj.geometry.clone();
        g.applyMatrix4(obj.matrixWorld);
        g.userData = { leaf: /crown/i.test(obj.name) };
        g.computeBoundingBox();
        totalBox.union(g.boundingBox);
        geoms.push(g);
      }
    });
    const shiftY = Number.isFinite(totalBox.min.y) ? -totalBox.min.y : 0;
    const size = new THREE.Vector3();
    totalBox.getSize(size);
    for (const g of geoms) {
      g.translate(0, shiftY, 0);
      if (g.userData.leaf) smoothCrownNormals(g);
    }
    treeMetrics[key] = {
      radius: Math.max(1.2, Math.hypot(size.x, size.z) * 0.42),
      height: size.y,
    };
    return geoms;
  }

  const CHUNK_W = 560;
  const CHUNK_LEN = 220;
  const NUM_CHUNKS = 4;
  const SEG_X = 96;
  const SEG_Z = 48;

  const terrainChunks = [];
  const waterChunks = [];
  const propsPerChunk = [];
  const chunkObstacles = Array.from({ length: NUM_CHUNKS }, () => []);
  const chunkDeliveries = Array.from({ length: NUM_CHUNKS }, () => []);
  const chunkBridges = Array.from({ length: NUM_CHUNKS }, () => []);
  const deliveredIds = new Set();
  const clearedBridgeIds = new Set();

  const houseBodyGeo = new THREE.BoxGeometry(3.4, 2.3, 2.7);
  const houseRoofGeo = new THREE.ConeGeometry(2.7, 1.9, 4);
  const treeFallbackTrunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 2.0, 6);
  const treeFallbackCrownGeo = new THREE.SphereGeometry(1.7, 8, 6);

  function hasOverlap(obstacles, x, z, r, gap = 1.6) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const dx = x - o.x;
      const dz = z - o.z;
      const minDist = r + o.r + gap;
      if (dx * dx + dz * dz < minDist * minDist) return true;
    }
    return false;
  }

  function spawnBuilding(propGroup, obstacles, key, wx, wz, ry, scale, fixedY = null) {
    const tpl = buildingTemplates[key];
    if (!tpl) return null;
    const m = buildingMetrics[key] || { radius: 2.8, height: 6.5 };
    const r = m.radius * scale;
    const wy = fixedY !== null ? fixedY : terrainHeight(wx, wz) + 0.12;
    const inst = tpl.clone();
    inst.position.set(wx, wy, wz);
    inst.rotation.y = ry;
    inst.scale.setScalar(scale);
    propGroup.add(inst);
    const topY = wy + m.height * scale;
    obstacles.push({ x: wx, z: wz, r, topY, solid: true });
    return { x: wx, y: wy, z: wz, topY };
  }

  function placeCoastModel(propGroup, obstacles, template, wx, wz, ry, { solid = false, scale = 1 } = {}) {
    const inst = template.clone();
    const radius = template.userData.radius * scale;
    const wy = groundedY(wx, wz, radius * 0.7, 0.3);
    inst.position.set(wx, wy, wz);
    inst.rotation.y = ry;
    inst.scale.setScalar(scale);
    propGroup.add(inst);
    const topY = wy + template.userData.height * scale;
    obstacles.push({ x: wx, z: wz, r: radius, topY, solid });
    return { x: wx, y: wy, z: wz, topY };
  }

  function addDeliveryTarget(propGroup, deliveries, id, name, x, y, z, topY) {
    const isDone = deliveredIds.has(id);
    const ring = new THREE.Mesh(beaconRingGeo, beaconMat.clone());
    ring.position.set(x, topY + 6.5, z);
    ring.visible = !isDone;
    propGroup.add(ring);

    const smokePuffs = [];
    for (let s = 0; s < 3; s++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: smokeTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.25,
        })
      );
      sp.position.set(x + 0.6, topY + 0.6 + s * 2.2, z);
      sp.scale.setScalar(1.4 + s * 0.6);
      propGroup.add(sp);
      smokePuffs.push({ sp, offset: s * 0.33 });
    }

    deliveries.push({
      id,
      name,
      x,
      y,
      z,
      topY,
      delivered: isDone,
      ring,
      baseRingY: topY + 6.5,
      smokePuffs,
    });
  }

  // Leaf-clump atlas (2x2 cells), painted once at start-up: serrated blobs of overlapping leaves,
  // dark at the bottom and bright at the top, alpha-cut at the edge.
  function createLeafAtlas() {
    const S = 512;
    const cell = S / 2;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const ctx = c.getContext("2d");
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const tones = ["#2a6a30", "#3b8434", "#55a036", "#79bd3f", "#a3d64c", "#c8e96a"];
    for (let cy = 0; cy < 2; cy++) {
      for (let cx = 0; cx < 2; cx++) {
        const ox = cx * cell + cell / 2;
        const oy = cy * cell + cell / 2;
        const lobes = 5 + Math.floor(rnd() * 3);
        const phase = rnd() * Math.PI * 2;
        const rad = (a) => cell * 0.37 * (0.84 + 0.16 * Math.sin(a * lobes + phase) + 0.07 * Math.sin(a * lobes * 2.3));
        ctx.fillStyle = tones[0];
        ctx.beginPath();
        for (let k = 0; k <= 48; k++) {
          const a = (k / 48) * Math.PI * 2;
          const r = rad(a) * 0.88;
          ctx[k === 0 ? "moveTo" : "lineTo"](ox + Math.cos(a) * r, oy + Math.sin(a) * r * 0.92);
        }
        ctx.fill();
        const leaves = [];
        for (let i = 0; i < 190; i++) {
          const a = rnd() * Math.PI * 2;
          const r = Math.sqrt(rnd()) * rad(a);
          const x = ox + Math.cos(a) * r;
          const y = oy + Math.sin(a) * r * 0.92;
          const up = 1 - (y - (oy - cell / 2)) / cell;
          const t = Math.max(0, Math.min(5, Math.floor((up * 0.7 + rnd() * 0.42 - (x - ox) / cell * 0.1 + 0.06) * 6)));
          leaves.push({ x, y, t, len: 15 + rnd() * 15, rot: rnd() * Math.PI * 2 });
        }
        leaves.sort((p, q) => p.t - q.t);
        for (const lf of leaves) {
          ctx.save();
          ctx.translate(lf.x, lf.y);
          ctx.rotate(lf.rot);
          ctx.fillStyle = tones[lf.t];
          ctx.beginPath();
          ctx.moveTo(-lf.len / 2, 0);
          ctx.quadraticCurveTo(0, -lf.len * 0.5, lf.len / 2, 0);
          ctx.quadraticCurveTo(0, lf.len * 0.5, -lf.len / 2, 0);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace; // painted in display colours, the shader works in display space
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }
  const leafAtlas = createLeafAtlas();

  const ghibliLeafMat = new THREE.ShaderMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: leafAtlas },
      uSunDir: { value: LSTATE.sunDir },
      uSunKey: { value: LSTATE.sunKey },
      uShadowCol: { value: LSTATE.shadowCol },
      uFogCol: { value: LSTATE.fogCol },
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vShade;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        #if defined(USE_COLOR_ALPHA) || defined(USE_COLOR)
          vShade = color.r;
        #else
          vShade = 1.0;
        #endif
        mat4 instMat = mat4(1.0);
        #ifdef USE_INSTANCING
          instMat = instanceMatrix;
        #endif
        vec3 pos = position;
        float flutter = sin(uTime * 1.7 + instMat[3].x * 0.17 + instMat[3].z * 0.13 + position.y * 1.3);
        float amt = smoothstep(0.6, 4.0, position.y) * 0.07;
        pos.x += flutter * amt;
        pos.z += flutter * amt * 0.6;
        vec4 wp = modelMatrix * instMat * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * mat3(instMat) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vShade;
      varying vec2 vUv;
      uniform sampler2D uMap;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunKey;
      uniform vec3 uShadowCol;
      uniform vec3 uFogCol;
      uniform vec3 uCamPos;

      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.5) discard;

        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(uCamPos - vWorldPos);
        float ndl = dot(N, L);

        // soft two-tone: sunlit side warm yellow-green, shaded side deep teal-green
        float lit = smoothstep(-0.30, 0.65, ndl);
        vec3 shade = mix(uShadowCol, vec3(0.45, 0.62, 0.62), 0.55) * vec3(0.72, 0.98, 0.92);
        vec3 col = tex.rgb * mix(shade, uSunKey * 0.97, lit);

        float glow = pow(clamp(dot(V, -L), 0.0, 1.0), 3.0) * 0.4;
        col += vec3(0.22, 0.30, 0.03) * uSunKey * (smoothstep(0.25, 0.9, ndl) * 0.28 + glow * 0.8);
        col *= mix(0.55, 1.0, vShade);

        float distCam = length(vWorldPos - uCamPos);
        float fogFactor = smoothstep(90.0, 640.0, distCam);
        gl_FragColor = vec4(mix(col, uFogCol, fogFactor), 1.0);
      }
    `,
  });
  const leafDepthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: leafAtlas,
    alphaTest: 0.5,
  });

  function addInstancedMeshes(propGroup, geoms, mat, list) {
    if (!geoms || geoms.length === 0 || list.length === 0) return;
    const dummy = new THREE.Object3D();
    for (const geo of geoms) {
      const isLeaf = Boolean(geo.userData.leaf);
      const inst = new THREE.InstancedMesh(geo, isLeaf ? ghibliLeafMat : mat, list.length);
      if (isLeaf) inst.customDepthMaterial = leafDepthMat;
      inst.castShadow = true;
      inst.receiveShadow = true;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        dummy.position.set(t.wx, t.wy, t.wz);
        dummy.rotation.set(0, t.ry, 0);
        dummy.scale.set(t.sx ?? t.sc, t.sy ?? t.sc, t.sz ?? t.sc);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      propGroup.add(inst);
    }
  }

  const VILLAGE_NAMES = [
    "Koriko Bend", "Ghibli Pier", "Windmill Terrace", "Saffron Cove",
    "Sunlit Ferry", "Mossy Hollow", "Koi Harbour", "Clover Reach",
  ];
  const ISLAND_NAMES = [
    "Adriatic Cove", "Coral Lighthouse", "Red Sail Atoll", "Pelican Harbor",
    "Azure Bay", "Sea Pine Shoal", "Emerald Point", "Ghibli Atoll",
  ];

  function populateCoastChunkProps(chunkIdx, zCenter) {
    const propGroup = propsPerChunk[chunkIdx];
    const obstacles = chunkObstacles[chunkIdx];
    const deliveries = chunkDeliveries[chunkIdx];
    const chunkKey = Math.round(zCenter);

    let s = (Math.round(Math.abs(zCenter)) * 71993 + 109) >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    const glbsReady = Boolean(buildingTemplates.market);
    const cliffLists = [[], [], []];
    const treesReady = Boolean(treeTemplates.sacredOak && treeTemplates.cherry && treeTemplates.peach);
    const oakList = [];
    const cherryList = [];
    const peachList = [];

    // 1. Coastal Sea-Stack Boulders right in the shallow turquoise surf
    for (let c = 0; c < 18; c++) {
      const wx = (rand() - 0.5) * 230;
      const wz = zCenter + (rand() - 0.5) * (CHUNK_LEN - 18);
      const h = coastTerrainHeight(wx, wz);
      if (h < -2.6 || h > -0.2) continue;
      const geoIdx = (c + chunkIdx) % cliffGeos.length;
      const sx = 1.6 + rand() * 1.8;
      const sy = 1.5 + rand() * 1.4;
      const sz = sx * (0.85 + rand() * 0.3);
      if (hasOverlap(obstacles, wx, wz, sx * 1.1, 1.8)) continue;
      const wy = groundedY(wx, wz, sx * 0.45, 0.45);
      cliffLists[geoIdx].push({ wx, wy, wz, ry: rand() * Math.PI * 2, sx, sy, sz });
      obstacles.push({ x: wx, z: wz, r: sx * 1.1, topY: wy + cliffGeos[geoIdx].userData.topY * sy });
    }

    // 1b. Big rocky headlands where the hills meet the sea
    let headlands = 0;
    for (let c = 0; c < 80 && headlands < 7 && coastTemplates.rocks.length; c++) {
      const wx = (rand() - 0.5) * 240;
      const wz = zCenter + (rand() - 0.5) * (CHUNK_LEN - 24);
      const h = coastTerrainHeight(wx, wz);
      if (h < WATER_Y + 0.4 || h > WATER_Y + 9) continue;
      let nearWater = false;
      for (let k = 0; k < 6 && !nearWater; k++) {
        const a = (k / 6) * Math.PI * 2;
        nearWater = coastTerrainHeight(wx + Math.cos(a) * 13, wz + Math.sin(a) * 13) < WATER_Y - 0.5;
      }
      if (!nearWater) continue;
      const tpl = coastTemplates.rocks[c % coastTemplates.rocks.length];
      const scale = 1.0 + rand() * 1.0;
      if (hasOverlap(obstacles, wx, wz, tpl.userData.radius * scale, 2.0)) continue;
      placeCoastModel(propGroup, obstacles, tpl, wx, wz, rand() * Math.PI * 2, { scale });
      headlands += 1;
    }

    // 2. Beach villages: houses cluster on the sand, with a wooden pier and moored rowboats
    const beachSpots = [];
    for (let x = -120; x <= 120; x += 14) {
      for (let z = zCenter - 92; z <= zCenter + 92; z += 14) {
        const wx = x + (rand() - 0.5) * 8;
        const wz = z + (rand() - 0.5) * 8;
        const h = coastTerrainHeight(wx, wz);
        if (h < WATER_Y + 0.15 || h > WATER_Y + 1.3 || terrainSlope(wx, wz) > 0.3) continue;
        let dir = null;
        for (let k = 0; k < 8 && !dir; k++) {
          const a = (k / 8) * Math.PI * 2 + rand() * 0.2;
          const dx = Math.cos(a);
          const dz = Math.sin(a);
          if (
            coastTerrainHeight(wx + dx * 9, wz + dz * 9) < WATER_Y - 0.7 &&
            coastTerrainHeight(wx + dx * 18, wz + dz * 18) < WATER_Y - 0.7 &&
            coastTerrainHeight(wx - dx * 8, wz - dz * 8) > WATER_Y + 0.4
          ) {
            dir = { dx, dz };
          }
        }
        if (dir) beachSpots.push({ wx, wz, dx: dir.dx, dz: dir.dz, key: rand() });
      }
    }
    beachSpots.sort((a, b) => a.key - b.key);
    const villages = [];
    for (const spot of beachSpots) {
      if (villages.length >= 3) break;
      if (villages.every((v) => Math.hypot(v.wx - spot.wx, v.wz - spot.wz) > 55)) villages.push(spot);
    }

    const houseKeys = ["twoStory", "kura", "lighthouse", "market"];
    let placedCount = 0;
    {
      villages.forEach((v, vi) => {
        const cx = v.wx - v.dx * 9;
        const cz = v.wz - v.dz * 9;
        let houses = 0;
        for (let attempt = 0; attempt < 110 && houses < 16; attempt++) {
          const ang = rand() * Math.PI * 2;
          const dist = 3 + rand() * 21;
          const hx = cx + Math.cos(ang) * dist;
          const hz = cz + Math.sin(ang) * dist;
          const hh = coastTerrainHeight(hx, hz);
          if (hh < WATER_Y + 0.4 || hh > WATER_Y + 6.0 || terrainSlope(hx, hz) > 0.36) continue;
          const tpl = coastTemplates.houses[Math.floor(rand() * coastTemplates.houses.length)];
          if (!tpl) break;
          if (hasOverlap(obstacles, hx, hz, tpl.userData.radius, 0.9)) continue;
          const placed = placeCoastModel(propGroup, obstacles, tpl, hx, hz, Math.atan2(v.dx, v.dz) + (rand() - 0.5) * 0.7, { solid: true });
          if (placed && houses === 0) {
            const iName = ISLAND_NAMES[(Math.abs(chunkKey) + vi + chunkIdx) % ISLAND_NAMES.length];
            addDeliveryTarget(propGroup, deliveries, `coast-${chunkKey}-${vi}`, iName, placed.x, placed.y, placed.z, placed.topY);
          }
          houses += 1;
          placedCount += 1;
        }

        if (coastTemplates.pier) {
          const pier = coastTemplates.pier.clone();
          pier.position.set(v.wx, WATER_Y + 0.62, v.wz);
          pier.rotation.y = Math.atan2(-v.dx, -v.dz);
          propGroup.add(pier);
        }

        // two boats moored beside the pier, one pulled up on the sand
        const px = -v.dz;
        const pz = v.dx;
        const spots = [
          { along: 7, side: 3.4 },
          { along: 12, side: -3.2 },
          { along: -1.5, side: 5.6 },
        ];
        spots.forEach((sp, bi) => {
          const bx = v.wx + v.dx * sp.along + px * sp.side;
          const bz = v.wz + v.dz * sp.along + pz * sp.side;
          const onSand = bi === 2;
          const bh = coastTerrainHeight(bx, bz);
          if (!onSand && bh > WATER_Y - 0.35) return;
          const tplBoat = coastTemplates.boats[(vi * 2 + bi) % Math.max(1, coastTemplates.boats.length)];
          if (!tplBoat) return;
          const boat = tplBoat.clone();
          boat.position.set(bx, onSand ? bh + 0.1 : WATER_Y + 0.08, bz);
          boat.rotation.y = Math.atan2(-v.dx, -v.dz) + Math.PI / 2 + (rand() - 0.5) * 0.4;
          propGroup.add(boat);
        });
      });
    }

    // fallback when the terrain has no beach in this chunk: old high-plateau cottages
    const anchors = [];
    for (let x = -115; x <= 115; x += 22) {
      for (let z = zCenter - 92; z <= zCenter + 92; z += 24) {
        const wx = x + (rand() - 0.5) * 10;
        const wz = z + (rand() - 0.5) * 10;
        const h = coastTerrainHeight(wx, wz);
        if (h > 1.5 && terrainSlope(wx, wz) < 0.48) {
          anchors.push({ wx, wz, h });
        }
      }
    }
    anchors.sort((a, b) => b.h - a.h);

    for (let i = 0; i < anchors.length && villages.length === 0 && placedCount < 8; i++) {
      const a = anchors[i];
      const key = houseKeys[(i + chunkIdx) % houseKeys.length];
      const sc = 0.92 + rand() * 0.18;
      const rad = (buildingMetrics[key]?.radius || 3.4) * sc;
      if (hasOverlap(obstacles, a.wx, a.wz, rad, 3.2)) continue;
      if (glbsReady) {
        const placed = spawnBuilding(propGroup, obstacles, key, a.wx, a.wz, rand() * Math.PI * 2, sc);
        if (placed && placedCount < 2) {
          const iName = ISLAND_NAMES[(Math.abs(chunkKey) + placedCount + chunkIdx) % ISLAND_NAMES.length];
          addDeliveryTarget(
            propGroup,
            deliveries,
            `coast-${chunkKey}-${placedCount}`,
            iName,
            placed.x,
            placed.y,
            placed.z,
            placed.topY
          );
        }
        placedCount += 1;
      }
    }

    // 3. Lush trees covering island hills & rocky outcrops
    for (let t = 0; t < 1000; t++) {
      const wx = (rand() - 0.5) * 260;
      const wz = zCenter + (rand() - 0.5) * (CHUNK_LEN - 14);
      const h = coastTerrainHeight(wx, wz);
      if (h < 0.85 || h > 34) continue;
      const rPick = rand();
      const key = rPick < 0.25 ? "sacredOak" : (rPick < 0.65 ? "cherry" : "peach");
      const sc = key === "sacredOak" ? (1.35 + rand() * 0.45) : (key === "cherry" ? (1.4 + rand() * 0.5) : (1.8 + rand() * 0.6));
      const rad = (treeMetrics[key]?.radius || 1.8) * sc;
      if (hasOverlap(obstacles, wx, wz, rad, 1.1)) continue;
      const wy = groundedY(wx, wz, 0.8, 0.25);
      const entry = { wx, wy, wz, sc, ry: rand() * Math.PI * 2 };
      if (key === "sacredOak") oakList.push(entry);
      else if (key === "cherry") cherryList.push(entry);
      else peachList.push(entry);
      obstacles.push({ x: wx, z: wz, r: rad, topY: wy + (treeMetrics[key]?.height || 3.6) * sc });
    }

    for (let g = 0; g < cliffGeos.length; g++) {
      addInstancedMeshes(propGroup, [cliffGeos[g]], ghibliCliffRockMat, cliffLists[g]);
    }
    const bushList = [];
    if (treeTemplates.bush) {
      for (let b = 0; b < 400; b++) {
        const wx = (rand() - 0.5) * 230;
        const wz = zCenter + (rand() - 0.5) * (CHUNK_LEN - 14);
        if (isOverWater(wx, wz)) continue;
        if (currentBiome !== "coast" && Math.abs(wx - riverCenterX(wz)) < riverWidth(wz) + 7) continue;
        const h = terrainHeight(wx, wz);
        if (h < WATER_Y + 1.8 || h > 30 || terrainSlope(wx, wz) > 0.55) continue;
        const sc = 0.8 + rand() * 0.7;
        if (hasOverlap(obstacles, wx, wz, 1.1 * sc, 0.2)) continue;
        bushList.push({ wx, wy: groundedY(wx, wz, 0.9, 0.2), wz, sc, ry: rand() * Math.PI * 2 });
      }
    }

    if (treesReady) {
      addInstancedMeshes(propGroup, treeTemplates.bush, ghibliInstancedTreeMat, bushList);
      addInstancedMeshes(propGroup, treeTemplates.sacredOak, ghibliInstancedTreeMat, oakList);
      addInstancedMeshes(propGroup, treeTemplates.cherry, ghibliInstancedTreeMat, cherryList);
      addInstancedMeshes(propGroup, treeTemplates.peach, ghibliInstancedTreeMat, peachList);
    }
  }

  function populateChunkProps(chunkIdx, zCenter) {
    const propGroup = propsPerChunk[chunkIdx];
    while (propGroup.children.length > 0) propGroup.remove(propGroup.children[0]);
    const obstacles = chunkObstacles[chunkIdx];
    const deliveries = chunkDeliveries[chunkIdx];
    const bridges = chunkBridges[chunkIdx];
    obstacles.length = 0;
    deliveries.length = 0;
    bridges.length = 0;

    if (currentBiome === "coast") {
      populateCoastChunkProps(chunkIdx, zCenter);
      return;
    }

    let s = (Math.round(Math.abs(zCenter)) * 92821 + 47) >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    const glbsReady = Boolean(buildingTemplates.market);
    const cliffLists = [[], [], []];
    const chunkKey = Math.round(zCenter);

    // 0. Hero Stone Arch Bridge across the river
    if (Math.abs(Math.round(zCenter / CHUNK_LEN)) % 2 === 1) {
      const bz = zCenter + 18;
      const bx = riverCenterX(bz);
      const ang = Math.atan2(riverCenterX(bz - 6) - riverCenterX(bz + 6), -12);
      const bridge = createStoneArchBridge();
      bridge.position.set(bx, WATER_Y, bz);
      bridge.rotation.y = -ang;
      propGroup.add(bridge);

      const cosA = Math.cos(-ang);
      const sinA = Math.sin(-ang);
      obstacles.push({ x: bx - 16.0 * cosA, z: bz + 16.0 * sinA, r: 3.6, topY: WATER_Y + 13.0 });
      obstacles.push({ x: bx + 16.0 * cosA, z: bz - 16.0 * sinA, r: 3.6, topY: WATER_Y + 13.0 });

      const bridgeId = `bridge-${chunkKey}`;
      bridges.push({
        id: bridgeId,
        x: bx,
        z: bz,
        deckY: WATER_Y + 14.5,
        halfSpan: 13.0,
        cleared: clearedBridgeIds.has(bridgeId),
      });
    }

    // 1. Scenic River Cliff Island + Delivery Lighthouse Cottage
    {
      const iz = zCenter - 38 + (rand() - 0.5) * 32;
      const rx = riverCenterX(iz);
      const rw = riverWidth(iz);
      const ix = rx + (rand() - 0.5) * rw * 0.35;
      const geoIdx = chunkIdx % cliffGeos.length;
      const sx = 3.6 + rand() * 1.0;
      const sy = 4.6 + rand() * 1.0;
      const sz = sx * (0.88 + rand() * 0.24);
      const baseWy = terrainHeight(ix, iz);
      const rockTop = baseWy + cliffGeos[geoIdx].userData.topY * sy;
      cliffLists[geoIdx].push({ wx: ix, wy: baseWy, wz: iz, ry: rand() * Math.PI * 2, sx, sy, sz });
      obstacles.push({ x: ix, z: iz, r: sx * 1.15, topY: rockTop });

      if (glbsReady && rockTop > WATER_Y + 1.8) {
        const placed = spawnBuilding(propGroup, obstacles, "lighthouse", ix, iz, rand() * Math.PI * 2, 0.68, rockTop - 0.15);
        if (placed) {
          addDeliveryTarget(
            propGroup,
            deliveries,
            `isl-${chunkKey}`,
            "Cliff Island Lighthouse",
            placed.x,
            placed.y,
            placed.z,
            placed.topY
          );
        }
      }
    }

    // 2. Grounded Shoreline Rocks & High Mountain-Wall Cliff Outcrops
    for (let c = 0; c < 11; c++) {
      const wz = zCenter + (rand() - 0.5) * (CHUNK_LEN - 20);
      const rx = riverCenterX(wz);
      const rw = riverWidth(wz);
      const isRiverBoulder = c < 6;
      const side = c % 2 === 0 ? 1 : -1;
      const wx = isRiverBoulder
        ? rx + side * (rw + 1.5 + rand() * 2.7)
        : rx + side * (64 + rand() * 44);

      const geoIdx = (c + chunkIdx) % cliffGeos.length;
      const sx = isRiverBoulder ? (1.4 + rand() * 0.9) : (4.8 + rand() * 3.2);
      const sy = isRiverBoulder ? (1.1 + rand() * 0.7) : (5.2 + rand() * 4.0);
      const sz = sx * (0.85 + rand() * 0.30);
      const r = sx * 1.08;
      if (hasOverlap(obstacles, wx, wz, r, 1.4)) continue;

      const wy = groundedY(wx, wz, sx * (isRiverBoulder ? 0.5 : 0.7), isRiverBoulder ? 0.6 : 1.6);
      cliffLists[geoIdx].push({ wx, wy, wz, ry: rand() * Math.PI * 2, sx, sy, sz });
      obstacles.push({ x: wx, z: wz, r, topY: wy + cliffGeos[geoIdx].userData.topY * sy });
    }

    for (let g = 0; g < cliffGeos.length; g++) {
      addInstancedMeshes(propGroup, [cliffGeos[g]], ghibliCliffRockMat, cliffLists[g]);
    }

    // 3. Villages & Towers
    const villageAnchors = [];
    if (glbsReady) {
      const residentialPool = ["vHouse0", "vHouse1", "vHouse2", "vHouse3"];
      for (let v = 0; v < 2; v++) {
        const side = (v + chunkIdx) % 2 === 0 ? 1 : -1;
        const vz = zCenter + (v === 0 ? -52 : 52) + (rand() - 0.5) * 22;
        const rx = riverCenterX(vz);
        const rw = riverWidth(vz);
        const vx = rx + side * (rw + 20 + rand() * 14);
        const vRad = (buildingMetrics.market?.radius || 2.8) * 1.05;
        if (!hasOverlap(obstacles, vx, vz, vRad, 2.5) && terrainSlope(vx, vz) < 0.38) {
          villageAnchors.push({ x: vx, z: vz });
          const placedMarket = spawnBuilding(propGroup, obstacles, "market", vx, vz, rand() * Math.PI * 2, 1.05);
          if (placedMarket && v === 0) {
            const vName = VILLAGE_NAMES[(Math.abs(chunkKey) + chunkIdx) % VILLAGE_NAMES.length];
            addDeliveryTarget(
              propGroup,
              deliveries,
              `vil-${chunkKey}`,
              vName,
              placedMarket.x,
              placedMarket.y,
              placedMarket.z,
              placedMarket.topY
            );
          }
        } else {
          villageAnchors.push({ x: vx, z: vz });
        }

        const pumpX = rx + side * (rw + 6.8 + rand() * 2.5);
        const pumpZ = vz + (rand() - 0.5) * 14;
        const pumpRad = (buildingMetrics.pump?.radius || 2.8) * 0.95;
        if (!hasOverlap(obstacles, pumpX, pumpZ, pumpRad, 2.0) && terrainSlope(pumpX, pumpZ) < 0.42) {
          spawnBuilding(propGroup, obstacles, "pump", pumpX, pumpZ, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0.95);
        }

        for (let h = 0; h < 4; h++) {
          const key = residentialPool[(h + v + chunkIdx) % residentialPool.length];
          const sc = 0.95 + rand() * 0.2;
          const rad = (buildingMetrics[key]?.radius || 4.0) * sc;
          for (let attempt = 0; attempt < 8; attempt++) {
            const ang = (h / 4) * Math.PI * 2 + rand() * 0.8;
            const dist = 12.5 + rand() * 9.5;
            const hx = vx + Math.cos(ang) * dist;
            const hz = vz + Math.sin(ang) * dist;
            if (Math.abs(hx - riverCenterX(hz)) < riverWidth(hz) + rad + 5.0) continue;
            if (terrainSlope(hx, hz) > 0.36) continue;
            if (hasOverlap(obstacles, hx, hz, rad, 2.8)) continue;
            spawnBuilding(propGroup, obstacles, key, hx, hz, ang + Math.PI, sc);
            break;
          }
        }
      }

      const towerKeys = ["corner", "pillar", "tupa"];
      for (let t = 0; t < 3; t++) {
        const side = t % 2 === 0 ? -1 : 1;
        const actualKey = towerKeys[(t + chunkIdx) % towerKeys.length];
        const sc = 1.08 + rand() * 0.2;
        const rad = (buildingMetrics[actualKey]?.radius || 4.5) * sc;
        for (let attempt = 0; attempt < 6; attempt++) {
          const tz = zCenter - 70 + t * 70 + (rand() - 0.5) * 24;
          const tx = riverCenterX(tz) + side * (48 + rand() * 32);
          if (terrainSlope(tx, tz) > 0.44) continue;
          if (hasOverlap(obstacles, tx, tz, rad, 2.8)) continue;
          spawnBuilding(propGroup, obstacles, actualKey, tx, tz, rand() * Math.PI * 2, sc);
          break;
        }
      }
    } else {
      const cottages = [];
      for (let cluster = 0; cluster < 4; cluster++) {
        const side = cluster % 2 === 0 ? 1 : -1;
        const cz = zCenter + (rand() - 0.5) * (CHUNK_LEN - 28);
        const cx = riverCenterX(cz) + side * (19 + rand() * 34);
        const wx = cx + (rand() - 0.5) * 11;
        const wz = cz + (rand() - 0.5) * 11;
        cottages.push({ wx, wy: terrainHeight(wx, wz), wz, ry: rand() * Math.PI * 2, sc: 0.95 });
      }
      const bodies = new THREE.InstancedMesh(houseBodyGeo, toonMat("#f5eddc"), cottages.length);
      const roofs = new THREE.InstancedMesh(houseRoofGeo, toonMat("#cd5337"), cottages.length);
      const dummy = new THREE.Object3D();
      cottages.forEach((h, idx) => {
        dummy.position.set(h.wx, h.wy + 1.0 * h.sc, h.wz);
        dummy.rotation.set(0, h.ry, 0);
        dummy.scale.setScalar(h.sc);
        dummy.updateMatrix();
        bodies.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(h.wx, h.wy + 2.95 * h.sc, h.wz);
        dummy.rotation.set(0, h.ry + Math.PI / 4, 0);
        dummy.updateMatrix();
        roofs.setMatrixAt(idx, dummy.matrix);
      });
      bodies.instanceMatrix.needsUpdate = true;
      roofs.instanceMatrix.needsUpdate = true;
      propGroup.add(bodies, roofs);
    }

    // 4. Real 3D GPU-Instanced Trees
    const treesReady = Boolean(treeTemplates.sacredOak && treeTemplates.cherry && treeTemplates.peach);
    const oakList = [];
    const cherryList = [];
    const peachList = [];

    for (const va of villageAnchors) {
      const sc = 1.45 + rand() * 0.45;
      const rad = (treeMetrics.sacredOak?.radius || 2.2) * sc;
      for (let attempt = 0; attempt < 6; attempt++) {
        const ox = va.x + (rand() > 0.5 ? 1 : -1) * (16 + rand() * 10);
        const oz = va.z + (rand() - 0.5) * 18;
        if (Math.abs(ox - riverCenterX(oz)) < riverWidth(oz) + rad + 4.5) continue;
        if (hasOverlap(obstacles, ox, oz, rad, 1.8)) continue;
        const wy = groundedY(ox, oz, 1.0, 0.25);
        oakList.push({ wx: ox, wy, wz: oz, sc, ry: rand() * Math.PI * 2 });
        obstacles.push({ x: ox, z: oz, r: rad, topY: wy + (treeMetrics.sacredOak?.height || 5.4) * sc });
        break;
      }
    }

    for (let i = 0; i < 46; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const wz = zCenter + (rand() - 0.5) * (CHUNK_LEN - 18);
      const wx = riverCenterX(wz) + side * (24 + rand() * 100);
      const sc = 1.55 + rand() * 0.6;
      const rad = (treeMetrics.sacredOak?.radius || 2.2) * sc;
      if (terrainHeight(wx, wz) > 55) continue;
      if (Math.abs(wx - riverCenterX(wz)) < riverWidth(wz) + rad + 4.5) continue;
      if (hasOverlap(obstacles, wx, wz, rad, 1.5)) continue;
      const wy = groundedY(wx, wz, 1.0, 0.25);
      oakList.push({ wx, wy, wz, sc, ry: rand() * Math.PI * 2 });
      obstacles.push({ x: wx, z: wz, r: rad, topY: wy + (treeMetrics.sacredOak?.height || 5.4) * sc });
    }

    for (let grove = 0; grove < 46; grove++) {
      const gx = (rand() - 0.5) * (CHUNK_W - 85);
      const gz = zCenter + (rand() - 0.5) * (CHUNK_LEN - 16);
      const isCherry = grove % 3 !== 0;
      const count = 4 + Math.floor(rand() * 5);
      for (let k = 0; k < count; k++) {
        const wx = gx + (rand() - 0.5) * 24;
        const wz = gz + (rand() - 0.5) * 24;
        const key = isCherry ? "cherry" : "peach";
        const sc = isCherry ? (1.55 + rand() * 0.6) : (2.0 + rand() * 0.7);
        const rad = (treeMetrics[key]?.radius || 1.8) * sc;
        const rw = riverWidth(wz);
        if (Math.abs(wx - riverCenterX(wz)) < rw + rad + 4.5) continue;
        if (terrainHeight(wx, wz) > 55) continue;
        if (hasOverlap(obstacles, wx, wz, rad, 1.1)) continue;
        const wy = groundedY(wx, wz, 0.8, 0.25);
        const entry = { wx, wy, wz, sc, ry: rand() * Math.PI * 2 };
        if (isCherry) cherryList.push(entry);
        else peachList.push(entry);
        obstacles.push({ x: wx, z: wz, r: rad, topY: wy + (treeMetrics[key]?.height || 3.4) * sc });
      }
    }

    const bushList = [];
    if (treeTemplates.bush) {
      for (let b = 0; b < 400; b++) {
        const wx = (rand() - 0.5) * 230;
        const wz = zCenter + (rand() - 0.5) * (CHUNK_LEN - 14);
        if (isOverWater(wx, wz)) continue;
        if (currentBiome !== "coast" && Math.abs(wx - riverCenterX(wz)) < riverWidth(wz) + 7) continue;
        const h = terrainHeight(wx, wz);
        if (h < WATER_Y + 1.8 || h > 30 || terrainSlope(wx, wz) > 0.55) continue;
        const sc = 0.8 + rand() * 0.7;
        if (hasOverlap(obstacles, wx, wz, 1.1 * sc, 0.2)) continue;
        bushList.push({ wx, wy: groundedY(wx, wz, 0.9, 0.2), wz, sc, ry: rand() * Math.PI * 2 });
      }
    }

    if (treesReady) {
      addInstancedMeshes(propGroup, treeTemplates.bush, ghibliInstancedTreeMat, bushList);
      addInstancedMeshes(propGroup, treeTemplates.sacredOak, ghibliInstancedTreeMat, oakList);
      addInstancedMeshes(propGroup, treeTemplates.cherry, ghibliInstancedTreeMat, cherryList);
      addInstancedMeshes(propGroup, treeTemplates.peach, ghibliInstancedTreeMat, peachList);
    } else {
      const allFb = [...oakList, ...cherryList, ...peachList];
      if (allFb.length > 0) {
        const trunks = new THREE.InstancedMesh(treeFallbackTrunkGeo, toonMat("#5b412f"), allFb.length);
        const crowns = new THREE.InstancedMesh(treeFallbackCrownGeo, toonMat("#4c7b34"), allFb.length);
        const dummy = new THREE.Object3D();
        allFb.forEach((t, idx) => {
          dummy.position.set(t.wx, t.wy + 1.0, t.wz);
          dummy.rotation.set(0, t.ry, 0);
          dummy.scale.setScalar(1.1);
          dummy.updateMatrix();
          trunks.setMatrixAt(idx, dummy.matrix);
          dummy.position.set(t.wx, t.wy + 2.7, t.wz);
          dummy.updateMatrix();
          crowns.setMatrixAt(idx, dummy.matrix);
        });
        trunks.instanceMatrix.needsUpdate = true;
        crowns.instanceMatrix.needsUpdate = true;
        propGroup.add(trunks, crowns);
      }
    }
  }

  function updateChunkGeometry(chunk, waterMesh, zCenter) {
    chunk.position.z = zCenter;
    waterMesh.position.z = zCenter;
    const pos = chunk.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i);
      const wz = pos.getZ(i) + zCenter;
      pos.setY(i, terrainHeight(wx, wz));
    }
    pos.needsUpdate = true;
    chunk.geometry.computeVertexNormals();
  }

  for (let i = 0; i < NUM_CHUNKS; i++) {
    const geo = new THREE.PlaneGeometry(CHUNK_W, CHUNK_LEN, SEG_X, SEG_Z);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, valleyMat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    terrainChunks.push(mesh);

    const wGeo = new THREE.PlaneGeometry(CHUNK_W, CHUNK_LEN, 96, 48);
    wGeo.rotateX(-Math.PI / 2);
    const wMesh = new THREE.Mesh(wGeo, ghibliWaterMat);
    wMesh.position.y = WATER_Y;
    scene.add(wMesh);
    waterChunks.push(wMesh);

    const pg = new THREE.Group();
    scene.add(pg);
    propsPerChunk.push(pg);

    const zCenter = 80 - i * CHUNK_LEN;
    updateChunkGeometry(mesh, wMesh, zCenter);
    populateChunkProps(i, zCenter);
  }

  Promise.all([
    ...coastUrls.houses.map((u, i) => loadCoastModel(u, (m) => { coastTemplates.houses[i] = m; })),
    ...coastUrls.rocks.map((u, i) => loadCoastModel(u, (m) => { coastTemplates.rocks[i] = m; })),
    ...coastUrls.boats.map((u, i) => loadCoastModel(u, (m) => { coastTemplates.boats[i] = m; })),
    loadCoastModel(coastUrls.pier, (m) => { coastTemplates.pier = m; }),
    ...valleyHouseUrls.map((u, i) =>
      loadCoastModel(u, (m) => {
        buildingTemplates[`vHouse${i}`] = m;
        buildingMetrics[`vHouse${i}`] = { radius: m.userData.radius, height: m.userData.height };
      })
    ),
    loadCoastModel(propUrls.bridge, (m) => { bridgeTemplate = m; }),
    loadCoastModel(propUrls.trawler, (m) => { trawlerBoats.forEach((b) => b.mesh.add(m.clone())); }),
    ...Object.entries(buildingUrls).map(
      ([key, url]) =>
        new Promise((resolve) => {
          gltfLoader.load(
            url,
            (gltf) => {
              buildingTemplates[key] = prepareBuildingTemplate(gltf.scene, key);
              resolve();
            },
            undefined,
            () => resolve()
          );
        })
    ),
    ...Object.entries(treeUrls).map(
      ([key, url]) =>
        new Promise((resolve) => {
          gltfLoader.load(
            url,
            (gltf) => {
              treeTemplates[key] = extractTreeGeometries(gltf.scene, key);
              resolve();
            },
            undefined,
            () => resolve()
          );
        })
    ),
  ]).then(() => {
    for (let i = 0; i < NUM_CHUNKS; i++) {
      populateChunkProps(i, terrainChunks[i].position.z);
    }
  });

  function setBiome(biomeName) {
    const next = biomeName === "coast" ? "coast" : "valley";
    if (currentBiome === next) return;
    currentBiome = next;
    uIsCoast.value = next === "coast" ? 1.0 : 0.0;
    for (let i = 0; i < NUM_CHUNKS; i++) {
      const zC = terrainChunks[i].position.z;
      updateChunkGeometry(terrainChunks[i], waterChunks[i], zC);
      populateChunkProps(i, zC);
    }
    for (let i = 0; i < trawlerBoats.length; i++) {
      placeBoatInOpenWater(trawlerBoats[i], trawlerBoats[i].z);
    }
  }

  function getSafeAltitude(wx, wz, padRadius = 4.6, ignoreSolid = false) {
    let maxH = Math.max(
      WATER_Y + 4.4,
      terrainHeight(wx, wz),
      terrainHeight(wx - padRadius, wz),
      terrainHeight(wx + padRadius, wz),
      terrainHeight(wx, wz - 6),
      terrainHeight(wx, wz - 14)
    ) + 5.0;

    for (let c = 0; c < NUM_CHUNKS; c++) {
      if (Math.abs(wz - terrainChunks[c].position.z) > CHUNK_LEN * 0.6) continue;
      const obs = chunkObstacles[c];
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        if (ignoreSolid && o.solid) continue;
        const dx = wx - o.x;
        const dz = wz - o.z;
        const cr = o.r + padRadius;
        if (dx * dx + dz * dz < cr * cr) {
          maxH = Math.max(maxH, o.topY + 3.2);
        }
      }
    }
    return maxH;
  }

  // Buildings are solid: returns the building the plane is inside of, or null.
  function checkBuildingCrash(pos, planeRadius = 1.4) {
    for (let c = 0; c < NUM_CHUNKS; c++) {
      if (Math.abs(pos.z - terrainChunks[c].position.z) > CHUNK_LEN * 0.6) continue;
      const obs = chunkObstacles[c];
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        if (!o.solid || pos.y > o.topY) continue;
        const dx = pos.x - o.x;
        const dz = pos.z - o.z;
        const cr = o.r * 0.8 + planeRadius;
        if (dx * dx + dz * dz < cr * cr) return o;
      }
    }
    return null;
  }

  function getNearestDelivery(planePos, maxDist = 52) {
    let best = null;
    let bestDist = maxDist;
    for (let c = 0; c < NUM_CHUNKS; c++) {
      const list = chunkDeliveries[c];
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (d.delivered) continue;
        const hd = Math.hypot(planePos.x - d.x, planePos.z - d.z);
        if (hd < bestDist) {
          bestDist = hd;
          best = d;
        }
      }
    }
    return best;
  }

  function markDelivered(id) {
    deliveredIds.add(id);
    for (let c = 0; c < NUM_CHUNKS; c++) {
      const list = chunkDeliveries[c];
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i].delivered = true;
          if (list[i].ring) list[i].ring.visible = false;
        }
      }
    }
  }

  function checkUnderBridge(planePos) {
    for (let c = 0; c < NUM_CHUNKS; c++) {
      const list = chunkBridges[c];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.cleared) continue;
        const dz = Math.abs(planePos.z - b.z);
        const dx = Math.abs(planePos.x - b.x);
        if (dz < 5.5 && dx < b.halfSpan && planePos.y > WATER_Y + 1.5 && planePos.y < b.deckY - 1.5) {
          b.cleared = true;
          clearedBridgeIds.add(b.id);
          return b;
        }
      }
    }
    return null;
  }

  // === E2. SWIMMING GOLDEN KOI & OCEAN FISH ===
  function buildFishGeo() {
    const verts = new Float32Array([
      0, 0, -0.45,     0.12, 0.04, -0.1,   0, 0.14, -0.05,
      0, 0, -0.45,     0, 0.14, -0.05,    -0.12, 0.04, -0.1,
      0, 0, -0.45,     0, -0.10, -0.08,    0.12, 0.04, -0.1,
      0, 0, -0.45,    -0.12, 0.04, -0.1,   0, -0.10, -0.08,
      0.12, 0.04, -0.1,  0, 0.03, 0.34,    0, 0.14, -0.05,
      -0.12, 0.04, -0.1, 0, 0.14, -0.05,   0, 0.03, 0.34,
      0, -0.10, -0.08,   0, 0.03, 0.34,    0.12, 0.04, -0.1,
      -0.12, 0.04, -0.1, 0, 0.03, 0.34,    0, -0.10, -0.08,
      0, 0.03, 0.30,     0, 0.17, 0.56,    0.02, 0.03, 0.48,
      0, 0.03, 0.30,     0.02, 0.03, 0.48, 0, -0.14, 0.56,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }

  const fishMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFogCol: { value: LSTATE.fogCol },
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vFishColor;
      varying vec3 vWorldPos;
      void main() {
        #ifdef USE_INSTANCING_COLOR
          vFishColor = instanceColor;
        #else
          vFishColor = vec3(1.0, 0.48, 0.16);
        #endif
        mat4 instMat = mat4(1.0);
        #ifdef USE_INSTANCING
          instMat = instanceMatrix;
        #endif
        vec3 p = position;
        float tailWeight = smoothstep(-0.2, 0.5, p.z);
        p.x += sin(uTime * 8.0 + instMat[3].z * 0.7 + p.z * 6.0) * tailWeight * 0.14;
        vec4 wp = modelMatrix * instMat * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vFishColor;
      varying vec3 vWorldPos;
      uniform vec3 uFogCol;
      uniform vec3 uCamPos;
      void main() {
        vec3 col = pow(max(vFishColor, vec3(0.0001)), vec3(1.0 / 2.2));
        col = mix(col, vec3(0.18, 0.72, 0.80), 0.18);
        float distCam = length(vWorldPos - uCamPos);
        if (distCam > 190.0) discard;
        gl_FragColor = vec4(mix(col * 1.15, uFogCol, smoothstep(85.0, 190.0, distCam)), 1.0);
      }
    `,
  });

  const FISH_COUNT = 120;
  const fishInst = new THREE.InstancedMesh(buildFishGeo(), fishMat, FISH_COUNT);
  fishInst.frustumCulled = false;
  const fishData = [];
  const koiPalette = ["#ff6b2b", "#ff4a36", "#ffbe33", "#ff8e3c", "#fff0d4"];
  const koiCol = new THREE.Color();
  for (let i = 0; i < FISH_COUNT; i++) {
    const school = Math.floor(i / 12);
    fishData.push({
      xOff: (Math.random() - 0.5) * 90,
      z: -20 - school * 44 - (Math.random() - 0.5) * 12,
      laneOffset: (Math.random() - 0.5) * 0.58,
      depth: WATER_Y - 0.52 - Math.random() * 0.45,
      speed: 2.2 + Math.random() * 1.8,
      scale: 0.75 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
    });
    koiCol.set(koiPalette[i % koiPalette.length]);
    fishInst.setColorAt(i, koiCol);
  }
  fishInst.instanceColor.needsUpdate = true;
  scene.add(fishInst);
  const fishDummy = new THREE.Object3D();

  // === F. 3D VOLUMETRIC CUMULUS FORMATIONS ===
  const ghibli3DCloudMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uSunDir: { value: LSTATE.sunDir },
      uCrestCol: { value: LSTATE.cloudCrest },
      uMidCol: { value: LSTATE.cloudMid },
      uShadowCol: { value: LSTATE.cloudShadow },
      uSkyCyan: { value: LSTATE.skyCyan },
      uHorizonCol: { value: LSTATE.skyHorizon },
      uCamPos: { value: new THREE.Vector3() },
      uPlanePos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vLocalY;

      float hash31(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
              mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
          mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
              mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
          f.z
        );
      }

      float fbm3(vec3 p) {
        return 0.55 * noise3(p) + 0.30 * noise3(p * 2.07 + 13.7) + 0.15 * noise3(p * 4.21 + 29.1);
      }

      void main() {
        vLocalY = position.y;
        mat4 instMat = mat4(1.0);
        #ifdef USE_INSTANCING
          instMat = instanceMatrix;
        #endif

        vec4 wp0 = modelMatrix * instMat * vec4(position, 1.0);
        vec3 nW = normalize(mat3(modelMatrix) * mat3(instMat) * normal);

        float disp = (fbm3(wp0.xyz * 0.085) - 0.45) * 4.2 + (noise3(wp0.xyz * 0.22) - 0.5) * 1.6;
        vec3 wp = wp0.xyz + nW * disp;

        vWorldPos = wp;
        vWorldNormal = nW;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vLocalY;
      uniform vec3 uSunDir;
      uniform vec3 uCrestCol;
      uniform vec3 uMidCol;
      uniform vec3 uShadowCol;
      uniform vec3 uSkyCyan;
      uniform vec3 uHorizonCol;
      uniform vec3 uCamPos;
      uniform vec3 uPlanePos;

      float hash31(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
              mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
          mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
              mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
          f.z
        );
      }

      float fbm3(vec3 p) {
        return 0.60 * noise3(p) + 0.40 * noise3(p * 2.15 + 7.3);
      }

      void main() {
        float distCam = length(vWorldPos - uCamPos);
        float distPlane = length(vWorldPos - uPlanePos);
        float nearFade = smoothstep(7.0, 24.0, min(distCam, distPlane));
        if (nearFade < 0.02) discard;

        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(uCamPos - vWorldPos);

        float detail = fbm3(vWorldPos * 0.14);
        float val = dot(N, L) * 0.85 + vLocalY * 0.34 + (detail - 0.5) * 0.34;

        vec3 deepShadow = uShadowCol * 0.88;
        vec3 midShadow  = mix(uShadowCol, vec3(0.76, 0.84, 0.96), 0.52);
        vec3 col = mix(deepShadow, midShadow, smoothstep(-0.34, -0.10, val));
        col = mix(col, uMidCol, smoothstep(-0.02, 0.22, val));
        col = mix(col, uCrestCol, smoothstep(0.28, 0.52, val));

        float rim = pow(max(1.0 - max(dot(N, V), 0.0), 0.0001), 2.2);
        float sunForward = pow(max(dot(V, -L), 0.0001), 2.5);
        col += mix(uCrestCol, vec3(1.35, 0.86, 1.0), 0.45) * 0.92 * (rim * 0.55 * (0.45 + sunForward) + sunForward * 0.30);
        col = mix(col, uSkyCyan, rim * 0.14);

        float fogFactor = smoothstep(320.0, 920.0, distCam);
        gl_FragColor = vec4(mix(col, uHorizonCol, fogFactor * 0.82), nearFade);
      }
    `,
  });

  const cloudFormations = [];
  const cloudPuffs = [];
  const CLOUD_LOOP_LEN = 940;
  {
    let s = 5519;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    for (let f = 0; f < 14; f++) {
      const side = f % 2 === 0 ? -1 : 1;
      const fx = side * (86 + rand() * 78);
      const fy = 36 + rand() * 28;
      const fz = 60 - f * 67;
      const form = { z: fz, puffStart: cloudPuffs.length, puffCount: 0 };

      const basePuffs = 7 + Math.floor(rand() * 4);
      for (let p = 0; p < basePuffs; p++) {
        const ang = (p / basePuffs) * Math.PI * 2 + rand() * 0.4;
        const rad = 8 + rand() * 14;
        cloudPuffs.push({
          ox: fx + Math.cos(ang) * rad,
          oy: fy + (rand() - 0.3) * 5,
          oz: Math.sin(ang) * rad,
          sx: 11 + rand() * 9,
          sy: 6.5 + rand() * 4.5,
          sz: 11 + rand() * 9,
        });
      }

      const towerPuffs = 11 + Math.floor(rand() * 6);
      const towerH = 18 + rand() * 22;
      for (let p = 0; p < towerPuffs; p++) {
        const t = p / towerPuffs;
        const ang = rand() * Math.PI * 2;
        const spread = (1.0 - t * 0.65) * (6 + rand() * 11);
        const r = (1.15 - t * 0.45) * (7.5 + rand() * 8.5);
        cloudPuffs.push({
          ox: fx + Math.cos(ang) * spread,
          oy: fy + 4 + t * towerH,
          oz: Math.sin(ang) * spread,
          sx: r * (0.9 + rand() * 0.3),
          sy: r * (0.85 + rand() * 0.3),
          sz: r * (0.9 + rand() * 0.3),
        });
      }

      form.puffCount = cloudPuffs.length - form.puffStart;
      cloudFormations.push(form);
    }

    for (let f = 0; f < 6; f++) {
      const fx = (rand() - 0.5) * 340;
      const fy = 66 + rand() * 26;
      const fz = -60 - f * 145;
      const form = { z: fz, puffStart: cloudPuffs.length, puffCount: 0 };
      const count = 10 + Math.floor(rand() * 5);
      for (let p = 0; p < count; p++) {
        cloudPuffs.push({
          ox: fx + (rand() - 0.5) * 34,
          oy: fy + (rand() - 0.3) * 14,
          oz: (rand() - 0.5) * 24,
          sx: 12 + rand() * 11,
          sy: 6.5 + rand() * 6,
          sz: 10 + rand() * 9,
        });
      }
      form.puffCount = cloudPuffs.length - form.puffStart;
      cloudFormations.push(form);
    }
  }

  const cloudInst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), ghibli3DCloudMat, cloudPuffs.length);
  cloudInst.frustumCulled = false;
  const cloudDummy = new THREE.Object3D();

  function syncClouds() {
    for (let f = 0; f < cloudFormations.length; f++) {
      const form = cloudFormations[f];
      for (let k = 0; k < form.puffCount; k++) {
        const idx = form.puffStart + k;
        const p = cloudPuffs[idx];
        cloudDummy.position.set(p.ox, p.oy, form.z + p.oz);
        cloudDummy.scale.set(p.sx, p.sy, p.sz);
        cloudDummy.updateMatrix();
        cloudInst.setMatrixAt(idx, cloudDummy.matrix);
      }
    }
    cloudInst.instanceMatrix.needsUpdate = true;
  }
  syncClouds();
  scene.add(cloudInst);

  // === G. VOLUMETRIC SUN GOD RAYS, SUN MOTES, SAKURA PETALS & DUSK SKY LANTERNS ===
  const godRayMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSunKey: { value: LSTATE.sunKey },
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      uniform float uTime;
      uniform vec3 uSunKey;
      uniform vec3 uCamPos;
      void main() {
        vec3 V = normalize(uCamPos - vWorldPos);
        float facing = smoothstep(0.14, 0.55, abs(dot(normalize(vWorldNormal), V)));
        float distCam = length(vWorldPos - uCamPos);
        float nearFade = smoothstep(18.0, 52.0, distCam) * (1.0 - smoothstep(260.0, 520.0, distCam));
        float horiz = pow(clamp(sin(vUv.x * 3.14159265), 0.0001, 1.0), 2.2);
        float vert = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.60, vUv.y);
        float shimmer = 0.72 + 0.28 * sin(vUv.x * 9.0 + uTime * 0.45 + vWorldPos.z * 0.02);
        float alpha = horiz * vert * facing * nearFade * shimmer * 0.11;
        if (alpha < 0.002) discard;
        gl_FragColor = clamp(vec4(uSunKey * alpha, alpha), 0.0, 1.0);
      }
    `,
  });

  const godRays = [];
  const rayGeo = new THREE.PlaneGeometry(34, 185);
  const upVec = new THREE.Vector3(0, 1, 0);
  const rayQuat = new THREE.Quaternion().setFromUnitVectors(upVec, LSTATE.sunDir);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(rayGeo, godRayMat);
    m.quaternion.copy(rayQuat);
    m.rotateY((i % 2 === 0 ? 0.35 : -0.35) + i * 0.2);
    const rx = (i % 2 === 0 ? -1 : 1) * (24 + (i % 3) * 18);
    m.position.set(rx, 58, -80 - i * 85);
    scene.add(m);
    godRays.push(m);
  }

  const MOTE_COUNT = 200;
  const motePos = new Float32Array(MOTE_COUNT * 3);
  const motePhase = new Float32Array(MOTE_COUNT);
  for (let i = 0; i < MOTE_COUNT; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 90;
    motePos[i * 3 + 1] = 10 + Math.random() * 60;
    motePos[i * 3 + 2] = -Math.random() * 110;
    motePhase[i] = Math.random() * Math.PI * 2;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute("aPhase", new THREE.BufferAttribute(motePhase, 1));
  const sunMoteMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSunKey: { value: LSTATE.sunKey },
      uCamPos: { value: new THREE.Vector3() },
      uPlanePos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      attribute float aPhase;
      uniform float uTime;
      uniform vec3 uCamPos;
      uniform vec3 uPlanePos;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.7 + aPhase) * 1.4;
        p.y += cos(uTime * 0.55 + aPhase * 1.3) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dCam = length(p - uCamPos);
        float dPlane = length(p - uPlanePos);
        float twinkle = 0.45 + 0.55 * sin(uTime * 2.2 + aPhase);
        vAlpha = twinkle * smoothstep(5.5, 14.0, min(dCam, dPlane)) * (1.0 - smoothstep(65.0, 110.0, dCam));
        gl_PointSize = clamp(240.0 / max(1.0, -mv.z), 2.5, 9.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      uniform vec3 uSunKey;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float circle = smoothstep(0.5, 0.06, d);
        float a = circle * vAlpha * 0.54;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uSunKey * a, a);
      }
    `,
  });
  const sunMotes = new THREE.Points(moteGeo, sunMoteMat);
  sunMotes.frustumCulled = false;
  scene.add(sunMotes);

  const PETAL_COUNT = 160;
  const petalPos = new Float32Array(PETAL_COUNT * 3);
  const petalSeed = new Float32Array(PETAL_COUNT);
  for (let i = 0; i < PETAL_COUNT; i++) {
    petalPos[i * 3] = (Math.random() - 0.5) * 90;
    petalPos[i * 3 + 1] = 8 + Math.random() * 52;
    petalPos[i * 3 + 2] = -Math.random() * 110;
    petalSeed[i] = Math.random() * Math.PI * 2;
  }
  const petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute("position", new THREE.BufferAttribute(petalPos, 3));
  petalGeo.setAttribute("aSeed", new THREE.BufferAttribute(petalSeed, 1));
  const petalMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSunKey: { value: LSTATE.sunKey },
      uCamPos: { value: new THREE.Vector3() },
      uPlanePos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uCamPos;
      uniform vec3 uPlanePos;
      varying float vAlpha;
      varying float vSpin;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 1.1 + aSeed) * 2.2;
        p.y += cos(uTime * 0.9 + aSeed * 1.7) * 1.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dCam = length(p - uCamPos);
        float dPlane = length(p - uPlanePos);
        vAlpha = smoothstep(5.5, 13.0, min(dCam, dPlane)) * (1.0 - smoothstep(55.0, 98.0, dCam));
        vSpin = uTime * 3.0 + aSeed;
        gl_PointSize = clamp(290.0 / max(1.0, -mv.z), 3.0, 10.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vSpin;
      uniform vec3 uSunKey;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float ca = cos(vSpin), sa = sin(vSpin);
        vec2 rc = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
        float oval = length(vec2(rc.x * 1.8, rc.y));
        if (oval > 0.44 || vAlpha < 0.02) discard;
        vec3 pink = vec3(1.0, 0.82, 0.88) * mix(vec3(1.0), uSunKey, 0.45);
        gl_FragColor = vec4(pink, vAlpha * 0.85);
      }
    `,
  });
  const sakuraPetals = new THREE.Points(petalGeo, petalMat);
  sakuraPetals.frustumCulled = false;
  scene.add(sakuraPetals);

  const LANTERN_COUNT = 64;
  const lanternMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uDuskAmt: LSTATE.duskAmt,
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        mat4 instMat = mat4(1.0);
        #ifdef USE_INSTANCING
          instMat = instanceMatrix;
        #endif
        vec4 wp = modelMatrix * instMat * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      uniform float uDuskAmt;
      uniform vec3 uCamPos;
      void main() {
        float duskVis = smoothstep(0.22, 0.65, uDuskAmt);
        if (duskVis < 0.02) discard;
        float dCam = length(vWorldPos - uCamPos);
        float fade = duskVis * smoothstep(8.0, 22.0, dCam) * (1.0 - smoothstep(260.0, 440.0, dCam));
        vec3 glow = mix(vec3(1.05, 0.62, 0.24), vec3(1.38, 1.12, 0.64), 1.0 - abs(vUv.y - 0.42) * 1.8);
        gl_FragColor = vec4(glow, fade * 0.94);
      }
    `,
  });
  const lanternGeo = new THREE.CylinderGeometry(0.42, 0.32, 0.92, 7);
  const lanternInst = new THREE.InstancedMesh(lanternGeo, lanternMat, LANTERN_COUNT);
  lanternInst.frustumCulled = false;
  const lanternData = [];
  for (let i = 0; i < LANTERN_COUNT; i++) {
    lanternData.push({
      x: (Math.random() - 0.5) * 180,
      y: 12 + Math.random() * 58,
      z: -30 - Math.random() * 280,
      speedY: 1.4 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      scale: 0.9 + Math.random() * 0.85,
    });
  }
  scene.add(lanternInst);
  const lanternDummy = new THREE.Object3D();

  // === H. DARK-TIPPED WHITE 3D GULLS ===
  function buildGullWingGeo(dir) {
    const x1 = dir * 0.40;
    const x2 = dir * 0.86;
    const verts = new Float32Array([
      0, 0, -0.14,   x1, 0.05, -0.11,   0, 0, 0.12,
      x1, 0.05, -0.11, x1, 0.03, 0.08,  0, 0, 0.12,
      x1, 0.05, -0.11, x2, 0.01, 0.07,  x1, 0.03, 0.08,
    ]);
    const colors = new Float32Array([
      1, 1, 1,  1, 1, 1,  1, 1, 1,
      1, 1, 1,  1, 1, 1,  1, 1, 1,
      0.92, 0.94, 0.96,  0.14, 0.19, 0.25,  0.22, 0.28, 0.34,
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }

  const birds = [];
  const wingGeoL = buildGullWingGeo(-1);
  const wingGeoR = buildGullWingGeo(1);
  const birdBodyGeo = new THREE.ConeGeometry(0.08, 0.60, 5);
  birdBodyGeo.rotateX(Math.PI / 2);
  const bCount = birdBodyGeo.attributes.position.count;
  const bCols = new Float32Array(bCount * 3).fill(1.0);
  birdBodyGeo.setAttribute("color", new THREE.BufferAttribute(bCols, 3));
  const birdMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

  for (let i = 0; i < 24; i++) {
    const flockCenterX = (i < 12 ? -22 : 24) + (Math.random() - 0.5) * 18;
    const flockCenterY = 64 + (Math.random() - 0.5) * 16;
    const flockCenterZ = -120 - (i % 12) * 18 - Math.random() * 12;

    const grp = new THREE.Group();
    const body = new THREE.Mesh(birdBodyGeo, birdMat);
    const wL = new THREE.Mesh(wingGeoL, birdMat);
    const wR = new THREE.Mesh(wingGeoR, birdMat);
    grp.add(body, wL, wR);
    grp.position.set(flockCenterX, flockCenterY, flockCenterZ);
    scene.add(grp);
    birds.push({ grp, wL, wR, phase: Math.random() * Math.PI * 2, speed: 6 + Math.random() * 4 });
  }

  function update(dt, time, planePos, camPos, dayPhase = 0.0) {
    applyLightingState(dayPhase);

    for (let i = 0; i < NUM_CHUNKS; i++) {
      const chunk = terrainChunks[i];
      if (chunk.position.z > planePos.z + CHUNK_LEN * 1.15) {
        const nextZ = chunk.position.z - NUM_CHUNKS * CHUNK_LEN;
        updateChunkGeometry(chunk, waterChunks[i], nextZ);
        populateChunkProps(i, nextZ);
      }
    }

    // Animate delivery beacon rings & chimney smoke
    for (let c = 0; c < NUM_CHUNKS; c++) {
      const list = chunkDeliveries[c];
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (!d.delivered && d.ring) {
          d.ring.position.y = d.baseRingY + Math.sin(time * 2.4 + i) * 0.9;
          const s = 1.0 + Math.sin(time * 3.0 + i) * 0.08;
          d.ring.scale.setScalar(s);
          d.ring.material.opacity = 0.65 + Math.sin(time * 3.2) * 0.25;
        }
        for (let k = 0; k < d.smokePuffs.length; k++) {
          const p = d.smokePuffs[k];
          const t = (time * 0.28 + p.offset) % 1.0;
          p.sp.position.y = d.topY + 0.5 + t * 8.5;
          p.sp.position.x = d.x + 0.6 + Math.sin(time * 1.4 + k) * 0.7 + t * 1.6;
          p.sp.scale.setScalar(1.1 + t * 2.1);
          p.sp.material.opacity = (1.0 - t) * 0.28;
        }
      }
    }

    // Animate Red Ghibli Trawler Boats
    for (let i = 0; i < trawlerBoats.length; i++) {
      const b = trawlerBoats[i];
      const show = currentBiome === "coast" || i < 3;
      b.mesh.visible = show;
      if (!show) continue;

      b.z -= b.speed * dt;
      if (b.z > planePos.z + 65) placeBoatInOpenWater(b, b.z - 460);
      else if (b.z < planePos.z - 395) placeBoatInOpenWater(b, b.z + 460);

      let bx = b.x;
      let yaw = 0;
      if (currentBiome === "valley") {
        bx = riverCenterX(b.z) + Math.sin(i * 2.1 + b.z * 0.02) * 2.4;
        const dx = (riverCenterX(b.z - 1.5) - riverCenterX(b.z + 1.5)) / 3.0;
        yaw = Math.atan2(-dx, 1.0);
      } else {
        // Gentle sea course correction if drifting near a shallow island shore
        if (coastTerrainHeight(bx, b.z) > WATER_Y - 1.1) {
          placeBoatInOpenWater(b, b.z);
          bx = b.x;
        }
        yaw = Math.sin(time * 0.25 + b.phase) * 0.14;
      }

      const rollWave = Math.sin(time * 1.8 + b.phase) * 0.045;
      const pitchWave = Math.cos(time * 1.4 + b.phase) * 0.025;
      b.mesh.position.set(bx, WATER_Y - 0.12 + Math.sin(time * 2.1 + b.phase) * 0.08, b.z);
      b.mesh.rotation.set(pitchWave, yaw, rollWave);
      b.mesh.scale.setScalar(b.scale);
    }

    // Clouds loop
    let cloudsDirty = false;
    for (let f = 0; f < cloudFormations.length; f++) {
      const form = cloudFormations[f];
      if (form.z > planePos.z + 115) {
        form.z -= CLOUD_LOOP_LEN;
        cloudsDirty = true;
      }
    }
    if (cloudsDirty) syncClouds();

    // Koi & reef fish inside open water
    for (let i = 0; i < FISH_COUNT; i++) {
      const f = fishData[i];
      f.z -= f.speed * dt;
      if (f.z > planePos.z + 45) f.z -= 440;
      else if (f.z < planePos.z - 395) f.z += 440;

      let fx;
      let yaw = 0;
      if (currentBiome === "coast") {
        fx = f.xOff + Math.sin(time * 1.1 + f.phase) * 1.8;
        if (coastTerrainHeight(fx, f.z) > WATER_Y - 0.8) fx = 0;
      } else {
        fx = riverCenterX(f.z) + f.laneOffset * riverWidth(f.z) + Math.sin(time * 1.3 + f.phase) * 0.6;
        const dx = (riverCenterX(f.z - 1.5) - riverCenterX(f.z + 1.5)) / 3.0;
        yaw = Math.atan2(-dx, 1.0);
      }
      fishDummy.position.set(fx, f.depth + Math.sin(time * 2.0 + f.phase) * 0.08, f.z);
      fishDummy.rotation.set(0, yaw, 0);
      fishDummy.scale.setScalar(f.scale);
      fishDummy.updateMatrix();
      fishInst.setMatrixAt(i, fishDummy.matrix);
    }
    fishInst.instanceMatrix.needsUpdate = true;

    rayQuat.setFromUnitVectors(upVec, LSTATE.sunDir);
    for (let i = 0; i < godRays.length; i++) {
      const ray = godRays[i];
      if (ray.position.z > planePos.z + 75) {
        ray.position.z -= 510;
      }
    }

    const mp = moteGeo.attributes.position;
    for (let i = 0; i < MOTE_COUNT; i++) {
      let mx = mp.getX(i);
      let mz = mp.getZ(i);
      if (mz > planePos.z + 25) mz -= 115;
      else if (mz < planePos.z - 90) mz += 115;
      if (mx > planePos.x + 48) mx -= 96;
      else if (mx < planePos.x - 48) mx += 96;
      mp.setXYZ(i, mx, mp.getY(i), mz);
    }
    mp.needsUpdate = true;

    const pp = petalGeo.attributes.position;
    for (let i = 0; i < PETAL_COUNT; i++) {
      let px = pp.getX(i) + dt * 0.6;
      let py = pp.getY(i) - dt * 1.1;
      let pz = pp.getZ(i);
      if (py < 6) py += 52;
      if (pz > planePos.z + 25) pz -= 115;
      else if (pz < planePos.z - 90) pz += 115;
      if (px > planePos.x + 48) px -= 96;
      else if (px < planePos.x - 48) px += 96;
      pp.setXYZ(i, px, py, pz);
    }
    pp.needsUpdate = true;

    if (LSTATE.duskAmt.value > 0.2) {
      lanternInst.visible = true;
      for (let i = 0; i < LANTERN_COUNT; i++) {
        const l = lanternData[i];
        l.y += l.speedY * dt;
        if (l.y > 78) l.y = 10;
        if (l.z > planePos.z + 35) l.z -= 300;
        else if (l.z < planePos.z - 270) l.z += 300;
        lanternDummy.position.set(
          l.x + Math.sin(time * 0.9 + l.phase) * 1.4,
          l.y,
          l.z
        );
        lanternDummy.rotation.set(0, time * 0.4 + l.phase, 0);
        lanternDummy.scale.setScalar(l.scale);
        lanternDummy.updateMatrix();
        lanternInst.setMatrixAt(i, lanternDummy.matrix);
      }
      lanternInst.instanceMatrix.needsUpdate = true;
    } else {
      lanternInst.visible = false;
    }

    for (const b of birds) {
      b.grp.position.z -= b.speed * dt;
      const flap = Math.sin(time * 7.5 + b.phase) * 0.48;
      b.wL.rotation.z = flap;
      b.wR.rotation.z = -flap;
      if (b.grp.position.z > planePos.z + 30) {
        b.grp.position.z -= 320;
      } else if (b.grp.position.z < planePos.z - 320) {
        b.grp.position.z = planePos.z - 110 - Math.random() * 80;
      }
    }

    skyDome.position.copy(camPos);
    mountainRing.position.set(camPos.x, camPos.y - 45, camPos.z);
    mountainRingMat.uniforms.uOffsetZ.value = planePos.z;
    moonSprite.position.set(planePos.x + 70, camPos.y + 340, planePos.z - 1020);
    moonSprite.material.opacity = 0.95 - LSTATE.duskAmt.value * 0.12;

    valleyMat.uniforms.uTime.value = time;
    valleyMat.uniforms.uCamPos.value.copy(camPos);
    ghibliWaterMat.uniforms.uTime.value = time;
    ghibliWaterMat.uniforms.uCamPos.value.copy(camPos);
    ghibliBuildingMat.uniforms.uTime.value = time;
    ghibliBuildingMat.uniforms.uCamPos.value.copy(camPos);
    ghibliInstancedTreeMat.uniforms.uTime.value = time;
    ghibliInstancedTreeMat.uniforms.uCamPos.value.copy(camPos);
    ghibliLeafMat.uniforms.uTime.value = time;
    ghibliLeafMat.uniforms.uCamPos.value.copy(camPos);
    ghibliCliffRockMat.uniforms.uTime.value = time;
    ghibliCliffRockMat.uniforms.uCamPos.value.copy(camPos);
    fishMat.uniforms.uTime.value = time;
    fishMat.uniforms.uCamPos.value.copy(camPos);
    ghibli3DCloudMat.uniforms.uCamPos.value.copy(camPos);
    ghibli3DCloudMat.uniforms.uPlanePos.value.copy(planePos);
    godRayMat.uniforms.uTime.value = time;
    godRayMat.uniforms.uCamPos.value.copy(camPos);
    sunMoteMat.uniforms.uTime.value = time;
    sunMoteMat.uniforms.uCamPos.value.copy(camPos);
    sunMoteMat.uniforms.uPlanePos.value.copy(planePos);
    petalMat.uniforms.uTime.value = time;
    petalMat.uniforms.uCamPos.value.copy(camPos);
    petalMat.uniforms.uPlanePos.value.copy(planePos);
    lanternMat.uniforms.uCamPos.value.copy(camPos);
  }

  return {
    WATER_Y,
    terrainHeight,
    getSafeAltitude,
    checkBuildingCrash,
    isOverWater,
    setBiome,
    getBiome: () => currentBiome,
    getNearestDelivery,
    markDelivered,
    checkUnderBridge,
    getLightingState: () => LSTATE,
    riverCenterX,
    riverWidth,
    update,
  };
}
