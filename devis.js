// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Devis faits à la main (Gestion, équipe Hiptown)
//  Un membre de l'équipe prépare un devis sans passer par une réservation :
//   - coworker (client interne) : services seuls, la salle est sur ses crédits ;
//   - client salle de réunion (client externe) : la salle et les services.
//  Il choisit la destination : le client (copie à lui et à l'équipe de la ville)
//  ou lui seul. L'outil de réservation (reservation/Devis.gs) calcule le devis,
//  l'envoie et en garde une copie dans le dossier Drive des devis.
// ═══════════════════════════════════════════════════════

import { call } from "./salles.js";

const $ = id => document.getElementById(id);

let options = null; // salles, services et horaires reçus du serveur

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function showMessage(text, isError) {
  const m = $("mq-message");
  m.textContent = text;
  m.style.color = isError ? "#dc2626" : "#166534";
  m.hidden = !text;
}

const selectedRadio = name => document.querySelector(`input[name="${name}"]:checked`)?.value || "";
const currentRoom = () => options?.rooms.find(r => r.id === $("mq-room").value) || null;

export async function renderManualQuotePanel() {
  showMessage("");
  $("mq-form").hidden = true;
  $("mq-loading").hidden = false;
  $("mq-loading").textContent = "Chargement…";
  let res;
  try {
    res = await call("getManualQuoteOptions");
  } catch (err) {
    console.error(err);
    res = { success: false, message: "Outil de réservation injoignable, merci de réessayer." };
  }
  if (!res.success) {
    $("mq-loading").textContent = res.message;
    return;
  }
  options = res;
  if (!res.rooms.length) {
    $("mq-loading").textContent = "Aucune salle en ligne dans votre ville.";
    return;
  }
  $("mq-loading").hidden = true;
  $("mq-room").innerHTML = res.rooms.map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("");
  const hours = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  $("mq-start").innerHTML = hours(res.startHour, res.endHour - 1).map(h => `<option value="${h}">${h}h</option>`).join("");
  $("mq-end").innerHTML = hours(res.startHour + 1, res.endHour).map(h => `<option value="${h}">${h}h</option>`).join("");
  $("mq-start").value = String(res.startHour);
  $("mq-end").value = String(res.endHour);
  $("mq-civility").innerHTML = '<option value="">—</option>'
    + res.civilities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  $("mq-date").min = new Date().toISOString().slice(0, 10);
  $("mq-form").hidden = false;
  onRoomChange();
  onDestinationChange();
}

/** Champs propres à la salle : date de fin (plusieurs jours), postes, services de sa ville. */
function onRoomChange() {
  const room = currentRoom();
  if (!room) return;
  $("mq-end-date-wrap").hidden = !room.allowMultiDay;
  if (!room.allowMultiDay) $("mq-end-date").value = "";
  $("mq-qty-wrap").hidden = !room.quantitySelectable;
  $("mq-qty").max = room.capacity || 1;
  $("mq-people").max = room.maxPeople || 500;
  const services = options.services.filter(s => s.city === room.city);
  $("mq-services").innerHTML = services.length ? services.map(s => s.pricing === "person"
    ? `<label style="display:flex;gap:8px;align-items:center;min-height:40px;font-size:14px;">
         <input type="checkbox" data-service="${escapeHtml(s.id)}"/> ${escapeHtml(s.label)} (${s.price} € HT / pers.)</label>`
    : `<label style="display:flex;gap:8px;align-items:center;min-height:40px;font-size:14px;">
         <input type="number" class="profile-input" data-service="${escapeHtml(s.id)}" min="0" max="10" value="0" style="width:72px;margin:0;"/>
         ${escapeHtml(s.label)} (${s.pricing === "unit" ? s.price + " € HT l'unité" : s.halfDayPrice + " € HT demi-journée, " + s.fullDayPrice + " € HT journée"})</label>`
  ).join("") : '<p style="color:#94a3b8;font-size:13px;">Aucun service en ligne dans cette ville.</p>';
}

function onDestinationChange() {
  $("mq-email-label").textContent = selectedRadio("mq-destination") === "me" ? "Email du client (facultatif)" : "Email du client *";
}

function readServices() {
  const services = {};
  document.querySelectorAll("#mq-services [data-service]").forEach(input => {
    const n = input.type === "checkbox" ? (input.checked ? 1 : 0) : parseInt(input.value, 10) || 0;
    if (n > 0) services[input.dataset.service] = n;
  });
  return services;
}

$("mq-room")?.addEventListener("change", onRoomChange);
document.querySelectorAll('input[name="mq-destination"]').forEach(r => r.addEventListener("change", onDestinationChange));

$("mq-send")?.addEventListener("click", async (e) => {
  const audience = selectedRadio("mq-audience");
  const destination = selectedRadio("mq-destination");
  if (!audience) { showMessage("Choisissez le client : coworker ou client salle de réunion.", true); return; }
  const payload = {
    audience,
    destination,
    spaceId: $("mq-room").value,
    dateString: $("mq-date").value,
    endDateString: $("mq-end-date").value,
    startHour: Number($("mq-start").value),
    endHour: Number($("mq-end").value),
    spaceQuantity: Number($("mq-qty").value) || 1,
    numberOfPeople: Number($("mq-people").value),
    services: readServices(),
    civility: $("mq-civility").value,
    firstName: $("mq-first-name").value.trim(),
    lastName: $("mq-last-name").value.trim(),
    company: $("mq-company").value.trim(),
    clientEmail: $("mq-email").value.trim()
  };
  const to = destination === "me" ? "vous seul" : payload.clientEmail || "le client";
  if (!confirm(`Envoyer ce devis à ${to} ?`)) return;
  e.target.disabled = true;
  showMessage("Préparation du devis…", false);
  try {
    const res = await call("createManualQuote", payload);
    showMessage(res.message, !res.success);
  } catch (err) {
    console.error(err);
    showMessage("Envoi impossible, merci de réessayer.", true);
  }
  e.target.disabled = false;
  $("mq-message").scrollIntoView({ behavior: "smooth", block: "center" });
});
