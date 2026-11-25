/**
 * CALENDRIER DE L'AVENT — une case à ouvrir chaque jour du 1er au 24 décembre.
 *
 * Ouvert aux comptes validés de la ville ADVENT.city (Bordeaux) : clients Hiptown
 * (coworking) et clients salle de réunion. Chaque compte a son propre calendrier.
 *  - Les cases s'ouvrent dans l'ordre, au jour le jour, du 1er au 24 décembre (heure de Paris).
 *    ADVENT.catchUp = false : une case ne s'ouvre que le jour même (le lendemain, elle est
 *    « manquée ») ; true : les cases manquées se rattrapent plus tard, toujours dans l'ordre.
 *  - Le lot est tiré au hasard parmi les lots qui restent. Le stock de chaque lot est
 *    réparti sur les 24 jours (au jour J, au plus quantité × J / 24 ont été donnés),
 *    pour qu'il reste des lots jusqu'au bout. Plus un lot a de stock, plus il sort souvent.
 *    Un lot peut aussi avoir un pourcentage (ex. cinéma 10 %) : à chaque case, il a cette
 *    chance de sortir (toujours dans la limite de son stock du jour), sinon le tirage se fait
 *    parmi les autres lots. Quand plus rien n'est disponible ce jour-là, c'est un lot
 *    « illimité » (quantité 0) qui sort : le lot de consolation ; sans lui, la case dit merci.
 *  - Lot « crédits » : réservé aux clients coworking. Les crédits sont ajoutés tout de suite
 *    à ceux de leur entreprise pour le mois en cours (voir adventBonusCredits, utilisé par
 *    getCreditBalance dans Coworking.gs).
 *  - Lot « cadeau » (cinéma, mug…) : l'équipe de la ville reçoit un e-mail, et le gagnant
 *    apparaît dans le portail (Gestion > Calendrier de l'Avent) pour être coché « remis ».
 *  - L'équipe Hiptown peut ouvrir les cases en mode test, à tout moment : le tirage est
 *    simulé, rien n'est enregistré ni retiré du stock.
 *
 * Rangement : propriétés du script, comme les réductions (aucune base à créer) :
 *   ADVENT_PUBLIC:<année>            '1' quand le calendrier est visible par les clients (interrupteur
 *                                    de la gestion, éteint au départ : seule l'équipe le voit)
 *   ADVENT_PRIZES:<année>            liste des lots (modifiable depuis le portail)
 *   ADVENT_GIVEN:<année>             nombre de lots donnés, par lot
 *   ADVENT_U:<année>:<uid>           cases ouvertes par un compte (format compact : environ
 *                                    600 octets pour 24 cases, la limite des propriétés est 500 Ko)
 *   ADVENT_BONUS:<entreprise>:<mois> crédits gagnés par une entreprise ce mois-là
 */

