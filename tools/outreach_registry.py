#!/usr/bin/env .venv/bin/python3
"""Registry-only outreach contact list for Poengkart.

Pulls official contact details (postmottak email/phone) from public
registries only — NSR (data-nsr.udir.no) and Brønnøysundregistrene
(data.brreg.no). No web browsing, no transcription of pages. Writes four
CSVs into docs/private/outreach/ and a run summary into
docs/private/outreach/runs/.

Run with: .venv/bin/python3 tools/outreach_registry.py

Every raw API response is cached as JSON under docs/private/outreach/raw/
so re-runs never re-fetch anything that already succeeded (including a
cached 404). Delete files under raw/ to force a re-fetch.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "private" / "outreach"
RAW_DIR = OUT_DIR / "raw"
RUNS_DIR = OUT_DIR / "runs"

USER_AGENT = "poengkart-outreach (avshalomdayan318@gmail.com)"
SLEEP_S = 0.15
TODAY = date.today().isoformat()

NSR_V4 = "https://data-nsr.udir.no/v4/enheter?sidenummer={page}&antallPerSide=1000"
NSR_V3 = "https://data-nsr.udir.no/v3/enhet/{orgnr}"
BRREG_UNDER = "https://data.brreg.no/enhetsregisteret/api/underenheter/{orgnr}"
BRREG_ENHET = "https://data.brreg.no/enhetsregisteret/api/enheter/{orgnr}"
BRREG_KOMM = "https://data.brreg.no/enhetsregisteret/api/enheter?organisasjonsform=KOMM&size=400"
BRREG_FYLK = "https://data.brreg.no/enhetsregisteret/api/enheter?organisasjonsform=FYLK&size=50"

# The nine Poengkart counties: fylkesnummer -> official name.
FYLKE9 = {
    "40": "Telemark",
    "03": "Oslo",
    "32": "Akershus",
    "33": "Buskerud",
    "34": "Innlandet",
    "15": "Møre og Romsdal",
    "11": "Rogaland",
    "50": "Trøndelag",
    "46": "Vestland",
}

# All 15 fylker (2026 structure), for kommuner.csv.
FYLKE15 = {
    "03": "Oslo",
    "11": "Rogaland",
    "15": "Møre og Romsdal",
    "18": "Nordland",
    "31": "Østfold",
    "32": "Akershus",
    "33": "Buskerud",
    "34": "Innlandet",
    "39": "Vestfold",
    "40": "Telemark",
    "42": "Agder",
    "46": "Vestland",
    "50": "Trøndelag",
    "55": "Troms",
    "56": "Finnmark",
}

BASE_FIELDS = [
    "fylke", "kommune", "org", "level", "role", "name", "title", "title_en",
    "email", "phone", "source_url", "checked", "note",
]
SCHOOL_EXTRA = ["orgnr", "url", "elevtall", "in_poengkart", "poengkart_name"]
KOMMUNE_EXTRA = ["kommunenr", "orgnr", "hjemmeside", "covered"]

ORGNR_RE = re.compile(r"^\d{9}$")

stats = {"live_calls": 0, "cache_hits": 0}


def log(msg: str) -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------
# Fetching + caching
# --------------------------------------------------------------------------

def _cache_path(name: str) -> Path:
    return RAW_DIR / name


def fetch_json(url: str, cache_name: str, allow_404: bool = False):
    """Fetch JSON from `url`, caching the raw response under raw/cache_name.

    A cached response is used forever (no re-fetch, no sleep). A 404 is
    cached too (as a small marker file) when allow_404 is set, so repeated
    "not found" lookups don't get re-tried on every run.
    """
    path = _cache_path(cache_name)
    if path.exists():
        stats["cache_hits"] += 1
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and raw.get("_http_status") == 404:
            return None
        return raw

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        stats["live_calls"] += 1
        time.sleep(SLEEP_S)
        if allow_404 and e.code == 404:
            path.write_text(json.dumps({"_http_status": 404}), encoding="utf-8")
            return None
        raise
    stats["live_calls"] += 1
    time.sleep(SLEEP_S)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def brreg_lookup(orgnr: str):
    """Try underenheter/{orgnr} then enheter/{orgnr}. Returns (data_or_None, url_used)."""
    under_url = BRREG_UNDER.format(orgnr=orgnr)
    data = fetch_json(under_url, f"brreg-underenheter-{orgnr}.json", allow_404=True)
    if data is not None:
        return data, under_url
    enhet_url = BRREG_ENHET.format(orgnr=orgnr)
    data = fetch_json(enhet_url, f"brreg-enheter-{orgnr}.json", allow_404=True)
    if data is not None:
        return data, enhet_url
    return None, under_url  # nothing found; report the first URL tried


def nsr_v3(orgnr: str):
    url = NSR_V3.format(orgnr=orgnr)
    data = fetch_json(url, f"nsr-v3-{orgnr}.json", allow_404=True)
    return data, url


def fetch_nsr_v4_all():
    page = 1
    units = []
    while True:
        url = NSR_V4.format(page=page)
        d = fetch_json(url, f"nsr-v4-page-{page:02d}.json")
        units.extend(d["EnhetListe"])
        total_pages = d["AntallSider"]
        if page >= total_pages:
            break
        page += 1
    return units


# --------------------------------------------------------------------------
# Poengkart app data (for in_poengkart matching)
# --------------------------------------------------------------------------

def load_poengkart_schools():
    d = json.loads((ROOT / "web" / "data" / "schools.json").read_text(encoding="utf-8"))
    by_orgnr = {}
    fagerlia_name = None
    for s in d["schools"]:
        orgnr = s.get("orgnr")
        if orgnr:
            by_orgnr[str(orgnr)] = s["name"]
        elif "fagerlia" in s["name"].lower():
            fagerlia_name = s["name"]
    return by_orgnr, fagerlia_name


# --------------------------------------------------------------------------
# Row builders
# --------------------------------------------------------------------------

def build_school_row(unit, v3, v3_url, brreg_data, brreg_url, in_pk, pk_name):
    orgnr = unit["Organisasjonsnummer"]
    fylke = FYLKE9.get(unit.get("Fylkesnummer"), "")
    kommune = ""
    if v3 and v3.get("Kommune"):
        kommune = v3["Kommune"].get("Navn", "") or ""

    email = (brreg_data or {}).get("epostadresse") or ""
    phone = (brreg_data or {}).get("telefon") or ""

    notes = []
    if not email:
        notes.append("no email in brreg")
    if v3 is None:
        notes.append("no NSR v3 record")

    url_field = ""
    if v3 and v3.get("Url"):
        url_field = v3["Url"]
    elif brreg_data and brreg_data.get("hjemmeside"):
        url_field = brreg_data["hjemmeside"]

    elevtall = ""
    if v3 and v3.get("Elevtall") is not None:
        elevtall = v3["Elevtall"]

    return {
        "fylke": fylke,
        "kommune": kommune,
        "org": unit["Navn"],
        "level": "skole",
        "role": "postmottak",
        "name": "",
        "title": "",
        "title_en": "",
        "email": email,
        "phone": phone,
        "source_url": brreg_url,
        "checked": TODAY,
        "note": "; ".join(notes),
        "orgnr": orgnr,
        "url": url_field,
        "elevtall": elevtall,
        "in_poengkart": in_pk,
        "poengkart_name": pk_name,
    }


def strip_suffix_ci(s: str, suffix: str) -> str:
    if s.upper().endswith(suffix.upper()):
        return s[: -len(suffix)].strip()
    return s.strip()


def titlecase_no(s: str) -> str:
    return s.title().replace(" Og ", " og ").replace(" I ", " i ")


def build_kommuner_rows():
    data = fetch_json(BRREG_KOMM, "brreg-komm.json")
    embedded = data.get("_embedded", {}).get("enheter", [])
    rows = []
    unmapped_fylke = 0
    for e in embedded:
        navn_raw = e.get("navn", "")
        addr = e.get("forretningsadresse") or e.get("postadresse") or {}
        kommunenr = addr.get("kommunenummer", "") or ""
        fylkekode = kommunenr[:2] if kommunenr else ""
        fylke = FYLKE15.get(fylkekode, "")
        if kommunenr and not fylke:
            unmapped_fylke += 1
        kommune_name = titlecase_no(strip_suffix_ci(navn_raw, " KOMMUNE"))
        org = f"{kommune_name} kommune"
        email = e.get("epostadresse") or ""
        phone = e.get("telefon") or ""
        hjemmeside = e.get("hjemmeside") or ""
        covered = "yes" if fylkekode in FYLKE9 else "no"
        rows.append({
            "fylke": fylke,
            "kommune": kommune_name,
            "org": org,
            "level": "kommune",
            "role": "postmottak",
            "name": "",
            "title": "",
            "title_en": "",
            "email": email,
            "phone": phone,
            "source_url": BRREG_KOMM,
            "checked": TODAY,
            "note": "" if email else "no email in brreg",
            "kommunenr": kommunenr,
            "orgnr": e.get("organisasjonsnummer", ""),
            "hjemmeside": hjemmeside,
            "covered": covered,
        })
    return rows, unmapped_fylke


def build_fylkeskommuner_rows(kommuner_rows):
    data = fetch_json(BRREG_FYLK, "brreg-fylk.json")
    embedded = data.get("_embedded", {}).get("enheter", [])
    rows = []
    for e in embedded:
        navn_raw = e.get("navn", "")
        fylke_name = titlecase_no(strip_suffix_ci(navn_raw, " FYLKESKOMMUNE"))
        org = f"{fylke_name} fylkeskommune"
        email = e.get("epostadresse") or ""
        phone = e.get("telefon") or ""
        rows.append({
            "fylke": fylke_name,
            "kommune": "",
            "org": org,
            "level": "fylke",
            "role": "postmottak",
            "name": "",
            "title": "",
            "title_en": "",
            "email": email,
            "phone": phone,
            "source_url": BRREG_FYLK,
            "checked": TODAY,
            "note": "" if email else "no email in brreg",
        })

    # Oslo has no separate fylkeskommune; Oslo kommune plays that role.
    # Reuse the kommuner.csv pull instead of a fresh call.
    oslo = next((r for r in kommuner_rows if r["kommunenr"] == "0301"), None)
    note = "Oslo kommune stands in for Oslo fylkeskommune (Oslo is both kommune and fylke)"
    if oslo:
        email = oslo["email"]
        if not email:
            note += "; no email in brreg"
        rows.append({
            "fylke": "Oslo",
            "kommune": "",
            "org": "Oslo kommune",
            "level": "fylke",
            "role": "postmottak",
            "name": "",
            "title": "",
            "title_en": "",
            "email": email,
            "phone": oslo["phone"],
            "source_url": BRREG_KOMM,
            "checked": TODAY,
            "note": note,
        })
    else:
        log("WARNING: Oslo kommune (0301) not found in kommuner pull for fylkeskommuner stand-in row")
    return rows


# --------------------------------------------------------------------------
# School CSV builds (vgs + ungdomsskole share almost all logic)
# --------------------------------------------------------------------------

def is_vgs(u):
    return bool(
        u.get("ErVideregaaendeSkole") and u.get("ErAktiv") and u.get("ErOffentligSkole")
        and u.get("Fylkesnummer") in FYLKE9
    )


def is_grunnskole_candidate(u):
    return bool(
        u.get("ErGrunnskole") and u.get("ErAktiv") and u.get("ErOffentligSkole")
        and u.get("Fylkesnummer") in FYLKE9
    )


def build_school_rows(units, by_orgnr, fagerlia_name, label, require_ungdomstrinn=False):
    rows = []
    skipped_invalid_orgnr = 0
    n = len(units)
    for i, unit in enumerate(units, 1):
        orgnr = unit.get("Organisasjonsnummer", "")
        if not ORGNR_RE.match(orgnr):
            skipped_invalid_orgnr += 1
            continue

        v3, v3_url = nsr_v3(orgnr)

        if require_ungdomstrinn:
            til = v3.get("SkoletrinnGSTil") if v3 else None
            if til is None or til < 10:
                if i % 200 == 0 or i == n:
                    log(f"  [{label}] {i}/{n} checked, {len(rows)} kept so far")
                continue

        brreg_data, brreg_url = brreg_lookup(orgnr)

        if orgnr in by_orgnr:
            in_pk, pk_name = "yes", by_orgnr[orgnr]
        elif fagerlia_name and "fagerlia" in unit.get("Navn", "").lower():
            in_pk, pk_name = "yes", fagerlia_name
        else:
            in_pk, pk_name = "no", ""

        rows.append(build_school_row(unit, v3, v3_url, brreg_data, brreg_url, in_pk, pk_name))

        if i % 50 == 0 or i == n:
            log(f"  [{label}] {i}/{n} processed, {len(rows)} kept so far "
                f"(live calls so far: {stats['live_calls']})")
    return rows, skipped_invalid_orgnr


# --------------------------------------------------------------------------
# CSV writing
# --------------------------------------------------------------------------

def write_csv(path: Path, rows, extra_fields):
    fields = BASE_FIELDS + extra_fields
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def by_county_counts(rows, key="fylke"):
    out = {}
    for r in rows:
        out[r.get(key, "")] = out.get(r.get(key, ""), 0) + 1
    return out


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    log("Loading Poengkart app schools (web/data/schools.json)...")
    by_orgnr, fagerlia_name = load_poengkart_schools()
    log(f"  {len(by_orgnr)} app schools with orgnr"
        + (f", plus '{fagerlia_name}' matched by name" if fagerlia_name else ""))

    log("Fetching NSR v4 (all units, paginated, cached per page)...")
    all_units = fetch_nsr_v4_all()
    log(f"  {len(all_units)} total NSR units fetched")

    vgs_units = [u for u in all_units if is_vgs(u)]
    log(f"  {len(vgs_units)} active public videregående skoler in the 9 counties")

    gs_candidates = [u for u in all_units if is_grunnskole_candidate(u)]
    log(f"  {len(gs_candidates)} active public grunnskoler in the 9 counties (candidates for ungdomstrinn check)")

    log("Building schools-vgs.csv (NSR v3 + Brreg per school)...")
    vgs_rows, vgs_skipped = build_school_rows(vgs_units, by_orgnr, fagerlia_name, "vgs")

    log("Building schools-ungdomsskole.csv (NSR v3 per grunnskole to check SkoletrinnGSTil >= 10, "
        "then Brreg for the ones that qualify)...")
    ungdom_rows, ungdom_skipped = build_school_rows(
        gs_candidates, by_orgnr, fagerlia_name, "ungdomsskole", require_ungdomstrinn=True
    )

    log("Building kommuner.csv (Brreg organisasjonsform=KOMM)...")
    kommuner_rows, unmapped_fylke = build_kommuner_rows()
    log(f"  {len(kommuner_rows)} kommuner")

    log("Building fylkeskommuner.csv (Brreg organisasjonsform=FYLK + Oslo kommune stand-in)...")
    fylkeskommuner_rows = build_fylkeskommuner_rows(kommuner_rows)
    log(f"  {len(fylkeskommuner_rows)} fylkeskommune-level rows")

    write_csv(OUT_DIR / "schools-vgs.csv", vgs_rows, SCHOOL_EXTRA)
    write_csv(OUT_DIR / "schools-ungdomsskole.csv", ungdom_rows, SCHOOL_EXTRA)
    write_csv(OUT_DIR / "kommuner.csv", kommuner_rows, KOMMUNE_EXTRA)
    write_csv(OUT_DIR / "fylkeskommuner.csv", fylkeskommuner_rows, [])

    # --- app-school email coverage report -------------------------------
    vgs_by_orgnr = {r["orgnr"]: r for r in vgs_rows}
    app_with_email = 0
    app_without_email = []
    for orgnr, name in by_orgnr.items():
        row = vgs_by_orgnr.get(orgnr)
        if row is None:
            # Safety net: this app school's orgnr wasn't picked up by the
            # NSR vgs filter walk (shouldn't normally happen) -- look it up
            # directly so the coverage count is still accurate.
            data, _ = brreg_lookup(orgnr)
            email = (data or {}).get("epostadresse") or ""
        else:
            email = row["email"]
        if email:
            app_with_email += 1
        else:
            app_without_email.append(name)
    if fagerlia_name:
        frow = next((r for r in vgs_rows if r["poengkart_name"] == fagerlia_name), None)
        email = frow["email"] if frow else ""
        if email:
            app_with_email += 1
        else:
            app_without_email.append(fagerlia_name)
    app_total = len(by_orgnr) + (1 if fagerlia_name else 0)

    # --- run summary ------------------------------------------------------
    def email_stats(rows):
        n = len(rows)
        with_email = sum(1 for r in rows if r["email"])
        return {"rows": n, "with_email": with_email,
                "pct_with_email": round(100 * with_email / n, 1) if n else 0.0}

    run_summary = {
        "date": TODAY,
        "live_calls": stats["live_calls"],
        "cache_hits": stats["cache_hits"],
        "files": {
            "schools-vgs.csv": {
                **email_stats(vgs_rows),
                "by_county": by_county_counts(vgs_rows),
                "skipped_invalid_orgnr": vgs_skipped,
            },
            "schools-ungdomsskole.csv": {
                **email_stats(ungdom_rows),
                "by_county": by_county_counts(ungdom_rows),
                "skipped_invalid_orgnr": ungdom_skipped,
                "candidates_checked": len(gs_candidates),
            },
            "kommuner.csv": {
                **email_stats(kommuner_rows),
                "by_county": by_county_counts(kommuner_rows),
                "unmapped_fylke": unmapped_fylke,
            },
            "fylkeskommuner.csv": email_stats(fylkeskommuner_rows),
        },
        "rows_without_email_total": sum(
            1 for rows in (vgs_rows, ungdom_rows, kommuner_rows, fylkeskommuner_rows)
            for r in rows if not r["email"]
        ),
        "app_schools": {
            "total": app_total,
            "with_email": app_with_email,
            "without_email": app_without_email,
        },
    }
    run_path = RUNS_DIR / f"registry-{TODAY}.json"
    run_path.write_text(json.dumps(run_summary, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"Wrote run summary: {run_path}")

    log("")
    log("=== Summary ===")
    log(json.dumps(run_summary, indent=2, ensure_ascii=False))

    # --- validation ---------------------------------------------------
    # The gate is the 228 Poengkart schools, not every NSR unit: NSR tags
    # exam offices, career centres and prison units as vgs, and those have
    # no mailbox of their own in Brreg.
    vgs_stat = run_summary["files"]["schools-vgs.csv"]
    app = run_summary["app_schools"]
    app_pct = 100.0 * app["with_email"] / app["total"] if app["total"] else 0.0
    ok = app["total"] >= 200 and app_pct >= 90.0
    if not ok:
        log("")
        log(f"VALIDATION FAILED: {app['with_email']}/{app['total']} Poengkart schools "
            f"have an email ({app_pct:.1f}%, need >= 90% of >= 200 matched).")
        sys.exit(1)

    log("")
    log(f"Validation passed: {app['with_email']}/{app['total']} Poengkart schools "
        f"have an email ({app_pct:.1f}%); schools-vgs.csv has {vgs_stat['rows']} rows.")


if __name__ == "__main__":
    main()
