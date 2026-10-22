// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Messagerie
//  Trois sortes de discussions :
//   1. Client ↔ équipe Hiptown : chaque client (coworking ou salle de réunion) a UNE
//      conversation avec l'équipe de sa ville. L'équipe voit les conversations de son
//      périmètre (comme « Gestion des comptes ») : l'admin général toutes les villes,
//      un admin de ville la sienne, un employé les clients de ses sites.
//   2. Entre collègues d'une entreprise coworking : une discussion par entreprise,
//      réservée à ses coworkers (l'équipe Hiptown n'y a pas accès).
//   3. Équipe Hiptown : une discussion interne par ville (l'admin général les voit toutes).
//
//  Firestore (voir firestore.rules) :
//    conversations/{uid du client}(/messages)  → 1. dernier message, non-lus, ville et site
//    channels/company-{id entreprise}(/messages) → 2.
//    channels/team-{ville}(/messages)            → 3.
//  Les messages arrivent en temps réel (onSnapshot), sans recharger la page.
//  Discussions de groupe : « lu jusqu'à » gardé sur l'appareil (localStorage).
//
//  Email (1. seulement) : après chaque message, l'outil de réservation
//  (reservation/Messagerie.gs) prévient l'équipe de la ville (ex. bordeaux@hiptown.com)
//  ou, pour une réponse de l'équipe, le client.
//  Notifications (toutes les discussions) : chaque appareil qui les accepte enregistre son
//  jeton dans pushTokens/{uid} ; le même script envoie la notification aux destinataires
//  (Firebase Cloud Messaging), reçue par sw.js même quand l'application est fermée.
//  Pastille : nombre de messages non lus, sur la tuile et sur l'icône de l'application.
// ═══════════════════════════════════════════════════════