const ADVENT = {
  year: 2026,
  city: 'bordeaux',                 // ville des comptes qui ont le calendrier (users.site)
  roles: ['coworking', 'salle'],    // rôles qui jouent ; l'équipe (admin) ouvre en mode test
  days: 24,
  lastOpenDay: 24,                  // dernier jour où l'on peut ouvrir une case
  catchUp: false,                   // false : chaque case seulement le jour même ; true : rattrapage dans l'ordre
  showUntil: '2027-01-06',          // le bandeau du portail disparaît après cette date (gains visibles jusque-là)
  timeZone: 'Europe/Paris',
  maxPrizes: 30,
  // Lots de départ, utilisés tant que l'équipe n'a rien enregistré dans le portail.
  // kind : 'credits' (ajoutés à l'entreprise, coworking seulement) ou 'gift' (remis par l'équipe).
  // quantity : nombre de lots ; 0 = illimité (lot de consolation). days : jours où il peut sortir ([] = tous).
  defaultPrizes: [
    // chance : % de chance de gagner ce lot à chaque case ouverte (0 = tiré selon son stock)
    { id: 'cinema', label: '2 places de cinéma', kind: 'gift', credits: 0, quantity: 6, chance: 10, days: [],
      detail: 'Une place de cinéma pour 2 personnes : l\'équipe Hiptown vous la remet à l\'accueil.' },
    { id: 'apero', label: '2 places pour un apéro', kind: 'gift', credits: 0, quantity: 2, chance: 5, days: [],
      detail: 'Un apéro pour 2 personnes : l\'équipe Hiptown vous contacte.' },
    { id: 'jeu', label: 'Un jeu de société', kind: 'gift', credits: 0, quantity: 2, chance: 0, days: [],
      detail: 'À récupérer à l\'accueil Hiptown.' },
    { id: 'credits100', label: '100 crédits de salle', kind: 'credits', credits: 100, quantity: 40, chance: 0, days: [] },
    { id: 'credits200', label: '200 crédits de salle', kind: 'credits', credits: 200, quantity: 20, chance: 0, days: [] },
    { id: 'credits400', label: '400 crédits de salle', kind: 'credits', credits: 400, quantity: 5, chance: 0, days: [] },
    { id: 'pdj', label: 'Un petit déjeuner au cowork', kind: 'gift', credits: 0, quantity: 2, chance: 0, days: [],
      detail: 'L\'équipe Hiptown vous contacte pour choisir le jour.' },
    { id: 'resto', label: 'Un restaurant pour 2 personnes', kind: 'gift', credits: 0, quantity: 1, chance: 0, days: [],
      detail: 'L\'équipe Hiptown vous contacte pour vous le remettre.' }
  ]
};
const ADVENT_USER_PREFIX = 'ADVENT_U:';
const ADVENT_BONUS_PREFIX = 'ADVENT_BONUS:';

// ==================== DATES ====================

/** Jour de décembre (1-31) à Paris, 0 avant décembre de l'année du calendrier, 99 après. */
function adventTodayDay(now) {
  const ymd = Utilities.formatDate(now || new Date(), ADVENT.timeZone, 'yyyy-MM-dd').split('-').map(Number);
  if (ymd[0] < ADVENT.year || (ymd[0] === ADVENT.year && ymd[1] < 12)) return 0;
  if (ymd[0] > ADVENT.year) return 99;
  return ymd[2];
}

/** Le calendrier est-il ouvert aux clients ? (interrupteur de Gestion > Calendrier de l'Avent) */
function adventIsPublic() {
  return PropertiesService.getScriptProperties().getProperty('ADVENT_PUBLIC:' + ADVENT.year) === '1';
}

function adventIsShown(now) {
  const today = Utilities.formatDate(now || new Date(), ADVENT.timeZone, 'yyyy-MM-dd');
  return adventTodayDay(now) >= 1 && today <= ADVENT.showUntil;
}

// ==================== LOTS ET STOCK ====================

function adventPrizes() {
  const saved = PropertiesService.getScriptProperties().getProperty('ADVENT_PRIZES:' + ADVENT.year);
  if (saved) {
    try { return JSON.parse(saved); } catch (err) { /* liste illisible : lots de départ */ }
  }
  return ADVENT.defaultPrizes.map(p => Object.assign({ detail: '' }, p));
}

function adventGiven() {
  const saved = PropertiesService.getScriptProperties().getProperty('ADVENT_GIVEN:' + ADVENT.year);
  try { return (saved && JSON.parse(saved)) || {}; } catch (err) { return {}; }
}

/** Texte montré au gagnant sous le nom du lot. */
function adventPrizeDetail(prize) {
  if (prize.detail) return prize.detail;
  if (prize.kind === 'credits') return 'Ajoutés aux crédits de votre entreprise pour ce mois-ci.';
  return 'L\'équipe Hiptown vous contacte pour vous le remettre.';
}

/** Le compte peut-il gagner ce lot ? Les crédits ne vont qu'aux clients coworking rattachés à une entreprise. */
function adventPrizeFits(prize, player) {
  if (prize.kind === 'credits') return !!player.canWinCredits;
  return true;
}

