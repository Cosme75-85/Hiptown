/**
 * RÉSERVATION DEPUIS L'ESPACE COWORKING DU PORTAIL — Coworking.gs
 * ----------------------------------------------------------------
 * Les coworkers réservent les salles de réunion depuis le portail client
 * (tuile « Réserver une salle de réunion », fichier resa-coworking.js).
 * Ils ne paient pas : pas de prix, pas de devis, pas de validation par le gérant,
 * pas d'email de remerciement 3 jours après. La réservation est confirmée tout de
 * suite, dans le même agenda que les réservations externes : un créneau pris d'un
 * côté est aussitôt indisponible de l'autre.
 *
 * Qui a le droit de réserver ? Le portail envoie le jeton de connexion Firebase de
 * la personne. On relit sa fiche Firestore AVEC ce jeton : c'est Firestore qui
 * vérifie que le jeton est authentique (un jeton inventé ou expiré est refusé).
 * Seuls les comptes validés dont le rôle figure dans COWORKING.allowedRoles passent.
 */

/** Salles proposées dans l'espace coworking (sans tarifs ni agenda) et horaires d'ouverture. */
function getCoworkingSpaces() {
  return {
    startHour: START_HOUR,
    endHour: END_HOUR,
    spaces: getSpacesMeta()
      .filter(s => COWORKING.spaceIds.indexOf(s.id) !== -1)
      .map(s => ({
        id: s.id,
        name: s.name,
        color: s.color,
        photoUrl: s.photoUrl,
        maxPeople: s.maxPeople,
        allowMultiDay: s.allowMultiDay,
        credits: COWORKING.credits[s.id] || null
      }))
  };
}

