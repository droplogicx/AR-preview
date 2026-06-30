import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const MAX_VIEW_ANGLE = THREE.MathUtils.degToRad(35);

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

  base.addColorStop(0, '#8e8d87');
  base.addColorStop(0.46, '#6c6d69');
  base.addColorStop(1, '#9b9991');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    const wave = Math.sin(y * 0.08) * 16 + Math.sin(y * 0.023) * 38;
    ctx.strokeStyle = `rgba(42,42,39,${0.08 + Math.random() * 0.1})`;
    ctx.lineWidth = 1 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.random() * 1.5);
    for (let x = 0; x <= canvas.width; x += 34) {
      ctx.lineTo(x, y + Math.sin((x + wave) * 0.018) * 4 + Math.random() * 2);
    }
    ctx.stroke();
  }

  for (let i = 0; i < 70; i += 1) {
    ctx.strokeStyle = 'rgba(35,35,32,0.16)';
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
    this.surface = this.options.surface === 'canvas' ? 'canvas' : 'glossy';
    
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
      height: this.options.imageHeight
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
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(-3.3, 4.8, 5.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    // Fill light from back-right to illuminate wood sides and MDF backing when rotated
    const backFill = new THREE.DirectionalLight(0xffffff, 1.5);
    backFill.position.set(3.3, -4.8, -5.4);
    this.scene.add(backFill);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.15));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = Math.PI / 2 - MAX_VIEW_ANGLE;
    this.controls.maxPolarAngle = Math.PI / 2 + MAX_VIEW_ANGLE;
    this.controls.minAzimuthAngle = -MAX_VIEW_ANGLE;
    this.controls.maxAzimuthAngle = MAX_VIEW_ANGLE;
    this.controls.autoRotate = false;

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

  addRail(width, height, depth, x, y, material) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    rail.position.set(x, y, 0);
    rail.castShadow = true;
    rail.receiveShadow = true;
    this.imageGroup.add(rail);
    return rail;
  }

  addBevel(width, height, x, y, z, rotation, material) {
    const bevel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.02), material);
    bevel.position.set(x, y, z);
    bevel.rotation.set(rotation.x || 0, rotation.y || 0, 0);
    bevel.castShadow = true;
    bevel.receiveShadow = true;
    this.imageGroup.add(bevel);
    return bevel;
  }

  buildImageSlab(width, height, texture) {
    disposeObject(this.imageGroup);
    this.imageGroup.clear();

    // Slim frame depth so side views do not overpower the artwork.
    const depth = Math.max(0.02, Math.min(width, height) * 0.01);
    const border = Math.max(0.08, Math.min(width, height) * 0.035);
    const lip = Math.max(0.02, border * 0.25);
    
    const matWidth = this.options.mat ? Math.max(0.08, Math.min(width, height) * 0.055) : 0;
    const artWidth = Math.max(0.2, width - matWidth * 2);
    const artHeight = Math.max(0.2, height - matWidth * 2);
    const outerWidth = width + border * 2;
    const outerHeight = height + border * 2;
    
    const frontZ = depth / 2;
    const artZ = frontZ + 0.002;

    // Define horizontal and vertical wood materials for grain direction alignment
    const woodMaterialHoriz = new THREE.MeshStandardMaterial({
      color: 0x85837b,
      map: this.woodTexture,
      roughness: 0.65,
      metalness: 0,
      envMapIntensity: 1.4
    });
    const woodMaterialVert = new THREE.MeshStandardMaterial({
      color: 0x85837b,
      map: this.woodTextureVert,
      roughness: 0.65,
      metalness: 0,
      envMapIntensity: 1.4
    });
    const bevelMaterialHoriz = new THREE.MeshStandardMaterial({
      color: 0xa4a29a, // slightly lighter inner bevel wood
      map: this.woodTexture,
      roughness: 0.58,
      metalness: 0,
      envMapIntensity: 1.5
    });
    const bevelMaterialVert = new THREE.MeshStandardMaterial({
      color: 0xa4a29a,
      map: this.woodTextureVert,
      roughness: 0.58,
      metalness: 0,
      envMapIntensity: 1.5
    });
    const backMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a725d, // warm brown MDF finish
      roughness: 0.85,
      metalness: 0,
      envMapIntensity: 0.5
    });
    const frontMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      roughness: this.surface === 'canvas' ? 0.6 : 0.28,
      metalness: 0,
      normalMap: this.surface === 'canvas' ? this.canvasNormalTexture : null,
      normalScale: new THREE.Vector2(0.025, 0.025),
      envMapIntensity: this.surface === 'canvas' ? 0.15 : 0.2
    });

    // Create 4 wood frame rails with correct grain directions
    this.addRail(outerWidth, border, depth, 0, height / 2 + border / 2, woodMaterialHoriz);
    this.addRail(outerWidth, border, depth, 0, -height / 2 - border / 2, woodMaterialHoriz);
    this.addRail(border, height, depth, -width / 2 - border / 2, 0, woodMaterialVert);
    this.addRail(border, height, depth, width / 2 + border / 2, 0, woodMaterialVert);

    // Calculate bevel slope position and angle
    const bevelZ = frontZ - 0.006;
    const bevelAngle = Math.atan2(0.006, lip);

    // Top/bottom inner bevels (horizontal grain)
    this.addBevel(width + lip * 2, lip, 0, height / 2 + lip / 2, bevelZ, { x: -bevelAngle }, bevelMaterialHoriz);
    this.addBevel(width + lip * 2, lip, 0, -height / 2 - lip / 2, bevelZ, { x: bevelAngle }, bevelMaterialHoriz);
    // Left/right inner bevels (vertical grain)
    this.addBevel(lip, height, -width / 2 - lip / 2, 0, bevelZ, { y: bevelAngle }, bevelMaterialVert);
    this.addBevel(lip, height, width / 2 + lip / 2, 0, bevelZ, { y: -bevelAngle }, bevelMaterialVert);

    if (matWidth > 0) {
      const matMaterial = new THREE.MeshStandardMaterial({
        color: 0xf2f0eb,
        roughness: 0.74,
        metalness: 0
      });
      this.addRail(width, matWidth, 0.012, 0, height / 2 - matWidth / 2, matMaterial).position.z = artZ + 0.002;
      this.addRail(width, matWidth, 0.012, 0, -height / 2 + matWidth / 2, matMaterial).position.z = artZ + 0.002;
      this.addRail(matWidth, artHeight, 0.012, -width / 2 + matWidth / 2, 0, matMaterial).position.z = artZ + 0.002;
      this.addRail(matWidth, artHeight, 0.012, width / 2 - matWidth / 2, 0, matMaterial).position.z = artZ + 0.002;
    }

    // Artwork plane
    const artwork = new THREE.Mesh(new THREE.PlaneGeometry(artWidth, artHeight), frontMaterial);
    artwork.position.z = artZ;
    artwork.receiveShadow = true;
    this.imageGroup.add(artwork);

    // MDF back panel
    const backPanel = new THREE.Mesh(
      new THREE.BoxGeometry(width + border * 1.8, height + border * 1.8, 0.03),
      backMaterial
    );
    backPanel.position.z = -frontZ - 0.005;
    backPanel.castShadow = true;
    backPanel.receiveShadow = true;
    this.imageGroup.add(backPanel);

    // Contact shadow plane beneath the frame
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(outerWidth * 1.35, outerWidth * 1.35),
      new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -outerHeight / 2 - 0.04, -0.02);
    this.imageGroup.add(shadow);

    this.imageGroup.userData.printSize = { width, height, depth, outerWidth, outerHeight };

    // Fit close to the source product image so 3D mode keeps the same visual size.
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const tanFov = Math.tan(fovRad);
    const zHeight = outerHeight / (1.95 * tanFov);
    const zWidth = outerWidth / (1.95 * tanFov * (this.camera.aspect || 1));
    const targetZ = Math.max(zHeight, zWidth);

    this.camera.position.set(0, 0, targetZ);
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = targetZ * 0.65;
    this.controls.maxDistance = targetZ * 2.0;
    this.controls.saveState();
  }

  updateImage(payload) {
    const url = payload && payload.url;
    if (!url || url === this.currentUrl) return;
    this.currentUrl = url;

    const buildFromTexture = (texture) => {
      if (this.disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());

      const aspect = texture.image && texture.image.width && texture.image.height
        ? texture.image.width / texture.image.height
        : ((payload.width || 1) / (payload.height || 1));
      const height = aspect >= 1 ? 2.3 / aspect : 2.65;
      const width = height * aspect;

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

    spherical.theta = THREE.MathUtils.clamp(
      THREE.MathUtils.euclideanModulo(spherical.theta + Math.PI, Math.PI * 2) - Math.PI,
      -MAX_VIEW_ANGLE,
      MAX_VIEW_ANGLE
    );
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi,
      Math.PI / 2 - MAX_VIEW_ANGLE,
      Math.PI / 2 + MAX_VIEW_ANGLE
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
    this.controls.update(this.clock.getDelta());
    this.clampCameraOrbit();

    this.renderer.render(this.scene, this.camera);
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
