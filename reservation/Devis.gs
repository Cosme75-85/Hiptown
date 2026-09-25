/**
 * DEVIS — PDF joint à l'email de confirmation quand une réservation est approuvée.
 * Mise en page reprise du modèle Excel Hiptown (onglet « Template »).
 * Les textes (mentions, contact, conditions) se règlent dans DEVIS (Config.gs).
 */

// Logo Hiptown (jaune) du modèle, intégré au PDF sous forme d'image encodée
const DEVIS_LOGO_PNG_BASE64 = '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';

/**
 * Numéro du devis : préfixe + date du jour (JJMMAAAA), puis 1, 2, 3...
 * pour les devis suivants du même jour. Ex : NABO0625092026, NABO06250920261...
 * Le compteur est stocké dans les propriétés du script ; le verrou évite
 * que deux approbations simultanées reçoivent le même numéro.
 */
function nextQuoteNumber() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'ddMMyyyy');
    const last = JSON.parse(props.getProperty('QUOTE_COUNTER') || '{}');
    const index = last.date === today ? last.index + 1 : 0;
    props.setProperty('QUOTE_COUNTER', JSON.stringify({ date: today, index: index }));
    return DEVIS.numberPrefix + today + (index > 0 ? index : '');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Crée le devis d'une demande approuvée : PDF + copie dans le dossier Drive.
 * Renvoie null pour une demande créée avant l'ajout des devis (détail non enregistré).
 */
function createQuoteForEvent(event) {
  const saved = event.getTag(TAG_BOOKING);
  if (!saved) return null;
  const booking = JSON.parse(saved);
  const space = findSpace(booking.spaceId);
  if (!space) return null;

  const number = nextQuoteNumber();
  const pdf = buildQuotePdf(space, booking, number);
  const file = getQuoteFolder().createFile(pdf);
  return { number: number, pdf: pdf, url: file.getUrl() };
}

/** Dossier Drive des devis, créé automatiquement au premier devis. */
function getQuoteFolder() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('QUOTE_FOLDER_ID');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (err) {
      // dossier supprimé : on en recrée un ci-dessous
    }
  }
  const folder = DriveApp.createFolder(DEVIS.driveFolderName);
  props.setProperty('QUOTE_FOLDER_ID', folder.getId());
  return folder;
}

/** Transforme le devis HTML en PDF (conversion intégrée à Google, gratuite). */
function buildQuotePdf(space, booking, number) {
  const html = buildQuoteHtml(space, booking, number);
  return Utilities.newBlob(html, MimeType.HTML, 'devis.html')
    .getAs(MimeType.PDF)
    .setName('Devis ' + number + ' - ' + booking.company + '.pdf');
}

