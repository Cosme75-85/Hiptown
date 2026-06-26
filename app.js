// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — app.js v2
// ═══════════════════════════════════════════════════════

(function () {
  "use strict";

  const stepPin       = document.getElementById("step-pin");
  const stepDashboard = document.getElementById("step-dashboard");
  const stepInfo      = document.getElementById("step-info");
  const pinDots       = document.getElementById("pin-dots").querySelectorAll("span");
  const pinError      = document.getElementById("pin-error");
  const pinKeys       = document.querySelectorAll(".pin-key");
  const welcomeTitle  = document.getElementById("welcome-title");
  const companyBadge  = document.getElementById("company-badge");
  const logoutBtn     = document.getElementById("logout-btn");
  const tilesGrid     = document.getElementById("tiles-grid");
  const backFromInfo  = document.getElementById("back-from-info");
  const directHiptown = document.getElementById("direct-hiptown");

  document.getElementById("year").textContent = new Date().getFullYear();

  // Animation header
  const taglines = ["Votre espace client", "Vos services en un clic", "Bienvenue chez Hiptown"];
  let taglineIndex = 0;
  const taglineEl = document.getElementById("header-tagline");
  setInterval(function () {
    taglineIndex = (taglineIndex + 1) % taglines.length;
    taglineEl.style.opacity = "0";
    setTimeout(function () {
      taglineEl.textContent = taglines[taglineIndex];
      taglineEl.style.opacity = "1";
    }, 300);
  }, 2500);

  // ── Définition des tuiles ──────────────────────────
  const ALL_TILES = [
    {
      id:    "accueil",
      title: "Accueil visiteurs",
      desc:  "Prévenez-nous de votre arrivée",
      icon:  "🔔",
      bg:    "#e8faf7",
      color: "#085041",
      url:   "https://cosme75-85.github.io/Hiptown-Accueil-1/",
      wide:  false,
    },
    {
      id:    "marcel",
      title: "Marcel BY Hiptown",
      desc:  "Accédez à vos services",
      icon:  "H.png",
      bg:    "#fef3c7",
      color: "#92400e",
      url:   "https://marcel.hiptown.co/auth/login",
      wide:  false,
    },
    {
      id:    "factures",
      title: "Mes factures",
      desc:  "Consultez vos factures",
      icon:  "📄",
      bg:    "#e0f2fe",
      color: "#0369a1",
      url:   "https://billing.stripe.com/p/login/00gg13amLdHUgIUcMM",
      wide:  false,
    },
    {
      id:    "incident",
      title: "Signaler un incident",
      desc:  "Signalez un dysfonctionnement",
      icon:  "⚠️",
      bg:    "#fee2e2",
      color: "#dc2626",
      url:   "https://bit.ly/hiptown-incident",
      wide:  false,
    },
    {
      id:    "info",
      title: "Informations",
      desc:  "Guides pratiques & équipements",
      icon:  "ℹ️",
      bg:    "#f0f0ff",
      color: "#4338ca",
      url:   null,
      action:"info",
      wide:  false,
    },
    {
  id:    "adresses",
  title: "Les bonnes adresses",
  desc:  "Restaurants, cafés, services...",
  icon:  "📍",
  bg:    "#fce7f3",
  color: "#be185d",
  url:   "https://www.google.com/maps/d/edit?mid=1qkXCeH3ESbRKg0VrPkCHDOGk9paZ4d8&usp=sharing",
  wide:  false,
},
    {
      id:    "avis",
      title: "⭐ Laisser un avis Google",
      desc:  "Partagez votre expérience — cela nous aide beaucoup !",
      icon:  "⭐",
      bg:    "#fef9c3",
      color: "#854d0e",
      url:   "https://g.page/r/CU4ouN9TY1R8EBM/review",
      wide:  true,
    },
  ];

  // ── PIN ───────────────────────────────────────────────
  let pinCurrent = "";

  function updatePinDots() {
    pinDots.forEach(function (dot, i) {
      dot.classList.toggle("filled", i < pinCurrent.length);
    });
  }

  function showDashboard(client) {
    companyBadge.style.background = client.color;
    companyBadge.style.color      = client.textColor;
    companyBadge.textContent      = client.initials;
    welcomeTitle.textContent      = client.name;
    buildTiles(client.id);
    stepPin.hidden       = true;
    stepDashboard.hidden = false;
    stepInfo.hidden      = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function checkPin() {
    const match = PORTAIL.clients.find(c => c.pin === pinCurrent);
    if (match) {
      pinError.hidden = true;
      setTimeout(function () { showDashboard(match); }, 200);
    } else {
      pinError.hidden = false;
      setTimeout(function () {
        pinCurrent = "";
        pinError.hidden = true;
        updatePinDots();
      }, 1000);
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
    pinCurrent = "";
    updatePinDots();
    pinError.hidden = true;
    stepDashboard.hidden = true;
    stepInfo.hidden      = true;
    stepPin.hidden       = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ── Tuiles ────────────────────────────────────────────
  function getSavedOrder(clientId) {
    try {
      const saved = localStorage.getItem("tiles_" + clientId);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return ALL_TILES.map(t => t.id);
  }

  function buildTiles(clientId) {
    tilesGrid.innerHTML = "";
    const order = getSavedOrder(clientId);

    // Trier les tuiles selon l'ordre sauvegardé
    const sorted = order
      .map(id => ALL_TILES.find(t => t.id === id))
      .filter(Boolean);

    // Ajouter les tuiles manquantes à la fin
    ALL_TILES.forEach(t => {
      if (!sorted.find(s => s.id === t.id)) sorted.push(t);
    });

    sorted.forEach(function (tile) {
      const el = document.createElement("a");
      el.className = "tile" + (tile.wide ? " tile-wide" : "");
      el.href = tile.url || "#";
      if (tile.url) el.target = "_blank";

      el.innerHTML =
        '<div class="tile-icon" style="background:' + tile.bg + ';color:' + tile.color + ';">' + tile.icon + '</div>' +
        '<div class="tile-title">' + tile.title + '</div>' +
        '<div class="tile-desc">' + tile.desc + '</div>';

      if (tile.action === "info") {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          stepDashboard.hidden = true;
          stepInfo.hidden      = false;
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }

      tilesGrid.appendChild(el);
    });
  }

  // ── Page Informations ─────────────────────────────────
  backFromInfo.addEventListener("click", function () {
    stepInfo.hidden      = true;
    stepDashboard.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Accordéon
  document.querySelectorAll(".info-card-header").forEach(function (header) {
    header.addEventListener("click", function () {
      const body    = this.parentElement.querySelector(".info-card-body");
      const chevron = this.querySelector(".info-chevron");
      const isOpen  = !body.hidden;
      body.hidden   = isOpen;
      chevron.textContent = isOpen ? "▼" : "▲";
    });
  });

})();
