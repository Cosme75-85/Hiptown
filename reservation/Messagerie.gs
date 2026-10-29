// ==================== MESSAGERIE DU PORTAIL ====================
// Les messages eux-mêmes sont dans Firestore (portail : messagerie.js, règles : firestore.rules).
// Ce fichier prévient les destinataires, juste après chaque message :
//  - par email, pour les conversations client ↔ équipe :
//      message d'un client  → l'équipe Hiptown de sa ville (ex. bordeaux@hiptown.com) + TEAM_COPY_EMAILS
//      réponse de l'équipe  → le client, à l'adresse de sa fiche du portail
//  - par notification (téléphone, ordinateur), pour toutes les discussions, à chaque appareil
//    qui les a acceptées (Firebase Cloud Messaging ; voir « Notifications » plus bas).
// Le message est relu dans Firestore avec le jeton de la personne qui a écrit : on ne peut
// prévenir que pour un message qu'on a soi-même envoyé et qu'on a le droit de lire.

const MESSAGERIE_PORTAL_URL = 'https://cosme75-85.github.io/Hiptown/#messagerie';
const MESSAGERIE_MAX_EMAILS = 60;          // messages notifiés au plus par compte...
const MESSAGERIE_WINDOW_SECONDS = 10 * 60; // ...sur 10 minutes (protection contre l'envoi en rafale)

/**
 * Point d'entrée (doPost, action notifyNewMessage) :
 * payload = { conversationId, messageId } (client ↔ équipe) ou { channelId, messageId } (discussion de groupe).
 */
function notifyNewMessage(idToken, raw) {
  try {
    const uid = tokenUid(idToken);
    if (!uid) return { success: false, message: 'Session expirée, merci de vous reconnecter au portail.' };
    raw = raw || {};
    const convId = String(raw.conversationId || '');
    const channelId = String(raw.channelId || '');
    const messageId = String(raw.messageId || '');
    const isChannel = !!channelId;
    if (isChannel ? !/^(team|company)-[A-Za-z0-9_-]{1,120}$/.test(channelId) : !/^[A-Za-z0-9]{1,128}$/.test(convId)) {
      return { success: false, message: 'Message inconnu.' };
    }
    if (!/^[A-Za-z0-9]{1,64}$/.test(messageId)) return { success: false, message: 'Message inconnu.' };

    // Une seule fois par message, même si la page renvoie la demande
    const cache = CacheService.getScriptCache();
    const doneKey = 'msgmail:' + (channelId || convId) + ':' + messageId;
    if (cache.get(doneKey)) return { success: true, alreadySent: true };

    const base = (isChannel ? 'channels/' + channelId : 'conversations/' + encodeURIComponent(convId));
    const msg = readFirestoreDoc(base + '/messages/' + encodeURIComponent(messageId), idToken);
    if (!msg || msg.authorUid !== uid) return { success: false, message: 'Message inconnu.' };
    const conv = isChannel ? {} : readFirestoreDoc(base, idToken);
    if (!conv) return { success: false, message: 'Conversation inconnue.' };

    const rateKey = 'msgrate:' + uid;
    const count = Number(cache.get(rateKey)) || 0;
    if (count >= MESSAGERIE_MAX_EMAILS) return { success: false, message: 'Trop de messages envoyés, réessayez plus tard.' };
    cache.put(rateKey, String(count + 1), MESSAGERIE_WINDOW_SECONDS);
    cache.put(doneKey, '1', 21600); // 6 h, le maximum du cache

    if (isChannel) {
      pushSafely(() => pushChannelMessage(channelId, msg, uid));
    } else if (msg.from === 'client' && convId === uid) {
      emailTeamAboutMessage(conv, msg);
      pushSafely(() => pushToTeam(conv, msg));
    } else if (msg.from === 'team') {
      // Adresse du client lue sur sa fiche (les règles ne la montrent qu'à l'équipe qui le gère)
      const client = readFirestoreDoc('users/' + encodeURIComponent(convId), idToken);
      if (!client || !client.email) return { success: false, message: 'Adresse email du client introuvable.' };
      emailClientAboutReply(client, conv, msg);
      pushSafely(() => pushToUsers([convId], {
        title: '💬 Équipe Hiptown' + (msg.authorName ? ' · ' + cleanText(msg.authorName, 60) : ''),
        body: msg.text, tag: 'conv-' + convId
      }));
    } else {
      return { success: false, message: 'Message inconnu.' };
    }
    return { success: true };
  } catch (err) {
    Logger.log('⚠️ Notification de la messagerie non envoyée : ' + err.message);
    return { success: false, message: err.message };
  }
}

/** Texte d'un message pour un email : échappé, retours à la ligne gardés. */
function messageHtml(text) {
  return '<div style="border-left:4px solid #1e1847;background:#f5f4ff;padding:10px 14px;margin:12px 0;'
    + '">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>';
}

