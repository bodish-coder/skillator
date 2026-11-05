import csv
import datetime
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr

from _load import load

reviews = load("reviews")

ROWS = [
    ("app-store", "https://apps.apple.com/r/1", "2026-08-01", "1",
     "Way too expensive for what it is. I wish it had SMS reminders."),
    ("google-play", "https://play.google.com/r/2", "2026-07-15", "2",
     "The price doubled this year. Support never replied to my ticket."),
    ("g2", "https://www.g2.com/r/3", "2026-06-01", "2",
     "Overpriced per seat. No way to set buffer times between meetings."),
    ("reddit", "https://www.reddit.com/r/x/comments/4", "2026-05-01", "",
     "Honestly the subscription is the dealbreaker for my small team."),
    ("app-store", "https://apps.apple.com/r/5", "2026-08-10", "5",
     "Love it, works great every day."),
    ("capterra", "https://www.capterra.com/r/6", "2026-07-01", "1",
     "It crashes every time I open the calendar view."),
    ("app-store", "https://apps.apple.com/r/7", "2026-08-02", "1",
     "Booked twice for the same slot and the client was furious."),
    # no url: must be dropped, never counted
    ("app-store", "", "2026-08-01", "1", "Expensive and buggy."),
    # duplicate text: counted once
    ("google-play", "https://play.google.com/r/9", "2026-07-16", "2",
     "The price doubled this year.  Support never replied to my ticket."),
]


def write_csv(path, rows, header=("source", "url", "date", "rating", "text")):
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)


