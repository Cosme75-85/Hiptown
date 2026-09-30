// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Configuration
// ═══════════════════════════════════════════════════════
const PORTAIL = {
  incidentUrl: "https://noteforms.com/forms/nabo0609-emergence-cw-dcepd5",

  // Outil de réservation des salles (Google Apps Script, dossier reservation/ du dépôt).
  // Sert à la tuile « Réserver une salle » (clients salle de réunion) et à la
  // réservation intégrée de l'espace coworking (resa-coworking.js).
  reservationUrl: "https://script.google.com/macros/s/AKfycbxQi0MRfoJZ4YVroQfKe3l6mUBKwBZH8fMlMCLQa5YavhnKiZMsn6ULtb4-DHth47GsOw/exec",

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
      sites: {
        nabo02: "NABO02 — Place de la Bourse CCI Tetris",
        nabo03: "NABO03 — Ferrere",
        nabo04: "NABO04 — Chartrons",
        nabo05: "NABO05 — Place de la Bourse CCI KBRW",
        nabo06: "NABO06 — Émergence",
        nabo07: "NABO07 — Tourny",
        nabo08: "NABO08 — Madéra",
      },
    },
  },
  // Crédits coworking proposés par poste négocié dans le contrat (modifiable
  // entreprise par entreprise dans « Gestion des entreprises »)
  creditsPerSeat: 160,

  // Ville proposée par défaut (inscription, création de compte)
  defaultSite: "bordeaux",

  // ── Événements ────────────────────────────────────────
  // Ajoutez/modifiez les événements ici
  // image: nom du fichier uploadé sur GitHub
  // Si pas d'événement, laissez le tableau vide : events: []
  events: [
    {
      image: "Couverture Facebook - Afterwork Hiptown Bordeaux Celebration.png",
      title: "Petit déjeuner networking",
      date:  "15 juillet 2026",
      desc:  "Rejoignez-nous pour un moment de partage autour d'un café ☕",
    },
    {
      image: "Couverture Facebook - Petit déjeuner networking.png",
      title: "Afterwork Hiptown",
      date:  "22 juillet 2026",
      desc:  "Venez décompresser et rencontrer la communauté Hiptown 🎉",
    },
  ],

  // Remarque : la liste des entreprises coworking (avec code couleur, badge...)
  // est maintenant gérée dans Firestore (collection "companies"), plus ici.
  // Voir l'étape 6 du guide d'installation pour recréer tes entreprises existantes.
};
