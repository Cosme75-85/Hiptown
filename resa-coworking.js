// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Réservation des salles de réunion (espace coworking)
//  Copie simplifiée de l'outil de réservation (reservation/Index.html) :
//  mêmes agendas Google, mais sans prix, services, devis ni validation.
//  Le serveur (reservation/Coworking.gs) vérifie le compte du portail
//  et confirme la réservation tout de suite.
//  « Mes réservations à venir » : chacun annule ou modifie les siennes
//  jusqu'à leur début (le serveur revérifie propriétaire, créneau et crédits).
// ═══════════════════════════════════════════════════════

import { auth } from "./firebase-config.js";

const BASE_URL = PORTAIL.reservationUrl;
const MIDDAY_HOUR = 13; // séparation matin / après-midi
const MONTH_NAMES = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const STATUS_LABELS = { available: "disponible", full: "complet", past: "passé", error: "indisponible" };

const $ = id => document.getElementById(id);

const today = new Date();
let currentYear  = today.getFullYear();
let currentMonth = today.getMonth() + 1; // 1-12

let SPACES = [];          // salles reçues du serveur
let START_HOUR = 8;
let END_HOUR = 18;
let started = false;      // chargement fait à la première ouverture de la page

// Demande en cours : { space, dateString, endDateString, startHour, endHour }
let pendingBooking = null;
let creditBalance = null;  // solde du mois affiché : { allowance, used, remaining, monthLabel } ou null
let currentDayHours = [];
let myBookings = [];       // réservations à venir du compte connecté
let editing = null;        // réservation en cours de modification

const monthCache = {};     // "AAAA-M" -> disponibilités de toutes les salles
let monthRequestToken = 0; // ignore les réponses réseau obsolètes (clics rapides)
let dayRequestToken = 0;

// ==================== OUTILS ====================

function pad(n) { return String(n).padStart(2, "0"); }

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** "2026-10-12" -> "lundi 12 octobre 2026" */
function formatDate(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long" });
  return weekday + " " + d + " " + MONTH_NAMES[m - 1] + " " + y;
}

function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function getJson(params) {
  return fetch(BASE_URL + "?" + new URLSearchParams(params)).then(r => r.json());
}

let toastTimer = null;
function showToast(message) {
  const toast = $("rc-toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

// ==================== CRÉDITS ====================

/** Même barème que le serveur (reservation/Coworking.gs, computeCoworkingCredits). */
function creditsFor(space, startHour, endHour, numberOfDays) {
  const rate = space.credits;
  if (!rate) return 0;
  const duration = endHour - startHour;
  const hourly = (rate.hourly || 0) * duration;
  let perDay = hourly;
  if (duration > 5) perDay = rate.fullDay || hourly;
  else if (duration === 5) perDay = rate.halfDay || hourly;
  return perDay * (numberOfDays || 1);
}

async function postJson(body) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
    body: JSON.stringify(body)
  });
  return res.json();
}

/** Solde de crédits de l'entreprise pour le mois affiché. */
async function loadCredits() {
  const box = $("rc-credits");
  const year = currentYear, month = currentMonth;
  if (!auth.currentUser) return;
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await postJson({ action: "getCoworkingCredits", idToken: idToken, year: year, month: month });
    if (year !== currentYear || month !== currentMonth) return; // mois changé entre-temps
    if (!res.success) {
      creditBalance = null;
      box.textContent = res.message;
      box.hidden = false;
      return;
    }
    if (!res.chargesCredits) { creditBalance = null; box.hidden = true; return; } // équipe Hiptown
    creditBalance = res;
    box.innerHTML = "Crédits " + escapeHtml(res.company ? "de " + res.company + " " : "") + "pour " + escapeHtml(res.monthLabel)
      + " : <b>" + res.remaining + "</b> restant(s) sur " + res.allowance;
    box.hidden = false;
  } catch (err) {
    creditBalance = null;
    box.hidden = true;
  }
}

// ==================== SALLES ET CALENDRIERS DU MOIS ====================

