/**
 * SERVICES — options proposées à la réservation (repas, parking…), gérées depuis le portail.
 *
 * L'équipe Hiptown ajoute, modifie ou retire les services (portail : Gestion >
 * Services) et choisit pour chacun s'il est proposé aux clients salle de réunion
 * (site public et portail) et/ou aux coworkers. Un service non proposé disparaît
 * du formulaire et le serveur ne le facture plus. Les devis utilisent les prix en vigueur.
 *
 * Trois façons de facturer un service :
 *  - 'person'  : prix × nombre de personnes (repas) ; le client coche une case ;
 *  - 'unit'    : prix × quantité choisie par le client, une seule fois ;
 *  - 'unitDay' : prix demi-journée (5h ou moins) ou journée × quantité × nombre de jours (parking).
 *
 * Un service retiré n'est plus proposé mais reste connu : les devis des réservations
 * qui l'ont déjà commandé restent justes. On peut le remettre en ligne.
 *
 * Chaque service appartient à une ville : il n'est proposé que pour les salles de cette
 * ville, et seule l'équipe de cette ville (ou l'admin général) peut le modifier. Les comptes
 * Hiptown (admin) qui réservent une salle se voient proposer tous les services de la ville.
 *
 * Rangement : une propriété du script (SERVICES_LIST, la liste complète). Tant que rien
 * n'y est enregistré, la liste part des 3 services d'origine, aux prix de PRICES (Config.gs)
 * ou à ceux déjà saisis dans le portail (ancienne propriété SERVICES).
 */

const SERVICES_LIST_KEY = 'SERVICES_LIST';
const LEGACY_SERVICES_KEY = 'SERVICES';
const MAX_SERVICE_PRICE = 10000;   // € HT
const MAX_SERVICE_QUANTITY = 10;   // quantité max d'un service par réservation (ex. places de parking)
const MAX_SERVICES = 30;
const PRICING_MODES = ['person', 'unit', 'unitDay'];
const DEFAULT_CITY = 'bordeaux';   // ville des salles et services créés avant la gestion par ville

let servicesMemo = null; // mémorisé le temps d'une requête

/** Tous les services, retirés compris : { id, label, city, pricing, price, halfDayPrice, fullDayPrice, offered, archived }. */
function serviceCatalog() {
  if (servicesMemo) return servicesMemo;
  const props = PropertiesService.getScriptProperties();
  let list = null;
  try { list = JSON.parse(props.getProperty(SERVICES_LIST_KEY) || 'null'); } catch (err) { list = null; }
  servicesMemo = Array.isArray(list) ? list : seedServices(props);
  return servicesMemo;
}

/** Les 3 services d'origine, avec les réglages déjà faits dans le portail avant l'ajout de services. */
function seedServices(props) {
  let legacy = {};
  try { legacy = JSON.parse(props.getProperty(LEGACY_SERVICES_KEY) || '{}') || {}; } catch (err) { legacy = {}; }
  const price = (id, key) => {
    const value = legacy[id] && legacy[id].prices && legacy[id].prices[key];
    return isValidPrice(value) ? value : PRICES[key];
  };
  const offered = (id, audience, byDefault) => {
    const o = legacy[id] && legacy[id].offered;
    return o && audience in o ? o[audience] !== false : byDefault;
  };
  return [
    { id: 'breakfast', label: 'Petit déjeuner', pricing: 'person', price: price('breakfast', 'breakfast'),
      city: DEFAULT_CITY, offered: { salle: offered('breakfast', 'salle', true), coworking: offered('breakfast', 'coworking', true) } },
    { id: 'lunch', label: 'Déjeuner', pricing: 'person', price: price('lunch', 'lunch'),
      city: DEFAULT_CITY, offered: { salle: offered('lunch', 'salle', true), coworking: offered('lunch', 'coworking', true) } },
    { id: 'parking', label: 'Place de parking', pricing: 'unitDay',
      halfDayPrice: price('parking', 'parkingHalfDay'), fullDayPrice: price('parking', 'parkingFullDay'),
      city: DEFAULT_CITY, offered: { salle: offered('parking', 'salle', true), coworking: false } }
  ];
}

/** Ville d'une salle ou d'un service (Bordeaux pour ceux créés avant la gestion par ville). */
function cityOf(item) {
  return (item && item.city) || DEFAULT_CITY;
}

/** Adresse de l'équipe Hiptown de la ville d'une salle (ex. bordeaux@hiptown.com), qui valide demandes et devis. */
function cityTeamEmail(item) {
  return cityOf(item) + '@' + CITY_TEAM_EMAIL_DOMAIN;
}

