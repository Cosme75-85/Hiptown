/**
 * SALLES — liste des espaces réservables, gérée depuis le portail.
 *
 * L'équipe Hiptown ajoute, modifie ou retire les salles depuis le portail
 * (Gestion > Salles de réunion) et y saisit leurs périodes d'indisponibilité
 * (travaux, privatisation, fermeture…). Pendant une indisponibilité, les jours
 * sont affichés « fermé » et toute nouvelle réservation est refusée, sur le site
 * public comme dans l'espace coworking. Les réservations déjà faites sur la
 * période ne sont pas annulées : le portail indique combien il y en a.
 *
 * Une salle retirée n'est plus proposée, mais elle reste connue du serveur :
 * ses réservations existantes gardent leur agenda, leurs liens de validation,
 * leurs devis, leur email de remerciement, et restent visibles (et annulables)
 * dans « Mes réservations ». On peut la remettre en ligne à tout moment.
 *
 * Rangement : propriétés du script (une clé par salle + l'ordre d'affichage).
 * Tant que rien n'a été enregistré depuis le portail, la liste vient de
 * DEFAULT_SPACES (Config.gs).
 */

const SPACE_KEY_PREFIX = 'SPACE:';
const SPACES_ORDER_KEY = 'SPACES_ORDER';
const MAX_CLOSURES = 30;          // périodes d'indisponibilité par salle
const DEFAULT_SPACE_COLOR = '#67DFCB';

let spacesMemo = null; // mémorisé le temps d'une requête

/** Tous les espaces, retirés compris (pour retrouver les réservations existantes). */
function getAllSpaces() {
  if (spacesMemo) return spacesMemo;
  const props = PropertiesService.getScriptProperties().getProperties();
  let order = null;
  try { order = JSON.parse(props[SPACES_ORDER_KEY] || 'null'); } catch (err) { order = null; }
  if (!Array.isArray(order)) {
    spacesMemo = seedSpaces();
    return spacesMemo;
  }
  spacesMemo = order.map(id => {
    try { return JSON.parse(props[SPACE_KEY_PREFIX + id] || 'null'); } catch (err) { return null; }
  }).filter(s => s && s.id && s.calendarId);
  return spacesMemo;
}

/** Espaces proposés à la réservation. */
function getSpaces() {
  return getAllSpaces().filter(s => !s.archived);
}

function findSpace(spaceId) {
  return getAllSpaces().find(s => s.id === spaceId);
}

/** Salles proposées aux coworkers, retirées comprises (crédits et réservations déjà faites). */
function getCoworkingSpaceList() {
  return getAllSpaces().filter(s => s.coworking);
}

/** Première liste, reprise de Config.gs : availableFrom devient une indisponibilité jusqu'à la veille. */
function seedSpaces() {
  const today = toDateString(startOfToday());
  return DEFAULT_SPACES.map(s => {
    const space = Object.assign({}, s, { closures: [] });
    delete space.availableFrom;
    if (s.availableFrom && isValidDateString(s.availableFrom)) {
      const opening = parseDate(s.availableFrom);
      const end = toDateString(new Date(opening.getFullYear(), opening.getMonth(), opening.getDate() - 1));
      if (end >= today) space.closures.push({ start: today, end: end, reason: 'Ouverture le ' + frenchDay(opening) });
    }
    return space;
  });
}

function toDateString(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ==================== INDISPONIBILITÉS ====================

/** Période d'indisponibilité qui chevauche [startString, endString] (dates 'AAAA-MM-JJ'), ou null. */
function closureInRange(space, startString, endString) {
  return (space.closures || []).find(c => c.start <= endString && c.end >= startString) || null;
}

function closureOn(space, dateString) {
  return closureInRange(space, dateString, dateString);
}

/** « du 3 novembre 2026 au 7 novembre 2026 », « le 3 novembre 2026 ». */
function closurePeriodLabel(c) {
  return c.start === c.end
    ? 'le ' + frenchDay(parseDate(c.start))
    : 'du ' + frenchDay(parseDate(c.start)) + ' au ' + frenchDay(parseDate(c.end));
}

/** Indisponibilité en cours ou prochaine, pour la carte de la salle (ou null). */
function closureNote(space) {
  const today = toDateString(startOfToday());
  const next = (space.closures || []).filter(c => c.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (!next) return null;
  if (next.start <= today) {
    const end = parseDate(next.end);
    return 'Disponible à partir du ' + frenchDay(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1));
  }
  return 'Indisponible ' + closurePeriodLabel(next);
}

function closureMessage(space, c) {
  if (c.start <= toDateString(startOfToday())) {
    const end = parseDate(c.end);
    return space.name + ' sera disponible à partir du ' + frenchDay(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)) + '.';
  }
  return space.name + ' n\'est pas disponible ' + closurePeriodLabel(c) + ' : merci de choisir une autre date.';
}

