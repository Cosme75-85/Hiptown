/**
 * RÉDUCTIONS CLIENTS — remise en % sur la prochaine réservation.
 *
 * L'équipe Hiptown accorde une remise à un client depuis le portail
 * (Gestion > Réductions clients), par exemple après un souci lors d'une réservation.
 * La remise est gardée en mémoire, rattachée à l'adresse email du client, puis
 * appliquée automatiquement au prochain devis envoyé à cette adresse :
 *   - réservation de salle (devis joint à l'email de confirmation, Code.gs) ;
 *   - repas commandés par un coworker (devis « repas seuls », Coworking.gs).
 * Une fois utilisée, elle passe dans l'historique (date, n° de devis, réservation).
 *
 * Rangement : propriétés du script (une clé par client + une clé d'historique),
 * aucune base de données ni réglage à faire.
 */

const DISCOUNT_KEY_PREFIX = 'DISCOUNT:';
const DISCOUNT_HISTORY_KEY = 'DISCOUNT_HISTORY';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Remise en attente pour cette adresse : { email, percent, reason, createdBy, createdAt } ou null. */
function getPendingDiscount(email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  const saved = PropertiesService.getScriptProperties().getProperty(DISCOUNT_KEY_PREFIX + key);
  if (!saved) return null;
  try {
    const d = JSON.parse(saved);
    return d && d.percent > 0 ? d : null;
  } catch (err) {
    return null;
  }
}

/**
 * Prend la remise en attente (elle ne servira qu'une fois) et la range dans l'historique
 * avec le devis qui l'a utilisée. Renvoie la remise, ou null s'il n'y en a pas.
 * Sous verrou : deux devis simultanés ne peuvent pas utiliser la même remise.
 */
function takePendingDiscount(email, usage) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const discount = getPendingDiscount(email);
    if (!discount) return null;
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(DISCOUNT_KEY_PREFIX + normalizeEmail(email));
    const history = readDiscountHistory();
    history.unshift(Object.assign({}, discount, {
      usedAt: new Date().toISOString(),
      quoteNumber: usage.quoteNumber || '',
      bookingLabel: String(usage.bookingLabel || '').slice(0, 200)
    }));
    props.setProperty(DISCOUNT_HISTORY_KEY, JSON.stringify(history.slice(0, DISCOUNTS.historySize)));
    return discount;
  } finally {
    lock.releaseLock();
  }
}

function readDiscountHistory() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty(DISCOUNT_HISTORY_KEY) || '[]');
  } catch (err) {
    return [];
  }
}

/** Remise déjà appliquée à une réservation (reprise si son devis est refait), ou null. */
function eventDiscount(event) {
  try {
    const d = JSON.parse(event.getTag(TAG_DISCOUNT) || 'null');
    return d && d.percent > 0 ? d : null;
  } catch (err) {
    return null;
  }
}

function setEventDiscount(event, discount) {
  event.setTag(TAG_DISCOUNT, JSON.stringify({ percent: discount.percent, reason: String(discount.reason || '').slice(0, 300) }));
}

/** Phrase pour l'email du client quand son devis comporte une remise. */
function discountSentence(discount) {
  return 'Comme convenu avec l\'équipe Hiptown, une remise de <b>' + discount.percent + ' %</b> a été appliquée sur ce devis.';
}

// ==================== GESTION DEPUIS LE PORTAIL (équipe Hiptown) ====================

/** Vérifie que le jeton appartient à un compte Hiptown (admin) validé. Renvoie son email. */
function getDiscountAdmin(idToken) {
  const uid = tokenUid(idToken);
  if (!uid) throw new Error('Session expirée, merci de vous reconnecter au portail.');
  const profile = readFirestoreDoc('users/' + encodeURIComponent(uid), idToken);
  if (!profile || profile.status !== 'approved' || profile.role !== 'admin') {
    throw new Error('Réservé à l\'équipe Hiptown.');
  }
  return normalizeEmail(profile.email) || uid;
}

/** Liste des remises en attente et des dernières remises utilisées. */
function getDiscounts(idToken) {
  try {
    getDiscountAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const props = PropertiesService.getScriptProperties().getProperties();
  const pending = Object.keys(props)
    .filter(key => key.indexOf(DISCOUNT_KEY_PREFIX) === 0)
    .map(key => {
      try { return JSON.parse(props[key]); } catch (err) { return null; }
    })
    .filter(d => d && d.percent > 0)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { success: true, pending: pending, history: readDiscountHistory(), maxPercent: DISCOUNTS.maxPercent };
}

/** Accorde (ou remplace) la remise d'un client sur sa prochaine réservation. */
function setDiscount(idToken, raw) {
  let admin;
  try {
    admin = getDiscountAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  raw = raw || {};
  const email = normalizeEmail(cleanText(raw.email, MAX_TEXT_LENGTH));
  const percent = Number(raw.percent);
  const reason = cleanText(raw.reason, 300);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: 'Adresse email invalide.' };
  if (!(Number.isInteger(percent) && percent >= 1 && percent <= DISCOUNTS.maxPercent)) {
    return { success: false, message: 'La remise doit être comprise entre 1 et ' + DISCOUNTS.maxPercent + ' %.' };
  }

  const discount = { email: email, percent: percent, reason: reason, createdBy: admin, createdAt: new Date().toISOString() };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'Le système est occupé, merci de réessayer dans quelques secondes.' };
  }
  try {
    PropertiesService.getScriptProperties().setProperty(DISCOUNT_KEY_PREFIX + email, JSON.stringify(discount));
  } finally {
    lock.releaseLock();
  }
  return { success: true, message: 'Remise de ' + percent + ' % enregistrée : elle sera appliquée au prochain devis de ' + email + '.' };
}

/** Retire la remise en attente d'un client (avant qu'elle ne soit utilisée). */
function deleteDiscount(idToken, raw) {
  try {
    getDiscountAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const email = normalizeEmail(raw && raw.email);
  if (!email) return { success: false, message: 'Adresse email manquante.' };
  PropertiesService.getScriptProperties().deleteProperty(DISCOUNT_KEY_PREFIX + email);
  return { success: true, message: 'Remise retirée.' };
}
