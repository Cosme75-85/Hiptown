// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Commande petit-déjeuner
// ═══════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js";
import { doc, getDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PRICE_PER_PERSON = 7;

// ⚠️ Colle ici l'URL de déploiement de ton Google Apps Script (voir guide fourni).
// Tant que ce n'est pas rempli, la commande est bien enregistrée mais n'apparaît pas
// automatiquement dans le calendrier.
const CALENDAR_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxXXXXXX.../exec";
const dateInput    = document.getElementById("breakfast-date");
const peopleInput  = document.getElementById("breakfast-people");
const priceLabel   = document.getElementById("breakfast-price");
const form         = document.getElementById("breakfast-order-form");
const errorBox     = document.getElementById("breakfast-order-error");
const successBox   = document.getElementById("breakfast-order-success");

function updatePrice() {
  const people = Math.max(1, parseInt(peopleInput.value, 10) || 1);
  priceLabel.textContent = (people * PRICE_PER_PERSON) + " €";
}
peopleInput?.addEventListener("input", updatePrice);

// Le délai de commande : avant 17h la veille du jour choisi
function isOrderAllowed(dateStr) {
  const breakfastDate = new Date(dateStr + "T00:00:00");
  const cutoff = new Date(breakfastDate);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(17, 0, 0, 0);
  return new Date() < cutoff;
}

async function getCurrentUserContext() {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, "users", user.uid));
  const profile = snap.exists() ? snap.data() : {};
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || user.email;
  let companyName = "";
  if (profile.role === "coworking" && profile.companyId) {
    const companySnap = await getDoc(doc(db, "companies", profile.companyId));
    if (companySnap.exists()) companyName = companySnap.data().name || "";
  }
  return { uid: user.uid, email: user.email, name, companyName };
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  successBox.style.display = "none";

  const dateStr = dateInput.value;
  const people  = Math.max(1, parseInt(peopleInput.value, 10) || 1);
  const price   = people * PRICE_PER_PERSON;

  if (!dateStr) {
    errorBox.textContent = "Merci de choisir une date.";
    errorBox.hidden = false;
    return;
  }

  if (!isOrderAllowed(dateStr)) {
    errorBox.textContent = "Trop tard pour cette date : commandez avant 17h la veille du petit-déjeuner.";
    errorBox.hidden = false;
    return;
  }

  const context = await getCurrentUserContext();
  if (!context) {
    errorBox.textContent = "Vous devez être connecté pour commander.";
    errorBox.hidden = false;
    return;
  }

  try {
    // 1) Enregistrement dans Firestore (toujours, sert de trace fiable)
    await addDoc(collection(db, "breakfastOrders"), {
      uid: context.uid,
      email: context.email,
      name: context.name,
      companyName: context.companyName || null,
      date: dateStr,
      people,
      price,
      createdAt: serverTimestamp()
    });

    // 2) Tentative d'ajout au calendrier via Google Apps Script (si configuré)
    if (CALENDAR_WEBHOOK_URL) {
      try {
        await fetch(CALENDAR_WEBHOOK_URL, {
          method: "POST",
          mode: "no-cors", // Apps Script ne permet pas de lire la réponse, mais l'exécute bien
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            name: context.name,
            email: context.email,
            companyName: context.companyName,
            date: dateStr,
            people,
            price
          })
        });
      } catch (calErr) {
        // On n'empêche pas la commande si le calendrier échoue : elle reste dans Firestore
        console.warn("Ajout calendrier échoué (commande tout de même enregistrée) :", calErr);
      }
    }

    successBox.style.display = "block";
    peopleInput.value = 1;
    updatePrice();
  } catch (err) {
    errorBox.textContent = "Une erreur est survenue, réessayez.";
    errorBox.hidden = false;
  }
});