/** Premier jour réservable si la salle est fermée aujourd'hui (pour les anciens écrans du portail), sinon null. */
function reopeningDate(space) {
  const c = closureOn(space, toDateString(startOfToday()));
  if (!c) return null;
  const end = parseDate(c.end);
  return new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
}

// ==================== GESTION DEPUIS LE PORTAIL (équipe Hiptown) ====================

/** Liste complète pour l'écran de gestion (agendas et motifs compris). */
function getRoomsAdmin(idToken) {
  try {
    getDiscountAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const today = toDateString(startOfToday());
  const rooms = getAllSpaces().map(s => Object.assign({}, s, {
    closures: (s.closures || []).filter(c => c.end >= today),
    hasOwnThanks: !!THANKS.bySpace[s.id]
  }));
  const categories = [];
  rooms.forEach(s => { if (s.category && categories.indexOf(s.category) === -1) categories.push(s.category); });
  return { success: true, rooms: rooms, categories: categories };
}

/** Ajoute (sans id) ou modifie (avec id) une salle. */
function saveRoom(idToken, raw) {
  try {
    getDiscountAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const cleaned = cleanRoom(raw);
  if (cleaned.error) return { success: false, message: cleaned.error };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'Le système est occupé, merci de réessayer dans quelques secondes.' };
  }
  try {
    spacesMemo = null; // relit la dernière version, sous verrou
    const spaces = getAllSpaces().slice();
    let space;
    let previousClosures = [];
    const index = raw.id ? spaces.findIndex(s => s.id === raw.id) : -1;
    if (raw.id) {
      if (index === -1) return { success: false, message: 'Salle introuvable : elle a peut-être été supprimée.' };
      previousClosures = spaces[index].closures || [];
      // L'agenda ne change pas : les réservations déjà faites y restent rattachées
      space = Object.assign({}, spaces[index], cleaned);
      spaces[index] = space;
    } else {
      const calendarId = String(raw.calendarId || '').trim();
      let calendar;
      try {
        calendar = calendarId ? CalendarApp.getCalendarById(calendarId) : CalendarApp.createCalendar(cleaned.name + ' — réservations Hiptown');
      } catch (err) {
        calendar = null;
      }
      if (!calendar) {
        return { success: false, message: 'Agenda introuvable : vérifiez son identifiant et qu\'il est partagé avec le compte '
          + 'qui fait tourner l\'outil de réservation (droit « Apporter des modifications aux événements »), '
          + 'ou laissez le champ vide pour en créer un.' };
      }
      if (spaces.some(s => s.calendarId === calendar.getId())) {
        return { success: false, message: 'Cet agenda est déjà celui d\'une autre salle.' };
      }
      space = Object.assign({ id: newSpaceId(cleaned.name, spaces), calendarId: calendar.getId() }, cleaned);
      spaces.push(space);
    }
    writeSpaces(spaces);
    invalidateAvailabilityCache();

    const warnings = newClosureWarnings(space, previousClosures);
    return {
      success: true,
      warning: warnings.length > 0,
      id: space.id,
      message: (raw.id ? 'Salle enregistrée.' : space.name + ' ajoutée : elle est proposée à la réservation dès maintenant.')
        + (warnings.length ? ' Attention : ' + warnings.join(' ') : '')
    };
  } finally {
    lock.releaseLock();
  }
}

/** Retire une salle (plus proposée, réservations conservées) ou la remet en ligne. */
function setRoomArchived(idToken, raw) {
  try {
    getDiscountAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const archived = !!(raw && raw.archived);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'Le système est occupé, merci de réessayer dans quelques secondes.' };
  }
  try {
    spacesMemo = null;
    const spaces = getAllSpaces().slice();
    const index = spaces.findIndex(s => s.id === (raw && raw.id));
    if (index === -1) return { success: false, message: 'Salle introuvable.' };
    const space = Object.assign({}, spaces[index], { archived: archived });
    if (!archived) delete space.archived;
    spaces[index] = space;
    writeSpaces(spaces);
    invalidateAvailabilityCache();
    if (!archived) return { success: true, message: space.name + ' est de nouveau proposée à la réservation.' };
    const upcoming = countBookings(space, new Date(), new Date(Date.now() + 400 * DAY_MS));
    return {
      success: true,
      message: space.name + ' est retirée : elle n\'est plus proposée à la réservation.'
        + (upcoming > 0 ? ' Réservations à venir conservées dans son agenda : ' + upcoming + ' (prévenez les clients si elles n\'auront pas lieu).' : '')
    };
  } finally {
    lock.releaseLock();
  }
}

