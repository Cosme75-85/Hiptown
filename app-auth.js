// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Routage authentification (v1)
//  À charger en <script type="module" src="app-auth.js"></script>
//  APRÈS config.js et app.js dans index.html
// ═══════════════════════════════════════════════════════

import { signUp, logIn, logOut, resetPassword, watchAuthState, updateMyProfile } from "./auth.js";
import { initProfilePage, isSafePhoto, initialsOf, displayNameOf } from "./profile.js";
import {
  listPendingUsers, listAllUsers, approveUser, rejectUser,
  updateUser, deleteUserDoc, adminCreateAccount, listCompanies,
  listUnseenBreakfastOrders, markBreakfastOrderSeen, createCompany, updateCompany
} from "./admin.js";

const stepAuth    = document.getElementById("step-auth");
const stepPending = document.getElementById("step-pending");
const stepAdmin   = document.getElementById("step-admin");
const stepProfile = document.getElementById("step-profile");
const stepGestion   = document.getElementById("step-gestion");
const stepCompanies = document.getElementById("step-companies");
const authError   = document.getElementById("auth-error");

let pendingSignupRole = "salle"; // pré-rempli selon la carte cliquée sur l'écran d'accueil

// ── Utilitaire : masquer toutes les sections, y compris les nouvelles ──
// Remplace la fonction hideAll() existante dans app.js : appelle-la puis
// masque en plus les 3 nouvelles sections.
function hideAllAuth() {
  if (window.hideAll) window.hideAll();
  [stepAuth, stepPending, stepAdmin, stepProfile, stepGestion, stepCompanies].forEach(s => { if (s) s.hidden = true; });
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
  if (!code && err.message) return err.message; // erreurs écrites par nous (ex. entreprise manquante)
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
  if (!user) { session = null; return; } // reste sur l'écran de choix / auth, rien à faire

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
  const space = profile.role === "admin" ? "hiptown" : profile.role;
  if (!SPACE_STYLES[space]) return; // rôle inconnu : on ne route nulle part
  let company = null;
  if (space === "coworking") {
    const companies = await listCompanies();
    company = companies.find(c => c.id === profile.companyId) || null;
  }
  session = { uid: user.uid, profile, space, company };
  routeToDashboard(buildClient(), space);

  // Compte sans entreprise (créé avant qu'elle soit obligatoire) : on invite à la renseigner
  if (space === "salle" && !profile.companyNameHint) {
    profilePage.open("Merci de renseigner le nom de votre entreprise.");
  }
});

// Utilisateur connecté : { uid, profile, space, company } (company = entreprise coworking officielle)
let session = null;

// Couleurs de l'avatar (quand il n'y a pas de photo) selon l'espace
const SPACE_STYLES = {
  hiptown:   { id: "hiptown",       label: "Équipe",           color: "#1e1847", textColor: "#ffe700" },
  coworking: { id: "coworking",     label: "Coworking",        color: "#e0f2fe", textColor: "#0369a1" },
  salle:     { id: "salle-reunion", label: "Salle de réunion", color: "#0369a1", textColor: "#ffffff" }
};

/** Nom d'entreprise affiché : officiel (coworking), saisi par le client (salle), ou Hiptown (équipe). */
function companyNameOf({ profile, space, company }) {
  if (space === "hiptown") return "Hiptown";
  if (company) return company.name;
  return profile.companyNameHint || "";
}

/** Données attendues par app.js pour l'en-tête et les tuiles du tableau de bord. */
function buildClient() {
  const { profile, space, company } = session;
  const style = SPACE_STYLES[space];
  const companyName = companyNameOf(session);
  return {
    // L'id sert à mémoriser l'ordre des tuiles : on garde celui de l'entreprise en coworking
    id: company ? company.id : style.id,
    color: company && company.color ? company.color : style.color,
    textColor: company && company.textColor ? company.textColor : style.textColor,
    initials: initialsOf(profile),
    photo: isSafePhoto(profile.photo) ? profile.photo : "",
    displayName: displayNameOf(profile),
    subtitle: (companyName || "Entreprise à renseigner") + " · " + style.label,
    extraTiles:  Array.isArray(profile.extraTiles)  ? profile.extraTiles  : [],
    hiddenTiles: Array.isArray(profile.hiddenTiles) ? profile.hiddenTiles : []
  };
}

