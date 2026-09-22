# Checks — the command, the snippet, the keystroke

Numbered to match the sweep table in SKILL.md §3. Nothing here is optional
because a class "looked fine in the source".

**Driver.** Pick one and say which you used: `claude-in-chrome` (invoke the
skill, then load tools in one `ToolSearch` call) · `browse` (gstack headless,
fastest for a screenshot-and-assert loop) · `webapp-testing` (scripted
interaction) · Playwright already in the repo · the iOS Simulator / Android
emulator for native. **No driver available → the deliverable is findings marked
`UNVERIFIED (no browser)`, never a verdict.**

The runtime snippets below are pasted into the page — the `javascript_tool`, the
DevTools console, or `page.evaluate()`. They print findings; they change nothing.

---

## 0. Automated floor (run first, believe it least)

```bash
npx @axe-core/cli http://localhost:3000 --tags wcag2a,wcag2aa,wcag21aa,wcag22aa --exit
npx pa11y --standard WCAG2AA --runner axe --runner htmlcs http://localhost:3000
npx lighthouse http://localhost:3000 --only-categories=accessibility --quiet --chrome-flags="--headless"
```

Multi-route, authenticated, or stateful UI → drive it in Playwright instead, so
you scan the state that actually fails (menu open, error shown, modal up):

```js
import AxeBuilder from '@axe-core/playwright'
const r = await new AxeBuilder({ page })
  .withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa'])
  .analyze()
```

Component-level regression guard: `jest-axe` / `vitest-axe` →
`expect(await axe(container)).toHaveNoViolations()`.

Static, in CI, before anything renders: `eslint-plugin-jsx-a11y`
(`plugin:jsx-a11y/recommended`), and for Vue `eslint-plugin-vuejs-accessibility`.

**Their ceiling:** they cannot see whether the focus order makes sense, whether
a name is *correct* rather than merely present, whether a live region actually
fired, whether the keyboard path completes a task, or whether the disabled state
is readable. Everything below exists because of that ceiling.

---

## 1. Reachability

Static first — these greps find most of it in seconds:

```bash
rg -n "onClick" --glob '*.{jsx,tsx,vue,svelte}' | rg "<(div|span|li|td|tr|img|a[^-])" 
rg -n "addEventListener\(['\"]click" --glob '*.{js,ts}'
rg -n "tabIndex=\{?[1-9]|tabindex=[\"']?[1-9]" 
rg -n "aria-hidden" --glob '*.{jsx,tsx,html,vue}'      # on anything focusable = a trap
rg -n ":hover" --glob '*.{css,scss}' -A2 | rg -n "display:\s*(block|flex)|visibility:\s*visible"
```

Then count in the browser — the interactive elements and the tab stops must agree:

```js
const focusables = [...document.querySelectorAll(
  'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable=""],[contenteditable="true"]')]
  .filter(el => !el.disabled && el.tabIndex > -1 && el.offsetParent !== null)
const clickable = [...document.querySelectorAll('[onclick],[role="button"],[role="link"],[role="tab"],[role="menuitem"]')]
console.table(clickable.filter(el => !focusables.includes(el))
  .map(el => ({ unreachable: el.tagName + '.' + el.className, text: el.textContent.trim().slice(0,40) })))
```

Empty table or it is a finding.

## 2. Traps and focus order

**Manual, and there is no substitute.** Hands off the mouse:

1. Reload. Press Tab once — the first stop should be a skip link or the first
   control, never `<body>` after fifteen invisible stops.
2. Tab to the end of the page. Every stop: visible, sensible, in reading order.
3. Shift+Tab back. Same stops, reverse. A stop reachable one way only is a bug.
4. Open every overlay (modal, drawer, menu, combobox, date picker). Inside:
   focus starts in it, Tab cycles *within* it, Escape closes it, focus returns
   to the trigger. Behind it: nothing is reachable (`inert` or `aria-hidden` on
   the background — and `inert` is the one that also blocks the mouse).
5. Trigger every async transition (route change, submit, delete). Focus must
   land somewhere deliberate, never on `<body>`.

