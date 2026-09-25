/**
 * SYSTÈME DE RÉSERVATION D'ESPACES — Code.gs
 * -------------------------------------------
 * Projet Apps Script en 4 fichiers :
 *   Config.gs   → tout ce qui se règle (espaces, horaires, tarifs, emails)
 *   Code.gs     → la logique (ce fichier)
 *   Tests.gs    → fonctions de diagnostic à lancer à la main
 *   Index.html  → la page affichée au client
 */

// ==================== SERVIR LA PAGE WEB ====================

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'approve' || action === 'reject') {
    return handleApprovalAction(e.parameter);
  }

  if (action === 'getAllMonthsAvailability') {
    const year = parseInt(e.parameter.year, 10);
    const month = parseInt(e.parameter.month, 10);
    return jsonResponse(getAllMonthsAvailability(year, month));
  }

  if (action === 'checkRangeAvailability') {
    const p = e.parameter;
    return jsonResponse(checkRangeAvailability(p.spaceId, p.dateString, p.endDateString, parseInt(p.quantity, 10)));
  }

  if (action === 'getDayAvailability') {
    return jsonResponse(getDayAvailability(e.parameter.spaceId, e.parameter.dateString));
  }

  // Aucune action : on sert la page HTML. Tout ce dont elle a besoin au démarrage
  // (URL, espaces, horaires, tarifs, calcul du devis) y est écrit directement :
  // un seul code source pour les deux côtés, et aucun appel réseau pour démarrer.
  const template = HtmlService.createTemplateFromFile('Index');
  template.sharedScript = [
    'const BASE_URL = ' + JSON.stringify(ScriptApp.getService().getUrl()) + ';',
    'const SPACES = ' + JSON.stringify(getSpacesMeta()) + ';',
    'const START_HOUR = ' + START_HOUR + ';',
    'const END_HOUR = ' + END_HOUR + ';',
    'const PRICES = ' + JSON.stringify(PRICES) + ';',
    computeQuote.toString()
  ].join('\n');
  return template.evaluate()
    .setTitle('Réservation d\'espaces')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Gère les requêtes d'écriture (réservation) envoyées en POST par fetch().
 * On évite volontairement google.script.run, qui passe par un iframe tiers
 * bloqué en navigation privée / par Safari (cookies tiers désactivés).
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'bookRoom') {
      return jsonResponse(bookRoom(body.payload));
    }
    return jsonResponse({ success: false, message: 'Action inconnue.' });
  } catch (err) {
    return jsonResponse({ success: false, message: 'Erreur serveur : ' + err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== MÉTADONNÉES DES ESPACES (pour affichage initial) ====================

/** Infos publiques des espaces (sans l'ID d'agenda, qui reste côté serveur). */
function getSpacesMeta() {
  return SPACES.map(s => ({
    id: s.id,
    name: s.name,
    color: s.color,
    photoUrl: s.photoUrl,
    capacity: s.capacity,
    maxPeople: s.maxPeople,
    quantitySelectable: !!s.quantitySelectable,
    onlyHalfOrFullDay: !!s.onlyHalfOrFullDay,
    badgeLabel: s.badgeLabel || null,
    category: s.category || 'Autres espaces',
    hourlyPrice: s.hourlyPrice || null,
    halfDayPrice: s.halfDayPrice || null,
    fullDayPrice: s.fullDayPrice || null,
    allowMultiDay: !!s.allowMultiDay
  }));
}

// ==================== DISPONIBILITÉ SUR UN MOIS (pour le calendrier coloré) ====================

/**
 * Disponibilité de tous les espaces pour un mois, en un seul appel serveur.
 * Chaque espace est mis en cache séparément : un agenda en erreur n'empêche
 * pas les autres d'être servis depuis le cache.
 */
function getAllMonthsAvailability(year, month) {
  const result = {};
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return result;
  SPACES.forEach(space => {
    result[space.id] = withCache(
      'month:' + space.id + ':' + year + '-' + month,
      () => getMonthAvailability(space, year, month),
      data => !data.days.some(d => d.status === 'error')
    );
  });
  return result;
}

function getMonthAvailability(space, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = startOfToday();

  // Une seule lecture de l'agenda pour tout le mois, au lieu d'une par jour
  let slots = [];
  let fetchError = false;
  try {
    slots = getBookedSlots(space, new Date(year, month - 1, 1), new Date(year, month, 1));
  } catch (err) {
    fetchError = true; // agenda introuvable (null) ou inaccessible
  }

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    let status = 'available';
    let remaining = space.capacity;
    let morningFree = true;
    let afternoonFree = true;

    if (dateObj < today) {
      status = 'past';
    } else if (fetchError) {
      status = 'error';
      remaining = 0;
    } else {
      // Ne garde que les réservations qui touchent réellement cette date
      // (utile pour les réservations multi-jours qui débordent sur d'autres jours)
      const daySlots = slots.filter(s => s.start < setTime(dateObj, END_HOUR).getTime()
        && s.end > setTime(dateObj, START_HOUR).getTime());

      let minRemaining = space.capacity;
      let maxRemaining = 0;
      let minMorning = space.capacity;
      let minAfternoon = space.capacity;
      for (let h = START_HOUR; h < END_HOUR; h++) {
        const rem = space.capacity - occupancy(daySlots, setTime(dateObj, h).getTime(), setTime(dateObj, h + 1).getTime());
        if (rem < minRemaining) minRemaining = rem;
        if (rem > maxRemaining) maxRemaining = rem;
        if (h < 13) {
          if (rem < minMorning) minMorning = rem;
        } else {
          if (rem < minAfternoon) minAfternoon = rem;
        }
      }
      // Le jour est "complet" seulement si AUCUNE heure n'est libre.
      // S'il reste au moins un créneau (ex: une seule heure prise sur la journée),
      // le jour doit rester affiché comme disponible.
      remaining = minRemaining;
      status = maxRemaining > 0 ? 'available' : 'full';
      morningFree = minMorning > 0;
      afternoonFree = minAfternoon > 0;
    }

    days.push({
      day: d,
      status: status,
      remaining: remaining,
      capacity: space.capacity,
      morningFree: morningFree,
      afternoonFree: afternoonFree
    });
  }

  return { year: year, month: month, days: days };
}

// ==================== DISPONIBILITÉ SUR UNE JOURNÉE (pour le choix d'horaire) ====================

function getDayAvailability(spaceId, dateString) {
  const space = findSpace(spaceId);
  if (!space || !isValidDateString(dateString)) return { hours: [], capacity: 0 };

  return withCache(
    'day:' + spaceId + ':' + dateString,
    () => computeDayAvailability(space, parseDate(dateString)),
    data => !data.error
  );
}

function computeDayAvailability(space, date) {
  const hours = [];
  let error = false;
  try {
    const slots = getBookedSlots(space, setTime(date, START_HOUR), setTime(date, END_HOUR));
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const booked = occupancy(slots, setTime(date, h).getTime(), setTime(date, h + 1).getTime());
      hours.push({ hour: h, remaining: space.capacity - booked });
    }
  } catch (err) {
    error = true;
    for (let h = START_HOUR; h < END_HOUR; h++) {
      hours.push({ hour: h, remaining: 0 });
    }
  }

  return { spaceId: space.id, name: space.name, capacity: space.capacity, hours: hours, error: error };
}

// ==================== CACHE DES DISPONIBILITÉS ====================

/**
 * Lire un agenda Google prend du temps (plusieurs secondes pour 6 agendas sur un mois).
 * On garde donc le résultat en mémoire côté serveur (CacheService, gratuit) pendant
 * CACHE_TTL_SECONDS (voir Config.gs). Toute réservation, refus ou purge « vide » le
 * cache aussitôt ; seules les modifications faites à la main dans Google Agenda
 * attendent l'expiration. Aucun risque de double réservation : bookRoom revérifie
 * toujours l'agenda réel.
 */

let cacheVersion = null; // mémorisé le temps d'une requête

/**
 * Renvoie la valeur en cache, sinon la calcule avec compute()
 * et la met en cache si isCacheable(valeur) (on ne garde jamais une erreur).
 */
function withCache(key, compute, isCacheable) {
  if (cacheVersion === null) {
    cacheVersion = PropertiesService.getScriptProperties().getProperty('CACHE_VERSION') || '0';
  }
  const cache = CacheService.getScriptCache();
  const fullKey = cacheVersion + ':' + key;

  const hit = cache.get(fullKey);
  if (hit) return JSON.parse(hit);

  const value = compute();
  if (isCacheable(value)) cache.put(fullKey, JSON.stringify(value), CACHE_TTL_SECONDS);
  return value;
}

/**
 * « Vide » tout le cache d'un coup : on change le numéro de version inclus dans
 * chaque clé, les anciennes entrées ne sont plus jamais lues et expirent seules.
 */
function invalidateAvailabilityCache() {
  cacheVersion = String(Date.now());
  PropertiesService.getScriptProperties().setProperty('CACHE_VERSION', cacheVersion);
}

// ==================== CRÉATION D'UNE DEMANDE DE RÉSERVATION ====================

/**
 * Vérifie et nettoie la demande reçue du navigateur.
 * Retourne { error: '...' } si la demande est refusée, sinon un objet propre
 * dont chaque champ a le bon type et respecte les règles de l'espace.
 */
function validateBooking(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Requête invalide.' };

  const space = findSpace(raw.spaceId);
  if (!space) return { error: 'Espace introuvable.' };

  const b = {
    space: space,
    firstName: cleanText(raw.firstName, MAX_TEXT_LENGTH),
    lastName: cleanText(raw.lastName, MAX_TEXT_LENGTH),
    company: cleanText(raw.company, MAX_TEXT_LENGTH),
    requesterEmail: cleanText(raw.requesterEmail, MAX_TEXT_LENGTH).toLowerCase(),
    title: cleanText(raw.title, MAX_TEXT_LENGTH),
    notes: cleanText(raw.notes, MAX_NOTES_LENGTH),
    numberOfPeople: toInt(raw.numberOfPeople),
    parkingQuantity: raw.parkingQuantity ? toInt(raw.parkingQuantity) : 0,
    spaceQuantity: space.quantitySelectable ? toInt(raw.spaceQuantity) : 1,
    wantsBreakfast: raw.wantsBreakfast === true,
    wantsLunch: raw.wantsLunch === true,
    wantsOther: raw.wantsOther === true,
    dateString: String(raw.dateString || ''),
    endDateString: raw.endDateString ? String(raw.endDateString) : '',
    startHour: toInt(raw.startHour),
    endHour: toInt(raw.endHour)
  };

  if (!b.firstName || !b.lastName || !b.company || !b.requesterEmail) {
    return { error: 'Merci de renseigner prénom, nom, entreprise et email.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.requesterEmail)) {
    return { error: 'Adresse email invalide.' };
  }
  if (!(b.numberOfPeople >= 1)) {
    return { error: 'Merci de renseigner le nombre de personnes.' };
  }
  if (space.maxPeople && b.numberOfPeople > space.maxPeople) {
    return { error: space.name + ' accueille au maximum ' + space.maxPeople + ' personnes.' };
  }
  if (!(b.parkingQuantity >= 0 && b.parkingQuantity <= MAX_PARKING)) {
    return { error: 'Nombre de places de parking invalide (maximum ' + MAX_PARKING + ').' };
  }
  if (!(b.spaceQuantity >= 1 && b.spaceQuantity <= space.capacity)) {
    return { error: 'Nombre de postes invalide.' };
  }

  // --- Dates ---
  if (!isValidDateString(b.dateString)) return { error: 'Date invalide.' };
  b.startDate = parseDate(b.dateString);
  if (b.startDate < startOfToday()) return { error: 'Impossible de réserver une date passée.' };

  // Réservation multi-jours : chaque jour de la plage est réservé en journée complète (8h-18h)
  b.isMultiDay = !!b.endDateString && b.endDateString !== b.dateString;
  if (b.isMultiDay) {
    if (!space.allowMultiDay) return { error: 'Cet espace ne se réserve pas sur plusieurs jours.' };
    if (!isValidDateString(b.endDateString)) return { error: 'Date de fin invalide.' };
    b.endDate = parseDate(b.endDateString);
    if (b.endDate < b.startDate) return { error: 'La date de fin doit être après la date de début.' };
    b.startHour = START_HOUR;
    b.endHour = END_HOUR;
  } else {
    b.endDate = b.startDate;
  }
  b.numberOfDays = Math.round((b.endDate - b.startDate) / DAY_MS) + 1;
  if (b.numberOfDays > MAX_MULTI_DAYS) {
    return { error: 'Une réservation ne peut pas dépasser ' + MAX_MULTI_DAYS + ' jours.' };
  }

  // --- Horaires ---
  if (!(b.startHour >= START_HOUR && b.endHour <= END_HOUR && b.startHour < b.endHour)) {
    return { error: 'Créneau invalide (horaires 8h-18h uniquement).' };
  }
  if (space.onlyHalfOrFullDay) {
    const slot = b.startHour + '-' + b.endHour;
    const allowed = [START_HOUR + '-13', '13-' + END_HOUR, START_HOUR + '-' + END_HOUR];
    if (allowed.indexOf(slot) === -1) {
      return { error: 'Cet espace se réserve uniquement à la demi-journée ou à la journée.' };
    }
  }

  return b;
}

function bookRoom(rawBooking) {
  // Validation AVANT de prendre le verrou : une demande invalide ne bloque personne
  const booking = validateBooking(rawBooking);
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
    if (!cal) return { success: false, message: 'Agenda introuvable pour cet espace.' };

    // Vérifie la capacité disponible sur toute la plage demandée (jour unique ou multi-jours)
    if (maxOverlapInRange(getBookedSlots(space, start, end), start, end) + booking.spaceQuantity > space.capacity) {
      return { success: false, message: 'Ce créneau est complet, merci de choisir un autre horaire.' };
    }

    const title = booking.title || 'Réservation - ' + space.name;
    const summary = summarizeBooking(booking, computeQuote(space, booking), title);

    const event = cal.createEvent(PENDING_PREFIX + title, start, end, {
      description: summary.map(([label, value]) => label + ' : ' + value)
        .concat('Statut : en attente de validation')
        .join('\n')
    });
    event.setColor(CalendarApp.EventColor.ORANGE);
    event.setTag(TAG_EMAIL, booking.requesterEmail);
    event.setTag(TAG_FIRST_NAME, booking.firstName);
    event.setTag(TAG_QUANTITY, String(booking.spaceQuantity));
    event.setTag(TAG_BOOKING, JSON.stringify(bookingForQuote(booking)));

    invalidateAvailabilityCache(); // la disponibilité vient de changer
    sendApprovalEmail(space, event.getId(), summary);

    return {
      success: true,
      message: 'Demande envoyée ! ' + space.name + ' est provisoirement bloqué en attente de validation.'
    };

  } catch (err) {
    return { success: false, message: 'Erreur lors de la demande : ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Données de la demande nécessaires au devis, enregistrées dans l'événement
 * (tag limité à 1024 caractères : les textes libres, titre et note, n'y vont pas).
 */
function bookingForQuote(b) {
  return {
    spaceId: b.space.id,
    dateString: b.dateString,
    endDateString: b.isMultiDay ? b.endDateString : '',
    startHour: b.startHour,
    endHour: b.endHour,
    numberOfDays: b.numberOfDays,
    spaceQuantity: b.spaceQuantity,
    numberOfPeople: b.numberOfPeople,
    wantsBreakfast: b.wantsBreakfast,
    wantsLunch: b.wantsLunch,
    parkingQuantity: b.parkingQuantity,
    firstName: b.firstName,
    lastName: b.lastName,
    company: b.company
  };
}

/**
 * Récapitulatif de la demande sous forme de lignes [libellé, valeur].
 * Une seule source pour la description de l'événement ET l'email de validation.
 */
function summarizeBooking(b, quote, title) {
  const euros = n => n.toFixed(2) + ' €HT';

  const services = [];
  if (b.wantsBreakfast) services.push('Petit déjeuner (' + euros(quote.breakfastPrice) + ')');
  if (b.wantsLunch) services.push('Déjeuner (' + euros(quote.lunchPrice) + ')');
  if (b.parkingQuantity > 0) {
    services.push(b.parkingQuantity + ' place(s) de parking' + (b.isMultiDay ? ' × ' + b.numberOfDays + ' jours' : '')
      + ' (' + euros(quote.parkingPrice) + ')');
  }
  if (b.wantsOther) services.push('Autre (voir note)');

  return [
    ['Espace', b.space.name],
    b.isMultiDay
      ? ['Dates', 'du ' + b.dateString + ' au ' + b.endDateString + ' (' + b.numberOfDays + ' jours)']
      : ['Date', b.dateString],
    ['Horaire', b.startHour + 'h - ' + b.endHour + 'h' + (b.isMultiDay ? ' (chaque jour)' : '')],
    ['Titre', title],
    // « Demandé par », « Email » et « Postes réservés » sont aussi relus par readEventData (anciennes demandes)
    ['Demandé par', b.firstName + ' ' + b.lastName + ' (' + b.company + ')'],
    ['Email', b.requesterEmail],
    ['Nombre de personnes', b.numberOfPeople],
    b.space.quantitySelectable && ['Postes réservés', b.spaceQuantity],
    quote.roomPrice > 0 && ['Prix location', euros(quote.roomPrice)],
    services.length > 0 && ['Services', services.join(', ')],
    quote.totalExtras > 0 && ['Total suppléments', euros(quote.totalExtras)],
    quote.grandTotal > 0 && ['Total estimé', euros(quote.grandTotal)],
    b.notes && ['Note', b.notes]
  ].filter(Boolean); // retire les lignes non applicables (false)
}

// ==================== VÉRIFICATION D'UNE PLAGE MULTI-JOURS ====================

/** Indique si l'espace est libre sur toute la plage (8h le 1er jour → 18h le dernier). */
function checkRangeAvailability(spaceId, dateString, endDateString, quantity) {
  const space = findSpace(spaceId);
  if (!space || !isValidDateString(dateString) || !isValidDateString(endDateString)) {
    return { available: false };
  }
  const start = setTime(parseDate(dateString), START_HOUR);
  const end = setTime(parseDate(endDateString), END_HOUR);
  if (end <= start) return { available: false };
  try {
    return { available: maxOverlapInRange(getBookedSlots(space, start, end), start, end) + (quantity || 1) <= space.capacity };
  } catch (err) {
    return { available: false };
  }
}

// ==================== EXPIRATION DES DEMANDES NON TRAITÉES ====================

/**
 * À exécuter UNE fois à la main (menu déroulant > installExpiryTrigger > ▶ Exécuter) :
 * programme purgeExpiredRequests chaque nuit vers 3h. Relancer ne crée pas de doublon.
 */
function installExpiryTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'purgeExpiredRequests')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('purgeExpiredRequests').timeBased().everyDays(1).atHour(3).create();
  Logger.log('✅ Purge quotidienne programmée.');
}

/**
 * Supprime les demandes restées « EN ATTENTE » plus de PENDING_EXPIRY_DAYS jours
 * après leur création, pour libérer les créneaux qu'elles bloquent.
 */
function purgeExpiredRequests() {
  const now = new Date();
  const expiryLimit = new Date(now.getTime() - PENDING_EXPIRY_DAYS * DAY_MS);
  // Fenêtre de recherche : les demandes portent sur des dates futures, ou juste passées
  const searchStart = new Date(now.getTime() - 31 * DAY_MS);
  const searchEnd = new Date(now.getTime() + 400 * DAY_MS);

  SPACES.forEach(space => {
    try {
      const cal = CalendarApp.getCalendarById(space.calendarId);
      if (!cal) return;
      cal.getEvents(searchStart, searchEnd)
        .filter(ev => ev.getTitle().indexOf(PENDING_PREFIX) === 0 && ev.getDateCreated() < expiryLimit)
        .forEach(ev => {
          const requesterEmail = getRequesterEmail(ev);
          const firstName = getRequesterFirstName(ev);
          Logger.log('🗑️ Demande expirée supprimée : ' + space.name + ' — ' + ev.getTitle());
          ev.deleteEvent();
          invalidateAvailabilityCache();
          if (NOTIFY_ON_EXPIRY && requesterEmail) {
            sendClientEmail(requesterEmail, firstName, 'Votre demande de réservation — Hiptown', [
              'Nous n\'avons malheureusement pas pu traiter à temps votre demande de réservation pour <b>' + escapeHtml(space.name) + '</b>, elle a donc été annulée.',
              'N\'hésitez pas à effectuer une nouvelle demande, nous serons ravis de vous accueillir.'
            ], 'Cordialement');
          }
        });
    } catch (err) {
      Logger.log('❌ ' + space.name + ' — ERREUR : ' + err.message);
    }
  });
}

// ==================== EMAIL DE VALIDATION ====================

/**
 * Lien Approuver/Refuser signé : la signature (HMAC) prouve que le lien a été
 * généré par ce script. Sans la clé secrète, impossible d'en fabriquer un valide.
 */
function buildApprovalUrl(action, calendarId, eventId) {
  return ScriptApp.getService().getUrl()
    + '?action=' + action
    + '&calId=' + encodeURIComponent(calendarId)
    + '&eventId=' + encodeURIComponent(eventId)
    + '&sig=' + encodeURIComponent(signApproval(action, calendarId, eventId));
}

function sendApprovalEmail(space, eventId, summary) {
  const button = (url, color, label) =>
    '<a href="' + url + '" style="background:' + color + ';color:#ffffff;padding:10px 18px;border-radius:6px;'
    + 'text-decoration:none;margin-right:10px;display:inline-block;">' + label + '</a>';

  // Tout texte saisi par le client est échappé avant d'être inséré dans le HTML
  const items = summary.map(([label, value]) =>
    '<li><b>' + label + ' :</b> ' + escapeHtml(value).replace(/\n/g, '<br>') + '</li>').join('');

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: 'Nouvelle demande de réservation — ' + space.name,
    htmlBody:
      '<p>Une nouvelle demande de réservation est en attente :</p>' +
      '<ul>' + items + '</ul>' +
      '<p>' +
      button(buildApprovalUrl('approve', space.calendarId, eventId), '#137333', '✅ Approuver') +
      button(buildApprovalUrl('reject', space.calendarId, eventId), '#c5221f', '❌ Refuser') +
      '</p>'
  });
}

// ==================== TRAITEMENT APPROUVER / REFUSER ====================

function handleApprovalAction(params) {
  const action = params.action;
  const calId = params.calId;
  const eventId = params.eventId;

  let message = '';
  try {
    // Seuls les agendas des espaces configurés sont acceptés, avec une signature valide
    const isKnownCalendar = SPACES.some(s => s.calendarId === calId);
    if (!isKnownCalendar || !eventId || params.sig !== signApproval(action, calId, eventId)) {
      message = 'Lien invalide.';
    } else {
      message = applyApprovalAction(action, CalendarApp.getCalendarById(calId).getEventById(eventId));
    }
  } catch (err) {
    message = 'Erreur : ' + err.message;
  }

  return HtmlService.createHtmlOutput(
    '<div style="font-family:Montserrat,Arial,sans-serif;color:#1E1847;padding:40px 16px;text-align:center;">' +
    '<h2>' + escapeHtml(message) + '</h2>' +
    '</div>'
  ).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Approuve ou refuse la demande, prévient le client, et renvoie le message à afficher. */
function applyApprovalAction(action, event) {
  if (!event) return 'Cette demande n\'existe plus (peut-être déjà traitée).';

  const currentTitle = event.getTitle();
  if (currentTitle.indexOf(CONFIRMED_PREFIX) === 0 && action === 'approve') {
    return 'Cette réservation est déjà confirmée.'; // évite un 2e email au client
  }

  // L'email vient de l'événement, jamais de l'URL : un lien modifié ne peut pas écrire à un tiers
  const requesterEmail = getRequesterEmail(event);
  const firstName = getRequesterFirstName(event);

  if (action === 'approve') {
    const cleanTitle = currentTitle.indexOf(PENDING_PREFIX) === 0
      ? currentTitle.substring(PENDING_PREFIX.length)
      : currentTitle;
    event.setTitle(CONFIRMED_PREFIX + cleanTitle);
    event.setColor(CalendarApp.EventColor.GREEN);

    // Devis : une erreur ici ne doit pas bloquer la confirmation, on la signale au gérant
    let quote = null;
    let quoteStatus = 'Pas de devis : demande créée avant l\'ajout des devis automatiques.';
    try {
      quote = createQuoteForEvent(event);
      if (quote) {
        quoteStatus = 'Devis n°' + quote.number + ' joint à l\'email. ' + (quote.driveError
          ? '⚠️ Copie Drive impossible (lancer testDevis dans Apps Script pour autoriser Drive) : ' + quote.driveError
          : 'Copie dans le dossier Drive « ' + DEVIS.driveFolderName + ' ».');
        event.setDescription(event.getDescription() + '\nDevis : ' + quote.number);
      }
    } catch (err) {
      quoteStatus = '⚠️ Devis non généré : ' + err.message;
    }

    if (requesterEmail) {
      const attachments = quote ? [quote.pdf] : [];
      try {
        attachments.push(DriveApp.getFileById(ACCESS_PLAN_FILE_ID).getBlob());
      } catch (err) {
        // Plan d'accès inaccessible : on envoie quand même l'email
      }

      sendClientEmail(requesterEmail, firstName, 'Réservation confirmée — Hiptown', [
        'Merci d\'avoir choisi <b>Hiptown</b> !',
        'Votre réservation <b>"' + escapeHtml(cleanTitle) + '"</b> est confirmée.',
        'Lors de votre arrivée le jour J, appelez-nous ou scannez le QR code en bas, nous descendrons vous accueillir. Vous retrouverez en pièce jointe le plan d\'accès à notre bâtiment avec nos contacts.',
        quote
          ? 'Vous trouverez également en pièce jointe votre devis n°<b>' + quote.number + '</b>. La facture correspondante vous sera envoyée par email à la suite de cette réservation.'
          : 'La facture correspondante vous sera envoyée par email à la suite de cette réservation.'
      ], 'À bientôt', attachments);
    }
    return 'Réservation confirmée pour "' + cleanTitle + '". ' + quoteStatus;
  }

  // action === 'reject' (garanti par la signature)
  event.deleteEvent();
  invalidateAvailabilityCache(); // le créneau est libéré
  if (requesterEmail) {
    sendClientEmail(requesterEmail, firstName, 'Réservation non disponible — Hiptown', [
      'Nous vous remercions pour votre demande de réservation.',
      'Malheureusement, l\'espace n\'est pas disponible à la date et l\'horaire demandés.',
      'N\'hésitez pas à effectuer une nouvelle demande sur un autre créneau, nous serons ravis de vous accueillir.'
    ], 'Cordialement');
  }
  return 'Demande refusée et créneau libéré.';
}

/**
 * Email au client, avec la formule d'appel et la signature communes à tous les messages.
 * Les paragraphes sont du HTML écrit par nous : tout texte saisi par le client
 * doit y être passé par escapeHtml avant.
 */
function sendClientEmail(to, firstName, subject, paragraphs, signOff, attachments) {
  MailApp.sendEmail({
    to: to,
    subject: subject,
    htmlBody:
      '<p>Bonjour' + (firstName ? ' ' + escapeHtml(firstName) : '') + ',</p>' +
      paragraphs.map(p => '<p>' + p + '</p>').join('') +
      '<p>' + signOff + ',<br>L\'équipe Hiptown</p>',
    attachments: attachments || []
  });
}

// ==================== SÉCURITÉ ====================

/**
 * Clé secrète propre à ce script, générée automatiquement au premier usage
 * et stockée dans les propriétés du script (jamais dans le code ni sur GitHub).
 */
function getSigningSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SIGNING_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SIGNING_SECRET', secret);
  }
  return secret;
}

