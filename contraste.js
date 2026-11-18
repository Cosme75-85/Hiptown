// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Garde-contraste : aucun bouton ne doit se fondre dans le fond
// ═══════════════════════════════════════════════════════
//
// Le fond du portail et la couleur des cases se choisissent dans « Paramètres » (parametres.js).
// Un bouton bleu marine sans fond, par exemple, disparaît sur le fond « Nuit ».
// style.css corrige les cas connus ; ce fichier est le filet de sécurité pour tous les autres,
// y compris les boutons ajoutés plus tard : il mesure chaque bouton visible par rapport à ce
// qu'il y a derrière lui et, s'il ne se voit pas assez, lui pose la classe « contraste-auto-clair »
// (pastille blanche, texte bleu marine) ou « contraste-auto-fonce » (pastille bleu marine, texte blanc).

const BOUTONS = "button, a[class*='btn'], .back-btn, [role='button'], input[type='submit'], input[type='button']";
const CLAIR = "contraste-auto-clair";
const FONCE = "contraste-auto-fonce";
const NAVY = { r: 30, g: 24, b: 71, a: 1 };
const BLANC = { r: 255, g: 255, b: 255, a: 1 };

// Seuils (rapport de contraste WCAG, de 1 = identique à 21 = noir sur blanc)
const TEXTE_MIN = 3;    // texte du bouton lisible sur ce qu'il y a derrière
const FORME_MIN = 1.3;  // fond ou bordure du bouton qui se détache du fond de la page

function couleur(css) {
  const m = css && css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
}

function melange(dessus, dessous) {
  const a = dessus.a;
  return { r: dessus.r * a + dessous.r * (1 - a), g: dessus.g * a + dessous.g * (1 - a), b: dessus.b * a + dessous.b * (1 - a), a: 1 };
}

function luminance(c) {
  const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function contraste(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Fond de la page : l'illustration « Coworking » est comptée comme bleu nuit, sa couleur dominante. */
function fondPage() {
  if (document.body.classList.contains("fond-sombre")) return NAVY;
  const c = couleur(getComputedStyle(document.body).backgroundColor);
  return c && c.a > 0 ? melange(c, BLANC) : BLANC;
}

/** Couleur visible derrière un élément ; null si une image ou un dégradé la rend inconnue. */
function derriere(el) {
  const chaine = [];
  for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) chaine.push(n);
  // Du plus proche au plus lointain : on s'arrête au premier fond opaque,
  // puis on superpose les fonds semi-transparents plus proches du bouton.
  const pile = [];
  let base = null;
  for (const n of chaine) {
    const st = getComputedStyle(n);
    const c = couleur(st.backgroundColor);
    if (c && c.a >= 1) { base = c; break; }
    if (st.backgroundImage && st.backgroundImage !== "none") return null;
    if (c && c.a > 0) pile.push(c);
  }
  let fond = base || fondPage();
  for (const c of pile.reverse()) fond = melange(c, fond);
  return fond;
}

function visible(el) {
  if (!el.getClientRects().length) return false;
  const st = getComputedStyle(el);
  return st.visibility !== "hidden" && +st.opacity > 0.05;
}

/** true si le bouton se fond dans ce qu'il y a derrière lui. */
function invisible(el, fond) {
  const st = getComputedStyle(el);
  if (st.backgroundImage && st.backgroundImage !== "none") return false; // bouton illustré : laissé tel quel
  const propre = couleur(st.backgroundColor);
  const surface = propre && propre.a > 0 ? melange(propre, fond) : fond;
  const texte = couleur(st.color);
  const lisible = texte ? contraste(melange(texte, surface), surface) : 21;
  let forme = contraste(surface, fond);
  const bord = couleur(st.borderTopColor);
  if (bord && parseFloat(st.borderTopWidth) > 0.5 && st.borderTopStyle !== "none") {
    forme = Math.max(forme, contraste(melange(bord, fond), fond));
  }
  // Un bouton sans texte (icône seule) compte sur sa forme
  const aDuTexte = (el.textContent || el.value || "").trim().length > 0;
  if (aDuTexte && lisible < TEXTE_MIN && forme < FORME_MIN) return true; // ni le texte ni la forme ne se voient
  if (aDuTexte && lisible < 1.5) return true;                           // texte de la couleur du bouton
  if (!aDuTexte && forme < FORME_MIN && lisible < TEXTE_MIN) return true;
  return false;
}

let observateur = null;
let minuteur = null;

/** Vérifie tous les boutons visibles et corrige ceux qui ne se voient pas. */
export function verifierContraste() {
  if (!document.body) return;
  if (observateur) observateur.disconnect();
  // Mesure sur les couleurs finales : les transitions en cours (survol, changement de fond) sont figées
  const racine = document.documentElement;
  racine.classList.add("contraste-mesure");
  void racine.offsetWidth;
  try {
    for (const el of document.querySelectorAll(BOUTONS)) {
      const avant = el.classList.contains(CLAIR) ? CLAIR : el.classList.contains(FONCE) ? FONCE : null;
      if (avant) el.classList.remove(avant);
      if (!visible(el) || el.closest("[data-contraste='libre']")) continue;
      const fond = derriere(el);
      if (!fond) continue;
      if (invisible(el, fond)) el.classList.add(luminance(fond) > 0.4 ? FONCE : CLAIR);
    }
  } catch (err) {
    console.error("Garde-contraste : vérification impossible", err);
  } finally {
    racine.classList.remove("contraste-mesure");
    if (observateur) {
      observateur.takeRecords();
      brancher();
    }
  }
}

function plusTard() {
  clearTimeout(minuteur);
  minuteur = setTimeout(verifierContraste, 120);
}

function brancher() {
  observateur.observe(document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ["hidden", "class", "style", "open", "data-fond", "data-cases", "disabled"]
  });
}

/** Lance la surveillance : à chaque écran ouvert, contenu ajouté ou réglage changé. */
export function demarrerGardeContraste() {
  if (observateur || typeof MutationObserver === "undefined") return;
  const go = () => {
    observateur = new MutationObserver(plusTard);
    brancher();
    window.addEventListener("resize", plusTard);
    verifierContraste();
  };
  if (document.body) go(); else document.addEventListener("DOMContentLoaded", go, { once: true });
}
