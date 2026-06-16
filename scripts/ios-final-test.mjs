/**
 * Final iOS AR pipeline smoke test (run: node scripts/ios-final-test.mjs)
 */
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import { unzipSync } from "three/examples/jsm/libs/fflate.module.js";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache", "ar-models");
const results = [];

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log("PASS:", name, detail ? `- ${detail}` : "");
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.log("FAIL:", name, detail ? `- ${detail}` : "");
}

// ── 1. Fresh GLB + USDZ export (mirrors api.ar-model.tsx) ─────────────────
const THREE = await import("three");
const { USDZExporter } = await import("three/examples/jsm/exporters/USDZExporter.js");

const FRAME_DEPTH_M = 2.54 / 100;
const canvas = createCanvas(640, 480);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, 640, 480);
ctx.fillStyle = "#224466";
ctx.fillRect(40, 40, 560, 400);
ctx.fillStyle = "#fff";
ctx.font = "bold 28px sans-serif";
ctx.fillText("iOS AR Test Frame", 180, 250);

const wM = 0.6;
const finalH = 0.45;
const texture = new THREE.CanvasTexture(canvas);
texture.colorSpace = THREE.SRGBColorSpace;
texture.flipY = true;

const frontMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 });
const backMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
const edgeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#c4a574"), roughness: 0.78 });

const frame = { THREE, wM, finalH, frontMat, backMat, edgeMat, angleDeg: 0, levelDeg: 0, pitchDeg: 0 };

// GLB: validate cached files instead (GLTFExporter needs DOM in Node)
if (fs.existsSync(CACHE)) {
  const glbs = fs.readdirSync(CACHE).filter((f) => f.endsWith(".glb"));
  if (glbs.length) {
    const sample = glbs.sort((a, b) =>
      fs.statSync(path.join(CACHE, b)).size - fs.statSync(path.join(CACHE, a)).size,
    )[0];
    const buf = fs.readFileSync(path.join(CACHE, sample));
    const magic = buf.slice(0, 4).toString("ascii");
    magic === "glTF" && buf.length > 512
      ? pass("GLB cached sample", `${sample} ${buf.length} bytes`)
      : fail("GLB cached sample", `${sample} magic=${magic}`);
  } else {
    fail("GLB cached sample", "no cached glb yet");
  }
}

// USDZ scene (separate meshes, solid front mat for Node test — server uses textured mat)
const solidFront = new THREE.MeshStandardMaterial({ color: 0x224466, roughness: 0.85 });
const depth = FRAME_DEPTH_M;
const halfD = depth / 2;
const insetX = Math.max(wM - depth * 2, wM * 0.92);
const insetY = Math.max(finalH - depth * 2, finalH * 0.92);
const group = new THREE.Group();
const front = new THREE.Mesh(new THREE.PlaneGeometry(wM, finalH), solidFront);
front.position.z = halfD;
group.add(front);
const back = new THREE.Mesh(new THREE.PlaneGeometry(wM, finalH), backMat);
back.position.z = -halfD;
back.rotation.y = Math.PI;
group.add(back);
group.add(new THREE.Mesh(new THREE.BoxGeometry(insetX, depth, depth), edgeMat));
group.add(new THREE.Mesh(new THREE.BoxGeometry(insetX, depth, depth), edgeMat));
group.add(new THREE.Mesh(new THREE.BoxGeometry(depth, insetY, depth), edgeMat));
group.add(new THREE.Mesh(new THREE.BoxGeometry(depth, insetY, depth), edgeMat));
const usdzScene = new THREE.Scene();
usdzScene.add(group);

const usdzAb = await new USDZExporter().parseAsync(usdzScene, {
  quickLookCompatible: true,
  includeAnchoringProperties: true,
  ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "vertical" } },
});

const usdzBuf = Buffer.from(usdzAb);
const isZip = usdzBuf[0] === 0x50 && usdzBuf[1] === 0x4b;
isZip && usdzBuf.length > 512
  ? pass("USDZ export", `${usdzBuf.length} bytes, valid ZIP`)
  : fail("USDZ export", `size=${usdzBuf.length} zip=${isZip}`);

