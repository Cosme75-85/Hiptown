// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Mes prochaines réservations (page à part)
//  Ouverte par la tuile « Mes prochaines réservations » ou par le lien bleu
//  de l'outil de réservation des salles (portail#mes-reservations).
//  Toutes les réservations à venir de la personne connectée, quel que soit
//  l'outil utilisé : demandes de salle (en attente ou confirmées, retrouvées
//  par l'email du compte) et réservations coworking.
//  Le serveur (reservation/MesReservations.gs) vérifie le compte.
//  Coworking : « Modifier ou annuler » ouvre la tuile de réservation.
//  Salle de réunion : modification ou annulation par email à l'équipe.
// ═══════════════════════════════════════════════════════

import { auth } from "./firebase-config.js";

const BASE_URL = PORTAIL.reservationUrl;
const SHOWN_AT_FIRST = 3; // au-delà, bouton « Voir les autres »
const SPACES_WITH_LIST = ["salle", "coworking", "hiptown"]; // l'équipe aussi : ses propres réservations

const $ = id => document.getElementById(id);

let bookings = [];
let contactEmail = "";
let showAll = false;
let currentSpace = null;
let requestToken = 0; // ignore une réponse arrivée après une déconnexion ou un rechargement

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function describeSlot(b) {
  return b.endDateString
    ? "du " + formatDate(b.dateString) + " au " + formatDate(b.endDateString) + ", " + b.startHour + "h – " + b.endHour + "h chaque jour"
    : formatDate(b.dateString) + ", " + b.startHour + "h – " + b.endHour + "h";
}

async function load() {
  const token = ++requestToken;
  if (!auth.currentUser || !SPACES_WITH_LIST.includes(currentSpace)) return showMessage("Connectez-vous pour voir vos réservations.");
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
      body: JSON.stringify({ action: "getMyUpcomingBookings", idToken: idToken })
    }).then(r => r.json());
    if (token !== requestToken) return;
    if (!res.success || !Array.isArray(res.bookings)) {
      // « Action inconnue » : l'outil de réservation n'a pas encore la nouvelle version
      return showMessage(res.message === "Action inconnue."
        ? "Liste indisponible : l'outil de réservation n'est pas encore à jour (déploiement Apps Script)."
        : res.message || "Liste indisponible pour le moment.");
    }
    bookings = res.bookings;
    contactEmail = res.contactEmail || "";
    render();
  } catch (err) {
    if (token === requestToken) showMessage("Liste indisponible pour le moment, merci de réessayer plus tard.");
  }
}

/** Message à la place de la liste (aucune réservation, erreur). */
function showMessage(text) {
  $("my-bookings-list").innerHTML = '<p class="my-bookings-help">' + escapeHtml(text) + "</p>";
  $("my-bookings-more").hidden = true;
}

function render() {
  if (!bookings.length) return showMessage("Aucune réservation à venir.");
  const shown = showAll ? bookings : bookings.slice(0, SHOWN_AT_FIRST);
  $("my-bookings-list").innerHTML = shown.map(bookingCard).join("");
  const more = $("my-bookings-more");
  const hiddenCount = bookings.length - shown.length;
  more.hidden = bookings.length <= SHOWN_AT_FIRST;
  more.textContent = hiddenCount === 1 ? "Voir l'autre réservation"
    : hiddenCount > 1 ? "Voir les " + hiddenCount + " autres réservations" : "Afficher moins";
}

function bookingCard(b, i) {
  const [y, m, d] = b.dateString.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const dow = day.toLocaleDateString("fr-FR", { weekday: "short" });
  const monthShort = day.toLocaleDateString("fr-FR", { month: "short" });
  const dayHtml = b.endDateString
    ? '<span class="rc-bk-day rc-bk-range">' + d + " → " + Number(b.endDateString.split("-")[2]) + "</span>"
    : '<span class="rc-bk-day">' + d + "</span>";
  const status = b.status === "pending"
    ? '<span class="my-status my-status-pending">En attente de validation</span>'
    : '<span class="my-status my-status-confirmed">Confirmée</span>';

  let actions = "";
  if (b.status === "confirmed") {
    actions += '<details class="rc-addcal"><summary class="rc-option">📅 Ajouter à mon agenda</summary><div class="rc-addcal-menu">'
      + '<a href="' + escapeHtml(googleCalendarUrl(b)) + '" target="_blank" rel="noopener">Google Agenda</a>'
      + '<button type="button" data-ics="' + i + '">Apple, Outlook… (fichier .ics)</button>'
      + "</div></details>";
  }
  if (b.editable) {
    actions += '<button type="button" class="rc-option" data-manage="' + i + '">Modifier ou annuler</button>';
  } else if (b.kind === "room" && contactEmail) {
    actions += '<a class="rc-option" href="' + escapeHtml(changeRequestMailto(b)) + '">✉️ Modifier ou annuler</a>';
  }

  return '<article class="rc-bk" style="--space-color:' + escapeHtml(b.color || "#67DFCB") + '">'
    + '<div class="rc-bk-date" aria-hidden="true"><span class="rc-bk-dow">' + escapeHtml(dow) + "</span>" + dayHtml
    + '<span class="rc-bk-month">' + escapeHtml(monthShort) + "</span></div>"
    + '<div class="rc-bk-body">'
    + '<div class="rc-bk-room">' + escapeHtml(b.spaceName) + status + "</div>"
    + '<div class="rc-bk-title">' + escapeHtml(b.title) + " · " + escapeHtml(describeSlot(b)) + "</div>"
    + '<ul class="rc-bk-facts">'
    + (b.numberOfPeople ? "<li>👥 " + b.numberOfPeople + " personne(s)</li>" : "")
    + (b.total ? "<li>💶 " + escapeHtml(b.total.replace(".", ",")) + " (estimé)</li>" : "")
    + "</ul>"
    + (actions ? '<div class="rc-bk-actions">' + actions + "</div>" : "")
    + (b.kind === "room" && b.status === "pending"
      ? '<p class="my-bookings-help">Le créneau est bloqué pour vous. Vous recevrez un email dès que l\'équipe aura validé la demande.</p>'
      : "")
    + "</div></article>";
}