/** Vérifie les champs envoyés par le portail. Renvoie la salle nettoyée ou { error }. */
function cleanRoom(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Requête invalide.' };
  const price = v => (v === '' || v === null || v === undefined) ? null : Number(v);
  const room = {
    name: cleanText(raw.name, 60),
    category: cleanText(raw.category, 60) || 'Salles de réunion',
    color: /^#[0-9a-fA-F]{6}$/.test(String(raw.color || '')) ? String(raw.color) : DEFAULT_SPACE_COLOR,
    photoUrl: String(raw.photoUrl || '').trim(),
    capacity: raw.capacity === undefined || raw.capacity === '' ? 1 : toInt(raw.capacity),
    maxPeople: raw.maxPeople === '' || raw.maxPeople === null || raw.maxPeople === undefined ? null : toInt(raw.maxPeople),
    hourlyPrice: price(raw.hourlyPrice),
    halfDayPrice: price(raw.halfDayPrice),
    fullDayPrice: price(raw.fullDayPrice),
    allowMultiDay: raw.allowMultiDay === true,
    badgeLabel: cleanText(raw.badgeLabel, 40) || null,
    coworking: raw.coworking === true,
    closures: []
  };
  if (!room.name) return { error: 'Merci de donner un nom à la salle.' };
  if (room.photoUrl && !/^https:\/\/[^\s"'<>]+$/.test(room.photoUrl)) {
    return { error: 'Adresse de la photo invalide (elle doit commencer par https://).' };
  }
  if (!(room.capacity >= 1 && room.capacity <= 50)) return { error: 'Réservations simultanées : entre 1 et 50.' };
  if (room.maxPeople !== null && !(room.maxPeople >= 1 && room.maxPeople <= 500)) {
    return { error: 'Nombre de personnes maximum invalide.' };
  }
  for (const key of ['hourlyPrice', 'halfDayPrice', 'fullDayPrice']) {
    if (room[key] !== null && !(room[key] >= 0 && room[key] <= 100000)) return { error: 'Tarif invalide.' };
    if (room[key] === 0) room[key] = null;
  }

  const today = toDateString(startOfToday());
  const closures = Array.isArray(raw.closures) ? raw.closures : [];
  for (const c of closures) {
    const start = String((c && c.start) || '');
    const end = String((c && c.end) || start);
    if (!isValidDateString(start) || !isValidDateString(end)) return { error: 'Date d\'indisponibilité invalide.' };
    if (end < start) return { error: 'Indisponibilité : la date de fin doit être après la date de début.' };
    if (end < today) continue; // période terminée : inutile de la garder
    room.closures.push({ start: start, end: end, reason: cleanText(c.reason, 100) });
  }
  if (room.closures.length > MAX_CLOSURES) return { error: 'Trop de périodes d\'indisponibilité (maximum ' + MAX_CLOSURES + ').' };
  room.closures.sort((a, b) => a.start.localeCompare(b.start));
  return room;
}

/** Identifiant stable tiré du nom (« Salle Pin » → « sallePin »), unique. */
function newSpaceId(name, spaces) {
  const words = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(' ').filter(Boolean).map(w => w.toLowerCase());
  const base = (words.map((w, i) => i ? w.charAt(0).toUpperCase() + w.slice(1) : w).join('') || 'salle').slice(0, 30);
  let id = /^[a-z]/.test(base) ? base : 'salle' + base;
  for (let n = 2; spaces.some(s => s.id === id); n++) id = base + n;
  return id;
}

function writeSpaces(spaces) {
  const values = {};
  spaces.forEach(s => {
    const json = JSON.stringify(s);
    if (json.length > 8500) throw new Error('Fiche de « ' + s.name + ' » trop longue (retirez des indisponibilités).');
    values[SPACE_KEY_PREFIX + s.id] = json;
  });
  values[SPACES_ORDER_KEY] = JSON.stringify(spaces.map(s => s.id));
  PropertiesService.getScriptProperties().setProperties(values, false);
  spacesMemo = null;
}

/** Nouvelles indisponibilités qui tombent sur des réservations déjà faites. */
function newClosureWarnings(space, previousClosures) {
  const known = {};
  previousClosures.forEach(c => { known[c.start + '/' + c.end] = true; });
  const warnings = [];
  (space.closures || []).filter(c => !known[c.start + '/' + c.end]).forEach(c => {
    const end = parseDate(c.end);
    let count;
    try {
      count = countBookings(space, parseDate(c.start), new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1));
    } catch (err) {
      return;
    }
    if (count > 0) {
      warnings.push('réservations déjà faites ' + closurePeriodLabel(c) + ' : ' + count
        + ' (elles ne sont pas annulées, prévenez les clients si besoin).');
    }
  });
  return warnings;
}

function countBookings(space, from, to) {
  try {
    return getBookedSlots(space, from, to).length;
  } catch (err) {
    return 0;
  }
}