function signApproval(action, calendarId, eventId) {
  const bytes = Utilities.computeHmacSha256Signature(action + '|' + calendarId + '|' + eventId, getSigningSecret());
  return Utilities.base64EncodeWebSafe(bytes);
}

/** Neutralise les caractères HTML pour afficher un texte tel quel, sans qu'il soit interprété. */
function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

/** Entier strict, sinon NaN (qui fait échouer toutes les comparaisons de validation). */
function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function isValidDateString(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  // Rejette les dates impossibles (ex: 2026-02-31, que JavaScript décalerait au 3 mars)
  const d = parseDate(dateString);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') === dateString;
}

// ==================== UTILITAIRES ====================

/**
 * Lit une donnée de la demande dans les tags de l'événement, sinon dans sa
 * description (demandes créées avant l'ajout des tags, ou saisies à la main
 * dans l'agenda).
 */
function readEventData(event, tagName, descriptionRegex) {
  const tag = event.getTag(tagName);
  if (tag) return tag;
  const match = (event.getDescription() || '').match(descriptionRegex);
  return match ? match[1] : '';
}

function getRequesterEmail(event) {
  return readEventData(event, TAG_EMAIL, /Email : (\S+)/);
}

function getRequesterFirstName(event) {
  return readEventData(event, TAG_FIRST_NAME, /Demandé par : (\S+)/);
}

