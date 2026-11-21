import { tokens } from '../../../../packages/design-tokens/index.mjs'
function luminance(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Use opaque six-digit colors for contrast checks.')
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}
export function contrastRatio(a: string, b: string) { const pair = [luminance(a), luminance(b)].sort((x, y) => y - x); return (pair[0] + 0.05) / (pair[1] + 0.05) }
const c = tokens.color
export const contrastPairs = [
  ['Body / paper', c.ink, c.paper, 4.5], ['Secondary / paper', c.muted, c.paper, 4.5],
  ['Body / surface', c.ink, c.surface, 4.5], ['Secondary / surface', c.muted, c.surface, 4.5],
  ['Primary button', '#ffffff', c.fieldDeep, 4.5], ['Secondary button', c.fieldDeep, c.fieldSoft, 4.5],
  ['Hint score', c.blue, c.surface, 4.5], ['Fixed score', c.ink, c.warm, 4.5],
  ['Error / surface', c.danger, c.surface, 4.5], ['Error / paper', c.danger, c.paper, 4.5],
  ['Placeholder', c.muted, c.surface, 4.5], ['Active border', c.controlBorder, c.surface, 3],
  ['Focus ring', c.blue, c.paper, 3]
] as const
export function checkContrast() { return contrastPairs.map(([name, foreground, background, minimum]) => ({ name, ratio: contrastRatio(foreground, background), minimum })) }