function renderSpaces() {
  $("rc-spaces").innerHTML = SPACES.map(space =>
    '<article class="rc-space-card" style="--space-color:' + escapeHtml(space.color) + '">'
    + (space.photoUrl ? '<img class="rc-space-photo" src="' + escapeHtml(space.photoUrl) + '" alt="' + escapeHtml(space.name) + '" loading="lazy">' : "")
    + '<div class="rc-space-header"><h3 class="rc-space-name">' + escapeHtml(space.name) + "</h3>"
    + (space.maxPeople ? '<span class="rc-badge">Jusqu\'à ' + space.maxPeople + " personnes</span>" : "") + "</div>"
    + '<div class="rc-month-grid" id="rc-grid-' + space.id + '" data-space-id="' + space.id + '">'
    + '<div class="rc-loading">Chargement...</div></div>'
    + "</article>"
  ).join("");
}

function updateMonthNav(enabled) {
  $("rc-month-label").textContent = MONTH_NAMES[currentMonth - 1] + " " + currentYear;
  const isCurrentMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth() + 1;
  $("rc-prev-month").disabled = !enabled || isCurrentMonth; // pas de navigation dans les mois passés
  $("rc-next-month").disabled = !enabled;
}

function changeMonth(delta) {
  ({ year: currentYear, month: currentMonth } = shiftMonth(currentYear, currentMonth, delta));
  loadMonth();
  loadCredits();
}

function fetchMonth(year, month) {
  const key = year + "-" + month;
  if (monthCache[key]) return Promise.resolve(monthCache[key]);
  return getJson({ action: "getAllMonthsAvailability", year: year, month: month })
    .then(data => (monthCache[key] = data));
}

function loadMonth() {
  const requestId = ++monthRequestToken;
  const year = currentYear, month = currentMonth;
  const isCached = !!monthCache[year + "-" + month];

  updateMonthNav(isCached);
  if (!isCached) document.querySelectorAll(".rc-month-grid").forEach(g => g.classList.add("rc-is-loading"));

  fetchMonth(year, month)
    .then(data => {
      if (requestId !== monthRequestToken) return; // l'utilisateur a déjà changé de mois
      SPACES.forEach(space => { if (data[space.id]) renderMonthGrid(space.id, data[space.id]); });
      updateMonthNav(true);
      // Précharge le mois suivant en arrière-plan : navigation instantanée
      const next = shiftMonth(year, month, 1);
      fetchMonth(next.year, next.month).catch(() => {});
    })
    .catch(err => {
      if (requestId !== monthRequestToken) return;
      showToast("Erreur : " + err.message);
      updateMonthNav(true);
    });
}

function renderMonthGrid(spaceId, data) {
  const grid = $("rc-grid-" + spaceId);
  const startOffset = (new Date(data.year, data.month - 1, 1).getDay() + 6) % 7; // 0 = lundi

  let html = ["L", "M", "M", "J", "V", "S", "D"].map(l => '<div class="rc-dow" aria-hidden="true">' + l + "</div>").join("");
  html += "<div></div>".repeat(startOffset);

  data.days.forEach(d => {
    let cls = "rc-day " + d.status;
    if (d.status === "available") {
      if (!d.morningFree) cls += " am-busy";
      if (!d.afternoonFree) cls += " pm-busy";
    }
    const label = d.day + " " + MONTH_NAMES[data.month - 1] + " : " + STATUS_LABELS[d.status];
    const dateString = data.year + "-" + pad(data.month) + "-" + pad(d.day);
    html += '<button type="button" class="' + cls + '" data-date="' + dateString + '" aria-label="' + label + '"'
      + (d.status === "available" ? "" : " disabled") + ">" + d.day + "</button>";
  });

  grid.innerHTML = html;
  grid.classList.remove("rc-is-loading");
}

// ==================== FENÊTRE DE RÉSERVATION ====================

