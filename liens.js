// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Pages ouvertes dans le portail
// ═══════════════════════════════════════════════════════
// Dans l'application téléphone, un lien vers une autre page ouvrait une
// nouvelle fenêtre (ou le navigateur). Ici, les pages qui peuvent s'afficher
// dans le portail s'ouvrent dans une visionneuse plein écran, avec un bouton
// « ← Retour » (le retour du téléphone la ferme aussi) :
//   - les pages du portail (CGU, mentions légales…) et ses images (entretien machine…) ;
//   - les fichiers Google Drive (aperçu Drive) ;
//   - la carte Google My Maps « Les bonnes adresses » ;
//   - le formulaire « Signaler un incident » (NoteForms) ;
//   - les autres pages publiées à la même adresse (ex. Accueil visiteurs).
// Les autres sites (Stripe, Notion, Google Sheets, restaurants…) refusent
// d'être affichés à l'intérieur d'un autre site : ils s'ouvrent à part, comme avant.
//
// Aucun autre fichier n'a besoin d'appeler ce module : il observe les clics
// sur tous les liens, y compris ceux ajoutés plus tard par les autres fichiers.

(function () {
  "use strict";

  const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
  const PORTAL = new URL("./", location.href).href; // page d'accueil du portail

  // Adresse à afficher dans la visionneuse, ou null si le lien s'ouvre à part
  function viewerSource(url) {
    if (url.origin === location.origin) {
      if (url.href.split("#")[0] === PORTAL || url.pathname === new URL("index.html", PORTAL).pathname) return null;
      if (/\.pdf$/i.test(url.pathname)) return null; // Android n'affiche pas les PDF dans une page
      return { src: url.href, image: IMAGE.test(url.pathname) };
    }
    if (url.hostname === "drive.google.com") {
      const m = url.pathname.match(/^\/file\/d\/([\w-]+)/);
      if (m) return { src: "https://drive.google.com/file/d/" + m[1] + "/preview" };
    }
    if (url.hostname === "www.google.com" && /^\/maps\/d\/(edit|viewer)$/.test(url.pathname) && url.searchParams.get("mid")) {
      return { src: "https://www.google.com/maps/d/embed?mid=" + encodeURIComponent(url.searchParams.get("mid")) };
    }
    if (url.hostname === "noteforms.com" && url.pathname.startsWith("/forms/")) {
      return { src: url.href };
    }
    return null;
  }

  // ── Visionneuse ──
  const viewer = document.createElement("div");
  viewer.className = "viewer";
  viewer.hidden = true;
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.innerHTML =
    '<div class="viewer-bar">' +
      '<button type="button" class="back-btn viewer-close">← Retour</button>' +
      '<span class="viewer-title"></span>' +
      '<a class="viewer-out" target="_blank" rel="noopener" data-no-viewer>Ouvrir à part ↗</a>' +
    '</div>' +
    '<div class="viewer-body"></div>';
  document.body.appendChild(viewer);

  const titleEl = viewer.querySelector(".viewer-title");
  const outEl   = viewer.querySelector(".viewer-out");
  const bodyEl  = viewer.querySelector(".viewer-body");
  let pushed = false; // une entrée d'historique a été ajoutée à l'ouverture

  function openViewer(source, href, title) {
    titleEl.textContent = title;
    outEl.href = href;
    bodyEl.innerHTML = "";
    let el;
    if (source.image) {
      el = document.createElement("img");
      el.alt = title;
    } else {
      el = document.createElement("iframe");
      el.title = title;
      el.allow = "clipboard-write";
      el.addEventListener("load", function () { adaptInnerLinks(el); });
    }
    el.src = source.src;
    bodyEl.appendChild(el);
    viewer.hidden = false;
    document.body.classList.add("viewer-open");
    if (!pushed && window.history && history.pushState) {
      history.pushState({ hiptownViewer: true }, "");
      pushed = true;
    }
  }

  function closeViewer() {
    viewer.hidden = true;
    document.body.classList.remove("viewer-open");
    bodyEl.innerHTML = "";
  }

  // Bouton « ← Retour » : on recule dans l'historique, ce qui ferme la visionneuse
  viewer.querySelector(".viewer-close").addEventListener("click", function () {
    if (pushed) history.back();
    else closeViewer();
  });
  // Retour du téléphone ou du navigateur
  window.addEventListener("popstate", function () {
    pushed = false;
    if (!viewer.hidden) closeViewer();
  });

  // Pages du portail affichées dans la visionneuse : leur lien « Retour au
  // portail » ferme la visionneuse, et les sites externes s'ouvrent à part.
  function adaptInnerLinks(frame) {
    let doc;
    try { doc = frame.contentDocument; } catch (e) { return; } // autre site : rien à adapter
    if (!doc) return;
    doc.addEventListener("click", function (e) {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      const url = new URL(a.href, doc.baseURI);
      if (url.origin === location.origin && url.href.split("#")[0] === PORTAL) {
        e.preventDefault();
        viewer.querySelector(".viewer-close").click();
      } else if (url.origin !== location.origin && /^https?:$/.test(url.protocol)) {
        a.target = "_blank";
        a.rel = "noopener";
      }
    });
  }

  // ── Tous les liens du portail ──
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.hasAttribute("data-no-viewer") || a.hasAttribute("download")) return;
    const raw = a.getAttribute("href");
    if (!raw || raw.charAt(0) === "#") return;
    let url;
    try { url = new URL(a.href); } catch (err) { return; }
    if (!/^https?:$/.test(url.protocol)) return; // mailto:, tel:…

    const source = viewerSource(url);
    if (source) {
      e.preventDefault();
      const title = (a.textContent || "").replace(/\s+/g, " ").trim() || "Hiptown";
      openViewer(source, a.href, title);
      return;
    }
    // Site externe : toujours à part, pour ne jamais quitter l'application
    if (url.origin !== location.origin && !a.target) {
      a.target = "_blank";
      a.rel = "noopener";
    }
  });
})();
