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
// Types de remise (remplacés par la liste envoyée par l'outil de réservation, Config.gs DISCOUNTS.kinds)
let kinds = [
  { id: "total", label: "Sur la totalité du devis" },
  { id: "room", label: "Sur la salle de réunion" },
  { id: "breakfast", label: "Sur le petit déjeuner" },
  { id: "lunch", label: "Sur le déjeuner" },
  { id: "breakfastFree", label: "Petit déjeuner offert", fixed: true }
];

function renderKinds() {
  const select = $("discount-kind");
  const current = select.value;
  select.innerHTML = kinds.map(k => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.label)}</option>`).join("");
  if (kinds.some(k => k.id === current)) select.value = current;
  updatePercentField();
}

/** Le pourcentage n'est demandé que pour les remises qui en ont un (pas pour « offert »). */
function updatePercentField() {
  const kind = kinds.find(k => k.id === $("discount-kind").value);
  $("discount-percent-wrap").hidden = !!kind?.fixed;
}

function describe(d) {
  return d.description || `-${d.percent} %`;
}

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
  if (Array.isArray(res.kinds) && res.kinds.length) { kinds = res.kinds; renderKinds(); }

  pendingBox.innerHTML = res.pending.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucune réduction en attente.</p>';
  res.pending.forEach(d => pendingBox.appendChild(pendingCard(d)));

  historyBox.innerHTML = res.history.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucune réduction utilisée pour le moment.</p>';
  res.history.slice(0, 30).forEach(d => {
    const card = document.createElement("div");
    card.className = "info-card";
    card.innerHTML = `
      <div class="info-item" style="gap:10px;">
        <span style="flex:1;min-width:0;">
          <b>${escapeHtml(describe(d))}</b> · ${escapeHtml(d.email)}<br>
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
        <b>${escapeHtml(describe(d))}</b> · ${escapeHtml(d.email)}<br>
        <span style="font-size:11px;color:#94a3b8;">Accordée le ${escapeHtml(frDate(d.createdAt))}${d.createdBy ? " par " + escapeHtml(d.createdBy) : ""}
          ${d.reason ? "<br>Motif : " + escapeHtml(d.reason) : ""}</span>
      </span>
      <button class="direct-btn" type="button" style="margin-top:0;width:auto;padding:6px 12px;font-size:12px;">Retirer</button>
    </div>`;
  card.querySelector("button").addEventListener("click", async (e) => {
    if (!confirm(`Retirer la réduction (${describe(d)}) pour ${d.email} ?`)) return;
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

if ($("discount-kind")) {
  renderKinds();
  $("discount-kind").addEventListener("change", updatePercentField);
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
  const kind = $("discount-kind").value;
  const fixed = !!kinds.find(k => k.id === kind)?.fixed;
  const percent = fixed ? 100 : Number($("discount-percent").value);
  const reason = $("discount-reason").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMessage("Adresse email invalide.", true); return; }
  if (!fixed && !(Number.isInteger(percent) && percent >= 1 && percent <= maxPercent)) {
    showMessage(`La remise doit être un nombre entier entre 1 et ${maxPercent} %.`, true);
    return;
  }
  const btn = $("discount-save");
  btn.disabled = true;
  try {
    const res = await call("setDiscount", { email, kind, percent, reason });
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