function openDayModal(spaceId, dateString) {
  const space = SPACES.find(s => s.id === spaceId);
  pendingBooking = { space: space, dateString: dateString, endDateString: null, startHour: null, endHour: null };

  $("rc-modal-title").textContent = "Réserver " + space.name;
  $("rc-modal-date").textContent = formatDate(dateString);
  $("rc-form-step").hidden = true;
  $("rc-submit").hidden = true;
  $("rc-quick-slots").innerHTML = '<div class="rc-loading">Chargement des disponibilités...</div>';

  $("rc-multiday-block").hidden = !space.allowMultiDay;
  $("rc-multiday").checked = false;
  $("rc-multiday-end").value = dateString;
  $("rc-multiday-end").min = dateString;
  toggleMultiDay();

  $("rc-overlay").classList.add("rc-open");

  const requestId = ++dayRequestToken;
  getJson({ action: "getDayAvailability", spaceId: spaceId, dateString: dateString })
    .then(data => {
      if (requestId !== dayRequestToken) return; // une autre journée a été ouverte entre-temps
      currentDayHours = data.hours;
      renderTimeOptions();
    })
    .catch(err => {
      if (requestId === dayRequestToken) showToast("Erreur : " + err.message);
    });
}

function closeModal() {
  $("rc-overlay").classList.remove("rc-open");
  pendingBooking = null;
}

function toggleMultiDay() {
  const multi = $("rc-multiday").checked;
  $("rc-multiday-range").hidden = !multi;
  $("rc-singleday-block").hidden = multi;
}

/** Vrai si la salle est libre à chaque heure de [start, end) pour la journée affichée. */
function isRangeFree(start, end) {
  const hours = currentDayHours.filter(h => h.hour >= start && h.hour < end);
  return hours.length > 0 && hours.every(h => h.remaining >= 1);
}

function renderTimeOptions() {
  const slots = [
    { label: "Matin (" + START_HOUR + "h-" + MIDDAY_HOUR + "h)", start: START_HOUR, end: MIDDAY_HOUR },
    { label: "Après-midi (" + MIDDAY_HOUR + "h-" + END_HOUR + "h)", start: MIDDAY_HOUR, end: END_HOUR },
    { label: "Journée complète", start: START_HOUR, end: END_HOUR }
  ];
  $("rc-quick-slots").innerHTML = slots.map(s =>
    '<button type="button" class="rc-option" data-start="' + s.start + '" data-end="' + s.end + '"'
    + (isRangeFree(s.start, s.end) ? "" : " disabled") + ">" + s.label + "</button>").join("");

  const options = (from, to) => {
    let html = "";
    for (let h = from; h <= to; h++) html += '<option value="' + h + '">' + h + "h</option>";
    return html;
  };
  $("rc-custom-start").innerHTML = options(START_HOUR, END_HOUR - 1);
  $("rc-custom-end").innerHTML = options(START_HOUR + 1, END_HOUR);
}

function selectSlot(start, end) {
  pendingBooking.startHour = start;
  pendingBooking.endHour = end;
  pendingBooking.endDateString = null;
  showFormStep();
}

function selectCustomRange() {
  const start = Number($("rc-custom-start").value);
  const end = Number($("rc-custom-end").value);
  if (start >= end) return showToast("L'heure de fin doit être après l'heure de début.");
  if (!isRangeFree(start, end)) return showToast("Ce créneau est déjà pris, merci de choisir un autre horaire.");
  selectSlot(start, end);
}

function selectMultiDay() {
  const b = pendingBooking;
  const endDate = $("rc-multiday-end").value;
  if (!endDate || endDate <= b.dateString) return showToast("Merci de choisir une date de fin après le " + formatDate(b.dateString) + ".");

  showToast("Vérification des disponibilités...");
  getJson({ action: "checkRangeAvailability", spaceId: b.space.id, dateString: b.dateString, endDateString: endDate, quantity: 1 })
    .then(res => {
      if (pendingBooking !== b) return; // la fenêtre a été fermée ou rouverte entre-temps
      if (!res.available) return showToast("La salle n'est pas libre sur toute cette période, merci de choisir d'autres dates.");
      b.endDateString = endDate;
      b.startHour = START_HOUR;
      b.endHour = END_HOUR;
      showFormStep();
    })
    .catch(err => showToast("Erreur : " + err.message));
}

