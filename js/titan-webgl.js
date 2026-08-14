import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const snoise3GLSL = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
        const vec2  C = vec2(1.0/6.0, 1.0/3.0);
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy; 
        vec3 x3 = x0 - D.yyy;      
        i = mod289(i);
        vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857; 
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );    
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }
`;

class TitanWebGL {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.themes = [
      {
        core: [new THREE.Color(0.1, 0.0, 0.0), new THREE.Color(0.9, 0.05, 0.0), new THREE.Color(1.0, 0.4, 0.0), new THREE.Color(1.0, 0.9, 0.2)],
        vein: { surface: new THREE.Color(0.0, 0.8, 1.0), coreA: new THREE.Color(0.8, 0.1, 0.0), coreB: new THREE.Color(1.0, 0.6, 0.0) },
        boundary: new THREE.Color(0.0, 1.5, 3.0),
        map: new THREE.Color(0x006699),
        glass: new THREE.Color(0x001133),
        volcano: new THREE.Color(0xff5500),
        dust: new THREE.Color(0x223355),
        bg: new THREE.Color(0x010102)
      },
      {
        core: [new THREE.Color(0.05, 0.0, 0.1), new THREE.Color(0.5, 0.0, 0.5), new THREE.Color(1.0, 0.0, 0.8), new THREE.Color(1.0, 0.5, 1.0)],
        vein: { surface: new THREE.Color(0.2, 1.0, 0.2), coreA: new THREE.Color(0.8, 0.0, 0.8), coreB: new THREE.Color(0.0, 0.8, 1.0) },
        boundary: new THREE.Color(2.0, 0.0, 1.5), 
        map: new THREE.Color(0x330055),
        glass: new THREE.Color(0x110022),
        volcano: new THREE.Color(0x00ff00), 
        dust: new THREE.Color(0x2a0044),
        bg: new THREE.Color(0x020005)
      },
      {
        core: [new THREE.Color(0.05, 0.02, 0.0), new THREE.Color(0.8, 0.4, 0.0), new THREE.Color(1.0, 0.8, 0.2), new THREE.Color(1.5, 1.5, 1.5)],
        vein: { surface: new THREE.Color(0.0, 0.3, 2.0), coreA: new THREE.Color(1.0, 0.8, 0.0), coreB: new THREE.Color(1.0, 0.3, 0.0) },
        boundary: new THREE.Color(1.5, 1.5, 2.5), 
        map: new THREE.Color(0x112244),
        glass: new THREE.Color(0x221100),
        volcano: new THREE.Color(0xffffff),
        dust: new THREE.Color(0x443311),
        bg: new THREE.Color(0x000103)
      }
    ];
    this.activeTheme = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010102);

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
    this.camera.position.z = 7;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      1.8,  // Strength
      0.48, // Radius
      0.65  // Threshold
    );
    this.composer.addPass(this.bloomPass);

    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.uniforms['resolution'].value.set(1 / this.width, 1 / this.height);
    this.composer.addPass(this.fxaaPass);

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    this.dirLight = new THREE.DirectionalLight(0xfff4e0, 3.2);
    this.dirLight.position.set(3, 4, 5);
    this.scene.add(this.dirLight);

    // 1. Background Colossal Titan Torus Ring
    this.torusGroup = new THREE.Group();
    this.scene.add(this.torusGroup);
    this.initTitanTorus();

    // 2. Molten Magma Planetary Core Player Orb (1,200 Veins, Simplex Noise, Volcanoes)
    this.initMoltenPlanetOrb();

    // Resize listener
    window.addEventListener('resize', () => this.onResize());
  }

  setTheme(index) {
    this.activeTheme = Math.max(0, Math.min(this.themes.length - 1, index));
  }

  /* ---------------- 1. TITAN TORUS RING ---------------- */

  addBarycentricCoords(geo) {
    const g = geo.toNonIndexed();
    const count = g.attributes.position.count;
    const bary = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 3) {
      bary[i * 3] = 1; bary[i * 3 + 1] = 0; bary[i * 3 + 2] = 0;
      bary[(i + 1) * 3] = 0; bary[(i + 1) * 3 + 1] = 1; bary[(i + 1) * 3 + 2] = 0;
      bary[(i + 2) * 3] = 0; bary[(i + 2) * 3 + 1] = 0; bary[(i + 2) * 3 + 2] = 1;
    }
    g.setAttribute('barycentric', new THREE.BufferAttribute(bary, 3));
    return g;
  }

  initTitanTorus() {
    this.TORUS_R = 2.4;
    this.TORUS_r = 0.46;
    this.FRAG_SCALE = 45;

    const textureLoader = new THREE.TextureLoader();
    this.diffuse = textureLoader.load('https://raw.githubusercontent.com/danielyl123/person/refs/heads/main/diffuse.jpg');
    this.normalTex = textureLoader.load('https://raw.githubusercontent.com/danielyl123/person/refs/heads/main/normal.jpg');
    this.arm = textureLoader.load('https://raw.githubusercontent.com/danielyl123/person/refs/heads/main/arm.jpg');

    [this.diffuse, this.normalTex, this.arm].forEach((tex) => {
      tex.repeat.set(2, 2);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    });
    this.diffuse.colorSpace = THREE.SRGBColorSpace;

    // Barycentric Wireframe Torus
    this.wireMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 barycentric;
        varying vec3 vBary;
        void main() {
          vBary = barycentric;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vBary;
        float wireMask(vec3 b, float t) {
          vec3 d = fwidth(b);
          vec3 a = smoothstep(vec3(0.0), d * t, b);
          return 1.0 - min(a.x, min(a.y, a.z));
        }
        void main() {
          float wf = wireMask(vBary, 1.6);
          vec3 col = mix(vec3(0.08, 0.015, 0.0), vec3(1.0, 0.35, 0.05), wf);
          col = mix(col, vec3(1.0, 0.88, 0.4) * 2.4, wf * 0.65);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      extensions: { derivatives: true }
    });

    const innerGeo = this.addBarycentricCoords(new THREE.TorusGeometry(this.TORUS_R, this.TORUS_r, 70, 70));
    this.wireMesh = new THREE.Mesh(innerGeo, this.wireMaterial);
    this.torusGroup.add(this.wireMesh);

    // Voronoi Basalt Plates
    const baseGeo = new THREE.TorusGeometry(this.TORUS_R, this.TORUS_r, 80, 80);
    const nonIndexed = baseGeo.toNonIndexed();
    baseGeo.dispose();

    const pos = nonIndexed.attributes.position.array;
    const nrm = nonIndexed.attributes.normal.array;
    const uvData = nonIndexed.attributes.uv.array;
    const tris = pos.length / 9;

    const cellMap = new Map();
    for (let t = 0; t < tris; t++) {
      const uc = (uvData[t * 6] + uvData[t * 6 + 2] + uvData[t * 6 + 4]) / 3;
      const vc = (uvData[t * 6 + 1] + uvData[t * 6 + 3] + uvData[t * 6 + 5]) / 3;
      const s = this.cellSeed(uc, vc);
      const k = `${s[0].toFixed(8)}_${s[1].toFixed(8)}`;
      if (!cellMap.has(k)) cellMap.set(k, { s, t: [] });
      cellMap.get(k).t.push(t);
    }

    const mat = new THREE.MeshStandardMaterial({
      map: this.diffuse,
      normalMap: this.normalTex,
      roughnessMap: this.arm,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide
    });

    this.fragments = [];
    const TWO_PI = Math.PI * 2;

    for (const { s: seed, t: triList } of cellMap.values()) {
      if (!triList.length) continue;
      const vc = triList.length * 3;
      const pArr = new Float32Array(vc * 3), nArr = new Float32Array(vc * 3), uvArr = new Float32Array(vc * 2);
      let vi = 0;
      for (const tri of triList) {
        for (let v = 0; v < 3; v++) {
          const sv = tri * 3 + v;
          pArr[vi * 3] = pos[sv * 3]; pArr[vi * 3 + 1] = pos[sv * 3 + 1]; pArr[vi * 3 + 2] = pos[sv * 3 + 2];
          nArr[vi * 3] = nrm[sv * 3]; nArr[vi * 3 + 1] = nrm[sv * 3 + 1]; nArr[vi * 3 + 2] = nrm[sv * 3 + 2];
          uvArr[vi * 2] = uvData[sv * 2]; uvArr[vi * 2 + 1] = uvData[sv * 2 + 1];
          vi++;
        }
      }

      const phi = seed[0] * TWO_PI, theta = seed[1] * TWO_PI;
      const cx = (this.TORUS_R + this.TORUS_r * Math.cos(theta)) * Math.cos(phi);
      const cy = (this.TORUS_R + this.TORUS_r * Math.cos(theta)) * Math.sin(phi);
      const cz = this.TORUS_r * Math.sin(theta);
      const cellCenter = new THREE.Vector3(cx, cy, cz);
      const majorPt = new THREE.Vector3(this.TORUS_R * Math.cos(phi), this.TORUS_R * Math.sin(phi), 0);
      const cellNormal = cellCenter.clone().sub(majorPt).normalize();

      const SHRINK = 0.96;
      for (let i = 0; i < pArr.length; i += 3) {
        pArr[i] = (pArr[i] - cx) * SHRINK;
        pArr[i + 1] = (pArr[i + 1] - cy) * SHRINK;
        pArr[i + 2] = (pArr[i + 2] - cz) * SHRINK;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nArr, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

      const rnd = this.hash2(seed[0] * 137.53, seed[1] * 137.53);
      const up = Math.abs(cellNormal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      const tang = new THREE.Vector3().crossVectors(cellNormal, up).normalize();
      const bitang = new THREE.Vector3().crossVectors(cellNormal, tang);
      const aa = rnd[0] * TWO_PI;
      const rotAxis = tang.clone().multiplyScalar(Math.cos(aa)).addScaledVector(bitang, Math.sin(aa)).normalize();

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(cellCenter).addScaledVector(cellNormal, 0.015);
      mesh.userData = { cellCenter, cellNormal, rotAxis, maxAngle: 0.7 + rnd[1] * 0.9, lift: 0 };
      this.torusGroup.add(mesh);
      this.fragments.push(mesh);
    }

    nonIndexed.dispose();

    this.rcMesh = new THREE.Mesh(
      new THREE.TorusGeometry(this.TORUS_R, this.TORUS_r, 60, 60),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.torusGroup.add(this.rcMesh);
    this.raycaster = new THREE.Raycaster();
    this.playerScreenPos = new THREE.Vector2(-999, -999);
    this.hover = { point: new THREE.Vector3(), active: 0 };
    this._localHover = new THREE.Vector3();
  }

  hash2(px, py) {
    const a = Math.sin(px * 127.1 + py * 311.7) * 43758.5453;
    const b = Math.sin(px * 269.5 + py * 183.3) * 43758.5453;
    return [a - Math.floor(a), b - Math.floor(b)];
  }

  cellSeed(u, v) {
    const n = [Math.floor(u * this.FRAG_SCALE), Math.floor(v * this.FRAG_SCALE)];
    const f = [u * this.FRAG_SCALE - n[0], v * this.FRAG_SCALE - n[1]];
    let md = Infinity, best = [...n];
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const o = this.hash2(n[0] + i, n[1] + j);
        const r = [i + o[0] - f[0], j + o[1] - f[1]];
        const d = r[0] * r[0] + r[1] * r[1];
        if (d < md) { md = d; best = [n[0] + i + o[0], n[1] + j + o[1]]; }
      }
    }
    return [best[0] / this.FRAG_SCALE, best[1] / this.FRAG_SCALE];
  }

  /* ---------------- 2. MOLTEN MAGMA PLANETARY CORE ORB ---------------- */

  getPointOnSphere(radius) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );
  }

  initMoltenPlanetOrb() {
    this.orbGroup = new THREE.Group();
    this.scene.add(this.orbGroup);

    // Scale down from 10.0 to fit the player orb scale (~0.35 world units)
    this.ORB_SCALE = 0.038;
    this.CORE_RADIUS = 2.2 * this.ORB_SCALE;
    this.OUTER_RADIUS = 10.0 * this.ORB_SCALE;
    this.NUM_VEINS = 1200;
    this.POINTS_PER_VEIN = 45;

    const textureLoader = new THREE.TextureLoader();
    this.earthTex = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg');

    this.orbUniforms = {
      time: { value: 0 },
      cDark: { value: this.themes[0].core[0].clone() },
      cRed: { value: this.themes[0].core[1].clone() },
      cOrange: { value: this.themes[0].core[2].clone() },
      cYellow: { value: this.themes[0].core[3].clone() },
      cSurface: { value: this.themes[0].vein.surface.clone() },
      cCoreA: { value: this.themes[0].vein.coreA.clone() },
      cCoreB: { value: this.themes[0].vein.coreB.clone() },
      boundaryColor: { value: this.themes[0].boundary.clone() },
      tEarth: { value: this.earthTex }
    };

    // A. Molten Simplex 3D Noise Core Sphere
    const coreGeo = new THREE.SphereGeometry(this.CORE_RADIUS, 90, 90);
    const coreMat = new THREE.ShaderMaterial({
      uniforms: this.orbUniforms,
      vertexShader: `
        uniform float time;
        varying vec3 vPosition;
        varying vec3 vNormal;
        ${snoise3GLSL}
        void main() {
          vPosition = position;
          vNormal = normal;
          float displacement = snoise(position * (1.8 / ${this.ORB_SCALE.toFixed(3)}) + time * 0.4) * (0.15 * ${this.ORB_SCALE.toFixed(3)});
          vec3 newPosition = position + normal * displacement;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 cDark;
        uniform vec3 cRed;
        uniform vec3 cOrange;
        uniform vec3 cYellow;

        varying vec3 vPosition;
        varying vec3 vNormal;
        ${snoise3GLSL}
        
        void main() {
          float n1 = snoise(vPosition * (1.5 / ${this.ORB_SCALE.toFixed(3)}) - time * 0.5);
          float n2 = snoise(vPosition * (4.0 / ${this.ORB_SCALE.toFixed(3)}) + time * 0.3);
          float noiseVal = n1 * 0.6 + n2 * 0.4;

          vec3 color;
          if (noiseVal < -0.1) {
            color = mix(cDark, cRed, smoothstep(-0.5, -0.1, noiseVal));
          } else if (noiseVal < 0.3) {
            color = mix(cRed, cOrange, smoothstep(-0.1, 0.3, noiseVal));
          } else {
            color = mix(cOrange, cYellow, smoothstep(0.3, 0.8, noiseVal));
          }

          float fresnel = dot(vNormal, vec3(0.0, 0.0, 1.0));
          fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
          color += cOrange * pow(fresnel, 2.0) * 0.8;
          color *= 1.8;

          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    this.coreMesh = new THREE.Mesh(coreGeo, coreMat);
    this.orbGroup.add(this.coreMesh);

    // B. 1,200 Veins Fibers (Flowing Bezier Energy Filaments)
    const veinPositions = [];
    const veinProgress = [];
    const veinOffsets = [];
    const veinRands = [];

    for (let i = 0; i < this.NUM_VEINS; i++) {
      const start = this.getPointOnSphere(this.OUTER_RADIUS);
      const end = start.clone().normalize().multiplyScalar(this.CORE_RADIUS * 0.85);

      const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
      mid.normalize().multiplyScalar(this.OUTER_RADIUS * 0.55);

      const tangent = new THREE.Vector3().crossVectors(start, new THREE.Vector3(0, 1, 0)).normalize();
      const bitangent = new THREE.Vector3().crossVectors(start, tangent).normalize();

      const offsetScalar = (Math.random() - 0.5) * 6 * this.ORB_SCALE;
      mid.add(tangent.multiplyScalar(offsetScalar));
      mid.add(bitangent.multiplyScalar(offsetScalar));

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const points = curve.getPoints(this.POINTS_PER_VEIN);
      const offset = Math.random();
      const randSeed = Math.random();

      for (let j = 0; j < this.POINTS_PER_VEIN; j++) {
        veinPositions.push(points[j].x, points[j].y, points[j].z);
        veinPositions.push(points[j + 1].x, points[j + 1].y, points[j + 1].z);
        veinProgress.push(j / this.POINTS_PER_VEIN, (j + 1) / this.POINTS_PER_VEIN);
        veinOffsets.push(offset, offset);
        veinRands.push(randSeed, randSeed);
      }
    }

    const veinGeo = new THREE.BufferGeometry();
    veinGeo.setAttribute('position', new THREE.Float32BufferAttribute(veinPositions, 3));
    veinGeo.setAttribute('progress', new THREE.Float32BufferAttribute(veinProgress, 1));
    veinGeo.setAttribute('offset', new THREE.Float32BufferAttribute(veinOffsets, 1));
    veinGeo.setAttribute('randomSeed', new THREE.Float32BufferAttribute(veinRands, 1));

    const veinMat = new THREE.ShaderMaterial({
      uniforms: this.orbUniforms,
      vertexShader: `
        attribute float progress;
        attribute float offset;
        attribute float randomSeed;
        varying float vProgress;
        varying float vOffset;
        varying float vRandom;
        void main() {
          vProgress = progress;
          vOffset = offset;
          vRandom = randomSeed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 cSurface;
        uniform vec3 cCoreA;
        uniform vec3 cCoreB;

        varying float vProgress;
        varying float vOffset;
        varying float vRandom;
        
        void main() {
          vec3 targetCoreColor = mix(cCoreA, cCoreB, vRandom);
          vec3 color = mix(cSurface, targetCoreColor, pow(vProgress, 1.5));

          float speed = 0.35;
          float phase = vProgress - time * speed + vOffset * 10.0;
          float flow = fract(phase);
          float pulse = exp(-flow * 10.0);
          
          vec3 pulseGlow = color * pulse * 10.0; 
          color += pulseGlow;

          float alphaBase = 0.02; 
          float alphaPulse = pulse * 0.9;
          float alpha = alphaBase + alphaPulse;
          
          alpha *= smoothstep(0.0, 0.05, vProgress) * smoothstep(1.0, 0.8, vProgress);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.veinMesh = new THREE.LineSegments(veinGeo, veinMat);
    this.orbGroup.add(this.veinMesh);

    // C. Outer Holographic Earth Globe Boundary Sphere
    const earthGlobeGeo = new THREE.SphereGeometry(this.OUTER_RADIUS * 0.995, 90, 90);
    const earthGlobeMat = new THREE.ShaderMaterial({
      uniforms: this.orbUniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tEarth;
        uniform vec3 boundaryColor;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          vec2 texel = vec2(1.5 / 2048.0, 1.5 / 1024.0); 
          
          float c = texture2D(tEarth, vUv).r;
          float r = texture2D(tEarth, vUv + vec2(texel.x, 0.0)).r;
          float u = texture2D(tEarth, vUv + vec2(0.0, texel.y)).r;
          float l = texture2D(tEarth, vUv + vec2(-texel.x, 0.0)).r;
          float d = texture2D(tEarth, vUv + vec2(0.0, -texel.y)).r;
          
          float edge = abs(4.0 * c - r - u - l - d);
          float outline = smoothstep(0.1, 0.8, edge);
          
          vec3 color = boundaryColor * outline * 2.5;
          float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
          color += boundaryColor * fresnel * 0.5;
          
          float alpha = outline * 0.8 + fresnel * 0.2;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.earthGlobeMesh = new THREE.Mesh(earthGlobeGeo, earthGlobeMat);
    this.orbGroup.add(this.earthGlobeMesh);

    // D. 150 Volcano Points
    const volcanoPoints = [];
    for (let i = 0; i < 150; i++) {
      volcanoPoints.push(this.getPointOnSphere(this.OUTER_RADIUS));
    }
    const volcanoGeo = new THREE.BufferGeometry().setFromPoints(volcanoPoints);
    this.volcanoMat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: this.themes[0].volcano.clone() },
        size: { value: 6.0 * (window.devicePixelRatio || 1) },
        time: this.orbUniforms.time
      },
      vertexShader: `
        uniform float size;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (20.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float time;
        void main() {
          vec2 pt = gl_PointCoord - vec2(0.5);
          if(abs(pt.x) > 0.35 || abs(pt.y) > 0.35) discard;
          
          float throb = sin(time * 3.0 + gl_FragCoord.x) * 0.5 + 0.5;
          gl_FragColor = vec4(color * (1.5 + throb), 0.9);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.volcanoMesh = new THREE.Points(volcanoGeo, this.volcanoMat);
    this.orbGroup.add(this.volcanoMesh);
  }

  smoothstep(min, max, v) {
    const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
    return t * t * (3 - 2 * t);
  }

  update(dt = 1, playerX = 0, playerY = 0, isDashing = false, isBlasting = false) {
    const delta = (dt * 16.666) / 1000;
    const timeSpeed = isDashing ? 2.8 : (isBlasting ? 4.0 : 1.0);
    this.orbUniforms.time.value += delta * timeSpeed;

    // Theme Lerp
    const tgt = this.themes[this.activeTheme];
    const LERP_SPEED = 0.05 * dt;

    this.orbUniforms.cDark.value.lerp(tgt.core[0], LERP_SPEED);
    this.orbUniforms.cRed.value.lerp(tgt.core[1], LERP_SPEED);
    this.orbUniforms.cOrange.value.lerp(tgt.core[2], LERP_SPEED);
    this.orbUniforms.cYellow.value.lerp(tgt.core[3], LERP_SPEED);

    this.orbUniforms.cSurface.value.lerp(tgt.vein.surface, LERP_SPEED);
    this.orbUniforms.cCoreA.value.lerp(tgt.vein.coreA, LERP_SPEED);
    this.orbUniforms.cCoreB.value.lerp(tgt.vein.coreB, LERP_SPEED);

    this.orbUniforms.boundaryColor.value.lerp(tgt.boundary, LERP_SPEED);
    this.volcanoMat.uniforms.color.value.lerp(tgt.volcano, LERP_SPEED);

    // Convert 2D Player Position to 3D Space Coordinates on Camera Plane (Z = 0)
    const ndcX = (playerX / this.width) * 2 - 1;
    const ndcY = -(playerY / this.height) * 2 + 1;

    const targetPos3D = new THREE.Vector3(ndcX, ndcY, 0.5);
    targetPos3D.unproject(this.camera);
    targetPos3D.sub(this.camera.position).normalize();
    const distToPlane = -this.camera.position.z / targetPos3D.z;
    const worldPos = this.camera.position.clone().add(targetPos3D.multiplyScalar(distToPlane));

    this.orbGroup.position.lerp(worldPos, 0.6);
    this.orbGroup.rotation.y += 0.02 * dt;
    this.orbGroup.rotation.x += 0.01 * dt;

    // Slow majestic 3D rotation of Titan Torus ring
    this.torusGroup.rotation.y += 0.003 * dt;
    this.torusGroup.rotation.x = Math.sin(performance.now() * 0.0006) * 0.18;
    this.torusGroup.rotation.z = Math.cos(performance.now() * 0.0004) * 0.12;

    // Raycast Player position from 2D screen to 3D Torus
    this.playerScreenPos.x = ndcX;
    this.playerScreenPos.y = ndcY;

    this.raycaster.setFromCamera(this.playerScreenPos, this.camera);
    const hits = this.raycaster.intersectObject(this.rcMesh);

    if (hits.length > 0) {
      this.torusGroup.worldToLocal(this._localHover.copy(hits[0].point));
      this.hover.point.copy(this._localHover);
      this.hover.active = Math.min(this.hover.active + delta * 5, 1);
    } else {
      this.hover.active = Math.max(this.hover.active - delta * 2.5, 0);
    }

    // Dynamic Hinge Lift Physics for all 2500+ Voronoi Fragments
    for (let i = 0; i < this.fragments.length; i++) {
      const frag = this.fragments[i];
      const { cellCenter, cellNormal, rotAxis, maxAngle } = frag.userData;
      let target = 0;

      if (isDashing) {
        target = 0.85;
      } else if (isBlasting) {
        target = 1.0;
      } else if (this.hover.active > 0.01) {
        const dist = cellCenter.distanceTo(this.hover.point);
        target = (1 - this.smoothstep(0.35, 0.85, dist)) * this.hover.active;
      }

      const speed = target > frag.userData.lift ? 0.18 : 0.06;
      frag.userData.lift = THREE.MathUtils.lerp(frag.userData.lift, target, speed);
      const lift = frag.userData.lift;

      frag.position.copy(cellCenter).addScaledVector(cellNormal, 0.015 + lift * 0.35);
      frag.quaternion.setFromAxisAngle(rotAxis, lift * maxAngle);
    }

    // Render WebGL Composer
    this.composer.render();
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.composer.setSize(this.width, this.height);
    this.fxaaPass.uniforms['resolution'].value.set(1 / this.width, 1 / this.height);
  }
}

window.TitanWebGL = TitanWebGL;

window.addEventListener('DOMContentLoaded', () => {
  const titanCanvas = document.getElementById('titanCanvas');
  if (titanCanvas) {
    window.titanInstance = new TitanWebGL(titanCanvas);
  }
});
