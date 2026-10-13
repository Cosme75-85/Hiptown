/**
 * SERVICES — options proposées à la réservation (repas, parking), gérées depuis le portail.
 *
 * L'équipe Hiptown change leurs prix et choisit à qui chacune est proposée
 * (portail : Gestion > Services) : clients salle de réunion (site public et
 * portail) et/ou coworkers. Un service non proposé disparaît du formulaire et
 * le serveur ne le facture plus. Les devis utilisent toujours les prix en vigueur.
 *
 * Rangement : une propriété du script (SERVICES). Tant que rien n'y est
 * enregistré, les prix viennent de PRICES (Config.gs) et tous les
 * services sont proposés.
 */

const SERVICES_KEY = 'SERVICES';
const MAX_SERVICE_PRICE = 10000; // € HT

// Services connus : à qui ils peuvent être proposés et quels tarifs de PRICES (Config.gs) ils utilisent
const SERVICE_DEFS = [
  { id: 'breakfast', label: 'Petit déjeuner', icon: '🥐', audiences: ['salle', 'coworking'],
    prices: [{ key: 'breakfast', label: 'Par personne' }] },
  { id: 'lunch', label: 'Déjeuner', icon: '🍽️', audiences: ['salle', 'coworking'],
    prices: [{ key: 'lunch', label: 'Par personne' }] },
  { id: 'parking', label: 'Place de parking', icon: '🅿️', audiences: ['salle'],
    prices: [{ key: 'parkingHalfDay', label: 'Par place, 5h ou moins' }, { key: 'parkingFullDay', label: 'Par place, journée' }] }
];

let servicesMemo = null; // mémorisé le temps d'une requête

/** Réglages enregistrés depuis le portail : { [id]: { prices: { clé: prix }, offered: { salle, coworking } } }. */
function storedServices() {
  if (servicesMemo) return servicesMemo;
  try {
    servicesMemo = JSON.parse(PropertiesService.getScriptProperties().getProperty(SERVICES_KEY) || '{}') || {};
  } catch (err) {
    servicesMemo = {};
  }
  return servicesMemo;
}

function findServiceDef(id) {
  return SERVICE_DEFS.find(def => def.id === id) || null;
}

function serviceLabel(id) {
  const def = findServiceDef(id);
  return def ? def.label : id;
}

function isValidPrice(value) {
  return typeof value === 'number' && isFinite(value) && value >= 0 && value <= MAX_SERVICE_PRICE;
}

/** Tarifs en vigueur : ceux de Config.gs, remplacés par ceux saisis dans le portail. */
function currentPrices() {
  const prices = Object.assign({}, PRICES);
  const stored = storedServices();
  SERVICE_DEFS.forEach(def => def.prices.forEach(p => {
    const value = stored[def.id] && stored[def.id].prices && stored[def.id].prices[p.key];
    if (isValidPrice(value)) prices[p.key] = value;
  }));
  return prices;
}

/** Le service est-il proposé à ce type de client ('salle' ou 'coworking') ? Oui tant que rien n'est enregistré. */
function serviceOffered(audience, id) {
  const def = findServiceDef(id);
  if (!def || def.audiences.indexOf(audience) === -1) return false;
  const offered = (storedServices()[id] || {}).offered;
  return !offered || offered[audience] !== false;
}

/** { breakfast: true, lunch: false, … } pour un type de client : envoyé aux formulaires de réservation. */
function offeredServices(audience) {
  const result = {};
  SERVICE_DEFS
    .filter(def => def.audiences.indexOf(audience) !== -1)
    .forEach(def => { result[def.id] = serviceOffered(audience, def.id); });
  return result;
}

// ==================== GESTION DEPUIS LE PORTAIL (équipe Hiptown) ====================

function getServicesAdmin(idToken) {
  try {
    getDiscountAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const prices = currentPrices();
  return {
    success: true,
    services: SERVICE_DEFS.map(def => {
      const offered = {};
      def.audiences.forEach(a => { offered[a] = serviceOffered(a, def.id); });
      return {
        id: def.id,
        label: def.label,
        icon: def.icon,
        prices: def.prices.map(p => ({ key: p.key, label: p.label, value: prices[p.key] })),
        offered: offered
      };
    })
  };
}

/** Enregistre les prix d'un service et à qui il est proposé : { id, prices: { clé: prix }, offered: { salle, coworking } }. */
function saveService(idToken, raw) {
  try {
    getDiscountAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const def = findServiceDef(raw && raw.id);
  if (!def) return { success: false, message: 'Service introuvable.' };

  const entry = { prices: {}, offered: {} };
  for (const p of def.prices) {
    const typed = raw.prices && raw.prices[p.key];
    const value = typed === '' || typed === null || typed === undefined ? NaN : Number(typed); // vide ≠ gratuit
    if (!isValidPrice(value)) {
      return { success: false, message: def.label + ' : prix invalide (entre 0 et ' + MAX_SERVICE_PRICE + ' € HT).' };
    }
    entry.prices[p.key] = Math.round(value * 100) / 100;
  }
  def.audiences.forEach(a => { entry.offered[a] = !!(raw.offered && raw.offered[a]); });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'Le système est occupé, merci de réessayer dans quelques secondes.' };
  }
  try {
    servicesMemo = null; // relit la dernière version, sous verrou
    const stored = Object.assign({}, storedServices());
    stored[def.id] = entry;
    PropertiesService.getScriptProperties().setProperty(SERVICES_KEY, JSON.stringify(stored));
    servicesMemo = stored;
    return { success: true, message: def.label + ' enregistré.' };
  } finally {
    lock.releaseLock();
  }
}
