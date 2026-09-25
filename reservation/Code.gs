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

const PRICE_BREAKFAST = 5.5;      // €/personne
const PRICE_LUNCH = 30;           // €/personne
const PRICE_PARKING_HALF_DAY = 7.5;  // €/place, créneau ≤ 5h
const PRICE_PARKING_FULL_DAY = 15;   // €/place, créneau > 5h

// Bureau 2 postes : tarif dégressif si la même personne prend les 2 places
const DESK_PRICE_FULL_DAY_1 = 30;
const DESK_PRICE_FULL_DAY_2 = 50;
const DESK_PRICE_HALF_DAY_1 = 15;
const DESK_PRICE_HALF_DAY_2 = 25;

// Email qui reçoit les demandes à valider
const OWNER_EMAIL = 'cc@hiptown.com';

// Fichier Drive joint à l'email de confirmation (plan d'accès au bâtiment)
const ACCESS_PLAN_FILE_ID = '103mmvdLZYGekCjWOXS0FrXej2YtfAgNH';

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

  if (action === 'getDayAvailability') {
    return jsonResponse(getDayAvailability(e.parameter.spaceId, e.parameter.dateString));
  }

  // Aucune action : on sert la page HTML, avec l'URL de base injectée
  const template = HtmlService.createTemplateFromFile('Index');
  template.baseUrl = ScriptApp.getService().getUrl();
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
 * @param {string} spaceId
 * @param {number} year
 * @param {number} month  1-12
 */
/**
 * Version groupée : récupère la disponibilité des 5 espaces en un seul appel serveur
 * (plus rapide que 5 appels séparés).
 */
function getAllMonthsAvailability(year, month) {
  const result = {};
  SPACES.forEach(space => {
    result[space.id] = getMonthAvailability(space.id, year, month);
  });
  return result;
}