Dump the order and compare it with the visual order:

```js
let i = 0, seen = new Set()
const log = []
document.body.addEventListener('focusin', e => {
  const el = e.target, r = el.getBoundingClientRect()
  log.push(`${++i}. ${el.tagName}.${el.className} "${(el.innerText||el.value||'').trim().slice(0,30)}" @${Math.round(r.top)},${Math.round(r.left)}`)
  if (seen.has(el) && i > 3) log.push('   ^ REVISITED — possible trap')
  seen.add(el)
}, true)
// Tab through, then: copy(log.join('\n'))
```

`@top,left` going up then down again is DOM order fighting visual order —
usually a CSS `order`, `row-reverse`, or a positioned sidebar.

## 3. Visible focus

```bash
rg -n "outline:\s*(none|0)" --glob '*.{css,scss,less}'
```

Legitimate only when `:focus-visible` supplies a replacement in the same file.
Then verify at runtime — the styles that *exist* and the styles that *apply* are
different questions:

```js
const bare = []
for (const el of document.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')) {
  const before = getComputedStyle(el).cssText
  el.focus()
  const s = getComputedStyle(el)
  const changed = s.outlineStyle !== 'none' || s.boxShadow !== 'none' || s.cssText !== before
  if (!changed) bare.push(el.tagName + '.' + el.className)
}
console.log('no visible focus:', bare)
```

Measure the ring against **both** the element and the page background (≥3:1,
WCAG 2.2 SC 1.4.11 / 2.4.13) with the contrast helper in §6. A ring that only
contrasts with the button and not with the page fails on the page side.

## 4. Name, role, value

The authority is the accessibility tree, not the markup. Read it in the DevTools
Accessibility pane, `page.accessibility.snapshot()` in Playwright, or with axe's
own name computation (`axe.commons.text.accessibleText(el)`) after injecting
`axe-core`. The heuristic below finds the empty ones fast:

```js
const name = el =>
  el.getAttribute('aria-label') ||
  (el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.innerText).join(' ').trim() ||
  (el.labels?.[0]?.innerText) ||
  el.innerText.trim() ||
  el.getAttribute('title') ||
  [...el.querySelectorAll('img[alt],svg title')].map(n=>n.alt||n.textContent).join(' ').trim()
console.table([...document.querySelectorAll('a[href],button,input,select,textarea,[role]')]
  .filter(el => !name(el))
  .map(el => ({ nameless: el.tagName + '.' + el.className, role: el.getAttribute('role') || '(implicit)' })))
```

Then check **value tracks state** — the failure a name check never catches. With
the widget open/checked/selected, confirm the matching attribute flipped:

```js
console.table([...document.querySelectorAll('[aria-expanded],[aria-selected],[aria-checked],[aria-pressed],[aria-current]')]
  .map(el => ({ el: el.tagName+'.'+el.className,
    expanded: el.getAttribute('aria-expanded'), selected: el.getAttribute('aria-selected'),
    checked: el.getAttribute('aria-checked'), pressed: el.getAttribute('aria-pressed') })))
```

Run it twice — before and after toggling. Identical output means the state is
visual only. See [patterns.md](patterns.md) for the contract per widget.

## 5. Live regions

Three distinct failures, three checks.

**Announces never** — the container is created together with the message. A
region must be in the DOM, empty, *before* the text arrives; AT only watches
regions it was already observing.

```js
console.table([...document.querySelectorAll('[aria-live],[role="status"],[role="alert"],[role="log"]')]
  .map(el => ({ el: el.tagName+'.'+el.className, live: el.getAttribute('aria-live') || el.getAttribute('role'),
                atomic: el.getAttribute('aria-atomic'), populatedAtLoad: el.textContent.trim().length > 0 })))
```

Empty table on a page with async results = nothing is announced anywhere.
`populatedAtLoad: true` on a status region means it will re-announce on load.

**Announces constantly** — `aria-live` on a container that also re-renders rows,
spinners, or timers. Watch it:

```js
new MutationObserver(m => console.log('LIVE FIRE', m.length, m[0].target.textContent.trim().slice(0,60)))
  .observe(document.querySelector('[aria-live], [role="status"]'), {childList:true, subtree:true, characterData:true})
```

One user action must produce one fire. A spinner frame counting as a fire is the
bug.

**Wrong urgency** — `role="alert"` / `aria-live="assertive"` interrupts whatever
the user is reading. Reserve it for errors and destructive outcomes; routine
results and "3 of 40 loaded" are `role="status"` (polite).

## 6. Contrast, in the states nobody screenshots

Do not eyeball, do not trust tokens, do not trust the design file. Pull the
computed colours off the rendered element and **resolve alpha and translucency**
by compositing over the nearest opaque ancestor — a `rgba(0,0,0,.55)` label over
a tinted card is the pair that quietly fails.

```js
const lum = ([r,g,b]) => { const s=[r,g,b].map(v=>v/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4)
  return 0.2126*s[0]+0.7152*s[1]+0.0722*s[2] }
const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05) }
const parse = c => (c.match(/[\d.]+/g)||[0,0,0,1]).map(Number)          // [r,g,b,a?]
const over = (fg, bg) => { const a = fg[3] ?? 1; return [0,1,2].map(i => fg[i]*a + bg[i]*(1-a)) }
const bgOf = el => { for (let n = el; n; n = n.parentElement) {
    const c = parse(getComputedStyle(n).backgroundColor)
    if ((c[3] ?? 1) > 0.99) return c.slice(0,3) } return [255,255,255] }
const check = el => { const s = getComputedStyle(el), bg = bgOf(el)
  const px = parseFloat(s.fontSize), large = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700)
  return { el: el.tagName+'.'+el.className, text: el.innerText?.trim().slice(0,24),
           ratio: +ratio(over(parse(s.color), bg), bg).toFixed(2), need: large ? 3 : 4.5 } }
console.table([...document.querySelectorAll('body *')].filter(el => el.innerText?.trim() && el.children.length === 0)
  .map(check).filter(r => r.ratio < r.need))
```

Then force the states the default render never shows and re-run `check`:

| State | How to force it |
|---|---|
| `:hover`, `:active`, `:focus`, `:visited` | DevTools Styles pane → **:hov** → force element state. In Playwright, `page.hover()` then evaluate |
| Disabled | `document.querySelectorAll('button,input').forEach(e=>e.disabled=true)` |
| Placeholder | `check` reads `color`, not `::placeholder` — sample it directly: `getComputedStyle(el,'::placeholder').color` |
| Error / invalid | Submit the form empty and with bad data. Never fabricate the class |
| Text on the accent button, badges, toasts | Trigger them; sample the real pair, not the token |
| Non-text (icons, ring, chart series, input borders, toggle track) | Same helper on `borderColor` / `fill` / `outlineColor`; needs ≥3:1 (SC 1.4.11) |
| Dark theme | Toggle it the way a user does, then run the whole set again |

**Report the numbers.** "Contrast checked" is not a check. Disabled text is
exempt from WCAG and still a finding — say so and let the owner decide.

## 7. Motion

```js
// emulation: DevTools → Rendering → Emulate CSS prefers-reduced-motion
// Playwright: await page.emulateMedia({ reducedMotion: 'reduce' })
```

Reload **after** emulating, then: (a) every reveal shows its content — the fatal
one is content whose opacity is 0 until an IntersectionObserver adds a class,
which ships a blank page; (b) nothing loops forever; (c) parallax, autoplaying
video, and carousels stop or offer a pause control (SC 2.2.2).

CSS-only greps miss JS animation. Every animation library needs the query too:

```bash
rg -n "framer-motion|gsap|animejs|motion/react|useSpring|requestAnimationFrame" --glob '*.{js,jsx,ts,tsx}'
rg -n "prefers-reduced-motion|useReducedMotion" --glob '*.{css,scss,js,jsx,ts,tsx}'
```