/**
 * Certains espaces (Café Cowork, Bureau 2 postes) acceptent plusieurs
 * réservations simultanées. Chaque événement peut occuper plus d'une
 * "unité" de capacité (ex: 2 postes réservés par la même personne).
 * Par défaut 1 si l'information est absente.
 */
function getEventQuantity(event) {
  const tag = event.getTag(TAG_QUANTITY);
  return quantityFrom(tag, tag ? '' : event.getDescription());
}

/**
 * Réservations d'un espace entre deux dates, sous forme d'objets simples
 * { start, end, qty } (en millisecondes) sur lesquels les boucles calculent vite.
 *
 * Voie rapide : le service avancé « Google Calendar API » (à activer une fois dans
 * l'éditeur : Services > + > Google Calendar API). Un seul appel par agenda renvoie
 * début, fin et quantité de TOUS les événements.
 * Voie de secours (service non activé) : CalendarApp, qui fait un appel à Google
 * par information et par événement, donc nettement plus lent.
 */
function getBookedSlots(space, from, to) {
  // Une salle de capacité 1 est bloquée par n'importe quel événement : inutile de lire la quantité
  const readQty = space.capacity > 1;

  if (typeof Calendar !== 'undefined') {
    const slots = [];
    let pageToken;
    do {
      const page = Calendar.Events.list(space.calendarId, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,  // événements récurrents dépliés, comme CalendarApp
        maxResults: 2500,
        pageToken: pageToken,
        fields: 'nextPageToken,items(start,end,description,extendedProperties/private)'
      });
      (page.items || []).forEach(ev => {
        const tags = (ev.extendedProperties && ev.extendedProperties.private) || {};
        slots.push({
          start: apiEventTime(ev.start),
          end: apiEventTime(ev.end),
          qty: readQty ? quantityFrom(tags[TAG_QUANTITY], ev.description) : 1
        });
      });
      pageToken = page.nextPageToken;
    } while (pageToken);
    return slots;
  }

  const cal = CalendarApp.getCalendarById(space.calendarId);
  if (!cal) throw new Error('Agenda introuvable : ' + space.calendarId);
  return cal.getEvents(from, to).map(ev => ({
    start: ev.getStartTime().getTime(),
    end: ev.getEndTime().getTime(),
    qty: readQty ? getEventQuantity(ev) : 1
  }));
}

