/**
 * MES PROCHAINES RÉSERVATIONS — MesReservations.gs
 * -------------------------------------------------
 * Liste, sur le tableau de bord du portail, toutes les réservations à venir de la
 * personne connectée, quel que soit l'outil qui a servi à réserver :
 *   - demandes faites avec l'outil de réservation des salles (en attente ou confirmées),
 *     retrouvées grâce à l'email du demandeur enregistré dans l'événement ;
 *   - réservations coworking faites depuis le portail (même email, enregistré aussi).
 * Lecture seule : rien n'est modifié dans les agendas.
 */

/** Réservations à venir du compte connecté, dans tous les espaces, sur les 12 prochains mois. */
function getMyUpcomingBookings(idToken) {
  let account;
  try {
    account = getPortalAccount(idToken);
  } catch (err) {
    return { success: false, message: err.message };
  }

  const now = new Date();
  const to = new Date(now.getTime() + 366 * DAY_MS);
  const bookings = [];
  try {
    SPACES.forEach(space => {
      listEventsByEmail(space, account.email, now, to).forEach(ev => {
        if (ev.end <= now) return;
        const isCoworking = ev.title.indexOf(COWORKING.titlePrefix) === 0;
        let status;
        let title;
        if (isCoworking) {
          status = 'confirmed';
          title = ev.title.slice(COWORKING.titlePrefix.length);
        } else if (ev.title.indexOf(CONFIRMED_PREFIX) === 0) {
          status = 'confirmed';
          title = ev.title.slice(CONFIRMED_PREFIX.length);
        } else if (ev.title.indexOf(PENDING_PREFIX) === 0) {
          status = 'pending';
          title = ev.title.slice(PENDING_PREFIX.length);
        } else {
          return; // événement retouché à la main dans l'agenda : on ne devine pas son statut
        }
        const slot = eventSlot(ev.start, ev.end);
        const people = (ev.description.match(/Nombre de personnes : (\d+)/) || [])[1];
        const total = (ev.description.match(/Total estimé : ([\d.,]+ €HT)/) || [])[1];
        bookings.push({
          kind: isCoworking ? 'coworking' : 'room',
          status: status,
          // Modifiable depuis la tuile « Réserver une salle de réunion » (coworking, même compte)
          editable: isCoworking && ev.portalUid === account.uid && ev.start > now,
          spaceId: space.id,
          spaceName: space.name,
          color: space.color,
          address: COWORKING.address || '',
          eventId: ev.id,
          title: title,
          start: ev.start.getTime(),
          end: ev.end.getTime(),
          dateString: slot.dateString,
          endDateString: slot.isMultiDay ? slot.endDateString : null,
          startHour: slot.startHour,
          endHour: slot.endHour,
          numberOfPeople: people ? Number(people) : null,
          total: total || ''
        });
      });
    });
  } catch (err) {
    return { success: false, message: 'Impossible de lire vos réservations : ' + err.message };
  }
  bookings.sort((a, b) => a.start - b.start);
  return { success: true, bookings: bookings, contactEmail: OWNER_EMAIL };
}

/**
 * Événements d'un espace dont le tag requesterEmail est cet email :
 * { id, title, start, end, description, portalUid }.
 * Voie rapide avec le service avancé Calendar (filtre fait par Google), sinon CalendarApp.
 */
function listEventsByEmail(space, email, from, to) {
  if (typeof Calendar !== 'undefined') {
    const out = [];
    let pageToken;
    do {
      const page = Calendar.Events.list(space.calendarId, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        maxResults: 250,
        privateExtendedProperty: TAG_EMAIL + '=' + email,
        pageToken: pageToken,
        fields: 'nextPageToken,items(iCalUID,summary,start,end,description,extendedProperties/private)'
      });
      (page.items || []).forEach(ev => {
        const tags = (ev.extendedProperties && ev.extendedProperties.private) || {};
        if (String(tags[TAG_EMAIL] || '').toLowerCase() !== email) return;
        out.push({
          id: ev.iCalUID,
          title: ev.summary || '',
          start: new Date(apiEventTime(ev.start)),
          end: new Date(apiEventTime(ev.end)),
          description: ev.description || '',
          portalUid: tags[TAG_PORTAL_UID] || ''
        });
      });
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  const cal = CalendarApp.getCalendarById(space.calendarId);
  if (!cal) return [];
  return cal.getEvents(from, to)
    .filter(ev => String(ev.getTag(TAG_EMAIL) || '').toLowerCase() === email)
    .map(ev => ({
      id: ev.getId(),
      title: ev.getTitle(),
      start: ev.getStartTime(),
      end: ev.getEndTime(),
      description: ev.getDescription() || '',
      portalUid: ev.getTag(TAG_PORTAL_UID) || ''
    }));
}

/**
 * Compte du portail à qui appartient le jeton : { uid, email }, quel que soit son rôle
 * (client salle de réunion, coworker, équipe), à condition qu'il soit validé.
 * L'email vient du jeton de connexion lui-même (pas de la fiche, modifiable) : on ne
 * voit que les réservations faites avec l'adresse de son propre compte.
 */
function getPortalAccount(idToken) {
  const uid = tokenUid(idToken);
  if (!uid) throw new Error('Session expirée, merci de vous reconnecter au portail.');
  // Lire sa fiche avec le jeton prouve qu'il est authentique (Firestore vérifie sa signature)
  const profile = readFirestoreDoc('users/' + encodeURIComponent(uid), idToken);
  if (!profile || profile.status !== 'approved') {
    throw new Error('Votre compte n\'est pas encore validé par l\'équipe Hiptown.');
  }
  const email = tokenEmail(idToken);
  if (!email) throw new Error('Adresse email manquante sur votre compte. Contactez l\'équipe Hiptown.');
  return { uid: uid, email: email };
}

/** Email écrit dans le jeton (vérifié par Firestore dans getPortalAccount), en minuscules. */
function tokenEmail(idToken) {
  try {
    const part = idToken.split('.')[1];
    const padded = part + '==='.slice((part.length + 3) % 4);
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString());
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= MAX_TEXT_LENGTH ? email : '';
  } catch (err) {
    return '';
  }
}
