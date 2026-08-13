// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Routage authentification (v1)
//  À charger en <script type="module" src="app-auth.js"></script>
//  APRÈS config.js et app.js dans index.html
// ═══════════════════════════════════════════════════════

import { signUp, logIn, logOut, resetPassword, watchAuthState } from "./auth.js";
import {
  listPendingUsers, listAllUsers, approveUser, rejectUser,
  updateUserAccess, adminCreateAccount, listCompanies,
  listUnseenBreakfastOrders, markBreakfastOrderSeen
} from "./admin.js";

const stepAuth    = document.getElementById("step-auth");
const stepPending = document.getElementById("step-pending");
const stepAdmin   = document.getElementById("step-admin");
const authError   = document.getElementById("auth-error");

let pendingSignupRole = "salle"; // pré-rempli selon la carte cliquée sur l'écran d'accueil

// ── Utilitaire : masquer toutes les sections, y compris les nouvelles ──
// Remplace la fonction hideAll() existante dans app.js : appelle-la puis
// masque en plus les 3 nouvelles sections.
function hideAllAuth() {
  if (window.hideAll) window.hideAll();
  [stepAuth, stepPending, stepAdmin].forEach(s => { if (s) s.hidden = true; });
}
window.hideAllAuth = hideAllAuth;

// ── Ouvrir l'écran de connexion/inscription depuis une carte de choix ──
// À appeler à la place de l'ouverture du step-pin :
//   openAuthScreen("salle")      -> carte "Client salle de réunion"
//   openAuthScreen("coworking")  -> carte "Client Coworking"
//   openAuthScreen("admin")      -> carte "Hiptown" (inscription désactivée)
window.openAuthScreen = function (intendedRole) {
  pendingSignupRole = intendedRole === "admin" ? "salle" : intendedRole;
  const signupTabBtn = document.querySelector('.auth-tab[data-tab="signup"]');
  if (signupTabBtn) signupTabBtn.style.display = intendedRole === "admin" ? "none" : "";
  document.querySelectorAll('input[name="signup-role"]').forEach(r => {
    r.checked = (r.value === pendingSignupRole);
  });
  hideAllAuth();
  stepAuth.hidden = false;
  switchAuthTab("login");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// ── Onglets connexion / inscription ──
function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("login-form").hidden  = tab !== "login";
  document.getElementById("signup-form").hidden = tab !== "signup";
  authError.hidden = true;
}
document.querySelectorAll(".auth-tab").forEach(btn => {
  btn.addEventListener("click", () => switchAuthTab(btn.dataset.tab));
});

document.getElementById("back-from-auth")?.addEventListener("click", () => {
  hideAllAuth();
  document.getElementById("step-choice").hidden = false;
});

// ── Soumission connexion ──
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.hidden = true;
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await logIn(email, password);
    // Le routage se fait automatiquement via watchAuthState ci-dessous
  } catch (err) {
    showAuthError(friendlyError(err));
  }
});

document.getElementById("forgot-password").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  if (!email) { showAuthError("Entrez votre email d'abord."); return; }
  try {
    await resetPassword(email);
    showAuthError("Email de réinitialisation envoyé.");
  } catch (err) {
    showAuthError(friendlyError(err));
  }
});

// ── Soumission inscription ──
document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.hidden = true;
  const email     = document.getElementById("signup-email").value.trim();
  const password  = document.getElementById("signup-password").value;
  const company   = document.getElementById("signup-company").value.trim();
  const firstName = document.getElementById("signup-firstname").value.trim();
  const lastName  = document.getElementById("signup-lastname").value.trim();
  const birthDate = document.getElementById("signup-birthdate").value;
  const role      = document.querySelector('input[name="signup-role"]:checked').value;
  try {
    await signUp(email, password, role, company, firstName, lastName, birthDate);
    // Le routage vers l'écran "en attente" se fait automatiquement
  } catch (err) {
    showAuthError(friendlyError(err));
  }
});

function showAuthError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
}

function friendlyError(err) {
  const code = err.code || "";
  if (code.includes("email-already-in-use")) return "Un compte existe déjà avec cet email.";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Email ou mot de passe incorrect.";
  if (code.includes("user-not-found")) return "Aucun compte avec cet email.";
  if (code.includes("weak-password")) return "Mot de passe trop court (6 caractères min.).";
  return "Une erreur est survenue. Réessayez.";
}

document.getElementById("pending-logout")?.addEventListener("click", async () => {
  await logOut();
  hideAllAuth();
  const stepWelcome = document.getElementById("step-welcome");
  if (stepWelcome) stepWelcome.hidden = false;
});

