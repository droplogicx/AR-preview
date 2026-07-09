import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const MAX_SIDE_VIEW_ANGLE = THREE.MathUtils.degToRad(70);
const MAX_VERTICAL_TILT_ANGLE = THREE.MathUtils.degToRad(20);
const HOVER_SIDE_TILT_ANGLE = THREE.MathUtils.degToRad(70);
const HOVER_VERTICAL_TILT_ANGLE = THREE.MathUtils.degToRad(20);
const FRAME_COLORS = {
  none: 'transparent',
  'natural-timber': '#caa375',
  white: '#e9e4d8',
  black: '#1a1a1a'
};

// Frame mockups — same assets and insets as ar-viewer.js / poster-studio.liquid.
const FRAME_MOCKUPS = {
  'natural-timber': {
    portrait: {
      width: 360,
      height: 500,
      window: { top: 0.018, left: 0.0278, right: 0.0278, bottom: 0.02 },
      matPct: 0.052
    },
    landscape: {
      width: 400,
      height: 291,
      window: { top: 0.0378, left: 0.0275, right: 0.0275, bottom: 0.0412 },
      matPct: 0.052,
      // Shrink only the frame rails; artwork size stays the same.
      railScale: 0.68
    }
  },
  white: {
    portrait: {
      width: 355,
      height: 500,
      window: { top: 0.018, left: 0.0254, right: 0.0254, bottom: 0.018 },
      matPct: 0.045
    },
    landscape: {
      width: 400,
      height: 284,
      window: { top: 0.0246, left: 0.0175, right: 0.0175, bottom: 0.0246 },
      matPct: 0.045
    }
  },
  black: {
    portrait: {
      width: 355,
      height: 500,
      window: { top: 0.018, left: 0.0254, right: 0.0254, bottom: 0.018 },
      matPct: 0.045
    },
    landscape: {
      width: 400,
      height: 284,
      window: { top: 0.0246, left: 0.0175, right: 0.0175, bottom: 0.0246 },
      matPct: 0.045
    }
  }
};

const ART_BLEED = 1.008;

function frameOrientation(printW, printH) {
  return printW >= printH ? 'landscape' : 'portrait';
}

function frameMockupConfig(frameId, printW, printH) {
  const set = FRAME_MOCKUPS[normalizeFrameId(frameId)] || FRAME_MOCKUPS['natural-timber'];
  return set[frameOrientation(printW, printH)] || set.portrait;
}

function computeFrameLayout(printW, printH, mockup, hasBorder) {
  const win = mockup.window;
  const innerFracW = 1 - win.left - win.right;
  const innerFracH = 1 - win.top - win.bottom;

  // Scale mockup pixel dimensions uniformly so the PNG is never stretched.
  const mockupInnerW = mockup.width * innerFracW;
  const mockupInnerH = mockup.height * innerFracH;
  const scale = Math.max(printW / mockupInnerW, printH / mockupInnerH, 0.001);
  const outerW = mockup.width * scale;
  const outerH = mockup.height * scale;

  const winW = outerW * innerFracW;
  const winH = outerH * innerFracH;
  const matPad = hasBorder ? Math.max(0.06, Math.min(winW, winH) * mockup.matPct) : 0;

  const fillW = winW;
  const fillH = winH;
  const artW = (hasBorder ? Math.max(0.2, fillW - matPad * 2) : fillW) * ART_BLEED;
  const artH = (hasBorder ? Math.max(0.2, fillH - matPad * 2) : fillH) * ART_BLEED;

  const railScale = mockup.railScale ?? 1;
  const displayOuterW = winW + (outerW - winW) * railScale;
  const displayOuterH = winH + (outerH - winH) * railScale;

  return {
    outerW: displayOuterW,
    outerH: displayOuterH,
    winW,
    winH,
    artW,
    artH,
    matPad,
    fillW,
    fillH
  };
}

function normalizeFrameId(frameId) {
  const id = String(frameId || '').toLowerCase().trim();
  if (!id || id === 'none' || id.includes('unfram')) return 'none';
  if (id.includes('white')) return 'white';
  if (id.includes('black')) return 'black';
  if (id.includes('natural') || id.includes('timber') || id.includes('wood') || id.includes('oak')) return 'natural-timber';
  return 'natural-timber';
}

