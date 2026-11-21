// Public, invented design fixture. No production puzzle, solver or credentials.
export const teams = [
  { code: 'ARS', name: 'Arsenal', values: [3, 2, 1, 0, 5, 2, 7] },
  { code: 'CHE', name: 'Chelsea', values: [3, 1, 1, 1, 3, 4, 4] },
  { code: 'LIV', name: 'Liverpool', values: [3, 1, 0, 2, 4, 4, 3] },
  { code: 'TOT', name: 'Tottenham', values: [3, 0, 2, 1, 2, 4, 2] }
]
export const fixtures = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
export const packs = ['Beginner', 'Easy', 'Medium', 'Hard', 'Expert']
export const state = {
  screen: 'home', tab: 'home', pack: 0, level: 1, active: 'daily', selected: null,
  boards: new Map(), pending: new Set(), modal: null,
  backStack: [], tabScreens: { home: 'home', campaign: 'campaign', daily: 'game', stats: 'stats' },
  options: { layout: 'a', input: 'native', font: '1', network: 'online', check: 'feedback' }
}

export function board(key = state.active) {
  if (!state.boards.has(key)) {
    const [, packText, levelText] = key.split('-')
    const pack = Number(packText)
    const level = Number(levelText)
    const givenMatches = key === 'daily' ? 2 : pack === 0 ? (level <= 3 ? 5 : level <= 15 ? 4 : 3) : [5, 3, 2, 1, 0][pack]
    // UI-only givens: sample scorelines, not a source of production solutions.
    const exampleGivens = [2, 0, 2, 1, 1, 1, 2, 1, 1, 1]
    state.boards.set(key, {
      key, scores: Array.from({ length: 12 }, (_, i) => i < givenMatches * 2 ? String(exampleGivens[i]) : ''),
      sources: Array.from({ length: 12 }, (_, i) => i < givenMatches * 2 ? 'given' : 'entry'),
      notes: Array(6).fill(''), hints: 0, startedAt: Date.now(), elapsed: null,
      message: '', outcome: null, analysis: false
    })
  }
  return state.boards.get(key)
}

export function label(current = board()) {
  if (current.key === 'daily') return 'Daily · 12 Nov 2026'
  const [, pack, level] = current.key.split('-')
  return `${packs[Number(pack)]} · Level ${level}`
}

export function editable(current, index) {
  return !current.outcome && current.sources[index] === 'entry'
}

export function elapsed(current = board()) {
  const seconds = current.elapsed ?? Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000))
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

export function entry(value) {
  return value === '' || /^\d{1,2}$/.test(value) && Number(value) <= 19
}

export function setScore(index, value) {
  const current = board()
  if (!editable(current, index) || !entry(value)) return false
  current.scores[index] = value
  current.analysis = false
  current.message = ''
  return true
}

export function levelOpen(pack, level) {
  // Sample progress: Beginner 1–3 completed, all packs' level 1 open.
  return level <= (pack === 0 ? 4 : 1)
}

export function invitation(current = board()) {
  return `ScoreLogic ⚽\n${label(current)}\n⏱ ${elapsed(current)} · Hints: ${current.hints}\n${[0, 1, 2, 3, 4, 5].map(i => current.scores.slice(i * 2, i * 2 + 2).map(v => v === '' ? '⬜' : '🟩').join('')).join('\n')}\nCan you beat my time? Reconstruct the scores and take the challenge.\nhttps://scorelogic.example/puzzles/${current.key}\n\nPreview invitation — example address; no message is sent.`
}
