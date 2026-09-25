/**
 * CONFIGURATION — tout ce qui se règle sans toucher à la logique.
 * (Apps Script partage les constantes entre tous les fichiers .gs du projet.)
 */

// color : bandeau en haut de la carte (couleurs de la charte Hiptown)
// capacity: 1 pour une salle classique (un seul créneau à la fois)
//           5 pour un espace type coworking (jusqu'à 5 réservations simultanées)
const SPACES = [
  { id: 'salleCanele', name: 'Salle Canelé', calendarId: 'c_fec46c2863f6a212b080da22b9370f4a167e38ce02fe9dcb0c6a45fd45f77e09@group.calendar.google.com', color: '#67DFCB', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_salles_reunion_bordeaux_emergence_table_ovale_ecran.png', capacity: 1, maxPeople: 15, category: 'Salles de réunion', hourlyPrice: 60, halfDayPrice: 220, fullDayPrice: 420, allowMultiDay: true },
  { id: 'salleBouchon', name: 'Salle Bouchon', calendarId: 'c_eea6ff19556cc6e7f09bcf491b707839dfc04f39077ae9003fbda9e9bcf154c8@group.calendar.google.com', color: '#68DEA4', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_salles_reunion_bordeaux_emergence_salle_equipee_ecran-1.png', capacity: 1, maxPeople: 12, category: 'Salles de réunion', hourlyPrice: 55, halfDayPrice: 200, fullDayPrice: 380, allowMultiDay: true },
  { id: 'salleDuneblanche', name: 'Salle Dune Blanche', calendarId: 'c_8f827f6fb5f22d9b567c96f9c2af8cee3b03d2cab5a0a0b5299de5f5eb5665e0@group.calendar.google.com', color: '#A781D7', photoUrl: 'https://hiptown.com/wp-content/uploads/sites/6/2024/07/hiptown_salles_reunion_bordeaux_emergence_salle_ronde_ecran.png', capacity: 1, maxPeople: 4, category: 'Salles de réunion', hourlyPrice: 30, halfDayPrice: 105, fullDayPrice: 200, allowMultiDay: true },
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