function portalButton(label) {
  return '<p><a href="' + MESSAGERIE_PORTAL_URL + '" style="background:#1e1847;color:#ffffff;padding:10px 18px;'
    + 'border-radius:6px;text-decoration:none;display:inline-block;">' + label + '</a></p>';
}

function emailTeamAboutMessage(conv, msg) {
  const name = cleanText(conv.clientName, 120) || cleanText(conv.clientEmail, 120) || 'Un client';
  const company = cleanText(conv.clientCompany, 120);
  const kind = conv.clientRole === 'salle' ? 'Salle de réunion' : 'Coworking';
  const details = [company, kind, conv.siteId ? String(conv.siteId).toUpperCase() : '', cleanText(conv.clientEmail, 120)]
    .filter(Boolean).join(' · ');
  MailApp.sendEmail({
    to: teamRecipients({ city: conv.site }),
    subject: '💬 Message de ' + name + (company ? ' (' + company + ')' : '') + ' — portail Hiptown',
    htmlBody: '<p><b>' + escapeHtml(name) + '</b> vous a écrit depuis la messagerie du portail.</p>'
      + '<p style="color:#64748b;font-size:13px;">' + escapeHtml(details) + '</p>'
      + messageHtml(msg.text)
      + portalButton('Répondre dans le portail')
      + '<p style="color:#64748b;font-size:12px;">Répondez depuis le portail (tuile « Messagerie ») : '
      + 'le client voit la réponse dans son espace et la reçoit aussi par email.</p>'
  });
}

function emailClientAboutReply(client, conv, msg) {
  const author = cleanText(msg.authorName, 120);
  const firstName = cleanText(client.firstName, MAX_TEXT_LENGTH);
  MailApp.sendEmail({
    to: normalizeEmail(client.email),
    replyTo: cityTeamEmail({ city: conv.site }), // une réponse par email arrive à l'équipe de la ville
    subject: '💬 Nouveau message de l\'équipe Hiptown',
    htmlBody: '<p>Bonjour' + (firstName ? ' ' + escapeHtml(firstName) : '') + ',</p>'
      + '<p>' + (author ? escapeHtml(author) + ', de l\'équipe Hiptown,' : 'L\'équipe Hiptown') + ' vous a répondu :</p>'
      + messageHtml(msg.text)
      + portalButton('Voir et répondre dans mon espace')
      + '<p style="color:#64748b;font-size:12px;">Pour garder tout l\'historique au même endroit, répondez de préférence '
      + 'depuis la messagerie de votre espace Hiptown.</p>'
  });
}

// ==================== NOTIFICATIONS (FIREBASE CLOUD MESSAGING) ====================
// Chaque appareil qui accepte les notifications range son jeton dans pushTokens/{uid}
// (messagerie.js). Pour trouver les destinataires et leur envoyer la notification, ce script
// utilise le compte de service Firebase : sa clé (fichier JSON téléchargé depuis la console
// Firebase > Paramètres du projet > Comptes de service > « Générer une nouvelle clé privée »)
// est collée en entier dans la propriété du script FIREBASE_SERVICE_ACCOUNT.
// Sans cette propriété, les notifications sont simplement désactivées (les emails partent).

const PUSH_BODY_LENGTH = 140;

/** Envoie sans jamais faire échouer le message ni l'email. */
function pushSafely(send) {
  try {
    send();
  } catch (err) {
    Logger.log('⚠️ Notification non envoyée : ' + err.message);
  }
}

/** Jeton d'accès du compte de service (Firestore + Cloud Messaging), gardé 50 minutes. null si non configuré. */
function serviceAccountToken() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('fcm:token');
  if (cached) return cached;
  const raw = PropertiesService.getScriptProperties().getProperty('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) return null;
  const key = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const b64 = obj => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(unsigned, key.private_key)).replace(/=+$/, '');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Compte de service refusé : ' + res.getContentText().slice(0, 200));
  const token = JSON.parse(res.getContentText()).access_token;
  cache.put('fcm:token', token, 50 * 60);
  return token;
}

/** Racine des documents Firestore du portail (fonction : Config.gs peut être chargé après ce fichier). */
function firestoreDocsPath() {
  return 'projects/' + COWORKING.firebaseProjectId + '/databases/(default)/documents';
}

function firestoreAdminUrl(path) {
  return 'https://firestore.googleapis.com/v1/' + firestoreDocsPath() + (path || '');
}

/** Appel Firestore avec le compte de service (les règles ne s'appliquent pas). */
function firestoreAdmin(token, method, url, payload) {
  const options = { method: method, headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) throw new Error('Firestore ' + res.getResponseCode() + ' : ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText() || '{}');
}

/** Valeur Firestore (REST) → valeur JavaScript. */
function firestoreValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(firestoreValue);
  if ('mapValue' in v) return firestoreFields(v.mapValue.fields);
  return null;
}

function firestoreFields(fields) {
  const out = {};
  Object.keys(fields || {}).forEach(k => { out[k] = firestoreValue(fields[k]); });
  return out;
}