function bookCoworkingRoom(idToken, rawBooking) {
  let user;
  try {
    user = getPortalUser(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }

  const booking = validateCoworkingBooking(rawBooking);
  if (booking.error) return { success: false, message: booking.error };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'Le système est occupé, merci de réessayer dans quelques secondes.' };
  }

  try {
    const space = booking.space;
    const start = setTime(booking.startDate, booking.startHour);
    const end = setTime(booking.endDate, booking.endHour);

    const cal = CalendarApp.getCalendarById(space.calendarId);
    if (!cal) return { success: false, message: 'Agenda introuvable pour cette salle.' };

    // Même vérification que pour les réservations externes : l'agenda réel fait foi
    if (maxOverlapInRange(getBookedSlots(space, start, end), start, end) + 1 > space.capacity) {
      return { success: false, message: 'Ce créneau vient d\'être pris, merci de choisir un autre horaire.' };
    }

    // Crédits : vérifiés sous le verrou, deux réservations simultanées ne peuvent pas dépasser le solde
    const cost = computeCoworkingCredits(space.id, booking);
    let balance = null;
    if (user.chargesCredits) {
      balance = getCreditBalance(user, booking.startDate.getFullYear(), booking.startDate.getMonth() + 1);
      if (cost > balance.remaining) {
        return {
          success: false,
          message: 'Crédits insuffisants : cette réservation coûte ' + cost + ' crédit(s), il vous en reste '
            + balance.remaining + ' pour ' + balance.monthLabel + '.'
        };
      }
    }

    const fullName = (user.firstName + ' ' + user.lastName).trim() || user.email;
    const title = booking.title || 'Réunion ' + (user.company || fullName);
    const description = [
      ['Espace', space.name],
      booking.isMultiDay
        ? ['Dates', 'du ' + booking.dateString + ' au ' + booking.endDateString + ' (' + booking.numberOfDays + ' jours)']
        : ['Date', booking.dateString],
      ['Horaire', booking.startHour + 'h - ' + booking.endHour + 'h' + (booking.isMultiDay ? ' (chaque jour)' : '')],
      ['Titre', title],
      // « Demandé par » et « Email » sont aussi relus par readEventData
      ['Demandé par', fullName + (user.company ? ' (' + user.company + ')' : '')],
      ['Email', user.email],
      ['Nombre de personnes', booking.numberOfPeople],
      user.chargesCredits && ['Crédits utilisés', cost],
      booking.notes && ['Note', booking.notes]
    ].filter(Boolean)
      .map(([label, value]) => label + ' : ' + value)
      .concat('Statut : réservation coworking confirmée (sans facturation)')
      .join('\n');

    const event = cal.createEvent(COWORKING.titlePrefix + title, start, end, { description: description });
    event.setColor(CalendarApp.EventColor.PALE_BLUE);
    event.setTag(TAG_EMAIL, user.email);
    event.setTag(TAG_FIRST_NAME, user.firstName);
    event.setTag(TAG_QUANTITY, '1');
    event.setTag(TAG_PORTAL_UID, user.uid);
    if (user.chargesCredits) {
      event.setTag(TAG_COMPANY, user.companyId);
      event.setTag(TAG_CREDITS, String(cost));
    }

    invalidateAvailabilityCache(); // la disponibilité vient de changer

    // Un souci d'email ne doit pas annuler une réservation déjà inscrite dans l'agenda
    try {
      sendCoworkingConfirmation(user, booking, title, start, end,
        balance && { cost: cost, remaining: balance.remaining - cost, monthLabel: balance.monthLabel });
    } catch (err) {
      Logger.log('⚠️ Email de confirmation coworking non envoyé à ' + user.email + ' : ' + err.message);
    }

    return {
      success: true,
      message: 'Réservation confirmée ! ' + space.name + ' est à vous.'
        + (balance ? ' ' + cost + ' crédit(s) utilisé(s), il en reste ' + (balance.remaining - cost) + '.' : '')
        + ' Un email récapitulatif vous a été envoyé.'
    };

  } catch (err) {
    return { success: false, message: 'Erreur lors de la réservation : ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

/** Vérifie la demande reçue du portail. Retourne { error } ou la demande nettoyée. */
function validateCoworkingBooking(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Requête invalide.' };
  if (COWORKING.spaceIds.indexOf(raw.spaceId) === -1) return { error: 'Salle introuvable.' };
  const space = findSpace(raw.spaceId);
  if (!space) return { error: 'Salle introuvable.' };

  const b = {
    space: space,
    title: cleanText(raw.title, MAX_TEXT_LENGTH),
    notes: cleanText(raw.notes, MAX_NOTES_LENGTH),
    numberOfPeople: toInt(raw.numberOfPeople),
    dateString: String(raw.dateString || ''),
    endDateString: raw.endDateString ? String(raw.endDateString) : '',
    startHour: toInt(raw.startHour),
    endHour: toInt(raw.endHour)
  };

  if (!(b.numberOfPeople >= 1)) return { error: 'Merci de renseigner le nombre de personnes.' };
  if (space.maxPeople && b.numberOfPeople > space.maxPeople) {
    return { error: space.name + ' accueille au maximum ' + space.maxPeople + ' personnes.' };
  }

  const slotError = validateSlot(b);
  if (slotError) return { error: slotError };
  return b;
}

function sendCoworkingConfirmation(user, booking, title, start, end, credits) {
  const when = frenchDateRange(start, end) + (booking.isMultiDay
    ? ', de ' + booking.startHour + 'h à ' + booking.endHour + 'h chaque jour'
    : ', de ' + booking.startHour + 'h à ' + booking.endHour + 'h');
  sendClientEmail(user.email, user.firstName, 'Réservation confirmée — ' + booking.space.name + ' — Hiptown', [
    'Votre réservation <b>"' + escapeHtml(title) + '"</b> est confirmée : <b>' + escapeHtml(booking.space.name)
      + '</b>, ' + when + ', pour ' + booking.numberOfPeople + ' personne(s).',
    credits && ('Crédits utilisés : <b>' + credits.cost + '</b>. Il reste <b>' + credits.remaining
      + '</b> crédit(s) à votre entreprise pour ' + credits.monthLabel + '.'),
    'Merci d\'avoir réservé avec votre espace client Hiptown. Nous vous souhaitons une excellente réunion !',
    'Un empêchement ? Prévenez-nous simplement en répondant à cet email, nous libérerons la salle '
      + '(et vos crédits).'
  ].filter(Boolean), 'À très bientôt');
}

// ==================== CRÉDITS ====================

/**
 * Crédits d'une réservation selon le barème COWORKING.credits.
 * Même découpage que le devis des salles (computeQuote) : plusieurs jours = une journée
 * par jour, plus de 5h = journée, 5h = demi-journée, sinon tarif horaire × heures.
 */
function computeCoworkingCredits(spaceId, b) {
  const rate = COWORKING.credits[spaceId];
  if (!rate) return 0;
  const duration = b.endHour - b.startHour;
  const days = b.numberOfDays || 1;
  const hourly = (rate.hourly || 0) * duration;
  let perDay;
  if (duration > 5) perDay = rate.fullDay || hourly;
  else if (duration === 5) perDay = rate.halfDay || hourly;
  else perDay = hourly;
  return perDay * days;
}

/**
 * Solde du mois pour l'entreprise : crédits du contrat − crédits des réservations
 * coworking qui commencent ce mois-ci. Rien n'est stocké : le solde repart
 * automatiquement du plafond chaque mois, et supprimer une réservation de
 * l'agenda rend ses crédits.
 */
function getCreditBalance(user, year, month) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);
  let used = 0;
  COWORKING.spaceIds.forEach(spaceId => {
    const space = findSpace(spaceId);
    const cal = space && CalendarApp.getCalendarById(space.calendarId);
    if (!cal) return;
    cal.getEvents(from, to).forEach(event => {
      if (event.getStartTime() < from) return; // commencée le mois précédent : comptée sur ce mois-là
      if (event.getTag(TAG_COMPANY) !== user.companyId) return;
      used += Number(event.getTag(TAG_CREDITS)) || 0;
    });
  });
  return {
    allowance: user.monthlyCredits,
    used: used,
    remaining: Math.max(0, user.monthlyCredits - used),
    monthLabel: frenchMonthLabel(year, month)
  };
}

