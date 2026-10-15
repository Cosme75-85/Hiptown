// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Messagerie
//  Chaque client (coworking ou salle de réunion) a UNE conversation avec
//  l'équipe Hiptown de sa ville. L'équipe voit les conversations de son
//  périmètre (comme « Gestion des comptes ») : l'admin général voit toutes
//  les villes, un admin de ville la sienne, un employé les clients de ses sites.
//
//  Firestore (voir firestore.rules) :
//    conversations/{uid du client}            → dernier message, non-lus, ville et site
//    conversations/{uid du client}/messages/… → les messages
//  Les messages arrivent en temps réel (onSnapshot), sans recharger la page.
//
//  Email : après chaque message, l'outil de réservation (reservation/Messagerie.gs)
//  prévient l'équipe de la ville (ex. bordeaux@hiptown.com) ou, pour une réponse
//  de l'équipe, le client.
// ═══════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, query, where, orderBy, limitToLast, onSnapshot, writeBatch, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAX_LENGTH = 2000;          // caractères par message (même limite dans firestore.rules)
const PREVIEW_LENGTH = 120;       // aperçu du dernier message (boîte de réception)
const SHOWN_MESSAGES = 200;       // derniers messages affichés d'une conversation
const PAGE_HASH = "#messagerie";  // lien des emails : ouvre directement la messagerie

const $ = id => document.getElementById(id);

let me = null;             // { uid, space, name, company, email, site, siteId, scope }
let inbox = [];            // équipe : conversations de son périmètre
let openUid = null;        // conversation affichée (uid du client)
let openConv = null;       // sa fiche (dernier message, non-lus...)
let openConvOwn = null;    // client : sa propre conversation (pour la pastille)
let stopInbox = null;      // désabonnements temps réel
let stopMessages = null;
let stopOwnConv = null;
let sending = false;

const isTeam = () => me?.space === "hiptown";

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function cityName(cityId) {
  return PORTAIL.cities?.[cityId]?.name || cityId || "";
}

function siteName(cityId, siteId) {
  return (siteId && PORTAIL.cities?.[cityId]?.sites?.[siteId]) || "";
}

function toDate(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate() : null;
}

/** « 14:32 » aujourd'hui, « hier », sinon « 12 oct. ». */
function shortWhen(date) {
  if (!date) return "";
  const now = new Date();
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, now)) return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "hier";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function longWhen(date) {
  if (!date) return "envoi…";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    + " à " + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ── Pastille « non lu » sur la tuile Messagerie ──
function unreadCount() {
  if (!me) return 0;
  if (isTeam()) return inbox.filter(c => c.unreadTeam).length;
  return openConvOwn?.unreadClient ? 1 : 0;
}

function applyBadge() {
  const tile = document.querySelector('#tiles-grid .tile[data-id="messages"], #tiles-grid .tile[data-id="msgteam"]');
  if (!tile) return;
  let badge = tile.querySelector(".tile-badge");
  const n = unreadCount();
  if (!n) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "tile-badge";
    tile.appendChild(badge);
  }
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.title = isTeam() ? n + " conversation(s) non lue(s)" : "Nouveau message de l'équipe Hiptown";
}

// ── Abonnements temps réel ──
function stopAll() {
  [stopInbox, stopMessages, stopOwnConv].forEach(stop => stop && stop());
  stopInbox = stopMessages = stopOwnConv = null;
  inbox = []; openUid = null; openConv = null; openConvOwn = null;
}

/** Requête de la boîte de réception, au même périmètre que les règles Firestore (voir admin.js). */
function inboxQuery(scope) {
  const filters = [];
  if (scope?.city) filters.push(where("site", "==", scope.city));
  if (scope?.siteIds) {
    if (!scope.siteIds.length) return null;
    filters.push(where("siteId", "in", scope.siteIds.slice(0, 30)));
  }
  return query(collection(db, "conversations"), ...filters);
}

function watchInbox() {
  const q = inboxQuery(me.scope);
  if (!q) { inbox = []; renderInbox(); return; }
  stopInbox = onSnapshot(q, snap => {
    inbox = snap.docs.map(d => ({ uid: d.id, ...d.data({ serverTimestamps: "estimate" }) }))
      .sort((a, b) => (toDate(b.lastAt)?.getTime() || 0) - (toDate(a.lastAt)?.getTime() || 0));
    renderInbox();
    applyBadge();
    if (openUid) {
      openConv = inbox.find(c => c.uid === openUid) || openConv;
      renderHeader();
      if (openConv?.unreadTeam && isVisible()) markRead();
    }
  }, err => {
    console.error(err);
    $("msg-inbox-list").innerHTML = '<p class="msg-empty" style="color:#dc2626;">Messagerie indisponible pour le moment. Réessayez plus tard.</p>';
  });
}

function watchOwnConversation() {
  stopOwnConv = onSnapshot(doc(db, "conversations", me.uid), snap => {
    openConvOwn = snap.exists() ? snap.data() : null;
    if (openUid === me.uid) openConv = openConvOwn;
    applyBadge();
    // Conversation affichée : les messages de l'équipe sont lus
    if (openUid === me.uid && openConvOwn?.unreadClient && isVisible()) markRead();
  }, err => console.error(err));
}