function buildQuoteHtml(space, booking, number) {
  const e = escapeHtml;
  const tz = Session.getScriptTimeZone();
  const frDate = date => Utilities.formatDate(date, tz, 'dd/MM/yyyy');
  const euros = n => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
  const vatRate = PRICES.vatRate;
  const quote = computeQuote(space, booking);

  const today = new Date();
  const dueDate = new Date(today.getTime() + DEVIS.validityDays * DAY_MS);
  const period = booking.endDateString
    ? 'du ' + frDate(parseDate(booking.dateString)) + ' au ' + frDate(parseDate(booking.endDateString))
    : 'le ' + frDate(parseDate(booking.dateString)) + ' de ' + booking.startHour + 'h à ' + booking.endHour + 'h';

  const rows = quote.lines.map(l =>
    '<tr>' +
    '<td>' + e(l.label) + '</td>' +
    '<td class="num">' + l.qty + '</td>' +
    '<td class="num">' + euros(l.unitPrice) + '</td>' +
    '<td class="num">' + Math.round(vatRate * 100) + ' %</td>' +
    '<td class="num">' + euros(l.unitPrice * (1 + vatRate)) + '</td>' +
    '<td class="num">' + euros(l.total) + '</td>' +
    '<td class="num">' + euros(l.total * vatRate) + '</td>' +
    '<td class="num">' + euros(l.total * (1 + vatRate)) + '</td>' +
    '</tr>').join('');

  const remarks = DEVIS.remarksByCategory[space.category];

  return '<html><head><meta charset="utf-8"><style>' +
    'body { font-family: Montserrat, Arial, sans-serif; color: #1C1748; font-size: 10pt; margin: 0; }' +
    'table { border-collapse: collapse; width: 100%; }' +
    'td, th { vertical-align: top; }' +
    '.issuer td { font-size: 9pt; line-height: 1.5; }' +
    'h1 { font-size: 26pt; margin: 18px 0 6px; }' +
    '.label { font-weight: bold; }' +
    '.lines th { background: #1C1748; color: #FFFFFF; font-size: 8pt; padding: 6px 4px; text-align: right; }' +
    '.lines th:first-child { text-align: left; }' +
    '.lines td { border-bottom: 1px solid #D9D4CD; padding: 7px 4px; font-size: 9pt; }' +
    '.num { text-align: right; white-space: nowrap; }' +
    '.totals td { padding: 4px; font-size: 10pt; }' +
    '.ttc td { font-size: 16pt; font-weight: bold; color: #6D64E8; padding-top: 8px; }' +
    '.small { font-size: 8pt; line-height: 1.4; }' +
    '.footer { background: #F2F2F2; color: #595959; font-size: 8pt; line-height: 1.6; }' +
    '.footer td { padding: 10px; }' +
    '</style></head><body>' +

    // En-tête : émetteur à gauche, logo à droite
    '<table class="issuer"><tr>' +
    '<td>' + DEVIS.issuerLines.map((line, i) => i === 0 ? '<b>' + e(line) + '</b>' : e(line)).join('<br>') + '</td>' +
    '<td style="text-align:right"><img src="data:image/png;base64,' + DEVIS_LOGO_PNG_BASE64 + '" width="220"></td>' +
    '</tr></table>' +

    '<h1>DEVIS n°' + e(number) + '</h1>' +

    // Dates et destinataire
    '<table><tr>' +
    '<td><span class="label">Date :</span> ' + frDate(today) + '<br><br>' +
    '<span class="label">Devis adressé à</span><br>' +
    e(booking.firstName + ' ' + booking.lastName) + '<br>' + e(booking.company) + '</td>' +
    '<td style="text-align:right"><span class="label">Date d\'échéance</span><br>' + frDate(dueDate) + '</td>' +
    '</tr></table>' +

    '<p><span class="label">Objet :</span> Réservation ' + e(space.name) + ' ' + period + '</p>' +

    // Lignes du devis
    '<table class="lines"><tr>' +
    '<th>Description</th><th>Qté</th><th>Prix /u HT</th><th>TVA</th><th>Prix /u TTC</th>' +
    '<th>Total HT</th><th>Total TVA</th><th>Prix total</th>' +
    '</tr>' + rows + '</table>' +

    // Remarques à gauche, totaux à droite
    '<table style="margin-top:14px"><tr>' +
    '<td style="width:55%" class="small">' + (remarks ? '<span class="label">Remarques :</span><br>' + e(remarks) : '') + '</td>' +
    '<td><table class="totals">' +
    '<tr><td>TOTAL HT</td><td class="num">' + euros(quote.totalHT) + '</td></tr>' +
    '<tr><td>TOTAL TVA</td><td class="num">' + euros(quote.totalVAT) + '</td></tr>' +
    '<tr class="ttc"><td>TOTAL TTC</td><td class="num">' + euros(quote.totalTTC) + '</td></tr>' +
    '</table></td>' +
    '</tr></table>' +

    '<p><span class="label">Détails de règlement :</span><br>' + e(DEVIS.paymentMethod) + '</p>' +
    '<p class="small">' + e(DEVIS.paymentTerms) + '</p>' +

    // Pied de page gris : société, contact, banque
    '<table class="footer" style="margin-top:18px"><tr>' +
    '<td>' + DEVIS.footerCompany.map(e).join('<br>') + '</td>' +
    '<td><b>Contact</b><br>' + e(DEVIS.contact.name) + '<br>Téléphone : ' + e(DEVIS.contact.phone) + '<br>Email : ' + e(DEVIS.contact.email) + '</td>' +
    '<td><b>Références bancaires</b><br>' + e(DEVIS.bankDetails) + '</td>' +
    '</tr></table>' +

    '</body></html>';
}
