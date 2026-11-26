// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Configuration
// ═══════════════════════════════════════════════════════
const PORTAIL = {
  incidentUrl: "https://noteforms.com/forms/nabo0609-emergence-cw-dcepd5",

  // Outil de réservation des salles (Google Apps Script, dossier reservation/ du dépôt).
  // Sert à la tuile « Réserver une salle » (clients salle de réunion) et à la
  // réservation intégrée de l'espace coworking (resa-coworking.js).
  reservationUrl: "https://script.google.com/macros/s/AKfycbxQi0MRfoJZ4YVroQfKe3l6mUBKwBZH8fMlMCLQa5YavhnKiZMsn6ULtb4-DHth47GsOw/exec",

  // Page publique d'accueil visiteurs de chaque ville (dépôt Hiptown-Accueil-1), partagée et
  // ouverte depuis Gestion > Accueil visiteurs. Une ville absente ici n'a pas encore de page.
  accueilPages: {
    bordeaux:  "https://cosme75-85.github.io/Hiptown-Accueil-1/",
    marseille: "https://cosme75-85.github.io/Hiptown-Accueil-1/marseille/",
  },

  // Notifications de la messagerie (Firebase Cloud Messaging) : clé publique « Certificats Web Push »
  // (console Firebase > Paramètres du projet > Cloud Messaging). Vide = notifications désactivées.
  pushVapidKey: "BATXZYhGekMSy5fIxjZxHAHfjcu3arkV5idNE-P-9VicaK07FrWO6MYA0Rd-p0NzfL2YuVSDiSf2fs6DcPjD-Jk",

  // ── Villes et sites Hiptown ───────────────────────────
  // Chaque compte est rattaché à une ville, et chaque client à un site de cette ville.
  //  - admin général : pas de ville, gère tout
  //  - admin de ville : gère tous les comptes de sa ville
  //  - employé : gère les clients des sites qu'on lui attribue
  // Pour ouvrir une ville ou un site, ajoute-le ici (l'identifiant à gauche ne doit
  // plus changer ensuite : il est enregistré sur les comptes).
  cities: {
    bordeaux: {
      name: "Bordeaux",
      code: "NABO",
      sites: {
        nabo01: "NABO01",
        nabo02: "NABO02 — Place de la Bourse CCI Tetris",
        nabo03: "NABO03 — Ferrere",
        nabo04: "NABO04 — Chartrons",
        nabo05: "NABO05 — Place de la Bourse CCI KBRW",
        nabo06: "NABO06 — Émergence",
        nabo07: "NABO07 — Tourny",
        nabo08: "NABO08 — Madéra",
      },
    },
    // 5 sites par ville pour commencer : noms, adresses et autres sites se complètent depuis la page Sites
    paris: {
      name: "Paris",
      code: "IFPA",
      sites: {
        ifpa01: "IFPA01",
        ifpa02: "IFPA02",
        ifpa03: "IFPA03",
        ifpa04: "IFPA04",
        ifpa05: "IFPA05",
      },
    },
    lyon: {
      name: "Lyon",
      code: "ARLY",
      sites: {
        arly01: "ARLY01",
        arly02: "ARLY02",
        arly03: "ARLY03",
        arly04: "ARLY04",
        arly05: "ARLY05",
      },
    },
    marseille: {
      name: "Marseille",
      code: "PAMA",
      // Noms et adresses à compléter (PAMA02 = coworking)
      sites: {
        pama01: "PAMA01",
        pama02: "PAMA02 — Coworking",
        pama03: "PAMA03",
        pama04: "PAMA04",
        pama05: "PAMA05",
        pama06: "PAMA06",
        pama07: "PAMA07",
        pama08: "PAMA08",
        pama09: "PAMA09",
        pama10: "PAMA10",
        pama11: "PAMA11",
        pama12: "PAMA12",
        pama13: "PAMA13",
      },
    },
    rennes: {
      name: "Rennes",
      code: "BRRE",
      sites: {
        brre01: "BRRE01",
        brre02: "BRRE02",
        brre03: "BRRE03",
        brre04: "BRRE04",
        brre05: "BRRE05",
      },
    },
    lille: {
      name: "Lille",
      code: "HFLI",
      sites: {
        hfli01: "HFLI01",
        hfli02: "HFLI02",
        hfli03: "HFLI03",
        hfli04: "HFLI04",
        hfli05: "HFLI05",
      },
    },
  },
  // Adresse de chaque site, affichée sous son nom quand un client choisit son site
  // à l'inscription. Un site sans adresse ici s'affiche sans adresse.
  siteAddresses: {
    nabo02: "12 place de la Bourse 33000 Bordeaux",
    nabo03: "37 rue Ferrère 33000 Bordeaux",
    nabo04: "27 rue Saint-Joseph 33000 Bordeaux",
    nabo05: "17 place de la Bourse 33000 Bordeaux",
    nabo06: "52 quai de Paludate 33800 Bordeaux",
    nabo07: "Allée de Tourny 33000 Bordeaux",
    nabo08: "67 avenue John Fitzgerald Kennedy 33700 Mérignac",
  },

  // Nom affiché aux clients quand ils choisissent leur site à l'inscription, s'il doit
  // être différent du nom interne ci-dessus (ex. pour ne pas montrer le nom d'un client).
  sitePublicNames: {
    nabo02: "Place de la Bourse",
    nabo05: "Place de la Bourse",
    nabo06: "Gare Saint-Jean",
  },

  // Seul site où l'on peut s'inscrire pour « Réserver une salle de réunion » :
  // à l'inscription, ce choix passe directement au formulaire avec ce site.
  meetingRoomSite: "nabo06",

  // Espace coworking de chaque ville : un seul au plus par ville (Bordeaux : NABO06,
  // Marseille : PAMA02). Dans Gestion, ces espaces ont deux parties, « Clients en
  // coworking » et « Salles de réunion » ; les autres espaces n'ont que « Clients ».
  coworkingSites: ["nabo06", "pama02"],

  // Espaces partagés par plusieurs entreprises : dans Gestion, l'espace est divisé en
  // une partie par entreprise (les comptes sont rangés d'après le nom de leur entreprise).
  // Pour les autres espaces, le nom de l'entreprise occupante vient des comptes.
  siteOccupants: {
    nabo04: ["Asphalte", "Mano-Mano"],
  },

  // Crédits coworking proposés par poste négocié dans le contrat (modifiable
  // entreprise par entreprise dans « Gestion des entreprises »)
  creditsPerSeat: 160,

  // Ville proposée par défaut (inscription, création de compte)
  defaultSite: "bordeaux",

  // ── Communications (barre en haut du portail) ──
  // Elles ne sont plus ici : chaque ville les gère dans le portail (bouton « Modifier »
  // de la barre, comptes admin Hiptown de la ville), voir communications.js.

  // Remarque : la liste des entreprises coworking (avec code couleur, badge...)
  // est maintenant gérée dans Firestore (collection "companies"), plus ici.
  // Voir l'étape 6 du guide d'installation pour recréer tes entreprises existantes.
};
