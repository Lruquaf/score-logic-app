// Platform-neutral values. Native adapters should preserve system text scaling.
export const tokens = Object.freeze({
  color: {
    paper: '#f7f5ef', surface: '#ffffff', warm: '#f1eee6',
    ink: '#17211b', secondary: '#3c493f', muted: '#59665d',
    field: '#2f6f45', fieldDeep: '#1f5535', fieldSoft: '#e7f1e9',
    line: '#ded8cc', controlBorder: '#788579',
    warning: '#7a500e', warningSoft: '#fff4d7',
    danger: '#a63430', dangerSoft: '#fae8e6', blue: '#315f8d'
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 10, lg: 16, sheet: 24 },
  type: { small: 14, body: 16, lead: 18, title: 28, display: 36 },
  size: { touch: 48, content: 1120 },
  motion: { fast: 120, normal: 180 }
})