// ── Page « Mon profil » ──
const profilePage = initProfilePage({
  getContext: () => ({ profile: session.profile, space: session.space, companyName: companyNameOf(session) }),
  save: async (fields) => {
    await updateMyProfile(session.uid, fields);
    Object.assign(session.profile, fields);
    window.renderIdentity(buildClient());
  },
  onClose: () => {
    hideAllAuth();
    document.getElementById("step-dashboard").hidden = false;
  }
});
["company-badge", "profile-link"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", () => { if (session) profilePage.open(); });
});

function routeToDashboard(client, space) {
  // Ferme explicitement l'écran de connexion avant d'afficher le dashboard
  hideAllAuth();
  if (window.showDashboardFromAuth) {
    window.showDashboardFromAuth(client, space);
  }
  // Prévient les autres modules (ex. crédits coworking dans le bandeau, resa-coworking.js)
  document.dispatchEvent(new CustomEvent("hiptown-dashboard", { detail: { space } }));
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

// Menu « Gestion » : deux cases, Gestion des comptes et Gestion des entreprises
function openGestionMenu() {
  hideAllAuth();
  stepGestion.hidden = false;
}

document.getElementById("back-from-gestion")?.addEventListener("click", () => {
  hideAllAuth();
  document.getElementById("step-dashboard").hidden = false;
});
document.getElementById("open-gestion-comptes")?.addEventListener("click", (e) => {
  e.preventDefault();
  hideAllAuth();
  stepAdmin.hidden = false;
  renderAdminPanel();
});
document.getElementById("open-gestion-entreprises")?.addEventListener("click", (e) => {
  e.preventDefault();
  hideAllAuth();
  stepCompanies.hidden = false;
  renderCompaniesPanel();
});
document.getElementById("back-from-admin")?.addEventListener("click", openGestionMenu);
document.getElementById("back-from-companies")?.addEventListener("click", openGestionMenu);

/**
 * Neutralise le HTML d'un texte saisi par un client avant de l'insérer dans la page.
 * Sans ça, un prénom comme « <img onerror=...> » exécuterait du code dans la session admin.
 */
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Mini avatar (photo ou initiales) pour les listes admin. */
function avatarHtml(u) {
  const photo = isSafePhoto(u.photo) ? `background-image:url('${u.photo}');` : "";
  return `<span class="company-badge" style="width:32px;height:32px;font-size:11px;background-color:#1e1847;color:#ffe700;${photo}">${photo ? "" : escapeHtml(initialsOf(u))}</span>`;
}

/** « Prénom Nom (surnom) » pour l'admin, qui a besoin du vrai nom. */
function adminNameOf(u) {
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
  return u.nickname ? `${fullName} (${u.nickname})` : fullName;
}

// ── Sites ──
// Site géré par l'admin connecté (null = super-admin : tous les sites)
function adminSite() {
  return session?.profile?.site || null;
}

function siteLabel(siteId) {
  if (!siteId) return "Sans site";
  return (PORTAIL.sites && PORTAIL.sites[siteId]) || siteId;
}

function siteOptionsHtml(selected) {
  const ids = Object.keys(PORTAIL.sites || {});
  if (selected && !ids.includes(selected)) ids.push(selected);
  return `<option value="">— Sans site —</option>` +
    ids.map(id => `<option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(siteLabel(id))}</option>`).join("");
}

const ROLE_LABELS = { admin: "Administrateur Hiptown", salle: "Salle de réunion", coworking: "Coworking" };
const STATUS_LABELS = { approved: "Validé", pending: "En attente", rejected: "Refusé" };

/** Identifiant Firestore lisible à partir d'un nom d'entreprise (« Café Joli » -> « cafe-joli »). */
function companyIdFrom(name) {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "entreprise-" + Date.now();
}

/**
 * Ajoute « ➕ Nouvelle entreprise… » à une liste d'entreprises coworking :
 * l'admin saisit le nom, l'entreprise est créée dans Firestore puis sélectionnée.
 */
function enableNewCompanyOption(select, companies, suggestedName = "") {
  const opt = document.createElement("option");
  opt.value = "__new__";
  opt.textContent = "➕ Nouvelle entreprise…";
  select.appendChild(opt);
  let previous = select.value;
  select.addEventListener("change", async () => {
    if (select.value !== "__new__") { previous = select.value; return; }
    const name = (prompt("Nom de la nouvelle entreprise coworking :", suggestedName) || "").trim();
    if (!name) { select.value = previous; return; }
    const existing = companies.find(c => (c.name || "").toLowerCase() === name.toLowerCase());
    let id = existing ? existing.id : companyIdFrom(name);
    if (!existing) {
      if (companies.some(c => c.id === id)) id += "-" + Date.now();
      try {
        await createCompany(id, { name });
      } catch (err) {
        console.error(err);
        alert("Impossible de créer l'entreprise.");
        select.value = previous;
        return;
      }
      companies.push({ id, name });
      const created = document.createElement("option");
      created.value = id;
      created.textContent = name;
      select.insertBefore(created, opt);
    }
    select.value = id;
    previous = id;
  });
}

// Carte de demande en attente, réutilisée dans le panneau admin ET la cloche de notifications
function createPendingCard(u, companies, onDone) {
  const card = document.createElement("div");
  card.className = "info-card";
  card.innerHTML = `
    <div style="padding:14px 16px;">
      <p style="font-weight:600;font-size:13px;">${escapeHtml(adminNameOf(u))}</p>
      <p style="font-size:11px;color:#94a3b8;">${escapeHtml(u.email)}</p>
      <p style="font-size:12px;color:#64748b;">
        Demandé : ${u.requestedRole === "coworking" ? "Coworking" : "Salle de réunion"}
        ${u.companyNameHint ? " — " + escapeHtml(u.companyNameHint) : ""}
      </p>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <select class="approve-role" style="padding:6px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;">
          <option value="salle" ${u.requestedRole === "salle" ? "selected" : ""}>Salle de réunion</option>
          <option value="coworking" ${u.requestedRole === "coworking" ? "selected" : ""}>Coworking</option>
        </select>
        <select class="approve-company" style="padding:6px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;">
          <option value="">— Entreprise —</option>
          ${companies.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("")}
        </select>
        <button class="direct-btn approve-btn" style="margin-top:0;width:auto;padding:6px 12px;background:#166534;color:#fff;border:none;font-size:12px;">Valider</button>
        <button class="direct-btn reject-btn" style="margin-top:0;width:auto;padding:6px 12px;border-color:#dc2626;color:#dc2626;font-size:12px;">Refuser</button>
      </div>
    </div>`;
  enableNewCompanyOption(card.querySelector(".approve-company"), companies, u.companyNameHint || "");
  card.querySelector(".approve-btn").addEventListener("click", async () => {
    const role = card.querySelector(".approve-role").value;
    const companyId = card.querySelector(".approve-company").value.replace("__new__", "") || null;
    await approveUser(u.uid, role, role === "coworking" ? companyId : null);
    onDone();
  });
  card.querySelector(".reject-btn").addEventListener("click", async () => {
    await rejectUser(u.uid);
    onDone();
  });
  return card;
}

// Recherche dans la liste des comptes
let adminUsersCache = [];
let adminCompaniesCache = [];
document.getElementById("admin-search")?.addEventListener("input", () => renderAllUsersList());

export async function renderAdminPanel() {
  const pendingList = document.getElementById("admin-pending-list");
  const site        = adminSite();
  const companies   = await listCompanies();
  adminCompaniesCache = companies;

  const siteTitle = document.getElementById("admin-site-label");
  if (siteTitle) siteTitle.textContent = site ? "Site : " + siteLabel(site) : "Tous les sites (super-admin)";

  // Choix du site du nouvel admin : réservé au super-admin
  const newAdminSite = document.getElementById("new-admin-site");
  if (newAdminSite) {
    newAdminSite.hidden = !!site;
    if (!site) newAdminSite.innerHTML = siteOptionsHtml(PORTAIL.defaultSite);
  }

  const pending = await listPendingUsers(site);
  pendingList.innerHTML = pending.length
    ? ""
    : '<p style="color:#94a3b8;padding:12px;">Aucune demande en attente.</p>';

  pending.forEach(u => {
    pendingList.appendChild(createPendingCard(u, companies, () => {
      renderAdminPanel();
      refreshNotifBadge();
    }));
  });

  adminUsersCache = await listAllUsers(site);
  adminUsersCache.sort((a, b) => adminNameOf(a).localeCompare(adminNameOf(b), "fr"));
  renderAllUsersList();
  renderUnassignedTool();
}

/** Liste « Tous les comptes » : une carte par compte, avec un formulaire de correction. */
function renderAllUsersList() {
  const allList = document.getElementById("admin-all-list");
  const count   = document.getElementById("admin-all-count");
  const term    = (document.getElementById("admin-search")?.value || "").trim().toLowerCase();
  const companyNames = Object.fromEntries(adminCompaniesCache.map(c => [c.id, c.name]));

  const users = adminUsersCache.filter(u => {
    if (!term) return true;
    const haystack = [adminNameOf(u), u.email, companyNames[u.companyId], u.companyNameHint]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(term);
  });

  if (count) count.textContent = `(${users.length})`;
  allList.innerHTML = users.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucun compte.</p>';
  users.forEach(u => allList.appendChild(createUserCard(u, companyNames)));
}

function createUserCard(u, companyNames) {
  const card = document.createElement("div");
  card.className = "info-card";
  const companyName = companyNames[u.companyId] || u.companyNameHint || "Entreprise non renseignée";
  const statusColor = u.status === "approved" ? "#166534" : u.status === "rejected" ? "#dc2626" : "#c2410c";
  card.innerHTML = `
    <div class="info-item" style="gap:10px;">
      ${avatarHtml(u)}
      <span style="flex:1;min-width:0;">
        <b>${escapeHtml(adminNameOf(u))}</b> — ${escapeHtml(companyName)}<br>
        <span style="font-size:11px;color:#94a3b8;">
          ${escapeHtml(u.email)} — ${escapeHtml(ROLE_LABELS[u.role] || "Sans rôle")}
          · <span style="color:${statusColor};">${escapeHtml(STATUS_LABELS[u.status] || u.status || "—")}</span>
          ${adminSite() ? "" : " · " + escapeHtml(siteLabel(u.site))}
        </span>
      </span>
      <button class="direct-btn edit-user-btn" type="button" style="margin-top:0;width:auto;padding:6px 12px;font-size:12px;">Modifier</button>
    </div>
    <div class="edit-user-form" hidden style="padding:4px 18px 16px;"></div>`;

  const form = card.querySelector(".edit-user-form");
  card.querySelector(".edit-user-btn").addEventListener("click", () => {
    if (form.hidden) fillUserForm(form, u);
    form.hidden = !form.hidden;
  });
  return card;
}

function fillUserForm(form, u) {
  const isMe = session && u.uid === session.uid;
  const canChangeSite = !adminSite(); // seul le super-admin déplace un compte d'un site à l'autre
  const field = (label, html) => `<label class="profile-label">${label}</label>${html}`;
  const input = (cls, value, type = "text") =>
    `<input type="${type}" class="profile-input ${cls}" value="${escapeHtml(value || "")}"/>`;

  form.innerHTML = `
    <div style="display:flex;gap:8px;">
      <div style="flex:1;">${field("Prénom", input("f-firstname", u.firstName))}</div>
      <div style="flex:1;">${field("Nom", input("f-lastname", u.lastName))}</div>
    </div>
    ${field("Email (fiche)", input("f-email", u.email, "email"))}
    ${field("Entreprise déclarée", input("f-company-hint", u.companyNameHint))}
    ${field("Rôle", `<select class="profile-input f-role" ${isMe ? "disabled" : ""}>
      ${Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}" ${u.role === v ? "selected" : ""}>${l}</option>`).join("")}
      ${u.role ? "" : '<option value="" selected>— Sans rôle —</option>'}
    </select>`)}
    ${field("Entreprise coworking (pour le rôle Coworking)", `<select class="profile-input f-company">
      <option value="">— Aucune —</option>
      ${adminCompaniesCache.map(c => `<option value="${escapeHtml(c.id)}" ${u.companyId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
    </select>`)}
    ${field("Statut", `<select class="profile-input f-status" ${isMe ? "disabled" : ""}>
      ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${u.status === v ? "selected" : ""}>${l}</option>`).join("")}
    </select>`)}
    ${field("Site", canChangeSite
      ? `<select class="profile-input f-site">${siteOptionsHtml(u.site || "")}</select>`
      : `<input type="text" class="profile-input" value="${escapeHtml(siteLabel(u.site))}" readonly/>`)}
    ${isMe ? '<p class="profile-help">Pour éviter de perdre ton accès, ton propre rôle et ton statut ne sont pas modifiables ici.</p>' : ""}
    <p class="profile-help f-message" role="status" hidden></p>
    <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;">
      <button class="direct-btn f-save" type="button" style="margin-top:0;width:auto;padding:8px 14px;background:var(--navy);color:#fff;">Enregistrer</button>
      ${isMe ? "" : '<button class="direct-btn f-delete" type="button" style="margin-top:0;width:auto;padding:8px 14px;border-color:#dc2626;color:#dc2626;">Supprimer la fiche</button>'}
    </div>`;

  enableNewCompanyOption(form.querySelector(".f-company"), adminCompaniesCache, u.companyNameHint || "");
  const message = form.querySelector(".f-message");
  const showMessage = (text, isError) => {
    message.textContent = text;
    message.style.color = isError ? "#dc2626" : "#166534";
    message.hidden = false;
  };

  form.querySelector(".f-save").addEventListener("click", async () => {
    const role = form.querySelector(".f-role").value || null;
    const fields = {
      firstName: form.querySelector(".f-firstname").value.trim(),
      lastName: form.querySelector(".f-lastname").value.trim(),
      email: form.querySelector(".f-email").value.trim().toLowerCase(),
      companyNameHint: form.querySelector(".f-company-hint").value.trim(),
      companyId: role === "coworking" ? (form.querySelector(".f-company").value.replace("__new__", "") || null) : null
    };
    if (!isMe) {
      fields.role = role;
      fields.status = form.querySelector(".f-status").value;
    }
    if (canChangeSite) fields.site = form.querySelector(".f-site").value || null;
    if (!fields.email) { showMessage("L'email est obligatoire.", true); return; }
    if (canChangeSite && isMe && fields.site) {
      const ok = confirm(`Ton compte sera rattaché à ${siteLabel(fields.site)} : tu ne verras plus que les comptes de ce site. Continuer ?`);
      if (!ok) return;
    }
    try {
      await updateUser(u.uid, fields);
      Object.assign(u, fields);
      if (isMe) Object.assign(session.profile, fields);
      showMessage("Modifications enregistrées ✓", false);
      setTimeout(() => { renderAdminPanel(); refreshNotifBadge(); }, 800);
    } catch (err) {
      console.error(err);
      showMessage("Enregistrement impossible (droits insuffisants ?).", true);
    }
  });

  form.querySelector(".f-delete")?.addEventListener("click", async () => {
    if (!confirm(`Supprimer la fiche de ${adminNameOf(u)} ? La personne n'aura plus accès à son espace.`)) return;
    try {
      await deleteUserDoc(u.uid);
      renderAdminPanel();
      refreshNotifBadge();
    } catch (err) {
      console.error(err);
      showMessage("Suppression impossible (droits insuffisants ?).", true);
    }
  });
}

/** Super-admin : rattacher en une fois les comptes sans site (créés avant les sites) à un site. */
function renderUnassignedTool() {
  const box = document.getElementById("admin-unassigned");
  if (!box) return;
  const unassigned = adminSite() ? [] : adminUsersCache.filter(u => !u.site && u.role !== "admin");
  box.hidden = unassigned.length === 0;
  if (box.hidden) return;
  box.innerHTML = `
    <p style="font-size:13px;margin-bottom:8px;">
      <b>${unassigned.length} compte(s) client sans site.</b> Rattache-les à un site pour que son administrateur les voie.
    </p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      <select class="profile-input unassigned-site" style="width:auto;margin:0;">${siteOptionsHtml(PORTAIL.defaultSite)}</select>
      <button class="direct-btn unassigned-btn" type="button" style="margin-top:0;width:auto;padding:8px 14px;background:var(--navy);color:#fff;">Rattacher</button>
    </div>`;
  box.querySelector(".unassigned-btn").addEventListener("click", async () => {
    const site = box.querySelector(".unassigned-site").value;
    if (!site) return;
    await Promise.all(unassigned.map(u => updateUser(u.uid, { site })));
    renderAdminPanel();
  });
}

// ── Gestion des entreprises coworking ──────────────────
async function renderCompaniesPanel() {
  const list  = document.getElementById("companies-list");
  const count = document.getElementById("companies-count");
  const companies = await listCompanies();
  companies.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "fr"));
  // Nombre de comptes rattachés à chaque entreprise (parmi les comptes visibles par l'admin)
  const users = await listAllUsers(adminSite());
  const members = {};
  users.forEach(u => { if (u.companyId) members[u.companyId] = (members[u.companyId] || 0) + 1; });

  buildCompanyForm(document.getElementById("new-company-form"), null, renderCompaniesPanel);
  if (count) count.textContent = `(${companies.length})`;
  list.innerHTML = companies.length ? "" : '<p style="color:#94a3b8;padding:12px;">Aucune entreprise pour le moment.</p>';
  companies.forEach(c => list.appendChild(createCompanyCard(c, members[c.id] || 0)));
}