/** Email prérempli à l'équipe : les réservations de salle (payantes) se changent avec elle. */
function changeRequestMailto(b) {
  const subject = "Modifier ou annuler ma réservation du " + formatDate(b.dateString);
  const body = "Bonjour,\n\nJe souhaite modifier / annuler (rayer la mention inutile) ma réservation :\n"
    + "- " + b.spaceName + " : " + b.title + "\n- " + describeSlot(b) + "\n\nNouveau créneau souhaité (si modification) :\n\nMerci !";
  return "mailto:" + contactEmail + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
}

// ---------- Ajouter à mon agenda (comme dans resa-coworking.js) ----------

/** 20261012T070000Z (heure universelle, comprise par tous les agendas) */
function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function calendarTitle(b) { return b.title + " — " + b.spaceName; }

function calendarDetails(b) {
  return [
    "Réservation Hiptown : " + b.spaceName,
    b.endDateString ? "Chaque jour de " + b.startHour + "h à " + b.endHour + "h" : "",
    b.numberOfPeople ? "Nombre de personnes : " + b.numberOfPeople : "",
    "Pour annuler ou modifier : votre espace client Hiptown."
  ].filter(Boolean).join("\n");
}

function googleCalendarUrl(b) {
  return "https://calendar.google.com/calendar/render?" + new URLSearchParams({
    action: "TEMPLATE",
    text: calendarTitle(b),
    dates: utcStamp(b.start) + "/" + utcStamp(b.end),
    details: calendarDetails(b),
    location: b.address || "Hiptown"
  });
}

/** Fichier .ics (Apple Calendrier, Outlook…). Même UID que la tuile coworking : réimporter met à jour. */
function downloadIcs(b) {
  const esc = t => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hiptown//Portail//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + esc(b.eventId).replace(/@/g, "-") + "@portail.hiptown",
    "DTSTAMP:" + utcStamp(Date.now()),
    "DTSTART:" + utcStamp(b.start),
    "DTEND:" + utcStamp(b.end),
    "SUMMARY:" + esc(calendarTitle(b)),
    "LOCATION:" + esc(b.address || "Hiptown"),
    "DESCRIPTION:" + esc(calendarDetails(b)),
    "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "reservation-hiptown-" + b.dateString + ".ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ==================== ÉVÉNEMENTS ====================

const PAGE_HASH = "#mes-reservations"; // lien bleu de l'outil de réservation des salles

/** Affiche la page et recharge la liste (toujours à jour, ex. après une annulation coworking). */
function openPage() {
  bookings = [];
  showAll = false;
  $("my-bookings-list").innerHTML = '<p class="my-bookings-help">Chargement...</p>';
  $("my-bookings-more").hidden = true;
  load();
}

// Connexion : on retient l'espace ; arrivée par le lien bleu -> on ouvre directement la page
document.addEventListener("hiptown-dashboard", e => {
  currentSpace = e.detail && e.detail.space;
  if (location.hash !== PAGE_HASH) return;
  history.replaceState(null, "", location.pathname + location.search); // un rechargement ramène au tableau de bord
  window.hideAll();
  $("step-mes-resa").hidden = false;
  openPage();
});

// Tuile « Mes prochaines réservations »
document.addEventListener("hiptown-tile-action", e => {
  if (e.detail === "mesresa") openPage();
});

$("my-bookings-more").addEventListener("click", () => {
  showAll = !showAll;
  render();
});

$("my-bookings-list").addEventListener("click", e => {
  const icsBtn = e.target.closest("[data-ics]");
  if (icsBtn) {
    icsBtn.closest("details").open = false;
    return downloadIcs(bookings[Number(icsBtn.dataset.ics)]);
  }
  if (e.target.closest(".rc-addcal-menu a")) {
    e.target.closest("details").open = false;
    return;
  }
  // Coworking : la tuile de réservation contient déjà « Modifier » et « Annuler »
  if (e.target.closest("[data-manage]")) {
    const tile = document.querySelector('#tiles-grid [data-id="resacowork"]');
    if (tile) tile.click();
  }
});

// Un seul menu « Ajouter à mon agenda » ouvert à la fois, fermé par un clic ailleurs
document.addEventListener("click", e => {
  document.querySelectorAll("#my-bookings-list .rc-addcal[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
});
