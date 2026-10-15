// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Règles des mots de passe
//  (inscription, changement de mot de passe, création d'un compte équipe)
// ═══════════════════════════════════════════════════════

export const PASSWORD_RULES = [
  { label: "8 caractères minimum", test: pw => pw.length >= 8 },
  { label: "Une majuscule",        test: pw => /[A-Z]/.test(pw) },
  { label: "Une minuscule",        test: pw => /[a-z]/.test(pw) },
  { label: "Un chiffre",           test: pw => /[0-9]/.test(pw) },
  { label: "Un caractère spécial (ex. ! ? @ # $ %)", test: pw => /[^A-Za-z0-9]/.test(pw) }
];

/** Message d'erreur si le mot de passe ne respecte pas toutes les règles, sinon "". */
export function passwordProblem(pw) {
  const missing = PASSWORD_RULES.filter(rule => !rule.test(pw || "")).map(rule => rule.label.toLowerCase());
  return missing.length ? "Mot de passe trop faible. Il manque : " + missing.join(", ") + "." : "";
}

/**
 * Affiche la liste des règles sous un champ mot de passe et coche
 * chaque règle au fur et à mesure de la saisie.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} list  un <ul> vide
 */
export function attachPasswordRules(input, list) {
  list.classList.add("password-rules");
  const items = PASSWORD_RULES.map(rule => {
    const li = document.createElement("li");
    li.textContent = rule.label;
    list.appendChild(li);
    return li;
  });
  function update() {
    PASSWORD_RULES.forEach((rule, i) => items[i].classList.toggle("ok", rule.test(input.value)));
  }
  input.addEventListener("input", update);
  // form.reset() vide le champ sans déclencher « input »
  input.form?.addEventListener("reset", () => setTimeout(update));
  update();
}
