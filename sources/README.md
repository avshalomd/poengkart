# Sources

The county publications every figure in Poengkart is read from, kept here so
that `.venv/bin/python3 tools/refresh.py` rebuilds the dataset from a clone
with nothing else on disk. Each extractor under `tools/extractors/` reads its
county's folder; `tools/parse_pdfs.py` reads `rogaland/`. Nothing here is
edited by hand: a file is either the county's own document or an extract the
county sent, its content untouched. Document metadata (author, last-modified-by
and author e-mail fields, which named individual officials) has been stripped
from every file here; nothing else.

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

`vestland_<year>_1inntak.pdf` and `_3inntak.pdf` are the county's poenggrenser
PDFs for 1. and 3. inntak: both rounds for 2020/21, 2024/25, 2025/26 and
2026/27, 1. inntak only for 2021/22 and 2022/23, 3. inntak only for 2023/24
(eleven files; the county's page no longer offers the others)
(<https://www.vestlandfylke.no/utdanning-og-karriere/elev/soknad-inntak/test-poenggrenser/>),
Vg1. `hordaland_2018_1inntak_bergen-st.pdf` and
`hordaland_2019_1inntak_bergen-st.pdf` are Hordaland fylkeskommune's two press
releases on Vg1 studiespesialisering in the Bergen area, each printing the
previous year's figure beside the current one, which is where 2017–2019 come
from.

## Mirror

Every file here is mirrored, byte for byte, in a public Cloudflare R2 bucket:
<https://pub-c369d56420af4a86b26b83c79c442355.r2.dev/> plus the path in
`manifest.json` (for example `…/innlandet/innlandet-2021-2022-mottatt-innsyn.pdf`).
`manifest.json` lists each file with its size, SHA-256 and provenance;
`tools/sources_manifest.py --check` verifies the folder against it and
`tools/sources_r2.py fetch` restores any missing file from the bucket, so a
clone without this folder still rebuilds. Objects in the bucket are never
overwritten: a corrected document gets a new name and a new manifest entry.
