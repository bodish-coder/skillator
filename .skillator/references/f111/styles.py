"""F111 style options for layout B (whole-word wrap): same regions and wrap rules, four visual treatments.

Reuses mocks.py's data and packing. Every frame is checked as before (width, 14 rows, every action on screen);
the ASCII style is also checked for no codepoint above 127 (tui-tron section 4).
"""
import html, importlib.util, os, sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mocks', os.path.join(here, 'mocks.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
H, WIDTHS, TABS, GROUPS, PENDING, SEL, ALL_KEYS = m.H, m.WIDTHS, m.TABS, m.GROUPS, m.PENDING, m.SEL, m.ALL_KEYS
w_of, fit, pack = m.w_of, m.fit, m.pack
STATE = {'~': 'in progress', '%': 'testing', '?': 'decide'}


class Style:
    ascii = False
    rule_rows = False

    def g(self, uni, asc):
        return asc if self.ascii else uni

    def tab(self, t, on):
        label = f'{t[0]} {t[1]}' + (f' {t[2]}' if len(t) > 2 else '')
        return [('tabon' if on else 'tab', label)]

    def key(self, k, label):
        return [('key', k), ('dim', ' ' + label)]

    def group(self, title, box, n, w):
        return [('grp', fit(f'{self.g("▾", "v")} {title} ({n})', w))]

    def collapsed(self, title, n, w):
        return [('grp', fit(f'{self.g("▸", ">")} {title} ({n})', w))]

    def row(self, box, tid, title, owner, w):
        sel = tid == SEL
        lead = self.g('▸ ', '> ') if sel else '  '
        show_owner = w >= 56
        fixed = len(lead) + 4 + len(tid) + 1 + ((1 + len(owner)) if show_owner else 0)
        t = self.cut(title, w - fixed)
        body = [('sel' if sel else '', lead), ('s' + box, f'[{box}]'), ('sel' if sel else '', ' '), ('id', tid),
                ('sel' if sel else '', ' ' + t)]
        if show_owner:
            body += [('sel' if sel else '', ' ' * (w - w_of(body) - len(owner))), ('dim', owner)]
        return [s for s in body if s[1]]

    def cut(self, s, n):
        if len(s) <= n:
            return s
        e = self.g('…', '...')
        return s[:max(n - len(e), 0)] + e

    def more(self, n, w):
        return [('dim', fit(f'  {self.g("…", "...")} {n} more rows {self.g("↓", "v")}', w))]

    def counts(self, w):
        dot = self.g('●', '*')
        segs = [('dim', '23 open')] + [(f's{b}', f' {dot}{n}') for b, n in ((' ', 14), ('~', 2), ('%', 3), ('?', 2), ('!', 2))]
        tail = [('dim', ' · 140 done hidden' if not self.ascii else ' - 140 done hidden')]
        return [segs + tail] if w_of(segs + tail) <= w else [segs, [('dim', '140 done hidden')]]

    def rule(self, w):
        return [('rule', self.g('─', '-') * w)]

    def keys(self):
        k = list(ALL_KEYS)
        if self.ascii:
            k[0] = ('^v', 'move')
        return k

    def frame(self, w):
        header = pack([self.tab(t, t[0] == '1') for t in TABS], w, gap=2)
        header += [self.rule(w)] if self.rule_rows else [[]]
        footer = ([self.rule(w)] if self.rule_rows else [[]]) + self.counts(w) + \
            pack([self.key(*k) for k in self.keys()], w, gap=2)
        avail = H - len(header) - len(footer)
        body = []
        for title, box, ts in GROUPS:
            body.append(self.group(title, box, len(ts), w))
            body += [self.row(box, *t, w) for t in ts]
        body.append(self.collapsed('Pending', PENDING, w))
        if len(body) > avail:
            keep = avail - 1
            body = body[:keep] + [self.more(len(body) - keep, w)]
        return header + body + [[] for _ in range(avail - len(body))] + footer


class Quiet(Style):
    """Today's look, tidied: chrome dim, colour only on the status box and the active tab."""


class Rails(Style):
    """Each group is a coloured rail; the header carries the state name and count; the selection is a full bar."""

    def tab(self, t, on):
        label = f'{t[0]} {t[1]}' + (f' {t[2]}' if len(t) > 2 else '')
        return [('acc' if on else 'tab', ('● ' if on else '') + label)]

    def group(self, title, box, n, w):
        return [('s' + box, '▌ '), ('grpb s' + box, fit(f'{title}  {n}', w - 2))]

    def collapsed(self, title, n, w):
        return [('dim', '▏ '), ('grp', fit(f'{title}  {n}  ▸', w - 2))]

    def row(self, box, tid, title, owner, w):
        sel = tid == SEL
        c = 'selbar' if sel else ''
        show_owner = w >= 56
        fixed = 2 + len(tid) + 1 + ((1 + len(owner)) if show_owner else 0)
        t = self.cut(title, w - fixed)
        body = [('s' + box, '▌ '), (c + ' id' if c else 'id', tid), (c, ' ' + t)]
        if show_owner:
            body += [(c, ' ' * (w - w_of(body) - len(owner))), (c + ' dim' if c else 'dim', owner)]
        elif c:
            body += [(c, ' ' * (w - w_of(body)))]
        return body

    def key(self, k, label):
        return [('acc', k), ('dim', ' ' + label)]