/**
 * Lots qu'on peut encore donner au jour `day` (1-24, jour du tirage, pas celui de la case).
 * Renvoie [{ prize, weight }].
 */
function adventAvailable(prizes, given, day, player) {
  const out = [];
  prizes.forEach(prize => {
    if (!(prize.quantity > 0) || !adventPrizeFits(prize, player)) return;
    const done = Number(given[prize.id]) || 0;
    let allowed;
    if (prize.days && prize.days.length) {
      // Lot réservé à certains jours : réparti sur ces jours-là seulement
      const passed = prize.days.filter(d => d <= day).length;
      if (prize.days.indexOf(day) === -1 && passed === 0) return;
      allowed = Math.ceil(prize.quantity * passed / prize.days.length);
    } else {
      allowed = Math.ceil(prize.quantity * Math.min(day, ADVENT.days) / ADVENT.days);
    }
    const left = Math.min(allowed, prize.quantity) - done;
    if (left > 0) out.push({ prize: prize, weight: left });
  });
  return out;
}

/** Tire un lot. null s'il n'y a vraiment plus rien (ni stock, ni lot illimité). */
function adventDraw(prizes, given, day, player) {
  const all = adventAvailable(prizes, given, day, player);
  // Lots à pourcentage (ex. cinéma 10 %) : chacun a sa chance, s'il en reste ce jour-là
  const withChance = all.filter(x => x.prize.chance > 0);
  for (let i = 0; i < withChance.length; i++) {
    if (Math.random() * 100 < withChance[i].prize.chance) return withChance[i].prize;
  }
  // Sinon, tirage parmi les autres lots, selon leur stock du jour
  const pool = all.filter(x => !(x.prize.chance > 0));
  if (pool.length) {
    const total = pool.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r < 0) return pool[i].prize;
    }
    return pool[pool.length - 1].prize;
  }
  const unlimited = prizes.filter(p => !(p.quantity > 0) && adventPrizeFits(p, player));
  if (unlimited.length) return unlimited[Math.floor(Math.random() * unlimited.length)];
  return null;
}

// ==================== COMPTES ====================

function adventUserKey(uid) {
  return ADVENT_USER_PREFIX + ADVENT.year + ':' + uid;
}

/**
 * Cases ouvertes par un compte : { n, e, c, ci, r, d: { "3": "idDuLot|date|x" } }
 * (date en secondes, base 36 ; « x » = cadeau remis ; id vide = plus aucun lot ce jour-là).
 */
function adventRecord(uid) {
  const saved = PropertiesService.getScriptProperties().getProperty(adventUserKey(uid));
  try { return (saved && JSON.parse(saved)) || null; } catch (err) { return null; }
}

/**
 * Joueur du calendrier d'après sa fiche du portail. mode : 'player' (client de la ville),
 * 'test' (équipe Hiptown) ou null (pas de calendrier pour ce compte).
 */
function adventPlayer(idToken) {
  const uid = tokenUid(idToken);
  if (!uid) throw new Error('Session expirée, merci de vous reconnecter au portail.');
  const profile = readFirestoreDoc('users/' + encodeURIComponent(uid), idToken);
  if (!profile || profile.status !== 'approved') return { mode: null };
  let mode = null;
  if (profile.role === 'admin' && (!profile.site || profile.site === ADVENT.city)) mode = 'test';
  else if (profile.site === ADVENT.city && ADVENT.roles.indexOf(profile.role) !== -1) mode = 'player';
  if (!mode) return { mode: null };

  let company = profile.companyNameHint || '';
  if (profile.role === 'coworking' && profile.companyId) {
    const doc = readFirestoreDoc('companies/' + encodeURIComponent(profile.companyId), idToken);
    company = (doc && doc.name) || company;
  }
  return {
    mode: mode,
    uid: uid,
    role: profile.role,
    companyId: profile.role === 'coworking' ? String(profile.companyId || '') : '',
    // Mode test : tous les lots peuvent sortir, comme pour un client coworking
    canWinCredits: mode === 'test' || (profile.role === 'coworking' && !!profile.companyId),
    name: cleanText([profile.firstName, profile.lastName].filter(Boolean).join(' '), 80),
    email: String(profile.email || '').toLowerCase(),
    company: cleanText(company, 80)
  };
}

