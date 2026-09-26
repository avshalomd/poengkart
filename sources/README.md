# Sources

The county publications every figure in Poengkart is read from, kept here so
that `.venv/bin/python3 tools/refresh.py` rebuilds the dataset from a clone
with nothing else on disk. Each extractor under `tools/extractors/` reads its
county's folder; `tools/parse_pdfs.py` reads `rogaland/`. Nothing here is
edited by hand: a file is either the county's own document or an extract the
county sent, its content untouched. Document metadata (author, last-modified-by
and author e-mail fields, which named individual officials) has been stripped
from the files the counties released on request; nothing else. A document the
county published itself is kept byte for byte, metadata included, so its hash
matches the copy still online or in the Wayback Machine.

Where a county's own document is lost, its figures are read from a copy
printed elsewhere: a newspaper fact box, a thesis appendix, docplayer.me's
text of the county's PDF. Those copies are transcribed by hand into
`*.transcribed.csv` (or kept as page text in `*.transcript.txt`); each
file's `#` header names the document, where it was reprinted, the intake
round as the source states it (quoted), the legend, and who transcribed and
checked it. The extractors flag their rows as reprints, `build_dataset.py`
records the years that rest on them (`reprint_years`), and the app says so
beside those years. A round the copy does not state stays unstated.

Public records of the fylkeskommuner, reproduced for reproducibility; data
derived from them is published under NLOD 2.0.

## agder

Agder publishes no poenggrenser. Two counsellor-meeting decks from the county's
intake office print them:
`agder-2020-2021-radgiversamling-010921-evaluering-av-arets-inntak.pdf`
(«Evaluering av årets inntak», rådgiversamling 1.9.2021, slides 14–18, 2020 and
2021; the county's copy on agderfk.no now returns 404, so this is the Wayback
capture of 03.03.2022) and
`aust-agder-2016-2017-radgiversamling-081217-elevinntak.pdf` (Aust-Agder,
«Elevinntak», rådgiversamling 8.12.2017, slide 8, 2016 and 2017, still served
by agderfk.pameldingssystem.no). The 2016–17 figures are plain karakterpoeng.
The 2020–21 figures carry the county's priority tier as a hundreds offset
(800, 700, …): the extractor reads the value modulo 100 as the points and a
remainder of 0 as «ingen venteliste», a rule deduced from the decks, not one
the county states (`META['note']`). A cell printing two tiers («A/B», 35 cells,
all 2020) is left out by default (`AGDER_TWO_TIER` in the extractor). Neither
deck states the intake round.

## akershus

