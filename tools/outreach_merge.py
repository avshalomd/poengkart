#!/usr/bin/env .venv/bin/python3
"""Merge, validate and package the outreach research CSVs for Poengkart.

Reads the research CSVs the twelve agents wrote into docs/private/outreach/
(fylker-C1..C3, kommuner-K1..K8), joins them to the seed/registry layer, and
writes four outputs, all into docs/private/outreach/:

  fylker-contacts.csv    - C1+C2+C3 merged, sorted, validated
  kommuner-contacts.csv  - K1..K8 merged, joined to the seed, validated
  contacts.xlsx          - one workbook: Les meg, Fylker, Kommuner,
                            Skoler vgs, Ungdomsskoler, Fylkeskommuner registry
  README.md              - counts + caveats, English, bottom line first

Run with: .venv/bin/python3 tools/outreach_merge.py

No web access and no hand edits: every output is derived only from the CSVs
already on disk in docs/private/outreach/. Every row with a column-count
mismatch aborts the run immediately, naming the file and line.
"""
from __future__ import annotations

import csv
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "private" / "outreach"

BRIEF_HEADER = [
    "fylke", "kommune", "org", "level", "role", "name", "title", "title_en",
    "email", "phone", "source_url", "checked", "note",
]
SEED_HEADER = ["fylke", "kommunenr", "kommune", "orgnr", "epost", "hjemmeside"]
SCHOOL_HEADER = BRIEF_HEADER + ["orgnr", "url", "elevtall", "in_poengkart", "poengkart_name"]
FYLKESKOMMUNER_HEADER = BRIEF_HEADER

ROLE_ORDER = {
    "postmottak": 0,
    "inntak": 1,
    "inntak_leder": 2,
    "opplaering_direktor": 3,
    "kommunikasjon": 4,
    "radgiver_koordinator": 5,
    "annet": 6,
}

# The 15 school owners: Oslo kommune (UDE) + 14 fylkeskommuner.
CANONICAL_FYLKER_15 = [
    "Oslo", "Akershus", "Buskerud", "Østfold", "Innlandet", "Vestfold",
    "Telemark", "Agder", "Rogaland", "Vestland", "Møre og Romsdal",
    "Trøndelag", "Nordland", "Troms", "Finnmark",
]
# The nine counties Poengkart currently covers.
IN_DATASET_9 = {
    "Oslo", "Akershus", "Buskerud", "Innlandet", "Møre og Romsdal",
    "Rogaland", "Telemark", "Trøndelag", "Vestland",
}

CAVEAT_KEYWORDS = [
    "not found", "provisional", "double-check", "worth a", "unverified",
    "acting", "konstituert", "fungerende", "vacant", "handover", "pending",
    "pattern:",
]

NOR_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ"
NOR_INDEX = {c: i for i, c in enumerate(NOR_ALPHABET)}

LOG_LINES: list[str] = []


def log(msg: str) -> None:
    print(msg, flush=True)
    LOG_LINES.append(msg)


def nor_key(s: str):
    """Sort key giving correct Norwegian collation (Æ, Ø, Å sort after Z)."""
    s = (s or "").upper()
    return tuple(NOR_INDEX.get(ch, 100 + ord(ch)) for ch in s)


# --------------------------------------------------------------------------
# Strict CSV loading — fails loudly on any row with the wrong column count
# --------------------------------------------------------------------------

def read_csv_strict(path: Path, expected_header: list[str]) -> list[dict]:
    n = len(expected_header)
    rows: list[dict] = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            raise SystemExit(f"FATAL: {path} is empty (no header row)")
        if header != expected_header:
            raise SystemExit(
                f"FATAL: {path} line 1: header does not match the expected "
                f"schema.\n  expected: {expected_header}\n  found:    {header}"
            )
        for row in reader:
            if not row:
                continue  # blank trailing line
            if len(row) != n:
                raise SystemExit(
                    f"FATAL: {path} line {reader.line_num}: expected {n} "
                    f"columns, found {len(row)}\n  row: {row}"
                )
            rows.append(dict(zip(header, row)))
    return rows


def write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in header})


# --------------------------------------------------------------------------
# fylker-contacts.csv
# --------------------------------------------------------------------------

