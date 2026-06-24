// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — app.js
// ═══════════════════════════════════════════════════════

(function () {
  "use strict";

  const stepPin       = document.getElementById("step-pin");
  const stepDashboard = document.getElementById("step-dashboard");
  const pinDots       = document.getElementById("pin-dots").querySelectorAll("span");
  const pinError      = document.getElementById("pin-error");
  const pinKeys       = document.querySelectorAll(".pin-key");
  const welcomeTitle  = document.getElementById("welcome-title");
  const companyBadge  = document.getElementById("company-badge");
  const logoutBtn     = document.getElementById("logout-btn");
  const tileIncident  = document.getElementById("tile-incident");

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

  // Lien incident
  tileIncident.href = PORTAIL.incidentUrl;

  let pinCurrent = "";

  function updatePinDots() {
    pinDots.forEach(function (dot, i) {
      dot.classList.toggle("filled", i < pinCurrent.length);
    });
  }

  function showDashboard(client) {
    // Badge entreprise
    companyBadge.style.background  = client.color;
    companyBadge.style.color       = client.textColor;
    companyBadge.textContent       = client.initials;
    welcomeTitle.textContent       = client.name;

    stepPin.hidden       = true;
    stepDashboard.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function checkPin() {
    // Hiptown — pas de PIN
    const hiptown = PORTAIL.clients.find(c => !c.pin);
    if (hiptown && pinCurrent === "0000") {
      showDashboard(hiptown);
      return;
    }

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

      if (val === "back") {
        pinCurrent = pinCurrent.slice(0, -1);
        pinError.hidden = true;
        updatePinDots();
        return;
      }

      if (val === "clear") {
        pinCurrent = "";
        pinError.hidden = true;
        updatePinDots();
        return;
      }

      if (pinCurrent.length >= 4) return;
      pinCurrent += val;
      updatePinDots();

      if (pinCurrent.length === 4) checkPin();
    });
  });

  logoutBtn.addEventListener("click", function () {
    pinCurrent = "";
    updatePinDots();
    pinError.hidden = true;
    stepDashboard.hidden = true;
    stepPin.hidden       = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Hiptown accès direct sans PIN
  const hiptownClient = PORTAIL.clients.find(c => !c.pin);
  if (hiptownClient) {
    // Ajouter bouton accès direct Hiptown
    const directBtn = document.createElement("button");
    directBtn.className = "direct-btn";
    directBtn.textContent = "Accès Hiptown (équipe)";
    directBtn.addEventListener("click", function () {
      showDashboard(hiptownClient);
    });
    document.querySelector(".pin-box").appendChild(directBtn);
  }

})();
