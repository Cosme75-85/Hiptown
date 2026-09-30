// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Profil personnalisable (photo, surnom, entreprise, poste, ville)
// ═══════════════════════════════════════════════════════

const PHOTO_SIZE = 200;          // px : photo carrée, suffisante pour un avatar net
const PHOTO_QUALITY = 0.8;       // compression JPEG (0 à 1)
const MAX_PHOTO_LENGTH = 150000; // caractères, même limite que firestore.rules
const MAX_NICKNAME_LENGTH = 30;
const MAX_COMPANY_LENGTH = 100;
const MAX_JOB_TITLE_LENGTH = 60; // même limite que firestore.rules
const MAX_CITY_LENGTH = 60;

// Seules nos photos (JPEG encodé en base64) sont affichées : une valeur
// trafiquée dans Firestore ne peut pas injecter autre chose dans la page.
const SAFE_PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

export function isSafePhoto(photo) {
  return typeof photo === "string" && photo.length <= MAX_PHOTO_LENGTH && SAFE_PHOTO.test(photo);
}

/**
 * Recadre l'image choisie en carré (centré) et la réduit à PHOTO_SIZE px.
 * Tout se fait dans le navigateur : on n'envoie qu'environ 15 Ko,
 * pas la photo d'origine de plusieurs Mo.
 * @returns {Promise<string>} image JPEG en « data URL » (texte)
 */
export async function resizePhoto(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Merci de choisir une image.");

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image illisible. Essayez une photo au format JPEG ou PNG."));
      image.src = url;
    });

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PHOTO_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // fond blanc pour les PNG transparents
    ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    ctx.drawImage(img,
      (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
      0, 0, PHOTO_SIZE, PHOTO_SIZE);

    const photo = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
    if (photo.length > MAX_PHOTO_LENGTH) throw new Error("Photo trop lourde, essayez-en une autre.");
    return photo;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Branche la page « Mon profil ».
 * @param {Object} options
 * @param {() => {profile: Object, space: string, companyName: string}} options.getContext
 *        profil Firestore courant, espace ("salle" | "coworking" | "hiptown") et entreprise affichée
 * @param {(fields: Object) => Promise<void>} options.save  enregistre les champs modifiés
 * @param {() => void} options.onClose  retour au tableau de bord
 */
export function initProfilePage({ getContext, save, onClose }) {
  const $ = id => document.getElementById(id);
  const avatar = $("profile-avatar");
  const photoInput = $("profile-photo-input");
  const nicknameInput = $("profile-nickname");
  const companyInput = $("profile-company");
  const jobTitleInput = $("profile-jobtitle");
  const cityInput = $("profile-city");
  const teamFields = $("profile-team-fields");
  const nameBlock = $("profile-name-block");
  const companyNote = $("profile-company-note");
  const message = $("profile-message");
  const saveBtn = $("profile-save");

  nicknameInput.maxLength = MAX_NICKNAME_LENGTH;
  companyInput.maxLength = MAX_COMPANY_LENGTH;
  jobTitleInput.maxLength = MAX_JOB_TITLE_LENGTH;
  cityInput.maxLength = MAX_CITY_LENGTH;

  let photo = ""; // photo en cours d'édition (pas encore enregistrée)

  function showMessage(text, isError) {
    message.textContent = text;
    message.style.color = isError ? "#dc2626" : "#166534";
    message.hidden = !text;
  }

  function renderAvatar() {
    const { profile } = getContext();
    avatar.style.backgroundImage = photo ? 'url("' + photo + '")' : "";
    avatar.textContent = photo ? "" : initialsOf(profile);
    $("profile-photo-remove").hidden = !photo;
  }

  /** Équipe Hiptown : « Prénom Nom » en grand, le surnom en petit dessous (aperçu en direct). */
  function renderNameBlock() {
    const { profile, space } = getContext();
    nameBlock.hidden = space !== "hiptown";
    if (nameBlock.hidden) return;
    $("profile-fullname").textContent = fullNameOf(profile) || profile.email || "";
    const nickname = nicknameInput.value.trim();
    $("profile-nickname-preview").textContent = nickname;
    $("profile-nickname-preview").hidden = !nickname;
  }

  /** Ouvre la page, pré-remplie avec le profil actuel. */
  function open(infoMessage) {
    const { profile, space, companyName } = getContext();
    photo = isSafePhoto(profile.photo) ? profile.photo : "";
    nicknameInput.value = profile.nickname || "";

    // Poste et ville : seulement pour l'équipe Hiptown
    const isTeam = space === "hiptown";
    teamFields.hidden = !isTeam;
    jobTitleInput.value = profile.jobTitle || "";
    cityInput.value = profile.city || "";
    $("profile-nickname-help").textContent = isTeam
      ? "Affiché en petit sous votre prénom et nom."
      : "S'il est rempli, il remplace votre prénom et nom sur votre espace.";

    // Seul un client « salle de réunion » saisit lui-même son entreprise ;
    // en coworking, c'est l'entreprise attribuée par Hiptown à la validation.
    const editable = space === "salle";
    companyInput.value = editable ? (profile.companyNameHint || "") : companyName;
    companyInput.readOnly = !editable;
    companyNote.textContent = editable ? "" : "Entreprise attribuée par l'équipe Hiptown.";
    companyNote.hidden = editable;

    renderAvatar();
    renderNameBlock();
    showMessage(infoMessage || "", false);
    window.hideAllAuth();
    $("step-profile").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    photoInput.value = ""; // permet de rechoisir la même image
    if (!file) return;
    try {
      photo = await resizePhoto(file);
      renderAvatar();
      showMessage("", false);
    } catch (err) {
      showMessage(err.message, true);
    }
  });

  nicknameInput.addEventListener("input", renderNameBlock);

  $("profile-photo-remove").addEventListener("click", () => {
    photo = "";
    renderAvatar();
  });

  saveBtn.addEventListener("click", async () => {
    const { space } = getContext();
    const fields = { photo: photo, nickname: nicknameInput.value.trim().slice(0, MAX_NICKNAME_LENGTH) };
    if (space === "salle") {
      const company = companyInput.value.trim();
      if (!company) return showMessage("Le nom de l'entreprise est obligatoire.", true);
      fields.companyNameHint = company.slice(0, MAX_COMPANY_LENGTH);
    }
    if (space === "hiptown") {
      fields.jobTitle = jobTitleInput.value.trim().slice(0, MAX_JOB_TITLE_LENGTH);
      fields.city = cityInput.value.trim().slice(0, MAX_CITY_LENGTH);
    }

    saveBtn.disabled = true;
    try {
      await save(fields);
      showMessage("Profil enregistré ✓", false);
    } catch (err) {
      showMessage("Enregistrement impossible. Réessayez.", true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  $("back-from-profile").addEventListener("click", onClose);

  return { open };
}

/** « Prénom Nom » (vide s'ils ne sont pas renseignés). */
export function fullNameOf(profile) {
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
}

/** Initiales à afficher quand il n'y a pas de photo : surnom, sinon prénom + nom. */
export function initialsOf(profile) {
  const words = (profile.nickname || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email || "?")
    .trim().split(/\s+/);
  return words.slice(0, 2).map(w => w.charAt(0).toUpperCase()).join("");
}

/** Nom affiché : le surnom s'il existe, sinon « Prénom Nom ». */
export function displayNameOf(profile) {
  return profile.nickname || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email || "";
}