/** Heure d'un événement renvoyé par l'API : dateTime, ou date seule (journée entière, minuit local). */
function apiEventTime(time) {
  return (time.dateTime ? new Date(time.dateTime) : parseDate(time.date)).getTime();
}

/** Nombre de postes : tag de l'événement, sinon ligne « Postes réservés » de la description, sinon 1. */
function quantityFrom(tagValue, description) {
  const match = tagValue ? null : (description || '').match(/Postes réservés : (\d+)/);
  return parseInt(tagValue || (match && match[1]), 10) || 1;
}

/** Nombre d'unités de capacité occupées sur l'intervalle [from, to) (millisecondes). */
function occupancy(slots, from, to) {
  let count = 0;
  slots.forEach(s => {
    if (s.start < to && s.end > from) count += s.qty;
  });
  return count;
}

/**
 * Calcul du devis. Fonction « pure » (aucun service Google) : elle est
 * utilisée par le serveur ET injectée telle quelle dans la page (voir doGet),
 * donc le prix affiché au client est toujours le prix facturé.
 *
 * @param {Object} space  l'espace (tarifs horaire / demi-journée / journée)
 * @param {Object} q      startHour, endHour, numberOfDays, spaceQuantity,
 *                        numberOfPeople, wantsBreakfast, wantsLunch, parkingQuantity
 * @return {Object} lines (lignes du devis : label, qty, unitPrice, total),
 *                  totaux par type, totalHT, totalVAT, totalTTC
 */
