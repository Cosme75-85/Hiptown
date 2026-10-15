// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Agenda des réunions à venir (tableau de bord)
//  Équipe Hiptown seulement, semaine par semaine, dans la page « Salle de réunion » :
//  toutes les réunions de toutes les salles (serveur : getAllUpcomingBookings,
//  réservé aux comptes Hiptown). Les clients voient leurs réservations dans
//  « Mes réservations » (mes-reservations.js), pas sur l'accueil.
// ═══════════════════════════════════════════════════════

import { auth } from "./firebase-config.js";

const BASE_URL = PORTAIL.reservationUrl;

const $ = id => document.getElementById(id);

let space = null;      // espace du compte connecté : salle, coworking ou hiptown
let bookings = [];
let weekStart = null;  // lundi (00h) de la semaine affichée
let requestToken = 0;  // ignore une réponse arrivée après une déconnexion

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dayKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** Réunions de chaque jour ("AAAA-MM-JJ" -> liste), une réunion sur plusieurs jours apparaît chaque jour. */
function bookingsByDay() {
  const days = {};
  bookings.forEach(b => {
    const [y, m, d] = b.dateString.split("-").map(Number);
    const last = b.endDateString || b.dateString;
    for (let day = new Date(y, m - 1, d), key = b.dateString; key <= last; day = addDays(day, 1), key = dayKey(day)) {
      (days[key] = days[key] || []).push(b);
    }
  });
  return days;
}

// ==================== CHARGEMENT ====================

/** Accueil pour les clients, page « Salle de réunion » pour l'équipe Hiptown. */
function placeBox() {
  const box = $("agenda");
  if (space === "hiptown") $("step-salles").appendChild(box);        // sous les tuiles Réserver / Mes réservations
  else $("step-dashboard").insertBefore(box, $("tiles-grid"));       // en haut de l'accueil
}

async function load() {
  const token = ++requestToken;
  const box = $("agenda");
  placeBox();
  // Équipe Hiptown seulement : les clients retrouvent leurs réservations dans « Mes réservations »
  if (!auth.currentUser || space !== "hiptown") { box.hidden = true; return; }
  box.hidden = false;
  $("agenda-title").textContent = space === "hiptown" ? "📅 Réunions à venir (toutes les salles)" : "📅 Mes réunions à venir";
  if (!bookings.length) showMessage("Chargement de l'agenda...");
  try {
    const idToken = await auth.currentUser.getIdToken();
    const action = space === "hiptown" ? "getAllUpcomingBookings" : "getMyUpcomingBookings";
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
      body: JSON.stringify({ action: action, idToken: idToken })
    }).then(r => r.json());
    if (token !== requestToken) return;
    if (!res.success || !Array.isArray(res.bookings)) {
      // « Action inconnue » : l'outil de réservation (Apps Script) n'a pas encore la nouvelle version
      return showMessage(res.message === "Action inconnue."
        ? "Agenda indisponible : l'outil de réservation n'est pas encore à jour (déploiement Apps Script)."
        : res.message || "Agenda indisponible pour le moment.");
    }
    bookings = res.bookings;
    if (!weekStart) weekStart = mondayOf(new Date());
    render();
  } catch (err) {
    if (token === requestToken) showMessage("Agenda indisponible pour le moment, merci de réessayer plus tard.");
  }
}

function showMessage(text) {
  $("agenda-nav").hidden = true;
  $("agenda-days").innerHTML = '<p class="agenda-empty">' + escapeHtml(text) + "</p>";
}

// ==================== AFFICHAGE ====================

function lastWeek() {
  const last = bookings[bookings.length - 1];
  const [y, m, d] = (last.endDateString || last.dateString).split("-").map(Number);
  return mondayOf(new Date(y, m - 1, d));
}

