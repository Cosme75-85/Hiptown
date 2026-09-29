// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Configuration
// ═══════════════════════════════════════════════════════
const PORTAIL = {
  incidentUrl: "https://noteforms.com/forms/nabo0609-emergence-cw-dcepd5",

  // Outil de réservation des salles (Google Apps Script, dossier reservation/ du dépôt).
  // Sert à la tuile « Réserver une salle » (clients salle de réunion) et à la
  // réservation intégrée de l'espace coworking (resa-coworking.js).
  reservationUrl: "https://script.google.com/macros/s/AKfycbz2lt2umtwfuUdn67o0HJHTBFBDa_J3ROt2JWW_YzoMoFyBjHUuxQ4Plb342Bj_LMp47A/exec",

  // ── Sites Hiptown (villes) ────────────────────────────
  // Chaque compte est rattaché à un site. Un admin ne voit et ne modifie
  // que les comptes de son site. Pour ouvrir une nouvelle ville, ajoute-la ici.
  sites: {
    bordeaux: "Bordeaux",
  },
  // Crédits coworking proposés par poste négocié dans le contrat (modifiable
  // entreprise par entreprise dans « Gestion des entreprises »)
  creditsPerSeat: 10,

  // Site attribué automatiquement aux clients qui s'inscrivent sur ce portail
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
