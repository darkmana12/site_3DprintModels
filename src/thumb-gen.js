/**
 * Page outil : rendu unique d’un STL pour capture (Playwright).
 * Ouvrir : /thumb-gen.html?stl=/models/stl/nom.stl
 */
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const W = 800;
const H = 600;

async function main() {
  const params = new URLSearchParams(location.search);
  const stl = params.get("stl");
  if (!stl) {
    window.__THUMB_ERROR__ = "Paramètre stl manquant.";
    return;
  }

  const canvas = document.getElementById("c");
  if (!canvas) {
    window.__THUMB_ERROR__ = "Canvas introuvable.";
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111115);

  const camera = new THREE.PerspectiveCamera(42, W / H, 0.01, 5000);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "default",
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);

  const hemi = new THREE.HemisphereLight(0xa0a8b8, 0x22222a, 1.2);
  const dir = new THREE.DirectionalLight(0xffffff, 1.45);
  dir.position.set(4, 8, 6);
  const dirFill = new THREE.DirectionalLight(0xc8d4ec, 0.55);
  dirFill.position.set(-6, 4, -5);
  scene.add(hemi, dir, dirFill);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x4a9fd4,
    metalness: 0.2,
    roughness: 0.55,
    flatShading: false,
  });

  const res = await fetch(stl);
  if (!res.ok) {
    window.__THUMB_ERROR__ = `HTTP ${res.status} pour ${stl}`;
    return;
  }

  const buffer = await res.arrayBuffer();
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, mat);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);

  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  mesh.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z, 1e-9);
  mesh.scale.setScalar(1 / maxDim);
  mesh.updateMatrixWorld(true);
  const boxFit = new THREE.Box3().setFromObject(mesh);
  const centerFit = boxFit.getCenter(new THREE.Vector3());
  mesh.position.sub(centerFit);

  const sizeFit = boxFit.getSize(new THREE.Vector3());
  const maxDimFit = Math.max(sizeFit.x, sizeFit.y, sizeFit.z, 0.001);
  const fov = (camera.fov * Math.PI) / 180;
  let dist = Math.abs(maxDimFit / (2 * Math.tan(fov / 2))) * 1.35;
  dist = Math.max(dist, 0.35);
  camera.position.set(dist * 0.55, dist * 0.42, dist * 0.9);
  camera.near = Math.max(dist / 200, 0.001);
  camera.far = dist * 200;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
  window.__THUMB_READY__ = true;
}

main().catch((e) => {
  console.error(e);
  window.__THUMB_ERROR__ = String(e?.message || e);
});