// ── Routage automatique selon l'état de connexion ──
watchAuthState(async (user, profile) => {
  if (!user) return; // reste sur l'écran de choix / auth, rien à faire

  if (!profile || profile.status === "pending") {
    hideAllAuth();
    stepPending.hidden = false;
    return;
  }

  if (profile.status === "rejected") {
    await logOut();
    showAuthError("Votre demande d'accès a été refusée. Contactez l'équipe Hiptown.");
    return;
  }

  // status === "approved"
  const personName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  if (profile.role === "admin") {
    routeToDashboard({ id: "hiptown", name: "Hiptown", color: "#1e1847", textColor: "#ffe700", initials: "HT", personName }, "hiptown");
  } else if (profile.role === "coworking") {
    const companies = await listCompanies();
    const company = companies.find(c => c.id === profile.companyId) || {
      id: profile.companyId || "inconnu", name: profile.companyNameHint || "Votre entreprise",
      color: "#e0f2fe", textColor: "#0369a1", initials: "CW"
    };
    routeToDashboard({ ...company, personName }, "coworking");
  } else if (profile.role === "salle") {
    routeToDashboard({ id: "salle-reunion", name: "Salle de réunion", color: "#0369a1", textColor: "#ffffff", initials: "SR", personName }, "salle");
  }
});

function routeToDashboard(client, space) {
  // Ferme explicitement l'écran de connexion avant d'afficher le dashboard
  hideAllAuth();
  if (window.showDashboardFromAuth) {
    window.showDashboardFromAuth(client, space);
  }
  if (notifBellWrap) {
    const isAdmin = space === "hiptown";
    notifBellWrap.hidden = !isAdmin;
    if (isAdmin) refreshNotifBadge();
  }
}

// ── Bouton "Changer d'espace" -> déconnexion propre ──
document.getElementById("logout-btn")?.addEventListener("click", () => { logOut(); });

// ═══════════════════════════════════════════════════════
//  PANNEAU ADMIN + NOTIFICATIONS
// ═══════════════════════════════════════════════════════

document.getElementById("back-from-admin")?.addEventListener("click", () => {
  hideAllAuth();
  document.getElementById("step-dashboard").hidden = false;
});

// Carte de demande en attente, réutilisée dans le panneau admin ET la cloche de notifications
function createPendingCard(u, companies, onDone) {
  const card = document.createElement("div");
  card.className = "info-card";
  card.innerHTML = `
    <div style="padding:14px 16px;">
      <p style="font-weight:600;font-size:13px;">${[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}</p>
      <p style="font-size:11px;color:#94a3b8;">${u.email}</p>
      <p style="font-size:12px;color:#64748b;">
        Demandé : ${u.requestedRole === "coworking" ? "Coworking" : "Salle de réunion"}
        ${u.companyNameHint ? " — " + u.companyNameHint : ""}
      </p>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <select class="approve-role" style="padding:6px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;">
          <option value="salle" ${u.requestedRole === "salle" ? "selected" : ""}>Salle de réunion</option>
          <option value="coworking" ${u.requestedRole === "coworking" ? "selected" : ""}>Coworking</option>
        </select>
        <select class="approve-company" style="padding:6px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;">
          <option value="">— Entreprise —</option>
          ${companies.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
        </select>
        <button class="direct-btn approve-btn" style="margin-top:0;width:auto;padding:6px 12px;background:#166534;color:#fff;border:none;font-size:12px;">Valider</button>
        <button class="direct-btn reject-btn" style="margin-top:0;width:auto;padding:6px 12px;border-color:#dc2626;color:#dc2626;font-size:12px;">Refuser</button>
      </div>
    </div>`;
  card.querySelector(".approve-btn").addEventListener("click", async () => {
    const role = card.querySelector(".approve-role").value;
    const companyId = card.querySelector(".approve-company").value || null;
    await approveUser(u.uid, role, role === "coworking" ? companyId : null);
    onDone();
  });
  card.querySelector(".reject-btn").addEventListener("click", async () => {
    await rejectUser(u.uid);
    onDone();
  });
  return card;
}

export async function renderAdminPanel() {
  const pendingList = document.getElementById("admin-pending-list");
  const allList      = document.getElementById("admin-all-list");
  const companies     = await listCompanies();

  const pending = await listPendingUsers();
  pendingList.innerHTML = pending.length
    ? ""
    : '<p style="color:#94a3b8;padding:12px;">Aucune demande en attente.</p>';

  pending.forEach(u => {
    pendingList.appendChild(createPendingCard(u, companies, () => {
      renderAdminPanel();
      refreshNotifBadge();
    }));
  });

  const all = await listAllUsers();
  allList.innerHTML = "";
  all.forEach(u => {
    const row = document.createElement("div");
    row.className = "info-item";
    row.style.justifyContent = "space-between";
    row.innerHTML = `<span>${u.email} — ${u.role || "—"} (${u.status})</span>`;
    allList.appendChild(row);
  });
}