import { app, auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, query, where, orderBy, limitToLast, onSnapshot, writeBatch, updateDoc, serverTimestamp,
  getDoc, setDoc, increment, getCountFromServer, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getMessaging, getToken, deleteToken, isSupported
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const MAX_LENGTH = 2000;          // caractères par message (même limite dans firestore.rules)
const PREVIEW_LENGTH = 120;       // aperçu du dernier message (listes)
const SHOWN_MESSAGES = 200;       // derniers messages affichés d'une discussion
const PAGE_HASH = "#messagerie";  // lien des emails : ouvre directement la messagerie

const $ = id => document.getElementById(id);

let me = null;             // { uid, space, name, company, companyId, email, site, siteId, scope }
let inbox = [];            // équipe : conversations clients de son périmètre
let ownConv = null;        // client : sa conversation avec l'équipe Hiptown
let channels = [];         // discussions de groupe : [{ id, title, sub, data }]
let current = null;        // discussion affichée : { kind: "direct", id: uid } ou { kind: "channel", id }
let currentConv = null;    // conversation client affichée (dernier message, non-lus...)
let stops = [];            // désabonnements temps réel (listes)
let stopMessages = null;   // désabonnement de la discussion affichée
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

// ── Discussions de groupe : « lu jusqu'à », gardé sur l'appareil ──
function readKey(channelId) {
  return "hiptown-lu:" + me.uid + ":" + channelId;
}

function lastRead(channelId) {
  try { return Number(localStorage.getItem(readKey(channelId))) || 0; } catch (err) { return 0; }
}

function markChannelRead(channelId) {
  const ch = channels.find(c => c.id === channelId);
  const at = toDate(ch?.data?.lastAt)?.getTime() || Date.now();
  try { localStorage.setItem(readKey(channelId), String(Math.max(at, lastRead(channelId)))); } catch (err) { /* navigation privée */ }
  if (ch) ch.unread = 0;
}

/** Nombre de messages d'une discussion de groupe arrivés depuis la dernière lecture (sur cet appareil). */
async function countChannelUnread(ch) {
  const d = ch.data;
  if (!d || !d.lastAt || d.lastAuthorUid === me.uid || (toDate(d.lastAt)?.getTime() || 0) <= lastRead(ch.id)) {
    ch.unread = 0;
    return;
  }
  try {
    const q = query(collection(db, "channels", ch.id, "messages"), where("createdAt", ">", Timestamp.fromMillis(lastRead(ch.id))));
    ch.unread = (await getCountFromServer(q)).data().count;
  } catch (err) {
    console.error(err);
    ch.unread = 1;
  }
}

/** Messages non lus d'une conversation client ↔ équipe (anciennes conversations : 1 si non lue). */
function directUnread(conv, side) {
  if (!conv || !conv["unread" + side]) return 0;
  return conv["unread" + side + "Count"] || 1;
}

/** Discussions de groupe du compte connecté (mêmes conditions que firestore.rules). */
function groupChannels() {
  if (isTeam()) {
    // Admin général : toutes les villes ; sinon la sienne
    const cities = me.scope ? [me.scope.city] : Object.keys(PORTAIL.cities || {});
    return cities.map(city => ({
      id: "team-" + city,
      title: "Équipe Hiptown " + cityName(city),
      sub: "Discussion interne de l'équipe"
    }));
  }
  if (me.space === "coworking" && me.companyId) {
    return [{ id: "company-" + me.companyId, title: me.company || "Mon entreprise", sub: "Discussion entre collègues" }];
  }
  return [];
}

// ── Pastille « non lu » sur la tuile Messagerie ──
function unreadCount() {
  if (!me) return 0;
  const direct = isTeam()
    ? inbox.reduce((sum, c) => sum + directUnread(c, "Team"), 0)
    : directUnread(ownConv, "Client");
  return direct + channels.reduce((sum, ch) => sum + (ch.unread || 0), 0);
}

// ── Pastille sur l'icône de l'application installée (téléphone, ordinateur) ──
// Le nombre est aussi rangé dans le cache de sw.js, qui l'augmente à chaque
// notification reçue quand l'application est fermée.
const BADGE_CACHE = "hiptown-v1";
const BADGE_KEY = "./__badge";

async function setAppBadge(n) {
  try {
    if (n > 0 && navigator.setAppBadge) await navigator.setAppBadge(n);
    else if (navigator.clearAppBadge) await navigator.clearAppBadge();
  } catch (err) { /* non pris en charge */ }
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put(BADGE_KEY, new Response(String(n)));
  } catch (err) { /* navigation privée */ }
}

function applyBadge() {
  const n = unreadCount();
  if (me) setAppBadge(n);
  const tile = document.querySelector('#tiles-grid .tile[data-id="messages"], #tiles-grid .tile[data-id="msgteam"]');
  if (!tile) return;
  let badge = tile.querySelector(".tile-badge");
  if (!n) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "tile-badge";
    tile.appendChild(badge);
  }
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.title = n + " message(s) non lu(s)";
}

function refresh() {
  applyBadge();
  if (!$("msg-inbox").hidden) renderInbox();
}

// ── Abonnements temps réel ──
function stopAll() {
  stops.forEach(stop => stop());
  if (stopMessages) stopMessages();
  stops = []; stopMessages = null;
  inbox = []; ownConv = null; channels = []; current = null; currentConv = null;
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
  if (!q) return;
  stops.push(onSnapshot(q, snap => {
    inbox = snap.docs.map(d => ({ uid: d.id, ...d.data({ serverTimestamps: "estimate" }) }))
      .sort((a, b) => (toDate(b.lastAt)?.getTime() || 0) - (toDate(a.lastAt)?.getTime() || 0));
    if (current?.kind === "direct") {
      currentConv = inbox.find(c => c.uid === current.id) || currentConv;
      renderHeader();
      if (directUnread(currentConv, "Team") && isVisible()) markDirectRead();
    }
    refresh();
  }, err => console.error(err)));
}

