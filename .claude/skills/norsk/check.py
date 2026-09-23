#!/usr/bin/env python3
"""Check a Norwegian (bokmål) text written for Poengkart before anyone sends it.

    python3 .claude/skills/norsk/check.py draft.txt
    python3 .claude/skills/norsk/check.py - < draft.txt
    python3 .claude/skills/norsk/check.py --subject "Re: SV: …" draft.txt

Prints one line per finding, `ERROR <line>:<col> …` or `WARN <line>:<col> …`,
and `OK` when there is none. Exits 1 when any ERROR is left, else 0.

An ERROR is something a Norwegian reader notices at once: English left in the
text, a term CONTEXT.md forbids, a compound written apart, an English-style
date or decimal point. A WARN is a likely slip that has fair uses too, and is
read, not obeyed. The rules are Poengkart's own vocabulary (CONTEXT.md) plus
the slips machine-written bokmål makes most often; they are a floor, not a
proofreader.
"""
import re
import sys

# (pattern, message[, CASE]). A pattern is matched ignoring case unless the
# rule ends in CASE, for the few where the capital letter is the fault.
CASE = 'case'
ERRORS = [
    # English left in the text
    (r'^\s*(dear|hi|hello)\b', 'English greeting; write «Hei» or «Hei <navn>,»'),
    (r'\b(kind|best|warm) regards\b', 'English closing; write «Med vennlig hilsen»'),
    (r'\bthank(s| you)\b', 'English «thank you»; write «takk»'),
    (r'\b(sincerely|cheers)\b', 'English closing; write «Med vennlig hilsen»'),
    (r'\b(the|and|with|from|please|would|should)\b', 'English word in a Norwegian text'),

    # CONTEXT.md: the official vocabulary
    (r'\bcut-?offs?\b', 'CONTEXT.md: write «poenggrense»'),
    (r'\bpoengkrav(et|ene)?\b', 'CONTEXT.md: a poenggrense is not a requirement; write «poenggrense»'),
    (r'\bminstepoeng\w*', 'CONTEXT.md: write «poenggrense»'),
    (r'\buten venteliste\b', 'CONTEXT.md: write «ingen venteliste»'),
    (r'\balle inntatt\b', 'CONTEXT.md: write «ingen venteliste»'),
    (r'\binntaksomgang\w*', 'CONTEXT.md: write «inntak» («1. inntak», «2. inntak»)'),
    (r'\bfortrinnskvote\w*', 'CONTEXT.md: write «fortrinnsrett»'),
    (r'\bdokumentasjonsinntak\w*', 'CONTEXT.md: write «inntak etter dokumentasjon»'),
    (r'\bikke data\b', 'CONTEXT.md: write «ingen data»'),
    (r'\bingen tall\b', 'CONTEXT.md: write «ingen data»'),
    (r'\balle med poeng\b', 'CONTEXT.md: write «fullt, siste inntatte uten poeng»'),
    (r'\b10\.\s*klasse\b', 'CONTEXT.md: write «10. trinn»'),
    (r'\b(high school|college)\b', 'CONTEXT.md: write «videregående skole»'),
    (r'\bVG\s?[123]\b|\bvg\s?[123]\b|\bVg\s[123]\b', 'CONTEXT.md: write «Vg1», «Vg2», «Vg3»', CASE),

    # compounds written apart (særskriving) in the words Poengkart uses most
    (r'\bpoeng\s+grense\w*', 'særskriving: «poenggrense»'),
    (r'\bprogram\s+område\w*', 'særskriving: «programområde»'),
    (r'\butdannings\s+program\w*', 'særskriving: «utdanningsprogram»'),
    (r'\bskole\s+plass\w*', 'særskriving: «skoleplass»'),
    (r'\bvente\s+liste\w*', 'særskriving: «venteliste»'),
    (r'\bfylkes\s+kommune\w*', 'særskriving: «fylkeskommune»'),
    (r'\bkarakter\s+snitt\w*', 'særskriving: «karaktersnitt»'),
    (r'\binntaks\s+kontor\w*', 'særskriving: «inntakskontor»'),
    (r'\bungdoms\s+skole\w*', 'særskriving: «ungdomsskole»'),

    # English typography
    (r'\b\d{1,2}\.\s+(Januar|Februar|Mars|April|Mai|Juni|Juli|August|September|Oktober|November|Desember)\b',
     'months are lower case in Norwegian', CASE),
    (r'\b(January|February|March|June|July|October|December)\b', 'English month name'),
    (r'\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b', 'English weekday'),
]