function showFormStep() {
  const b = pendingBooking;
  $("rc-slot-banner").textContent = b.endDateString
    ? "Du " + formatDate(b.dateString) + " au " + formatDate(b.endDateString) + " (journée complète)"
    : formatDate(b.dateString) + ", de " + b.startHour + "h à " + b.endHour + "h";
  const email = auth.currentUser ? auth.currentUser.email : "";
  $("rc-booker").textContent = email ? "Confirmation envoyée à " + email : "";
  $("rc-people").max = b.space.maxPeople || "";

  // Coût en crédits (le serveur revérifie le solde au moment de réserver)
  const days = b.endDateString
    ? Math.round((new Date(b.endDateString) - new Date(b.dateString)) / 86400000) + 1
    : 1;
  const cost = creditsFor(b.space, b.startHour, b.endHour, days);
  const costEl = $("rc-cost");
  const sameMonth = creditBalance && b.dateString.slice(0, 7) === currentYear + "-" + pad(currentMonth);
  costEl.hidden = !creditBalance || !cost;
  costEl.classList.toggle("rc-cost-over", !!(sameMonth && cost > creditBalance.remaining));
  costEl.textContent = "Coût : " + cost + " crédit(s)"
    + (sameMonth ? (cost > creditBalance.remaining
      ? " — solde insuffisant (" + creditBalance.remaining + " restant(s))"
      : ", il vous en restera " + (creditBalance.remaining - cost)) : "");
  $("rc-form-step").hidden = false;
  $("rc-submit").hidden = false;
  $("rc-form-step").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  $("rc-people").value = 1;
  $("rc-title").value = "";
  $("rc-notes").value = "";
}