// Champs de la fiche entreprise (en plus du nom, des crédits et des couleurs)
const COMPANY_TEXT_FIELDS = [
  { key: "legalName",      label: "Raison sociale",             type: "text",     max: 150 },
  { key: "legalRepName",   label: "Représentant légal",         type: "text",     max: 100 },
  { key: "legalRepEmail",  label: "Mail du représentant légal", type: "email",    max: 150 },
  { key: "billingAddress", label: "Adresse de facturation",     type: "textarea", max: 300 },
  { key: "country",        label: "Pays",                       type: "text",     max: 60, placeholder: "France" },
  { key: "siret",          label: "Numéro de SIRET",            type: "text",     max: 20, placeholder: "14 chiffres" },
  { key: "vatNumber",      label: "Numéro de TVA",              type: "text",     max: 30, placeholder: "FR…" }
];

/**
 * Formulaire de fiche entreprise, pour la création (c = null) et la modification.
 * Crédits : postes négociés × crédits par poste, sauf ajustement à la main.
 */
function buildCompanyForm(container, c, onSaved) {
  const style = SPACE_STYLES.coworking;
  const data = c || {};
  const perSeatDefault = Number(PORTAIL.creditsPerSeat) || 0;
  const num = v => (v === undefined || v === null || v === "") ? "" : String(v);
  const fieldHtml = f => {
    const value = escapeHtml(data[f.key] || "");
    const ph = f.placeholder ? `placeholder="${escapeHtml(f.placeholder)}"` : "";
    const input = f.type === "textarea"
      ? `<textarea class="profile-input cf-${f.key}" maxlength="${f.max}" rows="2" ${ph}>${value}</textarea>`
      : `<input type="${f.type}" class="profile-input cf-${f.key}" maxlength="${f.max}" value="${value}" ${ph}/>`;
    return `<label class="profile-label">${f.label}</label>${input}`;
  };

  container.innerHTML = `
    <label class="profile-label">Nom de l'entreprise *</label>
    <input type="text" class="profile-input cf-name" maxlength="100" value="${escapeHtml(data.name || "")}"/>
    ${COMPANY_TEXT_FIELDS.map(fieldHtml).join("")}

    <h4 style="font-size:13px;font-weight:700;margin:18px 0 0;">Contrat et crédits</h4>
    <div style="display:flex;gap:8px;">
      <div style="flex:1;"><label class="profile-label">Postes négociés</label>
        <input type="number" min="0" step="1" class="profile-input cf-seats" value="${num(data.seats)}"/></div>
      <div style="flex:1;"><label class="profile-label">Crédits par poste</label>
        <input type="number" min="0" step="1" class="profile-input cf-per-seat" value="${num(data.creditsPerSeat ?? perSeatDefault)}"/></div>
    </div>
    <label class="profile-label">Nombre de crédits</label>
    <input type="number" min="0" step="1" class="profile-input cf-credits" value="${num(data.credits)}"/>
    <label style="display:flex;gap:8px;align-items:center;font-size:12px;margin-top:6px;">
      <input type="checkbox" class="cf-manual" ${data.creditsManual ? "checked" : ""}/> Ajuster les crédits à la main (sinon postes × crédits par poste)
    </label>

    <div style="display:flex;gap:8px;">
      <div style="flex:1;"><label class="profile-label">Couleur du badge</label>
        <input type="color" class="profile-input cf-color" style="padding:4px;height:44px;" value="${escapeHtml(data.color || style.color)}"/></div>
      <div style="flex:1;"><label class="profile-label">Couleur du texte</label>
        <input type="color" class="profile-input cf-text-color" style="padding:4px;height:44px;" value="${escapeHtml(data.textColor || style.textColor)}"/></div>
    </div>
    <p class="profile-help cf-message" role="status" hidden></p>
    <button class="direct-btn cf-save" type="button" style="margin-top:12px;width:auto;padding:8px 14px;background:var(--navy);color:#fff;">${c ? "Enregistrer" : "Ajouter l'entreprise"}</button>`;

  const $ = sel => container.querySelector(sel);
  const creditsInput = $(".cf-credits");
  const manual = $(".cf-manual");
  const toInt = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; };
  function recomputeCredits() {
    creditsInput.readOnly = !manual.checked;
    if (manual.checked) return;
    const seats = toInt($(".cf-seats").value);
    const perSeat = toInt($(".cf-per-seat").value);
    creditsInput.value = seats !== null && perSeat !== null ? seats * perSeat : "";
  }
  $(".cf-seats").addEventListener("input", recomputeCredits);
  $(".cf-per-seat").addEventListener("input", recomputeCredits);
  manual.addEventListener("change", recomputeCredits);
  recomputeCredits();

  const showMessage = (text, isError) => {
    const m = $(".cf-message");
    m.textContent = text;
    m.style.color = isError ? "#dc2626" : "#166534";
    m.hidden = false;
  };

  $(".cf-save").addEventListener("click", async () => {
    const fields = { name: $(".cf-name").value.trim() };
    COMPANY_TEXT_FIELDS.forEach(f => { fields[f.key] = $(".cf-" + f.key).value.trim(); });
    fields.siret = fields.siret.replace(/\s+/g, "");
    fields.vatNumber = fields.vatNumber.replace(/\s+/g, "").toUpperCase();
    fields.seats = toInt($(".cf-seats").value);
    fields.creditsPerSeat = toInt($(".cf-per-seat").value);
    fields.credits = toInt(creditsInput.value);
    fields.creditsManual = manual.checked;
    fields.color = $(".cf-color").value;
    fields.textColor = $(".cf-text-color").value;

    if (!fields.name) { showMessage("Le nom de l'entreprise est obligatoire.", true); return; }
    if (fields.siret && !/^\d{14}$/.test(fields.siret)) { showMessage("Le SIRET doit contenir 14 chiffres.", true); return; }
    if (fields.legalRepEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.legalRepEmail)) { showMessage("Le mail du représentant légal n'est pas valide.", true); return; }

    try {
      if (c) {
        await updateCompany(c.id, fields);
      } else {
        const companies = await listCompanies();
        if (companies.some(x => (x.name || "").toLowerCase() === fields.name.toLowerCase())) {
          showMessage("Cette entreprise existe déjà.", true);
          return;
        }
        let id = companyIdFrom(fields.name);
        if (companies.some(x => x.id === id)) id += "-" + Date.now();
        await createCompany(id, fields);
      }
      onSaved();
    } catch (err) {
      console.error(err);
      showMessage("Enregistrement impossible.", true);
    }
  });
}