function getMonthAvailability(spaceId, year, month) {
  const space = SPACES.find(s => s.id === spaceId);
  if (!space) return { year: year, month: month, days: [] };

  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let cal = null;
  try {
    cal = CalendarApp.getCalendarById(space.calendarId);
  } catch (err) {
    cal = null;
  }

  // Un seul appel Calendar pour tout le mois, au lieu d'un appel par jour
  let monthEvents = [];
  let quantityCache = null;
  let fetchError = false;
  if (cal !== null) {
    try {
      const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
      const monthEnd = new Date(year, month - 1, daysInMonth, 23, 59, 59);
      monthEvents = cal.getEvents(monthStart, monthEnd);
      quantityCache = precomputeQuantities(monthEvents); // calculé une seule fois pour tout le mois
    } catch (err) {
      fetchError = true;
    }
  } else {
    fetchError = true;
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
      // Ne garde que les événements qui touchent réellement cette date
      // (utile pour les réservations multi-jours qui débordent sur d'autres jours)
      const dayStart = setTime(dateObj, START_HOUR, 0);
      const dayEnd = setTime(dateObj, END_HOUR, 0);
      const relevantEvents = monthEvents.filter(ev => ev.getStartTime() < dayEnd && ev.getEndTime() > dayStart);

      let minRemaining = space.capacity;
      let maxRemaining = 0;
      let minMorning = space.capacity;
      let minAfternoon = space.capacity;
      for (let h = START_HOUR; h < END_HOUR; h++) {
        const hourStart = setTime(dateObj, h, 0);
        const hourEnd = setTime(dateObj, h + 1, 0);
        let count = 0;
        relevantEvents.forEach(ev => {
          if (ev.getStartTime() < hourEnd && ev.getEndTime() > hourStart) {
            count += quantityCache.get(ev);
          }
        });
        const rem = space.capacity - count;
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
  if (!space) return { hours: [], capacity: 0 };

  const date = parseDate(dateString);
  const dayStart = setTime(date, START_HOUR, 0);
  const dayEnd = setTime(date, END_HOUR, 0);

  const hours = [];
  try {
    const cal = CalendarApp.getCalendarById(space.calendarId);
    const events = cal.getEvents(dayStart, dayEnd);
    const quantityCache = precomputeQuantities(events);
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const hourStart = setTime(date, h, 0);
      const hourEnd = setTime(date, h + 1, 0);
      let count = 0;
      events.forEach(ev => {
        if (ev.getStartTime() < hourEnd && ev.getEndTime() > hourStart) {
          count += quantityCache.get(ev);
        }
      });
      hours.push({ hour: h, remaining: space.capacity - count });
    }
  } catch (err) {
    for (let h = START_HOUR; h < END_HOUR; h++) {
      hours.push({ hour: h, remaining: 0 });
    }
  }

  return { spaceId: spaceId, name: space.name, capacity: space.capacity, hours: hours };
}

// ==================== CRÉATION D'UNE DEMANDE DE RÉSERVATION ====================

function bookRoom(booking) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'Le système est occupé, réessaie dans quelques secondes.' };
  }

  try {
    const space = SPACES.find(s => s.id === booking.spaceId);
    if (!space) return { success: false, message: 'Espace introuvable.' };

    if (!booking.firstName || !booking.lastName || !booking.company || !booking.requesterEmail) {
      return { success: false, message: 'Merci de renseigner prénom, nom, entreprise et email.' };
    }

    const numberOfPeople = parseInt(booking.numberOfPeople, 10);
    if (!numberOfPeople || numberOfPeople < 1) {
      return { success: false, message: 'Merci de renseigner le nombre de personnes.' };
    }

    if (booking.startHour < START_HOUR || booking.endHour > END_HOUR || booking.startHour >= booking.endHour) {
      return { success: false, message: 'Créneau invalide (horaires 8h-18h uniquement).' };
    }

    // Réservation multi-jours : endDateString est fourni et différent de dateString.
    // Dans ce cas, chaque jour de la plage est réservé en journée complète (8h-18h).
    const startDateObj = parseDate(booking.dateString);
    const isMultiDay = !!(booking.endDateString && booking.endDateString !== booking.dateString);
    const endDateObj = isMultiDay ? parseDate(booking.endDateString) : startDateObj;

    if (isMultiDay && endDateObj < startDateObj) {
      return { success: false, message: 'La date de fin doit être après la date de début.' };
    }

    const numberOfDays = Math.round((endDateObj - startDateObj) / 86400000) + 1;
    const effectiveStartHour = isMultiDay ? START_HOUR : booking.startHour;
    const effectiveEndHour = isMultiDay ? END_HOUR : booking.endHour;

    const start = setTime(startDateObj, effectiveStartHour, 0);
    const end = setTime(endDateObj, effectiveEndHour, 0);

    const cal = CalendarApp.getCalendarById(space.calendarId);
    if (!cal) return { success: false, message: 'Agenda introuvable pour cet espace.' };

    // Quantité d'unités demandée pour cette réservation (1 par défaut, jusqu'à 2 pour le bureau)
    let spaceQuantity = 1;
    if (space.quantitySelectable) {
      spaceQuantity = parseInt(booking.spaceQuantity, 10) || 1;
      if (spaceQuantity < 1) spaceQuantity = 1;
      if (spaceQuantity > space.capacity) spaceQuantity = space.capacity;
    }

    // Vérifie la capacité disponible sur toute la plage demandée (jour unique ou multi-jours)
    const overlapping = cal.getEvents(start, end);
    const maxCount = maxOverlapInRange(overlapping, start, end);
    if (maxCount + spaceQuantity > space.capacity) {
      return { success: false, message: 'Ce créneau est complet, merci de choisir un autre horaire.' };
    }

    const baseTitle = booking.title && booking.title.trim() !== ''
      ? booking.title
      : 'Réservation - ' + space.name;

    const breakfastPrice = booking.wantsBreakfast ? PRICE_BREAKFAST * numberOfPeople : 0;
    const lunchPrice = booking.wantsLunch ? PRICE_LUNCH * numberOfPeople : 0;

    const parkingQuantity = parseInt(booking.parkingQuantity, 10) || 0;
    const slotDuration = effectiveEndHour - effectiveStartHour;
    const parkingUnitPrice = slotDuration > 5 ? PRICE_PARKING_FULL_DAY : PRICE_PARKING_HALF_DAY;
    const parkingPrice = parkingQuantity > 0 ? parkingQuantity * parkingUnitPrice : 0;

    const totalExtras = breakfastPrice + lunchPrice + parkingPrice;

    // Prix de location de l'espace lui-même : bureau 2 postes, salle de réunion classique, ou aucun (coworking)
    let roomPrice = 0;
    if (space.quantitySelectable) {
      roomPrice = computeDeskPrice(slotDuration, spaceQuantity);
    } else if (space.hourlyPrice) {
      if (isMultiDay) {
        // Chaque jour de la plage est facturé au tarif journée complète
        roomPrice = space.fullDayPrice * numberOfDays;
      } else {
        roomPrice = computeRoomPrice(space, slotDuration);
      }
    }
    const grandTotal = roomPrice + totalExtras;

    const servicesList = [];
    if (booking.wantsBreakfast) servicesList.push('Petit déjeuner (' + breakfastPrice.toFixed(2) + ' €HT)');
    if (booking.wantsLunch) servicesList.push('Déjeuner (' + lunchPrice.toFixed(2) + ' €HT)');
    if (parkingQuantity > 0) servicesList.push(parkingQuantity + ' place(s) de parking (' + parkingPrice.toFixed(2) + ' €HT)');
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
    if (booking.notes && booking.notes.trim() !== '') {
      descriptionLines.push('Note : ' + booking.notes);
    }
    descriptionLines.push('Statut : en attente de validation');

    const event = cal.createEvent(PENDING_PREFIX + baseTitle, start, end, {
      description: descriptionLines.join('\n')
    });
    event.setColor(CalendarApp.EventColor.ORANGE);

    sendApprovalEmail({
      space: space,
      eventId: event.getId(),
      calendarId: space.calendarId,
      dateString: booking.dateString,
      endDateString: isMultiDay ? booking.endDateString : null,
      numberOfDays: numberOfDays,
      startHour: effectiveStartHour,
      endHour: effectiveEndHour,
      title: baseTitle,
      spaceQuantity: space.quantitySelectable ? spaceQuantity : null,
      roomPrice: roomPrice,
      grandTotal: grandTotal,
      firstName: booking.firstName,
      lastName: booking.lastName,
      company: booking.company,
      notes: booking.notes || '',
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

// ==================== EMAIL DE VALIDATION ====================

function sendApprovalEmail(data) {
  const baseUrl = ScriptApp.getService().getUrl();
  const approveUrl = baseUrl
    + '?action=approve'
    + '&calId=' + encodeURIComponent(data.calendarId)
    + '&eventId=' + encodeURIComponent(data.eventId)
    + '&requester=' + encodeURIComponent(data.requesterEmail);
  const rejectUrl = baseUrl
    + '?action=reject'
    + '&calId=' + encodeURIComponent(data.calendarId)
    + '&eventId=' + encodeURIComponent(data.eventId)
    + '&requester=' + encodeURIComponent(data.requesterEmail);

  const subject = 'Nouvelle demande de réservation — ' + data.space.name;
  const htmlBody = `
    <p>Une nouvelle demande de réservation est en attente :</p>
    <ul>
      <li><b>Espace :</b> ${data.space.name}</li>
      ${data.endDateString ? '<li><b>Dates :</b> du ' + data.dateString + ' au ' + data.endDateString + ' (' + data.numberOfDays + ' jours)</li>' : '<li><b>Date :</b> ' + data.dateString + '</li>'}
      <li><b>Horaire :</b> ${formatHour(data.startHour)} - ${formatHour(data.endHour)}${data.endDateString ? ' (chaque jour)' : ''}</li>
      <li><b>Titre :</b> ${data.title}</li>
      <li><b>Nom :</b> ${data.firstName} ${data.lastName}</li>
      <li><b>Entreprise :</b> ${data.company}</li>
      <li><b>Email :</b> ${data.requesterEmail}</li>
      <li><b>Nombre de personnes :</b> ${data.numberOfPeople}</li>
      ${data.spaceQuantity ? '<li><b>Postes réservés :</b> ' + data.spaceQuantity + '</li>' : ''}
      ${data.roomPrice > 0 ? '<li><b>Prix location :</b> ' + data.roomPrice.toFixed(2) + ' €HT</li>' : ''}
      ${data.servicesList && data.servicesList.length > 0 ? '<li><b>Services :</b> ' + data.servicesList.join(', ') + '</li>' : ''}
      ${data.totalExtras > 0 ? '<li><b>Total suppléments :</b> ' + data.totalExtras.toFixed(2) + ' €HT</li>' : ''}
      ${data.grandTotal > 0 ? '<li><b>Total général :</b> ' + data.grandTotal.toFixed(2) + ' €HT</li>' : ''}
      ${data.notes ? '<li><b>Note :</b> ' + data.notes + '</li>' : ''}
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
  const requesterEmail = params.requester;

  let message = '';
  try {
    const cal = CalendarApp.getCalendarById(calId);
    const event = cal.getEventById(eventId);

    if (!event) {
      message = 'Cette demande n\'existe plus (peut-être déjà traitée).';
    } else if (action === 'approve') {
      const currentTitle = event.getTitle();
      const cleanTitle = currentTitle.indexOf(PENDING_PREFIX) === 0
        ? currentTitle.substring(PENDING_PREFIX.length)
        : currentTitle;
      const firstName = extractFirstNameFromDescription(event.getDescription());
      event.setTitle(CONFIRMED_PREFIX + cleanTitle);
      event.setColor(CalendarApp.EventColor.GREEN);
      message = 'Réservation confirmée pour "' + cleanTitle + '".';

      if (requesterEmail) {
        let attachments = [];
        try {
          attachments = [DriveApp.getFileById(ACCESS_PLAN_FILE_ID).getBlob()];
        } catch (err) {
          // Si le fichier est inaccessible, on envoie quand même l'email sans pièce jointe
          attachments = [];
        }

        MailApp.sendEmail({
          to: requesterEmail,
          subject: 'Réservation confirmée — Hiptown',
          htmlBody:
            '<p>Bonjour' + (firstName ? ' ' + firstName : '') + ',</p>' +
            '<p>Merci d\'avoir choisi <b>Hiptown</b> !</p>' +
            '<p>Votre réservation <b>"' + cleanTitle + '"</b> est confirmée.</p>' +
            '<p>Lors de votre arrivée le jour J, appelez-nous ou scannez le QR code en bas, nous descendrons vous accueillir. Vous retrouverez en pièce jointe le plan d\'accès à notre bâtiment avec nos contacts.</p>' +
            '<p>La facture correspondante vous sera envoyée par email à la suite de cette réservation.</p>' +
            '<p>À bientôt,<br>L\'équipe Hiptown</p>',
          attachments: attachments
        });
      }
    } else if (action === 'reject') {
      const firstName = extractFirstNameFromDescription(event.getDescription());
      event.deleteEvent();
      message = 'Demande refusée et créneau libéré.';

      if (requesterEmail) {
        MailApp.sendEmail({
          to: requesterEmail,
          subject: 'Réservation non disponible — Hiptown',
          htmlBody:
            '<p>Bonjour' + (firstName ? ' ' + firstName : '') + ',</p>' +
            '<p>Nous vous remercions pour votre demande de réservation.</p>' +
            '<p>Malheureusement, l\'espace n\'est pas disponible à la date et l\'horaire demandés.</p>' +
            '<p>N\'hésitez pas à effectuer une nouvelle demande sur un autre créneau, nous serons ravis de vous accueillir.</p>' +
            '<p>Cordialement,<br>L\'équipe Hiptown</p>'
        });
      }
    } else {
      message = 'Action inconnue.';
    }
  } catch (err) {
    message = 'Erreur : ' + err.message;
  }

  return HtmlService.createHtmlOutput(
    '<div style="font-family:Roboto,Arial,sans-serif;padding:40px;text-align:center;">' +
    '<h2>' + message + '</h2>' +
    '</div>'
  );
}

// ==================== UTILITAIRES ====================

function extractFirstNameFromDescription(description) {
  if (!description) return '';
  const match = description.match(/Demandé par : ([^\s]+)/);
  return match ? match[1] : '';
}

/**
 * Certains espaces (Café Cowork, Bureau 2 postes) acceptent plusieurs
 * réservations simultanées. Chaque événement peut occuper plus d'une
 * "unité" de capacité (ex: 2 postes réservés par la même personne).
 * Cette fonction lit la quantité réservée dans la description ;
 * par défaut 1 si absente (comportement historique).
 */
function extractQuantityFromDescription(description) {
  if (!description) return 1;
  const match = description.match(/Postes réservés : (\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Pré-calcule la quantité de chaque événement UNE seule fois (regex + accès
 * description), plutôt que de la relire à chaque heure testée dans les
 * boucles de disponibilité. Réduit nettement le travail sur un mois complet.
 */
function precomputeQuantities(events) {
  const map = new Map();
  events.forEach(ev => map.set(ev, extractQuantityFromDescription(ev.getDescription())));
  return map;
}

function computeDeskPrice(durationHours, quantity) {
  const isFullDay = durationHours > 5;
  if (quantity >= 2) {
    return isFullDay ? DESK_PRICE_FULL_DAY_2 : DESK_PRICE_HALF_DAY_2;
  }
  return isFullDay ? DESK_PRICE_FULL_DAY_1 : DESK_PRICE_HALF_DAY_1;
}

/**
 * Prix d'une salle de réunion pour UNE journée de créneau.
 * - durationHours > 5 => tarif journée complète
 * - durationHours == 5 => tarif demi-journée
 * - sinon => tarif horaire × nombre d'heures (hypothèse raisonnable,
 *   la grille tarifaire ne détaillant que 1h / demi-journée / journée)
 */
function computeRoomPrice(space, durationHours) {
  if (!space.hourlyPrice) return 0;
  if (durationHours > 5) return space.fullDayPrice;
  if (durationHours === 5) return space.halfDayPrice;
  return space.hourlyPrice * durationHours;
}

/**
 * Occupation maximale (en unités de capacité) sur une plage [start, end),
 * heure par heure. Fonctionne pour une plage sur un seul jour ou étalée
 * sur plusieurs jours (réservation multi-jours).
 */
function maxOverlapInRange(events, start, end) {
  const quantityCache = precomputeQuantities(events);
  let maxCount = 0;
  let cursor = new Date(start);
  while (cursor < end) {
    const hourEnd = new Date(cursor.getTime() + 60 * 60 * 1000);
    let count = 0;
    events.forEach(ev => {
      if (ev.getStartTime() < hourEnd && ev.getEndTime() > cursor) {
        count += quantityCache.get(ev);
      }
    });
    if (count > maxCount) maxCount = count;
    cursor = hourEnd;
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
