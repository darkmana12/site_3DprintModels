import { initSTLPreview } from "./stl-preview.js";

let currentDispose = null;

function getModal() {
  return document.getElementById("viewer-modal");
}

function prepareStlStage(stlStage) {
  stlStage.classList.add("is-loading");
  stlStage.classList.remove("is-error");
  const oldCanvas = stlStage.querySelector("canvas");
  if (oldCanvas) oldCanvas.remove();
  const canvas = document.createElement("canvas");
  canvas.className = "viewer-modal__canvas";
  canvas.setAttribute("aria-label", "Vue 3D du modèle");
  stlStage.appendChild(canvas);
  const status = stlStage.querySelector(".stl-load-status");
  if (status) status.textContent = "Chargement du modèle…";
}

export function closeViewerModal() {
  const modal = getModal();
  if (currentDispose) {
    try {
      currentDispose();
    } catch (e) {
      console.warn("[viewer-modal] dispose", e);
    }
    currentDispose = null;
  }
  if (modal) {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }
  document.body.style.overflow = "";
}

/**
 * @param {{ type: 'stl' | 'image', stlUrl?: string, imageUrl?: string, title: string, meta?: string }}
 */
export function openViewerModal({ type, stlUrl, imageUrl, title, meta }) {
  closeViewerModal();

  const modal = getModal();
  if (!modal) return;

  const titleEl = modal.querySelector(".viewer-modal__title");
  const metaEl = modal.querySelector(".viewer-modal__meta");
  const stlStage = modal.querySelector("[data-viewer-modal-stl]");
  const imgStage = modal.querySelector("[data-viewer-modal-image]");
  const imgEl = modal.querySelector(".viewer-modal__image");

  if (titleEl) titleEl.textContent = title;
  if (metaEl) metaEl.textContent = meta || "";

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (type === "stl" && stlUrl && stlStage) {
    if (imgStage) imgStage.hidden = true;
    stlStage.hidden = false;

    prepareStlStage(stlStage);
    stlStage.dataset.stlUrl = stlUrl;

    const status = stlStage.querySelector(".stl-load-status");
    const { dispose } = initSTLPreview(stlStage, {
      url: stlUrl,
      enableZoom: true,
      enablePan: true,
      enableRotate: true,
      autoRotate: false,
      passiveCanvas: false,
      statusElement: status,
    });
    currentDispose = dispose;
  } else if (type === "image" && imageUrl && imgStage && imgEl) {
    if (stlStage) stlStage.hidden = true;
    imgStage.hidden = false;
    imgEl.src = imageUrl;
    imgEl.alt = title;
  }
}

export function initViewerModalUI() {
  const modal = getModal();
  if (!modal) return;

  const backdrop = modal.querySelector(".viewer-modal__backdrop");
  const btnClose = modal.querySelector(".viewer-modal__close");

  btnClose?.addEventListener("click", closeViewerModal);
  backdrop?.addEventListener("click", closeViewerModal);

  document.addEventListener("keydown", (ev) => {
    if (!modal.hidden && ev.key === "Escape") {
      ev.preventDefault();
      closeViewerModal();
    }
  });
}
