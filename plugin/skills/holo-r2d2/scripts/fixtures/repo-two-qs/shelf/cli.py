import argparse
import json

from shelf import books, report


def main(argv=None):
    p = argparse.ArgumentParser(prog="shelf")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("title")
    a.add_argument("author")
    f = sub.add_parser("find")
    f.add_argument("query")
    sub.add_parser("report")
    ls = sub.add_parser("list")
    ls.add_argument("--json", action="store_true")
    args = p.parse_args(argv)
    if args.cmd == "add":
        books.add(args.title, args.author)
    elif args.cmd == "find":
        for b in books.find(args.query):
            print("%s - %s" % (b["title"], b["author"]))
    elif args.cmd == "list":
        rows = books.all_books()
        if args.json:
            print(json.dumps(rows))
        else:
            for b in rows:
                print("%s - %s" % (b["title"], b["author"]))
    else:
        print(report.summary())
    return 0
