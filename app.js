// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — app.js v9 — comptes Firebase (PIN supprimé)
// ═══════════════════════════════════════════════════════

(function () {
  "use strict";

  // ── DOM ───────────────────────────────────────────────
  const eventsBanner       = document.getElementById("events-banner");
  const stepWelcome        = document.getElementById("step-welcome");
  const welcomeConnexionBtn = document.getElementById("welcome-connexion-btn");
  const backFromChoice     = document.getElementById("back-from-choice");
  const stepChoice         = document.getElementById("step-choice");
  const stepDashboard      = document.getElementById("step-dashboard");
  const stepInfo           = document.getElementById("step-info");
  const stepServices       = document.getElementById("step-services");
  const stepComplem        = document.getElementById("step-complem");
  const stepSalleInfo      = document.getElementById("step-salle-info");
  const stepHiptownOutils  = document.getElementById("step-hiptown-outils");
  const stepHiptownEspaces = document.getElementById("step-hiptown-espaces");
  const stepSiteDetail     = document.getElementById("step-site-detail");

  const welcomeTitle   = document.getElementById("welcome-title");
  const companyBadge   = document.getElementById("company-badge");
  const logoutBtn      = document.getElementById("logout-btn");
  const tilesGrid      = document.getElementById("tiles-grid");

  const backFromInfo        = document.getElementById("back-from-info");
  const backFromServ        = document.getElementById("back-from-services");
  const backFromComp        = document.getElementById("back-from-complem");
  const backFromSalleInfo   = document.getElementById("back-from-salle-info");
  const backFromHipOutils   = document.getElementById("back-from-hiptown-outils");
  const backFromHipEspaces  = document.getElementById("back-from-hiptown-espaces");
  const backFromSiteDetail  = document.getElementById("back-from-site-detail");
  const siteDetailTitle     = document.getElementById("site-detail-title");
  const siteDetailTools     = document.getElementById("site-detail-tools");

  const choiceSalle     = document.getElementById("choice-salle");
  const choiceCoworking = document.getElementById("choice-coworking");
  const choiceHiptown   = document.getElementById("choice-hiptown");

  document.getElementById("year").textContent = new Date().getFullYear();

  // ── Événements ────────────────────────────────────────
  function buildEvents() {
    if (!PORTAIL.events || PORTAIL.events.length === 0) return;
    const banner = document.getElementById("events-banner");
    const track  = document.getElementById("events-track");
    const dotsEl = document.getElementById("events-dots");
    let current = 0;

    PORTAIL.events.forEach(function (ev, i) {
      const card = document.createElement("div");
      card.className = "event-card";
      var imgHtml = ev.image
        ? '<img src="' + ev.image + '" alt="' + ev.title + '"/>'
        : '<div class="event-card-no-img">\uD83D\uDCC5</div>';
      card.innerHTML = imgHtml +
        '<div class="event-info">' +
        '<div class="event-date">' + ev.date + '</div>' +
        '<div class="event-title">' + ev.title + '</div>' +
        '<div class="event-desc">' + ev.desc + '</div>' +
        '</div>';
      track.appendChild(card);

      var dot = document.createElement("div");
      dot.className = "events-dot" + (i === 0 ? " active" : "");
      dot.addEventListener("click", function() { goTo(i); });
      dotsEl.appendChild(dot);
    });

    function goTo(idx) {
      current = idx;
      track.querySelectorAll(".event-card").forEach(function(c, i) {
        c.style.transform = "translateX(" + ((i - idx) * 100) + "%)";
      });
      dotsEl.querySelectorAll(".events-dot").forEach(function(d, i) {
        d.classList.toggle("active", i === idx);
      });
    }

    track.querySelectorAll(".event-card").forEach(function(c, i) {
      c.style.transform = "translateX(" + (i * 100) + "%)";
    });

    if (PORTAIL.events.length > 1) {
      setInterval(function() { goTo((current + 1) % PORTAIL.events.length); }, 4000);
    }
  }

  buildEvents();

  // ── Animation header ──────────────────────────────────
  const taglines = ["Votre espace client", "Vos services en un clic", "Bienvenue chez Hiptown"];
  let taglineIndex = 0;
  const taglineEl = document.getElementById("header-tagline");
  setInterval(function () {
    taglineIndex = (taglineIndex + 1) % taglines.length;
    taglineEl.style.opacity = "0";
    setTimeout(function () { taglineEl.textContent = taglines[taglineIndex]; taglineEl.style.opacity = "1"; }, 300);
  }, 2500);

  // ── Tuiles ────────────────────────────────────────────
  const TILE_DEFS = {
    accueil:   { title: "Accueil visiteurs",        desc: "Prévenez-nous de votre arrivée",         icon: "🔔", bg: "#e8faf7", color: "#085041", url: "https://cosme75-85.github.io/Hiptown-Accueil-1/" },
    marcel:    { title: "Marcel BY Hiptown",         desc: "Accédez à vos services",                 icon: "<img src='H.png' style='width:40px;height:40px;object-fit:contain;'/>", bg: "#fef3c7", color: "#92400e", url: "https://marcel.hiptown.co/auth/login" },
    factures:  { title: "Mes factures",              desc: "Consultez vos factures",                 icon: "📄", bg: "#e0f2fe", color: "#0369a1", url: "https://billing.stripe.com/p/login/00gg13amLdHUgIUcMM" },
    incident:  { title: "Signaler un incident",      desc: "Signalez un dysfonctionnement",          icon: "⚠️", bg: "#fee2e2", color: "#dc2626", url: "https://noteforms.com/forms/nabo0609-emergence-cw-dcepd5" },
    info:      { title: "Informations",              desc: "Guides pratiques & équipements",         icon: "ℹ️", bg: "#f0f0ff", color: "#4338ca", url: null, action: "info" },
    salleinfo: { title: "Utilisation des salles",    desc: "Internet, écran, sortie...",             icon: "🗓️", bg: "#e0f2fe", color: "#0369a1", url: null, action: "salleinfo" },
    services:  { title: "Les services",              desc: "Tout ce qui est inclus",                 icon: "✨", bg: "#f0fdf4", color: "#166534", url: null, action: "services" },
    complem:   { title: "Services complémentaires",  desc: "Parking, espace commun...",              icon: "➕", bg: "#fff7ed", color: "#c2410c", url: null, action: "complem" },
    adresses:  { title: "Les bonnes adresses",       desc: "Restaurants, cafés, services...",        icon: "📍", bg: "#fce7f3", color: "#be185d", url: "https://www.google.com/maps/d/edit?mid=1qkXCeH3ESbRKg0VrPkCHDOGk9paZ4d8&usp=sharing" },
    avis:      { title: "⭐ Laisser un avis Google", desc: "Partagez votre expérience !",            icon: "⭐", bg: "#fef9c3", color: "#854d0e", url: "https://g.page/r/CU4ouN9TY1R8EBM/review", wide: true },
    hiptools:  { title: "Outils Hiptown",            desc: "Facturation, organisation, plateformes", icon: "🛠️", bg: "#1e1847", color: "#ffe700", url: null, action: "hiptools" },
    hipespaces:{ title: "Sites",                     desc: "NABO02 à NABO08",                        icon: "🏢", bg: "#f0f0ff", color: "#4338ca", url: null, action: "hipespaces" },
    gestion:   { title: "Gestion des comptes",       desc: "Valider les accès",                      icon: "🔑", bg: "#fee2e2", color: "#dc2626", url: null, action: "admin" },
  };

  const SPACE_TILES = {
    salle:     ["accueil", "marcel", "salleinfo", "adresses", "services", "complem", "avis"],
    coworking: ["accueil", "marcel", "factures", "incident", "info", "services", "complem", "adresses", "avis"],
    hiptown:   ["hiptools", "hipespaces", "gestion", "accueil", "incident"],
  };

  // ── Données des sites ─────────────────────────────────
  const SITES = {
    nabo02: { name: "NABO02 — Place de la Bourse CCI Tetris", tools: [] },
    nabo03: { name: "NABO03 — Ferrere",                       tools: [] },
    nabo04: { name: "NABO04 — Chartrons",                     tools: [] },
    nabo05: { name: "NABO05 — Place de la Bourse CCI KBRW",   tools: [] },
    nabo06: {
      name: "NABO06 — Émergence",
      tools: [
        { cat: "🏗️ Gestion du site", items: [
          { label: "SOONE",     url: "https://gestion.soone.io/#/site/13255/mode/0/bat/17640" },
          { label: "Equans",    url: "https://axicontact.equans.fr/fr" },
        { label: "Ticketing Mail", url: "https://docs.google.com/email-layouts/d/1YRtE7mRD0MEx6Ppy_ZVJJFQ5oKTL65MnKjC-f_Cx6Po/edit" },
        { label: "Ticketing",      url: "https://app.notion.com/p/2c3924b0918981b3b238f0caae907739?v=380924b0918980cc9ff1000c09a3e59e" },
        ]},
        { cat: "🪪 Badges", items: [
          { label: "Scaleway",  url: "https://docs.google.com/spreadsheets/d/1ABaAxGiDw2IT9CcrVjlalasT3DszaVrQ0IYWUT7q28g/edit?gid=0#gid=0" },
          { label: "Coworking", url: "https://docs.google.com/spreadsheets/d/1inKYBGIAUy2B8HWuBZgRIKz1u8CtEYzasQExHmBgyJE/edit?gid=0#gid=0" },
        ]},
        { cat: "💰 Commercial", items: [
          { label: "Créer un devis", url: "https://docs.google.com/spreadsheets/d/18w1TEuTH3PgPQiS93DUVZ3j-67dOGzMOC3cKp0fzgGI/edit?gid=382742302#gid=382742302" },
          { label: "Facture DG",    url: "https://docs.google.com/spreadsheets/d/1cGdu68qtmZLC0ez3a56RKh0sq2GtytA896TcALCeopg/edit?gid=11173933#gid=11173933" },
          { label: "CRM",           url: "https://hiptown.nocrm.io/login" },
          { label: "Compte",        url: "https://docs.google.com/spreadsheets/d/1XKVAcpBn54BIh2q-jH8ApQXHPIKWx0Vlhz-yf4Xvr3Y/edit?gid=0#gid=0" },
        ]},
        { cat: "☕ Services", items: [
          { label: "Café et thé", url: "https://docs.google.com/spreadsheets/d/1Ep0WrXIHGhrn6wZ845F7h3KL7jCHwgbqdlMpZ9a82Y4/edit?gid=1103668669#gid=1103668669" },
        ]},
      ]
    },
    nabo07: { name: "NABO07 — Tourny", tools: [] },
    nabo08: { name: "NABO08 — Madéra", tools: [] },
  };

  // ── État ──────────────────────────────────────────────
  let currentSpace    = null;
  let currentClientId = null;
  let dragSrc         = null;

  // ── Helpers ───────────────────────────────────────────
  function hideAll() {
    [stepWelcome, stepChoice, stepDashboard, stepInfo, stepServices, stepComplem,
     stepSalleInfo, stepHiptownOutils, stepHiptownEspaces, stepSiteDetail]
    .forEach(function(s) { s.hidden = true; });
    eventsBanner.hidden = true;
  }

  // ── Accueil ⇄ Choix de l'espace ────────────────────────
  welcomeConnexionBtn.addEventListener("click", function () {
    hideAll(); stepChoice.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  backFromChoice.addEventListener("click", function () {
    hideAll(); stepWelcome.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ── Choix de l'espace ─────────────────────────────────
  choiceSalle.addEventListener("click", function () { window.openAuthScreen("salle"); });
  choiceCoworking.addEventListener("click", function () { window.openAuthScreen("coworking"); });
  choiceHiptown.addEventListener("click", function () { window.openAuthScreen("admin"); });

  // ── Dashboard ─────────────────────────────────────────
  function showDashboard(client) {
    currentClientId = client.id;
    companyBadge.style.background = client.color;
    companyBadge.style.color      = client.textColor;
    companyBadge.textContent      = client.initials;
    welcomeTitle.textContent      = client.name;
    buildTiles(currentSpace, client.id);
    hideAll(); stepDashboard.hidden = false;
    if (PORTAIL.events && PORTAIL.events.length > 0) eventsBanner.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  logoutBtn.addEventListener("click", function () {
    currentSpace = null; currentClientId = null;
    hideAll(); stepWelcome.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ── Tuiles ────────────────────────────────────────────
  function getSavedOrder(clientId, tileIds) {
    try {
      const saved = localStorage.getItem("tiles_" + clientId);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return tileIds;
  }

  function saveOrder(clientId) {
    const order = Array.from(tilesGrid.querySelectorAll(".tile")).map(function(c) { return c.getAttribute("data-id"); });
    localStorage.setItem("tiles_" + clientId, JSON.stringify(order));
  }

  function buildTiles(space, clientId) {
    tilesGrid.innerHTML = "";
    const tileIds = SPACE_TILES[space] || [];
    const order   = getSavedOrder(clientId, tileIds);
    const sorted  = order.filter(function(id) { return tileIds.includes(id); });
    tileIds.forEach(function(id) { if (!sorted.includes(id)) sorted.push(id); });

    sorted.forEach(function (id) {
      const tile = TILE_DEFS[id];
      if (!tile) return;

      const el = document.createElement("a");
      el.className = "tile" + (tile.wide ? " tile-wide" : "");
      el.href      = tile.url || "#";
      el.setAttribute("data-id", id);
      el.draggable = true;
      if (tile.url) el.target = "_blank";

      el.innerHTML =
        '<div class="tile-drag-hint">⠿</div>' +
        '<div class="tile-icon" style="background:' + tile.bg + ';color:' + tile.color + ';">' + tile.icon + '</div>' +
        '<div class="tile-title">' + tile.title + '</div>' +
        '<div class="tile-desc">' + tile.desc + '</div>';

      if (tile.action) {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          hideAll();
          if (tile.action === "info")       stepInfo.hidden           = false;
          if (tile.action === "services")   stepServices.hidden       = false;
          if (tile.action === "complem")    stepComplem.hidden        = false;
          if (tile.action === "salleinfo")  stepSalleInfo.hidden      = false;
          if (tile.action === "hiptools")   stepHiptownOutils.hidden  = false;
          if (tile.action === "hipespaces") stepHiptownEspaces.hidden = false;
          document.dispatchEvent(new CustomEvent("hiptown-tile-action", { detail: tile.action }));
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }

      // Desktop drag
      el.addEventListener("dragstart", function (e) { dragSrc = this; this.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      el.addEventListener("dragend",   function ()  { this.classList.remove("dragging"); tilesGrid.querySelectorAll(".tile").forEach(function(c) { c.classList.remove("drag-over"); }); saveOrder(currentClientId); });
      el.addEventListener("dragover",  function (e) { e.preventDefault(); if (this !== dragSrc) { tilesGrid.querySelectorAll(".tile").forEach(function(c) { c.classList.remove("drag-over"); }); this.classList.add("drag-over"); } });
      el.addEventListener("drop",      function (e) {
        e.preventDefault();
        if (this !== dragSrc) {
          const all = Array.from(tilesGrid.querySelectorAll(".tile"));
          if (all.indexOf(dragSrc) < all.indexOf(this)) tilesGrid.insertBefore(dragSrc, this.nextSibling);
          else tilesGrid.insertBefore(dragSrc, this);
        }
      });

      // Mobile long press
      var longPressTimer, clone, isDragging = false;
      el.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        var t = e.touches[0]; var self = this;
        longPressTimer = setTimeout(function () {
          isDragging = true; dragSrc = self;
          clone = self.cloneNode(true);
          clone.style.cssText = "position:fixed;opacity:0.7;pointer-events:none;z-index:9999;width:" + self.offsetWidth + "px;left:" + (t.clientX - self.offsetWidth/2) + "px;top:" + (t.clientY - self.offsetHeight/2) + "px;border-radius:14px;";
          document.body.appendChild(clone);
          self.classList.add("dragging");
          if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
      }, { passive: true });
      el.addEventListener("touchmove", function (e) {
        if (!isDragging) { clearTimeout(longPressTimer); return; }
        e.preventDefault();
        var t = e.touches[0];
        clone.style.left = (t.clientX - dragSrc.offsetWidth/2) + "px";
        clone.style.top  = (t.clientY - dragSrc.offsetHeight/2) + "px";
        var tgt = document.elementFromPoint(t.clientX, t.clientY);
        var tileTgt = tgt ? tgt.closest(".tile") : null;
        tilesGrid.querySelectorAll(".tile").forEach(function(c) { c.classList.remove("drag-over"); });
        if (tileTgt && tileTgt !== dragSrc) tileTgt.classList.add("drag-over");
      }, { passive: false });
      el.addEventListener("touchend", function (e) {
        clearTimeout(longPressTimer);
        if (!isDragging) return;
        var t = e.changedTouches[0];
        var tgt = document.elementFromPoint(t.clientX, t.clientY);
        var tileTgt = tgt ? tgt.closest(".tile") : null;
        if (tileTgt && tileTgt !== dragSrc) {
          var all = Array.from(tilesGrid.querySelectorAll(".tile"));
          if (all.indexOf(dragSrc) < all.indexOf(tileTgt)) tilesGrid.insertBefore(dragSrc, tileTgt.nextSibling);
          else tilesGrid.insertBefore(dragSrc, tileTgt);
        }
        if (clone) { clone.remove(); clone = null; }
        dragSrc.classList.remove("dragging");
        tilesGrid.querySelectorAll(".tile").forEach(function(c) { c.classList.remove("drag-over"); });
        saveOrder(currentClientId);
        isDragging = false;
      }, { passive: true });
      el.addEventListener("touchcancel", function () {
        clearTimeout(longPressTimer);
        if (clone) { clone.remove(); clone = null; }
        if (dragSrc) dragSrc.classList.remove("dragging");
        tilesGrid.querySelectorAll(".tile").forEach(function(c) { c.classList.remove("drag-over"); });
        isDragging = false;
      }, { passive: true });

      tilesGrid.appendChild(el);
    });
  }

  // ── Retours ───────────────────────────────────────────
  [backFromInfo, backFromServ, backFromComp, backFromSalleInfo, backFromHipOutils, backFromHipEspaces].forEach(function (btn) {
    btn.addEventListener("click", function () { hideAll(); stepDashboard.hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); });
  });

  backFromSiteDetail.addEventListener("click", function () {
    hideAll(); stepHiptownEspaces.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ── Sites ─────────────────────────────────────────────
  document.querySelectorAll(".site-card").forEach(function (card) {
    card.addEventListener("click", function () {
      var siteId = this.getAttribute("data-site");
      var site   = SITES[siteId];
      if (!site) return;
      siteDetailTitle.textContent = site.name;
      siteDetailTools.innerHTML   = "";

      if (site.tools.length === 0) {
        siteDetailTools.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">Outils à venir...</p>';
      } else {
        site.tools.forEach(function (cat) {
          var div = document.createElement("div");
          div.className = "info-card";
          var bodyHtml = cat.items.map(function (item) {
            return '<a class="info-item" href="' + item.url + '" target="_blank">🔗 ' + item.label + '</a>';
          }).join("");
          div.innerHTML =
            '<div class="info-card-header">' +
            '<span class="info-card-title">' + cat.cat + '</span>' +
            '<span class="info-chevron">▼</span>' +
            '</div>' +
            '<div class="info-card-body" hidden>' + bodyHtml + '</div>';
          div.querySelector(".info-card-header").addEventListener("click", function() {
            var body = this.nextElementSibling;
            var chev = this.querySelector(".info-chevron");
            body.hidden = !body.hidden;
            chev.textContent = body.hidden ? "▼" : "▲";
          });
          siteDetailTools.appendChild(div);
        });
      }

      hideAll(); stepSiteDetail.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // ── Recherche outils Hiptown ──────────────────────────
  var outilsSearch = document.getElementById("outils-search");
  if (outilsSearch) {
    outilsSearch.addEventListener("input", function () {
      var q = this.value.trim().toLowerCase();
      var cards = document.querySelectorAll(".outil-card");
      cards.forEach(function (card) {
        var name = card.getAttribute("data-name") || "";
        card.style.display = (!q || name.includes(q)) ? "" : "none";
      });
      document.querySelectorAll(".outils-category").forEach(function (cat) {
        var visible = Array.from(cat.querySelectorAll(".outil-card")).some(function(c) { return c.style.display !== "none"; });
        cat.style.display = visible ? "" : "none";
      });
    });
  }

  // ── Accordéons statiques ──────────────────────────────
  document.querySelectorAll(".info-card-header").forEach(function (header) {
    header.addEventListener("click", function () {
      var body = this.parentElement.querySelector(".info-card-body");
      var chev = this.querySelector(".info-chevron");
      body.hidden = !body.hidden;
      chev.textContent = body.hidden ? "▼" : "▲";
    });
  });

  // ── Pont vers app-auth.js ──────────────────────────────
  window.hideAll = hideAll;
  window.showDashboardFromAuth = function (client, space) {
    currentSpace = space;
    showDashboard(client);
  };

})();
