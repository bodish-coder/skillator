// node --import ./loader.mjs: a relative import with no extension resolves to its .ts twin
// (the mod's lib files import './facts' and the plugin engine resolves that; node does not).
import { register } from 'node:module'
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) }
  catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(spec) && !/\\.[cm]?[jt]sx?$/.test(spec)) return next(spec + '.ts', ctx)
    throw e
  }
}`))