function adventEntry(text) {
  const parts = String(text || '').split('|');
  return { p: parts[0] || '', t: parseInt(parts[1], 36) * 1000 || 0, x: parts[2] === 'x' };
}

function adventEntryText(e) {
  return e.p + '|' + Math.floor(e.t / 1000).toString(36) + (e.x ? '|x' : '');
}

function adventPrizeMap() {
  const map = {};
  adventPrizes().forEach(p => { map[p.id] = p; });
  return map;
}

/**
 * Rareté d'un lot (son et animation du portail) : choisie dans la gestion, sinon déduite
 * du lot : 2 exemplaires ou moins, ou 5 % de chance ou moins = légendaire ; 10 exemplaires
 * ou moins, ou un % de chance = rare ; le reste = commun.
 */
function adventRarity(prize) {
  if (!prize) return 'none';
  if (['commun', 'rare', 'legendaire'].indexOf(prize.rarity) !== -1) return prize.rarity;
  const q = prize.quantity > 0 ? prize.quantity : Infinity;
  if (q <= 2 || (prize.chance > 0 && prize.chance <= 5)) return 'legendaire';
  if (q <= 10 || prize.chance > 0) return 'rare';
  return 'commun';
}

function adventPrizeView(day, prize) {
  return { day: day, label: prize.label, kind: prize.kind, credits: prize.credits || 0, detail: adventPrizeDetail(prize), rarity: adventRarity(prize) };
}

/** Case ouverte telle que le portail l'affiche. */
function adventDayView(day, text, prizeMap) {
  const prize = prizeMap[adventEntry(text).p];
  if (!prize) return { day: day, label: 'Merci d\'avoir ouvert la case !', kind: 'none', credits: 0, detail: 'Tous les lots du jour étaient partis.', rarity: 'none' };
  return adventPrizeView(day, prize);
}

// ==================== POINTS D'ENTRÉE DU PORTAIL ====================