The second list must cover the first. Blanket
`@media (prefers-reduced-motion: reduce){*{animation:none!important}}` is not a
pass either — it can freeze a loading spinner into a lie; crossfade instead of
killing state-change feedback.

## 8. Forms

Submit an invalid form for real, then verify all five:

```js
console.table([...document.querySelectorAll('input,select,textarea')].map(el => ({
  el: el.name || el.id || el.className,
  name: (el.labels?.[0]?.innerText || el.getAttribute('aria-label') || '').trim() || '*** NONE ***',
  placeholderOnly: !el.labels?.length && !el.getAttribute('aria-label') && !!el.placeholder,
  invalid: el.getAttribute('aria-invalid'),
  describedBy: (el.getAttribute('aria-describedby')||'').split(/\s+/)
    .map(id => document.getElementById(id)?.innerText.trim()).filter(Boolean).join(' | ') || '(none)',
  autocomplete: el.getAttribute('autocomplete') || '(none)',
  required: el.required || el.getAttribute('aria-required') })))
```

- `placeholderOnly: true` → SC 3.3.2 failure; the name disappears on typing.
- `describedBy: (none)` while an error is on screen → the error exists only for
  sighted users.
- Colour-only error: remove the colour and ask whether the field still reads as
  broken — `html{filter:grayscale(1)}` and screenshot.
- Focus after a failed submit must move to the first invalid field or to an
  error summary that links to the fields. Verify with `document.activeElement`.
- `autocomplete` on name/email/address/tel/one-time-code fields (SC 1.3.5).

## 9. Headings and landmarks

```js
console.log([...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')]
  .map(h => '  '.repeat(+(h.tagName[1] || h.getAttribute('aria-level')) - 1) + h.tagName + ' ' + h.innerText.trim().slice(0,60)).join('\n'))
console.table([...document.querySelectorAll('main,nav,header,footer,aside,section[aria-label],[role]')]
  .filter(el => ['main','nav','banner','contentinfo','complementary','search','region'].includes(el.getAttribute('role') || {MAIN:'main',NAV:'nav',HEADER:'banner',FOOTER:'contentinfo',ASIDE:'complementary'}[el.tagName]))
  .map(el => ({ landmark: el.tagName, label: el.getAttribute('aria-label') || '(none)' })))
```

Then the check no script can do: screenshot the page and list what *looks* like
a heading. Anything on that list missing from the outline is a `div` doing
typography's job. Exactly one `<h1>`, no skipped levels, one `<main>`.

## 10. Images and icons

```js
console.table([...document.images].map(img => ({
  src: img.currentSrc.split('/').pop(), alt: img.getAttribute('alt'),
  problem: img.getAttribute('alt') === null ? 'MISSING alt'
    : /\.(png|jpe?g|svg|webp|gif)$/i.test(img.alt) ? 'alt restates the filename'
    : img.alt.trim() && img.closest('a,button')?.innerText.trim() ? 'duplicates its control label'
    : /^(image|icon|graphic|photo) ?(of)?$/i.test(img.alt.trim()) ? 'placeholder alt' : '' }))
  .filter(r => r.problem))
```

Plus: inline `<svg>` needs `aria-hidden="true"` when decorative, or `role="img"`
with a `<title>` when it carries meaning. Background-image icons carrying
information have no alt mechanism at all — they need a visually hidden label.
Charts and diagrams need a text alternative or an adjacent data table
(`dataviz` owns the chart side).

## 11. Target size

```js
console.table([...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,[role="button"],[role="tab"],[role="checkbox"],[role="switch"]')]
  .map(el => { const r = el.getBoundingClientRect()
    return { el: el.tagName+'.'+el.className, text: el.innerText.trim().slice(0,20),
             w: Math.round(r.width), h: Math.round(r.height) } })
  .filter(r => (r.w < 44 || r.h < 44) && r.w && r.h))
```

