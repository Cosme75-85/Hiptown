// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Salles de réunion (Gestion, équipe Hiptown)
//  Ajouter, modifier ou retirer une salle et saisir ses périodes
//  d'indisponibilité. La liste est gardée par l'outil de réservation
//  (reservation/Salles.gs) : le site public et l'espace coworking
//  l'utilisent dès l'enregistrement.
// ═══════════════════════════════════════════════════════

import { auth } from "./firebase-config.js";

const BASE_URL = PORTAIL.reservationUrl;
const $ = id => document.getElementById(id);

let rooms = [];
let editingId = null; // null = nouvelle salle

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function frDate(dateString) {
  const [y, m, d] = String(dateString).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function periodLabel(c) {
  return c.start === c.end ? `le ${frDate(c.start)}` : `du ${frDate(c.start)} au ${frDate(c.end)}`;
}

/** Appel à l'outil de réservation (Apps Script) avec le jeton du compte connecté. */
export async function call(action, payload) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
    body: JSON.stringify({ action, idToken, payload })
  });
  return res.json();
}

function showMessage(id, text, isError) {
  const m = $(id);
  m.textContent = text;
  m.style.color = isError ? "#dc2626" : "#166534";
  m.hidden = !text;
}

export async function renderRoomsPanel() {
  showMessage("room-message", "");
  closeForm();
  await refreshRooms();
}

async function refreshRooms() {
  const list = $("rooms-list");
  const archivedList = $("rooms-archived-list");
  list.innerHTML = '<p style="color:#94a3b8;padding:12px;">Chargement…</p>';
  archivedList.innerHTML = "";
  let res;
  try {
    res = await call("getRoomsAdmin");
  } catch (err) {
    console.error(err);
    res = { success: false, message: "Outil de réservation injoignable, merci de réessayer." };
  }
  if (!res.success) {
    list.innerHTML = `<p style="color:#dc2626;padding:12px;">${escapeHtml(res.message)}</p>`;
    return;
  }
  rooms = res.rooms;
  $("room-categories").innerHTML = res.categories.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");

  const online = rooms.filter(r => !r.archived);
  const archived = rooms.filter(r => r.archived);
  list.innerHTML = online.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucune salle en ligne.</p>';
  online.forEach(r => list.appendChild(roomCard(r)));
  archivedList.innerHTML = archived.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucune salle retirée.</p>';
  archived.forEach(r => archivedList.appendChild(roomCard(r)));
}

function roomCard(r) {
  const prices = [
    r.hourlyPrice && `${r.hourlyPrice} €/h`,
    r.halfDayPrice && `${r.halfDayPrice} € la demi-journée`,
    r.fullDayPrice && `${r.fullDayPrice} € la journée`
  ].filter(Boolean).join(" · ");
  const details = [
    escapeHtml(r.category || ""),
    r.maxPeople ? `jusqu'à ${r.maxPeople} personnes` : "",
    escapeHtml(prices),
    r.coworking ? "proposée aux coworkers" : ""
  ].filter(Boolean).join(" · ");
  const closures = (r.closures || []).map(c =>
    `⛔ Indisponible ${escapeHtml(periodLabel(c))}${c.reason ? " — " + escapeHtml(c.reason) : ""}`).join("<br>");
  const btn = "margin-top:0;width:auto;padding:6px 12px;font-size:12px;";
  const card = document.createElement("div");
  card.className = "info-card";
  card.style.borderLeft = `6px solid ${/^#[0-9a-f]{6}$/i.test(r.color) ? r.color : "#cbd5e1"}`;
  card.innerHTML = `
    <div class="info-item" style="gap:10px;flex-wrap:wrap;">
      <span style="flex:1;min-width:200px;">
        <b>${escapeHtml(r.name)}</b><br>
        <span style="font-size:12px;color:#64748b;">${details}</span>
        ${closures ? `<br><span style="font-size:12px;color:#b45309;">${closures}</span>` : ""}
      </span>
      ${r.archived ? "" : `<button class="direct-btn" type="button" data-act="edit" style="${btn}">Modifier</button>`}
      <button class="direct-btn" type="button" data-act="archive" style="${btn}">${r.archived ? "Remettre en ligne" : "Retirer"}</button>
    </div>`;
  card.querySelector('[data-act="edit"]')?.addEventListener("click", () => openForm(r));
  card.querySelector('[data-act="archive"]').addEventListener("click", async (e) => {
    const archive = !r.archived;
    if (archive && !confirm(`Retirer ${r.name} ? Elle ne sera plus proposée à la réservation. `
      + "Ses réservations déjà faites sont conservées, et vous pourrez la remettre en ligne.")) return;
    e.target.disabled = true;
    try {
      const res = await call("setRoomArchived", { id: r.id, archived: archive });
      showMessage("room-message", res.message, !res.success);
    } catch (err) {
      console.error(err);
      showMessage("room-message", "Enregistrement impossible, merci de réessayer.", true);
    }
    refreshRooms();
  });
  return card;
}

// ==================== FORMULAIRE ====================

function setValue(id, value) {
  $(id).value = value === null || value === undefined ? "" : value;
}

