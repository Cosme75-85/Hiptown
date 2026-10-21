// ==================== MESSAGERIE : SUPPRESSION APRÈS 14 JOURS ====================
// Petit script Apps Script À PART (pas dans l'outil de réservation) : chaque nuit, il supprime
// dans Firestore les messages de plus de MESSAGE_RETENTION_DAYS jours, dans toutes les discussions :
//   conversations/{client}/messages   (client ↔ équipe Hiptown)
//   channels/{groupe}/messages        (équipe Hiptown d'une ville, collègues d'une entreprise)
// Une discussion dont le dernier message est lui-même trop ancien est supprimée entièrement
// (aperçu et pastille « non lu » compris) : elle repart de zéro au prochain message.
//
// Il agit avec le compte Google qui l'a installé, qui doit être propriétaire du projet Firebase
// (les règles Firestore ne s'appliquent pas à ce compte). Installation : voir README.md.

const MESSAGE_RETENTION_DAYS = 14;
const FIREBASE_PROJECT_ID = 'erp-hiptown';
const PARENT_COLLECTIONS = ['conversations', 'channels'];
const BATCH_SIZE = 400; // suppressions par appel (Firestore en accepte 500)

const FIRESTORE_DOCS = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID
  + '/databases/(default)/documents';

/** À lancer UNE fois à la main : programme purgeOldMessages chaque nuit vers 4h. Relancer ne crée pas de doublon. */
function installPurgeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'purgeOldMessages')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('purgeOldMessages').timeBased().everyDays(1).atHour(4).create();
  Logger.log('✅ Suppression quotidienne programmée (messages de plus de ' + MESSAGE_RETENTION_DAYS + ' jours).');
}

/** Essai sans rien supprimer : affiche dans le journal ce qui serait supprimé. */
function testPurgeSansSupprimer() {
  purge_(true);
}

/** Lancé chaque nuit par le déclencheur. */
function purgeOldMessages() {
  purge_(false);
}

function purge_(dryRun) {
  const cutoff = new Date(Date.now() - MESSAGE_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  let messages = 0, discussions = 0, more = false;
  PARENT_COLLECTIONS.forEach(collection => {
    listDocuments_(collection).forEach(parent => {
      // Messages trop anciens de cette discussion (par paquets)
      let names;
      do {
        names = oldMessageNames_(parent.name, cutoff);
        if (names.length && !dryRun) commit_(names.map(name => ({ delete: name })));
        messages += names.length;
      } while (names.length === BATCH_SIZE && !dryRun);
      if (dryRun && names.length === BATCH_SIZE) more = true; // l'essai ne compte que le premier paquet

      // Plus aucun message récent : on supprime aussi la discussion (sauf si elle a changé entre-temps)
      const lastAt = parent.fields && parent.fields.lastAt && parent.fields.lastAt.timestampValue;
      if (lastAt && lastAt < cutoff) {
        if (!dryRun) commit_([{ delete: parent.name, currentDocument: { updateTime: parent.updateTime } }], true);
        discussions++;
      }
    });
  });
  Logger.log((dryRun ? '🔎 Essai : seraient supprimés ' + (more ? 'au moins ' : '') : '🧹 Supprimés : ') + messages + ' message(s) de plus de '
    + MESSAGE_RETENTION_DAYS + ' jours et ' + discussions + ' discussion(s) sans message récent.');
}

/** Documents d'une collection (nom complet, dernier message, date de modification). */
function listDocuments_(collection) {
  const docs = [];
  let pageToken = '';
  do {
    const res = firestore_('get', FIRESTORE_DOCS + '/' + collection + '?pageSize=300&mask.fieldPaths=lastAt'
      + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    (res.documents || []).forEach(d => docs.push(d));
    pageToken = res.nextPageToken || '';
  } while (pageToken);
  return docs;
}

/** Noms complets des messages d'une discussion écrits avant cutoff (au plus BATCH_SIZE). */
function oldMessageNames_(parentName, cutoff) {
  const url = 'https://firestore.googleapis.com/v1/' + parentName + ':runQuery';
  const rows = firestore_('post', url, {
    structuredQuery: {
      from: [{ collectionId: 'messages' }],
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'LESS_THAN', value: { timestampValue: cutoff } } },
      select: { fields: [{ fieldPath: '__name__' }] },
      limit: BATCH_SIZE
    }
  });
  return rows.filter(r => r.document).map(r => r.document.name);
}

/** Écrit un lot de suppressions. tolerant : une discussion modifiée entre-temps est simplement gardée. */
function commit_(writes, tolerant) {
  try {
    firestore_('post', FIRESTORE_DOCS + ':commit', { writes: writes });
  } catch (err) {
    if (!tolerant) throw err;
    Logger.log('Discussion gardée (modifiée pendant le nettoyage) : ' + err.message);
  }
}

function firestore_(method, url, payload) {
  const options = {
    method: method,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Goog-User-Project': FIREBASE_PROJECT_ID // quotas comptés sur le projet Firebase
    },
    muteHttpExceptions: true
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) {
    throw new Error('Firestore ' + res.getResponseCode() + ' : ' + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText() || '{}');
}
