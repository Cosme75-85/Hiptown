/**
 * SYSTÈME DE RÉSERVATION D'ESPACES — Code.gs (v3)
 * -------------------------------------------------
 * À coller dans script.google.com (Extensions > Apps Script)
 * Nécessite le fichier Index.html dans le même projet.
 */

// ==================== CONFIGURATION ====================

// capacity: 1 pour une salle classique (un seul créneau à la fois)
//           5 pour un espace type coworking (jusqu'à 5 réservations simultanées)
const SPACES = [
  { id: 'salleCanele', name: 'Salle Canelé', calendarId: 'c_fec46c2863f6a212b080da22b9370f4a167e38ce02fe9dcb0c6a45fd45f77e09@group.calendar.google.com', color: '#4285F4', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_salles_reunion_bordeaux_emergence_table_ovale_ecran.png', capacity: 1, maxPeople: 15, category: 'Salles de réunion', hourlyPrice: 60, halfDayPrice: 220, fullDayPrice: 420, allowMultiDay: true },
  { id: 'salleBouchon', name: 'Salle Bouchon', calendarId: 'c_eea6ff19556cc6e7f09bcf491b707839dfc04f39077ae9003fbda9e9bcf154c8@group.calendar.google.com', color: '#EA4335', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_salles_reunion_bordeaux_emergence_salle_equipee_ecran-1.png', capacity: 1, maxPeople: 12, category: 'Salles de réunion', hourlyPrice: 55, halfDayPrice: 200, fullDayPrice: 380, allowMultiDay: true },
  { id: 'salleDuneblanche', name: 'Salle Dune Blanche', calendarId: 'c_8f827f6fb5f22d9b567c96f9c2af8cee3b03d2cab5a0a0b5299de5f5eb5665e0@group.calendar.google.com', color: '#34A853', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_salles_reunion_bordeaux_emergence_salle_ronde_ecran.png', capacity: 1, maxPeople: 4, category: 'Salles de réunion', hourlyPrice: 30, halfDayPrice: 105, fullDayPrice: 200, allowMultiDay: true },
  { id: 'sallePuitsdamour', name: 'Salle Puits d amour', calendarId: 'c_61a5eca91edea3e3d9bf8c4d8b27f253baf756f7e5358031ecf175a0dbb0a628@group.calendar.google.com', color: '#FBBC05', photoUrl: 'https://drive.google.com/thumbnail?id=1XPUNS0f8N8HmVy4vitLiooGa_XFV-qa6&sz=w1000', capacity: 1, maxPeople: 12, category: 'Salles de réunion', hourlyPrice: 55, halfDayPrice: 200, fullDayPrice: 380, allowMultiDay: true },
  { id: 'cafecowork', name: 'Café Cowork', calendarId: 'c_860e1aed1cb31caa76635278dc4d7418a6559e241b0181e9ff7f7850faa3e620@group.calendar.google.com', color: '#9C27B0', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_espaces_communs_bordeaux_emergence_cuisine_partagee-800x455.png', capacity: 5, maxPeople: null, category: 'Café Cowork', hourlyPrice: 6.5, halfDayPrice: 18, fullDayPrice: 30 },
  // TODO : remplace par l'ID de ton 6ème agenda "Bureau 2 postes"
  { id: 'bureau2postes', name: 'Bureau 2 postes', calendarId: 'TODO_ID_BUREAU_2_POSTES@group.calendar.google.com', color: '#00ACC1', photoUrl: 'https://drive.google.com/thumbnail?id=1lVwerjtjuFl8Rlx2BDwdi1qxOwlaMBSH&sz=w1000', capacity: 2, maxPeople: null, quantitySelectable: true, onlyHalfOrFullDay: true, badgeLabel: '2 postes de travail', category: 'Location de bureau courte durée' }
];

const START_HOUR = 8;   // heure d'ouverture
const END_HOUR = 18;    // heure de fermeture

const PENDING_PREFIX = '[EN ATTENTE] ';
const CONFIRMED_PREFIX = '[CONFIRMÉ] ';

// Tarifs des services (€HT). Seul endroit où les modifier : la page les reçoit du serveur.
// Les tarifs des salles sont dans SPACES (hourlyPrice, halfDayPrice, fullDayPrice).
const PRICES = {
  breakfast: 5.5,         // par personne
  lunch: 30,              // par personne
  parkingHalfDay: 7.5,    // par place, créneau ≤ 5h
  parkingFullDay: 15,     // par place, créneau > 5h
  deskHalfDay: [15, 25],  // Bureau 2 postes : [1 poste, 2 postes] (tarif dégressif)
  deskFullDay: [30, 50]
};

// Une demande non traitée au bout de ce délai est supprimée (voir purgeExpiredRequests)
const PENDING_EXPIRY_DAYS = 14;
const NOTIFY_ON_EXPIRY = true;  // prévenir le client par email quand sa demande expire

// Email qui reçoit les demandes à valider
const OWNER_EMAIL = 'cc@hiptown.com';

// Fichier Drive joint à l'email de confirmation (plan d'accès au bâtiment)
const ACCESS_PLAN_FILE_ID = '103mmvdLZYGekCjWOXS0FrXej2YtfAgNH';

// Limites vérifiées côté serveur : on ne fait jamais confiance au navigateur,
// une requête peut être fabriquée à la main sans passer par le formulaire.
const MAX_MULTI_DAYS = 31;       // durée max d'une réservation multi-jours
const MAX_PARKING = 10;          // places de parking max par demande
const MAX_TEXT_LENGTH = 200;     // prénom, nom, entreprise, email, titre
const MAX_NOTES_LENGTH = 2000;   // note libre

// Données rangées dans l'événement lui-même (invisibles dans l'agenda) :
// plus fiables que relire la description, que l'on peut modifier à la main.
const TAG_EMAIL = 'requesterEmail';
const TAG_FIRST_NAME = 'firstName';
const TAG_QUANTITY = 'quantity';

// ==================== DIAGNOSTIC (à exécuter manuellement si besoin) ====================

function testCalendarAccess() {
  SPACES.forEach(space => {
    try {
      const cal = CalendarApp.getCalendarById(space.calendarId);
      if (cal === null) {
        Logger.log('❌ ' + space.name + ' — ID INTROUVABLE ou PAS D\'ACCÈS : "' + space.calendarId + '"');
      } else {
        Logger.log('✅ ' + space.name + ' — OK, nom réel de l\'agenda : "' + cal.getName() + '"');
      }
    } catch (err) {
      Logger.log('❌ ' + space.name + ' — ERREUR : ' + err.message);
    }
  });
}

function testEmail() {
  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: 'Test email réservation',
    htmlBody: '<p>Bonjour, ceci est un test.</p>'
  });
}

/**
 * Sélectionne "testAttachment" dans le menu déroulant, clique sur ▶ Exécuter,
 * puis regarde Affichage > Journaux pour voir la cause exacte si ça échoue.
 */
function testAttachment() {
  try {
    const file = DriveApp.getFileById(ACCESS_PLAN_FILE_ID);
    const blob = file.getBlob();
    Logger.log('✅ Fichier trouvé : "' + file.getName() + '" (' + blob.getBytes().length + ' octets)');
    MailApp.sendEmail({
      to: OWNER_EMAIL,
      subject: 'Test pièce jointe',
      htmlBody: '<p>Ceci est un test avec pièce jointe.</p>',
      attachments: [blob]
    });
    Logger.log('✅ Email de test envoyé avec la pièce jointe à ' + OWNER_EMAIL);
  } catch (err) {
    Logger.log('❌ ERREUR : ' + err.message);
  }
}

// ==================== SERVIR LA PAGE WEB ====================

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'approve' || action === 'reject') {
    return handleApprovalAction(e.parameter);
  }

  if (action === 'getSpacesMeta') {
    return jsonResponse(getSpacesMeta());
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

  // Aucune action : on sert la page HTML, avec l'URL de base injectée
  const template = HtmlService.createTemplateFromFile('Index');
  template.baseUrl = ScriptApp.getService().getUrl();
  // Constantes et calcul du devis envoyés tels quels à la page : un seul code source pour les deux côtés
  template.sharedScript = [
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

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==================== MÉTADONNÉES DES ESPACES (pour affichage initial) ====================

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Un seul appel Calendar pour tout le mois, au lieu d'un appel par jour
  let slots = [];
  let fetchError = false;
  try {
    const cal = CalendarApp.getCalendarById(space.calendarId);
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
    const monthEnd = new Date(year, month - 1, daysInMonth, 23, 59, 59);
    slots = toBookedSlots(cal.getEvents(monthStart, monthEnd));
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
      const daySlots = slots.filter(s => s.start < setTime(dateObj, END_HOUR, 0).getTime()
        && s.end > setTime(dateObj, START_HOUR, 0).getTime());

      let minRemaining = space.capacity;
      let maxRemaining = 0;
      let minMorning = space.capacity;
      let minAfternoon = space.capacity;
      for (let h = START_HOUR; h < END_HOUR; h++) {
        const rem = space.capacity - occupancy(daySlots, setTime(dateObj, h, 0).getTime(), setTime(dateObj, h + 1, 0).getTime());
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
  const space = SPACES.find(s => s.id === spaceId);
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
    const events = CalendarApp.getCalendarById(space.calendarId)
      .getEvents(setTime(date, START_HOUR, 0), setTime(date, END_HOUR, 0));
    const slots = toBookedSlots(events);
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const booked = occupancy(slots, setTime(date, h, 0).getTime(), setTime(date, h + 1, 0).getTime());
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
 * CACHE_TTL_SECONDS. Toute réservation, refus ou purge « vide » le cache aussitôt.
 * Seules les modifications faites à la main dans Google Agenda attendent l'expiration.
 * Aucun risque de double réservation : bookRoom revérifie toujours l'agenda réel.
 */
const CACHE_TTL_SECONDS = 600; // 10 minutes

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

  const space = SPACES.find(s => s.id === raw.spaceId);
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  b.startDate = parseDate(b.dateString);
  if (b.startDate < today) return { error: 'Impossible de réserver une date passée.' };

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
  b.numberOfDays = Math.round((b.endDate - b.startDate) / 86400000) + 1;
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
    return { success: false, message: 'Le système est occupé, réessaie dans quelques secondes.' };
  }

  try {
    const space = booking.space;
    const isMultiDay = booking.isMultiDay;
    const numberOfDays = booking.numberOfDays;
    const numberOfPeople = booking.numberOfPeople;
    const spaceQuantity = booking.spaceQuantity;
    const parkingQuantity = booking.parkingQuantity;

    const start = setTime(booking.startDate, booking.startHour, 0);
    const end = setTime(booking.endDate, booking.endHour, 0);

    const cal = CalendarApp.getCalendarById(space.calendarId);
    if (!cal) return { success: false, message: 'Agenda introuvable pour cet espace.' };

    // Vérifie la capacité disponible sur toute la plage demandée (jour unique ou multi-jours)
    const overlapping = cal.getEvents(start, end);
    const maxCount = maxOverlapInRange(overlapping, start, end);
    if (maxCount + spaceQuantity > space.capacity) {
      return { success: false, message: 'Ce créneau est complet, merci de choisir un autre horaire.' };
    }

    const baseTitle = booking.title || 'Réservation - ' + space.name;

    const { roomPrice, breakfastPrice, lunchPrice, parkingPrice, totalExtras, grandTotal } = computeQuote(space, booking);

    const servicesList = [];
    if (booking.wantsBreakfast) servicesList.push('Petit déjeuner (' + breakfastPrice.toFixed(2) + ' €HT)');
    if (booking.wantsLunch) servicesList.push('Déjeuner (' + lunchPrice.toFixed(2) + ' €HT)');
    if (parkingQuantity > 0) {
      servicesList.push(parkingQuantity + ' place(s) de parking' + (isMultiDay ? ' × ' + numberOfDays + ' jours' : '')
        + ' (' + parkingPrice.toFixed(2) + ' €HT)');
    }
    if (booking.wantsOther) servicesList.push('Autre (voir note)');

    const descriptionLines = [];
    descriptionLines.push('Demandé par : ' + booking.firstName + ' ' + booking.lastName + ' (' + booking.company + ')');
    descriptionLines.push('Email : ' + booking.requesterEmail);
    descriptionLines.push('Nombre de personnes : ' + numberOfPeople);
    if (isMultiDay) {
      descriptionLines.push('Réservation sur ' + numberOfDays + ' jours (du ' + booking.dateString + ' au ' + booking.endDateString + ')');
    }
    if (space.quantitySelectable) {
      descriptionLines.push('Postes réservés : ' + spaceQuantity);
    }
    if (roomPrice > 0) {
      descriptionLines.push('Prix location : ' + roomPrice.toFixed(2) + ' €HT');
    }
    if (servicesList.length > 0) {
      descriptionLines.push('Services : ' + servicesList.join(', '));
    }
    if (totalExtras > 0) {
      descriptionLines.push('Supplément estimé : ' + totalExtras.toFixed(2) + ' €HT');
    }
    if (grandTotal > 0) {
      descriptionLines.push('Total estimé : ' + grandTotal.toFixed(2) + ' €HT');
    }
    if (booking.notes) {
      descriptionLines.push('Note : ' + booking.notes);
    }
    descriptionLines.push('Statut : en attente de validation');

    const event = cal.createEvent(PENDING_PREFIX + baseTitle, start, end, {
      description: descriptionLines.join('\n')
    });
    event.setColor(CalendarApp.EventColor.ORANGE);
    event.setTag(TAG_EMAIL, booking.requesterEmail);
    event.setTag(TAG_FIRST_NAME, booking.firstName);
    event.setTag(TAG_QUANTITY, String(spaceQuantity));

    invalidateAvailabilityCache(); // la disponibilité vient de changer

    sendApprovalEmail({
      space: space,
      eventId: event.getId(),
      calendarId: space.calendarId,
      dateString: booking.dateString,
      endDateString: isMultiDay ? booking.endDateString : null,
      numberOfDays: numberOfDays,
      startHour: booking.startHour,
      endHour: booking.endHour,
      title: baseTitle,
      spaceQuantity: space.quantitySelectable ? spaceQuantity : null,
      roomPrice: roomPrice,
      grandTotal: grandTotal,
      firstName: booking.firstName,
      lastName: booking.lastName,
      company: booking.company,
      notes: booking.notes,
      numberOfPeople: numberOfPeople,
      servicesList: servicesList,
      totalExtras: totalExtras,
      requesterEmail: booking.requesterEmail
    });

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

// ==================== VÉRIFICATION D'UNE PLAGE MULTI-JOURS ====================

/** Indique si l'espace est libre sur toute la plage (8h le 1er jour → 18h le dernier). */
function checkRangeAvailability(spaceId, dateString, endDateString, quantity) {
  const space = SPACES.find(s => s.id === spaceId);
  if (!space || !isValidDateString(dateString) || !isValidDateString(endDateString)) {
    return { available: false };
  }
  const start = setTime(parseDate(dateString), START_HOUR, 0);
  const end = setTime(parseDate(endDateString), END_HOUR, 0);
  if (end <= start) return { available: false };
  try {
    const events = CalendarApp.getCalendarById(space.calendarId).getEvents(start, end);
    return { available: maxOverlapInRange(events, start, end) + (quantity || 1) <= space.capacity };
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
  const expiryLimit = new Date(now.getTime() - PENDING_EXPIRY_DAYS * 86400000);
  // Fenêtre de recherche : les demandes portent sur des dates futures, ou juste passées
  const searchStart = new Date(now.getTime() - 31 * 86400000);
  const searchEnd = new Date(now.getTime() + 400 * 86400000);

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
            MailApp.sendEmail({
              to: requesterEmail,
              subject: 'Votre demande de réservation — Hiptown',
              htmlBody:
                '<p>Bonjour' + (firstName ? ' ' + escapeHtml(firstName) : '') + ',</p>' +
                '<p>Nous n\'avons malheureusement pas pu traiter à temps votre demande de réservation pour <b>' + escapeHtml(space.name) + '</b>, elle a donc été annulée.</p>' +
                '<p>N\'hésitez pas à effectuer une nouvelle demande, nous serons ravis de vous accueillir.</p>' +
                '<p>Cordialement,<br>L\'équipe Hiptown</p>'
            });
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

function sendApprovalEmail(data) {
  const approveUrl = buildApprovalUrl('approve', data.calendarId, data.eventId);
  const rejectUrl = buildApprovalUrl('reject', data.calendarId, data.eventId);

  // Tout texte saisi par le client est échappé avant d'être inséré dans le HTML
  const e = escapeHtml;
  const subject = 'Nouvelle demande de réservation — ' + data.space.name;
  const htmlBody = `
    <p>Une nouvelle demande de réservation est en attente :</p>
    <ul>
      <li><b>Espace :</b> ${e(data.space.name)}</li>
      ${data.endDateString ? '<li><b>Dates :</b> du ' + data.dateString + ' au ' + data.endDateString + ' (' + data.numberOfDays + ' jours)</li>' : '<li><b>Date :</b> ' + data.dateString + '</li>'}
      <li><b>Horaire :</b> ${formatHour(data.startHour)} - ${formatHour(data.endHour)}${data.endDateString ? ' (chaque jour)' : ''}</li>
      <li><b>Titre :</b> ${e(data.title)}</li>
      <li><b>Nom :</b> ${e(data.firstName)} ${e(data.lastName)}</li>
      <li><b>Entreprise :</b> ${e(data.company)}</li>
      <li><b>Email :</b> ${e(data.requesterEmail)}</li>
      <li><b>Nombre de personnes :</b> ${data.numberOfPeople}</li>
      ${data.spaceQuantity ? '<li><b>Postes réservés :</b> ' + data.spaceQuantity + '</li>' : ''}
      ${data.roomPrice > 0 ? '<li><b>Prix location :</b> ' + data.roomPrice.toFixed(2) + ' €HT</li>' : ''}
      ${data.servicesList && data.servicesList.length > 0 ? '<li><b>Services :</b> ' + data.servicesList.join(', ') + '</li>' : ''}
      ${data.totalExtras > 0 ? '<li><b>Total suppléments :</b> ' + data.totalExtras.toFixed(2) + ' €HT</li>' : ''}
      ${data.grandTotal > 0 ? '<li><b>Total général :</b> ' + data.grandTotal.toFixed(2) + ' €HT</li>' : ''}
      ${data.notes ? '<li><b>Note :</b> ' + e(data.notes).replace(/\n/g, '<br>') + '</li>' : ''}
    </ul>
    <p>
      <a href="${approveUrl}" style="background:#137333;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;margin-right:10px;">✅ Approuver</a>
      <a href="${rejectUrl}" style="background:#c5221f;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;">❌ Refuser</a>
    </p>
  `;

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: subject,
    htmlBody: htmlBody
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
    '<div style="font-family:Roboto,Arial,sans-serif;padding:40px;text-align:center;">' +
    '<h2>' + escapeHtml(message) + '</h2>' +
    '</div>'
  );
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
  const greeting = '<p>Bonjour' + (firstName ? ' ' + escapeHtml(firstName) : '') + ',</p>';

  if (action === 'approve') {
    const cleanTitle = currentTitle.indexOf(PENDING_PREFIX) === 0
      ? currentTitle.substring(PENDING_PREFIX.length)
      : currentTitle;
    event.setTitle(CONFIRMED_PREFIX + cleanTitle);
    event.setColor(CalendarApp.EventColor.GREEN);

    if (requesterEmail) {
      let attachments = [];
      try {
        attachments = [DriveApp.getFileById(ACCESS_PLAN_FILE_ID).getBlob()];
      } catch (err) {
        // Si le fichier est inaccessible, on envoie quand même l'email sans pièce jointe
      }

      MailApp.sendEmail({
        to: requesterEmail,
        subject: 'Réservation confirmée — Hiptown',
        htmlBody:
          greeting +
          '<p>Merci d\'avoir choisi <b>Hiptown</b> !</p>' +
          '<p>Votre réservation <b>"' + escapeHtml(cleanTitle) + '"</b> est confirmée.</p>' +
          '<p>Lors de votre arrivée le jour J, appelez-nous ou scannez le QR code en bas, nous descendrons vous accueillir. Vous retrouverez en pièce jointe le plan d\'accès à notre bâtiment avec nos contacts.</p>' +
          '<p>La facture correspondante vous sera envoyée par email à la suite de cette réservation.</p>' +
          '<p>À bientôt,<br>L\'équipe Hiptown</p>',
        attachments: attachments
      });
    }
    return 'Réservation confirmée pour "' + cleanTitle + '".';
  }

  // action === 'reject' (garanti par la signature)
  event.deleteEvent();
  invalidateAvailabilityCache(); // le créneau est libéré
  if (requesterEmail) {
    MailApp.sendEmail({
      to: requesterEmail,
      subject: 'Réservation non disponible — Hiptown',
      htmlBody:
        greeting +
        '<p>Nous vous remercions pour votre demande de réservation.</p>' +
        '<p>Malheureusement, l\'espace n\'est pas disponible à la date et l\'horaire demandés.</p>' +
        '<p>N\'hésitez pas à effectuer une nouvelle demande sur un autre créneau, nous serons ravis de vous accueillir.</p>' +
        '<p>Cordialement,<br>L\'équipe Hiptown</p>'
    });
  }
  return 'Demande refusée et créneau libéré.';
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
  return parseInt(readEventData(event, TAG_QUANTITY, /Postes réservés : (\d+)/), 10) || 1;
}

/**
 * Convertit les événements Google en objets simples { start, end, qty } (en millisecondes).
 * Chaque getStartTime() / getTag() est un appel à Google, donc lent : on les fait
 * UNE seule fois par événement, puis toutes les boucles comparent de simples nombres.
 */
function toBookedSlots(events) {
  return events.map(ev => ({
    start: ev.getStartTime().getTime(),
    end: ev.getEndTime().getTime(),
    qty: getEventQuantity(ev)
  }));
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
 */
function computeQuote(space, q) {
  const duration = q.endHour - q.startHour;
  const isFullDay = duration > 5;

  let roomPrice = 0;
  if (space.quantitySelectable) {
    const deskPrices = isFullDay ? PRICES.deskFullDay : PRICES.deskHalfDay;
    roomPrice = q.spaceQuantity >= 2 ? deskPrices[1] : deskPrices[0];
  } else if (space.hourlyPrice) {
    if (q.numberOfDays > 1) roomPrice = space.fullDayPrice * q.numberOfDays; // multi-jours : journée complète × nb de jours
    else if (isFullDay) roomPrice = space.fullDayPrice;
    else if (duration === 5) roomPrice = space.halfDayPrice;
    else roomPrice = space.hourlyPrice * duration;
  }

  const breakfastPrice = q.wantsBreakfast ? PRICES.breakfast * q.numberOfPeople : 0;
  const lunchPrice = q.wantsLunch ? PRICES.lunch * q.numberOfPeople : 0;
  // Parking facturé par jour ; les repas, eux, sont comptés une fois par personne pour toute la réservation
  const parkingPrice = q.parkingQuantity * (isFullDay ? PRICES.parkingFullDay : PRICES.parkingHalfDay) * q.numberOfDays;
  const totalExtras = breakfastPrice + lunchPrice + parkingPrice;

  return {
    roomPrice: roomPrice,
    breakfastPrice: breakfastPrice,
    lunchPrice: lunchPrice,
    parkingPrice: parkingPrice,
    totalExtras: totalExtras,
    grandTotal: roomPrice + totalExtras
  };
}

/**
 * Occupation maximale (en unités de capacité) sur une plage [start, end),
 * heure par heure. Fonctionne pour une plage sur un seul jour ou étalée
 * sur plusieurs jours (réservation multi-jours).
 */
function maxOverlapInRange(events, start, end) {
  const slots = toBookedSlots(events);
  const HOUR = 60 * 60 * 1000;
  let maxCount = 0;
  for (let t = start.getTime(); t < end.getTime(); t += HOUR) {
    maxCount = Math.max(maxCount, occupancy(slots, t, t + HOUR));
  }
  return maxCount;
}

function parseDate(dateString) {
  const parts = dateString.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function setTime(date, hours, minutes) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function formatHour(h) {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return (minutes === 0) ? hours + 'h' : hours + 'h' + minutes;
}
