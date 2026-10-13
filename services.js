// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Services en option (Gestion, équipe Hiptown)
//  Ajouter, modifier ou retirer un service (repas, parking…), changer
//  ses prix et choisir à qui il est proposé : clients salle de réunion
//  et/ou coworkers. La liste est gardée par l'outil de réservation
//  (reservation/Services.gs) : formulaires et devis l'utilisent dès
//  l'enregistrement.
// ═══════════════════════════════════════════════════════

import { call } from "./salles.js";

const $ = id => document.getElementById(id);

const AUDIENCES = { salle: "Salle de réunion", coworking: "Coworking" };
const PRICING_LABELS = {
  person: "Par personne",
  unit: "À l'unité",
  unitDay: "Par unité, à la demi-journée ou à la journée"
};

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function showMessage(id, text, isError) {
  const m = $(id);
  m.textContent = text;
  m.style.color = isError ? "#dc2626" : "#166534";
  m.hidden = !text;
}

/** Champs de prix selon la façon de facturer, puis les deux cases Salle de réunion / Coworking. */
function fieldsHtml(s) {
  const input = (name, label, value) => `
    <div style="flex:1;min-width:140px;">
      <label class="profile-label">${label} (€ HT)</label>
      <input type="number" class="profile-input" data-field="${name}" min="0" step="0.5" value="${value ?? ""}"/>
    </div>`;
  const prices = s.pricing === "unitDay"
    ? input("halfDayPrice", "Par unité, 5h ou moins", s.halfDayPrice) + input("fullDayPrice", "Par unité, journée", s.fullDayPrice)
    : input("price", s.pricing === "person" ? "Par personne" : "Par unité", s.price);
  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;">${prices}</div>
    <p class="profile-label" style="margin-top:10px;">Proposé en</p>
    <div style="display:flex;gap:18px;flex-wrap:wrap;">
      ${Object.keys(AUDIENCES).map(a => `
        <label style="display:flex;gap:8px;align-items:center;min-height:40px;font-size:14px;">
          <input type="checkbox" data-audience="${a}" ${s.offered?.[a] ? "checked" : ""}/> ${AUDIENCES[a]}
        </label>`).join("")}
    </div>`;
}

/** Valeurs saisies dans une carte ou le formulaire (prix vérifiés par le serveur). */
function readFields(container) {
  const values = { offered: {} };
  container.querySelectorAll("[data-field]").forEach(input => { values[input.dataset.field] = input.value; });
  container.querySelectorAll("[data-audience]").forEach(box => { values.offered[box.dataset.audience] = box.checked; });
  return values;
}

async function send(action, payload, messageId) {
  try {
    const res = await call(action, payload);
    showMessage(messageId, res.message, !res.success);
    return res.success;
  } catch (err) {
    console.error(err);
    showMessage(messageId, "Enregistrement impossible, merci de réessayer.", true);
    return false;
  }
}

export async function renderServicesPanel() {
  showMessage("service-message", "");
  closeForm();
  await refreshServices();
}

async function refreshServices() {
  const list = $("services-list");
  const archivedList = $("services-archived-list");
  list.innerHTML = '<p style="color:#94a3b8;padding:12px;">Chargement…</p>';
  archivedList.innerHTML = "";
  let res;
  try {
    res = await call("getServicesAdmin");
  } catch (err) {
    console.error(err);
    res = { success: false, message: "Outil de réservation injoignable, merci de réessayer." };
  }
  if (!res.success) {
    list.innerHTML = `<p style="color:#dc2626;padding:12px;">${escapeHtml(res.message)}</p>`;
    return;
  }
  const online = res.services.filter(s => !s.archived);
  const archived = res.services.filter(s => s.archived);
  list.innerHTML = online.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucun service en ligne.</p>';
  online.forEach(s => list.appendChild(serviceCard(s)));
  archivedList.innerHTML = archived.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucun service retiré.</p>';
  archived.forEach(s => archivedList.appendChild(archivedCard(s)));
}

/** Service en ligne : nom, prix et cases modifiables sur place, Enregistrer ou Retirer. */
function serviceCard(s) {
  const btn = "margin-top:0;width:auto;padding:8px 14px;font-size:13px;";
  const card = document.createElement("div");
  card.className = "info-card";
  card.style.padding = "14px 16px";
  card.innerHTML = `
    <label class="profile-label" style="margin-top:0;">Nom</label>
    <input type="text" class="profile-input" data-field="label" maxlength="60" value="${escapeHtml(s.label)}"/>
    <p style="font-size:12px;color:#64748b;margin:6px 0 0;">Facturation : ${escapeHtml(PRICING_LABELS[s.pricing] || s.pricing)}</p>
    ${fieldsHtml(s)}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
      <button class="direct-btn" type="button" data-act="save" style="${btn}background:var(--navy);color:#fff;">Enregistrer</button>
      <button class="direct-btn" type="button" data-act="archive" style="${btn}">Retirer</button>
    </div>`;
  card.querySelector('[data-act="save"]').addEventListener("click", async (e) => {
    e.target.disabled = true;
    if (await send("saveService", { id: s.id, ...readFields(card) }, "service-message")) await refreshServices();
    e.target.disabled = false;
    $("service-message").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  card.querySelector('[data-act="archive"]').addEventListener("click", async (e) => {
    if (!confirm(`Retirer « ${s.label} » ? Il ne sera plus proposé à la réservation. `
      + "Les réservations et devis déjà faits ne changent pas, et vous pourrez le remettre en ligne.")) return;
    e.target.disabled = true;
    await send("setServiceArchived", { id: s.id, archived: true }, "service-message");
    await refreshServices();
  });
  return card;
}

function archivedCard(s) {
  const card = document.createElement("div");
  card.className = "info-card";
  card.innerHTML = `
    <div class="info-item" style="gap:10px;flex-wrap:wrap;">
      <span style="flex:1;min-width:160px;"><b>${escapeHtml(s.label)}</b><br>
        <span style="font-size:12px;color:#64748b;">${escapeHtml(PRICING_LABELS[s.pricing] || "")}</span></span>
      <button class="direct-btn" type="button" style="margin-top:0;width:auto;padding:6px 12px;font-size:12px;">Remettre en ligne</button>
    </div>`;
  card.querySelector("button").addEventListener("click", async (e) => {
    e.target.disabled = true;
    await send("setServiceArchived", { id: s.id, archived: false }, "service-message");
    await refreshServices();
  });
  return card;
}

// ==================== NOUVEAU SERVICE ====================

function renderNewFields() {
  $("service-new-fields").innerHTML = fieldsHtml({ pricing: $("service-new-pricing").value, offered: { salle: true, coworking: true } });
}

function openForm() {
  $("service-new-label").value = "";
  $("service-new-pricing").value = "person";
  renderNewFields();
  showMessage("service-form-message", "");
  $("service-form").hidden = false;
  $("service-add").hidden = true;
  $("service-new-label").focus();
}

function closeForm() {
  $("service-form").hidden = true;
  $("service-add").hidden = false;
}

$("service-add")?.addEventListener("click", openForm);
$("service-cancel")?.addEventListener("click", closeForm);
$("service-new-pricing")?.addEventListener("change", renderNewFields);
$("service-save")?.addEventListener("click", async (e) => {
  e.target.disabled = true;
  const payload = { label: $("service-new-label").value.trim(), pricing: $("service-new-pricing").value, ...readFields($("service-new-fields")) };
  if (await send("saveService", payload, "service-form-message")) {
    showMessage("service-message", $("service-form-message").textContent, false);
    closeForm();
    await refreshServices();
  }
  e.target.disabled = false;
});
