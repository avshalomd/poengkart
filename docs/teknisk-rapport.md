# Poengkart: åpne poenggrenser og en kalibrert prognose for neste inntak

**Teknisk rapport, august 2026**
Abshalom Dayan · [poengkart-no.vercel.app](https://poengkart-no.vercel.app) · kildekode og data: [github.com/avshalomd/poengkart](https://github.com/avshalomd/poengkart)

---

**English abstract.** Poengkart collects the admission point thresholds
(*poenggrenser*) that Norwegian counties publish for upper secondary school,
normalises them against Udir's national programme register (Grep), and presents
them as an open map covering 191 schools in 7 counties, 2017–2026. On top of
the dataset sits a forecast: a two-part (hurdle) model — a logistic model for
whether a programme fills, and a Gaussian hierarchical model for where the
threshold lands if it does — validated walk-forward with 2025–26 fully held
out. The forecast beats the naive "last year's figure" rule in every history
bucket (RMSE 5.0 vs 5.9 on the longest series), its 80 % intervals cover 81 %,
and the resulting admission probability is well calibrated (Brier 0.097 vs
0.150 for the naive rule). The work also surfaces findings about the
publication practice itself: thresholds from different intake rounds differ
systematically (measured: −3.2 points, with 32 % of queues gone by the final
round in Vestland), raw school averages largely reflect programme mix rather
than demand, and the census-like data most families rely on exists only as
county PDFs with inconsistent semantics. The report closes with concrete,
low-cost recommendations to publishers.

---

## 1. Bakgrunn

Hvert år søker rundt 70 000 elever videregående opplæring gjennom vigo.no.
Det viktigste tallet i den beslutningen — poenggrensen, altså poengsummen til
den siste søkeren som fikk plass — publiseres i dag av **7 av 15
fylker/inntaksområder**, som PDF-tabeller med ulik struktur, ulik dybde
(Oslo har publisert siden 2017, Akershus kun siste år), ulikt inntaksopptak
(1., 2. eller 3. inntak — ofte uoppgitt) og ulik notasjon for spesialtilfeller.

For en familie betyr det tre ting: tallene er vanskelige å finne, vanskelige å
sammenligne på tvers av fylker, og lette å feiltolke. Poengkart ble bygget for
å gjøre tre ting med samme datagrunnlag:

1. **Samle og normalisere** alle publiserte poenggrenser mot Udirs offisielle
   programstruktur, og gjøre dem tilgjengelige som åpne data.
2. **Vise dem** i et kart der skole, utdanningsprogram og programområde er de
   samme begrepene familien møter i søknaden.
3. **Prognostisere neste inntak** — ikke som ett tall, men som en kalibrert
   sannsynlighet for plass, gitt søkerens poengsum.

Datasettet omfatter i dag **191 skoler, 2 122 programrader og 2017–2026** fra
Akershus, Buskerud, Innlandet, Oslo, Rogaland, Trøndelag og Vestland.

## 2. Datagrunnlag og semantikk

### 2.1 Kilder og normalisering

Kilden er fylkenes egne publikasjoner (PDF). Hver kilde parses med en egen
ekstraktor, og resultatet valideres av **73 regresjonstester** som blant annet
låser kjente feilkilder: årstall-kolonner som er forskjøvet, tall som er
åpenbart uplausible, og skoler som mangler koordinater.

Programnavnene normaliseres mot **Grep**, Udirs læreplanregister. Hver rad får
dermed registerets egen identitet: 2 116 av 2 122 rader bærer en Grep-kode
(de seks siste er International Baccalaureate, som ligger utenfor registeret).
Kategoriseringen i utdanningsprogram er dermed statens, ikke vår: en tidligere
nøkkelordbasert klassifisering feilplasserte f.eks. gartnernæring under
restaurant- og matfag fordi «ernæring» inngår i ordet.

### 2.2 Hva en celle betyr

En verdi i en fylkestabell er ikke alltid et tall, og ikke-tallene er ikke
manglende data — de er ulike hendelser:

| Celle | Betydning | I gjennomsnitt? | I prognosen? |
|---|---|---|---|
| 38,4 | Venteliste; siste inntatte hadde 38,4 | ja | nivå + fylt |
| 0,0 | Fylt opp, men siste inntatte konkurrerte uten poeng | **nei** | fylt, aldri nivå |
| «Alle inntatt» | Ingen venteliste — ingen grense eksisterer | nei | ikke fylt |
| F / D / U | Fortrinnsrett / dokumentasjonsinntak / utgått | nei | utenfor |

To konsekvenser er verdt å slå fast: datasettet er **sensurert per
konstruksjon** (en grense finnes bare der etterspørselen oversteg tilbudet),
og 0,0 er en felle — den ser ut som et tall, men å ta den med i et snitt
trekker skolens nivå mot null av motsatt grunn av det en lav grense gjør.
Denne semantikken håndheves i alle beregninger.

## 3. Verktøyet

Kartet farger hver skole etter snittet av årets poenggrenser, med
prikkstørrelse som andelen programområder som ble fylt opp — sensureringen
vises, den gjemmes ikke i snittet. Ett globalt filter følger Udirs nivåer:
alle → utdanningsprogram → programområde, med fylkenes egne radnavn bevart
(de er identiteten til inntaksgruppen) og registerets offisielle navn som
oppslag der stavingen avviker.

Med egen poengsum lagt inn viser hver rad en **sjanse for plass ved neste
inntak**, og en huskeliste lar familien samle inntil ti ønsker — samme
grenser som vigo-søknaden (tre ulike utdanningsprogram til Vg1) — med samlet
sannsynlighet for minst én plass.

## 4. Prognosemodellen

### 4.1 Spørsmålet

En familie spør ikke «hva var grensen», men «kommer jeg inn». Det ærlige
svaret er en sannsynlighet: samme programområde ved samme skole flytter seg
med et standardavvik på **6,3 poeng** fra år til år (3 156 årspar; bare
halvparten av endringene er innenfor ±3). Appen svarer med:

> P(plass | x poeng) = (1 − π) + π · F((x − m) / s)

Enten dannes ingen venteliste (sannsynlighet 1 − π), eller grensen m havner
under søkerens poengsum x, med målt spredning s og empirisk feilfordeling F.

### 4.2 To tilpasninger, én struktur

Modellen er en **hurdle-modell**: én logistisk regresjon for om det dannes
venteliste (7 934 celler som konkurrerte på poeng), og én gaussisk modell for
nivået gitt venteliste (5 433 celler med tall). Begge deler samme
hierarkiske skjelett med tilfeldige effekter:

> y = μ + skole + utdanningsprogram + programområde|trinn + skole×program + fylke×år + inntaksrunde + ε

Fylke×år er en **random walk**: fylkets markedsnivå beveger seg glatt, og
nyeste steg er prognosen for neste år. Estimerte spredninger (poeng): skole
3,4 · program 3,1 · skole×program 2,7 · årsinnovasjon 1,3 · residual 4,5.
Poenget med hierarkiet er lån av styrke: **567 av 1 670 serier har nøyaktig
ett år med data**, og en slik serie arver nivået sitt fra hundrevis av
lignende serier i stedet for å bli stolt på alene. Estimering skjer ved
penalisert sannsynlighetsmaksimering med EM-oppdatering av varianskomponentene;
observasjoner nedvektes med alder (halveringstid 4 år, valgt av backtesten).

### 4.3 Usikkerheten er målt, ikke antatt

En hierarkisk modell er sikker på seg selv. Derfor hentes spredningen s ikke
fra modellen, men fra **modellens egne historiske bom**: RMSE i
walk-forward-prognosene, gruppert etter hvor mye historikk serien hadde
(0 år: 7,2 · 1 år: 6,4 · 2–3 år: 5,6 · 4+ år: 4,5). F er den empiriske
fordelingen av de standardiserte feilene (41 kvantiler) — svakt venstretung,
fordi grenser kollapser oftere enn de hopper. Fyllsannsynligheten π viste seg
overkonfident (0,97 predikert → 0,82 observert) og korrigeres med
Platt-skalering lært på kalibreringsårene.

### 4.4 Validering

Alt graderes **walk-forward**: hvert år 2020–2026 prognostiseres kun med data
publisert før året. 2020–24 kalibrerer s, F og Platt-korreksjonen;
**2025–26 er holdt helt utenfor** og er de eneste tallene som siteres.
Vestlands 2023-tall (publisert fra 3. inntak i en 1.-inntaksserie) holdes
utenfor skåringen — ingen tidligere år kan lære en modell en slik hendelse,
og å la den stå ødela kalibreringen målbart.

**Nivå, holdt utenfor 2025–26** (1 497 celler med fasit):

| historikk | n | modellens RMSE | «fjorårets tall» | program–fylke-snitt | innenfor ±3 |
|---|---|---|---|---|---|
| 0 år | 269 | **7,4** | — | 8,1 | 34 % |
| 1 år | 169 | **5,8** | 7,7 | 6,8 | 41 % |
| 2–3 år | 350 | **5,6** | 7,1 | 6,5 | 42 % |
| 4+ år | 709 | **5,0** | 5,9 | 6,1 | 52 % |

80 %-intervallet (m ± 1,28 s) dekket fasiten **81 %** av gangene.

**Sannsynligheten:** for hver holdt-utenfor-celle og hver poengsum i
{20, 25, …, 55}: «fikk en søker med x poeng plass?» Brier-skår **0,097** mot
**0,150** for regelen «fjorårets grense er årets». Fra 30 % og opp ligger
prognosen innenfor fem prosentpoeng av observert frekvens; under 30 % er den
noen poeng optimistisk (et vist 15 % var reelt ca. 9 %) — appens grove bånd
(sannsynlig / mulig / lite sannsynlig) absorberer dette, og avviket er
dokumentert.

## 5. Funn av allmenn interesse

### 5.1 Inntaksrunden er ikke en fotnote

To fylker publiserer samme programmer i samme år fra to runder — en direkte,
paret måling av hva en senere runde gjør:

| | par med kø i begge | senere − tidligere | køer borte i senere runde |
|---|---|---|---|
| Akershus, 1.→2. inntak | 101 | −3,4 (sd 3,1) | 16 % av 124 |
| Vestland, 1.→3. inntak | 910 | −3,2 (sd 3,8) | 32 % av 1 348 |

Effekten varierer sterkt med program (studiespesialisering −5,3, påbygging
−5,9, elektro −1,7). **Å sammenligne poenggrenser på tvers av fylker uten å
vite runden er derfor systematisk misvisende** — og flere fylker oppgir ikke
runden i publikasjonen.

### 5.2 Rå skolesnitt måler i stor grad programmiks

Skoleeffekten α fra nivåmodellen er skolens nivå relativt til de samme
programmene ellers i fylket — altså med programmiksen trukket ut. Rangeres de
137 skolene med fem eller flere grenser etter α i stedet for rått snitt,
flytter gjennomsnittsskolen seg **16 plasser**, og den mest ekstreme 65.
En vesentlig del av et rått skolesnitt er altså *hva skolen tilbyr*, ikke hvor
etterspurt den er. Rå snitt bør ikke brukes som rangering — og α er et mål på
etterspørsel, ikke kvalitet.

### 5.3 Modellen som datakontroll

De cellene modellen finner minst plausible (|z| ≥ 3: 54 av 5 433) publiseres
i modellens metadata og er sjekket mot kildene: de tre største avvikene i
Vestland 2022 står ordrett i fylkets egen PDF — reelle ekstremer, ikke
parsefeil. Ett tilfelle står åpent (Kongsberg, musikk/dans/drama 2025 = 4,0
etter dokumentasjonsinntak i 2024). Residualene fungerer som en løpende
kvalitetskontroll av både pipeline og kilde.

## 6. Begrensninger

- Modellen gjelder **marginalsøkeren**, ikke individet: den ignorerer at man
  kun konkurrerer på sitt høyeste gjenstående ønske, kvoteplasser
  (fortrinnsrett, dokumentasjon) og tie-breaks.
- Den prognostiserer tallet **slik fylket vil publisere det**, i fylkets egen
  runde; rundebroen i 5.1 måler hvor mye mer det endelige inntaket slipper inn
  der det kan måles.
- Minst-én-sannsynligheten antar uavhengige ønsker; sannheten er noe lavere.
- I fylker med inntaksområder gjelder grensen kun søkere bosatt i området.
- Publiserte sjanser kan i prinsippet flytte søkning og dermed grenser; lite
  trolig målbart i denne skalaen, men reelt.
- Under 30 % sjanse er råprosenten noen poeng optimistisk (dokumentert).

## 7. Anbefalinger til utgivere

Alle er billige, og hver av dem hadde fjernet en hel feilklasse i dette
arbeidet:

1. **Publiser maskinlesbart** (CSV/JSON) ved siden av PDF-en.
2. **Oppgi inntaksrunden** i selve tabellen — den flytter tallene med 3–6
   poeng og er i dag ofte utelatt.
3. **Standardiser semantikken**: skill eksplisitt mellom «fylt, grense 0,0»,
   «alle inntatt» og kvote-/dokumentasjonsinntak.
4. **Bruk Grep-koder** i publikasjonen — programnavn staves i dag ulikt både
   mellom fylker og mellom år i samme fylke.
5. **Publiser historikk**, ikke bare siste år: usikkerheten i et råd til en
   familie kan ikke tallfestes uten den.

## 8. Reproduserbarhet

Hele pipelinen er åpen: parsere, taksonomi, modell (`tools/model.py`),
backtest (`data/model-backtest.csv` inneholder hver walk-forward-prognose med
fasit), og valideringen (73 parsetester, 12 959 modellinvarianter, 13
UI-invarianter som kjøres i selve appen). Datasettet kan lastes ned direkte
fra appen. Metode og alle tall i denne rapporten regenereres av
`tools/refresh.py` fra kildene.

---

*Kontakt: Abshalom Dayan · avshalomdayan318@gmail.com*
