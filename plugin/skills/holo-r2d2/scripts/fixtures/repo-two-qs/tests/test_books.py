import json

from shelf import books, cli, report


def setup_function():
    books.clear()


def test_add_then_find():
    books.add("Dune", "Frank Herbert")
    assert books.find("Dune") == [{"title": "Dune", "author": "Frank Herbert"}]


def test_report_counts_books():
    books.add("Dune", "Frank Herbert")
    books.add("Emma", "Jane Austen")
    assert report.summary() == "2 books"


def test_report_on_empty_shelf():
    assert report.summary() == "0 books"


def test_list_json(capsys):
    books.add("Dune", "Frank Herbert")
    cli.main(["list", "--json"])
    assert json.loads(capsys.readouterr().out) == [{"title": "Dune", "author": "Frank Herbert"}]


def test_find_ignores_case():
    books.add("Dune", "Frank Herbert")
    assert len(books.find("dune")) == 1


def test_blank_title_refused():
    import pytest

    with pytest.raises(ValueError):
        books.add("  ", "Frank Herbert")


def test_by_author():
    books.add("Dune", "Frank Herbert")
    books.add("Dune Messiah", "Frank Herbert")
    assert report.by_author() == {"Frank Herbert": 2}


def test_list_json_empty(capsys):
    cli.main(["list", "--json"])
    assert json.loads(capsys.readouterr().out) == []
