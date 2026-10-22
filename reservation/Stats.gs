/**
 * STATISTIQUES — clics sur la réservation des salles de réunion (phase de test).
 *
 * La page de réservation (Index.html) signale, sans aucune donnée personnelle :
 *  - visit : la page vient de s'ouvrir (lien public ou portail) ;
 *  - open  : une fenêtre « Réserver <salle> » s'ouvre (clic sur un jour libre).
 *            first = true pour la première fenêtre ouverte depuis l'arrivée sur la page,
 *            ce qui donne le nombre de personnes qui ont cliqué pour réserver ;
 *  - sent  : une demande de réservation est envoyée avec succès.
 * Chaque événement indique s'il vient du portail (?embed=1) ou du lien externe.
 *
 * Rien n'est enregistré sur l'appareil du visiteur (ni cookie, ni stockage local) :
 * seuls des compteurs par jour sont gardés ici, sans adresse, ni email, ni identifiant.
 * Une personne qui recharge la page est donc comptée une fois de plus.
 *
 * Rangement : propriétés du script, une clé par jour (STATS:AAAA-MM-JJ).
 * Lecture et remise à zéro depuis le portail (Gestion > Statistiques).
 * Les jours de plus de 13 mois sont effacés à chaque lecture.
 */

const STATS_KEY_PREFIX = 'STATS:';
const STATS_MAX_EVENTS_PER_DAY = 5000; // garde-fou : au-delà, les clics du jour ne sont plus comptés
const STATS_KEEP_DAYS = 395;           // 13 mois
const STATS_TYPES = ['visit', 'open', 'sent'];

function statsToday() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function emptyStatsDay() {
  return { total: 0, visits: { portal: 0, external: 0 }, people: { portal: 0, external: 0 }, rooms: {} };
}

/** Compte un clic envoyé par la page de réservation (accès anonyme : aucun jeton demandé). */
function trackBookingStat(raw) {
  raw = raw || {};
  const type = STATS_TYPES.indexOf(raw.type) >= 0 ? raw.type : null;
  if (!type) return { success: false };
  const source = raw.source === 'portal' ? 'portal' : 'external';
  const spaceId = type === 'visit' ? null : String(raw.spaceId || '').slice(0, 60);
  if (type !== 'visit' && !findSpace(spaceId)) return { success: false };

  // Statistiques seulement : si l'outil est très sollicité, on laisse tomber ce clic
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return { success: false };
  try {
    const props = PropertiesService.getScriptProperties();
    const key = STATS_KEY_PREFIX + statsToday();
    let day;
    try { day = JSON.parse(props.getProperty(key) || 'null'); } catch (err) { day = null; }
    if (!day || typeof day !== 'object') day = emptyStatsDay();
    if (day.total >= STATS_MAX_EVENTS_PER_DAY) return { success: true };

    day.total++;
    if (type === 'visit') {
      day.visits[source]++;
    } else {
      const room = day.rooms[spaceId] || (day.rooms[spaceId] = { open: { portal: 0, external: 0 }, sent: { portal: 0, external: 0 } });
      room[type][source]++;
      if (type === 'open' && raw.first === true) day.people[source]++;
    }
    props.setProperty(key, JSON.stringify(day));
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/** Compteurs jour par jour, du plus récent au plus ancien (équipe Hiptown). */
function getBookingStats(idToken) {
  try {
    getAdminProfile(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const store = PropertiesService.getScriptProperties();
  const props = store.getProperties();
  const oldest = new Date();
  oldest.setDate(oldest.getDate() - STATS_KEEP_DAYS);
  const oldestDate = Utilities.formatDate(oldest, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const days = [];
  Object.keys(props).forEach(key => {
    if (key.indexOf(STATS_KEY_PREFIX) !== 0) return;
    const date = key.slice(STATS_KEY_PREFIX.length);
    if (date < oldestDate) { store.deleteProperty(key); return; }
    try { days.push(Object.assign({ date: date }, JSON.parse(props[key]))); } catch (err) { /* jour illisible : ignoré */ }
  });
  days.sort((a, b) => b.date.localeCompare(a.date));
  const spaces = getAllSpaces().map(s => ({ id: s.id, name: s.name }));
  return { success: true, days: days, spaces: spaces };
}

/** Remet tous les compteurs à zéro (admin général : début de la phase de test). */
function resetBookingStats(idToken) {
  let profile;
  try {
    profile = getAdminProfile(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  if (profile.site) return { success: false, message: 'Réservé à l\'admin général.' };
  const store = PropertiesService.getScriptProperties();
  Object.keys(store.getProperties())
    .filter(key => key.indexOf(STATS_KEY_PREFIX) === 0)
    .forEach(key => store.deleteProperty(key));
  return { success: true, message: 'Compteurs de l\'outil de réservation remis à zéro.' };
}
