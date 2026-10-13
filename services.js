// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Services en option (Gestion, équipe Hiptown)
//  Prix des repas et du parking, et clients à qui ils sont proposés.
//  Les réglages sont gardés par l'outil de réservation
//  (reservation/Services.gs) : formulaires et devis les utilisent
//  dès l'enregistrement.
// ═══════════════════════════════════════════════════════

import { call } from "./salles.js";

const $ = id => document.getElementById(id);

const AUDIENCES = { salle: "Clients salle de réunion", coworking: "Coworkers" };

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function showMessage(text, isError) {
  const m = $("service-message");
  m.textContent = text;
  m.style.color = isError ? "#dc2626" : "#166534";
  m.hidden = !text;
}

export async function renderServicesPanel() {
  showMessage("");
  const list = $("services-list");
  list.innerHTML = '<p style="color:#94a3b8;padding:12px;">Chargement…</p>';
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
  list.innerHTML = "";
  res.services.forEach(s => list.appendChild(serviceCard(s)));
}

/** Carte d'un service : un champ par prix, une case par type de client, un bouton Enregistrer. */
function serviceCard(s) {
  const card = document.createElement("div");
  card.className = "info-card";
  card.style.padding = "14px 16px";
  card.innerHTML = `
    <b style="font-size:15px;">${escapeHtml(s.icon)} ${escapeHtml(s.label)}</b>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;">
      ${s.prices.map(p => `
        <div style="flex:1;min-width:140px;">
          <label class="profile-label">${escapeHtml(p.label)} (€ HT)</label>
          <input type="number" class="profile-input" data-price="${escapeHtml(p.key)}" min="0" step="0.5" value="${Number(p.value)}"/>
        </div>`).join("")}
    </div>
    <p class="profile-label" style="margin-top:10px;">Proposé aux</p>
    ${Object.keys(s.offered).map(a => `
      <label style="display:flex;gap:8px;align-items:center;min-height:36px;font-size:14px;">
        <input type="checkbox" data-audience="${escapeHtml(a)}" ${s.offered[a] ? "checked" : ""}/> ${escapeHtml(AUDIENCES[a] || a)}
      </label>`).join("")}
    <button class="direct-btn" type="button" style="background:var(--navy);color:#fff;margin-top:10px;">Enregistrer</button>`;

  card.querySelector("button").addEventListener("click", async (e) => {
    const prices = {};
    card.querySelectorAll("[data-price]").forEach(input => { prices[input.dataset.price] = input.value; }); // vérifiés par le serveur
    const offered = {};
    card.querySelectorAll("[data-audience]").forEach(box => { offered[box.dataset.audience] = box.checked; });
    e.target.disabled = true;
    try {
      const res = await call("saveService", { id: s.id, prices, offered });
      showMessage(res.message, !res.success);
    } catch (err) {
      console.error(err);
      showMessage("Enregistrement impossible, merci de réessayer.", true);
    }
    e.target.disabled = false;
    $("service-message").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  return card;
}
