"""The address of a school on the site, /<fylke>/<skole>: the Python twin of
slug() in web/src/helpers.ts. Both sides assert the same fixture table."""
import re
import unicodedata


def slug(text):
    t = unicodedata.normalize('NFC', text).lower()
    t = t.replace('æ', 'ae').replace('ø', 'o').replace('å', 'a')
    t = ''.join(c for c in unicodedata.normalize('NFD', t) if not unicodedata.combining(c))
    t = re.sub(r'[^a-z0-9]+', '-', t)
    return t.strip('-')


def school_path(fylke, name):
    return f'/{slug(fylke)}/{slug(name)}'