class Feedback(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "reviews.csv")
        write_csv(self.path, ROWS)
        self.themes, self.req = reviews.load_themes()
        self.kept, self.dropped, self.dupes = reviews.load_reviews(self.path)
        self.result = reviews.analyse(self.kept, self.themes, self.req,
                                      today=datetime.date(2026, 10, 1))

    def tearDown(self):
        self.tmp.cleanup()

    def test_unsourced_rows_are_dropped_and_duplicates_removed(self):
        self.assertEqual(self.dropped, 1)
        self.assertEqual(self.dupes, 1)
        self.assertEqual(len(self.kept), 7)

    def test_price_is_the_top_complaint(self):
        top = [t for t in self.result["themes"] if t["kind"] == "complaint"][0]
        self.assertEqual(top["id"], "pricing")
        self.assertEqual(top["count"], 4)
        self.assertFalse(top["thin"])
        self.assertEqual(len(top["sources"]), 4)

    def test_every_quote_is_verbatim_and_linked(self):
        by_url = {r["url"]: r["text"] for r in self.kept}
        quotes = [q for t in self.result["themes"] for q in t["quotes"]]
        quotes += self.result["requests"]
        self.assertTrue(quotes)
        for q in quotes:
            self.assertIn(q["url"], by_url)
            self.assertIn(q["quote"], by_url[q["url"]])
            self.assertFalse(q["truncated"])

    def test_requests_are_found_in_their_own_words(self):
        texts = [q["quote"] for q in self.result["requests"]]
        self.assertTrue(any("SMS reminders" in t for t in texts))
        self.assertTrue(any("buffer times" in t for t in texts))

    def test_single_source_theme_is_thin(self):
        bugs = next(t for t in self.result["themes"] if t["id"] == "bugs")
        self.assertTrue(bugs["thin"])

    def test_unthemed_low_ratings_are_surfaced(self):
        urls = [r["url"] for r in self.result["unthemed_negative"]]
        self.assertIn("https://apps.apple.com/r/7", urls)

    def test_old_reviews_count_half(self):
        rv = {"rating": 1.0, "date": datetime.date(2023, 1, 1)}
        self.assertEqual(reviews.weight(rv, datetime.date(2026, 10, 1), 18), 0.5)
        rv = {"rating": None, "date": None}
        self.assertEqual(reviews.weight(rv, datetime.date(2026, 10, 1), 18), 0.6)

    def test_render_has_small_sample_warning_and_links(self):
        text = reviews.render(self.result, self.dropped, self.dupes)
        self.assertIn("Small sample", text)
        self.assertIn("1 rows dropped", text)
        self.assertIn("https://www.g2.com/r/3", text)
        self.assertNotIn(chr(0x2014), text)

    def test_cli_requires_url_column(self):
        p = os.path.join(self.tmp.name, "nourl.csv")
        write_csv(p, [("app-store", "great")], header=("source", "text"))
        with redirect_stderr(io.StringIO()):
            self.assertEqual(reviews.main([p]), 2)

    def test_cli_json_and_out(self):
        out = os.path.join(self.tmp.name, "feedback.md")
        with redirect_stdout(io.StringIO()):
            self.assertEqual(reviews.main([self.path, "--today", "2026-10-01",
                                           "--out", out]), 0)
        with open(out) as fh:
            self.assertIn("# What users of the original hate and want", fh.read())
        buf = io.StringIO()
        with redirect_stdout(buf):
            reviews.main([self.path, "--json", "--today", "2026-10-01"])
        data = json.loads(buf.getvalue())
        self.assertEqual(data["dropped"], 1)

    def test_snippet_truncates_around_the_match(self):
        import re
        pat = re.compile("expensive")
        # Match in the middle (>220 chars)
        mid_text = "x" * 300 + " too expensive " + "y" * 300
        s, trunc = reviews.snippet_with_meta(mid_text, pat, limit=100)
        self.assertEqual(reviews.snippet(mid_text, pat, limit=100), s)
        self.assertIn("expensive", s)
        self.assertIn(s, mid_text)
        self.assertTrue(trunc)
        self.assertLessEqual(len(s), 100)

        # Match near start (>220 chars)
        start_text = "Way too expensive right at the start " + "z" * 300
        s_start, trunc_start = reviews.snippet_with_meta(start_text, pat)
        self.assertIn("expensive", s_start)
        self.assertIn(s_start, start_text)
        self.assertTrue(trunc_start)
        self.assertLessEqual(len(s_start), 220)

        # Match near end (>220 chars)
        end_text = "a" * 300 + " and at the very end it is too expensive"
        s_end, trunc_end = reviews.snippet_with_meta(end_text, pat)
        self.assertIn("expensive", s_end)
        self.assertIn(s_end, end_text)
        self.assertTrue(trunc_end)
        self.assertLessEqual(len(s_end), 220)

        # Fallback when no sentence split matches (pattern spans sentence boundary)
        fallback_text = "First sentence ends here. Second starts here " + "b" * 300
        cross_pat = re.compile(r"here\.\s+Second")
        s_fb, trunc_fb = reviews.snippet_with_meta(fallback_text, cross_pat)
        self.assertIn(s_fb, fallback_text)
        self.assertTrue(trunc_fb)
        self.assertLessEqual(len(s_fb), 220)

        # Analyse integration with long reviews: raw quote membership & truncated metadata
        long_rows = [
            ("app-store", "https://apps.apple.com/r/long1", "2026-08-01", "1",
             "w" * 150 + " way too expensive for my team and I wish it had " + "v" * 150),
        ]
        long_path = os.path.join(self.tmp.name, "long.csv")
        write_csv(long_path, long_rows)
        kept_long, _, _ = reviews.load_reviews(long_path)
        res_long = reviews.analyse(kept_long, self.themes, self.req,
                                   today=datetime.date(2026, 10, 1))
        src_text = kept_long[0]["text"]
        for t in res_long["themes"]:
            for q in t["quotes"]:
                self.assertIn(q["quote"], src_text)
                self.assertTrue(q["truncated"])
        for q in res_long["requests"]:
            self.assertIn(q["quote"], src_text)
            self.assertTrue(q["truncated"])


if __name__ == "__main__":
    unittest.main()
