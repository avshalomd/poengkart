# Sources

The county publications every figure in Poengkart is read from, kept here so
that `.venv/bin/python3 tools/refresh.py` rebuilds the dataset from a clone
with nothing else on disk. Each extractor under `tools/extractors/` reads its
county's folder; `tools/parse_pdfs.py` reads `rogaland/`. Nothing here is
edited by hand: a file is either the county's own document or an extract the
county sent, its content untouched. Document metadata (the author and
last-modified-by fields of the Excel extracts and of the PDFs released on
request, which named individual officials) has been stripped; nothing else.

Public records of the fylkeskommuner, reproduced for reproducibility; data
derived from them is published under NLOD 2.0.

## akershus

`akershus-2025-2026.html` is the county's poenggrenser page for 2025/26
(<https://afk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/poenggrenser.222835.aspx>),
58 HTML tables with 1. and 2. inntak side by side; the page is overwritten
every year. `Karaktergrense 2024-2025.xlsx` and
`Nedre_poenggrense_Vg1_2026-2027_Akershus_2.inntak.xlsx` were never published:
the county sent them by e-mail on request (asked 25.08.2026, received
27.08.2026; no case number) as school × programme grids of the 2. inntak thresholds, same 34
schools and cell legend as the HTML page.

## buskerud

`buskerud-2024-2025.html` and `buskerud-2025-2026.html` are the county's
poenggrenser page for each year
(<https://bfk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/>),
one wide school × programme matrix, Vg1, no intake round stated; the page is
overwritten in place, so each year's copy was saved when it was live.

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

## mro

`Inntakspoeng_vg1_siste15ar.xlsx` is the tidy extract behind the county's
Power BI dashboard (<https://mrfylke.no/utdanning-og-karriere/statistikk-og-analyser>),
whose Publish-to-Web mode offers no download: sent by e-mail on request (asked
25.08.2026, received 01.09.2026; no case number), one row
per (school year, school, programme) with the Grep kurskode, the lower
threshold and the admitted mean, Vg1, 2012/13 onwards, 2. inntak.

## oslo

`oslo-2017.pdf` through `oslo-2025.pdf` are the yearly poengtabeller
(<https://www.oslo.kommune.no/skole-og-utdanning/videregaende-skole/soke-videregaende-skole/poengtabeller-for-videregaende-skoler-i-oslo/>),
wide PDFs with one table per municipal school, Vg1, after 1. inntak;
`oslo-2026.html` is the same publication as the HTML page it became in 2026.
`oslo-2009-2inntak.pdf` is the one older edition recovered through the
Wayback Machine.

## rogaland

`poenggrenser-rogaland-2019-2020.pdf`, `-2021-2022.pdf`, `-2022-2023.pdf`,
`-2023-2024.pdf` and `-2023-2025-official.pdf` are the rolling multi-year
matrices the county publishes through vilbli
(<https://www.vilbli.no/nb/rogaland/a/poengsum-og-karakterer-6>), 2. inntak;
each edition reprints the previous years, so five documents cover 2018–2025.
`poenggrenser-rogaland-2022-2024-wayback.pdf` is an edition that had already
been overwritten, recovered through the Wayback Machine.

## trondelag

`trondelag_2025-26_<region>.pdf`, one per inntaksregion (Fosen,
Innherred/Værnes, Namdal, Trøndelag sør, Trondheim), are the county's
poenggrenser tables published through vilbli
(<https://www.vilbli.no/nb/trondelag/a/poengsum-og-karakterer-6>), Vg1,
columns keyed by Grep code, no intake round stated.

## vestland

`vestland_<year>_1inntak.pdf` and `_3inntak.pdf` for 2020/21 through 2026/27
are the county's poenggrenser PDFs for 1. and 3. inntaksomgang
(<https://www.vestlandfylke.no/utdanning-og-karriere/elev/soknad-inntak/test-poenggrenser/>),
Vg1. `hordaland_2018_1inntak_bergen-st.pdf` and
`hordaland_2019_1inntak_bergen-st.pdf` are Hordaland fylkeskommune's two press
releases on Vg1 studiespesialisering in the Bergen area, each printing the
previous year's figure beside the current one, which is where 2017–2019 come
from.