async function confirmBooking() {
  const b = pendingBooking;
  if (!b || b.startHour === null) return;

  const payload = {
    spaceId: b.space.id,
    dateString: b.dateString,
    endDateString: b.endDateString,
    startHour: b.startHour,
    endHour: b.endHour,
    numberOfPeople: parseInt($("rc-people").value, 10) || 0,
    title: $("rc-title").value.trim(),
    notes: $("rc-notes").value.trim()
  };

  // Vérifications rapides pour éviter un aller-retour inutile (le serveur revérifie tout)
  if (payload.numberOfPeople < 1) return showToast("Merci de renseigner le nombre de personnes.");
  if (b.space.maxPeople && payload.numberOfPeople > b.space.maxPeople) {
    return showToast(b.space.name + " accueille au maximum " + b.space.maxPeople + " personnes.");
  }
  if (!auth.currentUser) return showToast("Session expirée, merci de vous reconnecter.");

  // La fenêtre reste ouverte pendant l'envoi : en cas d'erreur, rien n'est perdu
  const submitBtn = $("rc-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Réservation en cours...";

  try {
    // Jeton de connexion : prouve au serveur quel compte réserve (renouvelé automatiquement)
    const idToken = await auth.currentUser.getIdToken();
    const res = await postJson({ action: "bookCoworking", idToken: idToken, payload: payload });

    showToast(res.message);
    if (res.success) {
      closeModal();
      resetForm();
    }
    // Réservation faite, ou créneau pris entre-temps : on relit les disponibilités
    refreshAll();
  } catch (err) {
    showToast("Erreur : " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirmer la réservation";
  }
}

// ==================== MES RÉSERVATIONS : ANNULER OU MODIFIER ====================

/** Disponibilités, crédits et liste « Mes réservations » relus après un changement. */
function refreshAll() {
  Object.keys(monthCache).forEach(k => delete monthCache[k]);
  loadMonth();
  loadCredits();
  loadMine();
}

function describeSlot(b) {
  return b.endDateString
    ? "Du " + formatDate(b.dateString) + " au " + formatDate(b.endDateString) + " (journée complète)"
    : formatDate(b.dateString) + ", de " + b.startHour + "h à " + b.endHour + "h";
}

async function loadMine() {
  const box = $("rc-mine");
  if (!auth.currentUser) return;
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await postJson({ action: "getMyCoworkingBookings", idToken: idToken });
    if (!res.success || !Array.isArray(res.bookings)) { box.hidden = true; return; }
    myBookings = res.bookings;
    renderMine();
  } catch (err) {
    box.hidden = true;
  }
}

function renderMine() {
  $("rc-mine").hidden = myBookings.length === 0;
  if (!myBookings.length) return;
  // Mini-calendrier : on reste sur le mois affiché, sinon celui de la prochaine réservation
  const first = myBookings[0].dateString.split("-").map(Number);
  if (!mineMonth || monthIndex(mineMonth) < monthIndex(currentMonthRef()) || monthIndex(mineMonth) > monthIndex(lastBookingMonth())) {
    mineMonth = { year: first[0], month: first[1] };
  }
  renderMineCalendar();
  $("rc-mine-list").innerHTML = myBookings.map(bookingCard).join("");
}

// ---------- Mini-calendrier des réservations ----------

let mineMonth = null; // { year, month } affiché dans le mini-calendrier

function monthIndex(m) { return m.year * 12 + m.month; }
function currentMonthRef() { return { year: today.getFullYear(), month: today.getMonth() + 1 }; }
function lastBookingMonth() {
  const last = myBookings[myBookings.length - 1];
  const [y, m] = (last.endDateString || last.dateString).split("-").map(Number);
  return { year: y, month: m };
}

/** "AAAA-MM-JJ" de chaque jour couvert par une réservation -> réservations de ce jour. */
function bookingsByDay() {
  const days = {};
  myBookings.forEach(b => {
    const [y, m, d] = b.dateString.split("-").map(Number);
    const day = new Date(y, m - 1, d);
    const last = b.endDateString || b.dateString;
    for (let key = b.dateString; key <= last; ) {
      (days[key] = days[key] || []).push(b);
      day.setDate(day.getDate() + 1);
      key = day.getFullYear() + "-" + pad(day.getMonth() + 1) + "-" + pad(day.getDate());
    }
  });
  return days;
}

function renderMineCalendar() {
  const { year, month } = mineMonth;
  $("rc-mine-month").textContent = MONTH_NAMES[month - 1] + " " + year;
  $("rc-mine-prev").disabled = monthIndex(mineMonth) <= monthIndex(currentMonthRef());
  $("rc-mine-next").disabled = monthIndex(mineMonth) >= monthIndex(lastBookingMonth());

  const byDay = bookingsByDay();
  const todayKey = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7; // 0 = lundi

  let html = ["L", "M", "M", "J", "V", "S", "D"].map(l => '<div class="rc-dow" aria-hidden="true">' + l + "</div>").join("");
  html += "<div></div>".repeat(startOffset);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = year + "-" + pad(month) + "-" + pad(d);
    const list = byDay[key] || [];
    let cls = "rc-mine-day" + (list.length ? " rc-has" : "") + (key === todayKey ? " rc-today" : "");
    const label = d + " " + MONTH_NAMES[month - 1] + (list.length
      ? " : " + list.map(b => b.spaceName + " " + b.startHour + "h-" + b.endHour + "h").join(", ")
      : "");
    html += '<button type="button" class="' + cls + '" data-day="' + key + '" aria-label="' + escapeHtml(label) + '"'
      + ' title="' + escapeHtml(label) + '"' + (list.length ? "" : " disabled") + ">" + d
      + (list.length ? '<span class="rc-mine-dots">' + list.slice(0, 3).map(b =>
        '<i style="--dot:' + escapeHtml(b.color || "#67DFCB") + '"></i>').join("") + "</span>" : "")
      + "</button>";
  }
  $("rc-mine-grid").innerHTML = html;
}

