# Verify — the ship gate, executed

The gate in SKILL.md lists *what* must be true. This file is *how you prove it*. A gate
you assert instead of run is not a gate; it is a claim, and claims are exactly what this
skill exists to replace.

**The rule: nothing is done until it has been seen rendering.** Not "the code looks
right". Seen.

---

## Pick your driver — in this order

1. **`claude-in-chrome`** (the MCP browser tools). Invoke the `claude-in-chrome` skill
   first, then load the tools in **one** `ToolSearch` call. Best when the dev server is
   already running and you want screenshots, console, and network in one place.
2. **`browse`** (gstack's headless daemon) — faster for a screenshot-and-assert loop when
   you don't need to interact.
3. **`webapp-testing`** — when the check needs real interaction scripted and repeated.
4. **Native:** the iOS Simulator / Android emulator, or `ios-design-review` when the app
   runs on real hardware.
5. **`screenshot-loop`** — when the user is driving and dropping screenshots in for you.
   Read them, act, delete the consumed ones.

If none is available, **say so explicitly and mark the work unverified.** Do not narrate a
render you did not perform. An honest "built, not yet seen" is worth more than a confident
"verified" that was inferred from the source.

---

## The run

Take the screenshots **before** you report, not after the user asks.

1. **Boot it.** Find the dev command (`package.json` scripts, README, Makefile). Start it,
   wait for the port, navigate.
2. **Console first.** Read console messages before looking at pixels — a React key warning
   or a failed font fetch explains most of what you're about to see. Filter with a pattern
   rather than dumping everything.
3. **Network.** Confirm every font, image, and asset actually resolved. This catches the
   invented Unsplash ID and the CDN path that 404s — gate item 8, and it fails silently in
   a screenshot because the fallback font looks fine.
4. **Screenshot the widths that matter:** 320, 768, 1280, and 1920. Not "mobile and
   desktop" — 320 is where headings overflow and 1920 is where a max-width you forgot lets
   a line run to 200 characters.
5. **Screenshot both themes** if both ship. Toggle it the way a user would.
6. **Drive the states.** Screenshots of the default view prove almost nothing. Get to
   loading, empty, error, and success — force them (throttle the network, block the
   request, clear the data) rather than describing them.
7. **Keyboard the whole surface.** Tab from the top: is focus visible at every stop, in
   order, never trapped, and does Escape close what it should?

---

## Checks that need a procedure, not an eyeball

**Contrast.** Do not eyeball it and do not trust the token names. Pull the computed colours
off the real rendered elements and compute the ratio:

```js
// in the page, via the javascript tool
const ratio = (a, b) => {                       // a, b: [r,g,b] 0-255
  const L = c => { const s = c.map(v => v/255)
    .map(v => v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055) ** 2.4)
    return 0.2126*s[0] + 0.7152*s[1] + 0.0722*s[2] }
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
```

Sample the pairs that actually fail in practice: body text on its real background,
**placeholder text**, muted/secondary text, disabled labels, text on a coloured button,
and the focus ring against both the element and the page. Body ≥4.5, large ≥3, focus ring
≥3. Report the numbers, not "contrast checked".

**Overflow.** At each width, find anything wider than its container:

```js
[...document.querySelectorAll('*')]
  .filter(el => el.scrollWidth > el.clientWidth + 1)
  .map(el => `${el.tagName}.${el.className}`)
```

Empty array or it isn't done. Then repeat with the **longest real string** in place, not
the placeholder — see the +40% rule in [product-ui.md](product-ui.md).

**Reduced motion.** Emulate it (`prefers-reduced-motion: reduce`) and reload. Every reveal
must still show its content. The failure this catches is fatal and invisible otherwise:
content gated behind a class-triggered transition ships blank.

**LCP / CLS / INP.** Delegate to `web-perf` — it owns the Chrome DevTools workflow and the
measured numbers. Arwen owns the design-time rules; it does not re-implement the audit.

**Native.** Run the screen on a device with the largest Dynamic Type setting and with a
notch and home indicator present. Touch targets ≥44×44pt (iOS) / 48×48dp (Android) —
measure them, don't assume the component library got it right.

---

## Signature check (Phase 2, verified rather than asserted)

With the screenshots in hand:

- Put two different screens side by side, **cover the logo** — is it still obviously the
  same product? If not, the signature isn't systematic yet.
- Find a real competitor screenshot in the same category. Could it pass for yours? If yes,
  you shipped the category default.
- Point at where the signature appears on the empty state and the error state. If it only
  appears on the hero, it is decoration, not a signature.

---

## Reporting

Report evidence, not adjectives. One block, short:

```
Verified: 320/768/1280/1920 · light+dark · loading/empty/error/success
Contrast: body 8.1 · muted 4.7 · placeholder 4.6 · focus ring 3.4  (all pass)
Overflow: none at any width, incl. longest label ("Rechnungsempfänger")
Reduced motion: content visible, reveals crossfade
Console: clean · Network: all 24 assets 200
Not verified: INP (no field data) — run web-perf for measured vitals
```

**Always state what you did not verify.** The list of unchecked items is the most useful
line in the report, and omitting it is how "done" comes back at 3am.
