# Data gaps, sources, and who to talk to

Working document, August 2026. Three parts: which years the dataset is
missing and what a three-agent web sweep found for each; who can *provide*
the missing (or better) data; and who might *want* the tool — for research
or to put in front of families.

## 1. The gap matrix

Coverage by county and year (x = in the dataset):

| county | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 |
|---|---|---|---|---|---|---|---|---|---|---|
| Akershus | . | . | . | . | . | . | . | x | x | x |
| Buskerud | . | . | . | . | . | . | . | x | x | . |
| Innlandet | . | . | . | . | . | . | x | x | x | . |
| Oslo | . | . | . | x | x | x | x | x | x | x |
| Rogaland | . | x | x | x | x | x | x | x | x | . |
| Trøndelag | . | . | . | . | . | . | . | . | x | . |
| Vestland | x | x | x | x | x | x | x | x | x | x |

Structural context: Akershus and Buskerud sat inside **Viken** 2020–2023;
Innlandet was **Hedmark + Oppland** before 2020; Trøndelag merged in 2018.
The 2026 intake ran in July–August 2026.

## 2. Search results (sweep of 2026-08-24)

Method: official sites, Wayback Machine CDX enumeration of every relevant
domain (including the dead ones: viken.no, akershus.no, hedmark.org,
oppland.no, ntfk.no, stfk.no), download-and-inspect of candidate PDFs, news
archives, vilbli.no's own data payloads, and filtered eInnsyn postjournal
searches with sanity checks.

### Found — ingestable now