/** Clic sur un jour : on montre la (première) réservation de ce jour dans la liste. */
function showDay(key) {
  const b = (bookingsByDay()[key] || [])[0];
  const card = b && document.querySelector('.rc-bk[data-event="' + CSS.escape(b.eventId) + '"]');
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("rc-flash");
  setTimeout(() => card.classList.remove("rc-flash"), 1500);
}

// ---------- Fiche d'une réservation ----------

function bookingCard(b, i) {
  const [y, m, d] = b.dateString.split("-").map(Number);
  const dow = new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "short" });
  const monthShort = new Date(y, m - 1, d).toLocaleDateString("fr-FR", { month: "short" });
  let dayHtml = '<span class="rc-bk-day">' + d + "</span>";
  if (b.endDateString) {
    const endDay = Number(b.endDateString.split("-")[2]);
    dayHtml = '<span class="rc-bk-day rc-bk-range">' + d + " → " + endDay + "</span>";
  }
  const hours = b.endDateString
    ? "🕘 " + b.startHour + "h – " + b.endHour + "h chaque jour"
    : "🕘 " + b.startHour + "h – " + b.endHour + "h";
  const when = b.endDateString
    ? "du " + formatDate(b.dateString) + " au " + formatDate(b.endDateString)
    : formatDate(b.dateString);
  return '<article class="rc-bk" data-event="' + escapeHtml(b.eventId) + '" style="--space-color:' + escapeHtml(b.color || "#67DFCB") + '">'
    + '<div class="rc-bk-date" aria-hidden="true"><span class="rc-bk-dow">' + escapeHtml(dow) + "</span>" + dayHtml
    + '<span class="rc-bk-month">' + escapeHtml(monthShort) + "</span></div>"
    + '<div class="rc-bk-body">'
    + '<div class="rc-bk-room">' + escapeHtml(b.spaceName) + "</div>"
    + '<div class="rc-bk-title">' + escapeHtml(b.title) + " · " + escapeHtml(when) + "</div>"
    + '<ul class="rc-bk-facts"><li>' + hours + "</li><li>👥 " + b.numberOfPeople + " personne(s)</li>"
    + (b.credits ? "<li>💳 " + b.credits + " crédit(s)</li>" : "") + "</ul>"
    + (b.notes ? '<p class="rc-bk-note">📝 ' + escapeHtml(b.notes) + "</p>" : "")
    + '<div class="rc-bk-actions">'
    + '<details class="rc-addcal"><summary class="rc-option">📅 Ajouter à mon agenda</summary><div class="rc-addcal-menu">'
    + '<a href="' + escapeHtml(googleCalendarUrl(b)) + '" target="_blank" rel="noopener">Google Agenda</a>'
    + '<button type="button" data-ics="' + i + '">Apple, Outlook… (fichier .ics)</button>'
    + "</div></details>"
    + '<button type="button" class="rc-option" data-edit="' + i + '">Modifier</button>'
    + '<button type="button" class="rc-option rc-danger" data-cancel="' + i + '">Annuler</button>'
    + "</div></div></article>";
}

// ---------- Ajouter à mon agenda ----------

/** 20261012T070000Z (heure universelle, comprise par tous les agendas) */
function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function calendarTitle(b) { return b.title + " — " + b.spaceName; }

