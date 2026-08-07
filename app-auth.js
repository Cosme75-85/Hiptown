// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Routage authentification (v1)
//  À charger en <script type="module" src="app-auth.js"></script>
//  APRÈS config.js et app.js dans index.html
// ═══════════════════════════════════════════════════════

import { signUp, logIn, logOut, resetPassword, watchAuthState } from "./auth.js";
import {
  listPendingUsers, listAllUsers, approveUser, rejectUser,
  updateUserAccess, adminCreateAccount, listCompanies
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
  const role      = document.querySelector('input[name="signup-role"]:checked').value;
  try {
    await signUp(email, password, role, company);
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
  if (profile.role === "admin") {
    routeToDashboard({ id: "hiptown", name: "Hiptown", color: "#1e1847", textColor: "#ffe700", initials: "HT" }, "hiptown");
  } else if (profile.role === "coworking") {
    const companies = await listCompanies();
    const company = companies.find(c => c.id === profile.companyId) || {
      id: profile.companyId || "inconnu", name: profile.companyNameHint || "Votre entreprise",
      color: "#e0f2fe", textColor: "#0369a1", initials: "CW"
    };
    routeToDashboard(company, "coworking");
  } else if (profile.role === "salle") {
    routeToDashboard({ id: "salle-reunion", name: "Salle de réunion", color: "#0369a1", textColor: "#ffffff", initials: "SR" }, "salle");
  }
});

function routeToDashboard(client, space) {
  // Ferme explicitement l'écran de connexion avant d'afficher le dashboard
  hideAllAuth();
  if (window.showDashboardFromAuth) {
    window.showDashboardFromAuth(client, space);
  }
}

// ── Bouton "Changer d'espace" -> déconnexion propre ──
document.getElementById("logout-btn")?.addEventListener("click", () => { logOut(); });

// ═══════════════════════════════════════════════════════
//  PANNEAU ADMIN
// ═══════════════════════════════════════════════════════

document.getElementById("back-from-admin")?.addEventListener("click", () => {
  hideAllAuth();
  document.getElementById("step-dashboard").hidden = false;
});

export async function renderAdminPanel() {
  const pendingList = document.getElementById("admin-pending-list");
  const allList      = document.getElementById("admin-all-list");
  const companies     = await listCompanies();

  const pending = await listPendingUsers();
  pendingList.innerHTML = pending.length
    ? ""
    : '<p style="color:#94a3b8;padding:12px;">Aucune demande en attente.</p>';

  pending.forEach(u => {
    const card = document.createElement("div");
    card.className = "info-card";
    card.innerHTML = `
      <div style="padding:16px 18px;">
        <p style="font-weight:600;">${u.email}</p>
        <p style="font-size:12px;color:#64748b;">
          Demandé : ${u.requestedRole === "coworking" ? "Coworking" : "Salle de réunion"}
          ${u.companyNameHint ? " — " + u.companyNameHint : ""}
        </p>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <select class="approve-role" style="padding:6px;border-radius:8px;border:1px solid #e2e8f0;">
            <option value="salle" ${u.requestedRole === "salle" ? "selected" : ""}>Salle de réunion</option>
            <option value="coworking" ${u.requestedRole === "coworking" ? "selected" : ""}>Coworking</option>
          </select>
          <select class="approve-company" style="padding:6px;border-radius:8px;border:1px solid #e2e8f0;">
            <option value="">— Entreprise —</option>
            ${companies.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
          </select>
          <button class="direct-btn approve-btn" style="margin-top:0;width:auto;padding:6px 14px;background:#166534;color:#fff;border:none;">Valider</button>
          <button class="direct-btn reject-btn" style="margin-top:0;width:auto;padding:6px 14px;border-color:#dc2626;color:#dc2626;">Refuser</button>
        </div>
      </div>`;
    card.querySelector(".approve-btn").addEventListener("click", async () => {
      const role = card.querySelector(".approve-role").value;
      const companyId = card.querySelector(".approve-company").value || null;
      await approveUser(u.uid, role, role === "coworking" ? companyId : null);
      renderAdminPanel();
    });
    card.querySelector(".reject-btn").addEventListener("click", async () => {
      await rejectUser(u.uid);
      renderAdminPanel();
    });
    pendingList.appendChild(card);
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
  if (!email || password.length < 6) { alert("Email + mot de passe (6 car. min.) requis."); return; }
  await adminCreateAccount(email, password, "admin");
  document.getElementById("new-admin-email").value = "";
  document.getElementById("new-admin-password").value = "";
  renderAdminPanel();
});