function computeQuote(space, q) {
  const round = n => Math.round(n * 100) / 100;
  const duration = q.endHour - q.startHour;
  const isFullDay = duration > 5;
  const days = q.numberOfDays || 1;
  const period = isFullDay ? 'journée complète' : (duration === 5 ? 'demi-journée' : duration + 'h');

  const lines = [];
  const addLine = (type, label, qty, unitPrice) => {
    if (qty > 0 && unitPrice > 0) lines.push({ type: type, label: label, qty: qty, unitPrice: unitPrice, total: round(qty * unitPrice) });
  };

  // Location de l'espace
  const spaceLabel = space.name + (space.maxPeople ? ' (' + space.maxPeople + ' pers.)' : '');
  if (space.quantitySelectable) {
    const deskPrices = isFullDay ? PRICES.deskFullDay : PRICES.deskHalfDay;
    addLine('room', spaceLabel + ' – ' + q.spaceQuantity + ' poste(s) – ' + period, 1, deskPrices[q.spaceQuantity >= 2 ? 1 : 0]);
  } else if (space.hourlyPrice) {
    if (days > 1) addLine('room', spaceLabel + ' – journée complète', days, space.fullDayPrice); // multi-jours : 1 journée par jour
    else if (isFullDay) addLine('room', spaceLabel + ' – journée complète', 1, space.fullDayPrice);
    else if (duration === 5) addLine('room', spaceLabel + ' – demi-journée', 1, space.halfDayPrice);
    else addLine('room', spaceLabel + ' – à l\'heure', duration, space.hourlyPrice);
  }

  // Services : repas comptés une fois par personne, parking par place et par jour
  addLine('breakfast', 'Petit déjeuner', q.wantsBreakfast ? q.numberOfPeople : 0, PRICES.breakfast);
  addLine('lunch', 'Déjeuner', q.wantsLunch ? q.numberOfPeople : 0, PRICES.lunch);
  addLine('parking', 'Place de parking – ' + (isFullDay ? 'journée' : 'demi-journée'),
    q.parkingQuantity * days, isFullDay ? PRICES.parkingFullDay : PRICES.parkingHalfDay);

  const totalOf = type => round(lines.filter(l => l.type === type).reduce((sum, l) => sum + l.total, 0));
  const totalHT = round(lines.reduce((sum, l) => sum + l.total, 0));
  const totalVAT = round(totalHT * PRICES.vatRate);

  return {
    lines: lines,
    roomPrice: totalOf('room'),
    breakfastPrice: totalOf('breakfast'),
    lunchPrice: totalOf('lunch'),
    parkingPrice: totalOf('parking'),
    totalExtras: round(totalHT - totalOf('room')),
    grandTotal: totalHT, // alias historique du total HT
    totalHT: totalHT,
    totalVAT: totalVAT,
    totalTTC: round(totalHT + totalVAT)
  };
}

/**
 * Occupation maximale (en unités de capacité) sur une plage [start, end),
 * heure par heure. Fonctionne pour une plage sur un seul jour ou étalée
 * sur plusieurs jours (réservation multi-jours).
 */
function maxOverlapInRange(slots, start, end) {
  const HOUR = 60 * 60 * 1000;
  let maxCount = 0;
  for (let t = start.getTime(); t < end.getTime(); t += HOUR) {
    maxCount = Math.max(maxCount, occupancy(slots, t, t + HOUR));
  }
  return maxCount;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function findSpace(spaceId) {
  return SPACES.find(s => s.id === spaceId);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function parseDate(dateString) {
  const parts = dateString.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

/** Copie de la date, placée à l'heure pile demandée. */
function setTime(date, hours) {
  const d = new Date(date);
  d.setHours(hours, 0, 0, 0);
  return d;
}