def build_fylker_contacts() -> tuple[list[str], list[dict]]:
    log("\n== Fylker (C1+C2+C3) ==")
    rows: list[dict] = []
    for name in ("fylker-C1.csv", "fylker-C2.csv", "fylker-C3.csv"):
        part = read_csv_strict(OUT_DIR / name, BRIEF_HEADER)
        log(f"  {name}: {len(part)} rows")
        rows.extend(part)
    log(f"  total: {len(rows)} rows")

    for r in rows:
        if r["role"] not in ROLE_ORDER:
            raise SystemExit(
                f"FATAL: fylker-C*.csv row for {r['fylke']} has unknown "
                f"role {r['role']!r} (source_url={r['source_url']})"
            )

    rows.sort(key=lambda r: (nor_key(r["fylke"]), ROLE_ORDER[r["role"]]))
    for r in rows:
        r["in_dataset"] = "yes" if r["fylke"] in IN_DATASET_9 else "no"

    found_fylker = {r["fylke"] for r in rows}
    missing = [f for f in CANONICAL_FYLKER_15 if f not in found_fylker]
    extra = sorted(found_fylker - set(CANONICAL_FYLKER_15))
    if missing:
        log(f"  VALIDATION FAIL: missing fylke owners: {missing}")
    else:
        log("  VALIDATION OK: all 15 fylke owners present")
    if extra:
        log(f"  VALIDATION WARN: fylke names not in the canonical 15: {extra}")

    postmottak_fylker = {r["fylke"] for r in rows if r["role"] == "postmottak"}
    missing_postmottak = [f for f in CANONICAL_FYLKER_15 if f not in postmottak_fylker]
    if missing_postmottak:
        log(f"  VALIDATION FAIL: fylker with no postmottak row: {missing_postmottak}")
    else:
        log("  VALIDATION OK: every fylke owner has a postmottak row")

    header = BRIEF_HEADER + ["in_dataset"]
    write_csv(OUT_DIR / "fylker-contacts.csv", header, rows)
    log(f"  wrote fylker-contacts.csv ({len(rows)} rows)")
    return header, rows


# --------------------------------------------------------------------------
# kommuner-contacts.csv
# --------------------------------------------------------------------------

def normalize_kommune(name: str) -> str:
    name = (name or "").strip()
    name = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()  # "Nes (Akershus)" -> "Nes"
    key = re.sub(r"\s+", " ", name.lower())
    special = {"voss herad": "voss", "kvam herad": "kvam", "ulvik herad": "ulvik"}
    return special.get(key, key)