function watchOwnConversation() {
  stops.push(onSnapshot(doc(db, "conversations", me.uid), snap => {
    ownConv = snap.exists() ? snap.data() : null;
    if (current?.kind === "direct") currentConv = ownConv;
    // Conversation affichée : les messages de l'équipe sont lus
    if (current?.kind === "direct" && directUnread(ownConv, "Client") && isVisible()) markDirectRead();
    refresh();
  }, err => console.error(err)));
}

function watchChannels() {
  channels.forEach(ch => {
    stops.push(onSnapshot(doc(db, "channels", ch.id), async snap => {
      ch.data = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
      // Discussion affichée, ou dernier message écrit par soi : tout est lu
      if ((current?.kind === "channel" && current.id === ch.id && isVisible()) || ch.data?.lastAuthorUid === me.uid) {
        markChannelRead(ch.id);
      }
      await countChannelUnread(ch);
      refresh();
    }, err => console.error(err)));
  });
}

function isVisible() {
  return !$("step-messagerie").hidden && !$("msg-thread").hidden && document.visibilityState === "visible";
}

// ── Liste des discussions ──
function itemHtml({ kind, id, name, when, sub, last, unread }) {
  return `<button type="button" class="msg-conv${unread ? " unread" : ""}" data-kind="${kind}" data-id="${escapeHtml(id)}">
    <span class="msg-conv-top">
      <span class="msg-conv-name">${escapeHtml(name)}</span>
      <span class="msg-conv-when">${escapeHtml(when)}</span>
    </span>
    ${sub ? `<span class="msg-conv-sub">${escapeHtml(sub)}</span>` : ""}
    <span class="msg-conv-last">${escapeHtml(last)}</span>
  </button>`;
}

function channelItem(ch) {
  const d = ch.data || {};
  const who = !d.lastAuthorUid ? "" : (d.lastAuthorUid === me.uid ? "Vous" : (d.lastAuthorName || "")) + " : ";
  return itemHtml({ kind: "channel", id: ch.id, name: ch.title, when: shortWhen(toDate(d.lastAt)), sub: ch.sub,
    last: d.lastText ? who + d.lastText : "Aucun message pour le moment", unread: ch.unread > 0 });
}

function renderInbox() {
  const list = $("msg-inbox-list");
  const parts = [];
  if (isTeam()) {
    parts.push('<h3 class="msg-section">Équipe</h3>', channels.map(channelItem).join(""));
    parts.push('<h3 class="msg-section">Clients</h3>');
    if (!inbox.length) {
      parts.push('<p class="msg-empty">Aucune conversation client pour le moment. Les messages des clients apparaîtront ici.</p>');
    }
    const showCity = !me.scope; // admin général : toutes les villes
    parts.push(inbox.map(c => itemHtml({
      kind: "direct", id: c.uid,
      name: c.clientName || c.clientEmail || "Client",
      when: shortWhen(toDate(c.lastAt)),
      sub: [c.clientCompany, c.clientRole === "salle" ? "Salle de réunion" : "Coworking",
        showCity ? cityName(c.site) : "", siteName(c.site, c.siteId)].filter(Boolean).join(" · "),
      last: (c.lastFrom === "team" ? "Hiptown : " : "") + (c.lastText || ""),
      unread: directUnread(c, "Team") > 0
    })).join(""));
  } else {
    parts.push(itemHtml({
      kind: "direct", id: me.uid,
      name: "Équipe Hiptown" + (cityName(me.site) ? " " + cityName(me.site) : ""),
      when: shortWhen(toDate(ownConv?.lastAt)),
      sub: "Une question, une demande : écrivez-nous",
      last: ownConv ? (ownConv.lastFrom === "team" ? "Hiptown : " : "Vous : ") + ownConv.lastText : "Aucun message pour le moment",
      unread: directUnread(ownConv, "Client") > 0
    }));
    parts.push(channels.map(channelItem).join(""));
  }
  list.innerHTML = parts.join("");
}

