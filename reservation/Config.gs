/**
 * CONFIGURATION — tout ce qui se règle sans toucher à la logique.
 * (Apps Script partage les constantes entre tous les fichiers .gs du projet.)
 */

// color : bandeau en haut de la carte (couleurs de la charte Hiptown)
// capacity: 1 pour une salle classique (un seul créneau à la fois)
//           5 pour un espace type coworking (jusqu'à 5 réservations simultanées)
// availableFrom (facultatif) : 'AAAA-MM-JJ', premier jour où l'espace peut être réservé.
//           Avant cette date, il est affiché « fermé » et toute réservation est refusée
//           (site public ET espace coworking). Supprimez-le pour rouvrir l'espace tout de suite.
const SPACES = [
  { id: 'salleCanele', name: 'Salle Canelé', calendarId: 'c_fec46c2863f6a212b080da22b9370f4a167e38ce02fe9dcb0c6a45fd45f77e09@group.calendar.google.com', color: '#67DFCB', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_salles_reunion_bordeaux_emergence_table_ovale_ecran.png', capacity: 1, maxPeople: 15, category: 'Salles de réunion', hourlyPrice: 60, halfDayPrice: 220, fullDayPrice: 420, allowMultiDay: true, availableFrom: '2027-01-01' },
  { id: 'salleBouchon', name: 'Salle Bouchon', calendarId: 'c_eea6ff19556cc6e7f09bcf491b707839dfc04f39077ae9003fbda9e9bcf154c8@group.calendar.google.com', color: '#68DEA4', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_salles_reunion_bordeaux_emergence_salle_equipee_ecran-1.png', capacity: 1, maxPeople: 12, category: 'Salles de réunion', hourlyPrice: 55, halfDayPrice: 200, fullDayPrice: 380, allowMultiDay: true, availableFrom: '2027-01-01' },
  { id: 'salleDuneblanche', name: 'Salle Dune Blanche', calendarId: 'c_8f827f6fb5f22d9b567c96f9c2af8cee3b03d2cab5a0a0b5299de5f5eb5665e0@group.calendar.google.com', color: '#A781D7', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_salles_reunion_bordeaux_emergence_salle_ronde_ecran.png', capacity: 1, maxPeople: 4, category: 'Salles de réunion', hourlyPrice: 30, halfDayPrice: 105, fullDayPrice: 200, allowMultiDay: true, availableFrom: '2027-01-01' },
  { id: 'sallePuitsdamour', name: 'Salle Puits d amour', calendarId: 'c_61a5eca91edea3e3d9bf8c4d8b27f253baf756f7e5358031ecf175a0dbb0a628@group.calendar.google.com', color: '#FFE700', photoUrl: 'https://drive.google.com/thumbnail?id=1XPUNS0f8N8HmVy4vitLiooGa_XFV-qa6&sz=w1000', capacity: 1, maxPeople: 12, category: 'Salles de réunion', hourlyPrice: 55, halfDayPrice: 200, fullDayPrice: 380, allowMultiDay: true },
  { id: 'cafecowork', name: 'Café Cowork', calendarId: 'c_860e1aed1cb31caa76635278dc4d7418a6559e241b0181e9ff7f7850faa3e620@group.calendar.google.com', color: '#F47A5B', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_espaces_communs_bordeaux_emergence_cuisine_partagee-800x455.png', capacity: 5, maxPeople: null, category: 'Café Cowork', hourlyPrice: 6.5, halfDayPrice: 18, fullDayPrice: 30 },
  { id: 'bureau2postes', name: 'Bureau 2 postes', calendarId: 'c_80c2d145121bbcbbc09c1692430fd5e77ea89c0412cda596e6501a5019a0bee1@group.calendar.google.com', color: '#1E1847', photoUrl: 'https://drive.google.com/thumbnail?id=1lVwerjtjuFl8Rlx2BDwdi1qxOwlaMBSH&sz=w1000', capacity: 2, maxPeople: null, quantitySelectable: true, onlyHalfOrFullDay: true, badgeLabel: '2 postes de travail', category: 'Location de bureau courte durée' }
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
  deskFullDay: [30, 50],
  vatRate: 0.2            // TVA appliquée à toutes les lignes (salles, repas, parking)
};

// Devis PDF joint à l'email de confirmation (voir Devis.gs). Textes repris du modèle Excel.
const DEVIS = {
  numberPrefix: 'NABO06',        // + date JJMMAAAA (+ 1, 2, 3... si plusieurs devis le même jour)
  validityDays: 30,              // date d'échéance = date du devis + 30 jours
  driveFolderName: 'Devis réservations Hiptown',  // copie de chaque devis, dossier créé automatiquement
  issuerLines: [
    'Hiptown bureaux flexibles',
    '67 rue Arago – CS 70058 – 93585 SAINT-OUEN CEDEX',
    '02 30 96 23 60',
    'cc@hiptown.com',
    'N° Siret : 853 953 735 00018',
    'N° TVA intra. : FR37853953735'
  ],
  // Remarques affichées selon la catégorie de l'espace (aucune si la catégorie n'est pas listée)
  remarksByCategory: {
    'Salles de réunion': 'Salle de réunion toute équipée : TV connectée, white board et wifi haut débit. '
      + 'Ce prix comprend l\'accès à l\'espace commun, café et thé. '
      + 'Nous proposons une option « viennoiserie » disponible sur demande.'
  },
  // Remarque des devis « repas seuls » des coworkers (la salle est réservée sur leurs crédits)
  coworkingMealsRemark: 'Salle de réunion réservée sur les crédits coworking de votre entreprise : '
    + 'ce devis concerne uniquement la restauration commandée.',
  paymentMethod: 'Par virement bancaire',
  paymentTerms: 'Conditions de règlement : A réception de facture. A défaut et conformément à la loi, des pénalités de retard '
    + 'égales à trois fois le taux de d\'intérêt légal, et une indemnité forfaitaire de 40 € sont dues, le jour suivant la date '
    + 'd\'exigibilité de la présente facture. Aucun escompte ne sera accordé pour paiement anticipé. TVA payée sur les encaissements',
  footerCompany: ['HIPTOWN EXPLOITATION', 'N° Siret : 853 953 735 00018', 'N° TVA intra. : FR37853953735'],
  contact: { name: 'Anne-Lise MEDALIN', phone: '(+33) 7 66 87 61 74', email: 'alm@hiptown.com' },
  bankDetails: 'Envoyées avec la 1ère facture'
};

// Une demande non traitée au bout de ce délai est supprimée (voir purgeExpiredRequests)
const PENDING_EXPIRY_DAYS = 14;
const NOTIFY_ON_EXPIRY = true;  // prévenir le client par email quand sa demande expire

// Email qui reçoit les demandes à valider
const OWNER_EMAIL = 'cc@hiptown.com';

// Fichier Drive joint à l'email de confirmation (plan d'accès au bâtiment)
const ACCESS_PLAN_FILE_ID = '103mmvdLZYGekCjWOXS0FrXej2YtfAgNH';

// Durée de mémorisation des disponibilités (voir withCache dans Code.gs)
const CACHE_TTL_SECONDS = 600; // 10 minutes

// Limites vérifiées côté serveur : on ne fait jamais confiance au navigateur,
// une requête peut être fabriquée à la main sans passer par le formulaire.
const MAX_MULTI_DAYS = 31;       // durée max d'une réservation multi-jours
const MAX_PARKING = 10;          // places de parking max par demande
const MAX_TEXT_LENGTH = 100;     // prénom, nom, entreprise, email, titre
const MAX_NOTES_LENGTH = 2000;   // note libre

// Données rangées dans l'événement lui-même (invisibles dans l'agenda) :
// plus fiables que relire la description, que l'on peut modifier à la main.
const TAG_EMAIL = 'requesterEmail';
const TAG_FIRST_NAME = 'firstName';
const TAG_QUANTITY = 'quantity';
const TAG_BOOKING = 'booking';   // détail de la demande (JSON), relu pour éditer le devis
const TAG_THANKS_SENT = 'thanksSent'; // date d'envoi de l'email de remerciement (évite les doublons)

// ==================== RÉSERVATION DEPUIS L'ESPACE COWORKING (voir Coworking.gs) ====================
// Les coworkers réservent depuis le portail client, sans payer : réservation confirmée
// tout de suite, dans les mêmes agendas que les réservations externes.
const COWORKING = {
  spaceIds: ['salleCanele', 'salleBouchon', 'salleDuneblanche', 'sallePuitsdamour'],  // salles proposées
  allowedRoles: ['coworking', 'admin'],   // rôles du portail autorisés à réserver
  firebaseProjectId: 'erp-hiptown',       // projet Firebase du portail (firebase-config.js)
  titlePrefix: '[COWORKING] ',            // début du titre de l'événement dans l'agenda
  // Lieu indiqué quand un coworker ajoute sa réservation à son propre agenda (Google, Apple, Outlook).
  // Mettez l'adresse complète pour que le GPS la trouve.
  address: 'Hiptown Emergence, 52 quai de Paludate, 33800 Bordeaux',
  mealsNoticeHours: 24,                   // repas à commander au moins 24h avant le début de la réunion

  // Barème en crédits, par salle (même découpage que les tarifs : à l'heure,
  // demi-journée = 5h, journée = plus de 5h). Sans demi-journée ou journée
  // indiquée, on compte le tarif horaire × le nombre d'heures.
  // Les crédits d'une entreprise (fiche « Gestion des entreprises » du portail)
  // sont redonnés chaque mois et ne se cumulent pas d'un mois sur l'autre.
  credits: {
    salleDuneblanche: { hourly: 1 },                                  // 1 à 6 personnes
    salleBouchon:     { hourly: 55, halfDay: 200, fullDay: 380 },     // 12 personnes
    sallePuitsdamour: { hourly: 55, halfDay: 200, fullDay: 380 },     // 12 personnes
    salleCanele:      { hourly: 60, halfDay: 220, fullDay: 420 }      // 15 personnes
  }
};
const TAG_PORTAL_UID = 'portalUid';       // compte du portail qui a réservé
const TAG_COMPANY = 'portalCompanyId';    // entreprise coworking dont les crédits sont utilisés
const TAG_CREDITS = 'credits';            // crédits utilisés par la réservation
const TAG_MEALS = 'meals';                // repas commandés par un coworker (JSON), facturés sur devis

// Civilités proposées dans le formulaire (utilisées dans « Bonjour Madame Dupont, »)
const CIVILITIES = ['Madame', 'Monsieur'];

// ==================== EMAIL DE REMERCIEMENT (voir Remerciement.gs) ====================
// Envoyé automatiquement X jours après la fin de chaque réservation CONFIRMÉE.
// Dans les textes : {date} est remplacé par « le lundi 6 octobre 2026 »
// (ou « du lundi 6 au mercredi 8 octobre 2026 » pour plusieurs jours).
// Les textes acceptent le HTML simple (<b>gras</b>). Un espace absent de `bySpace`
// ne reçoit pas d'email de remerciement.
const THANKS = {
  delayDays: 3,     // jours après la réservation
  sendHour: 10,     // heure d'envoi (entre 10h et 11h)
  reviewUrl: 'https://g.page/r/CU4ouN9TY1R8EBM/review',
  reviewButton: '★ Aidez-nous pour le référencement !! ★',
  reviewText: 'Aidez-nous à gagner en visibilité et à améliorer nos services en prenant un instant pour nous laisser '
    + 'un avis sur Google !! Cela ne prendra qu\'une minute et nous serait d\'une grande aide.',
  closing: [
    'Votre opinion compte beaucoup pour nous, et nous sommes toujours à l\'écoute de vos suggestions pour rendre '
      + 'votre expérience encore meilleure.',
    'Encore un grand merci pour votre confiance. Nous serions ravis de vous accueillir à nouveau prochainement !'
  ],
  signOff: 'À très bientôt',

  // Un texte par espace (clé = id de l'espace dans SPACES)
  bySpace: {
    salleCanele: {
      subject: 'Merci d\'avoir choisi la salle Canelé — Hiptown',
      intro: 'Nous tenons à vous remercier chaleureusement d\'avoir choisi notre salle de réunion <b>Canelé</b> {date}. '
        + 'Nous espérons que tout s\'est déroulé comme vous le souhaitiez et que notre espace a répondu à vos attentes.',
      topics: ['La salle de réunion Canelé', 'L\'espace détente', 'L\'emplacement']
    },
    salleBouchon: {
      subject: 'Merci d\'avoir choisi la salle Bouchon — Hiptown',
      intro: 'Nous tenons à vous remercier chaleureusement d\'avoir choisi notre salle de réunion <b>Bouchon</b> {date}. '
        + 'Nous espérons que tout s\'est déroulé comme vous le souhaitiez et que notre espace a répondu à vos attentes.',
      topics: ['La salle de réunion Bouchon', 'L\'espace détente', 'L\'emplacement']
    },
    salleDuneblanche: {
      subject: 'Merci d\'avoir choisi la salle Dune Blanche — Hiptown',
      intro: 'Nous tenons à vous remercier chaleureusement d\'avoir choisi notre salle de réunion <b>Dune Blanche</b> {date}. '
        + 'Nous espérons que tout s\'est déroulé comme vous le souhaitiez et que notre espace a répondu à vos attentes.',
      topics: ['La salle de réunion Dune Blanche', 'L\'espace détente', 'L\'emplacement']
    },
    sallePuitsdamour: {
      subject: 'Merci d\'avoir choisi la salle Puits d\'Amour — Hiptown',
      intro: 'Nous tenons à vous remercier chaleureusement d\'avoir choisi notre salle de réunion <b>Puits d\'Amour</b> {date}. '
        + 'Nous espérons que tout s\'est déroulé comme vous le souhaitiez et que notre espace a répondu à vos attentes.',
      topics: ['La salle de réunion Puits d\'Amour', 'L\'espace détente', 'L\'emplacement']
    },
    bureau2postes: {
      subject: 'Merci d\'avoir choisi notre bureau privatif — Hiptown',
      intro: 'Nous tenons à vous remercier chaleureusement d\'avoir choisi notre <b>bureau privatif</b> {date}. '
        + 'Nous espérons que vous avez pu travailler au calme et que cet espace a répondu à vos attentes.',
      topics: ['Le bureau privatif', 'L\'espace détente', 'L\'emplacement']
    },
    cafecowork: {
      subject: 'Merci d\'avoir choisi le Café Cowork — Hiptown',
      intro: 'Nous tenons à vous remercier chaleureusement d\'avoir choisi notre <b>Café Cowork</b> pour travailler {date}. '
        + 'Nous espérons que vous avez passé une journée agréable et productive, et que l\'ambiance du lieu vous a plu.',
      topics: ['Le Café Cowork', 'L\'ambiance et le confort', 'L\'emplacement']
    }
  }
};
