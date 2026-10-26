// F56: the pi extension's entry - `/ops`, the ops board inside pi. pi (0.74.2) loads it
// through jiti, which resolves @earendil-works/pi-tui for any file it loads; install.sh /
// install.ps1 put a one-line re-export of this file in ~/.pi/agent/extensions/. Run it
// from a checkout with: pi -e <repo>/mods/ops-board/pi/index.ts
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { decodeKittyPrintable, parseKey, truncateToWidth } from '@earendil-works/pi-tui'
import { registerOps } from './ops'
import type { PiApi } from './ops'

export default function (pi: ExtensionAPI) {
  registerOps(pi as unknown as PiApi, {
    parseKey, kitty: decodeKittyPrintable, fit: (line, width) => truncateToWidth(line, width), appDir: import.meta.dirname,
  })
}