/** doPost getAdvent : état du calendrier du compte connecté. */
function getAdvent(idToken) {
  try {
    const player = adventPlayer(idToken);
    if (!player.mode) return { success: true, mode: null };
    const shown = adventIsShown();
    if (player.mode === 'player' && (!shown || !adventIsPublic())) return { success: true, mode: null };
    const record = player.mode === 'player' ? adventRecord(player.uid) : null;
    const prizeMap = adventPrizeMap();
    const opened = record ? Object.keys(record.d || {}).map(d => adventDayView(Number(d), record.d[d], prizeMap)) : [];
    const today = adventTodayDay();
    return {
      success: true,
      mode: player.mode,
      shown: shown,
      year: ADVENT.year,
      days: ADVENT.days,
      today: today === 99 ? ADVENT.lastOpenDay + 1 : today,
      lastOpenDay: ADVENT.lastOpenDay,
      catchUp: ADVENT.catchUp,
      opened: opened
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/** doPost openAdventDay : ouvre la case `day` et tire son lot. */
function openAdventDay(idToken, raw) {
  let player;
  try {
    player = adventPlayer(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const day = toInt(raw && raw.day);
  if (!(day >= 1 && day <= ADVENT.days)) return { success: false, message: 'Case inconnue.' };
  if (!player.mode) return { success: false, message: 'Le calendrier de l\'Avent est réservé aux clients Hiptown Bordeaux.' };
  const today = adventTodayDay();

  // Équipe Hiptown : tirage simulé, rien n'est enregistré
  if (player.mode === 'test') {
    const drawDay = today >= 1 && today <= ADVENT.days ? today : day;
    const prize = adventDraw(adventPrizes(), adventGiven(), drawDay, player);
    if (!prize) return { success: true, test: true, prize: { day: day, label: 'Plus aucun lot disponible', kind: 'none', credits: 0, detail: 'Ajoutez du stock dans la gestion du calendrier.', rarity: 'none' } };
    return { success: true, test: true, prize: adventPrizeView(day, prize) };
  }

  if (!adventIsPublic()) return { success: false, message: 'Le calendrier de l\'Avent n\'est pas encore ouvert.' };
  if (today < day) return { success: false, message: 'Patience ! Cette case s\'ouvre le ' + day + (day === 1 ? 'er' : '') + ' décembre.' };
  if (today > ADVENT.lastOpenDay) return { success: false, message: 'Le calendrier de l\'Avent est terminé. Merci d\'avoir joué !' };
  if (!ADVENT.catchUp && day < today) {
    return { success: false, message: 'Cette case était à ouvrir le ' + day + (day === 1 ? 'er' : '') + ' décembre. Rendez-vous sur la case du jour !' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return { success: false, message: 'Beaucoup de monde ouvre sa case en ce moment, merci de réessayer.' };
  }
  let prize, view;
  try {
    const props = PropertiesService.getScriptProperties();
    const record = adventRecord(player.uid) || { d: {} };
    const prizes = adventPrizes();
    const prizeMap = {};
    prizes.forEach(p => { prizeMap[p.id] = p; });
    if (record.d[day]) return { success: true, already: true, prize: adventDayView(day, record.d[day], prizeMap) };
    if (ADVENT.catchUp) {
      // Rattrapage dans l'ordre : toutes les cases d'avant doivent être ouvertes
      for (let d = 1; d < day; d++) {
        if (!record.d[d]) return { success: false, message: 'Ouvrez d\'abord la case du ' + d + (d === 1 ? 'er' : '') + ' décembre.' };
      }
    }

    const given = adventGiven();
    prize = adventDraw(prizes, given, Math.min(today, ADVENT.days), player);
    const text = adventEntryText({ p: prize ? prize.id : '', t: Date.now() });
    view = adventDayView(day, text, prizeMap);
    if (!prize) view.detail = 'Tous les lots du jour sont partis. Revenez demain !';

    Object.assign(record, { n: player.name, e: player.email, c: player.company, ci: player.companyId, r: player.role });
    record.d[day] = text;
    const toSave = {};
    toSave[adventUserKey(player.uid)] = JSON.stringify(record);
    if (prize) {
      given[prize.id] = (Number(given[prize.id]) || 0) + 1;
      toSave['ADVENT_GIVEN:' + ADVENT.year] = JSON.stringify(given);
    }
    if (prize && prize.kind === 'credits') {
      const bonusKey = adventBonusKey(player.companyId, new Date());
      toSave[bonusKey] = String((Number(props.getProperty(bonusKey)) || 0) + prize.credits);
    }
    props.setProperties(toSave);
  } finally {
    lock.releaseLock();
  }

  if (prize && prize.kind === 'gift' && prize.quantity > 0) {
    try { emailTeamAboutAdventGift(player, day, prize); } catch (err) { console.error('Avent : e-mail équipe', err); }
  }
  return { success: true, prize: view };
}

function emailTeamAboutAdventGift(player, day, prize) {
  const who = [player.name, player.company].filter(Boolean).join(' · ');
  MailApp.sendEmail({
    to: teamRecipients({ city: ADVENT.city }),
    subject: '🎁 Calendrier de l\'Avent — ' + who + ' a gagné : ' + prize.label,
    htmlBody: '<p>Bonjour,</p><p><b>' + escapeHtml(who) + '</b> (' + escapeHtml(player.email) + ') a ouvert la case du '
      + day + ' décembre et gagné <b>' + escapeHtml(prize.label) + '</b>.</p>'
      + '<p>Pensez à lui remettre son lot, puis cochez « remis » dans le portail (Gestion &gt; Calendrier de l\'Avent).</p>'
      + '<p>L\'équipe Hiptown</p>'
  });
}

// ==================== CRÉDITS GAGNÉS (utilisé par getCreditBalance, Coworking.gs) ====================

function adventBonusKey(companyId, date) {
  return ADVENT_BONUS_PREFIX + companyId + ':' + Utilities.formatDate(date, ADVENT.timeZone, 'yyyy-MM');
}

/** Crédits gagnés au calendrier par l'entreprise pour ce mois (month : 1-12). */
function adventBonusCredits(companyId, year, month) {
  if (!companyId) return 0;
  const key = ADVENT_BONUS_PREFIX + companyId + ':' + year + '-' + String(month).padStart(2, '0');
  return Number(PropertiesService.getScriptProperties().getProperty(key)) || 0;
}

// ==================== GESTION (équipe Hiptown) ====================

function adventAdmin(idToken) {
  const profile = getAdminProfile(idToken);
  if (profile.site && profile.site !== ADVENT.city) throw new Error('Le calendrier de l\'Avent est géré par l\'équipe de Bordeaux.');
  return profile;
}

/** doPost getAdventAdmin : lots avec leur stock, gagnants des cadeaux, crédits donnés. */
function getAdventAdmin(idToken) {
  try {
    adventAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const all = PropertiesService.getScriptProperties().getProperties();
  const given = adventGiven();
  const prizeMap = adventPrizeMap();
  const prefix = ADVENT_USER_PREFIX + ADVENT.year + ':';
  const winners = [];
  const credits = {};
  let players = 0;
  let openings = 0;
  Object.keys(all).forEach(key => {
    if (key.indexOf(prefix) !== 0) return;
    let rec;
    try { rec = JSON.parse(all[key]); } catch (err) { return; }
    players++;
    Object.keys(rec.d || {}).forEach(day => {
      const e = adventEntry(rec.d[day]);
      const prize = prizeMap[e.p];
      openings++;
      if (!prize) return;
      if (prize.kind === 'credits') {
        const c = credits[rec.ci] || (credits[rec.ci] = { company: rec.c || rec.ci, credits: 0, wins: 0 });
        c.credits += prize.credits || 0;
        c.wins++;
      } else if (prize.quantity > 0) {
        // Cadeaux en quantité limitée seulement (pas le lot de consolation illimité)
        winners.push({ uid: key.slice(prefix.length), day: Number(day), name: rec.n, email: rec.e, company: rec.c,
          label: prize.label, at: e.t, delivered: e.x });
      }
    });
  });
  winners.sort((a, b) => (b.at || 0) - (a.at || 0));
  const today = Math.min(Math.max(adventTodayDay(), 0), ADVENT.days);
  return {
    success: true,
    year: ADVENT.year,
    today: today,
    public: adventIsPublic(),
    prizes: adventPrizes().map(p => Object.assign({}, p, {
      given: Number(given[p.id]) || 0,
      autoRarity: adventRarity(Object.assign({}, p, { rarity: '' })),
      // Encore disponibles aujourd'hui avec la répartition sur 24 jours (null = illimité)
      availableToday: p.quantity > 0 ? ((adventAvailable([p], given, Math.max(today, 1), { canWinCredits: true })[0] || {}).weight || 0) : null
    })),
    winners: winners,
    credits: Object.keys(credits).map(id => credits[id]).sort((a, b) => b.credits - a.credits),
    players: players,
    openings: openings
  };
}

/** doPost saveAdventPrizes : remplace la liste des lots. */
function saveAdventPrizes(idToken, raw) {
  try {
    adventAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const list = raw && raw.prizes;
  if (!Array.isArray(list) || !list.length || list.length > ADVENT.maxPrizes) return { success: false, message: 'Liste de lots invalide.' };
  const given = adventGiven();
  const ids = {};
  const prizes = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {};
    const label = cleanText(p.label, 60);
    if (!label) return { success: false, message: 'Chaque lot doit avoir un nom.' };
    const kind = p.kind === 'credits' ? 'credits' : 'gift';
    const credits = kind === 'credits' ? toInt(p.credits) : 0;
    if (kind === 'credits' && !(credits >= 1 && credits <= 500)) return { success: false, message: '« ' + label + ' » : nombre de crédits entre 1 et 500.' };
    const quantity = toInt(p.quantity);
    if (!(quantity >= 0 && quantity <= 10000)) return { success: false, message: '« ' + label + ' » : quantité entre 0 (illimité) et 10 000.' };
    let id = /^[a-z0-9]{1,20}$/i.test(String(p.id || '')) ? String(p.id) : '';
    if (!id || ids[id]) id = 'lot' + Date.now().toString(36) + i;
    const done = Number(given[id]) || 0;
    const before = done ? adventPrizes().filter(x => x.id === id)[0] : null;
    if (before && (before.kind !== kind || (before.credits || 0) !== credits)) {
      return { success: false, message: '« ' + label + ' » a déjà été gagné : son type et ses crédits ne peuvent plus changer (créez plutôt un autre lot).' };
    }
    if (quantity > 0 && quantity < done) return { success: false, message: '« ' + label + ' » : déjà ' + done + ' gagné(s), la quantité ne peut pas être plus petite.' };
    const days = (Array.isArray(p.days) ? p.days : []).map(toInt).filter(d => d >= 1 && d <= ADVENT.days)
      .filter((d, j, a) => a.indexOf(d) === j).sort((a, b) => a - b);
    const chance = p.chance === '' || p.chance == null ? 0 : Number(p.chance);
    if (!(chance >= 0 && chance <= 100)) return { success: false, message: '« ' + label + ' » : pourcentage de chance entre 0 et 100.' };
    ids[id] = true;
    const rarity = ['commun', 'rare', 'legendaire'].indexOf(p.rarity) !== -1 ? p.rarity : '';
    prizes.push({ id: id, label: label, kind: kind, credits: credits, quantity: quantity, chance: Math.round(chance * 10) / 10, rarity: rarity,
      days: days, detail: cleanText(p.detail, 140) });
  }
  const removedWithWins = Object.keys(given).filter(id => given[id] > 0 && !ids[id]);
  if (removedWithWins.length) {
    return { success: false, message: 'Un lot déjà gagné ne peut pas être supprimé : mettez sa quantité au nombre déjà gagné.' };
  }
  PropertiesService.getScriptProperties().setProperty('ADVENT_PRIZES:' + ADVENT.year, JSON.stringify(prizes));
  return getAdventAdmin(idToken);
}

/** doPost setAdventDelivered : coche ou décoche « remis » pour un cadeau gagné. */
function setAdventDelivered(idToken, raw) {
  try {
    adventAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const uid = String((raw && raw.uid) || '');
  const day = toInt(raw && raw.day);
  if (!/^[A-Za-z0-9]{1,128}$/.test(uid) || !(day >= 1 && day <= ADVENT.days)) return { success: false, message: 'Gagnant inconnu.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const record = adventRecord(uid);
    if (!record || !record.d || !record.d[day]) return { success: false, message: 'Gagnant inconnu.' };
    const e = adventEntry(record.d[day]);
    e.x = !!raw.delivered;
    record.d[day] = adventEntryText(e);
    PropertiesService.getScriptProperties().setProperty(adventUserKey(uid), JSON.stringify(record));
  } finally {
    lock.releaseLock();
  }
  return { success: true };
}

/** doPost setAdventPublic : montre (true) ou cache (false) le calendrier aux clients. */
function setAdventPublic(idToken, raw) {
  try {
    adventAdmin(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const props = PropertiesService.getScriptProperties();
  if (raw && raw.public) props.setProperty('ADVENT_PUBLIC:' + ADVENT.year, '1');
  else props.deleteProperty('ADVENT_PUBLIC:' + ADVENT.year);
  return { success: true, public: adventIsPublic() };
}
