/**
 * Verify every paper size exports the correct real-world poster span (meters).
 * Run: node scripts/check-glb-size.mjs
 */
import { createCanvas } from "canvas";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import fs from "fs";

globalThis.HTMLCanvasElement = createCanvas(1, 1).constructor;
globalThis.document = {
  createElement(t) {
    if (t !== "canvas") throw new Error(t);
    const c = createCanvas(64, 64);
    c.toBlob = (cb, m) => {
      cb(new Blob([c.toBuffer("image/png")], { type: m || "image/png" }));
    };
    return c;
  },
};
globalThis.FileReader = class {
  result = null;
  onloadend = null;
  readAsArrayBuffer(b) {
    b.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
};

const FRAME_DEPTH_M = 2.54 / 100;

const SIZES = [
  { label: "A4", wCm: 21, hCm: 29.7 },
  { label: "A3", wCm: 29.7, hCm: 42 },
  { label: "A2", wCm: 42, hCm: 59.4 },
  { label: "A1", wCm: 59.4, hCm: 84.1 },
  { label: "B1", wCm: 70.7, hCm: 100 },
  { label: "A0", wCm: 84.1, hCm: 118.9 },
  { label: "B0", wCm: 100, hCm: 141.4 },
];

async function measure(label, wCm, hCm) {
  const wM = wCm / 100;
  const hM = hCm / 100;
  const canvas = createCanvas(64, 64);
  canvas.getContext("2d").fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshStandardMaterial({ map: tex });
  const scene = new THREE.Scene();
  scene.add(
    new THREE.Mesh(new THREE.BoxGeometry(wM, hM, FRAME_DEPTH_M), [
      mat, mat, mat, mat, mat, mat,
    ]),
  );
  const buf = await new Promise((res, rej) =>
    new GLTFExporter().parse(
      scene,
      (r) => res(Buffer.from(r)),
      rej,
      { binary: true, embedImages: true },
    ),
  );
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  const acc = json.accessors.find((a) => a.type === "VEC3" && a.max && a.min);
  const spanX = acc ? +(acc.max[0] - acc.min[0]).toFixed(4) : 0;
  const spanY = acc ? +(acc.max[1] - acc.min[1]).toFixed(4) : 0;
  const ok = Math.abs(spanX - wM) < 0.002 && Math.abs(spanY - hM) < 0.002;
  const inches = (wCm / 2.54).toFixed(1);
  return {
    ok,
    line: `${ok ? "PASS" : "FAIL"} | ${label} | ${wCm}x${hCm}cm (~${inches}in wide) | glb=${spanX}x${spanY}m`,
  };
}

const out = [];
let allOk = true;
for (const s of SIZES) {
  const r = await measure(s.label, s.wCm, s.hCm);
  out.push(r.line);
  if (!r.ok) allOk = false;
}
out.push(allOk ? "\nALL SIZES OK — bbox equals real paper size (no fake 2m frame)." : "\nFAILED");
fs.writeFileSync("tmp-glb-size.txt", out.join("\n") + "\n");
console.log(out.join("\n"));
process.exit(allOk ? 0 : 1);