function isVisible() {
  return !$("step-messagerie").hidden && !$("msg-thread").hidden;
}

// ── Affichage ──
function renderInbox() {
  const list = $("msg-inbox-list");
  if (!list) return;
  if (!inbox.length) {
    list.innerHTML = '<p class="msg-empty">Aucune conversation pour le moment. Les messages des clients apparaîtront ici.</p>';
    return;
  }
  const showCity = !me.scope; // admin général : toutes les villes
  list.innerHTML = inbox.map(c => {
    const place = [showCity ? cityName(c.site) : "", siteName(c.site, c.siteId)].filter(Boolean).join(" · ");
    const who = c.lastFrom === "team" ? "Hiptown : " : "";
    return `<button type="button" class="msg-conv${c.unreadTeam ? " unread" : ""}" data-uid="${escapeHtml(c.uid)}">
      <span class="msg-conv-top">
        <span class="msg-conv-name">${escapeHtml(c.clientName || c.clientEmail || "Client")}</span>
        <span class="msg-conv-when">${escapeHtml(shortWhen(toDate(c.lastAt)))}</span>
      </span>
      <span class="msg-conv-sub">${escapeHtml([c.clientCompany, c.clientRole === "salle" ? "Salle de réunion" : "Coworking", place].filter(Boolean).join(" · "))}</span>
      <span class="msg-conv-last">${escapeHtml(who + (c.lastText || ""))}</span>
    </button>`;
  }).join("");
}

function renderHeader() {
  const title = $("msg-thread-title");
  const sub = $("msg-thread-sub");
  if (isTeam()) {
    const c = openConv || {};
    title.textContent = c.clientName || c.clientEmail || "Client";
    sub.textContent = [c.clientCompany, c.clientEmail, siteName(c.site, c.siteId) || cityName(c.site)].filter(Boolean).join(" · ");
  } else {
    title.textContent = "Équipe Hiptown" + (cityName(me.site) ? " " + cityName(me.site) : "");
    sub.textContent = "Posez votre question : l'équipe vous répond ici, et vous recevez aussi un email.";
  }
}