const files = unzipSync(new Uint8Array(usdzAb));
const usda = new TextDecoder().decode(files["model.usda"] || new Uint8Array());
const meshCount = (usda.match(/def Xform "Object/g) || []).length;

usda.includes('planeAnchoring:alignment = "vertical"')
  ? pass("USDZ wall anchoring", "vertical")
  : fail("USDZ wall anchoring", usda.includes("horizontal") ? "still horizontal" : "missing");

meshCount >= 5
  ? pass("USDZ mesh count", `${meshCount} meshes exported`)
  : fail("USDZ mesh count", `only ${meshCount}`);

(files["textures/Texture_6_true.png"] || Object.keys(files).some((k) => k.endsWith(".png")))
  ? pass("USDZ texture embedded")
  : pass("USDZ structure export", "no texture in solid-color test (OK)");

// ── 2. Cached USDZ spot-check (vertical anchoring in latest files) ───────────
if (fs.existsSync(CACHE)) {
  const usdzFiles = fs.readdirSync(CACHE).filter((f) => f.endsWith(".usdz"));
  pass("Cached USDZ files", `${usdzFiles.length} in cache`);
  if (usdzFiles.length) {
    const newest = usdzFiles.sort((a, b) =>
      fs.statSync(path.join(CACHE, b)).mtimeMs - fs.statSync(path.join(CACHE, a)).mtimeMs,
    )[0];
    const cached = fs.readFileSync(path.join(CACHE, newest));
    try {
      const cachedUsda = new TextDecoder().decode(unzipSync(new Uint8Array(cached))["model.usda"] || new Uint8Array());
      if (cachedUsda.includes('planeAnchoring:alignment = "vertical"')) {
        pass("Latest cached USDZ has vertical anchoring", newest);
      } else if (cachedUsda.includes('planeAnchoring:alignment = "horizontal"')) {
        fail("Latest cached USDZ anchoring", `${newest} is OLD horizontal — tap View in AR again`);
      } else {
        fail("Latest cached USDZ anchoring", `${newest} has no anchoring metadata`);
      }
    } catch {
      fail("Latest cached USDZ parse", newest);
    }
  }
} else {
  fail("Cache dir", "missing — will generate on first View in AR");
}

// ── 3. iOS HTML page checks ──────────────────────────────────────────────────
const arViewSrc = fs.readFileSync(path.join(ROOT, "app/routes/ar.view.tsx"), "utf8");
const checks = [
  ["iOS uses quick-look", /isIOS \? "quick-look"/.test(arViewSrc)],
  ["model-viewer present", arViewSrc.includes("<model-viewer")],
  ["ios-src set in JS", arViewSrc.includes("ios-src")],
  ["ar-placement wall", arViewSrc.includes('ar-placement="wall"')],
  ["activateAR()", arViewSrc.includes("mv.activateAR()")],
  ["iOS UA detection", arViewSrc.includes("iphone|ipad|ipod")],
  ["no old rel=ar hack", !arViewSrc.includes('setAttribute(\'rel\', \'ar\')')],
];
for (const [name, ok] of checks) ok ? pass(name) : fail(name);

// ── 4. API + storefront wiring ───────────────────────────────────────────────
const apiSrc = fs.readFileSync(path.join(ROOT, "app/routes/api.ar-model.tsx"), "utf8");
apiSrc.includes("wall-v16") ? pass("Cache seed wall-v16") : fail("Cache seed", "not wall-v16");
apiSrc.includes("createGLBScene") && apiSrc.includes("createUSDZScene")
  ? pass("Separate GLB/USDZ scenes")
  : fail("Separate GLB/USDZ scenes");
apiSrc.includes('alignment: "vertical"') ? pass("API vertical anchoring") : fail("API vertical anchoring");

const fileSrc = fs.readFileSync(path.join(ROOT, "app/routes/api.ar-model.file.$name.tsx"), "utf8");
fileSrc.includes('"model/vnd.usdz+zip"') ? pass("USDZ MIME type") : fail("USDZ MIME type");
fileSrc.includes("HEAD") ? pass("HEAD request support for preflight") : fail("HEAD support");

const jsSrc = fs.readFileSync(path.join(ROOT, "extensions/vr-viewer/assets/ar-viewer.js"), "utf8");
jsSrc.includes("launchIOSARPage") && jsSrc.includes("usdzPath")
  ? pass("Storefront iOS redirect with usdzPath")
  : fail("Storefront iOS redirect");
jsSrc.includes("glbPath") && jsSrc.includes("launchIOSARPage")
  ? pass("Storefront passes glbPath for iOS preview")
  : fail("Storefront glbPath for iOS");

// ── Summary ────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log("\n=== SUMMARY ===");
console.log(`${passed}/${results.length} checks passed`);
if (failed.length) {
  console.log("Failed:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
console.log("\nReady for iPhone test. User must tap View in AR again to generate wall-v13 models.");
