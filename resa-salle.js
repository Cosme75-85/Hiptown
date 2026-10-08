// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Réserver une salle (clients salle de réunion)
//  L'outil de réservation (Apps Script, reservation/Index.html) s'affiche
//  dans le portail, sans changer de page. Coordonnées du compte préremplies.
//  Son lien bleu « Mes prochaines réservations » demande au portail
//  d'ouvrir sa page (message envoyé par l'outil, voir Index.html).
// ═══════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

let contact = null;  // coordonnées du compte connecté
let loadedFor = "";  // adresse déjà chargée dans le cadre (évite de recharger à chaque ouverture)

function frameUrl() {
  const params = new URLSearchParams({ embed: "1" });
  if (contact) {
    Object.entries(contact).forEach(([key, value]) => { if (value) params.set(key, value); });
  }
  return PORTAIL.reservationUrl + "?" + params;
}

document.addEventListener("hiptown-dashboard", e => {
  contact = (e.detail && e.detail.contact) || null;
});

document.addEventListener("hiptown-tile-action", e => {
  if (e.detail !== "resasalle") return;
  const url = frameUrl();
  $("resa-salle-open").href = url;
  if (loadedFor !== url) {
    $("resa-salle-frame").src = url;
    loadedFor = url;
  }
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
