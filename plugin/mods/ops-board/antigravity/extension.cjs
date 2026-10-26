// F57: the Antigravity IDE extension's entry (CommonJS: the IDE's extension host requires
// it). The IDE's node (22.21, Electron 39) strips TypeScript, so ops.ts and the data layer
// load as they are; ../ops/loader.mjs adds the .ts fallback for the lib's extensionless
// imports, as `node --import` does for the standalone app. Installed, the VSIX holds a
// one-line extension.cjs that requires this file from the skills dest's ops-board/; from
// a checkout: antigravity-ide --extensionDevelopmentPath <repo>/mods/ops-board/antigravity
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

let loaded = null
const load = () => (loaded ??= import(pathToFileURL(join(__dirname, '..', 'ops', 'loader.mjs')).href)
  .then(() => import(pathToFileURL(join(__dirname, 'ops.ts')).href)))

exports.activate = async function activate(context, api) {
  const vscode = api ?? require('vscode')
  const ops = await load()
  ops.registerOps(vscode, context, { appDir: __dirname })
}

exports.deactivate = function deactivate() {}