/** Destinataires des emails à l'équipe : la ville de la salle, plus les copies TEAM_COPY_EMAILS. */
function teamRecipients(item) {
  return [cityTeamEmail(item)].concat(TEAM_COPY_EMAILS || [])
    .filter((e, i, all) => e && all.indexOf(e) === i).join(',');
}

function findService(id) {
  return serviceCatalog().find(s => s.id === id) || null;
}

function isValidPrice(value) {
  return typeof value === 'number' && isFinite(value) && value >= 0 && value <= MAX_SERVICE_PRICE;
}

/** Tarifs en vigueur pour computeQuote : ceux de Config.gs + la liste des services (retirés compris). */
function currentPrices() {
  return Object.assign({}, PRICES, { services: serviceCatalog() });
}

/**
 * Services en ligne proposés à ce type de client ('salle', 'coworking', ou 'admin' : tous),
 * dans cette ville (toutes les villes si city est vide), avec leur ville pour les formulaires.
 */
function offeredServiceList(audience, city) {
  return serviceCatalog()
    .filter(s => !s.archived && (!city || cityOf(s) === city)
      && (audience === 'admin' || (s.offered && s.offered[audience])))
    .map(s => Object.assign({}, s, { city: cityOf(s) }));
}

/**
 * Services demandés : { id: quantité } (1 pour un service « par personne »).
 * Fonction « pure », injectée dans la page avec computeQuote. Relit aussi les anciennes
 * demandes (wantsBreakfast, wantsLunch, parkingQuantity), enregistrées avant cette liste.
 */
function requestedServices(q) {
  const wanted = {};
  if (q.wantsBreakfast) wanted.breakfast = 1;
  if (q.wantsLunch) wanted.lunch = 1;
  if (q.parkingQuantity > 0) wanted.parking = q.parkingQuantity;
  const services = q.services || {};
  Object.keys(services).sort().forEach(id => {
    const n = Math.floor(Number(services[id]));
    if (n > 0) wanted[id] = n;
  });
  return wanted;
}

/**
 * Vérifie les services demandés pour une salle de cette ville. Renvoie { services, refused } :
 * refused = libellés des services qui ne sont pas (ou plus) proposés, retirés de services.
 */
function cleanRequestedServices(q, audience, city) {
  const offered = offeredServiceList(audience, city).map(s => s.id);
  const wanted = requestedServices(q);
  const services = {};
  const refused = [];
  Object.keys(wanted).forEach(id => {
    const s = findService(id);
    if (!s || offered.indexOf(id) === -1) {
      refused.push(s ? s.label : id);
      return;
    }
    services[id] = s.pricing === 'person' ? 1 : Math.min(wanted[id], MAX_SERVICE_QUANTITY);
  });
  return { services: services, refused: refused };
}

/** « Petit déjeuner + 2 × Place de parking » */
function servicesLabel(q) {
  const wanted = requestedServices(q);
  return Object.keys(wanted).map(id => {
    const s = findService(id);
    const label = s ? s.label : id;
    return s && s.pricing !== 'person' && wanted[id] > 1 ? wanted[id] + ' × ' + label : label;
  }).join(' + ');
}

function hasServices(q) {
  return Object.keys(requestedServices(q || {})).length > 0;
}

// ==================== GESTION DEPUIS LE PORTAIL (équipe Hiptown) ====================

/** Ville gérée par cet admin, ou null pour l'admin général (toutes les villes). */
function adminCity(profile) {
  return profile.site || null;
}