44×44 CSS px is the floor (SC 2.5.5 AAA / Apple HIG); WCAG 2.2 SC 2.5.8 AA
allows 24×24 **only** when a 24px circle around it touches no neighbour's — so
row-action icons packed together fail even at 24. Inline links in a paragraph
are exempt. Fix with padding or a `::after` hit area, not by scaling the icon.
Android: 48×48dp. Run this at a mobile viewport too — a target can shrink under
a media query.

## 12. Mouse-only paths

No script. Unplug the mouse (or `document.body.style.pointerEvents='none'` after
focusing the page) and complete each primary task end to end. The recurring
offenders: hover-revealed row actions and menus, drag-only reordering and
sliders, custom scroll containers with no `tabindex="0"`, `title` carrying
information nothing else does, canvas/map interactions, and swipe-only mobile
gestures (SC 2.5.1 needs a single-pointer alternative). Hover-revealed content
also needs SC 1.4.13: **hoverable, dismissible with Escape, and persistent**
while pointed at.

## 13. Zoom and reflow

- **Reflow (SC 1.4.10):** set the viewport to **320×256 CSS px** (equivalent to
  400% zoom on a 1280 desktop). No horizontal scrolling, no clipped content, no
  two-dimensional scroll — data tables excepted.
- **Text resize (SC 1.4.4):** text-only zoom to 200%. Emulate by injecting
  `document.documentElement.style.fontSize = '200%'` — anything sized in `px`
  will not move, which is itself the finding, and anything in a fixed-height box
  will clip.
- Re-run the overflow probe at both:

```js
[...document.querySelectorAll('*')].filter(el => el.scrollWidth > el.clientWidth + 1)
  .map(el => el.tagName + '.' + el.className)
```

- **Forced colors:** DevTools → Rendering → Emulate `forced-colors: active`.
  Anything conveyed by a background image, a gradient, or a `box-shadow` border
  disappears; icons rendered as background images vanish entirely.

---

## The assistive-technology pass

One real pass on the primary flow. Choose by platform and **say which you ran**.

| AT | Start | The keys that matter |
|---|---|---|
| **NVDA** (Windows + Firefox; free, the default choice) | Ctrl+Alt+N | `NVDA+↓` read all · `Tab` controls · `H` headings · `F` form fields · `B` buttons · `D` landmarks · `NVDA+F7` elements list · `NVDA+Space` toggle browse/focus mode |
| **VoiceOver** (macOS + Safari) | Cmd+F5 | VO = Ctrl+Option · `VO+A` read all · `VO+→` next item · `VO+Space` activate · `VO+U` rotor (headings/links/form controls) · needs Full Keyboard Access on |
| **VoiceOver** (iOS) | Settings → Accessibility, or triple-click side button | swipe right/left = next/previous · double-tap = activate · two-finger swipe up = read all · rotor = two-finger rotate |
| **TalkBack** (Android) | Volume-both hold | swipe right/left · double-tap · swipe up-then-right = menu |

What you are listening for, in this order: does each control announce a **role**
and a **name**; does its **state** change audibly when you operate it; is the
async result **announced at all**; can you complete the task without seeing the
screen. Paste the transcript of the failing moment into the finding.

---

## Native

Touch targets ≥44×44pt (iOS) / 48×48dp (Android) — measure, do not assume the
component library got it right. iOS: run with the largest Dynamic Type setting
and check nothing truncates; VoiceOver labels on every `Image`/icon button;
`accessibilityTraits` matching the role. Android: `contentDescription`,
TalkBack, and font scale 200%. React Native: `accessible`,
`accessibilityLabel`, `accessibilityRole`, `accessibilityState`, and
`AccessibilityInfo.isReduceMotionEnabled()` for §7. `ios-design-review` drives a
real device.

---

## CI

Make the guard fail the build, not decorate a dashboard:

```yaml
- run: npx playwright test tests/a11y.spec.ts        # AxeBuilder per route + keyboard tests
- run: npx eslint . --max-warnings 0                 # with jsx-a11y
```

Scan the **states**, not just the routes: a spec that only loads the page checks
the emptiest version of it. Assert on a per-rule allowlist with an expiry note
rather than a global threshold, so a new violation cannot hide under an old
budget.
