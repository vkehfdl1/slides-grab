(function () {
  "use strict";

  const grid = document.getElementById("gallery-grid");
  const template = document.getElementById("card-template");
  const emptyState = document.getElementById("empty-state");
  const countEl = document.getElementById("gallery-count");
  const generatedEl = document.getElementById("footer-generated");

  fetch("./assets/manifest.json", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error("manifest fetch failed: " + res.status);
      return res.json();
    })
    .then(render)
    .catch(handleError);

  function render(manifest) {
    const presentations = Array.isArray(manifest.presentations) ? manifest.presentations : [];
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = "";

    if (generatedEl && manifest.generatedAt) {
      generatedEl.textContent = "Generated " + formatRelative(manifest.generatedAt);
    }

    if (presentations.length === 0) {
      countEl.textContent = "0 presentations";
      emptyState.hidden = false;
      return;
    }

    countEl.textContent =
      presentations.length === 1 ? "1 presentation" : presentations.length + " presentations";

    for (const p of presentations) {
      grid.appendChild(buildCard(p));
    }
  }

  function buildCard(p) {
    const node = template.content.firstElementChild.cloneNode(true);
    const target = p.viewer || p.firstSlide || p.pdf || "#";

    const thumbLink = node.querySelector('[data-slot="thumb-link"]');
    thumbLink.href = target;
    thumbLink.target = "_blank";
    thumbLink.rel = "noreferrer noopener";
    thumbLink.setAttribute("aria-label", "Open " + p.title);

    const thumb = node.querySelector('[data-slot="thumb"]');
    const placeholder = thumb.querySelector('[data-slot="placeholder"]');
    if (p.thumbnail) {
      const img = document.createElement("img");
      img.alt = p.title + " — first slide preview";
      img.loading = "lazy";
      img.decoding = "async";
      const dropPlaceholder = () => {
        if (placeholder && placeholder.parentNode) placeholder.remove();
      };
      img.addEventListener("load", dropPlaceholder);
      img.addEventListener("error", () => {
        img.remove();
      });
      thumb.appendChild(img);
      img.src = p.thumbnail;
      if (img.complete && img.naturalWidth > 0) dropPlaceholder();
    }

    node.querySelector('[data-slot="title"]').textContent = p.title;

    const desc = node.querySelector('[data-slot="description"]');
    desc.textContent = p.description || "";

    const slidesEl = node.querySelector('[data-slot="slides"]');
    slidesEl.textContent = (p.slideCount || 0) + " slides";

    const dateEl = node.querySelector('[data-slot="date"]');
    if (p.date) {
      dateEl.textContent = formatDate(p.date);
    } else {
      dateEl.remove();
    }

    const tagsContainer = node.querySelector('[data-slot="tags"]');
    if (Array.isArray(p.tags) && p.tags.length > 0) {
      for (const tag of p.tags) {
        const span = document.createElement("span");
        span.className = "card-tag";
        span.textContent = tag;
        tagsContainer.appendChild(span);
      }
    }

    const primary = node.querySelector('[data-slot="primary"]');
    primary.href = target;
    primary.target = "_blank";
    primary.rel = "noreferrer noopener";
    if (!p.viewer && p.firstSlide) {
      primary.textContent = "Open first slide →";
    } else if (!p.viewer && p.pdf) {
      primary.textContent = "Open PDF →";
    }

    const pdfLink = node.querySelector('[data-slot="pdf"]');
    if (p.pdf) {
      pdfLink.href = p.pdf;
      pdfLink.target = "_blank";
      pdfLink.rel = "noreferrer noopener";
      pdfLink.hidden = false;
    }

    return node;
  }

  function handleError(err) {
    console.error(err);
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = "";
    countEl.textContent = "";
    emptyState.hidden = false;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function formatRelative(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const diff = Date.now() - d.getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return minutes + "m ago";
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours + "h ago";
    const days = Math.round(hours / 24);
    if (days < 30) return days + "d ago";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
})();