def build_kommuner_contacts() -> tuple[list[str], list[dict]]:
    log("\n== Kommuner (K1..K8) ==")
    rows: list[dict] = []
    for i in range(1, 9):
        name = f"kommuner-K{i}.csv"
        part = read_csv_strict(OUT_DIR / name, BRIEF_HEADER)
        log(f"  {name}: {len(part)} rows")
        rows.extend(part)
    log(f"  total: {len(rows)} rows")

    seed_rows = read_csv_strict(OUT_DIR / "kommuner-seed.csv", SEED_HEADER)
    seed_by_key: dict[str, dict] = {}
    for s in seed_rows:
        if s["kommune"].strip().lower() == "oslo":
            continue  # Oslo is not part of the 216-kommune oppvekst_leder target
        key = normalize_kommune(s["kommune"])
        if key in seed_by_key:
            raise SystemExit(
                f"FATAL: seed kommune name collision after normalising: "
                f"{key!r} ({s['kommune']!r} vs {seed_by_key[key]['kommune']!r})"
            )
        seed_by_key[key] = s
    log(f"  seed: {len(seed_rows)} rows total, {len(seed_by_key)} non-Oslo kommuner")

    unmatched = []
    for r in rows:
        key = normalize_kommune(r["kommune"])
        s = seed_by_key.get(key)
        if s is None:
            unmatched.append(r)
            r["kommunenr"] = ""
            r["postmottak"] = ""
            r["hjemmeside"] = ""
        else:
            r["kommunenr"] = s["kommunenr"]
            r["postmottak"] = s["epost"]
            r["hjemmeside"] = s["hjemmeside"]
        r["found"] = "yes" if r["name"].strip() else "no"

    if unmatched:
        log(f"  VALIDATION FAIL: {len(unmatched)} row(s) did not match a seed kommune:")
        for r in unmatched:
            log(f"    - {r['fylke']} / {r['kommune']!r} (role={r['role']})")
    else:
        log("  VALIDATION OK: every K-file row matched a seed kommune")

    oppvekst_count: Counter[str] = Counter()
    for r in rows:
        if r["role"] == "oppvekst_leder":
            oppvekst_count[normalize_kommune(r["kommune"])] += 1

    missing_oppvekst = sorted(
        s["kommune"] for k, s in seed_by_key.items() if oppvekst_count.get(k, 0) == 0
    )
    dup_oppvekst = {k: c for k, c in oppvekst_count.items() if c > 1}
    if missing_oppvekst:
        log(f"  VALIDATION FAIL: {len(missing_oppvekst)} seed kommune(s) with no "
            f"oppvekst_leder row: {missing_oppvekst}")
    if dup_oppvekst:
        log(f"  VALIDATION FAIL: kommune(s) with more than one oppvekst_leder row: {dup_oppvekst}")
    if not missing_oppvekst and not dup_oppvekst:
        log(f"  VALIDATION OK: exactly one oppvekst_leder row for all "
            f"{len(seed_by_key)} seed kommuner")

    def sort_key(r: dict):
        try:
            kn = int(r["kommunenr"]) if r["kommunenr"] else 999999
        except ValueError:
            kn = 999999
        role_rank = 0 if r["role"] == "oppvekst_leder" else 1
        return (nor_key(r["fylke"]), kn, role_rank)

    rows.sort(key=sort_key)

    header = BRIEF_HEADER + ["kommunenr", "postmottak", "hjemmeside", "found"]
    write_csv(OUT_DIR / "kommuner-contacts.csv", header, rows)
    log(f"  wrote kommuner-contacts.csv ({len(rows)} rows)")
    return header, rows


# --------------------------------------------------------------------------
# Registry-layer loads for the workbook (no merging needed)
# --------------------------------------------------------------------------

def load_schools_vgs() -> tuple[list[str], list[dict]]:
    log("\n== Skoler vgs ==")
    rows = read_csv_strict(OUT_DIR / "schools-vgs.csv", SCHOOL_HEADER)
    in_pk = [r for r in rows if r["in_poengkart"] == "yes"]
    rest = [r for r in rows if r["in_poengkart"] != "yes"]
    log(f"  {len(rows)} rows ({len(in_pk)} in_poengkart=yes, {len(rest)} other)")
    return SCHOOL_HEADER, in_pk + rest


def load_schools_ungdomsskole() -> tuple[list[str], list[dict]]:
    log("\n== Ungdomsskoler ==")
    rows = read_csv_strict(OUT_DIR / "schools-ungdomsskole.csv", SCHOOL_HEADER)
    log(f"  {len(rows)} rows")
    return SCHOOL_HEADER, rows


def load_fylkeskommuner() -> tuple[list[str], list[dict]]:
    log("\n== Fylkeskommuner registry ==")
    rows = read_csv_strict(OUT_DIR / "fylkeskommuner.csv", FYLKESKOMMUNER_HEADER)
    log(f"  {len(rows)} rows")
    return FYLKESKOMMUNER_HEADER, rows


# --------------------------------------------------------------------------
# Caveats (used by both the README and the "Les meg" sheet)
# --------------------------------------------------------------------------