function frameColorFor(frameId, color) {
  if (color && color !== 'transparent') return color;
  return FRAME_COLORS[normalizeFrameId(frameId)] || FRAME_COLORS['natural-timber'];
}

function mattingEnabled(value, frameId) {
  if (normalizeFrameId(frameId) === 'none') return false;
  return value === true || value === '1' || /with|white|border/i.test(String(value || ''));
}

function createPlaceholderTexture(title = 'Artwork preview') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2f0eb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(20,20,20,0.16)';
  ctx.lineWidth = 16;
  ctx.strokeRect(56, 56, canvas.width - 112, canvas.height - 112);
  ctx.fillStyle = '#222';
  ctx.font = '600 54px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.slice(0, 38), canvas.width / 2, canvas.height / 2 - 18);
  ctx.font = '400 32px Arial, sans-serif';
  ctx.fillStyle = '#555';
  ctx.fillText('Image preview unavailable', canvas.width / 2, canvas.height / 2 + 58);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, 0, canvas.height);

  base.addColorStop(0, '#d9b787');
  base.addColorStop(0.42, '#b98d5f');
  base.addColorStop(1, '#e6c89d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    const wave = Math.sin(y * 0.08) * 16 + Math.sin(y * 0.023) * 38;
    ctx.strokeStyle = `rgba(96,58,28,${0.08 + Math.random() * 0.1})`;
    ctx.lineWidth = 1 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.random() * 1.5);
    for (let x = 0; x <= canvas.width; x += 34) {
      ctx.lineTo(x, y + Math.sin((x + wave) * 0.018) * 4 + Math.random() * 2);
    }
    ctx.stroke();
  }

  for (let i = 0; i < 70; i += 1) {
    ctx.strokeStyle = 'rgba(120,75,36,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      26 + Math.random() * 46,
      3 + Math.random() * 7,
      Math.random() * 0.3,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.6, 1);
  texture.anisotropy = 8;
  return texture;
}

function createCanvasNormalTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.34;
  for (let i = 0; i < canvas.width; i += 8) {
    ctx.fillStyle = i % 16 === 0 ? '#6f6fff' : '#9292ff';
    ctx.fillRect(i, 0, 2, canvas.height);
    ctx.fillRect(0, i, canvas.width, 2);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 9);
  return texture;
}

function createShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(256, 256, 30, 256, 256, 245);

  gradient.addColorStop(0, 'rgba(0,0,0,0.28)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.11)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(canvas);
}

function createGlassReflectionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const softSheen = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  softSheen.addColorStop(0, 'rgba(255,255,255,0.035)');
  softSheen.addColorStop(0.18, 'rgba(255,255,255,0.006)');
  softSheen.addColorStop(0.58, 'rgba(255,255,255,0)');
  softSheen.addColorStop(1, 'rgba(255,255,255,0.018)');
  ctx.fillStyle = softSheen;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const windowGlow = ctx.createLinearGradient(canvas.width * 0.56, 0, canvas.width, canvas.height);
  windowGlow.addColorStop(0, 'rgba(255,255,255,0)');
  windowGlow.addColorStop(0.42, 'rgba(255,255,255,0.015)');
  windowGlow.addColorStop(0.72, 'rgba(255,255,255,0.075)');
  windowGlow.addColorStop(1, 'rgba(255,255,255,0.015)');
  ctx.fillStyle = windowGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width * 0.67, canvas.height * 0.12);
  ctx.rotate(-0.17);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = 2.4;
  const paneW = canvas.width * 0.12;
  const paneH = canvas.height * 0.22;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const x = col * (paneW + 16);
      const y = row * (paneH + 16);
      ctx.fillRect(x, y, paneW, paneH);
      ctx.strokeRect(x, y, paneW, paneH);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(canvas.width * 0.16, canvas.height * 0.02);
  ctx.rotate(-0.45);
  const streak = ctx.createLinearGradient(0, 0, canvas.width * 0.36, 0);
  streak.addColorStop(0, 'rgba(255,255,255,0)');
  streak.addColorStop(0.5, 'rgba(255,255,255,0.24)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, 0, canvas.width * 0.5, canvas.height * 0.026);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        Object.keys(material).forEach((key) => {
          const value = material[key];
          if (value && value.isTexture) value.dispose();
        });
        material.dispose();
      });
    }
  });
}

function webglRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  return renderer;
}

class ImageSlabViewer {
  constructor(container, options) {
    this.container = container;
    this.options = options || {};
    this.running = true;
    this.animating = false;
    this.disposed = false;
    this.imageGroup = new THREE.Group();
    this.clock = new THREE.Clock();
    this.textureLoader = new THREE.TextureLoader();
    this.textureLoader.crossOrigin = 'anonymous';
    this.frameTextureCache = new Map();
    this.surface = this.options.surface === 'canvas' ? 'canvas' : 'glossy';
    this.hoverOrbit = {
      active: false,
      dragging: false,
      targetTheta: 0,
      targetPhi: Math.PI / 2
    };
    
    // Create horizontal and vertical wood textures
    this.woodTexture = createWoodTexture();
    this.woodTextureVert = this.woodTexture.clone();
    this.woodTextureVert.rotation = Math.PI / 2;
    this.woodTextureVert.center.set(0.5, 0.5);

    this.canvasNormalTexture = createCanvasNormalTexture();
    this.shadowTexture = createShadowTexture();

    this.initScene();
    this.bindLifecycle();
    this.updateImage({
      url: this.options.imageUrl,
      width: this.options.imageWidth,
      height: this.options.imageHeight,
      frameId: this.options.frameId,
      frameColor: this.options.frameColor,
      frameTextureUrl: this.options.frameTextureUrl,
      naturalFramePortraitUrl: this.options.naturalFramePortraitUrl,
      naturalFrameLandscapeUrl: this.options.naturalFrameLandscapeUrl,
      matting: this.options.matting,
      printWidthCm: this.options.printWidthCm,
      printHeightCm: this.options.printHeightCm
    });
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5.6); // Center camera vertically (Y = 0)