function createCompanyCard(c, memberCount) {
  const style = SPACE_STYLES.coworking;
  const color = c.color || style.color;
  const textColor = c.textColor || style.textColor;
  const details = [
    c.legalName,
    c.seats != null ? `${c.seats} poste(s)` : "",
    c.credits != null ? `${c.credits} crédit(s)` : "",
    `${memberCount} compte(s)`
  ].filter(Boolean).join(" · ");
  const card = document.createElement("div");
  card.className = "info-card";
  card.innerHTML = `
    <div class="info-item" style="gap:10px;">
      <span class="company-badge" style="width:32px;height:32px;font-size:11px;background-color:${escapeHtml(color)};color:${escapeHtml(textColor)};">${escapeHtml(initialsOf({ firstName: c.name || c.id }))}</span>
      <span style="flex:1;min-width:0;">
        <b>${escapeHtml(c.name || c.id)}</b><br>
        <span style="font-size:11px;color:#94a3b8;">${escapeHtml(details)}</span>
      </span>
      <button class="direct-btn edit-company-btn" type="button" style="margin-top:0;width:auto;padding:6px 12px;font-size:12px;">Modifier</button>
    </div>
    <div class="edit-company-form" hidden style="padding:4px 18px 16px;"></div>`;

  const form = card.querySelector(".edit-company-form");
  card.querySelector(".edit-company-btn").addEventListener("click", () => {
    if (form.hidden) buildCompanyForm(form, c, renderCompaniesPanel);
    form.hidden = !form.hidden;
  });
  return card;
}