// ── Cloche de notifications ────────────────────────────
const notifBellWrap = document.getElementById("notif-bell-wrap");
const notifBellBtn  = document.getElementById("notif-bell-btn");
const notifBadge    = document.getElementById("notif-badge");
const notifDropdown = document.getElementById("notif-dropdown");

async function refreshNotifBadge() {
  if (!notifBadge) return;
  const pending = await listPendingUsers();
  const orders  = await listUnseenBreakfastOrders();
  const total = pending.length + orders.length;
  if (total > 0) {
    notifBadge.textContent = total;
    notifBadge.style.display = "block";
  } else {
    notifBadge.style.display = "none";
  }
}

async function renderNotifDropdown() {
  const companies = await listCompanies();
  const pending = await listPendingUsers();
  const orders  = await listUnseenBreakfastOrders();
  notifDropdown.innerHTML = "";

  if (pending.length === 0 && orders.length === 0) {
    notifDropdown.innerHTML = '<p style="padding:12px;font-size:13px;color:#94a3b8;">Aucune notification.</p>';
    return;
  }

  if (pending.length > 0) {
    const header = document.createElement("p");
    header.textContent = "🔑 Comptes en attente";
    header.style.cssText = "font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;padding:6px 8px 4px;";
    notifDropdown.appendChild(header);
    pending.forEach(u => {
      notifDropdown.appendChild(createPendingCard(u, companies, async () => {
        await refreshNotifBadge();
        await renderNotifDropdown();
        const stepAdminEl = document.getElementById("step-admin");
        if (stepAdminEl && !stepAdminEl.hidden) renderAdminPanel();
      }));
    });
  }

  if (orders.length > 0) {
    const header = document.createElement("p");
    header.textContent = "🥐 Commandes petit-déjeuner";
    header.style.cssText = "font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;padding:10px 8px 4px;";
    notifDropdown.appendChild(header);
    orders.forEach(o => {
      const card = document.createElement("div");
      card.className = "info-card";
      const dateFmt = o.date
        ? new Date(o.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "";
      card.innerHTML = `
        <div style="padding:10px 14px;">
          <p style="font-weight:600;font-size:13px;">${o.name || o.email}${o.companyName ? " — " + o.companyName : ""}</p>
          <p style="font-size:12px;color:#64748b;">${dateFmt} · ${o.people} pers. · ${o.price} €</p>
        </div>`;
      notifDropdown.appendChild(card);
    });
    // Marque ces commandes comme vues dès qu'elles s'affichent dans la cloche
    await Promise.all(orders.map(o => markBreakfastOrderSeen(o.id)));
    refreshNotifBadge();
  }
}

notifBellBtn?.addEventListener("click", async (e) => {
  e.stopPropagation();
  const isOpen = notifDropdown.style.display === "block";
  notifDropdown.style.display = isOpen ? "none" : "block";
  if (!isOpen) await renderNotifDropdown();
});

document.addEventListener("click", (e) => {
  if (notifDropdown && notifBellWrap && notifDropdown.style.display === "block" && !notifBellWrap.contains(e.target)) {
    notifDropdown.style.display = "none";
  }
});

// Déclenché par app.js via : document.dispatchEvent(new CustomEvent("hiptown-tile-action", { detail: tile.action }))
document.addEventListener("hiptown-tile-action", (e) => {
  if (e.detail === "admin") {
    hideAllAuth();
    stepAdmin.hidden = false;
    renderAdminPanel();
  }
});

document.getElementById("create-admin-btn")?.addEventListener("click", async () => {
  const email = document.getElementById("new-admin-email").value.trim();
  const password = document.getElementById("new-admin-password").value;
  const firstName = document.getElementById("new-admin-firstname").value.trim();
  const lastName = document.getElementById("new-admin-lastname").value.trim();
  if (!email || password.length < 6) { alert("Email + mot de passe (6 car. min.) requis."); return; }
  await adminCreateAccount(email, password, "admin", null, firstName, lastName);
  document.getElementById("new-admin-email").value = "";
  document.getElementById("new-admin-password").value = "";
  document.getElementById("new-admin-firstname").value = "";
  document.getElementById("new-admin-lastname").value = "";
  renderAdminPanel();
});
