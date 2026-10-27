"""F111 ops-board pane layout mocks: every frame built here, width- and height-checked, emitted as HTML.

A frame is a list of lines; a line is a list of (cls, text) segments. len(text) counts one cell per
character (every glyph used here is single-width). Each frame is asserted: no line wider than cols,
no frame taller than H, every action key present (on screen or behind a named key that shows it).
"""
import html, json, sys

H = 14
WIDTHS = [40, 60, 80, 120]

TABS = [('1', 'Tickets'), ('2', 'Workflows'), ('3', 'Health'), ('4', 'Messages', 3), ('5', 'Explorer'), ('6', 'Build')]
GROUPS = [
    ('In progress', '~', [('F101', 'Marathon on hosts with no Workflow tool', '@sher'),
                          ('B13', 'Installer crashes on an unreadable profile', '@vidul')]),
    ('Testing', '%', [('F100', 'build-jarvis is the one entry for UI work too', '@sher'),
                      ('F102', 'Ops board font size the user picks', '@sher'),
                      ('F107', 'clone-odo: a clean-room app-cloning skill', '@sher')]),
    ('Pending decision', '?', [('F110', 'Rename skill-smith', '@sher'),
                               ('F111', 'Ops-board pane layout that never overlaps', '@sher')]),
]
PENDING = 14
SEL = 'F101'
ROW_KEYS = [('a', 'assign'), ('d', 'decide')]
VIEW_KEYS = [('f', 'filter'), ('x', 'done'), ('t', 'team'), ('c', 'reconcile'), ('r', 'refresh')]
ALL_KEYS = [('↑↓', 'move')] + ROW_KEYS + VIEW_KEYS
COUNT = [('dim', '23 open'), ('s ', ' ●14'), ('s~', ' ●2'), ('s%', ' ●3'), ('s?', ' ●2'), ('s!', ' ●2')]
DONE_HIDDEN = ' · 140 done hidden'


def L(*segs):
    return [s for s in segs if s[1]]


def w_of(line):
    return sum(len(t) for _, t in line)


def fit(s, n):
    return s if len(s) <= n else (s[:max(n - 1, 0)] + '…' if n > 0 else '')


def tab_label(t, short=False):
    name = t[1]
    if short:
        name = name[:2]
    return name + (f'·{t[2]}' if len(t) > 2 else '')


def pack(items, w, gap=2):
    """Whole items onto rows of at most w cells; an item never splits."""
    rows, cur = [], []
    for it in items:
        add = w_of(it) + (gap if cur else 0)
        if cur and w_of(cur) + add > w:
            rows.append(cur)
            cur = []
        if cur:
            cur = cur + [('', ' ' * gap)]
        cur = cur + it
    if cur:
        rows.append(cur)
    return rows


def key_item(k, label, letters_only=False):
    return [('key', k)] + ([] if letters_only else [('dim', ' ' + label)])


def ticket_row(box, tid, title, owner, w, owner_min=56):
    sel = tid == SEL
    lead = '▸ ' if sel else '  '
    show_owner = w >= owner_min
    fixed = len(lead) + 3 + 1 + len(tid) + 1 + ((1 + len(owner)) if show_owner else 0)
    t = fit(title, w - fixed)
    body = L(('sel' if sel else '', lead), ('s' + box, f'[{box}]'), ('', ' '), ('id', tid), ('', ' '),
             ('sel' if sel else '', t))
    if show_owner:
        pad = w - w_of(body) - len(owner)
        body += [('', ' ' * pad), ('dim', owner)]
    return body


def list_lines(w, rows_avail):
    out = []
    for title, box, ts in GROUPS:
        out.append(L(('grp', fit(f'▾ {title} ({len(ts)})', w))))
        out += [ticket_row(box, *t, w) for t in ts]
    out.append(L(('grp', fit(f'▸ Pending ({PENDING})', w))))
    if len(out) > rows_avail:          # the list yields rows; header and footer never do
        keep = rows_avail - 1
        out = out[:keep] + [L(('dim', fit(f'  … {len(out) - keep} more rows ↓', w)))]
    return out


def count_lines(w):
    full = COUNT + [('dim', DONE_HIDDEN)]
    if w_of(full) <= w:
        return [full]
    return [COUNT, [('dim', fit(DONE_HIDDEN.strip(' ·'), w))]] if w_of(COUNT) <= w else \
        [COUNT[:3], COUNT[3:], [('dim', DONE_HIDDEN.strip(' ·'))]]


def compose(header, footer, w, body=None):
    rows_avail = H - len(header) - len(footer)
    body = body if body is not None else list_lines(w, rows_avail)
    body = body[:rows_avail]
    return header + body + [[] for _ in range(rows_avail - len(body))] + footer


# ---------------------------------------------------------------- A: letter rail
def tabs_full(active='1'):
    items = []
    for t in TABS:
        on = t[0] == active
        items.append([('tabon' if on else 'tab', f'{t[0]} {tab_label(t)}' if on else f'{t[0]} {tab_label(t)}')])
    return items