/** Services visibles dans Gestion > Services : ceux de sa ville (tous pour l'admin général). */
function getServicesAdmin(idToken) {
  let profile;
  try {
    profile = getAdminProfile(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const city = adminCity(profile);
  return {
    success: true,
    city: city,
    services: serviceCatalog()
      .filter(s => !city || cityOf(s) === city)
      .map(s => Object.assign({}, s, { city: cityOf(s) }))
  };
}

/** Prix saisi dans le portail (texte ou nombre) ; vide n'est pas « gratuit ». NaN si invalide. */
function readPrice(value) {
  const n = value === '' || value === null || value === undefined ? NaN : Number(value);
  return isValidPrice(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Champs d'un service saisis dans le portail, vérifiés. Renvoie { error } ou le service nettoyé (sans id). */
function cleanService(raw, existing) {
  if (!raw || typeof raw !== 'object') return { error: 'Requête invalide.' };
  const label = cleanText(raw.label, 60);
  if (!label) return { error: 'Merci de donner un nom au service.' };
  // La façon de facturer ne change plus après la création : les réservations déjà faites en dépendent
  const pricing = existing ? existing.pricing : raw.pricing;
  if (PRICING_MODES.indexOf(pricing) === -1) return { error: 'Façon de facturer invalide.' };
  const service = {
    label: label,
    pricing: pricing,
    offered: { salle: !!(raw.offered && raw.offered.salle), coworking: !!(raw.offered && raw.offered.coworking) }
  };
  const priceError = { error: label + ' : prix invalide (entre 0 et ' + MAX_SERVICE_PRICE + ' € HT).' };
  if (pricing === 'unitDay') {
    service.halfDayPrice = readPrice(raw.halfDayPrice);
    service.fullDayPrice = readPrice(raw.fullDayPrice);
    if (isNaN(service.halfDayPrice) || isNaN(service.fullDayPrice)) return priceError;
  } else {
    service.price = readPrice(raw.price);
    if (isNaN(service.price)) return priceError;
  }
  return service;
}

/** Identifiant stable à partir du nom (« Vidéoprojecteur » → videoprojecteur, videoprojecteur-2…). */
function newServiceId(label, services) {
  const base = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'service';
  const taken = id => id === 'room' || id === 'discount' || services.some(s => s.id === id); // types de ligne du devis
  let id = base;
  for (let i = 2; taken(id); i++) id = base + '-' + i;
  return id;
}

/** Modifie les services sous verrou : change(liste, ville de l'admin ou null) renvoie { message } ou { error }. */
function updateServices(idToken, change) {
  let city;
  try {
    city = adminCity(getAdminProfile(idToken));
  } catch (err) {
    return { success: false, message: err.message };
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'Le système est occupé, merci de réessayer dans quelques secondes.' };
  }
  try {
    servicesMemo = null; // relit la dernière version, sous verrou
    const services = serviceCatalog().map(s => Object.assign({}, s));
    const result = change(services, city);
    if (result.error) return { success: false, message: result.error };
    PropertiesService.getScriptProperties().setProperty(SERVICES_LIST_KEY, JSON.stringify(services));
    servicesMemo = services;
    return { success: true, message: result.message };
  } finally {
    lock.releaseLock();
  }
}

/** Un admin de ville ne touche qu'aux services de sa ville ; l'admin général (city null) à tous. */
function otherCityError(service, city) {
  return city && cityOf(service) !== city
    ? { error: 'Ce service appartient à une autre ville : seule son équipe peut le modifier.' }
    : null;
}

/** Ajoute (sans id) ou modifie (avec id) un service. */
function saveService(idToken, raw) {
  return updateServices(idToken, (services, city) => {
    const index = raw && raw.id ? services.findIndex(s => s.id === raw.id) : -1;
    if (raw && raw.id && index === -1) return { error: 'Service introuvable : il a peut-être été supprimé.' };
    const existing = index === -1 ? null : services[index];
    if (existing && otherCityError(existing, city)) return otherCityError(existing, city);
    const cleaned = cleanService(raw, existing);
    if (cleaned.error) return cleaned;
    if (existing) {
      services[index] = Object.assign({ id: existing.id, city: cityOf(existing), archived: existing.archived }, cleaned);
      if (!services[index].archived) delete services[index].archived;
      return { message: cleaned.label + ' enregistré.' };
    }
    if (services.length >= MAX_SERVICES) return { error: 'Nombre maximum de services atteint (' + MAX_SERVICES + ').' };
    // Nouveau service : ville de l'admin, ou celle choisie par l'admin général
    const newCity = city || String((raw && raw.city) || '');
    if (!/^[a-z0-9-]{1,40}$/.test(newCity)) return { error: 'Merci de choisir la ville du service.' };
    services.push(Object.assign({ id: newServiceId(cleaned.label, services), city: newCity }, cleaned));
    return { message: cleaned.label + ' ajouté' + (cleaned.offered.salle || cleaned.offered.coworking
      ? ' : il est proposé à la réservation dès maintenant.' : ', mais il n\'est proposé à personne pour l\'instant.') };
  });
}

/** Retire un service (plus proposé, devis existants conservés) ou le remet en ligne. */
function setServiceArchived(idToken, raw) {
  return updateServices(idToken, (services, city) => {
    const service = services.find(s => s.id === (raw && raw.id));
    if (!service) return { error: 'Service introuvable.' };
    if (otherCityError(service, city)) return otherCityError(service, city);
    if (raw.archived) {
      service.archived = true;
      return { message: service.label + ' est retiré : il n\'est plus proposé à la réservation.' };
    }
    delete service.archived;
    return { message: service.label + ' est de nouveau proposé à la réservation.' };
  });
}