| What | Where | Note |
|---|---|---|
| **Oslo 2017, 2018, 2019** — full citywide tables, 1. inntak | osloskolen.no school-site PDFs: [2017](https://nordberg.osloskolen.no/siteassets/radgiversosiallarer/nedre-poenggrense-per-skole-vg1-2017.pdf) · [2018](https://engebraten.osloskolen.no/siteassets/dokumenter/diverse/nedre-poenggrense-per-skole-vg1.pdf) · [2019](https://marienlyst.osloskolen.no/siteassets/skolearet-19-20/2019-nedre-poenggrense-1--inntak-vg1-1.pdf) | Same layout the Oslo extractor already parses. Bonus: 2015 and 2013 editions also survive. |
| **Vestland 2026/27, 3. inntak** (and 1. inntak) | [3. inntak](https://www.vestlandfylke.no/globalassets/utdanning-og-karriere/elev/inntak/nedre-poenggrense-ved-3.inntak.pdf) · [1. inntak](https://www.vestlandfylke.no/globalassets/utdanning-og-karriere/elev/inntak/nedre-poenggrense-1.inntak-.pdf) | Fresh. NB: Vestland moved its files under `/elev/inntak/` — old stored URLs 404; check the refresh pipeline's links. |
| Hedmark 2017 + 2019, top-10 tables | glomdalen.no / ostlendingen.no news articles | Partial (top schools only) — spot-validation, not coverage. |

### Likely exists, not online — innsyn/e-mail targets

| What | Evidence | Holder |
|---|---|---|
| ~~Akershus 2026/27~~ | **Mottatt og ingestert 27.08.2026** (svar fra inntak@afk.no på innsynskrav 25.08): «Nedre_poenggrense_Vg1_2026-2027_Akershus_2.inntak.xlsx» — skole × programområde-matrise, 2. inntak, alle 34 skoler. | — |
| ~~Akershus 2024/25~~ | **Mottatt og ingestert 27.08.2026** (samme svar): «Karaktergrense 2024-2025.xlsx», samme matriseform. Akershus har dermed 2024–2026, alle som 2. inntak. | — |
| ~~Hedmark 2014–2018~~ | **Closed 26.08.2026** (sak 2026/1-152): fylket «har ikke mulighet til å hente ut tilsvarende oversikter lenger tilbake i tid» — dokumentet er tapt hos rettsetterfølgeren. | — |
| ~~Innlandet 2020–2022~~ | **Mottatt og ingestert 26.08.2026** (sak 2026/1-152): 942 celler (én reddet 27.08 fra en feilsplittet tabellrad — Dombås, studiespesialisering 2020) fra «Nedre inntaksgrense 2020-21 VG1 VG2.pdf» og «Poenggrense 2021 og 2022.pdf», inkl. fire nedlagte/omorganiserte skoler. Fylkets forbehold: strukturomlegging 2020/2022 begrenser sammenlignbarheten — håndtert via Grep-koder og serieidentitet. | — |
| ~~Rogaland 2017/18~~ | **Closed 26.08.2026**: fylket svarer at tallene ikke ble arkivert og ikke lenger finnes i deres systemer. Cellen er ikke et hull i innsamlingen — dataene eksisterer ikke. | — |
| **Rogaland 2026/27** | Fylket (26.08.2026): publiseres på vilbli «ila denne uken eller neste». Sjekk vilbli tidlig september. | — |
| **Trøndelag / Innlandet / Buskerud 2026/27** | Intakes complete; vilbli payloads still serve last year's editions. Buskerud's Aug-06 page edit was cosmetic (figures byte-identical to 2025). | recheck September–November |

### Probably never published — searched exhaustively, with evidence

| What | Evidence |
|---|---|
| **Trøndelag ≤2024** | County FAQ (Wayback, dated Mar 2023 and May 2024): "Vi lager ikke oversikt over laveste poengsum…". Structural: near-catchment admission before Trondheim's 2024 free-choice reform. The internal note claiming 2024/25 publication is unverified — contrary primary evidence. |
| **Viken 2020–2023 (Akershus + Buskerud years)** | Zero threshold URLs in a full viken.no CDX sweep; eInnsyn: 0 hits with working sanity checks. Viken ran 11 inherited intake areas, then nærskoleprinsipp — no county-wide table was assembled. May still exist as internal case data; the AFK FOI form explicitly covers Viken records. |
| **Akershus ≤2019, Buskerud ≤2019** | All archived "statistics" PDFs inspected: applicant/capacity counts only, zero thresholds. 2018 news: "fylkeskommunen har ikke gitt ut konkrete tall". |
| **Oppland 2017–2019** | 8 528 archived URLs enumerated: headcount documents only. |
| **Nord-/Sør-Trøndelag 2017** | Domain sweeps show admissions-process pages only. |

### Counties outside the dataset

| County | Verdict |
|---|---|
| **Møre og Romsdal** | **Publishes — as a Power BI dashboard** (all schools, historical). Dan Ernes (rådgiver, 26.08.2026): «Publish to web» gir ingen rådata-nedlasting, men han vil lenke en nedlastbar Excel-fil i dashbordet og «gir en lyd» når den er ute. Dashbordet oppdateres én gang i året, etter 2. inntaket i august. |
| **Agder** | Explicitly refuses: "Vi har derfor valgt å ikke publisere karaktersnittene for hvert år." |
| **Nordland** | Explicitly refuses: "Derfor publiserer vi ikke karaktersnitt for hvert år." |
| Vestfold, Telemark, Troms, Finnmark | No publication found, no explicit statement either way; would need a direct ask. |

**Bottom line:** the map's blank cells split cleanly. Oslo 2017–19 and
Vestland 2026 are ingestable today. Akershus 2026 is one FOI request away
(with a journalist's answered request as precedent). Hedmark 2014–18 and
Innlandet 2020–22 are concrete, citable innsyn asks. Most of the rest —
Viken-era, old Akershus/Buskerud/Oppland, Trøndelag before 2025 — was
genuinely never compiled, largely because those systems didn't admit by
points county-wide; those cells aren't missing data, they're a different
admission regime, which is itself worth a line in the report.

## 3. Who can provide the data (or better)

Ordered by expected value per conversation.

1. ~~**Novari IKS** (formerly Vigo IKS) — *the* structural answer.~~
   **Closed 02.09.2026.** Novari runs VIGO as *databehandler*; the
   counties are *behandlingsansvarlige*, and a processor cannot release a
   controller's data on its own authority. Natalia K.-Gundersen, closing
   SERVICE-1779: «Du må kontakte fylkeskommunene som er
   behandlingsansvarlige for sine data. Vi har ikke anledning til å dele
   [fylkeskommunenes] data.» Not a statement that the data is missing —
   VIGO Sentralbase holds every county's intake uniformly — but that each
   county is the only door to its slice. The useful residue: a county can
   no longer say the figures are unavailable in a usable form; it is the
   controller of a uniform VIGO extract it can pull or instruct Novari to
   release. Say so in every request to a non-publishing county.
2. **Fylkeskommunenes inntakskontor** — the only route, and the one that
   has actually delivered (Akershus, Innlandet, Møre og Romsdal). Offentleglova
   applies; eInnsyn requests work (Budstikka's precedent).

   | County | E-mail | Phone / note |
   |---|---|---|
   | Akershus | inntak@afk.no | 22 05 50 22 · FOI form AKE0356 (incl. Viken) |
   | Buskerud | inntak@bfk.no | 32 80 85 20 · FOI form BUS0345 |
   | Innlandet | inntak@innlandetfylke.no | 62 00 08 80 · successor to Hedmark/Oppland |
   | Oslo | Utdanningsetaten, via oslo.kommune.no | school sites host the archive |
   | Rogaland | inntak@rogfk.no | 51 51 69 00 |
   | Trøndelag | inntak@trondelagfylke.no | 74 17 40 00 |
   | Vestland | via vestlandfylke.no contact form | publishes everything already |
   | Møre og Romsdal | inntak@mrfylke.no | 71 28 01 50 · Power BI holder |

Novari-status: 28.08.2026 ba Natalia K.-Gundersen (tjenesteansvarlig VIGO
og vilbli.no) om at saken ble lagt inn i Novari Servicedesk — registrert
samme dag som **SERVICE-1779**. 02.09.2026 lukket hun den som Done:
fylkeskommunene er behandlingsansvarlige, Novari kan ikke dele deres data.
Nasjonalt uttrekk via Novari er dermed en lukket vei; se punkt 1 over.
   | Agder | inntak@agderfk.no | 38 05 00 00 |
   | Vestfold | inntak@vestfoldfylke.no | 33 34 41 72 |
   | Telemark | inntak@telemarkfylke.no | 35 91 73 70 |
   | Nordland | inntak@nfk.no | 75 65 02 10 |
   | Troms | postmottak@tromsfylke.no | 77 78 80 00 |
   | Finnmark | postmottak@ffk.no | 78 96 30 00 |

3. **Utdanningsdirektoratet, Divisjon for analyse og vurdering /
   statistikkavdelingen** — the national statistics mandate
   (Utdanningsspeilet, statistikkbanken); receives VIGO-based deliveries.
   The office to lobby with the report's recommendations.
4. **SSB (utdanningsstatistikk)** — intake microdata behind research-access
   procedures (microdata.no); relevant if the model ever needs
   applicant-level covariates.
5. **Schools' own news posts** — spot-verification only.

## 4. Who might want the tool

### For research

- **NIFU** — the national education-research institute; recurring
  videregående projects (e.g. KLAR2030). The open, register-aligned dataset
  with a validated forecast is directly usable for admission-pressure and
  school-choice studies.
- **Udir, Divisjon for analyse og vurdering** — consumer of the
  comparability findings (round bridge, cell semantics), and owner of the
  Grep register the taxonomy builds on.
- **University groups** in economics/sociology of education (UiO, NTNU,
  UiB, OsloMet; FAIR/NHH for market design). The mix-adjusted school effect
  and the censoring treatment are methods material.
- **SSB analysis** — education statistics analysts.

### For putting in front of families

- **Rådgivere i ungdomsskolen** — highest leverage: they advise every
  applying family. Channels: Rådgiverforum Norge, county rådgivernettverk,
  Utdanning.no's counsellor resources.
- **Fylkeskommunenes veiledningstjenester / inntakskontor** — they answer
  these questions by phone every July.
- **vilbli.no (Novari IKS + counties)** — the official applicant portal;
  explains the rules but shows no thresholds or chances. Natural
  complement — or acquirer.
- **Elevorganisasjonen** — the pupils' organisation; legitimacy with the
  actual applicants.
- **FUG (Foreldreutvalget for grunnopplæringen)** — parents of
  10th-graders are the core audience.
- **Utdanning.no (HK-dir)** — the national education-choice portal.
- **Data journalists** — NRK, Aftenposten/Osloby, Bergens Tidende,
  Adresseavisen, Stavanger Aftenblad, Budstikka (already FOI-ing this
  exact data). July intake stories are annual; the round-bridge finding is
  a ready-made story, and coverage is distribution.

## 5. Suggested order of operations

1. **Ingest now**: Oslo 2017–2019 and Vestland 2026 (both rounds) — same
   pipeline, no permission needed. Fix the Vestland URL change while there.
2. **One FOI request to Akershus** for the 2026/27 thresholds, citing
   eInnsyn case 2026/29733 as precedent.
3. **One innsyn letter to Innlandet** citing the Hedmark
   `poenggrenser-2014-2018.pdf` filename and the 2020–2022 predecessor of
   the rolling matrix.
4. **September recheck** (two minutes each): Rogaland, Buskerud, Innlandet,
   Trøndelag 2026/27 publications.
5. ~~**One well-aimed letter to Novari IKS**~~ — closed 02.09.2026, see
   §3.1. Replaced by: **innsynskrav to each non-publishing county** (Telemark
   sent 01.09.2026; Agder, Nordland, Østfold, Vestfold, Troms, Finnmark
   next), each citing Novari's confirmation that the county is the
   controller of a uniform VIGO extract.
6. **Scoping pass on Møre og Romsdal's Power BI** — the one new-county
   expansion with data already public.
7. **Outreach wave with the report**: Udir analysis division, NIFU, then
   the rådgiver networks — institutional interest before family-facing
   distribution.
