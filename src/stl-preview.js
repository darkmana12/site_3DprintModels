import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Un seul pipeline WebGL à la fois entre toutes les vignettes : évite la limite de
 * contextes du navigateur (canvas blanc / « cassé » quand ~8+ sont créés d’un coup).
 */
let webglInitChain = Promise.resolve();

function enqueueWebGLInit(fn) {
  const p = webglInitChain.then(() => fn());
  webglInitChain = p.catch(() => {});
  return p;
}

function shortestAngleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function loadArrayBufferWithProgress(url, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(e.loaded, e.total);
      } else if (e.loaded > 0) {
        onProgress(e.loaded, 0);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Réseau"));
    xhr.send();
  });
}

/**
 * @param {HTMLElement} container
 * @param {object} [options]
 * @returns {{ dispose: () => void, ready: Promise<void> }}
 */
export function initSTLPreview(container, options = {}) {
  const url = options.url ?? container.dataset.stlUrl;
  const canvas = container.querySelector("canvas");
  const statusEl =
    options.statusElement ?? container.querySelector(".stl-load-status");

  const enableZoom = options.enableZoom ?? false;
  const enablePan = options.enablePan ?? false;
  const enableRotate = options.enableRotate ?? true;
  const autoRotate = options.autoRotate ?? false;
  const mouseAzimuthInFrame = options.mouseAzimuthInFrame ?? false;
  const passiveCanvas = options.passiveCanvas ?? false;
  /** Géométrie déjà parsée fournie depuis l'extérieur (évite re-download). */
  const preloadedGeometry = options.geometry ?? null;

  let aborted = false;

  let resolveReady;
  const ready = new Promise((r) => {
    resolveReady = r;
  });
  let settled = false;
  function settleReady() {
    if (settled) return;
    settled = true;
    resolveReady();
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function showError(msg) {
    container.classList.remove("is-loading");
    container.classList.add("is-error");
    setStatus(msg);
    settleReady();
  }

  if (!canvas || !url) {
    showError("Configuration STL incomplète.");
    return { dispose: () => {}, ready };
  }

  if (passiveCanvas) {
    canvas.style.pointerEvents = "none";
  } else if (enablePan) {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  const stlLoader = new STLLoader();

  let scene = null;
  let camera = null;
  let renderer = null;
  let controls = null;
  let mesh = null;
  let mat = null;
  let clock = null;
  let rafId = 0;
  let running = false;
  let ro = null;
  let ioVisible = null;
  let onGlContextLost = null;
  let onGlContextRestored = null;
  let onVisibilityChange = null;

  const MOUSE_NX_SMOOTH = 32;
  const MAX_YAW_SPEED = 12;

  let mouseAzimuthActive = false;
  let baseFrontAzimuth = 0;
  let targetNx = 0.5;
  let smoothedNx = 0.5;

  function setTargetNxFromClientX(clientX) {
    const rect = container.getBoundingClientRect();
    if (rect.width < 1) return;
    targetNx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  let mouseAzimuthHandlers = null;

  async function loadStl() {
    try {
      let geometry = preloadedGeometry;

      if (!geometry) {
        setStatus("Téléchargement…");
        const buffer = await loadArrayBufferWithProgress(url, (loaded, total) => {
          if (aborted) return;
          if (total > 0) {
            const pct = Math.min(100, Math.round((loaded / total) * 100));
            setStatus(`Téléchargement… ${pct} %`);
          } else {
            const mb = (loaded / (1024 * 1024)).toFixed(1);
            setStatus(`Téléchargement… ${mb} Mo`);
          }
        });

        if (aborted) { settleReady(); return; }

        setStatus("Décodage…");
        await new Promise((r) => requestAnimationFrame(r));

        if (aborted) { settleReady(); return; }

        try {
          geometry = stlLoader.parse(buffer);
        } catch (e) {
          console.error("[STL] parse", e);
          showError("Fichier STL invalide ou corrompu.");
          return;
        }
      }

      if (aborted) { settleReady(); return; }

      await enqueueWebGLInit(() => {
        if (aborted) return;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111115);

        camera = new THREE.PerspectiveCamera(42, 1, 0.01, 5000);
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: "default",
          failIfMajorPerformanceCaveat: false,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const hemi = new THREE.HemisphereLight(0xa0a8b8, 0x22222a, 1.2);
        const dir = new THREE.DirectionalLight(0xffffff, 1.45);
        dir.position.set(4, 8, 6);
        const dirFill = new THREE.DirectionalLight(0xc8d4ec, 0.55);
        dirFill.position.set(-6, 4, -5);
        scene.add(hemi, dir, dirFill);

        mat = new THREE.MeshStandardMaterial({
          color: 0x4a9fd4,
          metalness: 0.2,
          roughness: 0.55,
          flatShading: false,
        });

        controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enableZoom = enableZoom;
        controls.enablePan = enablePan;
        controls.enableRotate = enableRotate;
        controls.rotateSpeed = 0.85;
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = 1.2;
        controls.screenSpacePanning = true;
        controls.minDistance = 0.01;
        controls.maxDistance = 5000;

        clock = new THREE.Clock();

        if (mouseAzimuthInFrame) {
          const onPointerEnter = (e) => {
            if (!mesh) return;
            const cur = controls.getAzimuthalAngle();
            controls.rotateLeft(-shortestAngleDiff(cur, baseFrontAzimuth));
            setTargetNxFromClientX(e.clientX);
            smoothedNx = 0.5;
            controls.autoRotate = false;
            controls.enableDamping = false;
            mouseAzimuthActive = true;
          };
          const onPointerLeave = () => {
            mouseAzimuthActive = false;
            controls.enableDamping = true;
            controls.autoRotate = autoRotate;
          };
          const onPointerMove = (e) => {
            if (!mouseAzimuthActive) return;
            setTargetNxFromClientX(e.clientX);
          };
          container.addEventListener("pointerenter", onPointerEnter);
          container.addEventListener("pointerleave", onPointerLeave);
          container.addEventListener("pointermove", onPointerMove);
          mouseAzimuthHandlers = {
            onPointerEnter,
            onPointerLeave,
            onPointerMove,
          };
        }

        try {
          buildScene(geometry);
        } catch (e) {
          console.error("[STL] buildScene", e);
          showError("Erreur d’affichage du maillage.");
          return;
        }

        function resize() {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w < 1 || h < 1) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
        }

        resize();
        ro = new ResizeObserver(resize);
        ro.observe(container);

        onGlContextLost = (e) => {
          e.preventDefault();
          running = false;
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }
        };
        onGlContextRestored = () => {
          if (!renderer || !scene || !camera || aborted) return;
          if (mesh?.material) mesh.material.needsUpdate = true;
          resize();
          running = true;
          if (!rafId) tick();
        };
        canvas.addEventListener("webglcontextlost", onGlContextLost, false);
        canvas.addEventListener(
          "webglcontextrestored",
          onGlContextRestored,
          false
        );

        ioVisible = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting || !renderer || !scene || !camera) continue;
              const gl = renderer.getContext();
              if (gl?.isContextLost?.()) continue;
              resize();
              requestAnimationFrame(() => {
                if (!running || !renderer || !scene || !camera || aborted) return;
                const w = container.clientWidth;
                const h = container.clientHeight;
                if (w < 1 || h < 1) return;
                const gl2 = renderer.getContext();
                if (gl2?.isContextLost?.()) return;
                controls.update(clock.getDelta());
                renderer.render(scene, camera);
              });
            }
          },
          { rootMargin: "120px 0px", threshold: 0 }
        );
        ioVisible.observe(container);

        onVisibilityChange = () => {
          if (document.visibilityState !== "visible") return;
          if (!renderer || !scene || !camera || aborted) return;
          const gl = renderer.getContext();
          if (gl?.isContextLost?.()) return;
          resize();
          requestAnimationFrame(() => {
            if (!running || !renderer || !scene || !camera || aborted) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w < 1 || h < 1) return;
            if (renderer.getContext()?.isContextLost?.()) return;
            controls.update(clock.getDelta());
            renderer.render(scene, camera);
          });
        };
        document.addEventListener("visibilitychange", onVisibilityChange);

        running = true;
        function tick() {
          if (!running) return;
          const glCtx = renderer.getContext();
          if (glCtx?.isContextLost?.()) {
            rafId = requestAnimationFrame(tick);
            return;
          }
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          if (cw < 1 || ch < 1) {
            rafId = requestAnimationFrame(tick);
            return;
          }
          rafId = requestAnimationFrame(tick);
          const delta = clock.getDelta();
          if (mouseAzimuthInFrame && mouseAzimuthActive) {
            const nxFollow = 1 - Math.exp(-delta * MOUSE_NX_SMOOTH);
            smoothedNx += (targetNx - smoothedNx) * nxFollow;

            const targetAzimuth =
              baseFrontAzimuth + (0.5 - smoothedNx) * Math.PI * 2;
            const current = controls.getAzimuthalAngle();
            let diff = shortestAngleDiff(current, targetAzimuth);
            const maxStep = MAX_YAW_SPEED * delta;
            if (Math.abs(diff) > maxStep) {
              diff = Math.sign(diff) * maxStep;
            }
            if (Math.abs(diff) > 1e-6) {
              controls.rotateLeft(-diff);
            } else {
              controls.update(delta);
            }
          } else {
            controls.update(delta);
          }
          renderer.render(scene, camera);
        }
        tick();
      });

      settleReady();
    } catch (e) {
      console.error("[STL] chargement", e);
      if (!aborted) {
        showError(
          "Impossible de charger le fichier. Lance « npm run dev » et vérifie public/models/stl/."
        );
      } else {
        settleReady();
      }
    }
  }

  function buildScene(geometry) {
    if (!preloadedGeometry) geometry.computeVertexNormals();
    mesh = new THREE.Mesh(geometry, mat);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    mesh.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const fov = (camera.fov * Math.PI) / 180;
    const dist = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.35;
    camera.position.set(dist * 0.55, dist * 0.42, dist * 0.9);
    camera.near = dist / 200;
    camera.far = dist * 200;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.update(clock.getDelta());
    baseFrontAzimuth = controls.getAzimuthalAngle();

    container.classList.remove("is-loading");
  }

  loadStl();

  function dispose() {
    aborted = true;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (ro) {
      ro.disconnect();
      ro = null;
    }
    if (ioVisible) {
      ioVisible.disconnect();
      ioVisible = null;
    }
    if (canvas && onGlContextLost) {
      canvas.removeEventListener("webglcontextlost", onGlContextLost, false);
      onGlContextLost = null;
    }
    if (canvas && onGlContextRestored) {
      canvas.removeEventListener(
        "webglcontextrestored",
        onGlContextRestored,
        false
      );
      onGlContextRestored = null;
    }
    if (onVisibilityChange) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      onVisibilityChange = null;
    }
    if (mouseAzimuthHandlers) {
      container.removeEventListener(
        "pointerenter",
        mouseAzimuthHandlers.onPointerEnter
      );
      container.removeEventListener(
        "pointerleave",
        mouseAzimuthHandlers.onPointerLeave
      );
      container.removeEventListener(
        "pointermove",
        mouseAzimuthHandlers.onPointerMove
      );
      mouseAzimuthHandlers = null;
    }
    if (controls) {
      controls.dispose();
      controls = null;
    }
    if (mesh) {
      scene?.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
      mesh = null;
    } else if (mat) {
      mat.dispose();
      mat = null;
    }
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    scene = null;
    camera = null;
    clock = null;
    if (canvas.parentElement) {
      canvas.style.pointerEvents = "";
    }
    settleReady();
  }

  return { dispose, ready };
}