function calendarDetails(b) {
  return [
    "Réservation Hiptown : " + b.spaceName,
    b.endDateString ? "Journée complète chaque jour (" + b.startHour + "h – " + b.endHour + "h)" : "",
    "Nombre de personnes : " + b.numberOfPeople,
    b.notes ? "Note : " + b.notes : "",
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

/** Fichier .ics (Apple Calendrier, Outlook…). Même UID à chaque fois : réimporter met à jour. */
function downloadIcs(b) {
  const esc = t => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
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

async function cancelMine(b, btn) {
  if (!confirm("Annuler votre réservation « " + b.title + " » (" + b.spaceName + ", " + describeSlot(b) + ") ?")) return;
  if (!auth.currentUser) return showToast("Session expirée, merci de vous reconnecter.");
  btn.disabled = true;
  btn.textContent = "Annulation...";
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await postJson({ action: "cancelCoworking", idToken: idToken, payload: { spaceId: b.spaceId, eventId: b.eventId } });
    showToast(res.message);
  } catch (err) {
    showToast("Erreur : " + err.message);
  }
  refreshAll();
}

function hourOptions(from, to, selected) {
  let html = "";
  for (let h = from; h <= to; h++) html += '<option value="' + h + '"' + (h === selected ? " selected" : "") + ">" + h + "h</option>";
  return html;
}

function openEditModal(b) {
  editing = b;
  const todayString = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
  $("rc-edit-title").textContent = "Modifier : " + b.spaceName;
  $("rc-edit-current").textContent = "Actuellement : " + describeSlot(b);
  $("rc-edit-date").value = b.dateString;
  $("rc-edit-date").min = todayString;
  $("rc-edit-end-block").hidden = !b.allowMultiDay;
  $("rc-edit-end-date").value = b.endDateString || "";
  $("rc-edit-end-date").min = b.dateString;
  $("rc-edit-start").innerHTML = hourOptions(START_HOUR, END_HOUR - 1, b.startHour);
  $("rc-edit-end").innerHTML = hourOptions(START_HOUR + 1, END_HOUR, b.endHour);
  $("rc-edit-people").value = b.numberOfPeople;
  const space = SPACES.find(s => s.id === b.spaceId);
  $("rc-edit-people").max = (space && space.maxPeople) || "";
  updateEditForm();
  $("rc-edit-overlay").classList.add("rc-open");
}

function closeEditModal() {
  $("rc-edit-overlay").classList.remove("rc-open");
  editing = null;
}

/** Demande de modification telle que saisie (plusieurs jours = journée complète). */
function editPayload() {
  const dateString = $("rc-edit-date").value;
  const endDate = editing.allowMultiDay ? $("rc-edit-end-date").value : "";
  const multi = !!endDate && endDate > dateString;
  return {
    spaceId: editing.spaceId,
    eventId: editing.eventId,
    dateString: dateString,
    endDateString: multi ? endDate : null,
    startHour: multi ? START_HOUR : Number($("rc-edit-start").value),
    endHour: multi ? END_HOUR : Number($("rc-edit-end").value),
    numberOfPeople: parseInt($("rc-edit-people").value, 10) || 0
  };
}

/** Horaires masqués pour plusieurs jours, et nouveau coût en crédits. */
function updateEditForm() {
  if (!editing) return;
  const p = editPayload();
  $("rc-edit-end-date").min = p.dateString;
  $("rc-edit-hours-block").hidden = !!p.endDateString;
  const space = SPACES.find(s => s.id === editing.spaceId);
  const costEl = $("rc-edit-cost");
  if (!space || editing.credits === null || !p.dateString || p.startHour >= p.endHour) { costEl.hidden = true; return; }
  const days = p.endDateString ? Math.round((new Date(p.endDateString) - new Date(p.dateString)) / 86400000) + 1 : 1;
  costEl.textContent = "Nouveau coût : " + creditsFor(space, p.startHour, p.endHour, days) + " crédit(s) (avant : " + editing.credits + ")";
  costEl.hidden = false;
}

async function submitEdit() {
  if (!editing) return;
  const p = editPayload();
  if (!p.dateString) return showToast("Merci de choisir une date.");
  if (p.startHour >= p.endHour) return showToast("L'heure de fin doit être après l'heure de début.");
  if (p.numberOfPeople < 1) return showToast("Merci de renseigner le nombre de personnes.");
  if (!auth.currentUser) return showToast("Session expirée, merci de vous reconnecter.");

  const btn = $("rc-edit-submit");
  btn.disabled = true;
  btn.textContent = "Enregistrement...";
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await postJson({ action: "modifyCoworking", idToken: idToken, payload: p });
    showToast(res.message);
    if (res.success) {
      closeEditModal();
      refreshAll();
    }
  } catch (err) {
    showToast("Erreur : " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enregistrer";
  }
}

// ==================== DÉMARRAGE ====================

function start() {
  getJson({ action: "getCoworkingSpaces" })
    .then(data => {
      if (!data || !Array.isArray(data.spaces)) throw new Error("outil de réservation pas encore mis à jour");
      SPACES = data.spaces;
      START_HOUR = data.startHour;
      END_HOUR = data.endHour;
      renderSpaces();
      loadMonth();
      loadCredits();
      loadMine();
    })
    .catch(err => {
      started = false; // on réessaiera à la prochaine ouverture
      $("rc-spaces").innerHTML = '<div class="rc-loading">Impossible de charger les salles ('
        + escapeHtml(err.message) + "). Merci de réessayer plus tard.</div>";
    });
}

// Chargement à la première ouverture de la tuile, rafraîchi à chaque ouverture suivante
document.addEventListener("hiptown-tile-action", e => {
  if (e.detail !== "resacowork") return;
  if (!started) {
    started = true;
    updateMonthNav(false);
    start();
  } else {
    refreshAll();
  }
});

$("rc-prev-month").addEventListener("click", () => changeMonth(-1));
$("rc-next-month").addEventListener("click", () => changeMonth(1));

$("rc-spaces").addEventListener("click", e => {
  const day = e.target.closest(".rc-day.available");
  if (day) openDayModal(day.closest(".rc-month-grid").dataset.spaceId, day.dataset.date);
});

$("rc-quick-slots").addEventListener("click", e => {
  const btn = e.target.closest("[data-start]");
  if (!btn) return;
  document.querySelectorAll("#rc-quick-slots .rc-option").forEach(o => o.classList.toggle("rc-selected", o === btn));
  selectSlot(Number(btn.dataset.start), Number(btn.dataset.end));
});
$("rc-custom-confirm").addEventListener("click", selectCustomRange);
$("rc-multiday").addEventListener("change", toggleMultiDay);
$("rc-multiday-confirm").addEventListener("click", selectMultiDay);

$("rc-cancel").addEventListener("click", closeModal);
$("rc-submit").addEventListener("click", confirmBooking);
$("rc-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (editing) closeEditModal();
  else if (pendingBooking) closeModal();
});

$("rc-mine-list").addEventListener("click", e => {
  const icsBtn = e.target.closest("[data-ics]");
  if (icsBtn) {
    icsBtn.closest("details").open = false;
    return downloadIcs(myBookings[Number(icsBtn.dataset.ics)]);
  }
  if (e.target.closest(".rc-addcal-menu a")) {
    e.target.closest("details").open = false;
    return;
  }
  const editBtn = e.target.closest("[data-edit]");
  if (editBtn) return openEditModal(myBookings[Number(editBtn.dataset.edit)]);
  const cancelBtn = e.target.closest("[data-cancel]");
  if (cancelBtn) cancelMine(myBookings[Number(cancelBtn.dataset.cancel)], cancelBtn);
});
$("rc-mine-grid").addEventListener("click", e => {
  const day = e.target.closest(".rc-has");
  if (day) showDay(day.dataset.day);
});
$("rc-mine-prev").addEventListener("click", () => {
  mineMonth = shiftMonth(mineMonth.year, mineMonth.month, -1);
  renderMineCalendar();
});
$("rc-mine-next").addEventListener("click", () => {
  mineMonth = shiftMonth(mineMonth.year, mineMonth.month, 1);
  renderMineCalendar();
});
// Un seul menu « Ajouter à mon agenda » ouvert à la fois, fermé par un clic ailleurs
document.addEventListener("click", e => {
  document.querySelectorAll("#rc-mine-list .rc-addcal[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
});
["rc-edit-date", "rc-edit-end-date", "rc-edit-start", "rc-edit-end"].forEach(id => $(id).addEventListener("change", updateEditForm));
$("rc-edit-close").addEventListener("click", closeEditModal);
$("rc-edit-submit").addEventListener("click", submitEdit);
$("rc-edit-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) closeEditModal(); });
