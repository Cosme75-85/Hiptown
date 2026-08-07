// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Configuration
// ═══════════════════════════════════════════════════════
const PORTAIL = {
  incidentUrl: "https://noteforms.com/forms/nabo0609-emergence-cw-dcepd5",

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
