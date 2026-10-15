"""The catalogue, in memory."""
_BOOKS = []


def add(title, author):
    if not title.strip():
        raise ValueError("title must not be blank")
    book = {"title": title, "author": author}
    _BOOKS.append(book)
    return book


def find(query):
    q = query.casefold()
    return [b for b in _BOOKS if q in b["title"].casefold()]


def all_books():
    return list(_BOOKS)


def clear():
    _BOOKS.clear()
