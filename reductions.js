// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Réductions clients (Gestion, équipe Hiptown)
//  Une remise en % (-10 %, -15 %…) accordée à un client, par exemple après
//  un souci lors d'une réservation. Elle est gardée en mémoire par l'outil
//  de réservation (reservation/Reductions.gs) et appliquée automatiquement
//  au prochain devis envoyé à l'adresse email du client.
// ═══════════════════════════════════════════════════════

import { auth } from "./firebase-config.js";

const BASE_URL = PORTAIL.reservationUrl;
const QUICK_PERCENTS = [10, 15, 20, 25];
const $ = id => document.getElementById(id);

let maxPercent = 50;

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function frDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

async function call(action, payload) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
    body: JSON.stringify({ action, idToken, payload })
  });
  return res.json();
}

function showMessage(text, isError) {
  const m = $("discount-message");
  m.textContent = text;
  m.style.color = isError ? "#dc2626" : "#166534";
  m.hidden = !text;
}

/**
 * Affiche le panneau. users : comptes visibles par l'admin, proposés
 * dans le champ email (les clients sans compte se saisissent à la main).
 */
export async function renderDiscountsPanel(users = []) {
  const list = $("discount-emails");
  list.innerHTML = users
    .filter(u => u.email && u.role !== "admin")
    .map(u => `<option value="${escapeHtml(u.email)}">${escapeHtml([u.firstName, u.lastName].filter(Boolean).join(" "))}</option>`)
    .join("");
  showMessage("");
  await refreshLists();
}

async function refreshLists() {
  const pendingBox = $("discount-pending-list");
  const historyBox = $("discount-history-list");
  pendingBox.innerHTML = historyBox.innerHTML = '<p style="color:#94a3b8;padding:12px;">Chargement…</p>';
  let res;
  try {
    res = await call("getDiscounts");
  } catch (err) {
    console.error(err);
    res = { success: false, message: "Outil de réservation injoignable, merci de réessayer." };
  }
  if (!res.success) {
    pendingBox.innerHTML = `<p style="color:#dc2626;padding:12px;">${escapeHtml(res.message)}</p>`;
    historyBox.innerHTML = "";
    return;
  }
  maxPercent = res.maxPercent || maxPercent;
  $("discount-percent").max = maxPercent;

  pendingBox.innerHTML = res.pending.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucune réduction en attente.</p>';
  res.pending.forEach(d => pendingBox.appendChild(pendingCard(d)));

  historyBox.innerHTML = res.history.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucune réduction utilisée pour le moment.</p>';
  res.history.slice(0, 30).forEach(d => {
    const card = document.createElement("div");
    card.className = "info-card";
    card.innerHTML = `
      <div class="info-item" style="gap:10px;">
        <span style="flex:1;min-width:0;">
          <b>-${d.percent} %</b> · ${escapeHtml(d.email)}<br>
          <span style="font-size:11px;color:#94a3b8;">Utilisée le ${escapeHtml(frDate(d.usedAt))}
            ${d.quoteNumber ? " · devis n°" + escapeHtml(d.quoteNumber) : ""}
            ${d.bookingLabel ? " · " + escapeHtml(d.bookingLabel) : ""}
            ${d.reason ? "<br>Motif : " + escapeHtml(d.reason) : ""}</span>
        </span>
      </div>`;
    historyBox.appendChild(card);
  });
}

function pendingCard(d) {
  const card = document.createElement("div");
  card.className = "info-card";
  card.innerHTML = `
    <div class="info-item" style="gap:10px;">
      <span style="flex:1;min-width:0;">
        <b>-${d.percent} %</b> · ${escapeHtml(d.email)}<br>
        <span style="font-size:11px;color:#94a3b8;">Accordée le ${escapeHtml(frDate(d.createdAt))}${d.createdBy ? " par " + escapeHtml(d.createdBy) : ""}
          ${d.reason ? "<br>Motif : " + escapeHtml(d.reason) : ""}</span>
      </span>
      <button class="direct-btn" type="button" style="margin-top:0;width:auto;padding:6px 12px;font-size:12px;">Retirer</button>
    </div>`;
  card.querySelector("button").addEventListener("click", async (e) => {
    if (!confirm(`Retirer la réduction de ${d.percent} % pour ${d.email} ?`)) return;
    e.target.disabled = true;
    try {
      const res = await call("deleteDiscount", { email: d.email });
      showMessage(res.message, !res.success);
    } catch (err) {
      console.error(err);
      showMessage("Suppression impossible, merci de réessayer.", true);
    }
    refreshLists();
  });
  return card;
}

// Boutons -10 %, -15 %… qui remplissent le champ pourcentage
const quick = $("discount-quick");
if (quick) {
  quick.innerHTML = QUICK_PERCENTS.map(p =>
    `<button type="button" class="direct-btn" data-percent="${p}" style="margin-top:0;width:auto;padding:6px 12px;font-size:12px;">-${p} %</button>`).join("");
  quick.addEventListener("click", (e) => {
    const p = e.target.closest("[data-percent]")?.dataset.percent;
    if (p) $("discount-percent").value = p;
  });
}

$("discount-save")?.addEventListener("click", async () => {
  const email = $("discount-email").value.trim().toLowerCase();
  const percent = Number($("discount-percent").value);
  const reason = $("discount-reason").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMessage("Adresse email invalide.", true); return; }
  if (!(Number.isInteger(percent) && percent >= 1 && percent <= maxPercent)) {
    showMessage(`La remise doit être un nombre entier entre 1 et ${maxPercent} %.`, true);
    return;
  }
  const btn = $("discount-save");
  btn.disabled = true;
  try {
    const res = await call("setDiscount", { email, percent, reason });
    showMessage(res.message, !res.success);
    if (res.success) {
      $("discount-email").value = $("discount-percent").value = $("discount-reason").value = "";
      refreshLists();
    }
  } catch (err) {
    console.error(err);
    showMessage("Enregistrement impossible, merci de réessayer.", true);
  } finally {
    btn.disabled = false;
  }
});