/** Solde affiché dans le portail pour le mois demandé (défaut : mois en cours). */
function getCoworkingCredits(idToken, year, month) {
  let user;
  try {
    user = getPortalUser(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  if (!user.chargesCredits) return { success: true, chargesCredits: false };
  const now = new Date();
  year = toInt(year) || now.getFullYear();
  month = toInt(month) || now.getMonth() + 1;
  if (month < 1 || month > 12) return { success: false, message: 'Mois invalide.' };
  const balance = getCreditBalance(user, year, month);
  balance.success = true;
  balance.chargesCredits = true;
  balance.company = user.company;
  return balance;
}

function frenchMonthLabel(year, month) {
  const names = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return names[month - 1] + ' ' + year;
}

// ==================== COMPTE DU PORTAIL ====================

/**
 * Compte du portail à qui appartient le jeton : { uid, email, firstName, lastName, company }.
 * Lève une erreur (message affiché tel quel) si le jeton est invalide ou le compte non autorisé.
 */
function getPortalUser(idToken) {
  const uid = tokenUid(idToken);
  if (!uid) throw new Error('Session expirée, merci de vous reconnecter au portail.');

  // Le chemin utilise l'identifiant écrit DANS le jeton : on ne peut lire que sa propre fiche
  const profile = readFirestoreDoc('users/' + encodeURIComponent(uid), idToken);
  if (!profile || profile.status !== 'approved' || COWORKING.allowedRoles.indexOf(profile.role) === -1) {
    throw new Error('Votre compte ne permet pas de réserver les salles de réunion. Contactez l\'équipe Hiptown.');
  }
  if (!profile.email) throw new Error('Adresse email manquante sur votre compte. Contactez l\'équipe Hiptown.');

  let company = '';
  let companyDoc = null;
  if (profile.companyId) {
    companyDoc = readFirestoreDoc('companies/' + encodeURIComponent(profile.companyId), idToken);
    company = (companyDoc && companyDoc.name) || '';
  }
  if (!company) company = profile.role === 'admin' ? 'Hiptown' : (profile.companyNameHint || '');

  // Les coworkers réservent sur les crédits de leur entreprise ; l'équipe Hiptown (admin) non
  const chargesCredits = profile.role !== 'admin';
  if (chargesCredits && !companyDoc) {
    throw new Error('Votre compte n\'est rattaché à aucune entreprise coworking. Contactez l\'équipe Hiptown.');
  }

  return {
    uid: uid,
    email: String(profile.email).toLowerCase(),
    firstName: cleanText(profile.firstName, MAX_TEXT_LENGTH),
    lastName: cleanText(profile.lastName, MAX_TEXT_LENGTH),
    company: cleanText(company, MAX_TEXT_LENGTH),
    chargesCredits: chargesCredits,
    companyId: chargesCredits ? String(profile.companyId) : '',
    monthlyCredits: chargesCredits ? Math.max(0, Number(companyDoc.credits) || 0) : 0
  };
}

/**
 * Identifiant du compte écrit dans le jeton (sans vérifier la signature : c'est
 * Firestore qui la vérifie ensuite, en refusant la lecture si le jeton est faux).
 */
function tokenUid(idToken) {
  if (typeof idToken !== 'string' || idToken.length > 4096) return '';
  const parts = idToken.split('.');
  if (parts.length !== 3) return '';
  try {
    const padded = parts[1] + '==='.slice((parts[1].length + 3) % 4);
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString());
    if (payload.aud !== COWORKING.firebaseProjectId) return '';
    return typeof payload.sub === 'string' && /^[A-Za-z0-9]{1,128}$/.test(payload.sub) ? payload.sub : '';
  } catch (err) {
    return '';
  }
}

/** Lit un document Firestore avec les droits de la personne connectée. null s'il n'existe pas. */
function readFirestoreDoc(path, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + COWORKING.firebaseProjectId
    + '/databases/(default)/documents/' + path;
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + idToken },
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code === 404) return null;
  if (code === 401 || code === 403) throw new Error('Session expirée, merci de vous reconnecter au portail.');
  if (code !== 200) throw new Error('Portail momentanément injoignable (' + code + '), merci de réessayer.');

  // Firestore renvoie { fields: { role: { stringValue: 'coworking' }, ... } }
  const fields = JSON.parse(res.getContentText()).fields || {};
  const out = {};
  Object.keys(fields).forEach(key => {
    const v = fields[key];
    if ('stringValue' in v) out[key] = v.stringValue;
    else if ('booleanValue' in v) out[key] = v.booleanValue;
    else if ('integerValue' in v) out[key] = Number(v.integerValue);
    else if ('doubleValue' in v) out[key] = v.doubleValue;
  });
  return out;
}
