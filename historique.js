// ═══════════════════════════════════════════════════════
//  Bouton « retour » du navigateur et du téléphone
// ═══════════════════════════════════════════════════════
// Le portail est une seule page : chaque écran est une <section id="step-…">
// qu'on affiche ou masque. Sans ce fichier, le retour du navigateur quitte
// le site (retour vers Google). Ici, chaque changement d'écran ajoute une
// entrée dans l'historique, et le retour réaffiche l'écran précédent.
//
// Aucun autre fichier n'a besoin d'appeler ce module : il observe simplement
// quelle section est visible.
//
// Connexion et déconnexion : on ne revient jamais, avec le retour, d'un écran
// connecté vers l'accueil (ou l'inverse). Le retour reste alors sur place.

(function () {
  "use strict";
  if (!window.history || !history.pushState || !window.MutationObserver) return;

  const main   = document.querySelector("main");
  const banner = document.getElementById("events-banner");
  if (!main) return;

  // Écrans visibles sans être connecté
  const PUBLIC_STEPS = ["step-welcome", "step-choice", "step-auth", "step-pending"];

  // Identifie ce chargement de page + la période de connexion en cours
  const loadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let phase = 0;
  // stack[i] = écran de l'entrée d'historique i (période en cours seulement)
  let stack = [];
  let idx = 0;
  let current = visibleStep();

  function visibleStep() {
    const sections = main.querySelectorAll('section[id^="step-"]');
    for (let i = 0; i < sections.length; i++) {
      if (!sections[i].hidden) return sections[i].id;
    }
    return null;
  }
  function isPublic(id) { return PUBLIC_STEPS.indexOf(id) !== -1; }
  function phaseKey() { return loadId + ":" + phase; }
  function makeState() {
    return { hiptown: true, step: current, phase: phaseKey(), idx: idx, banner: !!banner && !banner.hidden };
  }
  function push() {
    idx++;
    stack.length = idx;
    stack[idx] = current;
    history.pushState(makeState(), "");
  }

  history.replaceState(makeState(), "");
  stack[idx] = current;

  // ── Un nouvel écran s'affiche (tuile, bouton, flèche « Retour » du site…) ──
  new MutationObserver(function () {
    const step = visibleStep();
    if (!step || step === current) return;
    const crossed = current !== null && isPublic(step) !== isPublic(current);
    current = step;
    if (crossed) {
      // Connexion ou déconnexion : nouvelle période, l'historique d'avant est fermé
      phase++;
      stack = [];
      push();
      return;
    }
    // La flèche « Retour » du site mène à l'écran précédent : on recule
    // dans l'historique plutôt que d'ajouter une entrée.
    if (idx > 0 && stack[idx - 1] === step) {
      history.back();
      return;
    }
    push();
  }).observe(main, { attributes: true, attributeFilter: ["hidden"], subtree: true });

  // ── Retour (ou avance) du navigateur ──
  window.addEventListener("popstate", function (e) {
    const s = e.state;
    if (!s || !s.hiptown) return; // ex. lien « # » : rien à faire

    if (s.phase !== phaseKey()) {
      // Entrée d'avant la connexion / la déconnexion : on reste sur l'écran actuel
      idx = (s.idx | 0) + 1;
      stack.length = idx;
      stack[idx] = current;
      history.pushState(makeState(), "");
      return;
    }

    idx = s.idx;
    if (s.step === current) return; // déjà affiché (flèche « Retour » du site)

    const target = document.getElementById(s.step);
    if (!target) return;

    // On passe d'abord par la flèche « Retour » de l'écran actuel : elle recharge
    // les données de l'écran précédent comme un clic normal.
    const currentEl = current && document.getElementById(current);
    const backBtn = currentEl && currentEl.querySelector('[id^="back-from-"]');
    current = s.step; // évite qu'une nouvelle entrée soit ajoutée pendant ce changement
    if (backBtn) backBtn.click();

    // Si la flèche mène ailleurs, on affiche directement l'écran de l'historique
    if (visibleStep() !== s.step) {
      if (window.hideAllAuth) window.hideAllAuth();
      else if (window.hideAll) window.hideAll();
      target.hidden = false;
    }
    if (banner) banner.hidden = !s.banner;
    stack[idx] = current;
    window.scrollTo({ top: 0 });
  });
})();