/** Comptes validés dont le champ vaut value : [{ uid, ...fiche }]. */
function usersWhere(token, field, value) {
  const rows = firestoreAdmin(token, 'post', firestoreAdminUrl(':runQuery'), {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } }
    }
  });
  return rows.filter(r => r.document).map(r => Object.assign(
    { uid: r.document.name.split('/').pop() }, firestoreFields(r.document.fields)
  )).filter(u => u.status === 'approved');
}

/** Message d'un client : l'équipe qui gère ce client (même périmètre que firestore.rules canManageUser). */
function pushToTeam(conv, msg) {
  const token = serviceAccountToken();
  if (!token) return;
  const admins = usersWhere(token, 'role', 'admin').filter(a => {
    if (!a.site) return true; // admin général
    if (a.site !== conv.site) return false;
    return a.adminLevel !== 'site' || (Array.isArray(a.siteIds) && a.siteIds.indexOf(conv.siteId) !== -1);
  });
  const name = cleanText(conv.clientName, 60) || 'Un client';
  const company = cleanText(conv.clientCompany, 60);
  pushToUsers(admins.map(a => a.uid), {
    title: '💬 ' + name + (company ? ' (' + company + ')' : ''),
    body: msg.text, tag: 'conv-' + msg.authorUid
  }, token);
}

/** Discussion de groupe : l'équipe de la ville, ou les collègues de l'entreprise (sauf l'auteur). */
function pushChannelMessage(channelId, msg, authorUid) {
  const token = serviceAccountToken();
  if (!token) return;
  let uids = [];
  let title = '';
  const author = cleanText(msg.authorName, 60);
  if (channelId.indexOf('team-') === 0) {
    const city = channelId.slice(5);
    uids = usersWhere(token, 'role', 'admin').filter(a => !a.site || a.site === city).map(a => a.uid);
    title = '💬 Équipe ' + city.charAt(0).toUpperCase() + city.slice(1);
  } else {
    const companyId = channelId.slice(8);
    uids = usersWhere(token, 'companyId', companyId).filter(u => u.role === 'coworking').map(u => u.uid);
    let companyName = '';
    try {
      companyName = firestoreFields(firestoreAdmin(token, 'get',
        firestoreAdminUrl('/companies/' + encodeURIComponent(companyId))).fields).name || '';
    } catch (err) { /* nom facultatif */ }
    title = '💬 ' + (cleanText(companyName, 60) || 'Mon entreprise');
  }
  pushToUsers(uids.filter(u => u !== authorUid), {
    title: title + (author ? ' · ' + author : ''), body: msg.text, tag: channelId
  }, token);
}

/** Envoie la notification à tous les appareils des comptes ; oublie les appareils qui n'existent plus. */
function pushToUsers(uids, note, token) {
  token = token || serviceAccountToken();
  if (!token || !uids.length) return;
  const docs = firestoreAdmin(token, 'post', firestoreAdminUrl(':batchGet'), {
    documents: uids.map(uid => firestoreDocsPath() + '/pushTokens/' + uid)
  });
  const targets = []; // { uid, token, all }
  (Array.isArray(docs) ? docs : []).forEach(d => {
    if (!d.found) return;
    const data = firestoreFields(d.found.fields);
    const uid = d.found.name.split('/').pop();
    (data.tokens || []).forEach(t => targets.push({ uid: uid, token: t, all: data.tokens }));
  });
  if (!targets.length) return;

  const body = String(note.body || '').replace(/\s+/g, ' ').slice(0, PUSH_BODY_LENGTH);
  const sendUrl = 'https://fcm.googleapis.com/v1/projects/' + COWORKING.firebaseProjectId + '/messages:send';
  const responses = UrlFetchApp.fetchAll(targets.map(t => ({
    url: sendUrl,
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
    payload: JSON.stringify({ message: {
      token: t.token,
      data: { title: String(note.title || 'Hiptown'), body: body, tag: String(note.tag || 'messagerie'), url: String(note.url || './#messagerie') },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } }
    } })
  })));

  // Appareils désinstallés ou déconnectés : retirés de la liste du compte
  const dead = {};
  responses.forEach((res, i) => {
    const code = res.getResponseCode();
    if (code === 404 || (code === 400 && /registration token/i.test(res.getContentText()))) {
      (dead[targets[i].uid] = dead[targets[i].uid] || []).push(targets[i].token);
    } else if (code !== 200) {
      Logger.log('⚠️ Notification refusée (' + code + ') : ' + res.getContentText().slice(0, 200));
    }
  });
  Object.keys(dead).forEach(uid => {
    const keep = targets.find(t => t.uid === uid).all.filter(t => dead[uid].indexOf(t) === -1);
    try {
      firestoreAdmin(token, 'patch', firestoreAdminUrl('/pushTokens/' + uid + '?updateMask.fieldPaths=tokens'), {
        fields: { tokens: { arrayValue: { values: keep.map(t => ({ stringValue: t })) } } }
      });
    } catch (err) {
      Logger.log('Liste d\'appareils non nettoyée : ' + err.message);
    }
  });
}