`akershus-2025-2026.html` is the county's poenggrenser page for 2025/26
(<https://afk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/poenggrenser.222835.aspx>),
58 HTML tables with 1. and 2. inntak side by side; the page is overwritten
every year. `Karaktergrense 2024-2025.xlsx` and
`Nedre_poenggrense_Vg1_2026-2027_Akershus_2.inntak.xlsx` were never published:
the county sent them by e-mail on request (asked 25.08.2026, received
27.08.2026; no case number) as school × programme grids of the 2. inntak thresholds, same 34
schools and cell legend as the HTML page.
`akershus-2015-reprint-budstikka.transcribed.csv` is the county's 2015 Vg1
studiespesialisering figures after 1. inntak for the Asker and Bærum schools,
as Budstikka printed them on 23.02.2016 (fact box «Kilde: Akershus
fylkeskommune»); the county published no table that year.

## buskerud

`buskerud-2024-2025.html` and `buskerud-2025-2026.html` are the county's
poenggrenser page for each year
(<https://bfk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/>),
one wide school × programme matrix, Vg1, no intake round stated; the page is
overwritten in place, so each year's copy was saved when it was live.
`buskerud-statistikkhefte-inntak-2012-2013.pdf`, `-2013-2014.pdf` and
`-2014-2015.pdf` are the county's yearly «Statistikkhefte – inntak til
videregående opplæring», whose chapter 4 prints the Vg1 nedre poenggrense for
1. inntak («hovedinntaket» in the later two). The table is a scanned image, so
it is read from `buskerud-<year>-1inntak.transcribed.csv`, transcribed twice
independently and checked cell by cell. These are the only Buskerud years
whose round the county states.

## innlandet

`innlandet_2023-2025_2inntak.pdf` and `innlandet-2024-2026-2inntak.pdf` are
the rolling three-year matrices the county publishes through vilbli
(<https://www.vilbli.no/nb/innlandet/a/poengsum-og-karakterer-6>), 2. inntak.
`innlandet-2020-21-mottatt-innsyn.pdf` and
`innlandet-2021-2022-mottatt-innsyn.pdf` were never published: they were
released under innsynskrav, case 2026/1-152, 26.08.2026, in two one-off layouts.
The county's reply letter, which also confirms that nothing older survives on
either the Hedmark or the Oppland side, names its officials and is kept
privately (`docs/private/`), not here.
`innlandet-2026-sokere-og-inntatte-per-skole-og-programomrade.pdf` and
`innlandet-2026-sum-sokere-og-inntatte-per-skole.pdf` are the county's 2026
applicant and admission counts, kept beside the thresholds for context; the
extractor reads only the files it lists and ignores these.
`hedmark-poenggrense-<first>-<last>.transcript.txt` (six editions, 2008–2012
to 2014–2018) are Hedmark fylkeskommune's rolling five-year tables
«Poenggrense ved inntak til videregående skoler i Hedmark», 2. inntak (stated:
«den sist inntatte med ungdomsrett ved 2. inntaket»), Vg1 and Vg2. The PDFs are
not online; each file is docplayer.me's page text of one edition. The county
printed a grade average to one decimal, so a figure is ×10 in the dataset;
«ledig» is «ingen venteliste» and «lagt ned» a discontinued programme. Figures
before 2012 are read but left out of the dataset.

## mro

`Inntakspoeng_vg1_siste15ar.xlsx` is the tidy extract behind the county's
Power BI dashboard (<https://app.powerbi.com/view?r=eyJrIjoiNjk4M2E1M2YtYWNmYi00ODU1LTg2ZGQtNjM5YmU1NzJmOTM4IiwidCI6ImI5MzJlY2U3LTljZGYtNGQ5NC1iNGMxLTE1MjU2ZTQzYzdlYSIsImMiOjl9>,
embedded in the county's poenggrenser page, which moved during 2026; the
Wayback Machine holds a copy of 11.06.2026), whose Publish-to-Web mode
offers no download: sent by e-mail on request (asked 25.08.2026, received
01.09.2026; no case number), one row per (school year, school, programme)
with the Grep kurskode, the lower threshold and the admitted mean, Vg1,
2012/13 onwards, 2. inntak (confirmed by the county on 01.09.2026).

The file carries a number for every offered programme, down to 5.7; the
dashboard does not. Its page "Vg1 Nedre karaktergrense" masks every figure
under 25 with `*` and legends it «Ruter markert med * betyr at alle kom inn,
eller at laveste karakter var under 25.» The extractor applies that rule
(a figure under 25 becomes «ingen venteliste»), so the dataset shows what
the county publishes; the county confirmed the reading on 03.09.2026 and
may link capacity data during 2027, which would replace the rule with the
observed state.

## nordland

Nordland publishes no poenggrenser today. Its yearly statistics books printed
them: `nordland-statistikkhefte-2013-2014.pdf` and
`nordland-statistikkhefte-2014-2015.pdf` (chapter 4, «Oversikt over nedre
poenggrense … etter 2. gangs inntak», Vg1–Vg3, Wayback copies of the nfk.no
files) and `nordland-statistikk-2021.pdf` («Videregående opplæring –
Statistikk 2021», the lowest admission points for 2019, 2020 and 2021; the
nfk.no file now answers 404, so this is its Wayback copy).
`nordland-poenggrense-2015.transcript.txt` is the 2015 chapter as
docplayer.me's page text (captured by the Wayback Machine in 2017); the
county's own 2015 file is not online. The 2013–15 figures include the
800-point county supplement («Fylkestillegget er 800 poeng») and are
published as printed − 800, except landslinjer, which carry no supplement;
«ALLE» is «ingen venteliste». 2013–15 are 2. inntak as stated; the 2021 book
states no round. Its «0,0» cells have no legend and are published as 0
(`NORDLAND_ZERO` in the extractor); «-» (fewer than five admitted) is left
out.

## oslo

`oslo-2017.pdf` through `oslo-2025.pdf` are the yearly poengtabeller
(<https://www.oslo.kommune.no/skole-og-utdanning/videregaende-skole/soke-videregaende-skole/poengtabeller-for-videregaende-skoler-i-oslo/>),
wide PDFs with one table per municipal school, Vg1, after 1. inntak;
`oslo-2026.html` is the same publication as the HTML page it became in 2026.
`oslo-2015.pdf` is the 2015/16 edition of the same table, in the same
layout, which survives on a school's own site
(<https://ris.osloskolen.no/siteassets/dokumenter-til-lenking/2015--nedre-poenggrense-1--inntak-vg11.pdf>);
2016 has not been found. `oslo-2009-2inntak.pdf` is the one older edition
recovered through the Wayback Machine.
`oslo-2014.pdf` is the 2014/15 edition, recovered the same way.
Three more years are read from copies: `oslo-2012-reprint-andresen2014.transcribed.csv`
(the county's 2012 table as an image in a 2014 University of Oslo master's
thesis, appendix 1A), `oslo-2013-reprint-aftenposten.transcribed.csv`
(Aftenposten 03.07.2013, Vg1 studiespesialisering) and
`oslo-2016-reprint-nab.transcribed.csv` (Nordre Aker Budstikke 06.07.2016,
Vg1 studiespesialisering), all 1. inntak as stated.

## rogaland

`poenggrenser-rogaland-2019-2020.pdf`, `-2021-2022.pdf`, `-2022-2023.pdf`,
`-2023-2024.pdf`, `-2023-2025-official.pdf` and `-2024-2026-official.pdf` are
the rolling multi-year matrices the county publishes through vilbli
(<https://www.vilbli.no/nb/rogaland/a/poengsum-og-karakterer-6>), 2. inntak;
each edition reprints the previous years, so six documents cover 2018–2026.
The 2024–2026 edition (`Poenggrenser 2024-2026.pdf` on vilbli, dated
07.09.2026, fetched 08.09.2026) replaced the 2023–2025 file at the same
attachment id; both are kept because a superseded edition can still hold
the only print of a cell.
`poenggrenser-rogaland-2024-2026-official-rev2.pdf` is the same edition as
the county reissued it at that id (dated 21.09.2026, fetched 23.09.2026): it
adds one 2026 figure, Øksnevad's Vg1 Naturbruk dyrekunnskap SK 3 år, 37,1,
and every other page's text is unchanged.
`poenggrenser-rogaland-2022-2024-wayback.pdf` is an edition that had already
been overwritten, recovered through the Wayback Machine; it is the only
print of eight 2024 cells, and it is read like the others (since 23.09.2026).
One printed cell is corrected in the extractor rather than read as printed:
the 2024–2026 edition gives Bergeland's Vg2 Medier og kommunikasjon «3,0» for
2026, and the county answered a query on 23.09.2026 that it should read
«ingen venteliste» (there were free places). The answer came by e-mail from
the county's intake section; `COUNTY_CORRECTIONS` in
`tools/extractors/rogaland.py` quotes it.

`31skoler-v3-2016-01-25-wayback.json` is the data file behind the county's
«31 skoler» school portal as the Wayback Machine captured it on 25.01.2016:
per school and programme, the lowest points admitted at the previous intake
(2015), Vg1–Vg3. It states no intake round. A limit of 10 is the portal's
«everyone got in»; a limit of 0 carries no figure and is skipped.
`rogaland-2011-2012-reprint-aftenbladet.transcribed.csv` is the county's
figures after 1. inntak 2011 and 2012 for Stavanger-area schools, as
Stavanger Aftenblad printed them on 17.07.2012; 2011 is before the dataset's
first year and is left out.

`rogaland-2017-1inntak-rogfk-commoncrawl.html` is the county's own news
article «Musikk, dans og drama krever toppkarakterer» (6 July 2017, updated
12 July), as Common Crawl captured it on 20.07.2017 (CC-MAIN-2017-30; the
WARC record is named in `manifest.json`), the HTTP body byte for byte. The
county's site no longer serves it, and the Wayback Machine never captured it.
It states the round: «1. fellesinntak til videregående skole for skoleåret
2017/2018». Its table, «Eksempler på programområder med stort antall søkere
og lange ventelister» (examples of programme areas with many applicants and
long waiting lists), gives 57 figures, Vg1–Vg3, headed «Lavest poengsum for
inntak» (lowest points admitted): a selection, not the county's table, so
2017 is a partial year. The 2013 counterpart, «Programområder med lange
ventelister 040713.pdf», is linked from the county's article of 4 July 2013
but is held by neither the Wayback Machine nor Common Crawl.

## telemark

`laveste-inntakspoeng-vg1-2024-2026.xlsx` was never published: the county
sent it by e-mail on request (asked 01.09.2026, received 17.09.2026; no
case number), «Laveste inntakspoeng – siste 3 år», one sheet per school
year (2024/25–2026/27), one row per (school, Vg1 programme) with the
inntaksregion, the county's school number, the vigo programområdekode, the
number of places («Plasser») and «Laveste karakterpoeng», the lowest grade
points among those admitted — the county's own «lavest inntatt», which is
not read here as a poenggrense: without a fill state the figure may be a
real cutoff or a programme where everyone got in. Every offered programme carries a number, down to
10,0; the file has no marker for «everyone got in», so the dataset has no
fill state for Telemark. «Laveste totalpoeng» (2026/27 only) is another
applicant's ordering points, in most rows karakterpoeng + 300, and is not
read until the county has explained it. The intake round is not stated;
both were asked on 17.09.2026. Document metadata was stripped as for
every file here.

## trondelag

`trondelag_2025-26_<region>.pdf`, one per inntaksregion (Fosen,
Innherred/Værnes, Namdal, Trøndelag sør, Trondheim), are the county's
poenggrenser tables published through vilbli
(<https://www.vilbli.no/nb/trondelag/a/poengsum-og-karakterer-6>), Vg1,
columns keyed by Grep code, no intake round stated.
`trondelag_2024-25_trondheim_2inntak.pdf` is the 2024/25 table for the
Trondheim region, published through vilbli, which does state its round
(«ved 2. inntaket»); it is an image-only PDF, read from
`trondelag_2024-25_trondheim_2inntak.transcribed.csv`.

## vestland

`vestland_<year>_1inntak.pdf` and `_3inntak.pdf` are the county's poenggrenser
PDFs for 1. and 3. inntak
(<https://www.vestlandfylke.no/utdanning-og-karriere/elev/soknad-inntak/test-poenggrenser/>):
both rounds for every year from 2020/21 to 2026/27 except 2021/22, which has
1. inntak only. The 2022/23 3. inntak and 2023/24 1. inntak files are no
longer linked from the county's page but are still served from its site
(recovered 5 September 2026). `vestland_2026-27_3inntak-rev2.pdf` is the
county's corrected reprint of 28 August 2026 (one cell, Langhaugen musikk
54,6 for 45,6); the first print is kept beside it because mirrored objects
are never overwritten, and the extractor reads the highest revision.

`hordaland_2018_1inntak_bergen-st.pdf` and `hordaland_2019_1inntak_bergen-st.pdf`
are Hordaland fylkeskommune's two press releases on Vg1 studiespesialisering
in the Bergen area, 1. inntak, each printing the previous year's figure
beside the current one, which is where 2017–2019 first-round figures come
from. `hordaland_2017-2019_3inntak_vg1-vg3.pdf` is the county's full
3. inntak table for the same three years, Vg1–Vg3, every public school, keyed
by programområdekode, still hosted by Vestland fylkeskommune
(<https://www.vestlandfylke.no/globalassets/utdanning-og-karriere/elev/inntak/nedre-karaktergrense-vg1-vg2-vg3-tidlegare-hordaland.pdf>);
its cells sit beside the series as `values_r3`.
`sogn-og-fjordane_2018-2019_1inntak_vg1.pdf` is Sogn og Fjordane
fylkeskommune's 1. inntak Vg1 table for 2018/19 and 2019/20, from the same
host (<https://www.vestlandfylke.no/globalassets/utdanning-og-karriere/elev/inntak/nedre-karaktergrense-vg1-tidlegare-sogn-og-fjordane.pdf>).
`hordaland_2016_1inntak_bergen-st.pdf` is the 2016 press release in the same
series as the 2018 and 2019 ones (Wayback capture of 07.08.2016 of
hordaland.no/globalassets/for-hfk/pdf-til-nyheiter/nedrepoengrense-.pdf). It
does not number its round; Utdanningsnytt 15.07.2016 prints two of its
figures and states that they are «etter første inntak». The 2014 and 2015 figures come from
newspaper copies of the county's lists: `hordaland-2014-reprint-bt.transcribed.csv`
(Bergens Tidende 08.07.2014) and `hordaland-2015-reprint-ba.transcribed.csv`
(Bergensavisen 07.07.2015), Vg1 studiespesialisering, 1. inntak.

## Mirror

Every file here is mirrored, byte for byte, in a public Cloudflare R2 bucket:
<https://pub-c369d56420af4a86b26b83c79c442355.r2.dev/> plus the path in
`manifest.json` (for example `…/innlandet/innlandet-2021-2022-mottatt-innsyn.pdf`).
`manifest.json` lists each file with its size, SHA-256 and provenance;
`tools/sources_manifest.py --check` verifies the folder against it and
`tools/sources_r2.py fetch` restores any missing file from the bucket, so a
clone without this folder still rebuilds. Objects in the bucket are never
overwritten: a corrected document gets a new name and a new manifest entry.
