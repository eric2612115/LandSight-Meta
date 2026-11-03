// The studio: a pale cyclorama floor that fades into the background, a soft sun with VSM shadows falling north-west
// (away from the site), an environment of light panels, GTAO kept off the paper and the floor. frame(state, cam) poses
// the model and draws one frame; project() maps a world point to the 1600 × 900 console.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FOV} from './land.js';
import {LOOK} from './look.js';
import {buildModel, SITE_CUT, TOWER_CUT} from './model.js';

const V3 = THREE.Vector3;
const FLOOR_FRAG = /* glsl */ `uniform vec3 uF; uniform vec3 uBg; varying vec3 vW;
  void main(){ float d = length(vW.xz - vec2(24.0, -22.0)); gl_FragColor = vec4(mix(uF, uBg, smoothstep(70.0, 260.0, d)), 1.0); }`;
// Ink: depth creases and normal breaks read from the AO pass's g-buffer, drawn over the picture (the teardown kit's
// Strandbeest stage, MIT; see LICENSE-teardown).
const INK_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tNormal;
  uniform float uNear; uniform float uFar; uniform vec2 uPx; uniform vec3 uInk; uniform float uStrength;
  varying vec2 vUv;
  float lz(vec2 uv){ float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
  vec3 nn(vec2 uv){ return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0); }
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    float z0 = lz(vUv);
    float zl = lz(vUv - vec2(uPx.x, 0.0)), zr = lz(vUv + vec2(uPx.x, 0.0));
    float zd = lz(vUv - vec2(0.0, uPx.y)), zu = lz(vUv + vec2(0.0, uPx.y));
    float lap = (abs(zl + zr - 2.0 * z0) + abs(zu + zd - 2.0 * z0)) / max(z0, 1e-3);
    float eD = smoothstep(0.004, 0.016, lap);
    vec3 n0 = nn(vUv);
    float eN = max(max(1.0 - dot(n0, nn(vUv - vec2(uPx.x, 0.0))), 1.0 - dot(n0, nn(vUv + vec2(uPx.x, 0.0)))),
                   max(1.0 - dot(n0, nn(vUv - vec2(0.0, uPx.y))), 1.0 - dot(n0, nn(vUv + vec2(0.0, uPx.y)))));
    float e = max(eD, smoothstep(0.3, 0.6, eN));
    c.rgb = mix(c.rgb, uInk, e * uStrength);
    gl_FragColor = c;
  }`;
const FLOOR_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LOOK.bg);
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.3, 3000);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 8}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 1.0;
  gtao.updateGtaoMaterial({radius: 2.4, distanceExponent: 1.5, thickness: 1.6, scale: 1.25, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16});
  gtao.normalMaterial.clippingPlanes = [TOWER_CUT, SITE_CUT];
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  const hidden = [];
  let shown = [];
  composer.addPass(new Toggle(() => {
    shown = hidden.filter((o) => o.visible);
    for (const o of shown) o.visible = false;
  }));
  composer.addPass(gtao);
  composer.addPass(new Toggle(() => {
    for (const o of shown) o.visible = true;
  }));
  const ink = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: {value: null}, tDepth: {value: gtao.depthTexture}, tNormal: {value: gtao.normalTexture},
        uNear: {value: camera.near}, uFar: {value: camera.far}, uPx: {value: new THREE.Vector2(1 / 1920, 1 / 1080)},
        uInk: {value: new THREE.Color().setRGB(0.075, 0.075, 0.08, THREE.LinearSRGBColorSpace)}, uStrength: {value: 0.8},
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: INK_FRAG,
    }),
  );
  composer.addPass(ink);
  composer.addPass(new OutputPass());

  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#e6e3dd');
    const panel = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 0.99, 0.97).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(14, 14, new V3(2, 16, 4), 2.3);
    panel(4, 16, new V3(-14, 5, 6), 2.6);
    panel(4, 16, new V3(14, 5, -6), 1.8);
    panel(20, 3, new V3(0, 2, 16), 1.4);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#cfcac0', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -3;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  const SUN_DIR = new V3(0.42, 0.82, 0.5).normalize();
  const sun = new THREE.DirectionalLight('#fff7ec', 2.1);
  sun.castShadow = true;
  const EXT = 78;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 10, far: 520});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 5;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(24, 20, -24);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 260);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#fffaf3', '#cfc6b8', 0.8));

  const model = buildModel();
  scene.add(model.root);
  const floorY = model.slabTop - 0.6 - 0.01;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShaderMaterial({vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: {uF: {value: new THREE.Color('#d6cfc2')}, uBg: {value: new THREE.Color(LOOK.bg)}}, toneMapped: false}));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({color: '#5a4e40', opacity: 0.26, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = floorY + 0.005;
  shade.receiveShadow = true;
  // a soft contact shadow where the model's plinth meets the floor
  const blob = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 40, 128, 128, 128);
    g.addColorStop(0, 'rgba(60,50,40,0.5)');
    g.addColorStop(1, 'rgba(60,50,40,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(100, 104), new THREE.MeshBasicMaterial({map: t, transparent: true, depthWrite: false, toneMapped: false}));
    m.rotation.x = -Math.PI / 2;
    m.position.set(25, floorY + 0.02, -22);
    m.renderOrder = 1;
    return m;
  })();
  scene.add(floor, shade, blob);
  hidden.push(floor, shade, blob);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    ink.material.uniforms.uPx.value.set(1 / (w * pr), 1 / (h * pr));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const D2R = Math.PI / 180;
  const up = new V3();
  /** cam: {tx, ty, tz (world), az, el (degrees; az 0 = from the south, 90 = from the east), d (m), sx, sy (px shift)} */
  const place = (cam) => {
    const az = cam.az * D2R;
    const el = cam.el * D2R;
    camera.position.set(cam.tx + cam.d * Math.cos(el) * Math.sin(az), cam.ty + cam.d * Math.sin(el), cam.tz + cam.d * Math.cos(el) * Math.cos(az));
    // looking straight down, north stays up the screen
    const k = Math.min(1, Math.max(0, (cam.el - 70) / 19.5));
    up.set(-Math.sin(az) * k, 1 - k, -Math.cos(az) * k).normalize();
    camera.up.copy(up);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
  };
  const frame = (st, cam) => {
    model.update(st);
    place(cam);
    composer.render();
  };
  const pv = new V3();
  const project = (p) => {
    pv.set(p[0], p[1], p[2]).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  return {renderer, scene, camera, composer, gtao, sun, model, resize, frame, place, project, size};
}
