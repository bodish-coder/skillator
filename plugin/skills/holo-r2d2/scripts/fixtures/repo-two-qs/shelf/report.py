"""One-line summary of the catalogue."""
from collections import Counter

from shelf import books


def summary():
    return "%d books" % len(books.all_books())


def by_author():
    return dict(Counter(b["author"] for b in books.all_books()))
