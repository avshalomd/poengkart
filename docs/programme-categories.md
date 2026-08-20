# How programmes are sorted into categories

The map's filter is a list of *utdanningsprogram* — the national programmes a
Norwegian pupil applies to. Every threshold in the dataset belongs to a
programme, and every programme has to be assigned to one of them. This is the
record of how that assignment is made, why it is made that way, and what to do
when a source arrives with a name nothing recognises.

Code: [`tools/taxonomy.py`](../tools/taxonomy.py). Tests: the taxonomy block at
the end of [`tools/test_parse.py`](../tools/test_parse.py).

## The categories are Udir's, not ours

Programme structure in Norway is national. Counties differ only in how they
spell things — `Teknologi- og industrifag`, `Teknologi-/industrifag, YSK 4år`
and `Teknolog og idustrifag` are one programme, and all three appear in these
PDFs — but the structure underneath is identical in Rogaland and Trøndelag.

It is published in **Grep**, Udir's curriculum register:

| Endpoint | What it holds |
| --- | --- |
| [`/kl06/v201906/utdanningsprogram`](https://data.udir.no/kl06/v201906/utdanningsprogram) | 18 programme codes — 15 in force, 3 discontinued in the 2020 reform |
| [`/kl06/v201906/programomraader`](https://data.udir.no/kl06/v201906/programomraader) | 497 programme areas, each with Bokmål and Nynorsk names and, for most, an official English title |

`tools/fetch_grep.py` caches the second as `tools/grep-programomraader.json`.
A Grep code carries its utdanningsprogram in its first two letters:

```
BABAT1----   BA = Bygg- og anleggsteknikk, area BAT, first year
ELAVI3----   EL = Elektro og datateknologi, avionics, third year
```

So resolving a county's label to any Grep code answers the category question,
and the category keys in `web/data/schools.json` are the register's own codes:
`ST`, `ID`, `MD`, `KD`, `MK`, `BA`, `EL`, `FD`, `HS`, `DT`, `IM`, `NA`, `RM`,
`SR`, `TP`, plus `PB` for påbygging.

Påbygging is not an utdanningsprogram — it is the year a vocational pupil takes
to reach university admission — but it is something a pupil chooses, so it gets
a filter of its own.

[vilbli.no](https://vilbli.no) presents the same structure in the words
families use. It is a good check on wording, not a second taxonomy.

## What this replaced, and why

Until August 2026 the categories came from an ordered list of about a hundred
keywords in `tools/common.py`; the first bucket whose substring appeared
anywhere in the name won. It was a reasonable approximation and it filed 224 of
244 names correctly. The three things that went wrong with it are worth
recording, because they are what any keyword scheme will do again:

**Substrings match inside words they were never meant to touch.** The food
programme claimed `ernæring`, and "Landbruk og gartn*ernæring*" — an
agriculture programme — contains those letters. Thirteen series were filed
under Restaurant- og matfag.

**Order silently decides ties.** `anleggsgartner` appeared in both the building
and the agriculture list, and building was checked first, so it always won.
The same for `toppidrett` beating `studiespesialisering`, while
`helse` was checked before `toppidrett` — so "Helse og oppvekstfag, toppidrett"
landed in health and "Studiespesialisering, toppidrett" landed in sport. Two
programmes with the same suffix, treated differently, for no reason a reader
could see.

**A hand-written list drifts from the standard it approximates.** The list had
fifteen buckets where the register has sixteen: the two crafts programmes were
collapsed into one, and a second, older copy of the whole table was still
sitting in `tools/parse_pdfs.py`, no longer matching the first.

Twenty names moved when the register took over — 37 of 2 090 series. Four were
errors under any reading of the structure; the rest were the reform and the
toppidrett question below.

## How a name is resolved

`taxonomy.resolve(name)` returns `(category, grep_code, how)`. The steps run in
order, most trustworthy first, and `how` records which one answered so a
reviewer can tell an exact hit from a guess.

1. **Påbygging** is recognised by keyword. Its county spellings ("Påbygg. gen.
   studiekomp. etter yrkeskomp") share almost nothing with the register's own
   title, and there is only one thing they can mean.
2. **Normalise** — case, punctuation, the `Vg1`, and the suffixes counties bolt
   on: `SK 3 år`, `YSK 4 år`, `landslinje`, `LAL`. None of these change which
   programme a row is.
3. **Exact match** against every Bokmål and Nynorsk name in the register.
4. **Comma prefixes**, longest first. "Studiespesialisering, toppidrett" is
   Studiespesialisering with a subject bolted on.
5. **Close match** above 0.84 similarity, which catches the counties' own
   typos ("Teknolog og idustrifag", "Eletro og datateknologi").
6. **Contained name** — a register title sitting inside a longer county label,
   longest match wins.
7. **`ALIASES`** — eighteen hand-written entries, each one either a pre-2020
   name the register renamed in place ("Elektrofag", "Teknikk og industriell
   produksjon") or a county truncation ("Elenergi", "Kulde-, varmepumpe-,
   vent.tekn").

Where a name matches both a live code and a discontinued one — "Transport og
logistikk" is `SSTRL2` and `TPTOL2`, blacksmithing is `DHSME2` and `DTSME2` —
the live one wins.

## The five decisions

These are the places the register does not decide for us. All five were put to
the project owner as a written proposal on 20 August 2026 and approved as
recommended.

### 1. The crafts bucket is split in two

`FD` (Frisør, blomster, interiør og eksponeringsdesign, 59 series) and `DT`
(Håndverk, design og produktutvikling, 21) are separate national programmes and
are now separate filters. They shared a Vg1 in name only: one leads to
hairdressing and floristry, the other to boatbuilding, goldsmithing and sewing.

### 2. Elite sport inside general studies is general studies

Twelve series across four names — "Studiespesialisering, toppidrett", "Realfag,
toppidrett" and so on. These pupils are enrolled in general studies and take
elite sport as a subject; the register is unambiguous and all toppidrett
variants now behave the same way. The cost is real and was accepted: a teenager
searching for elite sport will not find them under Idrettsfag.

### 3. Everything is filed under today's structure

The dataset spans 2017–2026 and the 2020 reform lands in the middle. Trades
moved: anleggsgartner from building to agriculture, transport og logistikk from
service to industry, IKT-servicefag from service to IT. A family reading the
map in 2026 thinks in today's terms, and a filter that hides a school's older
years because a trade was reclassified is worse than one that shows the history
together.

The split programmes cannot be handled wholesale — Service og samferdsel went
three separate ways — so successors are recorded per programme area in
`SUCCESSOR_BY_CODE`, with an utdanningsprogram-level fallback in
`SUCCESSOR_BY_PROGRAM`.

### 4. "Design og håndverk" goes to FD

Five series at five schools, 2018–2021 — the Vg1 that split into the two crafts
programmes. Nothing in the name can say which half it became. The evidence used
was what those schools published afterwards: three went on to offer only
hairdressing and interior areas, one offers both, one neither. The larger
successor takes it. Its *areas* answer for themselves and are mapped
individually: interiør and utstillingsdesign to FD, design og tekstil to DT.

### 5. Udir's English, lightly edited

Two edits, no more. The register drifts between title case ("Building and
Construction") and sentence case ("Electrical engineering and computer
technology") from one entry to the next; `_title()` normalises the first letter
of each word and leaves the rest alone, so an initialism keeps its shape — ICT
stays ICT. And påbygging's official English runs to 82 characters, unusable in
a row that also carries a school name and a number, so it is shortened to
"Supplementary year for general university admission".

Everything else is Udir's wording as published. 224 of the 244 names carry an
official English title, covering 94% of the series. The other twenty are
pre-2020 names, county shorthands, and one programme too new to have been
translated (Dronefag); they are written out in `BASE_EN`.

County suffixes are translated separately and appended, so "Helse- og
oppvekstfag, SK 3 år" becomes "Healthcare, Childhood and Youth Development,
3-year academic track". Music, dance and drama is written out by hand, because
its variants name the discipline chosen *inside* the programme rather than an
addition to it: "Musikk, dans og drama, dans" is "Music, Dance and Drama —
dance", not a list.

## Runbook: a new source, or a name nothing recognises

Run the tests. They fail with the offending names printed:

```bash
.venv/bin/python3 tools/test_parse.py
```

For each unresolved name, in this order:

1. **Look it up** in [programområder](https://data.udir.no/kl06/v201906/programomraader)
   or on [vilbli.no](https://vilbli.no). The county nearly always means a real
   programme area and has abbreviated or misspelled it.
2. **If it is a truncation or a typo**, add it to `ALIASES` with the two-letter
   code. This is the normal case, and the entry should say which register name
   it is short for.
3. **If the programme was discontinued** before the register's current edition,
   add its successor to `SUCCESSOR_BY_CODE` with a comment recording what
   happened to it. Do not guess at the utdanningsprogram level unless the whole
   programme moved intact.
4. **If none of that applies**, the source may be offering something genuinely
   new, and a new category is a product decision rather than a parsing one.

Never add a keyword. The reason this module exists is that keywords match
substrings of words they were never meant to touch.

To check the register itself has not moved on:

```bash
.venv/bin/python3 tools/fetch_grep.py     # re-download; the file is committed
git diff tools/grep-programomraader.json  # what Udir changed
```

## Verifying a change

```bash
.venv/bin/python3 tools/refresh.py        # full pipeline, ending in the tests
```

The taxonomy tests assert that every name resolves, that every category is one
Udir publishes, that every programme has an English name, and that the four
original misclassifications stay fixed — one per failure mode, so a regression
names its own cause.
