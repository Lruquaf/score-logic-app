// Proposed visual system. Existing production screens keep their current tokens
// until the screen compositions have been reviewed in Design Studio.
export const ledger = {
  color: { paper: '#F1F6EF', surface: '#FCFEFA', ink: '#142E24', forest: '#174B36', field: '#307449', lime: '#D1EB9B', muted: '#58675D', line: '#D1DECE', controlBorder: '#789172', soft: '#E1EEDD', mint: '#E9F2E5', selected: '#D6E8CF', danger: '#9B382F' },
  font: { body: 'Figtree', medium: 'FigtreeMedium', display: 'FigtreeSemiBold' },
  radius: { control: 12, score: 10, panel: 16 },
  space: { unit: 4, page: 20, section: 28 },
  touch: 48
} as const
