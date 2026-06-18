import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './store/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        night: 'var(--night)',
        pitch: 'var(--pitch)',
        dugout: 'var(--dugout)',
        bench: 'var(--bench)',
        rail: 'var(--rail)',
        light: 'var(--light)',
        turf: 'var(--turf)',
        snow: 'var(--snow)',
        mist: 'var(--mist)'
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)']
      },
      boxShadow: {
        glow: '0 0 20px var(--light-glow)'
      }
    }
  }
}

export default config