function renderMessages(messages) {
  const box = $("msg-list");
  if (!messages.length) {
    box.innerHTML = isTeam()
      ? '<p class="msg-empty">Aucun message.</p>'
      : '<p class="msg-empty">Aucun message pour le moment. Écrivez à l\'équipe Hiptown : demande, question, souci sur place…</p>';
    return;
  }
  const mine = isTeam() ? "team" : "client";
  box.innerHTML = messages.map(m => {
    const own = m.from === mine;
    const author = own ? "" : (m.from === "team" ? (m.authorName || "Équipe") + " · Hiptown" : (m.authorName || "Client"));
    // Équipe : on voit aussi quel collègue a répondu
    const teamAuthor = own && isTeam() && m.authorUid !== me.uid ? (m.authorName || "Équipe") + " · " : "";
    return `<div class="msg-bubble ${own ? "own" : "other"}">
      ${author ? `<div class="msg-author">${escapeHtml(author)}</div>` : ""}
      <div class="msg-text">${escapeHtml(m.text)}</div>
      <div class="msg-time">${escapeHtml(teamAuthor + longWhen(toDate(m.createdAt)))}</div>
    </div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

// ── Navigation ──
function showPage() {
  window.hideAll();
  $("step-messagerie").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showInbox() {
  closeThread();
  $("msg-inbox").hidden = false;
  $("msg-thread").hidden = true;
  $("messagerie-title").textContent = "💬 Messagerie";
  renderInbox();
}

function closeThread() {
  if (stopMessages) stopMessages();
  stopMessages = null;
  openUid = null;
}

function openThread(uid) {
  closeThread();
  openUid = uid;
  openConv = isTeam() ? (inbox.find(c => c.uid === uid) || null) : openConvOwn;
  $("msg-inbox").hidden = true;
  $("msg-thread").hidden = false;
  $("messagerie-title").textContent = "💬 Messagerie";
  $("msg-error").hidden = true;
  $("msg-list").innerHTML = '<p class="msg-empty">Chargement…</p>';
  renderHeader();
  const q = query(collection(db, "conversations", uid, "messages"), orderBy("createdAt"), limitToLast(SHOWN_MESSAGES));
  stopMessages = onSnapshot(q, snap => {
    if (openUid !== uid) return;
    renderMessages(snap.docs.map(d => d.data({ serverTimestamps: "estimate" })));
  }, err => {
    console.error(err);
    $("msg-list").innerHTML = '<p class="msg-empty" style="color:#dc2626;">Impossible d\'afficher cette conversation.</p>';
  });
  markRead();
  setTimeout(() => $("msg-input").focus(), 50);
}

/** Ouvre la messagerie : la conversation du client, ou la boîte de réception de l'équipe. */
function openMessagerie() {
  if (!me) return;
  showPage();
  if (isTeam()) showInbox();
  else openThread(me.uid);
}

async function markRead() {
  if (!openUid) return;
  const field = isTeam() ? "unreadTeam" : "unreadClient";
  if (!openConv || !openConv[field]) return;
  openConv[field] = false; // évite d'écrire deux fois
  try {
    await updateDoc(doc(db, "conversations", openUid), { [field]: false });
  } catch (err) {
    console.error(err);
  }
}

// ── Envoi ──
async function send() {
  if (sending || !me || !openUid) return;
  const input = $("msg-input");
  const text = input.value.trim();
  if (!text) return;
  if (text.length > MAX_LENGTH) return showError("Message trop long (" + MAX_LENGTH + " caractères au plus).");
  sending = true;
  $("msg-send").disabled = true;
  $("msg-error").hidden = true;

  const convRef = doc(db, "conversations", openUid);
  const msgRef = doc(collection(db, "conversations", openUid, "messages"));
  const batch = writeBatch(db);
  const preview = text.replace(/\s+/g, " ").slice(0, PREVIEW_LENGTH);
  batch.set(msgRef, {
    from: isTeam() ? "team" : "client",
    authorUid: me.uid,
    authorName: me.name,
    text,
    createdAt: serverTimestamp()
  });
  if (isTeam()) {
    batch.update(convRef, {
      lastText: preview, lastFrom: "team", lastAt: serverTimestamp(), unreadTeam: false, unreadClient: true
    });
  } else {
    // La ville et le site viennent de la fiche du client : sa conversation le suit s'il change de site
    batch.set(convRef, {
      uid: me.uid,
      site: me.site,
      siteId: me.siteId,
      clientName: me.name,
      clientCompany: me.company,
      clientEmail: me.email,
      clientRole: me.space,
      lastText: preview, lastFrom: "client", lastAt: serverTimestamp(), unreadTeam: true, unreadClient: false
    }, { merge: true });
  }

  try {
    await batch.commit();
    input.value = "";
    autoGrow();
  } catch (err) {
    console.error(err);
    showError("Message non envoyé. Vérifiez votre connexion et réessayez.");
    sending = false;
    $("msg-send").disabled = false;
    return;
  }
  sending = false;
  $("msg-send").disabled = false;
  notifyByEmail(openUid, msgRef.id);
}

/** Email à l'équipe de la ville (ou au client) : sans attendre, un échec n'empêche pas le message. */
async function notifyByEmail(convUid, messageId) {
  try {
    const idToken = await auth.currentUser.getIdToken();
    await fetch(PORTAIL.reservationUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
      body: JSON.stringify({ action: "notifyNewMessage", idToken, payload: { conversationId: convUid, messageId } })
    });
  } catch (err) {
    console.error("Email de la messagerie non envoyé", err);
  }
}

function showError(text) {
  const el = $("msg-error");
  el.textContent = text;
  el.hidden = false;
}

function autoGrow() {
  const input = $("msg-input");
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
  $("msg-count").textContent = input.value.length > MAX_LENGTH - 200 ? input.value.length + " / " + MAX_LENGTH : "";
}

// ── Évènements ──
document.addEventListener("hiptown-dashboard", e => {
  const d = e.detail || {};
  stopAll();
  if (!d.uid || !["salle", "coworking", "hiptown"].includes(d.space)) { me = null; return; }
  const c = d.contact || {};
  me = {
    uid: d.uid,
    space: d.space,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "",
    company: c.company || "",
    email: c.email || "",
    site: d.place?.site || null,
    siteId: d.place?.siteId || null,
    scope: d.scope || null
  };
  if (isTeam()) watchInbox();
  else watchOwnConversation();
  applyBadge();
  // Lien d'un email de notification : on ouvre directement la messagerie
  if (location.hash === PAGE_HASH) {
    history.replaceState(null, "", location.pathname + location.search);
    openMessagerie();
  }
});

onAuthStateChanged(auth, user => {
  if (!user) { stopAll(); me = null; }
});

document.addEventListener("hiptown-tile-action", e => {
  if (e.detail === "messages") openMessagerie();
});

$("msg-inbox-list").addEventListener("click", e => {
  const btn = e.target.closest("[data-uid]");
  if (btn) openThread(btn.dataset.uid);
});

$("msg-form").addEventListener("submit", e => {
  e.preventDefault();
  send();
});

// Entrée envoie, Maj+Entrée va à la ligne (sur ordinateur)
$("msg-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer: fine)").matches) {
    e.preventDefault();
    send();
  }
});
$("msg-input").addEventListener("input", autoGrow);

// Retour : l'équipe revient à sa boîte de réception, le client au tableau de bord
$("back-from-messagerie").addEventListener("click", () => {
  if (isTeam() && !$("msg-thread").hidden) {
    showInbox();
    return;
  }
  closeThread();
  window.hideAll();
  $("step-dashboard").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Messages lus quand on revient sur l'onglet avec la conversation ouverte
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isVisible()) markRead();
});

// Le tableau de bord est reconstruit à chaque affichage : on remet la pastille
new MutationObserver(applyBadge).observe($("tiles-grid"), { childList: true });
