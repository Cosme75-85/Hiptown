// ==================== MESSAGERIE DU PORTAIL ====================
// Les messages eux-mêmes sont dans Firestore (portail : messagerie.js, règles : firestore.rules).
// Ce fichier n'envoie que les emails de notification, juste après chaque message :
//  - message d'un client  → l'équipe Hiptown de sa ville (ex. bordeaux@hiptown.com) + TEAM_COPY_EMAILS
//  - réponse de l'équipe  → le client, à l'adresse de sa fiche du portail
// Tout est relu dans Firestore avec le jeton de la personne qui a écrit : on ne peut faire
// partir un email que pour un message qu'on a soi-même envoyé et qu'on a le droit de lire.

const MESSAGERIE_PORTAL_URL = 'https://cosme75-85.github.io/Hiptown/#messagerie';
const MESSAGERIE_MAX_EMAILS = 20;          // emails au plus par compte...
const MESSAGERIE_WINDOW_SECONDS = 10 * 60; // ...sur 10 minutes (protection contre l'envoi en rafale)

/** Point d'entrée (doPost, action notifyNewMessage) : payload = { conversationId, messageId }. */
function notifyNewMessage(idToken, raw) {
  try {
    const uid = tokenUid(idToken);
    if (!uid) return { success: false, message: 'Session expirée, merci de vous reconnecter au portail.' };
    raw = raw || {};
    const convId = String(raw.conversationId || '');
    const messageId = String(raw.messageId || '');
    if (!/^[A-Za-z0-9]{1,128}$/.test(convId) || !/^[A-Za-z0-9]{1,64}$/.test(messageId)) {
      return { success: false, message: 'Message inconnu.' };
    }

    // Un seul email par message, même si la page renvoie la demande
    const cache = CacheService.getScriptCache();
    const doneKey = 'msgmail:' + convId + ':' + messageId;
    if (cache.get(doneKey)) return { success: true, alreadySent: true };

    const base = 'conversations/' + encodeURIComponent(convId);
    const msg = readFirestoreDoc(base + '/messages/' + encodeURIComponent(messageId), idToken);
    if (!msg || msg.authorUid !== uid) return { success: false, message: 'Message inconnu.' };
    const conv = readFirestoreDoc(base, idToken);
    if (!conv) return { success: false, message: 'Conversation inconnue.' };

    const rateKey = 'msgrate:' + uid;
    const count = Number(cache.get(rateKey)) || 0;
    if (count >= MESSAGERIE_MAX_EMAILS) return { success: false, message: 'Trop d\'emails envoyés, réessayez plus tard.' };
    cache.put(rateKey, String(count + 1), MESSAGERIE_WINDOW_SECONDS);

    if (msg.from === 'client' && convId === uid) {
      emailTeamAboutMessage(conv, msg);
    } else if (msg.from === 'team') {
      // Adresse du client lue sur sa fiche (les règles ne la montrent qu'à l'équipe qui le gère)
      const client = readFirestoreDoc('users/' + encodeURIComponent(convId), idToken);
      if (!client || !client.email) return { success: false, message: 'Adresse email du client introuvable.' };
      emailClientAboutReply(client, conv, msg);
    } else {
      return { success: false, message: 'Message inconnu.' };
    }
    cache.put(doneKey, '1', 21600); // 6 h, le maximum du cache
    return { success: true };
  } catch (err) {
    Logger.log('⚠️ Email de la messagerie non envoyé : ' + err.message);
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
      + '<p style="color:#64748b;font-size:12px;">Répondez depuis le portail (tuile « Messagerie clients ») : '
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