class Keycaps(Style):
    """Bracketed tabs and keycaps, hairline rules between regions; groups as labelled rules."""
    rule_rows = True

    def tab(self, t, on):
        label = f'{t[0]} {t[1]}' + (f' {t[2]}' if len(t) > 2 else '')
        return [('tabon2', f'[{label}]')] if on else [('tab', f' {label} ')]

    def key(self, k, label):
        return [('cap', f'[{k}]'), ('dim', ' ' + label)]

    def group(self, title, box, n, w):
        head = f'── {title} · {n} '
        return [('s' + box, fit(head, w)), ('rule', '─' * max(0, w - len(head)))]

    def collapsed(self, title, n, w):
        head = f'── {title} · {n} ▸ '
        return [('grp', fit(head, w)), ('rule', '─' * max(0, w - len(head)))]


class Mono(Style):
    """No colour needed and pure ASCII: state as a word, selection inverse, structure from case and brackets."""
    ascii = True

    def tab(self, t, on):
        label = f'{t[0]} {t[1]}' + (f' {t[2]}' if len(t) > 2 else '')
        return [('inv', f' {label} ')] if on else [('', f' {label} ')]

    def group(self, title, box, n, w):
        return [('b', fit(f'{title.upper()} ({n})', w))]

    def collapsed(self, title, n, w):
        return [('b', fit(f'{title.upper()} ({n}) +', w))]

    def row(self, box, tid, title, owner, w):
        sel = tid == SEL
        word = {'~': 'wip ', '%': 'test', '?': 'dec '}[box]
        show_owner = w >= 56
        fixed = 2 + len(word) + 1 + len(tid) + 1 + ((1 + len(owner)) if show_owner else 0)
        t = self.cut(title, w - fixed)
        text = f'{"> " if sel else "  "}{word} {tid} {t}'
        if show_owner:
            text += ' ' * (w - len(text) - len(owner)) + owner
        return [('inv' if sel else '', text)]

    def key(self, k, label):
        return [('b', k), ('', ' ' + label)]


STYLES = [
    ('1', 'Quiet', Quiet(), 'Today\'s look, tidied. Chrome stays dim; colour lands only on the status box and the active tab, so the titles carry the screen.',
     'Least change from now, calm in any theme. Weakest at telling groups apart at a glance.'),
    ('2', 'Status rails', Rails(), 'Each group gets a coloured rail down its left edge, its header names the state and the count, and the selected row is a full-width bar.',
     'Groups read from across the room and the selection is unmissable. Uses colour hardest; needs the 256-colour palette to look right.'),
    ('3', 'Keycaps and rules', Keycaps(), 'Tabs in brackets, keys drawn as [a] keycaps, hairline rules under the tabs and above the footer, and each group as a labelled rule.',
     'The most "app-like": every key looks pressable and regions are fenced. The two rules cost two list rows at every width.'),
    ('4', 'Mono ASCII', Mono(), 'Works with no colour and no Unicode: state spelled as a word (wip, test, dec), groups in capitals, the selection in reverse video, ASCII glyphs only.',
     'Safe on any console, codepage and colour-blind reader; doubles as the required ASCII fallback. Plainest to look at.'),
]


def render(frame, w):
    out = []
    for ln in frame:
        cells = ''.join(f'<span class="{c}">{html.escape(t)}</span>' if c.strip() else html.escape(t) for c, t in ln)
        out.append(cells + ' ' * (w - w_of(ln)))
    return '\n'.join(out)


def main(out):
    secs, report = [], []
    for code, name, st, how, trade in STYLES:
        figs = []
        for w in WIDTHS:
            f = st.frame(w)
            m.check(f'S{code}', w, f)
            txt = '\n'.join(''.join(t for _, t in ln) for ln in f)
            for k, l in ALL_KEYS:
                assert l in txt, f'S{code}@{w}: {l} not on screen'
            if st.ascii:
                bad = [c for c in txt if ord(c) > 127]
                assert not bad, f'S{code}@{w}: non-ASCII {bad[:5]!r}'
            longest = max(w_of(ln) for ln in f)
            report.append(f'S{code} {w:>3}: {len(f)} rows, longest {longest}' + (', ascii ok' if st.ascii else ''))
            figs.append(f'<figure class="frame" style="--cols:{w}"><figcaption><span>{w} cols</span>'
                        f'<span class="meta">{H} rows · longest {longest}/{w}</span></figcaption>'
                        f'<div class="scroll"><pre>{render(f, w)}</pre></div></figure>')
        secs.append(f'<section class="opt"><header><span class="code">{code}</span><h2>{html.escape(name)}</h2></header>'
                    f'<p class="how">{html.escape(how)}</p><p class="trade">{html.escape(trade)}</p>'
                    f'<div class="frames">{"".join(figs)}</div></section>')
    tpl = open(os.path.join(here, 'styles-template.html'), encoding='utf-8').read()
    open(out, 'w', encoding='utf-8').write(tpl.replace('%%OPTIONS%%', '\n'.join(secs)))
    print('\n'.join(report))


if __name__ == '__main__':
    main(sys.argv[1])