function render() {
  const thisWeek = mondayOf(new Date());
  if (!bookings.length) {
    showMessage(space === "hiptown" ? "Aucune réunion prévue dans les salles." : "Aucune réunion à venir.");
    return;
  }
  if (weekStart < thisWeek) weekStart = thisWeek;
  if (weekStart > lastWeek()) weekStart = lastWeek();

  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  $("agenda-week").textContent = "Semaine du " + weekStart.getDate()
    + (sameMonth ? "" : " " + weekStart.toLocaleDateString("fr-FR", { month: "short" }))
    + " au " + end.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  $("agenda-prev").disabled = weekStart <= thisWeek;
  $("agenda-next").disabled = weekStart >= lastWeek();
  $("agenda-nav").hidden = false;

  const byDay = bookingsByDay();
  const todayKey = dayKey(new Date());
  let html = "";
  let weekHasMeeting = false;
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const key = dayKey(day);
    const list = byDay[key] || [];
    if (list.length) weekHasMeeting = true;
    const isWeekend = i >= 5;
    if (isWeekend && !list.length) continue; // samedi et dimanche seulement s'il y a une réunion
    html += '<div class="agenda-day' + (key === todayKey ? " agenda-today" : "") + (key < todayKey ? " agenda-past" : "") + '">'
      + '<div class="agenda-date"><span class="agenda-dow">' + escapeHtml(day.toLocaleDateString("fr-FR", { weekday: "short" }))
      + '</span><span class="agenda-num">' + day.getDate() + "</span></div>"
      + '<div class="agenda-items">'
      + (list.length ? list.map(meetingHtml).join("") : '<span class="agenda-none">—</span>')
      + "</div></div>";
  }
  if (!weekHasMeeting) {
    const next = bookings.find(b => (b.endDateString || b.dateString) >= dayKey(weekStart));
    html += next
      ? '<button type="button" class="agenda-jump" data-jump="' + escapeHtml(next.dateString) + '">Prochaine réunion : '
        + escapeHtml(new Date(next.start).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })) + " →</button>"
      : "";
  }
  $("agenda-days").innerHTML = html;
}

function meetingHtml(b) {
  const index = bookings.indexOf(b);
  const hours = b.startHour + "h – " + b.endHour + "h";
  const status = b.status === "pending" ? '<span class="agenda-pending">en attente</span>' : "";
  const who = space === "hiptown" && b.requestedBy ? '<span class="agenda-who">' + escapeHtml(b.requestedBy) + "</span>" : "";
  const tag = space === "hiptown" ? "div" : "button"; // client : ouvre « Mes prochaines réservations »
  return "<" + tag + (tag === "button" ? ' type="button" data-open="' + index + '"' : "")
    + ' class="agenda-item" style="--space-color:' + escapeHtml(b.color || "#67DFCB") + '">'
    + '<span class="agenda-hours">' + hours + "</span>"
    + '<span class="agenda-what"><b>' + escapeHtml(b.spaceName) + "</b> · " + escapeHtml(b.title) + status + who + "</span>"
    + "</" + tag + ">";
}

// ==================== ÉVÉNEMENTS ====================

document.addEventListener("hiptown-dashboard", e => {
  space = e.detail && e.detail.space;
  bookings = [];
  weekStart = null;
  load();
});

// Retour sur la page qui affiche l'agenda : agenda rafraîchi
["step-dashboard", "step-salles"].forEach(id => {
  new MutationObserver(() => {
    if (!$(id).hidden && space && auth.currentUser && $("agenda").parentNode === $(id)) load();
  }).observe($(id), { attributes: true, attributeFilter: ["hidden"] });
});

$("agenda-prev").addEventListener("click", () => { weekStart = addDays(weekStart, -7); render(); });
$("agenda-next").addEventListener("click", () => { weekStart = addDays(weekStart, 7); render(); });

$("agenda-days").addEventListener("click", e => {
  const jump = e.target.closest("[data-jump]");
  if (jump) {
    const [y, m, d] = jump.dataset.jump.split("-").map(Number);
    weekStart = mondayOf(new Date(y, m - 1, d));
    return render();
  }
  if (e.target.closest("[data-open]")) window.openTileAction("mesresa");
});
