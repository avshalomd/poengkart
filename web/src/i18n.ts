import { S } from './state';
/* ================= i18n ================= */
// Udir's fifteen utdanningsprogram, keyed by the register's own two-letter
// codes, plus påbygging — which is not an utdanningsprogram but is a thing a
// pupil picks. Names and English titles are Udir's; see tools/taxonomy.py and
// docs/programme-categories.md for where each one comes from.
export const CATS = {
  ST: { no: 'Studiespesialisering',        en: 'General studies' },
  ID: { no: 'Idrettsfag',                  en: 'Sports' },
  MD: { no: 'Musikk, dans og drama',       en: 'Music, dance & drama' },
  KD: { no: 'Kunst, design og arkitektur', en: 'Art, design & architecture' },
  MK: { no: 'Medier og kommunikasjon',     en: 'Media & communication' },
  IM: { no: 'Informasjonsteknologi og medieproduksjon', en: 'IT & media production' },
  EL: { no: 'Elektro og datateknologi',    en: 'Electrical & computer tech' },
  HS: { no: 'Helse- og oppvekstfag',       en: 'Healthcare & childhood' },
  BA: { no: 'Bygg- og anleggsteknikk',     en: 'Building & construction' },
  TP: { no: 'Teknologi- og industrifag',   en: 'Technology & industry' },
  RM: { no: 'Restaurant- og matfag',       en: 'Restaurant & food' },
  SR: { no: 'Salg, service og reiseliv',   en: 'Sales, service & tourism' },
  NA: { no: 'Naturbruk',                   en: 'Agriculture & nature' },
  FD: { no: 'Frisør, blomster, interiør og eksponeringsdesign', en: 'Hairdressing, floristry, interior & display design' },
  DT: { no: 'Håndverk, design og produktutvikling', en: 'Crafts, design & product development' },
  PB: { no: 'Påbygg',                      en: 'Supplementary year' },
};
export const ordEn = r => `${r}${r === '1' ? 'st' : r === '2' ? 'nd' : r === '3' ? 'rd' : 'th'}`;
export const T = {
  // the header keeps the scope alone; the definition and the gesture live in
  // the (?) sheet, which every first visit opens anyway
  tagline: {
    no: (n, f, y0, y1) => `${n} skoler · ${f} fylker · ${y0}–${y1}`,
    en: (n, f, y0, y1) => `${n} schools · ${f} counties · ${y0}–${y1}`,
  },
  introScope: {
    no: (n, f, y0, y1) => `Dekker ${n} skoler i ${f} fylker, ${y0}–${y1}.`,
    en: (n, f, y0, y1) => `Covers ${n} schools across ${f} counties, ${y0}–${y1}.`,
  },
  introTitle: { no: 'Slik leser du kartet', en: 'How to read this map' },
  introLede: {
    no: 'Hver prikk er en videregående skole. Fargen viser hvor mange poeng du i snitt måtte ha for å komme inn ved siste inntak – jo mørkere, desto høyere.',
    en: 'Every dot is an upper secondary school. The colour shows the score you needed on average to get a place last time – the darker, the higher.',
  },
  introSteps: {
    no: [
      ['Poengsummen din',
       'Poengsum = karaktersnittet ditt × 10. Poenggrensen er poengsummen til den siste søkeren som fikk plass – lå du over den, ville du kommet inn.'],
      ['Farger og størrelser',
       'Farge = snittet av poenggrensene det siste året skolen har tall for. Størrelse = hvor stor andel av programområdene som ble fylt opp – er den liten, tok de fleste inn alle søkere.'],
      ['Finn skolene som er aktuelle',
       'Velg fylke og utdanningsprogram øverst. Trykk på en prikk for å se utviklingen år for år og tallene for hvert programområde.'],
      ['Sjansen din',
       'Skriv inn poengene dine, så farges kartet etter sjansen for plass: grønt = sannsynlig, gult = mulig, rødt = lite sannsynlig. Trykk + på et programområde for å samle ønskene dine og se om lista holder. Regnet ut fra historikken.'],
    ],
    en: [
      ['Your points',
       'Points = your grade average × 10. The threshold is the score of the last applicant who got a place – if you were above it, you would have got in.'],
      ['Colours and sizes',
       'Colour = the average of the thresholds in the newest year that school has figures for. Size = what share of its programme areas filled up – a small dot means most admitted everyone who applied.'],
      ['Find the schools that matter to you',
       'Pick a county and an education programme at the top. Open a dot for the year-by-year trend and the figures per programme area.'],
      ['Your chance',
       'Enter your points and the map recolours by your chance of a place: green = likely, amber = possible, red = unlikely. Press + on a programme area to collect your wishes and see whether the list holds up. Worked out from the history.'],
    ],
  },
  introCalc: { no: ['4,2 i snitt', '42 poeng'], en: ['4.2 average', '42 points'] },
  introKeys: {
    no: ['lav grense', 'høy grense', 'ingen venteliste', 'ingen data'],
    en: ['low threshold', 'high threshold', 'no waiting list', 'no data'],
  },
  introCaveat: {
    no: 'Tallene er historiske og endrer seg hvert år – de er en pekepinn, ikke et løfte. Fylkene publiserer tall fra ulike inntak, så to fylker kan ikke alltid sammenlignes direkte. Uoffisiell tjeneste: sjekk alltid vilbli.no og fylket ditt før du søker.',
    en: 'These are historical figures and they move every year – a guide, not a promise. Counties publish different intakes, so two counties are not always directly comparable. Unofficial: always check vilbli.no and your own county before applying.',
  },
  introCta: { no: 'Vis kartet', en: 'Show the map' },
  helpLabel: { no: 'Slik leser du kartet', en: 'How to read this map' },
  searchLabel: { no: 'Finn skole', en: 'Find a school' },
  searchPh:    { no: 'Skolenavn…', en: 'School name…' },
  settingsLabel: { no: 'Innstillinger', en: 'Settings' },
  bugLabel: { no: 'Meld feil', en: 'Report a bug' },
  bugSchoolLabel: { no: 'Meld feil på denne skolen', en: 'Report a bug on this school' },
  setTheme:      { no: 'Fargetema', en: 'Theme' },
  setThemeAuto:  { no: 'Automatisk', en: 'Auto' },
  setThemeLight: { no: 'Lyst', en: 'Light' },
  setThemeDark:  { no: 'Mørkt', en: 'Dark' },
  setFont:  { no: 'Tekststørrelse', en: 'Text size' },
  setFontN: { no: 'Normal', en: 'Normal' },
  setFontL: { no: 'Stor', en: 'Large' },
  setFontX: { no: 'Ekstra stor', en: 'Extra large' },
  setColors:    { no: 'Farger', en: 'Colours' },
  setColorsStd: { no: 'Standard', en: 'Standard' },
  setColorsCvd: { no: 'Fargeblindvennlig', en: 'Colour-blind friendly' },
  // the level scope (levelScope) as a remembered choice; the school sheet's
  // own line is the other way in
  setLevelsHint: { no: 'Vg1 er året du søker på når du går på 10. trinn. Vg2 og Vg3 finnes bare der fylket publiserer dem.',
                   en: 'Vg1 is the year you apply for from lower secondary school. Vg2 and Vg3 exist only where the county publishes them.' },
  setNote: { no: 'Valgene lagres bare i denne nettleseren.',
             en: 'Choices are saved only in this browser.' },
  locBtn:    { no: 'Vis posisjonen min', en: 'Show my position' },
  zoomIn:    { no: 'Zoom inn', en: 'Zoom in' },
  zoomOut:   { no: 'Zoom ut', en: 'Zoom out' },
  viewMap:  { no: 'Kart', en: 'Map' },
  viewList: { no: 'Liste', en: 'List' },
  noMapWebGL: { no: 'Kartet trenger WebGL, som denne nettleseren ikke har. Skolene vises som liste.',
                en: 'The map needs WebGL, which this browser does not have. Schools are shown as a list.' },
  listCount: { no: n => `${n} ${n === 1 ? 'skole' : 'skoler'} · siste publiserte år per skole`,
               en: n => `${n} ${n === 1 ? 'school' : 'schools'} · each school's latest published year` },
  listColSchool: { no: 'Skole', en: 'School' },
  listColFylke:  { no: 'Fylke', en: 'County' },
  listColVal:    { no: 'Snitt', en: 'Avg.' },
  listColValTip: { no: 'Snittgrense, siste publiserte år',
                   en: 'Average threshold, latest published year' },
  listColDelta:  { no: 'Endring', en: 'Change' },
  listColDeltaTip: { no: 'Endring fra året før', en: 'Change from the prior year' },
  listColChance: { no: 'Sjanse', en: 'Chance' },
  // ys: the intake years the rows forecast, «2026 eller 2027» over the whole country
  listColChanceTip: { no: (x, ys) => `Sjanse for plass med ${x} poeng ved inntaket ${ys}`,
                      en: (x, ys) => `Chance of a place with ${x} points at the ${ys} intake` },
  listOpen:   { no: 'Ingen venteliste', en: 'No waiting list' },
  listNoData: { no: 'Ingen data', en: 'No data' },
  listChanceCell: { no: (l, n) => `${l} av ${n} sannsynlig`, en: (l, n) => `${l} of ${n} likely` },
  listRowAria: { no: s => `Åpne ${s}`, en: s => `Open ${s}` },
  listEmpty: { no: 'Ingen treff med disse filtrene.', en: 'No matches with these filters.' },
  viewLabel: { no: 'Visning', en: 'View' },
  listRounds: { no: 'Fylkene publiserer tall fra ulike inntak, så tallene kan ikke sammenlignes direkte.',
                en: 'Counties publish different intakes – figures are not directly comparable across counties.' },
  calcOpen:  { no: 'Regn ut fra karakterene dine', en: 'Work them out from your grades' },
  calcTitle: { no: 'Fra karakterer til poeng', en: 'From grades to points' },
  calcLede:  { no: 'Karakterpoengene er gjennomsnittet av alle tallkarakterene på vitnemålet ganget med 10. Standpunkt og eksamen teller likt; fag uten karakter regnes ikke med. Trykk på karakterene dine:',
               en: 'Your points are the average of every numeric grade on your vitnemål (leaving certificate), times ten. The subjects below are named as they are printed on it. Standpunkt (teacher-assessed) and eksamen (exam) grades count equally; subjects without a grade are left out. Tap your grades:' },
  calcSnitt: { no: 'snitt', en: 'average' },
  calcPoeng: { no: 'poeng', en: 'points' },
  calcEmpty: { no: '–', en: '–' },
  calcUse:   { no: 'Bruk poengene på kartet', en: 'Use the points on the map' },
  calcReset: { no: 'Tøm', en: 'Clear' },
  calcNote:  { no: 'Karakterene lagres bare i denne nettleseren. Eksamenskarakterene kommer i tillegg til standpunkt i samme fag – begge teller.',
               en: 'Grades are saved only in this browser. Eksamen grades count in addition to the standpunkt grade in the same subject – both are included.' },
  calcClearAria: { no: (f) => `Fjern karakteren i ${f}`, en: (f) => `Clear the grade in ${f}` },
  calcGradeAria: { no: (g, f) => `${g} i ${f}`, en: (g, f) => `${g} in ${f}` },
  locDenied: { no: 'Nettleseren har ikke tilgang til posisjonen din.',
               en: 'Location access is blocked in your browser.' },
  // follows locDenied; the kind and the app name come from locHelpKind()
  locHow: {
    no: (k, app) => ({
      iosApp: `Gå til Innstillinger > Apper > ${app} > Posisjon og gi tilgang, og last siden inn på nytt.`,
      iosSafari: 'Gå til Innstillinger > Apper > Safari > Posisjon og velg Spør eller Tillat, og last siden inn på nytt. Stedstjenester må også være på.',
      android: 'Trykk på ikonet til venstre for nettadressen, slå på Posisjon og last siden inn på nytt.',
      chromium: 'Klikk på ikonet til venstre for nettadressen, tillat Posisjon og last siden inn på nytt.',
      firefox: 'Klikk på posisjonsikonet i adressefeltet, fjern blokkeringen og last siden inn på nytt.',
      safariMac: 'Velg Safari > Innstillinger > Nettsteder > Posisjon, og tillat dette nettstedet.',
    })[k] || 'Tillat posisjon for dette nettstedet i innstillingene til nettleseren, og last siden inn på nytt.',
    en: (k, app) => ({
      iosApp: `Go to Settings > Apps > ${app} > Location and allow access, then reload this page.`,
      iosSafari: 'Go to Settings > Apps > Safari > Location and choose Ask or Allow, then reload this page. Location Services must also be on.',
      android: 'Tap the icon to the left of the web address, turn on Location, then reload this page.',
      chromium: 'Click the icon to the left of the web address, allow Location, then reload this page.',
      firefox: 'Click the location icon in the address bar, remove the block, then reload this page.',
      safariMac: 'Choose Safari > Settings > Websites > Location and allow this website.',
    })[k] || "Allow location for this website in your browser's settings, then reload this page.",
  },
  locFail:   { no: 'Fant ikke posisjonen din.', en: 'Could not find your location.' },
  close:     { no: 'Lukk', en: 'Close' },
  levels: {
    no: {
      Vg1: ['Vg1 – første året', 'Det første av tre år på videregående. Dette er året du søker på når du går på 10. trinn.'],
      Vg2: ['Vg2 – andre året', 'Andre året. Du søker deg hit fra Vg1, som regel på samme skole eller til et yrkesfag som bygger videre.'],
      Vg3: ['Vg3 – tredje året', 'Tredje og siste året på skolen. På yrkesfag går mange ut i lære i stedet.'],
    },
    en: {
      Vg1: ['Vg1 – first year', 'The first of three years of upper secondary. This is the year you apply for from lower secondary school.'],
      Vg2: ['Vg2 – second year', 'The second year. You move up from Vg1, usually at the same school, or to a vocational programme that builds on it.'],
      Vg3: ['Vg3 – third year', 'The third and final year at school. On vocational tracks many take an apprenticeship instead.'],
    },
  },
  contactTitle: { no: 'Send tilbakemelding', en: 'Send feedback' },
  contactLede: {
    no: 'Har du funnet en feil, eller savner du noe? Si fra – det er sånn kartet blir bedre.',
    en: 'Found a mistake, or missing something? Say so – that is how the map gets better.',
  },
  contactKind: { no: 'Hva gjelder det?', en: 'What is it about?' },
  contactKinds: {
    no: { tall: 'Et tall ser feil ut', bilde: 'Feil eller manglende bilde',
          skole: 'En skole mangler eller ligger på feil sted',
          feil: 'Noe i appen virker ikke',
          funksjon: 'Forslag til noe nytt', annet: 'Noe annet' },
    en: { tall: 'A figure looks wrong', bilde: 'Wrong or missing photo',
          skole: 'A school is missing or in the wrong place',
          feil: 'Something in the app does not work',
          funksjon: 'Suggestion for something new', annet: 'Something else' },
  },
  contactSchool:  { no: 'Hvilken skole? *', en: 'Which school? *' },
  contactProgram: { no: 'Programområde', en: 'Programme area' },
  contactYear:    { no: 'År', en: 'Year' },
  contactPhoto:   { no: 'Lenke til et bedre bilde', en: 'Link to a better photo' },
  contactFylke:   { no: 'Fylke', en: 'County' },
  contactMsg:     { no: 'Melding *', en: 'Message *' },
  contactRequired:{ no: '* må fylles ut', en: '* must be filled in' },
  contactPlaceholder: { no: 'Skriv her…', en: 'Write here…' },
  contactEmail:   { no: 'E-postadresse (valgfritt)', en: 'E-mail address (optional)' },
  contactHints: {
    no: {
      tall: 'Skriv gjerne hvilket tall du så og hva du mener det skulle vært.',
      bilde: 'Er bildet av en annen skole, eller mangler det helt?',
      skole: 'Hva heter skolen, og hvor ligger den?',
      feil: 'Hva gjorde du, hva skjedde, og hva ventet du?',
      funksjon: 'Hva skulle du ønske kartet kunne?',
      annet: '',
    },
    en: {
      tall: 'Say which figure you saw and what you think it should be.',
      bilde: 'Is the photo of a different school, or missing entirely?',
      skole: 'What is the school called, and where is it?',
      feil: 'What did you do, what happened, and what did you expect?',
      funksjon: 'What do you wish the map could do?',
      annet: '',
    },
  },
  contactPrivacy: {
    no: 'Meldingen sendes som e-post til den som lager kartet. Ingenting lagres i nettleseren din, og e-postadressen er valgfri – uten den kan du ikke få svar.',
    en: 'Your message is e-mailed to the person who maintains the map. Nothing is stored in your browser, and your e-mail address is optional – without it you cannot get a reply.',
  },
  contactSend:    { no: 'Send', en: 'Send' },
  // the bug report's disclosure: what travels with it, listed in the open
  contactCtx:     { no: 'Dette sendes med', en: 'Sent with the report' },
  contactCtxHint: { no: 'Visningen og valgene dine akkurat nå, så feilen kan gjenskapes. Ikke noe bilde.',
                    en: 'Your view and choices right now, so the fault can be reproduced. No picture.' },
  contactSending: { no: 'Sender…', en: 'Sending…' },
  contactSent:    { no: 'Takk! Meldingen er sendt.', en: 'Thank you! Your message is on its way.' },
  contactSentSub: { no: 'Du kan lukke dette vinduet.', en: 'You can close this window.' },
  contactFail: {
    no: 'Kunne ikke sende nå. Teksten din er tatt vare på – prøv igjen om litt.',
    en: 'Could not send just now. Your text is still here – try again in a moment.',
  },
  contactNeedMsg: { no: 'Skriv en melding først.', en: 'Write a message first.' },
  contactNeedSchool: { no: 'Skriv hvilken skole det gjelder.', en: 'Say which school this is about.' },
  contactBadMail: { no: 'E-postadressen ser ikke riktig ut. Rett den, eller la feltet stå tomt.',
                    en: 'That e-mail address does not look right. Fix it, or leave the field empty.' },
  contactLabel:   { no: 'Send tilbakemelding', en: 'Send feedback' },
  fylkeLabel: { no: 'Fylke', en: 'County' },
  allFylker:  { no: 'Hele landet', en: 'All of Norway' },
  roundChip:  { no: r => `${r}. inntak`, en: r => `${ordEn(r)} intake` },
  roundTitle: { no: 'Poenggrensen er poengsummen til den siste søkeren som fikk plass i dette inntaket. Grensen faller mellom inntakene, fordi plasser blir ledige. Tall fra ulike inntak kan ikke sammenlignes direkte.',
                en: 'The threshold is the score of the last applicant admitted in this intake. Thresholds fall between intakes as places free up, so numbers from different intakes are not directly comparable.' },
  mixedRounds:{ no: 'Kartet viser fylker med ulike inntak – tallene kan ikke sammenlignes direkte.',
                en: 'The map mixes counties with different intakes – those numbers are not directly comparable.' },
  catLabel:   { no: 'Utdanningsprogram', en: 'Education programme' },
  allCats:    { no: 'Alle utdanningsprogram', en: 'All education programmes' },
  catNote:    { no: n => `${n} ${n === 1 ? 'skole' : 'skoler'} tilbyr dette`, en: n => `${n} ${n === 1 ? 'school offers' : 'schools offer'} this` },
  legendAll:  { no: 'Snittgrense (siste år)', en: 'Average threshold (latest year)' },
  legendSize: { no: 'Størrelsen viser hvor stor andel av programområdene som ble fylt opp',
                en: 'Marker size shows what share of the programme areas filled up' },
  tipMedian:  { no: (v, n, tot) => `Snitt <b>${v}</b> poeng · ${n} av ${tot} programområde${tot === 1 ? '' : 'r'} ble fylt opp`,
                en: (v, n, tot) => `Average <b>${v}</b> points · ${n} of ${tot} programme area${tot === 1 ? '' : 's'} filled up` },
  // the same line where the county does not say which programmes filled (HELD_OUT)
  tipMeanOnly: { no: (v, tot) => `Snitt <b>${v}</b> poeng · ${tot} programområde${tot === 1 ? '' : 'r'}`,
                 en: (v, tot) => `Average <b>${v}</b> points · ${tot} programme area${tot === 1 ? '' : 's'}` },
  tipMostlyOpen: { no: 'Men de fleste programområdene hadde ingen venteliste',
                   en: 'But most programme areas had no waiting list' },
  mostlyOpenShort: { no: 'de fleste hadde ingen venteliste', en: 'most had no waiting list' },
  tipTop:     { no: 'Høyest:', en: 'Highest:' },
  scopeAll:   { no: 'Vis alle utdanningsprogram', en: 'Show all education programmes' },
  heroTypical:{ no: 'Snitt', en: 'Average' },
  heroTypicalAll: { no: 'alle programområder', en: 'all programme areas' },
  legendCat:  { no: c => `${CATS[c].no} · siste år`, en: c => `${CATS[c].en} · latest year` },
  legendOpen: { no: 'Ingen venteliste – alle kvalifiserte søkere fikk plass', en: 'No waiting list – all qualified applicants got a place' },
  legendNone: { no: 'Ingen data', en: 'No data' },
  fortrinnTitle: {
    no: 'Fortrinnsrett: søkere med lovfestet rett (bl.a. behov for spesialundervisning) tas inn utenom poengkonkurransen. Derfor finnes det ingen poenggrense.',
    en: 'Priority right (fortrinnsrett): applicants with a statutory right (e.g. special educational needs) are admitted outside the points competition, so no threshold exists.',
  },
  pts:        { no: 'poeng', en: 'points' },
  allIn:      { no: 'Ingen venteliste', en: 'No waiting list' },
  // A 0,0 is not a threshold anyone could miss and not "everyone got in"
  // either: the counties print it as its own state. Innlandet's legend —
  // "der det er merket med «0» er det ikke ledige plasser, men siste inntatte
  // har ingen poeng" — is the wording this follows.
  noPoints:   { no: 'Fullt – siste inntatte uten poeng', en: 'Filled – last admitted had no points' },
  // the 68px value column and the list chip: the full phrase rides in the title
  noPointsShort: { no: 'Fullt', en: 'Filled' },
  // the no-break space keeps the separator on the first half: at 375px the
  // headline wrapped to a line that began "· 2 ingen venteliste"
  zeroMix:    { no: (z, o) => `${z} fullt uten poeng · ${o} ingen venteliste`,
                en: (z, o) => `${z} filled without points · ${o} no waiting list` },
  noHist:     { no: 'Ingen historikk', en: 'No history' },
  noHistTitle:{ no: 'Programområdet har aldri hatt en publisert poenggrense her, så det finnes ingen prognose å bygge på.',
                en: 'This programme area has never had a published threshold here, so there is nothing to forecast from.' },
  lowHist:    { no: 'lite historikk', en: 'little history' },
  noPointsTitle: {
    no: 'Programområdet ble fylt opp, men den siste som kom inn hadde ingen poeng registrert. Alle søkere med poeng fikk plass.',
    en: 'The programme area filled up, but the last applicant admitted had no registered points. Everyone with points got a place.',
  },
  // the official state is fortrinnsrett; "Fortrinn" alone is not Udir's word and
  // contradicted the badge and the tooltip on the very same row
  priority:   { no: 'Fortrinnsrett', en: 'Priority right' },
  docAdm:     { no: 'Inntak etter dokumentasjon', en: 'By documentation' },
  docAdmShort:{ no: 'Dokumentasjon', en: 'Documentation' },
  docTitle:   { no: 'Inntak på grunnlag av dokumentasjon (f.eks. IB eller toppidrett) – ingen poenggrense.',
                en: 'Admission on documented grounds (e.g. IB or elite sport) – no points threshold.' },
  tipNoData:  { no: y => `Ingen data for ${y}`, en: y => `No data for ${y}` },
  tipStale:   { no: y => `Ingen data etter ${y}`, en: y => `No data after ${y}` },
  staleChip:  { no: y => `Ingen data etter ${y}`, en: y => `No data after ${y}` },
  staleTitle: { no: 'Fylket har ikke publisert tall for denne skolen de siste årene. Historikken under er den siste som finnes.',
                en: 'The county has not published figures for this school in recent years. The history below is the last there is.' },
  introData:  { no: 'Last ned hele datasettet (JSON).', en: 'Download the whole dataset (JSON).' },
  // Anyone checking a figure should be able to get to the sources, the code
  // that reads them and the notes on how they are cleaned up — and to know
  // who stands behind the numbers. The link carries all three.
  introRepo:  { no: a => `Kode, data og dokumentasjon av hvordan tallene hentes inn og behandles ligger åpent på ${a}.`,
                en: a => `The code, the data and the write-up of how the figures are collected and processed are open on ${a}.` },
  // The technical report is the formal account — data semantics, model,
  // validation — for anyone who wants more than the tooltips give.
  introReport:{ no: a => `Metoden, modellen og valideringen er beskrevet i ${a}.`,
                en: a => `The method, the model and the validation are written up in ${a}.` },
  introReportLink: { no: 'den tekniske rapporten (på engelsk)', en: 'the technical report' },
  introCredit:{ no: 'Uoffisiell tjeneste laget av Abshalom Dayan · kode MIT, data NLOD 2.0',
                en: 'Unofficial service by Abshalom Dayan · code MIT, data NLOD 2.0' },
  introPrivacy: { no: 'Personvern: poengene dine lagres bare i nettleseren din. Posisjonen brukes én gang og sendes ikke videre. Besøk telles uten informasjonskapsler (Vercel Web Analytics).',
                  en: 'Privacy: your points are stored only in your browser. Your position is used once and never sent. Visits are counted without cookies (Vercel Web Analytics).' },
  fylkeNoData: { no: '(ingen data)', en: '(no data)' },
  listAnd:    { no: ' og ', en: ' and ' },
  mergedNote: { no: (from, y, n) => n === 1 ? `${from} gikk inn i denne skolen i ${y}. Tall før ${y} er fra den skolen.` : `${from} ble slått sammen til denne skolen i ${y}. Tall før ${y} er fra disse skolene.`,
                en: (from, y, n) => n === 1 ? `${from} became part of this school in ${y}. Figures before ${y} come from that school.` : `${from} were merged into this school in ${y}. Figures before ${y} come from those schools.` },
  uncertainNote: { no: y => `Tallene for ${y} er usikre: to publikasjoner fra fylket oppgir ulike verdier.`,
                   en: y => `The figures for ${y} are uncertain: two county publications give different values.` },
  roundYearNote: { no: (y, r) => `${y}-tallene er fra ${r}. inntak, ikke samme inntak som de andre årene – flere kom inn, så grensene ligger lavere.`,
                   en: (y, r) => `The ${y} figures are from the ${ordEn(r)} intake, not the same intake as the other years – more applicants were admitted, so the thresholds sit lower.` },
  closeAria:  { no: 'Lukk skoledetaljer', en: 'Close school details' },
  // x: the cluster's mix when points are entered, so the label says what the ring shows
  clusterAria: { no: (n, x) => `${n} skoler i dette området.` + (x ? ` Best sjanse: ${x.likely} sannsynlig · ${x.possible} mulig · ${x.unlikely} lite sannsynlig${x.none ? ` · ${x.none} uten prognose` : ''}.` : '') + ' Trykk for å zoome inn.',
                 en: (n, x) => `${n} schools in this area.` + (x ? ` Best chance: ${x.likely} likely · ${x.possible} possible · ${x.unlikely} unlikely${x.none ? ` · ${x.none} without a forecast` : ''}.` : '') + ' Press to zoom in.' },
  markerAria: { no: (n, v) => `${n}. ${v}. Trykk for å se detaljer.`, en: (n, v) => `${n}. ${v}. Press to open details.` },
  gone:       { no: 'Utgått', en: 'Discontinued' },
  tipPrograms:{ no: (n, span) => `${n} programområde${n === 1 ? '' : 'r'} · ${span}`, en: (n, span) => `${n} programme area${n === 1 ? '' : 's'} · ${span}` },
  roundUnknown: { no: 'inntak ikke oppgitt', en: 'intake not stated' },
  roundUnknownTitle: { no: 'Fylket oppgir ikke hvilket inntak tallene er fra. Grensen faller mellom inntakene, så tallene kan ikke sammenlignes direkte med fylker som oppgir inntaket.',
                       en: 'This county does not state which intake the figures are from. Thresholds fall between intakes, so they cannot be compared directly with counties that do state it.' },
  oneYearOnly: { no: y => `Fylket publiserer bare ${y} – ingen trend ennå`, en: y => `This county publishes ${y} only – no trend yet` },
  bootFail:   { no: 'Kartet kunne ikke lastes', en: 'The map could not be loaded' },
  bootFailSub:{ no: 'Fikk ikke lastet datasettet. Sjekk nettforbindelsen og prøv igjen.',
                en: 'The dataset could not be loaded. Check your connection and try again.' },
  bootRetry:  { no: 'Prøv igjen', en: 'Try again' },
  bootLoading:{ no: 'Laster kartet …', en: 'Loading the map …' },
  bootFailApp:{ no: 'Noe gikk galt da kartet skulle bygges. Prøv å laste siden på nytt.',
                en: 'Something went wrong while building the map. Try reloading the page.' },
  sideLabel:  { no: 'Skoledetaljer', en: 'School details' },
  langLabel:  { no: 'Språk', en: 'Language' },
  pageTitle:  { no: 'Poengkart – poenggrenser for videregående skole',
                en: 'Poengkart – admission thresholds for Norwegian upper secondary schools' },
  tipHint:    { no: 'Trykk for å se trender og detaljer', en: 'Open for trends and details' },
  tipAllOpen: { no: y => `Alle programområder: ingen venteliste i ${y}`, en: y => `All programme areas: no waiting list in ${y}` },
  heroDelta:  { no: y => `Endring fra ${y}`, en: y => `Change vs ${y}` },
  heroDeltaBasis: {
    no: 'Forskjellen mellom de to siste punktene på snittlinjen i grafen under.',
    en: 'The difference between the last two points on the average line below.',
  },
  // Said wherever a mean is printed, because a mean over the few programmes
  // that filled up says nothing about the many that did not.
  mostlyOpenNote: {
    no: (o, tot, y, n) => `${o} av ${tot} programområder hadde ingen venteliste i ${y}. `
      + `Snittet gjelder bare ${n === 1 ? 'det ene programområdet' : `de ${n}`} som hadde en poenggrense.`,
    en: (o, tot, y, n) => `${o} of ${tot} programme areas had no waiting list in ${y}. `
      + `The average covers only ${n === 1 ? 'the one' : `the ${n}`} that had a threshold.`,
  },
  linkNotFound: { no: n => `Fant ikke «${n}» i kartet.`, en: n => `Could not find “${n}” on the map.` },
  photoCredit: { no: c => `Foto: ${c}`, en: c => `Photo: ${c}` },
  heroProgs:  { no: n => n === 1 ? 'Programområde' : 'Programområder', en: n => n === 1 ? 'Programme area' : 'Programme areas' },
  searchCounty: { no: f => `Vis ${f} på kartet`, en: f => `Show ${f} on the map` },
  tabAll:     { no: 'Alle', en: 'All' },
  tabCat:     { no: 'Utdanningsprogram', en: 'Education programme' },
  tabProg:    { no: 'Programområde', en: 'Programme area' },
  // The chart draws only the programme areas that HAVE a poenggrense, so its
  // count is normally smaller than the hero's row count right above it. Name
  // the denominator instead of printing a bare, contradicting number.
  // "har hatt … i 2020–2026": the count is over the chart's whole window, and
  // the present tense read as this year's count beside the hero's caveat
  chartSubAll:  { no: (n, tot, span) => (n === tot ? `${n} ${n === 1 ? 'programområde' : 'programområder'} har hatt poenggrense i ${span} · snittlinje i blått`
                                                   : `${n} av ${tot} programområder har hatt poenggrense i ${span} · snittlinje i blått`),
                  en: (n, tot, span) => (n === tot ? `${n} programme area${n === 1 ? ' has' : 's have'} had a threshold in ${span} · mean line in blue`
                                                   : `${n} of ${tot} programme areas ${n === 1 ? 'has' : 'have'} had a threshold in ${span} · mean line in blue`) },
  chartSubCat:  { no: (n, tot, span) => (n === tot ? `${n} ${n === 1 ? 'programområde' : 'programområder'} i utdanningsprogrammet har hatt poenggrense i ${span} · snitt i blått`
                                                   : `${n} av ${tot} programområder i utdanningsprogrammet har hatt poenggrense i ${span} · snitt i blått`),
                  en: (n, tot, span) => (n === tot ? `${n} programme area${n === 1 ? ' has' : 's have'} had a threshold in this programme in ${span} · mean line in blue`
                                                   : `${n} of ${tot} programme areas in this programme ${n === 1 ? 'has' : 'have'} had a threshold in ${span} · mean line in blue`) },
  chartSubProg: { no: 'Ett programområde · hule punkter = ingen poenggrense', en: 'One programme area · hollow dots = no threshold' },
  chartNoPoints: { no: 'Ingen poenggrense å tegne for dette utvalget – alle som søkte, fikk plass, eller inntaket gikk på fortrinnsrett eller dokumentasjon.',
                   en: 'No threshold to plot for this selection – everyone who applied got a place, or admission went by priority right or documentation.' },
  officialName: { no: n => `Offisielt navn (Udir): ${n}`, en: n => `Official register name: ${n}` },
  oldHidden: {
    no: n => n === 1 ? '1 programområde uten tall fra de siste to årene er skjult – vis det'
                     : `${n} programområder uten tall fra de siste to årene er skjult – vis dem`,
    en: n => n === 1 ? '1 programme area with no figures from the last two years is hidden – show it'
                     : `${n} programme areas with no figures from the last two years are hidden – show them`,
  },
  oldShown: { no: 'Skjul programområder uten nye tall',
              en: 'Hide programme areas without recent figures' },
  levelsHidden: {
    no: n => n === 1 ? '1 programområde på Vg2 eller Vg3 er skjult – vis det'
                     : `${n} programområder på Vg2 og Vg3 er skjult – vis dem`,
    en: n => n === 1 ? '1 programme area at Vg2 or Vg3 is hidden – show it'
                     : `${n} programme areas at Vg2 and Vg3 are hidden – show them`,
  },
  levelsShown: { no: 'Vis bare Vg1', en: 'Show Vg1 only' },
  levelsSumLabel: { no: 'Trinn', en: 'Levels' },
  levelsChipAll: { no: 'Vg1–Vg3', en: 'Vg1–Vg3' },
  levelsChipTitle: { no: 'Kartet viser bare Vg1 – året du søker på når du går på 10. trinn. Vg2 og Vg3 kan slås på i innstillingene.',
                     en: 'The map shows Vg1 only – the year you apply for from lower secondary school. Vg2 and Vg3 can be switched on in the settings.' },
  levelsChipAllTitle: { no: 'Vg1, Vg2 og Vg3 – og påbygging der fylket publiserer det.',
                        en: 'Vg1, Vg2 and Vg3 – and påbygging where the county publishes it.' },
  notOffered: { no: 'tilbys ikke her', en: 'not offered here' },
  vigoMaxWishes: { no: 'Vigo-søknaden har plass til ti ønsker – lista er full.',
                   en: 'A vigo application has room for ten wishes – your list is full.' },
  vigoMaxProgs: { no: 'Til Vg1 kan du søke på inntil tre ulike utdanningsprogram.',
                  en: 'For Vg1 you can apply to at most three different education programmes.' },
  midLabel:   { no: 'snitt', en: 'avg' },
  series:     { no: n => n === 1 ? 'programområde' : 'programområder', en: n => n === 1 ? 'programme area' : 'programme areas' },
  website:    { no: 'Nettside', en: 'Website' },
  wiki:       { no: 'Wikipedia', en: 'Wikipedia' },
  srcNoteLink: { no: 'Meld fra via tilbakemelding', en: 'Report an error via feedback' },
  srcNote: {
    no: 'Kilder: fylkeskommunene i Akershus, Buskerud, Innlandet, Møre og Romsdal, Rogaland, Telemark, Trøndelag og Vestland, Oslo kommune og vilbli.no (poenggrenser), NSR/Udir (skoler), Kartverket (geokoding), Wikimedia Commons og skolenes egne nettsider (bilder). Inntaket varierer mellom fylkene og er merket på hver skole. Uoffisiell tjeneste, laget av Abshalom Dayan. Tallene er lest maskinelt fra fylkenes publikasjoner og kan inneholde feil.',
    en: 'Sources: the county authorities of Akershus, Buskerud, Innlandet, Møre og Romsdal, Rogaland, Telemark, Trøndelag and Vestland, the City of Oslo and vilbli.no (thresholds), NSR/Udir (schools), Kartverket (geocoding), Wikimedia Commons and school websites (photos). The intake differs by county and is labelled on every school. Unofficial service, built by Abshalom Dayan. The figures are read by machine from the county publications and may contain errors.',
  },
  noMatch:    { no: 'Ingen treff', en: 'No matches' },
  prioBadge:  { no: 'fortrinnsrett', en: 'priority right' },
  // ----- chance of a place: the forecast in data/model.json (tools/model.py) -----
  ptsLabel:   { no: 'Poengene dine (valgfritt)', en: 'Your points (optional)' },
  ptsPh:      { no: 'f.eks. 42,5', en: 'e.g. 42.5' },
  ptsClear:   { no: 'Fjern poengsummen', en: 'Clear your points' },
  ptsBad: {
    no: 'Skriv et tall mellom 0 og 70 – for eksempel 42,5.',
    en: 'Enter a number between 0 and 70 – for example 42.5.',
  },
  bandLabel:  { no: b => ({ likely: '≥ 70 %', possible: '35–70 %', unlikely: '< 35 %' })[b],
                en: b => ({ likely: '≥ 70%', possible: '35–70%', unlikely: '< 35%' })[b] },
  legendZoomHint: { no: 'Zoom inn for å se sjansen per skole.', en: 'Zoom in to see each school’s chance.' },
  legendChance: { no: (x, ys) => `Sjanse for plass med ${x} poeng ved inntaket ${ys} · beste programområde`,
                  en: (x, ys) => `Chance of a place with ${x} points at the ${ys} intake · best programme area` },
  yearsOr: { no: ys => ys.length < 2 ? ys.join('') : `${ys.slice(0, -1).join(', ')} eller ${ys.at(-1)}`,
             en: ys => ys.length < 2 ? ys.join('') : `${ys.slice(0, -1).join(', ')} or ${ys.at(-1)}` },
  legendChanceSize: { no: 'Størrelsen viser hvor stor andel av programområdene som er innen rekkevidde (≥ 35 %)',
                      en: 'Size shows what share of the programme areas are within reach (≥ 35%)' },
  moreLabel: { no: 'Vis mer', en: 'Show more' },
  lessLabel: { no: 'Vis mindre', en: 'Show less' },
  legendNoForecast: { no: 'Ingen prognose', en: 'No forecast' },
  tipChance:  { no: (x, L, R, U, n, y) => `Med ${x} poeng i ${y}: <b>${L}</b> sannsynlig · ${R} mulig · ${U} lite sannsynlig (${n} programområde${n === 1 ? '' : 'r'})`,
                en: (x, L, R, U, n, y) => `With ${x} points in ${y}: <b>${L}</b> likely · ${R} possible · ${U} unlikely (${n} programme area${n === 1 ? '' : 's'})` },
  tipBest:    { no: (p, prog) => `Best sjanse: ${p} % · ${prog}`, en: (p, prog) => `Best chance: ${p}% · ${prog}` },
  tipNoForecast: { no: 'Ingen prognose for denne skolen', en: 'No forecast for this school' },
  // a county outside the model (HELD_OUT): the tooltip and the chance block say why
  heldOutForecast: { no: f => `Ingen prognose: tallene fra ${f} kan ikke sammenlignes med andre fylker`,
                     en: f => `No forecast: the figures from ${f} cannot be compared with other counties` },
  chancePrompt: {
    no: y => `Skriv inn poengene dine i poengfeltet over kartet, så viser lista under sjansen din for plass per programområde ved inntaket ${y}.`,
    en: y => `Enter your points in the points field over the map, and the list below shows your chance of a place per programme area at the ${y} intake.`,
  },
  chanceNoneInScope: { no: 'Ingen prognose for programområdene i dette utvalget.',
                       en: 'No forecast for the programme areas in this selection.' },
  // The head counts over the programme areas that HAVE a forecast (n, which is
  // also the number of chips the list renders below) and then names that scope
  // outright, with the rest of the panel's rows in the parenthetical. Printing
  // n as a bare denominator was the bug: it read as the whole school, and the
  // hero right above it said something larger. The tail is dropped when every
  // programme area in scope has a forecast.
  chanceScope: { no: (m, tot) => (m ? ` · ${m} av ${tot} har ingen prognose` : ''),
                 en: (m, tot) => (m ? ` · ${m} of ${tot} ${m === 1 ? 'has' : 'have'} no forecast` : '') },
  chanceHeadL: { no: (x, L, n, m, tot) => `Med ${x} poeng: sannsynlig plass på ${L} av ${n} programområde${n === 1 ? '' : 'r'}${T.chanceScope.no(m, tot)}`,
                 en: (x, L, n, m, tot) => `With ${x} points: a place is likely at ${L} of ${n} programme area${n === 1 ? '' : 's'}${T.chanceScope.en(m, tot)}` },
  chanceHeadR: { no: (x, R, n, m, tot) => `Med ${x} poeng: mulig plass på ${R} av ${n} programområde${n === 1 ? '' : 'r'}${T.chanceScope.no(m, tot)}`,
                 en: (x, R, n, m, tot) => `With ${x} points: a place is possible at ${R} of ${n} programme area${n === 1 ? '' : 's'}${T.chanceScope.en(m, tot)}` },
  // "alle 1 programområdene" keeps its digit on purpose: figure-invariants I10
  // reads ch.n out of this string, and "det ene programområdet" would leave the
  // count nowhere in the head for it (and for a reader) to check.
  chanceHeadU: { no: (x, n, m, tot) => `Med ${x} poeng: lite sannsynlig plass på alle ${n} programområdene${T.chanceScope.no(m, tot)}`,
                 en: (x, n, m, tot) => `With ${x} points: a place is unlikely at ${n === 1 ? 'the 1 programme area' : `all ${n} programme areas`}${T.chanceScope.en(m, tot)}` },
  chanceCounts: { no: (L, R, U) => `${L} sannsynlig (≥ 70 %) · ${R} mulig (35–70 %) · ${U} lite sannsynlig (< 35 %)`,
                  en: (L, R, U) => `${L} likely (≥ 70%) · ${R} possible (35–70%) · ${U} unlikely (< 35%)` },
  chanceSub: {
    no: (y, r, lo, hi) => `Prognose for inntaket ${y}${r ? ` (${r}. inntak)` : ''}, regnet ut fra skolens og programområdets historikk. En pekepinn, ikke et løfte: prognosen bommer typisk med ±${lo} til ±${hi} poeng, mest der historikken er kort.`,
    en: (y, r, lo, hi) => `Forecast for the ${y} intake${r ? ` (${ordEn(r)} intake)` : ''}, from the history of this school and programme. A pointer, not a promise: the forecast is typically off by ±${lo} to ±${hi} points, most where the history is short.`,
  },
  chanceCatchment: { no: 'Gjelder søkere bosatt i skolens inntaksområde.',
                     en: 'Applies to applicants resident in the school\'s intake area.' },
  chanceCal:  { no: c => `Testet mot 2025–26 traff 80 %-intervallet ${c} % av gangene.`,
                en: c => `Tested against 2025–26, the 80% interval was right ${c}% of the time.` },
  chTitle: {
    // pf may be null: a county pinned at π = 1 by rule (none today; the
    // mechanism is FILL_BLIND in tools/model.py) has no fill figure to show
    no: (p, y, m, sd, pf, h) => `Sjanse for plass i ${y} med poengene dine: ${p} %. Forventet grense ca. ${m} ± ${sd}${pf == null ? '' : `; sannsynlighet for at det blir venteliste: ${pf} %`}. Bygger på ${h} år med tall for dette programområdet.`,
    en: (p, y, m, sd, pf, h) => `Chance of a place in ${y} with your points: ${p}%. Expected threshold about ${m} ± ${sd}${pf == null ? '' : `; probability of a waiting list at all: ${pf}%`}. Built on ${h} ${h === 1 ? 'year' : 'years'} of figures for this programme area.`,
  },
  // ----- my choices -----
  pickAdd:    { no: 'Legg til i ønskene mine', en: 'Add to my wishes' },
  pickRemove: { no: 'Fjern fra ønskene mine', en: 'Remove from my wishes' },
  choicesHead: { no: n => `Ønskene mine (${n})`, en: n => `My wishes (${n})` },
  choicesClear: { no: 'Tøm', en: 'Clear' },
  choicesClearSure: { no: 'Sikker?', en: 'Sure?' },
  choicesCleared: { no: 'Ønskene er tømt', en: 'Your wishes are cleared' },
  choicesOpen: { no: 'Åpne skolen', en: 'Open the school' },
  choicesOpenOne: { no: (sch, what) => `Åpne ${sch} – ${what}`, en: (sch, what) => `Open ${sch} – ${what}` },
  choicesRemoveOne: { no: (sch, what) => `Fjern ${what} ved ${sch} fra ønskene mine`,
                      en: (sch, what) => `Remove ${what} at ${sch} from my wishes` },
  choicesSum: { no: (L, R, U) => `${L} sannsynlig · ${R} mulig · ${U} lite sannsynlig`,
                en: (L, R, U) => `${L} likely · ${R} possible · ${U} unlikely` },
  choicesAny: { no: p => `Sjansen for minst én plass: ca. ${p} %`, en: p => `Chance of at least one place: about ${p}%` },
  choicesAnyTitle: {
    no: 'Regnet som om ønskene var uavhengige av hverandre. Det er de ikke helt – et år med hard konkurranse rammer flere av dem samtidig – så dette tallet er litt for høyt.',
    en: 'Computed as if the wishes were independent of each other. They are not quite – a hard year hits several of them at once – so this figure is a little too high.',
  },
  choicesNudge: { no: 'Ingen av ønskene er sannsynlige. Vurder å ta med et sikrere ønske.',
                  en: 'None of the wishes is likely. Consider adding a safer one.' },
  choicesNoPts: { no: 'Skriv inn poengene dine for å se sjansen per ønske.',
                  en: 'Enter your points to see the chance per wish.' },
  choicesNoPred: { no: 'Ingen prognose', en: 'No forecast' },
  choicesPartial: { no: (n, m) => `Regnet ut fra ${n} av ${m} ønsker – resten har ingen prognose.`,
                    en: (n, m) => `Worked out from ${n} of ${m} wishes – the rest have no forecast.` },
  // ----- the final round, where the county publishes an earlier one -----
  finalRoundChip: { no: (r, p) => `Ved ${r}. inntak (siste): ca. ${p} %`, en: (r, p) => `By the ${ordEn(r)} intake (final): about ${p}%` },
  // `same` is true when the final round's likely count equals the published
  // round's: the probability is still higher (never lower, measured 8 Sept
  // 2026 on 4 266 pairs), but the reader sees the same count, so the sentence
  // says so instead of promising a rise the figure beside it does not show
  finalRoundNote: {
    no: (r, L, n, same) => `Fylket publiserer 1. inntak. Ved ${r}. inntak – det siste – er sjansen ` +
      (!same ? `høyere: sannsynlig plass på ${L} av ${n}.`
       : L ? `noe høyere: fortsatt sannsynlig plass på ${L} av ${n}.`
       : `noe høyere, men fortsatt ikke sannsynlig plass: 0 av ${n}.`) +
      ` Målt på fylkets egne tall for begge inntakene.`,
    en: (r, L, n, same) => `The county publishes the 1st intake. By the ${ordEn(r)} intake – the final one – the chance is ` +
      (!same ? `higher: a place is likely at ${L} of ${n}.`
       : L ? `somewhat higher: a place is still likely at ${L} of ${n}.`
       : `somewhat higher, but a place is still not likely: 0 of ${n}.`) +
      ` Measured on the county's own figures for both intakes.`,
  },
  chanceRoundUnknown: { no: 'Fylket oppgir ikke hvilket inntak tallene er fra. Sjansen gjelder det inntaket fylket publiserer.',
                        en: 'The county does not state which intake its figures are from. The chance refers to the intake the county publishes.' },
  // Møre og Romsdal's dashboard masks any Vg1 figure under 25 with * and
  // legends it «alle kom inn, eller laveste karakter var under 25»; the
  // dataset follows that rule (tools/extractors/mro.py), so its "ingen
  // venteliste" is the county's own reading, not an observed queue state
  openRuleNote: { no: 'Møre og Romsdal viser «ingen venteliste» der alle kom inn eller poenggrensen var under 25 poeng – fylkets egen regel. Hvilken av de to, sier ikke fylket.',
                  en: 'Møre og Romsdal shows “no waiting list” where everyone got in or the threshold was below 25 points – the county\'s own rule. Which of the two, the county does not say.' },
  // Telemark's extract gives the lowest points among the admitted for every
  // offered programme and no fill state, so the county is published but held
  // out of the model (tools/extractors/telemark.py, HELD_OUT in tools/model.py)
  heldOutNote: { no: f => `${f} oppgir laveste poengsum blant de inntatte for hvert programområde, men ikke om alle søkerne fikk plass. Tallene kan derfor ikke sammenlignes med poenggrensene i andre fylker, og skolen har ingen prognose.`,
                 en: f => `${f} gives the lowest points among those admitted to each programme area, but not whether every applicant got a place. The figures therefore cannot be compared with thresholds in other counties, and the school has no forecast.` },
  finalRoundUnknown: {
    no: 'Fylket publiserer bare 1. inntak. Flere kommer inn i senere inntak, men det finnes ikke tall for hvor mange.',
    en: 'The county publishes the 1st intake only. More get in at later intakes, but there are no figures for how many.',
  },
  adjLine:    { no: (d, se) => `${d} poeng i forhold til samme programområder ellers i fylket (± ${se})`,
                en: (d, se) => `${d} points relative to the same programme areas elsewhere in the county (± ${se})` },
  adjTitle: {
    no: 'Hvor mye høyere eller lavere skolens poenggrenser ligger enn de samme programområdene ellers i fylket, når sammensetningen av programområder er tatt hensyn til. Et mål på etterspørsel, ikke på kvalitet.',
    en: 'How much higher or lower this school\'s thresholds run than the same programme areas elsewhere in the county, once its mix of programme areas is accounted for. A measure of demand, not of quality.',
  },
};
export const t = (k, ...a) => {
  // an unknown lang (stale or tampered pk-lang) falls back to Norwegian
  // instead of stamping "undefined" across the page and throwing in bindTips
  const e = T[k], v = e[S.lang] !== undefined ? e[S.lang] : e.no;
  return typeof v === 'function' ? v(...a) : v;
};

export function initI18n() {
}