// ── Cloche de notifications ────────────────────────────
const notifBellWrap = document.getElementById("notif-bell-wrap");
const notifBellBtn  = document.getElementById("notif-bell-btn");
const notifBadge    = document.getElementById("notif-badge");
const notifDropdown = document.getElementById("notif-dropdown");

async function refreshNotifBadge() {
  if (!notifBadge) return;
  const pending = await listPendingUsers(adminSite());
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
  const pending = await listPendingUsers(adminSite());
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
          <p style="font-weight:600;font-size:13px;">${escapeHtml(o.name || o.email)}${o.companyName ? " — " + escapeHtml(o.companyName) : ""}</p>
          <p style="font-size:12px;color:#64748b;">${dateFmt} · ${escapeHtml(o.people)} pers. · ${escapeHtml(o.price)} €</p>
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

/**
 * Page « Mon contrat » du client coworking : fiche de son entreprise en lecture seule
 * (saisie par Hiptown dans Gestion des entreprises).
 */
function renderMyContract() {
  const box = document.getElementById("contrat-content");
  if (!box || !session) return;
  const c = session.company;
  if (!c) {
    box.innerHTML = `<p style="color:#94a3b8;padding:12px;">Aucun contrat rattaché à votre compte pour le moment. Contactez l'équipe Hiptown.</p>`;
    return;
  }
  const row = (label, value) => (value === undefined || value === null || value === "") ? "" :
    `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
       <span style="color:var(--text-soft);font-size:13px;">${label}</span>
       <span style="font-weight:600;font-size:13px;text-align:right;white-space:pre-line;">${escapeHtml(value)}</span></div>`;
  const card = (title, rows) => rows ? `<div class="info-card" style="padding:12px 18px;margin-bottom:12px;">
       <div class="info-card-title" style="margin-bottom:4px;">${title}</div>${rows}</div>` : "";
  box.innerHTML =
    card("Contrat", row("Entreprise", c.name) + row("Postes", c.seats) +
      row("Crédits par mois", c.credits != null ? c.credits + " crédit(s)" : "")) +
    card("Facturation", row("Raison sociale", c.legalName) + row("Représentant légal", c.legalRepName) +
      row("Mail du représentant", c.legalRepEmail) + row("Adresse de facturation", c.billingAddress) +
      row("Pays", c.country) + row("SIRET", c.siret) + row("N° de TVA", c.vatNumber)) +
    `<p style="font-size:12px;color:var(--text-pale);margin-top:6px;">Une information à corriger ? Contactez l'équipe Hiptown.</p>`;
}

// Déclenché par app.js via : document.dispatchEvent(new CustomEvent("hiptown-tile-action", { detail: tile.action }))
document.addEventListener("hiptown-tile-action", (e) => {
  if (e.detail === "gestion") openGestionMenu();
  if (e.detail === "contrat") renderMyContract();
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
  // Un admin de site crée des admins pour son site ; le super-admin choisit le site
  const siteSelect = document.getElementById("new-admin-site");
  const site = adminSite() || (siteSelect ? siteSelect.value || null : null);
  try {
    await adminCreateAccount(email, password, "admin", null, firstName, lastName, site);
  } catch (err) {
    alert(friendlyError(err));
    return;
  }
  document.getElementById("new-admin-email").value = "";
  document.getElementById("new-admin-password").value = "";
  document.getElementById("new-admin-firstname").value = "";
  document.getElementById("new-admin-lastname").value = "";
  renderAdminPanel();
});
