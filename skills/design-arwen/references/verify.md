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

If none is available, **say so explicitly and report in SKILL.md's terminal-state shape**
(`built · verified: … · not verified: … · delegated: …`). The `static` items of the gate
are still mandatory without a browser — they need no render. Do not narrate a render you
did not perform. An honest "built, not yet seen" is worth more than a confident "verified"
that was inferred from the source.

**There is one gate and it lives in SKILL.md.** This file never restates it; the steps
below are the procedures that prove its items. If a step here seems to add a requirement
SKILL.md does not list, SKILL.md wins and this file is the bug.

---

## The run

Take the screenshots **before** you report, not after the user asks.

1. **Boot it.** Find the dev command (`package.json` scripts, README, Makefile). Start it,
   wait for the port, navigate.
2. **Console first.** Read console messages before looking at pixels — a React key warning
   or a failed font fetch explains most of what you're about to see. Filter with a pattern
   rather than dumping everything.
3. **Network.** Confirm every font, image, and asset actually resolved. This catches the
   invented Unsplash ID and the CDN path that 404s — gate item 3, and it fails silently in
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
- **Brand register only:** find a real competitor screenshot in the same category. Could it
  pass for yours? If yes, you shipped the category default. In the **product** register skip
  this — it usually could, and should (SKILL.md Phase 1). Check instead that the one
  systematic device is present wherever its state occurs.
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

---

## OKLCH → contrast, without a browser

Phase 1 mandates OKLCH tokens; the DOM snippets above need `[r,g,b]`. Without this you
cannot check gate items 1-2 until something renders, which is exactly when it is too late
and too expensive to change a palette. Run it on the token values themselves:

```js
// node contrast.mjs — oklch(L C H) with L as 0..1, plus WCAG ratio.
const f=(n)=>n<=0.0031308?12.92*n:1.055*Math.pow(n,1/2.4)-0.055;
const oklch2rgb=(L,C,H)=>{const h=H*Math.PI/180,a=C*Math.cos(h),b=C*Math.sin(h);
  const l=(L+0.3963377774*a+0.2158037573*b)**3, m=(L-0.1055613458*a-0.0638541728*b)**3,
        s=(L-0.0894841775*a-1.2914855480*b)**3;
  return [ 4.0767416621*l-3.3077115913*m+0.2309699292*s,
          -1.2684380046*l+2.6097574011*m-0.3413193965*s,
          -0.0041960863*l-0.7034186147*m+1.7076147010*s]
        .map(v=>Math.round(Math.min(1,Math.max(0,f(v)))*255));};
const lum=([r,g,b])=>{const c=[r,g,b].map(v=>{v/=255;
  return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
export const ratio=(A,B)=>{const [x,y]=[lum(A),lum(B)].sort((p,q)=>q-p);
  return +((x+0.05)/(y+0.05)).toFixed(2);};
// ratio(oklch2rgb(0.215,0.012,240), oklch2rgb(0.985,0.003,240)) -> body text vs page
```

Check **every** pair the gate names, not just body-on-page: placeholder, disabled text,
each border against its surface (item 2 — a 1.06:1 input border passes every text check
and is still a defect), the focus ring against the page, and on-accent / on-danger text.
Ring-vs-filled-button is not required: WCAG 1.4.11 measures the ring against the adjacent
background, so a 2px `outline-offset` that keeps the ring on the page background is the
correct construction, not a dodge.
