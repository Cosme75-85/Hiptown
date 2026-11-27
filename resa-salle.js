// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Réserver une salle (clients salle de réunion)
//  L'outil de réservation (Apps Script, reservation/Index.html) s'affiche
//  dans le portail, sans changer de page. Coordonnées du compte préremplies.
//  Son lien bleu « Mes prochaines réservations » demande au portail
//  d'ouvrir sa page (message envoyé par l'outil, voir Index.html).
//
//  Visiteurs sans compte : la page publique de l'outil (lien direct ou page
//  intégrée au site hiptown.com) montre disponibilités et tarifs, puis envoie
//  ici avec le créneau choisi (?salle=…&date=…). On le garde sur l'appareil,
//  on ouvre l'inscription « salle de réunion », et dès que le compte est
//  actif, l'outil se rouvre sur ce créneau : il ne reste qu'à envoyer.
// ═══════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

let contact = null;  // coordonnées du compte connecté
let resume = null;   // créneau du visiteur à rouvrir à la prochaine ouverture de l'outil

// ── Créneau choisi par un visiteur avant d'avoir un compte ──
const INTENT_KEY = "hiptown-resa-visiteur";
const INTENT_MAX_AGE = 2 * 24 * 3600 * 1000; // le temps de vérifier son e-mail, même le lendemain

function readIntent() {
  try {
    const intent = JSON.parse(localStorage.getItem(INTENT_KEY) || "null");
    if (intent && Date.now() - intent.savedAt < INTENT_MAX_AGE) return intent;
  } catch (err) { /* stockage bloqué (navigation privée) : on fait sans */ }
  clearIntent();
  return null;
}

function clearIntent() {
  try { localStorage.removeItem(INTENT_KEY); } catch (err) { /* rien */ }
  document.querySelectorAll(".resa-visiteur").forEach(el => { el.hidden = true; });
}

/** Lit le créneau dans l'adresse (?salle=…), le garde sur l'appareil et nettoie l'adresse. */
function intentFromUrl() {
  const p = new URLSearchParams(location.search);
  if (!p.get("salle") || !/^\d{4}-\d{2}-\d{2}$/.test(p.get("date") || "")) return null;
  const text = (key, max) => (p.get(key) || "").slice(0, max);
  const intent = {
    space: text("salle", 60), date: text("date", 10), endDate: text("jusquau", 10),
    start: text("debut", 2), end: text("fin", 2), people: text("personnes", 3), qty: text("postes", 1),
    name: text("nom", 80), slot: text("creneau", 120), price: text("prix", 20),
    login: p.get("compte") === "1", savedAt: Date.now()
  };
  try { localStorage.setItem(INTENT_KEY, JSON.stringify(intent)); } catch (err) { /* gardé en mémoire seulement */ }
  history.replaceState(null, "", location.pathname + location.hash);
  return intent;
}

let intent = intentFromUrl() || readIntent();

/** Rappel du créneau sur l'inscription et sur l'écran « vérifiez votre e-mail ». */
function showIntentBanners() {
  if (!intent) return;
  const detail = [intent.name, intent.slot, intent.people ? intent.people + " personne" + (intent.people > 1 ? "s" : "") : "",
    intent.price ? intent.price : ""].filter(Boolean).join(" · ");
  document.querySelectorAll(".resa-visiteur").forEach(el => {
    el.querySelector(".resa-visiteur-detail").textContent = detail;
    el.hidden = false;
  });
}
showIntentBanners();

// Personne de connecté : le visiteur va directement à l'inscription « salle de réunion »
// (ou à la connexion s'il a cliqué « Me connecter »). Une seule fois par visite.
let signupOpened = false;
function openSignupForIntent() {
  if (!intent || signupOpened) return;
  signupOpened = true;
  if (intent.login && window.openLoginScreen) window.openLoginScreen();
  else if (window.openSignupScreen) window.openSignupScreen("salle");
}
document.addEventListener("hiptown-signed-out", openSignupForIntent);
if (window.hiptownSignedOut) openSignupForIntent();

function frameUrl() {
  const params = new URLSearchParams({ embed: "1" });
  if (contact) {
    Object.entries(contact).forEach(([key, value]) => { if (value) params.set(key, value); });
  }
  if (resume) {
    // Noms attendus par l'outil (bookingIntent dans Code.gs)
    const keys = { space: "space", date: "date", endDate: "endDate", start: "start", end: "end", people: "people", qty: "qty" };
    Object.entries(keys).forEach(([from, to]) => { if (resume[from]) params.set(to, resume[from]); });
  }
  return PORTAIL.reservationUrl + "?" + params;
}

document.addEventListener("hiptown-dashboard", e => {
  contact = (e.detail && e.detail.contact) || null;
  if (!intent) return;
  const space = e.detail && e.detail.space;
  const preview = e.detail && e.detail.preview;
  if (preview) return; // aperçu d'un client par l'admin : on garde le créneau pour plus tard
  const pending = intent;
  intent = null;
  clearIntent();
  // Compte salle de réunion actif : l'outil s'ouvre sur le créneau choisi
  if (space !== "salle" || !window.openTileAction) return;
  resume = pending;
  setTimeout(() => window.openTileAction("resasalle"), 0); // après l'affichage du tableau de bord
});

document.addEventListener("hiptown-tile-action", e => {
  if (e.detail !== "resasalle") return;
  // Aperçu d'un client par l'admin général : pas de demande envoyée en son nom
  const preview = !!(window.hiptownPreview && window.hiptownPreview.readOnly);
  $("resa-salle-preview").hidden = !preview;
  $("resa-salle-frame").hidden = preview;
  if (preview) { $("resa-salle-frame").src = "about:blank"; return; }
  const url = frameUrl();
  resume = null; // le créneau ne se rouvre qu'une fois
  $("resa-salle-open").href = url;
  // Rechargé à chaque ouverture : disponibilités toujours à jour (la page garde sinon
  // en mémoire les mois déjà affichés). Le paramètre t force le navigateur à recharger.
  $("resa-salle-frame").src = url + "&t=" + Date.now();
});

// Lien bleu de l'outil : on ouvre « Mes prochaines réservations » dans le portail
window.addEventListener("message", e => {
  if (!/^https:\/\/[\w.-]+\.googleusercontent\.com$/.test(e.origin)) return; // pages Apps Script uniquement
  if (!e.data || e.data.hiptown !== "mes-reservations") return;
  window.hideAll();
  $("step-mes-resa").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.dispatchEvent(new CustomEvent("hiptown-tile-action", { detail: "mesresa" }));
});
