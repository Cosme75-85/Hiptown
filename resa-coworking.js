// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Réservation des salles de réunion (espace coworking)
//  Copie simplifiée de l'outil de réservation (reservation/Index.html) :
//  mêmes agendas Google, mais sans prix, services, devis ni validation.
//  Le serveur (reservation/Coworking.gs) vérifie le compte du portail
//  et confirme la réservation tout de suite.
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
let currentDayHours = [];

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
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
      body: JSON.stringify({ action: "bookCoworking", idToken: idToken, payload: payload })
    }).then(r => r.json());

    showToast(res.message);
    if (res.success) {
      closeModal();
      resetForm();
    }
    // Réservation faite, ou créneau pris entre-temps : on relit les disponibilités
    Object.keys(monthCache).forEach(k => delete monthCache[k]);
    loadMonth();
  } catch (err) {
    showToast("Erreur : " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirmer la réservation";
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
    Object.keys(monthCache).forEach(k => delete monthCache[k]);
    loadMonth();
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
document.addEventListener("keydown", e => { if (e.key === "Escape" && pendingBooking) closeModal(); });
