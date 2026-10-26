// F57: write the Antigravity IDE extension as a VSIX the IDE's CLI installs
// (`antigravity-ide --install-extension <vsix> --force`). Run by install.sh / install.ps1
// from the skills dest's copy:   node pack.mjs <out.vsix>
// The VSIX carries only the manifest and a one-line extension.cjs that requires THIS
// directory's extension.cjs by absolute path - the code stays in the dest, refreshed every
// install, so the data layer has one copy (as pi's re-export, F56). A dropped folder is
// not an option: beside an existing extensions.json the IDE ignores it (probed on
// Antigravity IDE 1.107.0). A stored zip by hand - no zip tool is assumed (node >= 22.2
// for zlib.crc32; ops needs 22.18).
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'

const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The files of the VSIX for an extension dir: [name, Buffer][].
export function vsixEntries(appDir) {
  const dir = resolve(appDir).replace(/\\/g, '/')
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const target = JSON.stringify(dir + '/extension.cjs')
  const shim = '// skillator ops board in the Antigravity IDE - written by the skillator installer, rewritten every run.\n'
    + `const ops = require(${target})\n`
    + "exports.activate = context => ops.activate(context, require('vscode'))\n"
    + 'exports.deactivate = () => ops.deactivate()\n'
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}" />
    <DisplayName>${xml(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${xml(pkg.description)}</Description>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(pkg.engines.vscode)}" /></Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" /></Assets>
</PackageManifest>
`
  const types = '<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension=".json" ContentType="application/json" /><Default Extension=".cjs" ContentType="application/javascript" />'
    + '<Default Extension=".vsixmanifest" ContentType="text/xml" /></Types>\n'
  return [
    ['[Content_Types].xml', Buffer.from(types)],
    ['extension.vsixmanifest', Buffer.from(manifest)],
    ['extension/package.json', Buffer.from(JSON.stringify(pkg, null, 2) + '\n')],
    ['extension/extension.cjs', Buffer.from(shim)],
  ]
}

// A zip of stored (uncompressed) entries, UTF-8 names, fixed time (1980-01-01).
export function zip(entries) {
  const locals = [], centrals = []
  let offset = 0
  for (const [name, data] of entries) {
    const n = Buffer.from(name)
    const crc = crc32(data) >>> 0
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(0, 8)
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12); head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(n.length, 26); head.writeUInt16LE(0, 28)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(0, 10)
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20)
    cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42)
    locals.push(head, n, data)
    centrals.push(cen, n)
    offset += head.length + n.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

export function writeVsix(appDir, out) {
  writeFileSync(out, zip(vsixEntries(appDir)))
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const out = process.argv[2]
  if (!out) { process.stderr.write('usage: node pack.mjs <out.vsix>\n'); process.exit(2) }
  writeVsix(fileURLToPath(new URL('.', import.meta.url)), out)
}
