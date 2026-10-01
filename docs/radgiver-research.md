# Rådgiver research: how Norwegian counsellors guide 10. trinn through the vgs application

Compiled 30 Sept 2026 for a product design brief (poenggrense/map app).

**Bottom line.** A rådgiver (counsellor) mostly does four things in the vgs season: individual conversations to match the pupil to a *utdanningsprogram* (programme), practical help registering the application in vigo, explaining the few rules that surprise families (binding ranking, "right to one of three programmes, not a school", answer deadline, first-day attendance), and referring hard cases (special needs, crisis) to PPT and other services. An AI assistant on a poenggrense app should copy that shape: programme before school, three honest ønsker including a realistic one, poenggrenser as an indication only, and a hard hand-off for anything individual.

**Method note.** Firecrawl had no credits left, so all sources were read with WebSearch and WebFetch. Fetched pages are summarised by a small model, so wording is paraphrased; quotes are kept short and in Norwegian. Where a source is a search-result summary rather than a fetched page, it says so. Two commercial guides (skoleplass.no, minutdanning.com) appeared in results; they are used only where marked, because they are not official.

**Source index** (used throughout as [S#]):

| # | Source | URL |
|---|---|---|
| S1 | Udir, Retten til nødvendig rådgiving (Udir-2-2009) | https://www.udir.no/regelverkstolkninger/opplaring/Skoleeiers-ansvar/Udir-2-2009-Retten-til-nodvendig-radgiving/ |
| S2 | Utdanningsforskning.no, new opplæringslov and rådgiving | https://utdanningsforskning.no/artikler/2025/ny-opplaringslov-elevens-rett-til-radgiving-om-sosiale-og-personlige-forhold/ |
| S3 | Lovdata, opplæringslova (2023) chapter 16 table of contents | https://lovdata.no/dokument/NL/lov/2023-06-09-30/KAPITTEL_4-1 |
| S4 | Buland, Mordal, Mathiesen (NTNU Samfunnsforskning 2020), Rådgiving i norsk skole anno 2020 | https://samforsk.no/uploads/files/BulandMordalogMathiesen2020Rdgivinginorskskoleanno2020.pdf |
| S5 | Rogaland fylkeskommune, Søkerhåndbok for rådgivere 2025-2026 | https://www.rogfk.no/_f/p1/ide1f4f34-d96a-4c32-9765-8498a065a13e/sokerhandbok-for-radgivere-2025-2026.pdf |
| S6 | vilbli.no, Hva kan du søke? | https://www.vilbli.no/nb/no/a/hva-kan-du-soke-6 |
| S7 | vilbli.no, Poengsum og karakterer | https://www.vilbli.no/nb/no/a/poengsum-og-karakterer-6 |
| S8 | Udir, Udir-2-2021 § 6-21 Utregning av poeng | https://www.udir.no/regelverkstolkninger/opplaring/Inntak-til-videregaende-opplaring/inntak-videregaende-opplaring-formidling-lareplass-udir-2-2021/del-ii/6-21/ |
| S9 | vilbli.no, Inntak for søkere med fortrinnsrett | https://www.vilbli.no/nb/no/a/inntak-for-sokere-med-fortrinnsrett-6 |
| S10 | vilbli.no, Klagerett | https://www.vilbli.no/nb/no/a/klagerett-6 |
| S11 | Oslo (Osloskolen), Inntaksregler og poengberegning | https://videregaende.osloskolen.no/inntak/inntak/inntaksregler-og-poengberegning/ |
| S12 | Osloskolen, Viktige frister når du søker videregående | https://videregaende.osloskolen.no/info-om-vgs/gode-rad-for-du-soker/soke-videregaende/ |
| S13 | Oslo kommune, Førsteinntaket 2026-27 | https://www.oslo.kommune.no/skole-og-utdanning/videregaende-skole/soke-videregaende-skole/tildeling-av-plass-videregaende-skole/ |
| S14 | Trøndelag fk, Første inntak: spørsmål og svar | https://www.trondelagfylke.no/vare-tjenester/utdanning/elev/inntak-videregaende-opplaring/forste-inntak-til-videregaende-sporsmal-og-svar/ |
| S15 | Trøndelag fk, Endringer i inntaksordning 2024-2025 | https://www.trondelagfylke.no/nyhetsarkiv/endringer-i-inntaksordningen/ |
| S16 | Vestland fk, For føresette | https://www.vestlandfylke.no/utdanning-og-karriere/elev/foresette/ |
| S17 | Akershus fk, Søke skoleplass og læreplass | https://afk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/ |
| S18 | Rogaland fk, Søke skoleplass | https://www.rogfk.no/vare-tjenester/skole-og-utdanning/opplaring-i-skole/soke-skoleplass/ |
| S19 | ung.no, Søkt videregående skole: hva skjer nå? | https://www.ung.no/utdanning/vgs/2608_S%C3%B8kt_videreg%C3%A5ende_skole_-_hva_skjer_n%C3%A5.html |
| S20 | ung.no, Er karakterene mine gode nok til å komme inn på vgs? | https://www.ung.no/utdanning/vgs/2524_Er_karakterene_mine_gode_nok_til_%C3%A5_komme_inn_p%C3%A5_vgs.html |
| S21 | ung.no, Du har rett til videregående opplæring | https://www.ung.no/utdanning/vgs/2642_Du_har_rett_til_videreg%C3%A5ende_oppl%C3%A6ring.html |
| S22 | ung.no, Du har rett til rådgiving på skolen | https://www.ung.no/skolen/3135_Du_har_rett_til_r%C3%A5dgiving_p%C3%A5_skolen.html |
| S23 | ung.no, Hvem kan du snakke med om videregående skole? | https://www.ung.no/utdanning/3514_Hvem_kan_du_snakke_med_om_videreg%C3%A5ende_skole.html |
| S24 | ung.no Q&A (rådgiver answers): Hvordan velge videregående skole? | https://www.ung.no/oss/SfAJllE8pXQfagBIKn7Z5F |
| S25 | ung.no Q&A: Hvordan fungerer Vigo-søknaden | https://www.ung.no/oss/ZoDtLMl7on1LRpXCVQiF0p |
| S26 | utdanning.no, Hvordan søke videregående opplæring | https://utdanning.no/tema/videregaende_opplaering/hvordan_soke_videregaende_opplaering |
| S27 | FUG, Begynne på videregående | https://foreldreutvalgene.no/fug/begynne-pa-videregaende/ |
| S28 | Lagård ungdomsskole, rådgiver page | https://lagaard.eigskole.no/r%C3%A5dgiver/hva-m%C3%A5-jeg-ha-i-snitt-for-%C3%A5-komme-inn-p%C3%A5 |
| S29 | Høyland ungdomsskole (Sandnes), VGS søknad og info | https://sites.google.com/sandnesskolen.no/hoylandungdomsskole/informasjon/vgs-s%C3%B8knad-og-info |
| S30 | SSB, De som får førsteønske har større sjanse for å fullføre | https://www.ssb.no/utdanning/artikler-og-publikasjoner/de-som-far-forsteonske-har-storre-sjanse-for-a-fullfore-videregaende |
| S31 | Udir, Førsteinntaket til videregående 2025 | https://www.udir.no/tall-og-forskning/statistikk/statistikk-videregaende-skole/analyser/2025/forsteinntaket-til-videregaende-skole-2025/ |
| S32 | Utdanningsnytt, Ulik praksis i poengberegning til vgs | https://www.utdanningsnytt.no/ulik-praksis-i-poengberegning-til-vgs/110124 |
| S33 | HK-dir, Karriereveiledning.no (search summary) | https://hkdir.no/ressurser/karriereveiledning-no |
| S34 | Udir, Kort om utdanningsvalg | https://www.udir.no/laring-og-trivsel/lareplanverket/fagspesifikk-stotte/nytt-i-fagene/kort-om-utdanningsvalg/ |
| S35 | Røde Kors, Kors på halsen | https://www.rodekors.no/tilbudene/samtaletilbud/ |
| S36 | Alarmtelefonen for barn og unge | https://www.116111.no/ |
| S37 | Mental Helse, Hjelpetelefonen 116 123 | http://mentalhelse.no/fa-hjelp/hjelpetelefonen |
| S38 | Kristiansand kommune, hjelpetelefoner | https://www.kristiansand.kommune.no/hjelpetelefoner |
| S39 | Buskerud/Akershus/Østfold fritt skolevalg (search summary) | https://bfk.no/tjenester/skole-og-opplaring/aktuelt-skole-og-opplaring/buskerud-innforer-fritt-skolevalg.188236.aspx |
| S40 | Skoleplass.no (commercial, low reliability) | https://skoleplass.no/videregaende/artikler/velge-videregaende-skole |

---

## 1. Who the rådgiver is and what the role covers

**Two functions, often one person.** Pupils have a right to two kinds of counselling: *sosialpedagogisk rådgiving* (social-pedagogical: personal, social and emotional difficulties that affect schooling) and *utdannings- og yrkesrådgiving* (education and career guidance) [S1, S22]. The same person often holds both hats. In the 2020 national survey, 36 % of ungdomsskole rådgivere (vs 67 % in vgs) did both functions themselves, despite a recommendation since 2003 to separate them [S4].

**Legal basis.**
- Old law: opplæringslova § 9-2 plus forskrift kap. 22, with Udir's interpretation saying the school owner (kommune for ungdomsskole) must ensure both forms are available, delivered by staff with "relevant competence", individually or in groups [S1, S2].
- New opplæringslov (in force 1 Aug 2024): rådgiving is in § 16-1 (*Rådgiving om utdannings- og yrkesval*) and § 16-2 (*Rådgiving om sosiale og personlege forhold*); § 28-9 covers *karriererettleiing* as a kommune/fylkeskommune duty [S3]. One commentator notes the wording moved from an individual right to a duty on the kommune and is vaguer about content [S2]. (Only the section titles were verifiable in the Lovdata excerpt; the quote about "the counselling they need" comes from S2.)
- Career guidance is meant to be a process from 8. to 13. trinn, not just the March application; utdanningsvalg is the subject that carries it in ungdomsskole [S34, Elevsiden: https://www.elevsiden.no/rettigheter/rett-til-radgivning/].

**Typical workload and resources.**
- Minimum resource is about half a årsverk per 250 pupils, roughly 2.4 minutes per pupil per week; 69.9 % of surveyed rådgivere said they spend more than that minimum [S4].
- Average post share as rådgiver in ungdomsskole was 37 % (vgs 60 %) [S4]. So the counsellor is usually also a teacher.
- Top time-users (of 6 ticked per person): individual pupil conversations (most), internal meetings, admin/documentation, practical help applying for further education, cooperation with NAV/BUP/PPT, transitions, contact with home, utdanningsvalg activities, help for pupils with special needs to apply "on the right basis" [S4]. In ungdomsskole more time than in vgs goes to application procedures and transitions [S4].
- Many feel they become a "pedagogisk vaktmester" (catch-all for odd jobs) [S4].
- Implication for the app: counsellors are time-starved. A tool that answers the repeat questions (how points work, where last year's line was) frees their time for the individual conversation.

**What they do NOT do.** Rådgiving is not academic remediation; that belongs to teachers, special educators or PPT [S1]. They do not decide admission (inntakskontoret at the fylkeskommune does), do not guarantee a place at a specific school [S6, S5], and do not choose for the pupil: from age 15 the pupil decides on education choice and signs the application, and parents cannot dictate the programme [FUG via search summary: https://foreldreutvalgene.no/fug/; S27 covers the 15-year consent rule].

## 2. The typical guidance conversation

The sources give fragments rather than a single transcript, so this is a synthesis (marked where inferred).

1. **Pre-work in utdanningsvalg (8.-10. trinn).** The subject builds "karrierekompetanse": knowing yourself, exploring education and work, making choices [S34]. ung.no describes it as lessons on programmes and schools plus conversations with the rådgiver "based on who you are and what you want" (search summary: https://www.ung.no/oss/SfAJllE8pXQfagBIKn7Z5F shows the same advice: book an extra meeting with the rådgiver).
2. **Information events.** Open days (åpen dag) at vgs for pupils and parents; rådgiver informs at foreldremøte. Ungdomsskole pages tell parents to attend open days because they give "a better basis for the application" [S29; FUG recommends foreldremøter and informasjonskvelder: S27].
3. **Individual conversation in autumn/winter of 10. trinn.** Everyone gets a consultation with the rådgiver; parents are welcome to contact the school [S29, search summary]. Questions to cover (synthesis from ung.no, karriereveiledning.no and S40): what do you like doing, which subjects do you enjoy or master, theory vs practical daily life, what jobs could follow, where can you commute, what do friends have to do with it (and should not decide). ung.no says to think about "more theory subjects or a practical daily routine" [search summary: https://www.ung.no/oss/SfAJllE8pXQfagBIKn7Z5F]. Interest tests (interessetester) are used by some rådgivere [S4 lists them among tasks; karriereveiledning.no offers a free test and chat/phone guidance: S33].
4. **Grade check.** Compute karakterpoeng (snitt times 10) and compare with last year's poenggrense; rådgiver directs the pupil to the current tables [S28, S20].
5. **Registration in vigo.** The school helps pupils register; pupils bring their MinID/BankID codes to the appointment; if the MinID letter is missing, order it early (about 5 days) [S29, S5].
6. **Special arrangements before 1 Feb.** For fortrinnsrett or individuell behandling the rådgiver flags the case early: municipality reports by 1 Oct, application by 1 Feb, PPT expert assessment where relevant [S5, S9].
7. **After 1 March / after admission.** Rådgiver explains the answer deadline, waiting list and first-day rule (see section 4). Covid-era comments suggest that after the deadline "individual conversations" largely stop, because the main application is done [S4], which is a gap the app can fill (waiting lists, 2. inntak).

**Parent involvement.** Parents are invited to information evenings, open days and individual meetings; they should talk with the teen about interests and expectations but the pupil owns the choice [S27, S29]. Teens aged 15+ must consent before the school shares grades, absence or special-education information with vgs [S27].

## 3. Concrete strategy advice about ranking ønsker (with sources)

| # | Advice | Source |
|---|---|---|
| 3.1 | **Programme first, school last.** Decide studieforberedende vs yrkesfag, then programme (15 to choose from), then school; "where friends go" is a poor primary criterion. (Commercial guide; consistent with the official rule that the right is to a programme.) | S40 (low reliability); S5, S6 for the right |
| 3.2 | **You must register three different programmes in priority order for Vg1.** Fewer than three may lead to placement in a programme you did not apply for. | S6, S26 |
| 3.3 | **Put what you really want first.** The system works down the list: first ønske is examined first, then second, then the rest (Oslo wording). If you lack the points for the first, it follows your ranked list (ung.no rådgiver answer). Inference: ranking does not cost you chances at your first ønske, but the order is binding (next row). | S11, S25 |
| 3.4 | **The order is binding through the whole intake.** Do not list a school you would not actually go to (for example one needing relocation). | S5 |
| 3.5 | **You are guaranteed a place in one of your three programmes (for pupils with ungdomsrett), not a school.** If you miss the first, you are still "guaranteed" the second or third; you may be placed at a school you did not list. | S6, S20, S5, S14 |
| 3.6 | **Always include a realistic/safe option.** Rogaland's rådgiver handbook says to use all three programmes and up to three schools per programme. Their logic: a pupil who fails to get any listed school gets an offer in one of the three programmes at another school. Check this county's limits (see 3.11). | S5 |
| 3.7 | **Poenggrenser vary from year to year and are only indicative.** ung.no: you cannot know in advance; ask the inntakskontor for last year's line but it "can change quite a bit". A rådgiver page repeats that the line can vary much between years. | S20, S28 |
| 3.8 | **Points = snitt x 10** (for example 4.2 gives 42.0). All numeric final grades count, standpunkt and eksamen; elective subjects count as one grade (average if several); "Bestått/Deltatt" subjects and exempted subjects do not count; orden and oppførsel do not count. | S7, S8, S28, S32 |
| 3.9 | **Missing grades.** IM/IV without documentation counts as 0; documented absence from exam does not affect points. If more than half the subjects lack grades, apply for individuell behandling by 1 Feb. | S7, S8, S5 |
| 3.10 | **Fravær does not count in points directly.** The per-subject absence rules for getting a standpunktkarakter belong to vgs; do not tell 10. trinn pupils that absence lowers points. (From a search summary; verify with Udir before publishing.) | search summary: https://www.udir.no/eksamen-og-prover/dokumentasjon/vitnemal-og-kompetansebevis/foring-vitnemal-kompetansebevis-vgs/8-fravar/ |
| 3.11 | **County rules change what a "good" list looks like.** See table 3a below. Always ask which county the pupil lives in and how many ønsker it allows. | S14-S18, S39 |
| 3.12 | **You only win the highest ønske you qualify for; ventelister are for higher ønsker only.** If you get ønske 2, you can stay on the waiting list for ønske 1, but there is no waiting list for lower ønsker. | S5, S19 |
| 3.13 | **Accept the offer you get.** ung.no: declining the place you were actually offered risks having no school; accept the place and, if you want, also the waiting list for higher ønsker. | S19, S5, S14 |
| 3.14 | **What to do if you got a lower ønske you like / do not like.** Trøndelag: like it, accept and decline the waiting list; do not like it, accept the place and accept the waiting list, then check vigo at the 2. and 3. inntak. | S14 |
| 3.15 | **Think about travel time and life around the school.** (Commercial guide's "three years of 1.5 h each way" arithmetic; it is an illustration, not an official rule.) | S40 (low reliability) |
| 3.16 | **Grades matter more than the wish for completion.** SSB: first-wish fulfilment shows a link to completion, but grunnskolepoeng have a much stronger link; for vocational pupils, getting a læreplass matters most. The right message is "pick what fits you" not "the dream programme at any cost". | S30 |

**3a. County-specific admission models (as of the sources' dates, 2024-2026; dated pages may be out of date, re-check per year).**

| County | Model | Source |
|---|---|---|
| Oslo | Fritt skolevalg; evaluation in order of ønsker; ties decided by lottery (loddtrekning); own-school priority for some vg2/vg3 programmes; unfilled ønsker can lead to offer at a school not listed | S11 |
| Vestland | Eight inntaksområder; apply anywhere in the county but only schools in your area give area points (reported as 100 points); some programmes (for example sports, music/dance/drama) have no area points; 3 rounds before August | S16 (points figure from fetched summary; verify with the regulation) |
| Trøndelag | Nærskoleprinsipp (geographically directed) outside Trondheim; fritt skolevalg for Trondheim residents on grades; sports programmes county-wide; further changes planned from 2025-26 | S15, S14 |
| Rogaland | Open application; up to three schools per programme; applicants from other counties ranked behind own county's | S18, S5 |
| Akershus | Fritt skolevalg from 2024-25 within three regions (Asker/Bærum, Follo, Romerike); applicants prioritised to their region; as many schools per programme as you like | S17, S39 |
| Buskerud | Fritt skolevalg; three programmes and up to ten schools | S39 (search summary) |
| Østfold | Apply to any county school, prioritised to designated nærskole | S39 (search summary) |

Design consequence: "lokal tilhørighet" and "nærskole" are not one national rule. The app should surface the pupil's county model before showing whether a poenggrense is "reachable".

## 4. Common FAQs with short official answers

| Question | Answer | Source |
|---|---|---|
| When is the deadline? | 1 March for ordinary applications and læreplass (moves to the next working day when 1 March falls on a weekend; Oslo and Akershus quoted 2 March for 2026 while a school page said 1 March, so check the year); 1 Feb for fortrinnsrett, individuell behandling and minority-language individual processing | S12, S17, S9, S5 (Ris school page: https://ris.osloskolen.no/for-elever-og-foresatte/radgiver/soke-videregaende-opplaring/) |
| How many ønsker? | Three different programmes for Vg1 in priority order; number of schools per programme varies by county (3 in Rogaland, up to 6 in Oslo, up to 10 in Buskerud, unlimited in Akershus) | S6, S5, S17, S39 and Oslo page above |
| Can I change the application after the deadline? | Generally no; exceptions only for documented heavy medical, social or pedagogical reasons, and there is no right to complain if refused | S5 |
| Who sees my grades? | The final vitnemål from 10. trinn goes to the inntakskontor in June automatically | S26 |
| When do I hear back? | 1. inntak early July (Oslo 2026: results available Wednesday 1 July); Trøndelag: answer by 15 July; 2. inntak late July/August; a 3rd round in some counties; answer within about a week | S13, S14, S16, S19 |
| Do I have to answer? | Yes. Everyone must answer, including those who say no; no answer means you lose the place and waiting-list spot | S5, S19 |
| I got my first wish; what about the others? | The others are deleted automatically; you cannot decline the first ønske to get a lower one | S26, S19 |
| I got ønske 2 or 3 | Accept it; you may stay on the waiting list for higher ønsker; if a higher one opens, the lower offer lapses | S5, S19 |
| What if I do not get any wish? | For Vg1 you get an offer in one of your three programmes at another school | S5 |
| Can I complain about not getting a school? | No right to a specific school, so no complaint on placement; ordinary admission decisions and individual-accommodation decisions can be appealed within three weeks, in writing with reasons, even if you still must answer the offer within about a week | S5, S10, S14 |
| When must I show up? | First school day; missing it loses the place unless agreed with the school | S5, S12, S16 |
| What is fortrinnsrett? | Priority in intake for a small group: pupils who need a particular programme because of big support needs (with individually adapted instruction and an expert assessment), reduced functional ability, sign-language instruction; diagnosis alone does not give it | S9, S5 |
| What is individuell behandling? | Case-by-case admission, for example when more than half the grades are missing, serious functional drop with documentation, or foreign schooling; apply by 1 Feb; diagnosis alone is not enough | S5 |
| What are the paths to a fagbrev? | Typically 2 years in school + 2 years as lærling (2+2); læreplass is applied for in vigo by 1 March and also directly to companies; lærekandidat by 1 Feb; there is also praksisbrev; vocational pupils can take *påbygg* for general study competence | S5, https://www.vestlandfylke.no/utdanning-og-karriere/laerling/larling-og-larekandidat/ (search summary), https://www.vilbli.no/nb/no/a/hva-er-videregaende-opplaering-6 (search summary) |
| Can I change programme if I pick wrong? | Yes: you can apply for another programme after Vg1 or Vg2; unlimited changes up to the year you turn 19 (Rogaland handbook: changes up to the intake deadline in the year turning 19, then one more) | S12, S21, S5 |
| How did applicants do in 2025? | 94 % got an offer, 86 % their first-wish programme, about 4 % on waiting list, about 2 % no offer and no waiting list; lowest first-wish rates at Vg1 Håndverk/design (~65 %) and Elektro/IT (~66 %) | S31 |

## 5. Mistakes and misconceptions counsellors warn about

1. **Not answering, or saying no to the offer you actually got**, hoping to wait for a lower-ranked option. It is impossible to wait for a lower ønske, and pupils end up with no place [S5 section 1.6, S19].
2. **Declining the first wish to get the second.** The other ønsker disappear when you get the first; no waiting list for lower ones [S26, S19].
3. **Listing fewer than three programmes**, thinking a single dream ønske is enough. You may land in a programme you never applied for [S6].
4. **Listing a school you would never attend** (for example one that needs relocation) as a filler. The order is binding [S5].
5. **Treating last year's poenggrense as a fact.** It is indicative only [S20, S28].
6. **Believing a diagnosis or a bad year gives priority automatically.** It does not; it takes documentation and an application by 1 Feb, and rules are narrow [S5, S9].
7. **Missing the 1 Feb deadline** for fortrinnsrett or individuell behandling; it cannot be changed later [S5].
8. **Wrong contact info.** Wrong mobile number means the offer SMS and the answer deadline can be missed; contact details can be changed until 1 July [S5].
9. **Forgetting the first school day.** Place is lost [S5, S12].
10. **Assuming nærskole rules are national.** Your county's model decides what "close to home" gives you [S14-S17].
11. **Applying to a foreign-language-restricted school without prior language.** Some Rogaland schools only offer fremmedspråk nivå II, which can block study competence for pupils without a language from ungdomsskole [S5 section 4.1].
12. **Choosing by friends, or the dream school without checking programmes.** Commercial guide; lower reliability but matches the general rådgiver line "programme first" [S40].
13. **Parents choosing for the teen.** The pupil decides from age 15 [S27].
14. **Confusing answer and appeal deadlines.** Answer within about a week; complaint deadline is three weeks; you must do both to be safe [S10].
15. **Wrong grade inputs in a calculator.** IV/IM count as 0; Bestått/Deltatt and exempted subjects do not count; orden/oppførsel do not count; electives count as one [S7, S8, S32].

## 6. Boundaries and sensitive topics: what an automated assistant should defer

**Defer to the real rådgiver (or inntakskontor/PPT):**
- Anything about *fortrinnsrett* or *individuell behandling*: eligibility depends on vedtak om individuelt tilrettelagt opplæring, expert assessment from PPT, and documents via the school/municipality by 1 Oct (fortrinn) and 1 Feb [S5, S9, S21]. The app may explain what exists and the dates; it must not judge whether a named pupil qualifies.
- Special needs, sickness, bullying, school refusal (*skolevegring*), grades collapsing for serious reasons, a move ordered by barnevernet: these are the examples the handbook lists as individual cases [S5].
- Any appeal (*klage*) wording or chance of success: point to the inntakskontor and S10.
- County rule details that change by year: point to vilbli.no for the pupil's county and year [S6, S16].
- Career choice that depends on who the pupil is (interests, strengths): point to rådgiver, utdanningsvalg teacher, and free karriereveiledning.no (chat/phone, anonymous) [S33, S24].
- Wellbeing or safety signals. Not a matter the app should counsel on.

**Helplines for young people** (phone numbers and hours as stated on the cited pages on 30 Sept 2026; hours can change):

| Service | Number | Notes | Source |
|---|---|---|---|
| Alarmtelefonen for barn og unge | **116 111** (SMS 417 16 111, alarm@116111.no) | The child-welfare service's 24-hour phone line; free; anonymous; chat and SMS evenings | S36, S38 |
| Kors på halsen (Røde Kors) | **800 333 21** | For under 18; free and anonymous; usual hours 14:00-22:00 daily; chat/email at korspahalsen.no | S35, S38 |
| Mental Helse Hjelpetelefonen | **116 123** | Free, 24/7, anonymous, confidentiality; for anyone | S37, S38 |
| Ambulance | **113** | Medical emergencies (listed, not described, on S38) | S38 |
| Police | **112** | Emergencies (listed on S38; service description is general knowledge) | S38 |
| Legevakt | **116 117** | Out-of-hours medical help | S38 |
| Blå Kors chat centres | See page | Ages 9-19, 14:00-21:00, about bullying or mental health | S38 |

Suggested assistant behaviour: if a user writes anything suggesting self-harm, abuse, panic or being unsafe, stop the admissions topic, say it is taken seriously, offer 116 111 / 116 123 / Kors på halsen, and for acute danger 113 or 112, and encourage talking to a trusted adult or the rådgiver. No lecture, no diagnosis.

**Privacy.**
- Do not ask for name, fødselsnummer, address, exact grades per subject tied to an identity, diagnoses, parents' details, or school of a named pupil. The app only needs: county (or kommune), approximate snitt or points, and programmes of interest.
- Pupils aged 15+ control what is shared from school to school about grades, absence and special-education measures (consent required) [S27].
- MinID/BankID codes, PIN codes: never ask for them. Schools tell pupils to bring them to the appointment [S29].
- Users under 18 may be talking to the tool; keep tone simple and avoid collecting anything [inference].

## 7. Playbook: 16 rules for an AI assistant on a poenggrense/map app

1. **Open with the decision or number, detail only on request.** One sentence first (for example "Your points are 42.0; last year's line at X was 40.3"), then the caveat.
2. **Ask at most two scoping questions before advising:** which county and what the snitt is. Do not collect names, IDs, diagnoses or exact subject grades with identity [S27, S5].
3. **Programme before school.** Start "what do you want to study or work with?" then show schools. The legal right is to one of three programmes, not a school [S5, S6, S26].
4. **Explain the points formula in one line and show the arithmetic:** snitt of all numeric final grades (standpunkt + eksamen) x 10; valgfag as one; Bestått/Deltatt and fritak subjects excluded; orden/oppførsel excluded; missing IV/IM counts 0 [S7, S8].
5. **Never present a poenggrense as a cut-off the pupil will meet.** Always say it is the last admitted pupil in a past year, that it moves year to year, and show a range when several years exist [S20, S28, S5].
6. **Advise a ladder, not a single dream:** first ønske = what they really want; middle = a solid alternative; third = a realistic/safe option they would genuinely accept. Do not suggest listing schools they would not attend; the order is binding [S5, S3.3-3.6].
7. **Always ask the county and state its model** (fritt skolevalg, nærskole, inntaksområde, region priority, maximum schools per programme) before saying whether a school is reachable. Use the county table in section 3a as a checklist and link to vilbli.no for the year [S14-S18].
8. **Flag the three binding rules up front:** three different programmes; answer the offer; turn up on the first day [S6, S5, S12].
9. **Explain the waiting list correctly:** you can wait for higher ønsker only; accept the offered place while on the list; a higher offer cancels the lower one [S5, S19].
10. **Mention the alternatives that matter to families:** yrkesfag with lærling (2+2) and påbygg to general study competence; studieforberedende for direct higher education; a safe option at the end of the list [S5, S26, vilbli overview above]. Stay neutral on yrkesfag vs studiespesialisering; present both as valid routes.
11. **Keep first-wish anxiety proportional.** Facts: 86 % got their first-wish programme in 2025, 94 % got an offer; SSB finds grades matter more than wish for completion [S31, S30].
12. **Defer individual cases, every time they appear.** Fortrinnsrett, individuell behandling, special needs, missing grades, illness, or barnevern: give the general rule and the 1 Feb deadline, then say "ask your rådgiver and the inntakskontor", not "you qualify" [S5, S9].
13. **Defer the big personal question** ("what should I become?") to rådgiver, utdanningsvalg and karriereveiledning.no; offer to help compare options they name, not to choose for them [S24, S33].
14. **Respect who owns the choice.** With parents as users, say the pupil decides from age 15 and suggest talking with the pupil; do not coach a parent to override the teen [S27].
15. **Wellbeing guardrail.** On any crisis signal, drop the task and give 116 111, 116 123, Kors på halsen 800 333 21, and 113/112 for emergencies; encourage an adult or the rådgiver [S35-S38].
16. **Be honest about the data's age and limits.** Say which year's poenggrenser are shown, that county rules are re-checked on vilbli.no and the county site each year, that dates move (for example 1 March on a weekend moves the deadline; Oslo 2026 first-intake results were out 1 July while another Osloskolen page listed 6 July), and that the app does not make admission decisions [S13, S12, S17].

## Gaps and caveats

- No source was found that *quotes a rådgiver's own scripted questions* in a guidance session; section 2 steps 3-4 are synthesised from ung.no, karriereveiledning.no, the national survey and county handbooks. A follow-up interview with two or three ungdomsskole rådgivere is the best way to test it.
- The claim that ranking does not reduce chances at the first ønske is an inference from the published procedure (first ønske evaluated first), not a verbatim rådgiver quote. In counties with area points (Vestland) or regional priority (Akershus) the ranking interacts with which schools are in the pupil's area.
- Vestland's "100 area points" and Akershus/Østfold/Buskerud details came from fetched or search summaries; confirm against the lokal forskrift on Lovdata before the app encodes them.
- The new opplæringslov's exact text for § 16-1/§ 16-2 was not retrievable in full; only the titles are confirmed from Lovdata's table of contents [S3].
- Several dates differ between pages (Oslo first intake, Akershus deadline 2 March vs a school page's 1 March); the app should fetch dates from vilbli.no per year rather than hard-code.
