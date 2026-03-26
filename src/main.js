import { openViewerModal, initViewerModalUI } from "./viewer-modal.js";
import thumbPlaceholderUrl from "../assets/thumb-placeholder.svg?url";

initViewerModalUI();

function initStlClickHints() {
  const thumbs = document.querySelectorAll(
    '.card-link[data-viewer="stl"] [data-card-thumb]'
  );
  for (const wrap of thumbs) {
    if (wrap.querySelector(".card-thumb__hint")) continue;
    const hint = document.createElement("span");
    hint.className = "card-thumb__hint";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = "Cliquer pour la vue en 3D";
    wrap.appendChild(hint);
  }
}

initStlClickHints();

const grid = document.querySelector(".gallery-grid");

grid?.addEventListener("click", (e) => {
  const card = e.target.closest(".card-link[data-viewer]");
  if (!card) return;
  const type = card.dataset.viewer;
  const title = card.dataset.title || "";
  const meta = card.dataset.meta || "";
  if (type === "stl") {
    const stlUrl = card.dataset.stlUrl;
    if (stlUrl) {
      e.preventDefault();
      openViewerModal({ type: "stl", stlUrl, title, meta });
    }
  } else if (type === "image") {
    const img = card.querySelector(".card-thumb img");
    const imageUrl = img?.currentSrc || img?.src;
    if (imageUrl) {
      e.preventDefault();
      openViewerModal({ type: "image", imageUrl, title, meta });
    }
  }
});

grid?.addEventListener("keydown", (e) => {
  const card = e.target.closest(".card-link[data-viewer]");
  if (!card || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  card.click();
});

/**
 * Vignettes : images statiques sous public/models/thumbs/<nom-du-stl>.jpg
 * (même nom de fichier que le .stl, extension .jpg).
 * Optionnel sur la carte : data-thumb-url pour un chemin personnalisé.
 * Si la vignette manque : placeholder SVG (importé, inclus au build).
 */
function thumbUrlFromCard(card) {
  const override = card.dataset.thumbUrl?.trim();
  if (override) return override;
  const stlUrl = card.dataset.stlUrl || "";
  const m = stlUrl.match(/([^/]+)\.stl$/i);
  if (!m) return null;
  return `./models/thumbs/${m[1]}.jpg`;
}

function initCardThumbs() {
  const cards = document.querySelectorAll(
    '.card-link[data-viewer="stl"] [data-card-thumb]'
  );

  for (const thumbWrap of cards) {
    const card = thumbWrap.closest(".card-link");
    const img = thumbWrap.querySelector(".card-thumb__img");
    if (!card || !img) continue;

    const title = card.dataset.title || "";
    img.alt = title;

    const url = thumbUrlFromCard(card);
    if (!url) {
      thumbWrap.classList.remove("is-loading");
      thumbWrap.classList.add("is-error");
      const status = thumbWrap.querySelector(".stl-load-status");
      if (status) status.textContent = "Vignette manquante.";
      img.removeAttribute("src");
      continue;
    }

    const onLoad = () => {
      thumbWrap.classList.remove("is-loading");
      const status = thumbWrap.querySelector(".stl-load-status");
      if (status) status.textContent = "";
    };
    const onError = () => {
      if (img.dataset.fallbackTried === "1") {
        thumbWrap.classList.remove("is-loading");
        thumbWrap.classList.add("is-error");
        const status = thumbWrap.querySelector(".stl-load-status");
        if (status) status.textContent = "Image indisponible.";
        return;
      }
      img.dataset.fallbackTried = "1";
      img.src = thumbPlaceholderUrl;
    };

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);

    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      onLoad();
    }
  }
}

initCardThumbs();