WARNINGS = [
    (r'\b(for|til|med|av|om|på|hos|fra|mot|blant) de som\b', 'object form: «… dem som»'),
    (r'\bbeste hilsen\b', 'anglicism; «Med vennlig hilsen» or «Vennlig hilsen»'),
    (r'\b(e-?mail|mailen|mailer)\b', 'write «e-post»'),
    (r'\bopptak\w*', 'upper-secondary admission is «inntak»; «opptak» is higher education'),
    (r'\bsnittpoeng\w*', 'CONTEXT.md: the mean of the admitted is «gjennomkar»'),
    (r'\bnedlagt\b', 'CONTEXT.md: a programområde not offered is «utgått»'),
    (r'\bprioritetskvote\w*|\bprioriteringskvote\w*', 'CONTEXT.md: write «fortrinnsrett»'),
    (r'\bsjanse for opptak\b|\bsannsynlighet for (opptak|inntak)\b', 'CONTEXT.md: write «sjanse for plass»'),
    (r'(?<![\d.])\d+\.\d+(?![\d.])', 'decimal point; Norwegian writes a decimal comma («45,6»)'),
    (r'"[^"\n]{1,80}"', 'English quotation marks; Norwegian uses «…»'),
]


def _scan(lines, rules):
    for rule in rules:
        pattern, message = rule[:2]
        flags = re.MULTILINE if rule[2:] == (CASE,) else re.MULTILINE | re.IGNORECASE
        rx = re.compile(pattern, flags)
        for n, line in enumerate(lines, 1):
            for m in rx.finditer(line):
                yield n, m.start() + 1, m.group(0), message


def check(text, subject=None):
    """Return [(level, line, col, found, message)], ERRORs first."""
    lines = text.splitlines()
    out = [('ERROR', *f) for f in _scan(lines, ERRORS)]
    out += [('WARN', *f) for f in _scan(lines, WARNINGS)]
    if subject is not None:
        if re.match(r'^\s*(re|sv|vs|fw|fwd)\s*:\s*(re|sv|vs|fw|fwd)\s*:', subject, re.IGNORECASE):
            out.insert(0, ('ERROR', 0, 1, subject,
                           'subject stacks two reply prefixes; keep one «Re: <original subject>»'))
    if text.strip() and 'Abshalom Dayan' not in text:
        out.append(('WARN', len(lines), 1, '', 'not signed «Abshalom Dayan»'))
    return sorted(out, key=lambda f: (f[0] != 'ERROR', f[1], f[2]))


def main(argv):
    subject = None
    args = list(argv)
    if '--subject' in args:
        i = args.index('--subject')
        subject = args[i + 1] if i + 1 < len(args) else ''
        del args[i:i + 2]
    if not args or args[0] == '-':
        text = sys.stdin.read()
    else:
        with open(args[0], encoding='utf-8') as f:
            text = f.read()
    findings = check(text, subject)
    for level, line, col, found, message in findings:
        where = 'subject' if line == 0 else f'{line}:{col}'
        shown = f' «{found}»' if found else ''
        print(f'{level} {where}{shown}: {message}')
    if not findings:
        print('OK')
    return 1 if any(f[0] == 'ERROR' for f in findings) else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
