// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — app.js v5 — long press mobile
// ═══════════════════════════════════════════════════════

(function () {
  "use strict";

  const stepPin       = document.getElementById("step-pin");
  const stepDashboard = document.getElementById("step-dashboard");
  const stepInfo      = document.getElementById("step-info");
  const stepServices  = document.getElementById("step-services");
  const stepComplem   = document.getElementById("step-complem");
  const pinDots       = document.getElementById("pin-dots").querySelectorAll("span");
  const pinError      = document.getElementById("pin-error");
  const pinKeys       = document.querySelectorAll(".pin-key");
  const welcomeTitle  = document.getElementById("welcome-title");
  const companyBadge  = document.getElementById("company-badge");
  const logoutBtn     = document.getElementById("logout-btn");
  const tilesGrid     = document.getElementById("tiles-grid");
  const backFromInfo  = document.getElementById("back-from-info");
  const backFromServ  = document.getElementById("back-from-services");
  const backFromComp  = document.getElementById("back-from-complem");
  const directHiptown = document.getElementById("direct-hiptown");

  document.getElementById("year").textContent = new Date().getFullYear();

  // ── Événements ────────────────────────────────────────
  function buildEvents() {
    if (!PORTAIL.events || PORTAIL.events.length === 0) return;
    const banner = document.getElementById("events-banner");
    const track  = document.getElementById("events-track");
    const dotsEl = document.getElementById("events-dots");
    banner.hidden = false;
    let current = 0;

    // Wrapper pour le carousel
    track.style.display = "flex";
    track.style.overflow = "hidden";

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
      var cards = track.querySelectorAll(".event-card");
      cards.forEach(function(c, i) {
        c.style.transform = "translateX(" + ((i - idx) * 100) + "%)";
        c.style.transition = "transform 0.4s ease";
        c.style.position = i === 0 ? "relative" : "absolute";
        c.style.left = "0";
        c.style.top = "0";
        c.style.width = "100%";
      });
      dotsEl.querySelectorAll(".events-dot").forEach(function(d, i) {
        d.classList.toggle("active", i === idx);
      });
    }

    // Init positions
    var cards = track.querySelectorAll(".event-card");
    track.style.position = "relative";
    cards.forEach(function(c, i) {
      c.style.position = i === 0 ? "relative" : "absolute";
      c.style.left = "0";
      c.style.top = "0";
      c.style.width = "100%";
      c.style.transform = "translateX(" + (i * 100) + "%)";
    });

    if (PORTAIL.events.length > 1) {
      setInterval(function() {
        goTo((current + 1) % PORTAIL.events.length);
      }, 4000);
    }
  }

  buildEvents();

  const taglines = ["Votre espace client", "Vos services en un clic", "Bienvenue chez Hiptown"];
  let taglineIndex = 0;
  const taglineEl = document.getElementById("header-tagline");
  setInterval(function () {
    taglineIndex = (taglineIndex + 1) % taglines.length;
    taglineEl.style.opacity = "0";
    setTimeout(function () { taglineEl.textContent = taglines[taglineIndex]; taglineEl.style.opacity = "1"; }, 300);
  }, 2500);

  const ALL_TILES = [
    { id: "accueil",  title: "Accueil visiteurs",        desc: "Prévenez-nous de votre arrivée",    icon: "🔔", bg: "#e8faf7", color: "#085041", url: "https://cosme75-85.github.io/Hiptown-Accueil-1/", wide: false },
    { id: "marcel",   title: "Marcel BY Hiptown",         desc: "Accédez à vos services",            icon: "<img src='H.png' style='width:40px;height:40px;object-fit:contain;'/>", bg: "#fef3c7", color: "#92400e", url: "https://marcel.hiptown.co/auth/login", wide: false },
    { id: "factures", title: "Mes factures",              desc: "Consultez vos factures",            icon: "📄", bg: "#e0f2fe", color: "#0369a1", url: "https://billing.stripe.com/p/login/00gg13amLdHUgIUcMM", wide: false },
    { id: "incident", title: "Signaler un incident",      desc: "Signalez un dysfonctionnement",     icon: "⚠️", bg: "#fee2e2", color: "#dc2626", url: "https://noteforms.com/forms/nabo0609-emergence-cw-dcepd5", wide: false },
    { id: "info",     title: "Informations",              desc: "Guides pratiques & équipements",    icon: "ℹ️", bg: "#f0f0ff", color: "#4338ca", url: null, action: "info",     wide: false },
    { id: "services", title: "Les services",              desc: "Tout ce qui est inclus",            icon: "✨", bg: "#f0fdf4", color: "#166534", url: null, action: "services", wide: false },
    { id: "complem",  title: "Services complémentaires",  desc: "Parking, espace commun...",         icon: "➕", bg: "#fff7ed", color: "#c2410c", url: null, action: "complem",  wide: false },
    { id: "adresses", title: "Les bonnes adresses",       desc: "Restaurants, cafés, services...",   icon: "📍", bg: "#fce7f3", color: "#be185d", url: "https://www.google.com/maps/d/edit?mid=1qkXCeH3ESbRKg0VrPkCHDOGk9paZ4d8&usp=sharing", wide: false },
    { id: "avis",     title: "⭐ Laisser un avis Google", desc: "Partagez votre expérience !",       icon: "⭐", bg: "#fef9c3", color: "#854d0e", url: "https://g.page/r/CU4ouN9TY1R8EBM/review", wide: true },
  ];

  let pinCurrent = "";
  let currentClientId = null;
  let dragSrc = null;

  function hideAll() {
    stepPin.hidden = stepDashboard.hidden = stepInfo.hidden = stepServices.hidden = stepComplem.hidden = true;
  }

  function updatePinDots() {
    pinDots.forEach(function (dot, i) { dot.classList.toggle("filled", i < pinCurrent.length); });
  }

  function showDashboard(client) {
    currentClientId = client.id;
    companyBadge.style.background = client.color;
    companyBadge.style.color      = client.textColor;
    companyBadge.textContent      = client.initials;
    welcomeTitle.textContent      = client.name;
    buildTiles(client.id);
    hideAll();
    stepDashboard.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function checkPin() {
    const match = PORTAIL.clients.find(c => c.pin === pinCurrent);
    if (match) {
      pinError.hidden = true;
      setTimeout(function () { showDashboard(match); }, 200);
    } else {
      pinError.hidden = false;
      setTimeout(function () { pinCurrent = ""; pinError.hidden = true; updatePinDots(); }, 1000);
    }
  }

  pinKeys.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const val = this.getAttribute("data-val");
      if (val === "back")  { pinCurrent = pinCurrent.slice(0, -1); pinError.hidden = true; updatePinDots(); return; }
      if (val === "clear") { pinCurrent = ""; pinError.hidden = true; updatePinDots(); return; }
      if (pinCurrent.length >= 4) return;
      pinCurrent += val;
      updatePinDots();
      if (pinCurrent.length === 4) checkPin();
    });
  });

  directHiptown.addEventListener("click", function () {
    const hiptown = PORTAIL.clients.find(c => !c.pin);
    if (hiptown) showDashboard(hiptown);
  });

  logoutBtn.addEventListener("click", function () {
    pinCurrent = ""; updatePinDots(); pinError.hidden = true;
    hideAll(); stepPin.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  function getSavedOrder(clientId) {
    try {
      const saved = localStorage.getItem("tiles_" + clientId);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return ALL_TILES.map(t => t.id);
  }

  function saveOrder(clientId) {
    const cards = tilesGrid.querySelectorAll(".tile");
    const order = Array.from(cards).map(c => c.getAttribute("data-id"));
    localStorage.setItem("tiles_" + clientId, JSON.stringify(order));
  }

  function buildTiles(clientId) {
    tilesGrid.innerHTML = "";
    const order  = getSavedOrder(clientId);
    const sorted = order.map(id => ALL_TILES.find(t => t.id === id)).filter(Boolean);
    ALL_TILES.forEach(t => { if (!sorted.find(s => s.id === t.id)) sorted.push(t); });

    sorted.forEach(function (tile) {
      const el = document.createElement("a");
      el.className = "tile" + (tile.wide ? " tile-wide" : "");
      el.href      = tile.url || "#";
      el.setAttribute("data-id", tile.id);
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
          if (tile.action === "info")     stepInfo.hidden     = false;
          if (tile.action === "services") stepServices.hidden = false;
          if (tile.action === "complem")  stepComplem.hidden  = false;
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }

      // ── Drag & Drop desktop ───────────────────────────
      el.addEventListener("dragstart", function (e) {
        dragSrc = this;
        this.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      el.addEventListener("dragend", function () {
        this.classList.remove("dragging");
        tilesGrid.querySelectorAll(".tile").forEach(c => c.classList.remove("drag-over"));
        saveOrder(currentClientId);
      });

      el.addEventListener("dragover", function (e) {
        e.preventDefault();
        if (this !== dragSrc) {
          tilesGrid.querySelectorAll(".tile").forEach(c => c.classList.remove("drag-over"));
          this.classList.add("drag-over");
        }
      });

      el.addEventListener("drop", function (e) {
        e.preventDefault();
        if (this !== dragSrc) {
          const all = Array.from(tilesGrid.querySelectorAll(".tile"));
          if (all.indexOf(dragSrc) < all.indexOf(this)) tilesGrid.insertBefore(dragSrc, this.nextSibling);
          else tilesGrid.insertBefore(dragSrc, this);
        }
      });

      // ── Touch drag mobile — appui prolongé 500ms ──────
      let longPressTimer, clone, isDragging = false;

      el.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const self = this;

        longPressTimer = setTimeout(function () {
          isDragging = true;
          dragSrc = self;
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
        const t = e.touches[0];
        clone.style.left = (t.clientX - dragSrc.offsetWidth / 2) + "px";
        clone.style.top  = (t.clientY - dragSrc.offsetHeight / 2) + "px";
        const target = document.elementFromPoint(t.clientX, t.clientY);
        const tileTarget = target ? target.closest(".tile") : null;
        tilesGrid.querySelectorAll(".tile").forEach(c => c.classList.remove("drag-over"));
        if (tileTarget && tileTarget !== dragSrc) tileTarget.classList.add("drag-over");
      }, { passive: false });

      el.addEventListener("touchend", function (e) {
        clearTimeout(longPressTimer);
        if (!isDragging) return;
        const t = e.changedTouches[0];
        const target = document.elementFromPoint(t.clientX, t.clientY);
        const tileTarget = target ? target.closest(".tile") : null;
        if (tileTarget && tileTarget !== dragSrc) {
          const all = Array.from(tilesGrid.querySelectorAll(".tile"));
          if (all.indexOf(dragSrc) < all.indexOf(tileTarget)) tilesGrid.insertBefore(dragSrc, tileTarget.nextSibling);
          else tilesGrid.insertBefore(dragSrc, tileTarget);
        }
        if (clone) { clone.remove(); clone = null; }
        dragSrc.classList.remove("dragging");
        tilesGrid.querySelectorAll(".tile").forEach(c => c.classList.remove("drag-over"));
        saveOrder(currentClientId);
        isDragging = false;
      }, { passive: true });

      el.addEventListener("touchcancel", function () {
        clearTimeout(longPressTimer);
        if (clone) { clone.remove(); clone = null; }
        if (dragSrc) dragSrc.classList.remove("dragging");
        tilesGrid.querySelectorAll(".tile").forEach(c => c.classList.remove("drag-over"));
        isDragging = false;
      }, { passive: true });

      tilesGrid.appendChild(el);
    });
  }

  [backFromInfo, backFromServ, backFromComp].forEach(function (btn) {
    btn.addEventListener("click", function () {
      hideAll(); stepDashboard.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.querySelectorAll(".info-card-header").forEach(function (header) {
    header.addEventListener("click", function () {
      const body = this.parentElement.querySelector(".info-card-body");
      const chev = this.querySelector(".info-chevron");
      body.hidden = !body.hidden;
      chev.textContent = body.hidden ? "▼" : "▲";
    });
  });

})();