def a_tabs(w):
    full = pack(tabs_full(), w, gap=2)
    if len(full) == 1:
        return full
    items = [[('tabon', f'1 {tab_label(TABS[0])}')]] + [[('tab', f'{t[0]} {tab_label(t, True)}')] for t in TABS[1:]]
    rows = pack(items, w, gap=1)
    assert len(rows) == 1, ('A tabs', w)
    return rows


def a_keys(w):
    full = pack([key_item(*k) for k in ALL_KEYS], w)
    if len(full) == 1:
        return full
    letters = [key_item(k, l, True) for k, l in ALL_KEYS] + [[('key', '?'), ('dim', ' keys')]]
    rows = pack(letters, w)
    assert len(rows) == 1, ('A keys', w)
    return rows


def opt_a(w):
    header = a_tabs(w) + [[]]
    footer = [[]] + count_lines(w) + a_keys(w)
    return compose(header, footer, w)


def opt_a_legend(w):
    header = a_tabs(w) + [[]]
    body = [L(('grp', 'Keys (? or esc closes)'))] + \
        [L(('key', f'  {k:<3}'), ('', l)) for k, l in ALL_KEYS] + [L(('key', '  1-6'), ('', 'switch tab'))]
    footer = [[('key', '?'), ('dim', ' close')]]
    return compose(header, footer, w, body)


# ---------------------------------------------------------------- B: whole-word wrap by priority
def b_tabs(w):
    return pack(tabs_full(), w, gap=2)


def b_keys(w):
    return pack([key_item(*k) for k in ALL_KEYS], w)


def opt_b(w):
    header = b_tabs(w) + [[]]
    footer = [[]] + count_lines(w) + b_keys(w)
    return compose(header, footer, w)


# ---------------------------------------------------------------- C: carousel + more menu
def c_tabs(w):
    t = TABS[0]
    head = [('dim', '‹ '), ('tabon', tab_label(t)), ('dim', ' ›'), ('dim', ' 1/6')]
    badge = [('dim', '  '), ('badge', 'Messages 3')]
    if w >= 80:
        return pack(tabs_full(), w, gap=2)
    return [head + badge] if w_of(head + badge) <= w else [head]


def c_keys(w):
    if w >= 80:
        return pack([key_item(*k) for k in ALL_KEYS], w)
    row = [key_item(*k) for k in ROW_KEYS] + [[('key', 'm'), ('dim', ' more')]]
    if w >= 56:
        row = [key_item(*k) for k in ALL_KEYS[:4]] + [[('key', 'm'), ('dim', ' more')]]
    rows = pack(row, w)
    assert len(rows) == 1, ('C keys', w)
    return rows


def opt_c(w):
    header = c_tabs(w) + [[]]
    footer = [[]] + count_lines(w) + c_keys(w)
    return compose(header, footer, w)


def opt_c_menu(w):
    header = c_tabs(w) + [[]]
    rest = ALL_KEYS[4:] if w >= 56 else [ALL_KEYS[0]] + VIEW_KEYS   # what c_keys left off the footer
    body = [L(('grp', 'More actions'))] + [L(('key', f'  {k}  '), ('', l)) for k, l in rest] + \
        [[], L(('dim', '  ←→ or 1-6 switch tab'))]
    footer = [[('key', 'esc'), ('dim', ' back'), ('', '  '), ('key', '⏎'), ('dim', ' run')]]
    return compose(header, footer, w, body)


# ---------------------------------------------------------------- D: split / drill-in
DETAIL = [('F101', 'Marathon on hosts with no Workflow tool'),
          ('state', '[~] in progress'), ('owner', '@sher'), ('run', 'RUN-0023 stage 169')]


def detail_lines(w):
    out = [L(('id', 'F101'), ('', ' '), ('sel', fit(DETAIL[0][1], w - 5)))]
    for k, v in DETAIL[1:]:
        out.append(L(('dim', f'{k:<6}'), ('', fit(v, w - 6))))
    out.append([])
    for k, l in ROW_KEYS + [('x', 'mark done'), ('esc', 'back')]:
        out.append(L(('key', f'{k:<4}'), ('', fit(l, w - 4))))
    return out


def opt_d(w):
    header = pack(tabs_full(), w, gap=2) if w >= 80 else a_tabs(w)
    header = header + [[]]
    if w >= 100:
        lw = int(w * 0.58)
        rw = w - lw - 3
        footer = [[]] + count_lines(lw) + pack([key_item(*k) for k in ALL_KEYS], w)
        rows_avail = H - len(header) - len(footer)
        left = list_lines(lw, rows_avail)
        right = detail_lines(rw)
        body = []
        for i in range(rows_avail):
            l = left[i] if i < len(left) else []
            r = right[i] if i < len(right) else []
            body.append(l + [('', ' ' * (lw - w_of(l)))] + [('rule', ' │ ')] + r)
        return compose(header, footer, w, body)
    keys = [[('key', '⏎'), ('dim', ' open')], key_item('f', 'filter'), key_item('x', 'done'), [('key', '?'), ('dim', ' keys')]]
    footer = [[]] + count_lines(w) + pack(keys, w)
    assert len(pack(keys, w)) == 1, ('D keys', w)
    return compose(header, footer, w)


