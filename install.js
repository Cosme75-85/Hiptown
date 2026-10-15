// Bouton « Installer l'application » : aide à mettre le portail sur l'écran
// d'accueil, quel que soit le téléphone.
// - Android (Chrome, Edge, Samsung…) : ouvre directement la fenêtre d'installation.
// - iPhone / iPad, ou navigateur sans installation automatique : montre les
//   étapes à suivre pour ce téléphone et ce navigateur.
// - Lien ouvert depuis une appli (Facebook, Instagram, Gmail…) : explique
//   comment rouvrir la page dans le vrai navigateur, seul capable d'installer.
(function () {
  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var isMobile = isIOS || isAndroid || /Mobi/i.test(ua);
  var inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Snapchat|TikTok|Twitter|GSA\/|MicroMessenger|Messenger/i.test(ua)
    || (isAndroid && /; wv\)/.test(ua));
  var isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  var deferredPrompt = null;
  var DISMISS_KEY = "hiptown-install-dismissed";

  function store(get, val) {
    try { return get ? localStorage.getItem(DISMISS_KEY) : localStorage.setItem(DISMISS_KEY, val); } catch (e) { return null; }
  }

  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

  function steps() {
    var url = location.origin + location.pathname;
    if (inApp) {
      return "<p>Vous avez ouvert le lien depuis une application (messagerie, réseau social…). "
        + "L'installation n'est possible que depuis le navigateur du téléphone.</p><ol>"
        + "<li>Touchez le menu <b>⋯</b> ou <b>⋮</b> (en haut ou en bas de l'écran)</li>"
        + "<li>Choisissez <b>« Ouvrir dans " + (isIOS ? "Safari" : "le navigateur") + " »</b></li>"
        + "<li>Puis touchez à nouveau <b>« Installer l'application »</b></li></ol>"
        + "<p>Ou copiez le lien et collez-le dans " + (isIOS ? "Safari" : "Chrome") + " :</p>"
        + "<button type='button' class='install-copy' data-url='" + url + "'>Copier le lien</button>";
    }
    if (isIOS) {
      return "<ol>"
        + "<li>Touchez le bouton <b>Partager</b> <span class='install-ico'>⬆︎</span> "
        + "(en bas de l'écran dans Safari, en haut à droite dans Chrome)</li>"
        + "<li>Faites défiler et choisissez <b>« Sur l'écran d'accueil »</b></li>"
        + "<li>Touchez <b>« Ajouter »</b></li></ol>"
        + "<p class='install-note'>Si « Sur l'écran d'accueil » n'apparaît pas, ouvrez cette page dans <b>Safari</b>.</p>";
    }
    if (isAndroid) {
      return "<ol>"
        + "<li>Touchez le menu <b>⋮</b> en haut à droite (ou <b>≡</b> en bas sur Samsung)</li>"
        + "<li>Choisissez <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b> "
        + "(sur Samsung : « Ajouter page à » puis « Écran d'accueil »)</li>"
        + "<li>Confirmez avec <b>« Installer »</b> ou <b>« Ajouter »</b></li></ol>"
        + "<p class='install-note'>Si rien de tel n'apparaît, ouvrez cette page dans <b>Chrome</b>.</p>";
    }
    return "<p>Sur ordinateur, cliquez sur l'icône d'installation à droite de la barre d'adresse "
      + "(Chrome ou Edge). Sur téléphone, ouvrez cette page et touchez « Installer l'application ».</p>";
  }

  function showSteps() {
    var modal = el("<div class='install-modal' role='dialog' aria-modal='true'><div class='install-sheet'>"
      + "<button type='button' class='install-close' aria-label='Fermer'>×</button>"
      + "<img src='icons/icon-192.png' alt='' class='install-logo'/>"
      + "<h3>Installer l'application Hiptown</h3>" + steps() + "</div></div>");
    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.closest(".install-close")) modal.remove();
      var copy = e.target.closest(".install-copy");
      if (copy) {
        var done = function () { copy.textContent = "Lien copié ✓"; };
        if (navigator.clipboard) navigator.clipboard.writeText(copy.dataset.url).then(done, function () { prompt("Copiez ce lien :", copy.dataset.url); });
        else prompt("Copiez ce lien :", copy.dataset.url);
      }
    });
    document.body.appendChild(modal);
  }

  function install() {
    if (deferredPrompt) {
      var p = deferredPrompt; deferredPrompt = null;
      p.prompt();
      p.userChoice.then(function (r) { if (r.outcome === "accepted") hideBar(); });
    } else {
      showSteps();
    }
  }

  var bar = null;
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function showBar() {
    if (bar || isStandalone || store(true)) return;
    bar = el("<div class='install-bar'><img src='icons/icon-192.png' alt=''/>"
      + "<span>Installez l'application Hiptown sur votre téléphone</span>"
      + "<button type='button' class='install-go'>Installer</button>"
      + "<button type='button' class='install-x' aria-label='Plus tard'>×</button></div>");
    bar.querySelector(".install-go").addEventListener("click", install);
    bar.querySelector(".install-x").addEventListener("click", function () { store(false, "1"); hideBar(); });
    document.body.appendChild(bar);
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showBar();
  });
  window.addEventListener("appinstalled", function () { isStandalone = true; hideBar(); });

  document.addEventListener("DOMContentLoaded", function () {
    // Lien permanent sur l'écran d'accueil, même si la barre a été fermée.
    var link = document.getElementById("install-app-link");
    if (link) {
      if (isStandalone) link.hidden = true;
      else link.addEventListener("click", install);
    }
    if (isMobile) showBar();
  });
})();
