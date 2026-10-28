// B19: terminal mouse for the standalone app. SGR reports (CSI < b ; x ; y M/m) are taken
// out of stdin before readline sees it: a report's payload must never become typing, and
// typing must never be eaten as a report. Pure but for the two timers.
import type { Hit } from './draw'
import type { PointerAction } from './state'

export type Mouse = { x: number; y: number; button: number; release: boolean }
export const MOUSE_ON = '\x1b[?1000h\x1b[?1006h'
export const MOUSE_OFF = '\x1b[?1006l\x1b[?1000l'

const WAIT_MS = 40      // a report split across reads arrives within this
const STALE_MS = 300    // a late tail of a timed-out report is still dropped within this
const MAX = 32          // longer than any real report: garbage, never dispatched
const REPORT = /^\x1b\[<(\d{1,3});(\d{1,5});(\d{1,5})([Mm])$/
// What may still become a report: ESC, ESC [, then ESC [ < and CSI parameter bytes.
const OPENING = /^\x1b(\[(<[\x30-\x3f]*)?)?$/

export function mouseInput(keyboard: (text: string) => void, mouse: (event: Mouse) => void, wait = WAIT_MS, stale = STALE_MS) {
  let buf = ''        // a possible report, not yet decided
  let late = false    // buf timed out: what was not a report has gone to the keyboard; never dispatched
  let held = ''       // chars of a late tail before its '<': given back if it proves to be typing
  let timer: ReturnType<typeof setTimeout> | undefined
  let out = ''
  const reset = () => { buf = ''; late = false; held = '' }
  const expire = () => {
    timer = undefined
    if (!late) {
      // Escape alone stays a key; ESC [ < ... is a report cut short and never typing.
      if (!buf.includes('<')) keyboard(buf)
      late = true
      held = ''
      timer = setTimeout(expire, stale)
    } else reset()
  }
  const step = (ch: string) => {
    if (!buf) {
      if (ch === '\x1b') buf = ch
      else out += ch
      return
    }
    const next = buf + ch
    if (buf.includes('<') && ch >= '\x40' && ch <= '\x7e' && (!late || ch === 'M' || ch === 'm')) {
      // The CSI's final byte ends it: a report, or a control sequence dropped. A late tail
      // ends only on a report's own final - a letter typed after the wait stays typing.
      const m = REPORT.exec(next)
      if (m && !late && +m[2]! > 0 && +m[3]! > 0) {
        if (out) { keyboard(out); out = '' }
        mouse({ button: +m[1]!, x: +m[2]!, y: +m[3]!, release: m[4] === 'm' })
      }
      reset()
      return
    }
    if (OPENING.test(next)) {
      if (late && !buf.includes('<')) held += ch
      buf = next.length > MAX ? '\x1b[<' : next
      if (next.length > MAX) late = true
      return
    }
    // Not a report. Before '<' it is an ordinary key sequence (an arrow, alt+x): whole to
    // readline. After '<' it is a broken report: dropped, the char that broke it kept.
    if (!buf.includes('<')) out += late ? held : buf
    reset()
    step(ch)
  }
  return {
    write(chunk: string) {
      clearTimeout(timer)
      timer = undefined
      for (const ch of chunk) step(ch)
      if (out) { keyboard(out); out = '' }
      if (buf) timer = setTimeout(expire, late ? stale : wait)
    },
    close() { clearTimeout(timer); timer = undefined; reset(); out = '' },
  }
}

// What a report asks of the board drawn last: a left press on a drawn target, or the wheel
// as the arrow keys. Release, drag, other buttons, modifiers and off-screen are nothing.
export function mouseTarget(e: Mouse, hits: Hit[], cols: number, rows: number): PointerAction | null {
  if (e.release || e.x > cols || e.y > rows) return null
  if (e.button === 64 || e.button === 65) return { kind: 'key', key: { name: e.button === 64 ? 'up' : 'down' } }
  if (e.button !== 0) return null
  return hits.find(h => h.y === e.y && e.x >= h.x && e.x < h.x + h.width)?.action ?? null
}
