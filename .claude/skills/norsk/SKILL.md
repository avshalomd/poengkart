---
name: norsk
description: Write and check Norwegian (bokmål) text for Poengkart — reply drafts to people who wrote in, mails to counties, UI strings. Use before any Norwegian text leaves the repository or the mailbox; run check.py on it and leave no ERROR behind.
---

# Norwegian for Poengkart

The reader is a parent, a pupil, a rådgiver or a county official. They notice
English left in a sentence, a coined term, a compound written apart, at once.

## Write

- Bokmål, unless the sender wrote nynorsk; then answer in nynorsk and read the
  checker's findings with that in mind (its rules are bokmål).
- The vocabulary is `CONTEXT.md` at the repository root, and only that:
  poenggrense, ingen venteliste, fortrinnsrett, programområde,
  utdanningsprogram, Vg1/Vg2/Vg3, inntak («1. inntak», «2. inntak»),
  sjanse for plass, 10. trinn. Its «Avoid» lists are the words not to use.
- Short sentences, «du» to a private person, «dere» to an office. Open with
  «Hei <navn>,» (or «Hei,» when no name is given), close with
  «Med vennlig hilsen» and «Abshalom Dayan» on its own line.
- Norwegian typography: «…» quotes, decimal comma (45,6), dates as
  «27. august 2026» or 27.08.2026, month and weekday names in lower case.
- A reply subject is «Re: <the original subject>»: never stack «Re: SV:».

## Check

```
python3 .claude/skills/norsk/check.py draft.txt
python3 .claude/skills/norsk/check.py --subject "Re: …" - < draft.txt
```

It prints `ERROR` and `WARN` lines with line:column, or `OK`, and exits 1
while any ERROR is left. Fix every ERROR and run it again. Read every WARN:
each names a likely slip that also has fair uses (a clock time «kl. 10.15»
trips the decimal rule), so a WARN is fixed or knowingly kept, never ignored.

The checker is a floor, not a proofreader: it knows Poengkart's vocabulary and
the slips machine-written bokmål makes most. Read the text once more as the
recipient would before calling it done.