// ── Discussion affichée ──
function renderHeader() {
  const title = $("msg-thread-title");
  const sub = $("msg-thread-sub");
  if (current?.kind === "channel") {
    const ch = channels.find(c => c.id === current.id) || {};
    title.textContent = ch.title || "";
    sub.textContent = ch.sub || "";
  } else if (isTeam()) {
    const c = currentConv || {};
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
    box.innerHTML = current.kind === "channel"
      ? '<p class="msg-empty">Aucun message pour le moment. Lancez la discussion !</p>'
      : (isTeam()
        ? '<p class="msg-empty">Aucun message.</p>'
        : '<p class="msg-empty">Aucun message pour le moment. Écrivez à l\'équipe Hiptown : demande, question, souci sur place…</p>');
    return;
  }
  box.innerHTML = messages.map(m => {
    let own, author = "", note = "";
    if (current.kind === "channel") {
      own = m.authorUid === me.uid;
      if (!own) author = m.authorName || "";
    } else {
      own = m.from === (isTeam() ? "team" : "client");
      if (!own) author = m.from === "team" ? (m.authorName || "Équipe") + " · Hiptown" : (m.authorName || "Client");
      // Équipe : on voit aussi quel collègue a répondu
      if (own && isTeam() && m.authorUid !== me.uid) note = (m.authorName || "Équipe") + " · ";
    }
    return `<div class="msg-bubble ${own ? "own" : "other"}">
      ${author ? `<div class="msg-author">${escapeHtml(author)}</div>` : ""}
      <div class="msg-text">${escapeHtml(m.text)}</div>
      <div class="msg-time">${escapeHtml(note + longWhen(toDate(m.createdAt)))}</div>
    </div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

function showPage() {
  window.hideAll();
  $("step-messagerie").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Liste des discussions ; un client salle de réunion n'en a qu'une : on l'ouvre directement. */
function showInbox() {
  closeThread();
  if (!isTeam() && !channels.length) {
    openThread({ kind: "direct", id: me.uid });
    return;
  }
  $("msg-inbox").hidden = false;
  $("msg-thread").hidden = true;
  $("back-from-messagerie").textContent = "Accueil";
  renderInbox();
}

function closeThread() {
  if (stopMessages) stopMessages();
  stopMessages = null;
  current = null;
  currentConv = null;
}

function openThread(target) {
  closeThread();
  current = target;
  if (target.kind === "direct") currentConv = isTeam() ? (inbox.find(c => c.uid === target.id) || null) : ownConv;
  $("msg-inbox").hidden = true;
  $("msg-thread").hidden = false;
  $("msg-error").hidden = true;
  // Le retour mène à la liste des discussions quand il y en a une, sinon au tableau de bord
  $("back-from-messagerie").textContent = isTeam() || channels.length ? "Discussions" : "Accueil";
  $("msg-list").innerHTML = '<p class="msg-empty">Chargement…</p>';
  renderHeader();
  const parent = target.kind === "channel" ? "channels" : "conversations";
  const q = query(collection(db, parent, target.id, "messages"), orderBy("createdAt"), limitToLast(SHOWN_MESSAGES));
  stopMessages = onSnapshot(q, snap => {
    if (current !== target) return;
    renderMessages(snap.docs.map(d => d.data({ serverTimestamps: "estimate" })));
  }, err => {
    console.error(err);
    $("msg-list").innerHTML = '<p class="msg-empty" style="color:#dc2626;">Impossible d\'afficher cette discussion.</p>';
  });
  if (target.kind === "channel") { markChannelRead(target.id); applyBadge(); }
  else markDirectRead();
  setTimeout(() => $("msg-input").focus(), 50);
}

function openMessagerie() {
  if (!me) return;
  showPage();
  showInbox();
  renderPushBanner();
}

async function markDirectRead() {
  if (current?.kind !== "direct") return;
  const field = isTeam() ? "unreadTeam" : "unreadClient";
  if (!currentConv || !currentConv[field]) return;
  currentConv[field] = false; // évite d'écrire deux fois
  currentConv[field + "Count"] = 0;
  applyBadge();
  try {
    await updateDoc(doc(db, "conversations", current.id), { [field]: false, [field + "Count"]: 0 });
  } catch (err) {
    console.error(err);
  }
}

// ── Envoi ──
async function send() {
  if (sending || !me || !current) return;
  const target = current;
  const input = $("msg-input");
  const text = input.value.trim();
  if (!text) return;
  if (text.length > MAX_LENGTH) return showError("Message trop long (" + MAX_LENGTH + " caractères au plus).");
  sending = true;
  $("msg-send").disabled = true;
  $("msg-error").hidden = true;

  const preview = text.replace(/\s+/g, " ").slice(0, PREVIEW_LENGTH);
  const batch = writeBatch(db);
  let msgRef;
  if (target.kind === "channel") {
    msgRef = doc(collection(db, "channels", target.id, "messages"));
    batch.set(msgRef, { authorUid: me.uid, authorName: me.name, text, createdAt: serverTimestamp() });
    batch.set(doc(db, "channels", target.id), {
      lastText: preview, lastAt: serverTimestamp(), lastAuthorUid: me.uid, lastAuthorName: me.name
    });
  } else {
    const convRef = doc(db, "conversations", target.id);
    msgRef = doc(collection(db, "conversations", target.id, "messages"));
    batch.set(msgRef, {
      from: isTeam() ? "team" : "client",
      authorUid: me.uid,
      authorName: me.name,
      text,
      createdAt: serverTimestamp()
    });
    if (isTeam()) {
      batch.update(convRef, {
        lastText: preview, lastFrom: "team", lastAt: serverTimestamp(),
        unreadTeam: false, unreadTeamCount: 0, unreadClient: true, unreadClientCount: increment(1)
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
        lastText: preview, lastFrom: "client", lastAt: serverTimestamp(),
        unreadTeam: true, unreadTeamCount: increment(1), unreadClient: false, unreadClientCount: 0
      }, { merge: true });
    }
  }

  try {
    await batch.commit();
    input.value = "";
    autoGrow();
  } catch (err) {
    console.error(err);
    showError("Message non envoyé. Vérifiez votre connexion et réessayez.");
    return;
  } finally {
    sending = false;
    $("msg-send").disabled = false;
  }
  if (target.kind === "channel") markChannelRead(target.id);
  notifyRecipients(target.kind === "channel" ? { channelId: target.id, messageId: msgRef.id }
    : { conversationId: target.id, messageId: msgRef.id });
}

/**
 * Notifications (et email pour une conversation client ↔ équipe) envoyées par l'outil de
 * réservation (reservation/Messagerie.gs) : sans attendre, un échec n'empêche pas le message.
 */
async function notifyRecipients(payload) {
  try {
    const idToken = await auth.currentUser.getIdToken();
    await fetch(PORTAIL.reservationUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
      body: JSON.stringify({ action: "notifyNewMessage", idToken, payload })
    });
  } catch (err) {
    console.error("Notification de la messagerie non envoyée", err);
  }
}

// ── Notifications sur cet appareil ──
// iPhone / iPad : seulement une fois le portail installé sur l'écran d'accueil (iOS 16.4 et plus).
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let messaging = null;

async function pushSupported() {
  if (!PORTAIL.pushVapidKey || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try { return await isSupported(); } catch (err) { return false; }
}

/** Bandeau de la messagerie : proposer d'activer les notifications, ou expliquer pourquoi c'est impossible. */
async function renderPushBanner() {
  const box = $("msg-push");
  const supported = await pushSupported();
  let html = "";
  if (!supported) {
    if (isIOS && !isStandalone && PORTAIL.pushVapidKey) {
      html = "🔔 Pour recevoir les notifications sur iPhone, installez d'abord l'application (bouton « Installer l'application ») puis ouvrez-la depuis l'écran d'accueil.";
    }
  } else if (Notification.permission === "default") {
    html = '<span>🔔 Recevez une notification à chaque nouveau message.</span> <button type="button" id="msg-push-on" class="msg-push-btn">Activer les notifications</button>';
  } else if (Notification.permission === "denied") {
    html = "🔕 Les notifications sont bloquées pour ce site. Pour les recevoir, autorisez-les dans les réglages du navigateur ou du téléphone.";
  }
  box.innerHTML = html;
  box.hidden = !html;
}

/** Enregistre le jeton de cet appareil sur le compte (10 appareils au plus, les plus récents). */
async function registerPushToken() {
  if (!me || !(await pushSupported()) || Notification.permission !== "granted") return;
  try {
    messaging = messaging || getMessaging(app);
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: PORTAIL.pushVapidKey, serviceWorkerRegistration: registration });
    if (!token || !me) return;
    const ref = doc(db, "pushTokens", me.uid);
    const snap = await getDoc(ref);
    const tokens = (snap.exists() && Array.isArray(snap.data().tokens) ? snap.data().tokens : []).filter(t => t !== token);
    tokens.push(token);
    await setDoc(ref, { tokens: tokens.slice(-10), updatedAt: serverTimestamp() });
  } catch (err) {
    console.error("Notifications non activées", err);
  }
}

async function enablePush() {
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") await registerPushToken();
  } catch (err) {
    console.error(err);
  }
  renderPushBanner();
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
    companyId: d.place?.companyId || null,
    email: c.email || "",
    site: d.place?.site || null,
    siteId: d.place?.siteId || null,
    scope: d.scope || null
  };
  channels = groupChannels();
  if (isTeam()) watchInbox();
  else watchOwnConversation();
  watchChannels();
  applyBadge();
  registerPushToken();
  // Lien d'un email de notification : on ouvre directement la messagerie
  if (location.hash === PAGE_HASH) {
    history.replaceState(null, "", location.pathname + location.search);
    openMessagerie();
  }
});

onAuthStateChanged(auth, user => {
  if (!user) { stopAll(); me = null; setAppBadge(0); }
});

// Déconnexion : cet appareil ne reçoit plus les notifications du compte
document.getElementById("logout-btn")?.addEventListener("click", () => {
  if (messaging) deleteToken(messaging).catch(() => {});
}, true);

// Clic sur une notification alors que le portail est déjà ouvert (message envoyé par sw.js)
navigator.serviceWorker?.addEventListener("message", e => {
  if (e.data && e.data.hiptown === "open-messagerie") openMessagerie();
});

document.addEventListener("hiptown-tile-action", e => {
  if (e.detail === "messages") openMessagerie();
});

$("msg-inbox-list").addEventListener("click", e => {
  const btn = e.target.closest("[data-kind]");
  if (btn) openThread({ kind: btn.dataset.kind, id: btn.dataset.id });
});

$("msg-push").addEventListener("click", e => {
  if (e.target.closest("#msg-push-on")) enablePush();
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

// Retour : d'une discussion à la liste, de la liste au tableau de bord
$("back-from-messagerie").addEventListener("click", () => {
  const hasList = isTeam() || channels.length > 0;
  if (hasList && !$("msg-thread").hidden) {
    showInbox();
    return;
  }
  closeThread();
  window.hideAll();
  $("step-dashboard").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Messages lus quand on revient sur l'onglet avec la discussion ouverte
document.addEventListener("visibilitychange", () => {
  if (!isVisible()) return;
  if (current?.kind === "channel") { markChannelRead(current.id); applyBadge(); }
  else markDirectRead();
});

// Le tableau de bord est reconstruit à chaque affichage : on remet la pastille
new MutationObserver(applyBadge).observe($("tiles-grid"), { childList: true });