function openForm(room) {
  editingId = room ? room.id : null;
  $("room-form-title").textContent = room ? `Modifier ${room.name}` : "Nouvelle salle";
  setValue("room-name", room?.name);
  setValue("room-category", room ? room.category : "Salles de réunion");
  setValue("room-calendar", room?.calendarId);
  $("room-calendar").readOnly = !!room;
  $("room-calendar-help").hidden = !!room;
  setValue("room-photo", room?.photoUrl);
  setValue("room-max-people", room?.maxPeople);
  setValue("room-capacity", room ? room.capacity : 1);
  $("room-color").value = room && /^#[0-9a-f]{6}$/i.test(room.color) ? room.color : "#67DFCB";
  setValue("room-price-hour", room?.hourlyPrice);
  setValue("room-price-half", room?.halfDayPrice);
  setValue("room-price-full", room?.fullDayPrice);
  setValue("room-badge", room?.badgeLabel);
  $("room-multiday").checked = room ? !!room.allowMultiDay : true;
  $("room-coworking").checked = !!room?.coworking;
  setValue("room-credits-hour", room?.credits?.hourly);
  setValue("room-credits-half", room?.credits?.halfDay);
  setValue("room-credits-full", room?.credits?.fullDay);
  $("room-credits").hidden = !$("room-coworking").checked;
  $("room-closures").innerHTML = "";
  (room?.closures || []).forEach(addClosureRow);
  showMessage("room-form-message", "");
  $("room-form").hidden = false;
  $("room-add").hidden = true;
  $("room-form").scrollIntoView({ behavior: "smooth", block: "start" });
  $("room-name").focus();
}

function closeForm() {
  $("room-form").hidden = true;
  $("room-add").hidden = false;
  editingId = null;
}

function addClosureRow(c) {
  const row = document.createElement("div");
  row.className = "room-closure-row";
  row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;";
  row.innerHTML = `
    <input type="date" class="profile-input" data-field="start" style="flex:1;min-width:140px;" aria-label="Premier jour"/>
    <span style="font-size:13px;">au</span>
    <input type="date" class="profile-input" data-field="end" style="flex:1;min-width:140px;" aria-label="Dernier jour"/>
    <input type="text" class="profile-input" data-field="reason" style="flex:2;min-width:160px;" maxlength="100" placeholder="motif (ex. travaux)"/>
    <button class="direct-btn" type="button" style="margin-top:0;width:auto;padding:6px 10px;font-size:12px;" aria-label="Supprimer la période">✕</button>`;
  const [start, end, reason] = row.querySelectorAll("input");
  start.value = c?.start || "";
  end.value = c?.end || "";
  reason.value = c?.reason || "";
  // Fin préremplie avec le début (indisponibilité d'un seul jour par défaut)
  start.addEventListener("change", () => { if (!end.value || end.value < start.value) end.value = start.value; });
  row.querySelector("button").addEventListener("click", () => row.remove());
  $("room-closures").appendChild(row);
}

function readForm() {
  const num = id => $(id).value.trim() === "" ? null : Number($(id).value);
  const closures = [...document.querySelectorAll(".room-closure-row")].map(row => ({
    start: row.querySelector('[data-field="start"]').value,
    end: row.querySelector('[data-field="end"]').value || row.querySelector('[data-field="start"]').value,
    reason: row.querySelector('[data-field="reason"]').value.trim()
  })).filter(c => c.start || c.end);
  return {
    id: editingId || undefined,
    name: $("room-name").value.trim(),
    category: $("room-category").value.trim(),
    calendarId: editingId ? undefined : $("room-calendar").value.trim(),
    photoUrl: $("room-photo").value.trim(),
    maxPeople: num("room-max-people"),
    capacity: num("room-capacity") ?? 1,
    color: $("room-color").value,
    hourlyPrice: num("room-price-hour"),
    halfDayPrice: num("room-price-half"),
    fullDayPrice: num("room-price-full"),
    badgeLabel: $("room-badge").value.trim(),
    allowMultiDay: $("room-multiday").checked,
    coworking: $("room-coworking").checked,
    credits: { hourly: num("room-credits-hour"), halfDay: num("room-credits-half"), fullDay: num("room-credits-full") },
    closures
  };
}

$("room-add")?.addEventListener("click", () => openForm(null));
$("room-cancel")?.addEventListener("click", closeForm);
$("room-closure-add")?.addEventListener("click", () => addClosureRow(null));
$("room-coworking")?.addEventListener("change", () => { $("room-credits").hidden = !$("room-coworking").checked; });

$("room-save")?.addEventListener("click", async () => {
  const room = readForm();
  if (!room.name) { showMessage("room-form-message", "Merci de donner un nom à la salle.", true); return; }
  if (room.closures.some(c => !c.start || c.end < c.start)) {
    showMessage("room-form-message", "Indisponibilité : vérifiez les dates (la fin doit être après le début).", true);
    return;
  }
  if (room.coworking && !(room.credits.hourly > 0)) {
    showMessage("room-form-message", "Indiquez au moins le nombre de crédits par heure pour les coworkers.", true);
    return;
  }
  const btn = $("room-save");
  btn.disabled = true;
  showMessage("room-form-message", editingId ? "Enregistrement…" : "Création de la salle…", false);
  try {
    const res = await call("saveRoom", room);
    if (!res.success) {
      showMessage("room-form-message", res.message, true);
      return;
    }
    closeForm();
    showMessage("room-message", res.message, !!res.warning);
    refreshRooms();
  } catch (err) {
    console.error(err);
    showMessage("room-form-message", "Enregistrement impossible, merci de réessayer.", true);
  } finally {
    btn.disabled = false;
  }
});