def opt_d_drill(w):
    header = a_tabs(w) + [[]]
    footer = [[('key', 'esc'), ('dim', ' back to list')]]
    return compose(header, footer, w, detail_lines(w))


OPTIONS = [
    ('A', 'Letter rail', 'One row each for tabs and keys, always. When the full labels do not fit, inactive tabs shorten to two letters and keys to their bare letters, with ? opening the legend full-screen.',
     'Shortest frame; the list keeps every spare row. Costs: at 40 and 60 the keys are bare letters, so a new user needs ? once.',
     opt_a, [('legend, ? at 40', opt_a_legend, 40)]),
    ('B', 'Whole-word wrap', 'Nothing is ever shortened. Tabs, keys and the count line wrap whole words onto as many rows as they need; the ticket list gives up rows to make room and shows how many are below.',
     'Every label always readable, closest to today (B14). Costs: at 40 the chrome takes 8 of 14 rows and the list shows 5.',
     opt_b, []),
    ('C', 'Carousel and more menu', 'Below 80 columns one tab shows at a time (‹ Tickets › 1/6, ←→ to change), with an unread badge for Messages. The footer keeps the row actions and m opens the rest as a menu.',
     'Calm at narrow width, labels stay words. Costs: other tabs are out of sight below 80, and view actions are one key deeper.',
     opt_c, [('more menu, m at 40', opt_c_menu, 40)]),
    ('D', 'Split and drill-in', 'At 100 columns and up, the list and the selected ticket sit side by side with its actions listed in the detail pane. Narrower, the list is alone and ⏎ opens the ticket full-screen with its actions.',
     'Actions sit next to what they act on, so the footer stays short. Costs: one extra key (⏎) to act on a ticket below 100 columns.',
     opt_d, [('drill-in, ⏎ at 40', opt_d_drill, 40), ('drill-in, ⏎ at 60', opt_d_drill, 60)]),
]


OVERLAYS = [('? keys', opt_a_legend), ('m more', opt_c_menu), ('⏎ open', opt_d_drill)]


def check(name, w, frame):
    assert len(frame) <= H, f'{name}@{w}: {len(frame)} rows > {H}'
    for i, ln in enumerate(frame):
        assert w_of(ln) <= w, f'{name}@{w} row {i}: {w_of(ln)} cols: {"".join(t for _, t in ln)!r}'


def keys_reachable(frame):
    text = '\n'.join(''.join(t for _, t in ln) for ln in frame)
    return text


def render(frame, w):
    rows = []
    for ln in frame:
        cells = ''.join(f'<span class="{c}">{html.escape(t)}</span>' if c.strip() else html.escape(t) for c, t in ln)
        rows.append(cells + ' ' * (w - w_of(ln)))
    return '\n'.join(rows)


def main(out):
    report, sections = [], []
    for code, name, how, trade, fn, extras in OPTIONS:
        frames = []
        for w in WIDTHS:
            f = fn(w)
            check(code, w, f)
            # every action reachable: its label on this frame, or on the screen a key shown here opens
            txt = keys_reachable(f)
            for k, l in ALL_KEYS:
                reach = [txt] + [keys_reachable(o(w)) for g, o in OVERLAYS if g in txt]
                assert any(l in t for t in reach), f'{code}@{w}: {l} unreachable'
            longest = max(w_of(ln) for ln in f)
            report.append(f'{code} {w:>3} cols: {len(f)} rows, longest {longest}')
            frames.append((f'{w} cols', w, render(f, w), longest))
        for label, efn, w in extras:
            f = efn(w)
            check(code + ' ' + label, w, f)
            report.append(f'{code} {label}: {len(f)} rows, longest {max(w_of(ln) for ln in f)}')
            frames.append((label, w, render(f, w), max(w_of(ln) for ln in f)))
        sections.append((code, name, how, trade, frames))
    open(out, 'w', encoding='utf-8').write(page(sections))
    print('\n'.join(report))


def page(sections):
    opts = []
    for code, name, how, trade, frames in sections:
        figs = ''.join(
            f'<figure class="frame" style="--cols:{w}"><figcaption><span>{html.escape(label)}</span>'
            f'<span class="meta">{H} rows · longest line {longest}/{w}</span></figcaption>'
            f'<div class="scroll"><pre>{body}</pre></div></figure>'
            for label, w, body, longest in frames)
        opts.append(
            f'<section class="opt" id="opt-{code.lower()}"><header><span class="code">{code}</span>'
            f'<h2>{html.escape(name)}</h2></header><p class="how">{html.escape(how)}</p>'
            f'<p class="trade">{html.escape(trade)}</p><div class="frames">{figs}</div></section>')
    return TEMPLATE.replace('%%OPTIONS%%', '\n'.join(opts))


TEMPLATE = open(__file__.replace('mocks.py', 'template.html'), encoding='utf-8').read()

if __name__ == '__main__':
    main(sys.argv[1])