    this.renderer = webglRenderer(this.container);
    this.scene.add(this.imageGroup);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Main key light from front-left
    const key = new THREE.DirectionalLight(0xffffff, 2.15);
    key.position.set(-3.3, 4.8, 5.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    // Fill light from back-right to illuminate wood sides and MDF backing when rotated
    const backFill = new THREE.DirectionalLight(0xffffff, 1.05);
    backFill.position.set(3.3, -4.8, -5.4);
    this.scene.add(backFill);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 0.95));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(30);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(150);
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
    this.controls.autoRotate = false;
    this.bindHoverTilt();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  bindLifecycle() {
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.running = entries[0] ? entries[0].isIntersecting : true;
      if (this.running) this.animate();
    });
    this.intersectionObserver.observe(this.container);

    this.onDblClick = null;
  }

  bindHoverTilt() {
    const canvas = this.renderer.domElement;
    this.onPointerMove = (event) => {
      if (!canvas || this.hoverOrbit.dragging) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      const y = THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);

      this.hoverOrbit.active = true;
      this.hoverOrbit.targetTheta = x * HOVER_SIDE_TILT_ANGLE;
      this.hoverOrbit.targetPhi = Math.PI / 2 + y * HOVER_VERTICAL_TILT_ANGLE;
    };
    this.onPointerLeave = () => {
      if (this.hoverOrbit.dragging) return;
      this.hoverOrbit.active = true;
      this.hoverOrbit.targetTheta = 0;
      this.hoverOrbit.targetPhi = Math.PI / 2;
    };
    this.onPointerDown = (event) => {
      this.hoverOrbit.dragging = true;
      this.hoverOrbit.active = false;
    };
    this.onPointerUp = (event) => {
      this.hoverOrbit.dragging = false;
      this.hoverOrbit.active = true;
    };

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  addRail(width, height, depth, x, y, material) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    rail.position.set(x, y, 0);
    rail.castShadow = false;
    rail.receiveShadow = false;
    this.imageGroup.add(rail);
    return rail;
  }

  addBevel(width, height, x, y, z, rotation, material) {
    const bevel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.02), material);
    bevel.position.set(x, y, z);
    bevel.rotation.set(rotation.x || 0, rotation.y || 0, 0);
    bevel.castShadow = false;
    bevel.receiveShadow = false;
    this.imageGroup.add(bevel);
    return bevel;
  }

  dimensionsForPayload(payload, texture) {
    const textureAspect = texture && texture.image && texture.image.width && texture.image.height
      ? texture.image.width / texture.image.height
      : ((payload && payload.width ? payload.width : 1) / (payload && payload.height ? payload.height : 1));
    let printW = Number(payload && payload.printWidthCm) || 0;
    let printH = Number(payload && payload.printHeightCm) || 0;
    if (printW > 0 && printH > 0 && (textureAspect > 1) !== (printW > printH)) {
      const temp = printW;
      printW = printH;
      printH = temp;
    }
    const aspect = printW > 0 && printH > 0 ? printW / printH : textureAspect;
    const height = aspect >= 1 ? 2.3 / aspect : 2.65;
    return { width: height * aspect, height, aspect, textureAspect };
  }

  configureCoverTexture(texture, targetAspect) {
    const image = texture && texture.image;
    if (!image || !image.width || !image.height || !targetAspect) return;

    const sourceAspect = image.width / image.height;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);

    if (sourceAspect > targetAspect) {
      const repeatX = targetAspect / sourceAspect;
      texture.repeat.x = repeatX;
      texture.offset.x = (1 - repeatX) / 2;
    } else if (sourceAspect < targetAspect) {
      const repeatY = sourceAspect / targetAspect;
      texture.repeat.y = repeatY;
      texture.offset.y = (1 - repeatY) / 2;
    }
    texture.needsUpdate = true;
  }

  configureContainTexture(texture, targetAspect) {
    const image = texture && texture.image;
    if (!image || !image.width || !image.height || !targetAspect) return;

    const sourceAspect = image.width / image.height;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);

    if (sourceAspect > targetAspect) {
      const repeatY = sourceAspect / targetAspect;
      texture.repeat.y = repeatY;
      texture.offset.y = (1 - repeatY) / 2;
    } else if (sourceAspect < targetAspect) {
      const repeatX = targetAspect / sourceAspect;
      texture.repeat.x = repeatX;
      texture.offset.x = (1 - repeatX) / 2;
    }
    texture.needsUpdate = true;
  }

  loadFrameSwatch(url, onLoad) {
    if (!url) return null;

    const cacheKey = `fsfull|${url}`;
    if (this.frameTextureCache.has(cacheKey)) {
      const cached = this.frameTextureCache.get(cacheKey);
      if (cached.userData && cached.userData.loaded) {
        if (typeof onLoad === 'function') onLoad(cached);
      } else if (typeof onLoad === 'function' && cached.userData && cached.userData.loadCallbacks) {
        cached.userData.loadCallbacks.push(onLoad);
      }
      return cached;
    }

    const texture = this.textureLoader.load(
      url,
      () => {
        texture.userData.loaded = true;
        texture.needsUpdate = true;
        texture.userData.loadCallbacks.splice(0).forEach((callback) => callback(texture));
        this.animate();
      },
      undefined,
      () => this.animate()
    );
    texture.userData.loaded = false;
    texture.userData.loadCallbacks = typeof onLoad === 'function' ? [onLoad] : [];
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
    this.frameTextureCache.set(cacheKey, texture);
    return texture;
  }

  resolveSwatchUrl(printW, printH) {
    const ori = frameOrientation(printW, printH);
    const portrait = this.options.naturalFramePortraitUrl || '';
    const landscape = this.options.naturalFrameLandscapeUrl || portrait;
    const payloadUrl = this.options.frameTextureUrl || '';

    // Match the frame PNG to the 3D slab orientation (image aspect), not only
    // the size-variant label — otherwise a portrait swatch gets stretched on a
    // landscape slab and the top/bottom rails look too thin.
    if (ori === 'landscape') {
      return landscape || payloadUrl || portrait;
    }
    return portrait || payloadUrl || landscape;
  }

  naturalFrameStripTexture(vertical = false, onLoad) {
    const url = vertical
      ? this.options.naturalFramePortraitUrl
      : this.options.naturalFrameLandscapeUrl || this.options.naturalFramePortraitUrl;
    if (!url) return vertical ? this.woodTextureVert : this.woodTexture;

    const key = `natural-direct|${vertical ? 'v' : 'h'}|${url}`;
    if (this.frameTextureCache.has(key)) {
      const cached = this.frameTextureCache.get(key);
      if (cached.userData && cached.userData.loaded) {
        if (typeof onLoad === 'function') onLoad(cached);
      } else if (typeof onLoad === 'function') {
        cached.userData.loadCallbacks.push(onLoad);
      }
      return cached;
    }

    const texture = this.textureLoader.load(
      url,
      () => {
        texture.userData.loaded = true;
        texture.needsUpdate = true;
        texture.userData.loadCallbacks.splice(0).forEach((callback) => callback(texture));
        this.animate();
      },
      undefined,
      () => this.animate()
    );
    texture.userData.loaded = false;
    texture.userData.loadCallbacks = typeof onLoad === 'function' ? [onLoad] : [];
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (vertical) {
      texture.repeat.set(0.11, 0.76);
      texture.offset.set(0.055, 0.12);
    } else {
      texture.repeat.set(0.74, 0.12);
      texture.offset.set(0.13, 0.82);
    }
    texture.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
    this.frameTextureCache.set(key, texture);
    return texture;
  }

  frameMaterial(frameId, color, texture, vertical = false, bevel = false) {
    const normalized = normalizeFrameId(frameId);
    const baseColor = frameColorFor(normalized, color);
    if (normalized === 'natural-timber') {
      const material = new THREE.MeshBasicMaterial({
        color: 0xd4b186
      });
      this.naturalFrameStripTexture(vertical, (loadedTexture) => {
        material.map = loadedTexture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        this.animate();
      });
      return material;
    }

    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(baseColor === 'transparent' ? '#c4a574' : baseColor)
    });
  }

  buildImageSlab(width, height, texture) {
    disposeObject(this.imageGroup);
    this.imageGroup.clear();

    const frameId = normalizeFrameId(this.options.frameId);
    const hasFrame = frameId !== 'none';
    const hasBorder = mattingEnabled(this.options.matting, frameId);

    if (!hasFrame) {
      this.configureCoverTexture(texture, width / height);

      const minSide = Math.min(width, height);
      const depth = Math.min(Math.max(minSide * 0.035, 0.035), minSide * 0.06);
      const paperMat = new THREE.MeshStandardMaterial({ color: 0xf7f4ec, roughness: 0.92, metalness: 0 });
      paperMat.side = THREE.DoubleSide;
      const artMat = new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff });
      artMat.side = THREE.DoubleSide;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        [paperMat, paperMat, paperMat, paperMat, artMat, paperMat]
      );
      box.castShadow = true;
      box.receiveShadow = true;
      this.imageGroup.add(box);

      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 1.35, width * 1.35),
        new THREE.MeshBasicMaterial({
          map: this.shadowTexture,
          transparent: true,
          opacity: 0.16,
          depthWrite: false
        })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, -height / 2 - 0.04, -0.02);
      this.imageGroup.add(shadow);

      this.imageGroup.userData.printSize = { width, height, depth, outerWidth: width, outerHeight: height };
      this.fitCameraToSlab(width, height, 1.28);
      return;
    }

    const mockup = frameMockupConfig(frameId, width, height);
    const layout = computeFrameLayout(width, height, mockup, hasBorder);
    const {
      outerW, outerH, winW, winH, artW, artH, matPad, fillW, fillH
    } = layout;

    this.configureCoverTexture(texture, artW / artH);

    const printW = Number(this.options.printWidthCm) || 0;
    const minSide = Math.min(outerW, outerH);
    const depth = printW > 0
      ? Math.min(Math.max((1 / printW) * outerW, minSide * 0.035), minSide * 0.055)
      : minSide * 0.045;

    const sideColors = {
      'natural-timber': 0xc9a877,
      white: 0xf0ece0,
      black: 0x161616
    };
    const frameColor = Object.prototype.hasOwnProperty.call(sideColors, frameId)
      ? sideColors[frameId]
      : sideColors['natural-timber'];
    const isWood = frameId === 'natural-timber';
    const frontZ = depth / 2;

    const sideMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: isWood ? 0.62 : 0.4,
      metalness: 0.05
    });
    sideMat.side = THREE.DoubleSide;

    const backMat = new THREE.MeshStandardMaterial({
      color: isWood ? 0x8a725d : frameColor,
      roughness: 0.85,
      metalness: 0
    });
    backMat.side = THREE.DoubleSide;

    const swatchUrl = this.resolveSwatchUrl(width, height);
    const frameOverlayMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      alphaTest: 0.02
    });

    if (swatchUrl) {
      this.loadFrameSwatch(swatchUrl, (loadedTexture) => {
        frameOverlayMat.map = loadedTexture;
        frameOverlayMat.needsUpdate = true;
        this.animate();
      });
    }

    // Invisible front — only the frame PNG overlay draws the front face.
    const bodyFrontMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });

    const frameBody = new THREE.Mesh(
      new THREE.BoxGeometry(outerW, outerH, depth),
      [sideMat, sideMat, sideMat, sideMat, bodyFrontMat, backMat]
    );
    frameBody.castShadow = true;
    frameBody.receiveShadow = true;
    this.imageGroup.add(frameBody);

    if (matPad > 0) {
      const matMaterial = new THREE.MeshBasicMaterial({ color: 0xf2f0eb, depthWrite: true });
      const matPlane = new THREE.Mesh(new THREE.PlaneGeometry(fillW, fillH), matMaterial);
      matPlane.position.z = frontZ - 0.001;
      this.imageGroup.add(matPlane);
    }

    const artMat = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff, depthWrite: true });
    const artwork = new THREE.Mesh(new THREE.PlaneGeometry(artW, artH), artMat);
    artwork.position.z = frontZ;
    artwork.renderOrder = 1;
    this.imageGroup.add(artwork);

    const frameOverlay = new THREE.Mesh(new THREE.PlaneGeometry(outerW, outerH), frameOverlayMat);
    frameOverlay.position.z = frontZ + 0.002;
    frameOverlay.renderOrder = 10;
    this.imageGroup.add(frameOverlay);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(outerW * 1.35, outerW * 1.35),
      new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        opacity: 0.18,
        depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -outerH / 2 - 0.04, -0.02);
    this.imageGroup.add(shadow);

    this.imageGroup.userData.printSize = {
      width,
      height,
      depth,
      outerWidth: outerW,
      outerHeight: outerH
    };
    this.fitCameraToSlab(outerW, outerH, 1.28);
  }

  fitCameraToSlab(outerWidth, outerHeight, zoomFactor = 1) {
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const tanFov = Math.tan(fovRad);
    const zHeight = outerHeight / (1.95 * tanFov);
    const zWidth = outerWidth / (1.95 * tanFov * (this.camera.aspect || 1));
    const targetZ = Math.max(zHeight, zWidth) * zoomFactor;

    this.camera.position.set(0, 0, targetZ);
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = targetZ * 0.65;
    this.controls.maxDistance = targetZ * 2.0;
    this.controls.saveState();
  }

  updateImage(payload) {
    const url = payload && payload.url;
    if (!url) return;
    this.options.frameId = normalizeFrameId(payload.frameId || this.options.frameId);
    this.options.frameColor = frameColorFor(this.options.frameId, payload.frameColor || this.options.frameColor);
    this.options.frameTextureUrl = payload.frameTextureUrl || this.options.frameTextureUrl || '';
    this.options.naturalFramePortraitUrl = payload.naturalFramePortraitUrl || this.options.naturalFramePortraitUrl || '';
    this.options.naturalFrameLandscapeUrl = payload.naturalFrameLandscapeUrl || this.options.naturalFrameLandscapeUrl || '';
    this.options.matting = payload.matting || this.options.matting || 'none';
    this.options.printWidthCm = Number(payload.printWidthCm) || 0;
    this.options.printHeightCm = Number(payload.printHeightCm) || 0;

    const nextSignature = [
      url,
      this.options.frameId,
      this.options.frameColor,
      this.options.frameTextureUrl,
      this.options.naturalFramePortraitUrl,
      this.options.naturalFrameLandscapeUrl,
      this.options.matting,
      this.options.printWidthCm,
      this.options.printHeightCm
    ].join('|');

    if (nextSignature === this.currentSignature) return;
    const sameTexture = url === this.currentUrl && this.lastTexture;
    this.currentSignature = nextSignature;
    if (sameTexture) {
      const dimensions = this.dimensionsForPayload(payload, this.lastTexture);
      this.lastWidth = dimensions.width;
      this.lastHeight = dimensions.height;
      this.buildImageSlab(dimensions.width, dimensions.height, this.lastTexture);
      this.reset(false);
      this.running = true;
      this.animate();
      if (typeof this.options.onReady === 'function') this.options.onReady();
      return;
    }
    this.currentUrl = url;

    const buildFromTexture = (texture) => {
      if (this.disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());

      const dimensions = this.dimensionsForPayload(payload, texture);
      const width = dimensions.width;
      const height = dimensions.height;

      this.lastTexture = texture;
      this.lastWidth = width;
      this.lastHeight = height;
      this.buildImageSlab(width, height, texture);

      this.reset(false);
      this.running = true;
      this.animate();
      if (typeof this.options.onReady === 'function') this.options.onReady();
    };

    this.textureLoader.load(
      url,
      buildFromTexture,
      undefined,
      () => buildFromTexture(createPlaceholderTexture(this.options.title || 'Artwork preview'))
    );
  }

  setFrameColor(color) {
    return color;
  }

  setSurface(surface) {
    this.surface = surface === 'canvas' ? 'canvas' : 'glossy';
    if (this.lastTexture) {
      this.buildImageSlab(this.lastWidth, this.lastHeight, this.lastTexture);
      this.animate();
    }
  }

  reset(enableAutoRotate = false) {
    this.controls.reset();
    this.controls.autoRotate = enableAutoRotate;
    this.controls.update();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  clampCameraOrbit() {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    const minPhi = THREE.MathUtils.degToRad(30);
    const maxPhi = THREE.MathUtils.degToRad(150);
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, minPhi, maxPhi);

    offset.setFromSpherical(spherical);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }

  applyHoverTilt(delta) {
    if (!this.hoverOrbit.active || this.hoverOrbit.dragging) return;

    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const lerpAlpha = 1 - Math.exp(-10 * Math.max(delta || 0.016, 0.001));
    const currentTheta = THREE.MathUtils.euclideanModulo(spherical.theta + Math.PI, Math.PI * 2) - Math.PI;

    spherical.theta = THREE.MathUtils.lerp(currentTheta, this.hoverOrbit.targetTheta, lerpAlpha);
    spherical.phi = THREE.MathUtils.lerp(spherical.phi, this.hoverOrbit.targetPhi, lerpAlpha);
    spherical.theta = THREE.MathUtils.clamp(spherical.theta, -MAX_SIDE_VIEW_ANGLE, MAX_SIDE_VIEW_ANGLE);
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi,
      Math.PI / 2 - MAX_VERTICAL_TILT_ANGLE,
      Math.PI / 2 + MAX_VERTICAL_TILT_ANGLE
    );

    offset.setFromSpherical(spherical);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }

  animate() {
    if (this.disposed || !this.running) return;
    if (this.animating) return;
    this.animating = true;
    requestAnimationFrame(() => {
      this.animating = false;
      this.animate();
    });
    const delta = this.clock.getDelta();
    this.controls.update(delta);
    this.applyHoverTilt(delta);
    this.clampCameraOrbit();

    this.renderer.render(this.scene, this.camera);
  }

  releaseGrab() {
    this.hoverOrbit.dragging = false;
    this.hoverOrbit.active = true;
  }

  pause() {
    this.running = false;
  }

  resume() {
    if (this.disposed) return;
    this.running = true;
    this.animate();
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.intersectionObserver) this.intersectionObserver.disconnect();
    this.container.removeEventListener('dblclick', this.onDblClick);
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
      this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
      this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    }
    window.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    disposeObject(this.scene);
    [
      this.woodTexture,
      this.canvasNormalTexture,
      this.shadowTexture
    ].forEach((texture) => {
      if (texture) texture.dispose();
    });
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}

window.PosterStudio3D = {
  createViewer(container, options) {
    return new ImageSlabViewer(container, options);
  }
};
