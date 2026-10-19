import type { Color } from 'claude-code'
import type { Box as State } from '../types'
import { STATE_COLOR } from './lib/board'
import type { StateColor } from './lib/board'

// Theme keys follow the person's theme on every surface; dim states are drawn dim.
export const PAINT: Record<StateColor, Color> = {
  amber: 'warning', red: 'error', violet: 'permission', neutral: 'text', dim: 'inactive', green: 'success',
}
export const paint = (b: State): Color => PAINT[STATE_COLOR[b]]