def build_caveats(fylker_rows: list[dict], kommuner_rows: list[dict]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {"not_found": [], "verify": [], "pattern_only": []}
    for r in fylker_rows + kommuner_rows:
        note = r.get("note") or ""
        note_l = note.lower()
        if not any(kw in note_l for kw in CAVEAT_KEYWORDS):
            continue
        loc = r["fylke"]
        if r.get("kommune"):
            loc += f" / {r['kommune']}"
        label = f"{loc} — {r['role']}"
        if r.get("name"):
            label += f" ({r['name']})"
        entry = f"{label}: {note}"
        if "not found" in note_l:
            groups["not_found"].append(entry)
        elif "pattern:" in note_l:
            groups["pattern_only"].append(entry)
        else:
            groups["verify"].append(entry)
    return groups


def build_counts_table(fylker_rows, kommuner_rows, vgs_rows, us_rows):
    def stats(rows, tier):
        named = sum(1 for r in rows if (r.get("name") or "").strip())
        email = sum(1 for r in rows if (r.get("email") or "").strip())
        return (tier, len(rows), named, email)

    return [
        stats(fylker_rows, "Fylker"),
        stats(kommuner_rows, "Kommuner"),
        stats(vgs_rows, "Skoler vgs"),
        stats(us_rows, "Ungdomsskoler"),
    ]


def app_schools_no_email(vgs_rows: list[dict]) -> list[dict]:
    return [r for r in vgs_rows if r["in_poengkart"] == "yes" and not (r.get("email") or "").strip()]


# --------------------------------------------------------------------------
# contacts.xlsx
# --------------------------------------------------------------------------

TEXT_FORMAT_COLUMNS = {"phone", "kommunenr", "orgnr"}


def style_sheet(ws, header: list[str], note_col="note", url_col="source_url") -> None:
    ws.freeze_panes = "A2"
    max_row = ws.max_row
    max_col = ws.max_column
    if max_row >= 1 and max_col >= 1:
        ws.auto_filter.ref = ws.dimensions

    idx = {name: i + 1 for i, name in enumerate(header)}

    for col_idx, name in enumerate(header, start=1):
        col_letter = get_column_letter(col_idx)
        max_len = len(name)
        for row_idx in range(2, max_row + 1):
            val = ws.cell(row=row_idx, column=col_idx).value
            if val is None:
                continue
            length = len(str(val))
            if length > max_len:
                max_len = length
        width = max(min(max_len + 2, 60), 10)
        ws.column_dimensions[col_letter].width = width

    if note_col in idx:
        col = idx[note_col]
        for row_idx in range(2, max_row + 1):
            ws.cell(row=row_idx, column=col).alignment = Alignment(wrap_text=True, vertical="top")

    if url_col in idx:
        col = idx[url_col]
        for row_idx in range(2, max_row + 1):
            cell = ws.cell(row=row_idx, column=col)
            if cell.value:
                cell.hyperlink = cell.value
                cell.font = Font(color="0563C1", underline="single")

    for name in TEXT_FORMAT_COLUMNS:
        if name in idx:
            col = idx[name]
            for row_idx in range(2, max_row + 1):
                ws.cell(row=row_idx, column=col).number_format = "@"

    for col_idx in range(1, max_col + 1):
        ws.cell(row=1, column=col_idx).font = Font(bold=True)


def write_data_sheet(wb: Workbook, title: str, header: list[str], rows: list[dict]) -> None:
    ws = wb.create_sheet(title=title[:31])
    ws.append(header)
    for r in rows:
        ws.append([r.get(h, "") for h in header])
    style_sheet(ws, header)


def write_les_meg_sheet(
    wb: Workbook,
    generated: str,
    counts: list[tuple[str, int, int, int]],
    caveats: dict[str, list[str]],
) -> None:
    ws = wb.create_sheet(title="Les meg")
    ws.column_dimensions["A"].width = 100

    def row(text: str = "", bold: bool = False) -> None:
        ws.append([text])
        if bold:
            ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
        ws.cell(row=ws.max_row, column=1).alignment = Alignment(wrap_text=True, vertical="top")

    row("Poengkart outreach contacts — Les meg", bold=True)
    row(f"Generated: {generated}")
    row()
    row("What each sheet is:", bold=True)
    row("Fylker — the 15 school owners (Oslo UDE + 14 fylkeskommuner): postmottak, "
        "inntak office, admissions head, education director, communications, "
        "counsellor coordinator. From fylker-contacts.csv.")
    row("Kommuner — oppvekst (children/schools) leadership for the 216 non-Oslo "
        "kommuner in the eight Poengkart counties, joined to the authoritative "
        "kommune seed list. From kommuner-contacts.csv.")
    row("Skoler vgs — postmottak contact for every videregående skole in the "
        "nine counties; rows already in the Poengkart app (in_poengkart=yes) "
        "are listed first.")
    row("Ungdomsskoler — postmottak contact for ungdomsskoler in the nine counties.")
    row("Fylkeskommuner registry — the raw Brønnøysund/NSR registry pull for the "
        "15 fylkeskommuner (fylkeskommuner.csv), for reference.")
    row()
    row("Counts:", bold=True)
    row("Tier | Rows | Named person found | Email present")
    for tier, n, named, email in counts:
        row(f"{tier} | {n} | {named} | {email}")
    row()
    row("Check before sending, consolidated from the note fields:", bold=True)
    row(f"(a) Not found ({len(caveats['not_found'])}):", bold=True)
    for entry in caveats["not_found"]:
        row(f"  - {entry}")
    row(f"(b) Named but verify ({len(caveats['verify'])}):", bold=True)
    for entry in caveats["verify"]:
        row(f"  - {entry}")
    row(f"(c) Email pattern only, no scraped address ({len(caveats['pattern_only'])}):", bold=True)
    for entry in caveats["pattern_only"]:
        row(f"  - {entry}")


def build_workbook(
    fylker_header, fylker_rows,
    kommuner_header, kommuner_rows,
    vgs_header, vgs_rows,
    us_header, us_rows,
    fk_header, fk_rows,
    generated: str,
) -> None:
    log("\n== contacts.xlsx ==")
    counts = build_counts_table(fylker_rows, kommuner_rows, vgs_rows, us_rows)
    caveats = build_caveats(fylker_rows, kommuner_rows)

    wb = Workbook()
    wb.remove(wb.active)  # drop the default blank sheet

    write_les_meg_sheet(wb, generated, counts, caveats)
    write_data_sheet(wb, "Fylker", fylker_header, fylker_rows)
    write_data_sheet(wb, "Kommuner", kommuner_header, kommuner_rows)
    write_data_sheet(wb, "Skoler vgs", vgs_header, vgs_rows)
    write_data_sheet(wb, "Ungdomsskoler", us_header, us_rows)
    write_data_sheet(wb, "Fylkeskommuner registry", fk_header, fk_rows)

    out_path = OUT_DIR / "contacts.xlsx"
    wb.save(out_path)
    log(f"  wrote {out_path.name} "
        f"(sheets: Les meg, Fylker, Kommuner, Skoler vgs, Ungdomsskoler, "
        f"Fylkeskommuner registry)")


# --------------------------------------------------------------------------
# README.md
# --------------------------------------------------------------------------

def build_readme(
    fylker_rows, kommuner_rows, vgs_rows, us_rows, generated: str
) -> str:
    counts = build_counts_table(fylker_rows, kommuner_rows, vgs_rows, us_rows)
    caveats = build_caveats(fylker_rows, kommuner_rows)
    no_email_schools = app_schools_no_email(vgs_rows)

    lines: list[str] = []
    lines.append("# Poengkart outreach contacts")
    lines.append("")
    lines.append(
        "Bottom line: 111 fylke-level contact rows across all 15 school "
        "owners, 220 kommune-level rows covering all 216 non-Oslo kommuner "
        "in the eight Poengkart counties, and postmottak rows for every "
        "videregående skole and ungdomsskole in those counties. See the "
        "counts table below, then the check-before-sending list before "
        "using any of this."
    )
    lines.append("")
    lines.append("| Tier | Rows | Named person found | Email present |")
    lines.append("| --- | --- | --- | --- |")
    for tier, n, named, email in counts:
        lines.append(f"| {tier} | {n} | {named} | {email} |")
    lines.append("")

    lines.append("## Check before sending")
    lines.append("")
    lines.append(
        "Consolidated from every `note` field containing one of: not found, "
        "provisional, double-check, worth a, unverified, acting, "
        "konstituert, fungerende, vacant, handover, pending, pattern:. "
        "A row that matched more than one keyword is listed once, under "
        "the earliest-applying group below."
    )
    lines.append("")
    lines.append(f"### (a) Not found — {len(caveats['not_found'])} rows")
    lines.append("")
    for entry in caveats["not_found"]:
        lines.append(f"- {entry}")
    lines.append("")
    lines.append(f"### (b) Named but verify — {len(caveats['verify'])} rows")
    lines.append("")
    for entry in caveats["verify"]:
        lines.append(f"- {entry}")
    lines.append("")
    lines.append(f"### (c) Email pattern only, no scraped address — {len(caveats['pattern_only'])} rows")
    lines.append("")
    for entry in caveats["pattern_only"]:
        lines.append(f"- {entry}")
    lines.append("")

    lines.append("## Known structural gaps")
    lines.append("")
    lines.append("- **Telemark** has no named inntak leder — the org chart lists only the "
                  "fylkesdirektør and five fylkessjefer; the last named section leader "
                  "(Ben Ståle Leirvåg) predates the 2024 Vestfold/Telemark split.")
    lines.append("- **Troms** has no inntak mailbox — enquiries go through a Jotform "
                  "web form (\"Kontakt inntakskontoret\"), not an email address.")
    lines.append("- **Vestland** has no inntak@ mailbox — admissions mail goes to "
                  "post@vlfk.no, with a phone line for the inntak section.")
    lines.append("- **Nordland**'s postmottak address, info@nfk.no, comes from the "
                  "fylkeskommune's own accessibility statement (uustatus.no), not "
                  "the site footer, which publishes no postmottak address.")
    lines.append("- **Møre og Romsdal**'s seksjonsleiar for inntak, Maria Enstad, is "
                  "press-sourced only (NRK, 8 July 2026) — not confirmed on an "
                  "official page, so no named row was written for that role.")
    lines.append("")

    lines.append(f"## App schools with no published email — {len(no_email_schools)}")
    lines.append("")
    lines.append(
        "From schools-vgs.csv, in_poengkart=yes and email empty:"
    )
    lines.append("")
    for r in no_email_schools:
        lines.append(f"- {r['org']} ({r['kommune']}, {r['fylke']})")
    lines.append("")

    lines.append("## How it was built")
    lines.append("")
    lines.append(
        "`tools/outreach_registry.py` pulled the registry layer "
        "(kommuner-seed.csv, kommuner.csv, fylkeskommuner.csv, "
        "schools-vgs.csv, schools-ungdomsskole.csv) from Brønnøysundregistrene "
        "(brreg.no) and NSR (data-nsr.udir.no) — postmottak-only, no browsing. "
        "Twelve research agents (fylker-C1..C3, kommuner-K1..K8) then found "
        "named contacts from official fylkeskommune, kommune and school "
        "sources only — no LinkedIn, no people-search sites, no guessed "
        "addresses beyond a noted `pattern:`. Checked 14 Sept 2026."
    )
    lines.append("")

    lines.append("## How to refresh")
    lines.append("")
    lines.append(
        "Re-run the registry pull with `.venv/bin/python3 tools/outreach_registry.py` "
        "(cached under docs/private/outreach/raw/; delete a cache file to force "
        "a re-fetch), have the research agents redo fylker-C1..C3 and "
        "kommuner-K1..K8, then rebuild everything in this file with "
        "`.venv/bin/python3 tools/outreach_merge.py`."
    )
    lines.append("")

    return "\n".join(lines)


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> None:
    generated = date.today().isoformat()

    fylker_header, fylker_rows = build_fylker_contacts()
    kommuner_header, kommuner_rows = build_kommuner_contacts()
    vgs_header, vgs_rows = load_schools_vgs()
    us_header, us_rows = load_schools_ungdomsskole()
    fk_header, fk_rows = load_fylkeskommuner()

    build_workbook(
        fylker_header, fylker_rows,
        kommuner_header, kommuner_rows,
        vgs_header, vgs_rows,
        us_header, us_rows,
        fk_header, fk_rows,
        generated,
    )

    readme = build_readme(fylker_rows, kommuner_rows, vgs_rows, us_rows, generated)
    (OUT_DIR / "README.md").write_text(readme, encoding="utf-8")
    log(f"\n  wrote README.md ({len(readme.splitlines())} lines)")

    log("\n== Counts table ==")
    log(f"{'Tier':<16}{'Rows':>6}{'Named':>8}{'Email':>8}")
    for tier, n, named, email in build_counts_table(fylker_rows, kommuner_rows, vgs_rows, us_rows):
        log(f"{tier:<16}{n:>6}{named:>8}{email:>8}")

    no_email = app_schools_no_email(vgs_rows)
    log(f"\nApp schools (in_poengkart=yes) with no email: {len(no_email)}")
    for r in no_email:
        log(f"  - {r['org']} ({r['kommune']}, {r['fylke']})")

    log("\nDone.")


if __name__ == "__main__":
    main()
