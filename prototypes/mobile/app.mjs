import { tokens } from '/packages/design-tokens/index.mjs'
import { state, board, teams, fixtures, packs, label, elapsed, editable, setScore, levelOpen, invitation } from './model.mjs'

const app = document.querySelector('#app')
const sheet = document.querySelector('#sheet')
const announce = document.querySelector('#announcement')
let opener = null
let announcementId = 0
let modalTicket = 0
let noteDraft = null
let lastActivation = null
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const icon = (name, cls = '') => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H4V10m5 10v-7h6v7"/>',
    campaign: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M9 10v11M15 10v11M3 15h18"/>',
    daily: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 11h18m-14 5h3m4 0h3"/>',
    stats: '<path d="M5 20v-7m7 7V4m7 16V9M2 21h20"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>', back: '<path d="m15 5-7 7 7 7"/>',
    note: '<path d="M5 3h14v18H5zM8 8h8m-8 4h8m-8 4h5"/>',
    hint: '<path d="M9 21h6m-5-4h4c0-4 4-4 4-9a6 6 0 1 0-12 0c0 5 4 5 4 9Z"/>',
    table: '<path d="M3 4h18v16H3zM3 9h18M9 4v16M15 9v11M3 14h18"/>',
    check: '<path d="m5 12 4 4L20 5"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
  }
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.arrow}</svg>`
}
const button = (text, action, attrs = '', cls = 'button') => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${text}</button>`
const title = (eyebrow, heading, body = '') => `<div class="page-heading"><p class="eyebrow">${eyebrow}</p><h1 tabindex="-1">${heading}</h1>${body ? `<p class="secondary">${body}</p>` : ''}</div>`

for (const [group, values] of Object.entries(tokens)) {
  for (const [key, value] of Object.entries(values)) {
    const cssValue = typeof value !== 'number' ? value : group === 'type' ? `${value / 16}rem` : `${value}${group === 'motion' ? 'ms' : 'px'}`
    document.documentElement.style.setProperty(`--${group}-${key}`, cssValue)
  }
}

function say(message) {
  const id = ++announcementId
  announce.textContent = ''
  setTimeout(() => { if (id === announcementId) announce.textContent = message }, 40)
}

function render(focus = false) {
  document.documentElement.style.fontSize = `${16 * Number(state.options.font)}px`
  document.body.dataset.layout = state.options.layout
  document.body.dataset.largeText = String(Number(state.options.font) > 1.2)
  const screens = { home, campaign, pack: packDetail, game, stats, account, help, login: () => auth(false), register: () => auth(true) }
  app.innerHTML = `<div class="app-shell">
    <header class="app-header"><button class="brand" data-action="nav" data-screen="home" aria-label="ScoreLogic home"><span class="brand-mark" aria-hidden="true">S<span>·</span>L</span><span>ScoreLogic</span></button>${button(icon('user') + '<span class="sr-only">Account</span>', 'nav', 'data-screen="account" aria-label="Account"', 'icon-button')}</header>
    <main id="main" class="main-content">${screens[state.screen]()}</main>
    <nav class="tab-bar" aria-label="Main navigation">${['home', 'campaign', 'daily', 'stats'].map(name => `<button type="button" data-action="nav" data-screen="${name}" ${state.tab === name ? 'aria-current="page"' : ''}>${icon(name)}<span>${name[0].toUpperCase() + name.slice(1)}</span></button>`).join('')}</nav>
  </div>`
  if (focus) { document.querySelector('h1')?.focus({ preventScroll: true }); window.scrollTo(0, 0) }
  restoreSelection()
}

function home() {
  return `${title('A little football. A lot of logic.', 'Your next<br>clever move.', 'Read the table. Find the hidden scores.')}
  <section class="daily-feature" aria-labelledby="today-title"><div class="section-line"><span class="eyebrow">Thursday · 12 November</span><span class="badge">Daily</span></div><h2 id="today-title">A fresh table.<br>A new challenge.</h2><p>Four teams. Six matches. One satisfying finish.</p>${button('Play today ' + icon('arrow'), 'nav', 'data-screen="daily"', 'button primary wide')}<p class="fine">Medium · No account needed</p></section>
  <section class="home-continue"><div><p class="eyebrow">Your campaign</p><h2>Keep your form.</h2><p>Beginner · Level 4 of 30</p></div>${button('Continue ' + icon('arrow'), 'play', 'data-pack="0" data-level="4"', 'button secondary-button')}</section>
  <section class="guide-teaser"><h2>New to the game?</h2><p>Use the final standings to work out every match result.</p>${button('Show me how', 'nav', 'data-screen="help"', 'button text-button')}</section>`
}

function campaign() {
  return `${title('One league at a time', 'Campaign', 'Five packs. Thirty levels each. Start anywhere.')}
    <div class="pack-list">${packs.map((name, index) => `<button class="pack-row" data-action="pack" data-pack="${index}"><span class="pack-number">0${index + 1}</span><span><strong>${name}</strong><span class="secondary">${index === 0 ? '3 / 30 solved · Continue level 4' : '0 / 30 solved · Level 1 open'}</span><span class="progress-track" aria-hidden="true"><span style="width:${index === 0 ? 10 : 0}%"></span></span></span>${icon('arrow')}</button>`).join('')}</div><p class="fine">Sample campaign progress for interface review.</p>`
}

function packDetail() {
  return `${button(icon('back') + ' All packs', 'nav', 'data-screen="campaign"', 'button text-button back-link')}${title('Campaign · 30 levels', packs[state.pack], 'Solve a level to open the next. Every pack starts unlocked.')}
    <div class="level-groups">${[[1, 3, 'Opening fixtures'], [4, 15, 'Building form'], [16, 30, 'The run-in']].map(([start, end, name]) => `<section><h2>${name}</h2><div class="level-grid">${Array.from({ length: end - start + 1 }, (_, i) => i + start).map(level => {
      const open = levelOpen(state.pack, level)
      const solved = state.pack === 0 && level <= 3
      return `<button class="level ${solved ? 'solved' : ''}" data-action="play" data-pack="${state.pack}" data-level="${level}" ${!open ? 'aria-disabled="true"' : ''} aria-label="Level ${level}, ${solved ? 'solved' : open ? 'open' : 'locked'}"><span>${level}</span>${solved ? icon('check') : !open ? icon('lock') : '<span class="level-dot" aria-hidden="true"></span>'}</button>`
    }).join('')}</div></section>`).join('')}</div>`
}

function finalTable() {
  const columns = [['P', 'Played'], ['W', 'Won'], ['D', 'Drawn'], ['L', 'Lost'], ['GF', 'Goals for'], ['GA', 'Goals against'], ['Pts', 'Points']]
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Final Table, scroll for all columns"><table class="final-table"><caption>Final Table · fixed reference</caption><thead><tr><th scope="col">Team</th>${columns.map(([short, full]) => `<th scope="col"><abbr title="${full}">${short}</abbr></th>`).join('')}</tr></thead><tbody>${teams.map(team => `<tr><th scope="row"><abbr title="${team.name}">${team.code}</abbr></th>${team.values.map(value => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}

function scoreCell(index, current) {
  const match = fixtures[Math.floor(index / 2)]
  const team = teams[match[index % 2]]
  const opponent = teams[match[1 - index % 2]]
  const source = current.sources[index]
  const canEdit = editable(current, index)
  const accessible = `${team.name} ${index % 2 ? 'away' : 'home'} score against ${opponent.name}`
  const attrs = `data-score="${index}" data-source="${source}" data-cell-label="${accessible}" aria-label="${accessible}${canEdit && state.options.input === 'custom' ? `, ${current.scores[index] || 'blank'}` : canEdit ? '' : `, ${source === 'entry' ? 'finished' : source}`}"`
  const sourceText = source === 'given' ? 'Given' : source === 'hint' ? 'Hint' : source === 'reveal' ? 'Answer' : ''
  return `<span class="score-wrap">${canEdit && state.options.input === 'custom'
    ? `<button class="score-input" ${attrs} data-action="select-score">${escape(current.scores[index]) || '<span aria-hidden="true">–</span>'}</button>`
    : `<input class="score-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" ${attrs} value="${escape(current.scores[index])}" ${canEdit ? '' : 'readonly'} placeholder="–">`}<span class="score-source" aria-hidden="true">${sourceText || '&nbsp;'}</span></span>`
}

function game() {
  const current = board()
  const daily = current.key === 'daily'
  const offline = state.options.network === 'offline'
  const unavailable = ['loading', 'error', 'empty'].includes(state.options.network)
  if (unavailable) return `${title(daily ? 'Daily' : 'Campaign', state.options.network === 'loading' ? 'Loading your puzzle…' : state.options.network === 'empty' ? 'No puzzle available.' : 'A little delay.', state.options.network === 'error' ? 'Your board has not changed. Try loading again.' : 'Preview of an unavailable-content state.')}${state.options.network !== 'loading' ? button('Try again', 'retry', '', 'button primary') : '<div class="skeleton" role="status">Loading puzzle</div>'}`
  const actionsDisabled = offline || current.outcome || state.pending.has(current.key)
  const analyze = !daily && Number(current.key.split('-')[1]) === 0 && Number(current.key.split('-')[2]) <= 15
  return `<div class="game-title"><div>${daily ? '<p class="eyebrow">Thursday · 12 November</p>' : button(icon('back') + ' Pack', 'pack', `data-pack="${current.key.split('-')[1]}"`, 'button text-button')}<h1 tabindex="-1">${daily ? 'Daily puzzle' : label(current)}</h1></div>${button(icon('more'), 'more', 'aria-label="Puzzle options"', 'icon-button')}</div>
    <div class="game-meta"><span>${daily ? 'Medium' : Number(current.key.split('-')[1]) === 0 ? Number(current.key.split('-')[2]) <= 3 ? 'Guided practice' : Number(current.key.split('-')[2]) <= 15 ? 'Assisted practice' : 'Beginner' : packs[Number(current.key.split('-')[1])]}</span><span class="timer" aria-label="Elapsed time" data-timer>${elapsed(current)}</span><span data-hints>${current.hints} hints used</span></div>
    <div class="connection-status ${offline ? 'warning' : ''}" role="status">${offline ? 'Offline preview · keep editing; Hint, Check and Reveal need a connection.' : 'Preview draft · stays while this preview is open'}</div>
    ${current.message ? `<p class="board-feedback ${current.outcome === 'solved' ? 'success' : ''}" data-feedback>${escape(current.message)}</p>` : '<p class="board-feedback" data-feedback hidden></p>'}
    <div class="game-workspace"><section class="table-panel" aria-label="Standings reference"><div class="section-line"><h2>Final Table</h2><span class="fine">Your fixed reference</span></div>${finalTable()}</section>
    <section class="fixture-panel" aria-labelledby="fixtures-title"><div class="section-line"><h2 id="fixtures-title">Fixtures</h2><span class="fine" data-filled>${current.scores.filter(v => v !== '').length} / 12 filled</span></div>
    <p class="fine">Reconstruct the scores. Nothing is checked as you type.</p>
    <ol class="fixture-list" aria-label="Match fixture list">${fixtures.map((match, index) => `<li><div class="fixture-teams"><span>${teams[match[0]].code}</span><span class="sr-only">versus</span><span>${teams[match[1]].code}</span></div><div class="fixture-scores">${scoreCell(index * 2, current)}<span class="score-divider" aria-hidden="true">:</span>${scoreCell(index * 2 + 1, current)}</div>${button(icon('note') + (current.notes[index] ? '<span class="note-dot" aria-hidden="true"></span>' : ''), 'note', `data-match="${index}" aria-label="Note for ${teams[match[0]].name} versus ${teams[match[1]].name}${current.notes[index] ? ', has note' : ''}"`, 'icon-button note-button')}</li>`).join('')}</ol>
    ${analyze ? button('Analyze board', 'analyze', actionsDisabled ? 'disabled' : '', 'button text-button') : ''}
    ${current.analysis ? `<section class="analysis-result"><h3>${Number(current.key.split('-')[2]) <= 3 ? 'Guided' : 'Assisted'} analysis</h3><p>Preview snapshot: compare entered totals with the target.</p>${teams.map(t => `<details><summary>${t.name}</summary><p>Played, won, drawn, lost, goals for, goals against and points appear here after a server analysis.</p></details>`).join('')}<p class="fine">This preview does not evaluate scores. Editing invalidates this snapshot.</p></section>` : ''}
    </section></div>
    <div class="game-actions">${button(icon('table') + ' Table', 'table', '', 'button table-toggle')}${button(icon('hint') + ' Hint', 'hint', actionsDisabled ? 'disabled' : '', 'button hint-trigger')}${button(current.outcome === 'solved' ? 'View result' : current.outcome === 'revealed' ? 'Answer shown' : 'Check scores', current.outcome === 'solved' ? 'result' : 'check', offline || current.outcome === 'revealed' || state.pending.has(current.key) ? 'disabled' : '', 'button primary check-trigger')}</div>
    <div class="score-pad" hidden><div class="section-line"><p class="pad-context"></p>${button('Done', 'pad-close', '', 'button text-button')}</div><div class="pad-grid">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'delete'].map(digit => button(digit === 'delete' ? '⌫' : digit === 'clear' ? 'Clear' : digit, 'digit', `data-digit="${digit}" aria-label="${digit === 'delete' ? 'Delete digit' : digit === 'clear' ? 'Clear score' : digit}"`, 'pad-key')).join('')}</div><div class="pad-navigation">${button('Previous cell', 'adjacent', 'data-delta="-1"')}${button('Next cell', 'adjacent', 'data-delta="1"')}</div></div>
    ${daily ? '' : `<div class="campaign-neighbors">${neighbor(-1)}${neighbor(1)}</div>`}`
}

function neighbor(delta) {
  const [, packText, levelText] = board().key.split('-')
  let pack = Number(packText)
  let level = Number(levelText) + delta
  if (level === 31) { pack++; level = 1 }
  if (level === 0) { pack--; level = 30 }
  const valid = pack >= 0 && pack < packs.length && levelOpen(pack, level)
  return button(delta < 0 ? 'Previous level' : 'Next level', 'play', `data-pack="${pack}" data-level="${level}" ${valid ? '' : 'disabled'}`, 'button text-button')
}

function stats() {
  return `${title('Your puzzle form', 'Small wins.<br>Steady progress.', 'Sample statistics · not your real account history.')}
    <dl class="stat-grid">${[['Solved puzzles', '3'], ['Current streak', '2 days'], ['Perfect solves', '2'], ['Average time', '05:18']].map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <details class="metric-details"><summary>All statistics</summary><dl class="detail-list">${[['Successful attempts', '4'], ['Total attempts', '6'], ['First-try solves', '2'], ['Answer reveals', '1'], ['Easy solved', '1'], ['Medium solved', '2'], ['Hard solved', '0']].map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('')}</dl></details>
    <section><h2>Recent puzzles</h2><ol class="recent-list">${[['Beginner · Level 3', 'Solved · 03:42'], ['Daily · 11 Nov', 'Solved · 06:22'], ['Beginner · Level 2', 'Solved · 05:52'], ['Easy · Level 1', 'Answer revealed · 04:12'], ['Daily · 10 Nov', 'In progress · 08:19'], ['Beginner · Level 1', 'Replay · 02:10']].map(([name, status], index) => `<li><strong>${name}</strong><span class="secondary">${status}</span><span class="fine">${name.startsWith('Daily') ? 'DAILY / MEDIUM' : 'CAMPAIGN / EASY'} · Attempts ${index === 5 ? 2 : 1} · Hints ${index === 3 ? 2 : index === 0 ? 1 : 0}</span></li>`).join('')}</ol></section>`
}

function account() {
  return `${button(icon('back') + ' Back', 'back', '', 'button text-button')}${title('Your place in the league', 'Account', 'You are exploring the guest experience.')}
    <section class="account-intro"><h2>Keep your progress.</h2><p>Sign in to use your history across devices.</p>${button('Sign in', 'nav', 'data-screen="login"', 'button primary wide')}${button('Create account', 'nav', 'data-screen="register"', 'button wide')}</section>
    <div class="settings-list">${button('How to play ' + icon('arrow'), 'nav', 'data-screen="help"')}${button('Privacy & data ' + icon('arrow'), 'privacy')}${button('Get help ' + icon('arrow'), 'support')}${button('Delete guest data', 'delete', '', 'button danger-text')}</div><p class="fine">UX prototype · browser preview<br>No real session, cloud sync or account is connected.</p>`
}

function auth(register) {
  return `${button(icon('back') + ' Back', 'back', '', 'button text-button')}${title('Your next clever move', register ? 'Create account' : 'Sign in', 'Keep your puzzle history across devices.')}
    <form id="auth-form"><p class="notice">Preview form only. Use invented details; nothing is sent or saved.</p>${register ? '<label>Display name<input name="displayName" autocomplete="nickname" maxlength="40" required></label>' : ''}<label>Email<input type="email" name="email" autocomplete="email" required></label><label>Password<input type="password" name="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="8" required></label><button class="button primary wide" type="submit">${register ? 'Create account' : 'Sign in'}</button></form>
    ${button('Continue as guest', 'nav', 'data-screen="home"', 'button wide text-button')}${button(register ? 'Already have an account? Sign in' : 'New here? Create account', 'nav', `data-screen="${register ? 'login' : 'register'}"`, 'button wide text-button')}`
}

function help() {
  return `${button(icon('back') + ' Back', 'back', '', 'button text-button')}${title('The touchline guide', 'Read the table.<br>Find the scores.', 'No football knowledge needed — just a little logic.')}
    <div class="help-sections">${[
      ['1. Read the Final Table', 'Each team plays three matches. P is played, W won, D drawn, L lost, GF goals for, GA goals against, and Pts points. A win earns 3 points; a draw earns 1. The table stays fixed.'],
      ['2. Reconstruct the fixtures', 'Fill both scores for each match, from 0 to 19. A blank is different from zero. Example: if a team conceded no goals, its opponents scored zero against it.'],
      ['3. Keep your working', 'Use the note button beside a match to record an idea. Notes do not count as scores. Given and hinted scores are fixed.'],
      ['4. Check when you are ready', 'Check scores asks the server whether your board fits. Any valid solution is accepted. Feedback depends on your campaign pack and level. Typing alone never checks your work.'],
      ['Need a nudge?', 'Hint opens or corrects one score and uses one hint after success. Opening the hint sheet is free. Reveal answer shows the answer, ends the attempt as assisted and does not unlock a level.'],
      ['Time and daily puzzles', 'Elapsed time includes time away. Tomorrow’s daily has its own board and timer. The official daily date and results come from the server.'],
      ['Playing offline', 'The native app will keep cached boards and drafts. Hint, Check, Reveal and official completion need a connection. This prototype keeps only an in-memory preview.']
    ].map(([heading, text], i) => `<details ${i === 0 ? 'open' : ''}><summary>${heading}</summary><p>${text}</p></details>`).join('')}</div>${button('Try the daily', 'nav', 'data-screen="daily"', 'button primary wide')}`
}

function navigate(screen, fromTab = false) {
  closeModal(false)
  if (['home', 'campaign', 'pack', 'game', 'stats'].includes(state.screen)) state.tabScreens[state.tab] = state.screen
  const mainTab = ['home', 'campaign', 'daily', 'stats'].includes(screen)
  if (!mainTab && state.screen !== screen) state.backStack.push({ screen: state.screen, tab: state.tab, active: state.active, pack: state.pack, level: state.level })
  if (mainTab) state.backStack = []
  state.selected = null
  if (screen === 'daily') { state.active = 'daily'; state.tab = 'daily'; state.screen = 'game' }
  else {
    state.screen = fromTab ? state.tabScreens[screen] : screen
    if (['home', 'campaign', 'stats'].includes(screen)) {
      state.tab = screen
      if (screen === 'campaign' && state.screen === 'game') state.active = `campaign-${state.pack}-${state.level}`
    }
  }
  render(true)
}

function openModal(name, heading, content) {
  modalTicket++
  if (!sheet.open) opener = lastActivation?.isConnected ? lastActivation : document.activeElement
  state.modal = name
  sheet.innerHTML = `<div class="sheet-heading"><h2 id="sheet-title" tabindex="-1">${heading}</h2>${button(icon('close'), 'close', 'aria-label="Close"', 'icon-button')}</div><div class="sheet-body">${content}</div>`
  if (!sheet.open) sheet.showModal()
  sheet.querySelector('h2').focus({ preventScroll: true })
}

function closeModal(returnFocus = true) {
  if (!sheet.open) return
  sheet.close()
  state.modal = null
  if (returnFocus) {
    if (opener?.isConnected) opener.focus({ preventScroll: true })
    else document.querySelector('.hint-trigger')?.focus({ preventScroll: true })
  }
}

function openNote(index, value = board().notes[index]) {
  const match = fixtures[index]
  openModal('note', `${teams[match[0]].code} vs ${teams[match[1]].code} note`, `<form id="note-form" data-match="${index}"><label>Your working<textarea name="note" maxlength="180" rows="5">${escape(value)}</textarea></label><p class="fine" data-note-count>${value.length} / 180 characters</p><button class="button primary wide" type="submit">Save note</button></form>`)
}

function requestCloseModal() {
  if (state.modal === 'leave-note') { openNote(noteDraft.index, noteDraft.value); return }
  if (state.modal === 'note') {
    const form = sheet.querySelector('form')
    const index = Number(form.dataset.match), value = form.querySelector('textarea').value
    if (value !== board().notes[index]) {
      noteDraft = { index, value }
      openModal('leave-note', 'Discard your note changes?', `<p>Your changes have not been saved. Keep editing, or discard only these unsaved changes.</p>${button('Keep editing', 'keep-note', '', 'button primary wide')}${button('Discard changes', 'discard-note', '', 'button wide')}`)
      return
    }
  }
  closeModal()
}

function settings() {
  openModal('settings', 'Preview settings', `<form id="settings-form"><p class="fine">Compare layouts and scripted responses. All data is invented; no backend calls are made.</p>${[
    ['layout', 'Phone layout', [['a', 'A · Inline Final Table'], ['b', 'B · Table in a sheet']]],
    ['input', 'Score entry', [['native', 'Numeric input (browser keyboard)'], ['custom', 'Custom score pad']]],
    ['font', 'Text size', [['1', '100%'], ['1.5', '150%'], ['2', '200%']]],
    ['network', 'Connection / content', [['online', 'Online preview'], ['offline', 'Offline preview'], ['loading', 'Loading'], ['error', 'Load error'], ['empty', 'No content']]],
    ['check', 'Scripted Check response', [['feedback', 'Needs more work'], ['solved', 'Solved result']]]
  ].map(([name, text, values]) => `<label><span id="preview-${name}-label">${text}</span><select name="${name}" aria-labelledby="preview-${name}-label">${values.map(([value, text]) => `<option value="${value}" ${state.options[name] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`).join('')}<button class="button primary wide" type="submit">Apply preview</button></form>`)
}

function restoreSelection() {
  if (state.screen !== 'game' || state.selected === null || !editable(board(), state.selected)) return
  document.querySelector(`[data-score="${state.selected}"]`)?.setAttribute('data-selected', 'true')
  if (state.options.input === 'custom') {
    const control = document.querySelector(`button[data-score="${state.selected}"]`)
    if (control) { control.setAttribute('aria-label', `${control.dataset.cellLabel}, ${board().scores[state.selected] || 'blank'}`); control.setAttribute('aria-pressed', 'true') }
    const pad = document.querySelector('.score-pad')
    if (pad) { pad.hidden = false; pad.querySelector('.pad-context').textContent = selectedLabel() }
  }
}

function selectedLabel() {
  const match = fixtures[Math.floor(state.selected / 2)]
  return `${teams[match[state.selected % 2]].code} vs ${teams[match[1 - state.selected % 2]].code} · ${state.selected % 2 ? 'Away' : 'Home'} score: ${board().scores[state.selected] || 'blank'} (0–19)`
}

function selectScore(index) {
  if (!editable(board(), index)) return
  state.selected = index
  document.querySelectorAll('[data-selected]').forEach(el => { el.removeAttribute('data-selected'); el.removeAttribute('aria-pressed') })
  restoreSelection()
}

function dismissPad() {
  const index = state.selected
  state.selected = null
  document.querySelector('.score-pad')?.setAttribute('hidden', '')
  const control = document.querySelector(`[data-score="${index}"]`)
  control?.removeAttribute('data-selected')
  control?.removeAttribute('aria-pressed')
  control?.focus({ preventScroll: true })
}

function refreshEntry() {
  const current = board()
  const filled = document.querySelector('[data-filled]')
  if (filled) filled.textContent = `${current.scores.filter(v => v !== '').length} / 12 filled`
  const feedback = document.querySelector('[data-feedback]')
  if (feedback) feedback.hidden = true
  document.querySelector('.analysis-result')?.remove()
}

async function hint() {
  const current = board()
  const ticket = modalTicket
  if (state.pending.has(current.key) || current.outcome || state.options.network !== 'online') return
  const eligible = current.sources.flatMap((source, i) => source === 'entry' ? [i] : [])
  // Scripted server-response example: empty score first, then a conflicting filled score.
  const index = eligible.find(i => current.scores[i] === '') ?? eligible.find(i => current.scores[i] !== '2')
  if (index === undefined) { closeModal(false); current.message = 'Every preview score is filled. Use Check scores to review your board.'; render(); document.querySelector('.hint-trigger')?.focus({ preventScroll: true }); say(current.message); return }
  state.pending.add(current.key)
  document.querySelector('.hint-trigger')?.setAttribute('disabled', '')
  document.querySelector('.check-trigger')?.setAttribute('disabled', '')
  const confirm = sheet.querySelector('[data-action="hint-confirm"]')
  if (confirm) { confirm.disabled = true; confirm.textContent = 'Getting one hint…' }
  await new Promise(resolve => setTimeout(resolve, 300))
  if (current.outcome || state.boards.get(current.key) !== current) { state.pending.delete(current.key); return }
  const correction = current.scores[index] !== ''
  current.scores[index] = '2'
  current.sources[index] = 'hint'
  current.hints++
  current.analysis = false
  const match = fixtures[Math.floor(index / 2)]
  current.message = `Hint: ${correction ? 'corrected' : 'revealed'} ${teams[match[index % 2]].name} score to 2. One hint used. (Scripted preview.)`
  state.pending.delete(current.key)
  if (state.modal === 'hint' && modalTicket === ticket) closeModal(false)
  if (state.screen === 'game' && state.active === current.key) {
    render()
    if (!sheet.open) document.querySelector('.hint-trigger')?.focus({ preventScroll: true })
    if (state.modal === 'more') {
      sheet.querySelector('[data-action="reveal"]').disabled = state.options.network !== 'online' || Boolean(current.outcome)
      sheet.querySelector('[data-action="reset"]').disabled = false
      sheet.querySelector('[data-pending-message]')?.remove()
    }
    document.querySelector(`[data-score="${index}"]`)?.scrollIntoView({ block: 'nearest' })
    say(current.message)
  }
}

function showResult() {
  const current = board()
  openModal('result', `Solved in ${elapsed(current)}`, `<p>Every fixture fits the final table.</p><dl class="detail-list"><div><dt>Puzzle</dt><dd>${label(current)}</dd></div><div><dt>Hints used</dt><dd>${current.hints}</dd></div></dl><p class="notice">Scripted result for design review. No official solve or unlock is recorded.</p>${button('Share result', 'share', '', 'button primary wide')}${button('Back to board', 'close', '', 'button wide')}`)
}

document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]')
  if (!control || control.disabled) return
  lastActivation = control
  const action = control.dataset.action
  if (action === 'nav') navigate(control.dataset.screen, Boolean(control.closest('.tab-bar')))
  if (action === 'back') { closeModal(false); const target = state.backStack.pop(); if (target) { Object.assign(state, target); state.selected = null; render(true) } else navigate('home') }
  if (action === 'settings') settings()
  if (action === 'close') requestCloseModal()
  if (action === 'keep-note') openNote(noteDraft.index, noteDraft.value)
  if (action === 'discard-note') { noteDraft = null; closeModal() }
  if (action === 'retry') { state.options.network = 'online'; render() }
  if (action === 'pack') { state.pack = Number(control.dataset.pack); state.screen = 'pack'; state.tab = 'campaign'; render(true) }
  if (action === 'play') {
    const pack = Number(control.dataset.pack), level = Number(control.dataset.level)
    if (!levelOpen(pack, level)) { openModal('locked', 'Keep building your form.', `<p>Solve level ${level - 1} in ${packs[pack]} to open this level. Revealing an answer does not unlock it.</p>${button('Got it', 'close', '', 'button primary wide')}`); return }
    state.active = `campaign-${pack}-${level}`; state.pack = pack; state.level = level; state.screen = 'game'; state.tab = 'campaign'; state.selected = null; render(true)
  }
  if (action === 'table') openModal('table', 'Final Table', `${finalTable()}<p class="fine">This reference does not change when you enter scores.</p>${button('Back to scores', 'close', '', 'button primary wide')}`)
  if (action === 'select-score') selectScore(Number(control.dataset.score))
  if (action === 'pad-close') dismissPad()
  if (action === 'adjacent') {
    const delta = Number(control.dataset.delta)
    const next = Array.from({ length: 12 }, (_, n) => (state.selected + (n + 1) * delta + 144) % 12).find(i => editable(board(), i))
    if (next !== undefined) { selectScore(next); document.querySelector(`[data-score="${next}"]`).focus({ preventScroll: true }); say(selectedLabel()) }
  }
  if (action === 'digit' && state.selected !== null) {
    const digit = control.dataset.digit, value = board().scores[state.selected]
    const next = digit === 'clear' ? '' : digit === 'delete' ? value.slice(0, -1) : value.length >= 2 || Number(value + digit) > 19 ? digit : value + digit
    if (setScore(state.selected, next)) { document.querySelector(`[data-score="${state.selected}"]`).textContent = next || '–'; refreshEntry(); restoreSelection(); say(selectedLabel()) }
  }
  if (action === 'note') { noteDraft = null; openNote(Number(control.dataset.match)) }
  if (action === 'hint' && !state.pending.has(state.active)) openModal('hint', 'Get one hint', `<p>Reveal one empty score or correct one conflicting score.</p><p><strong>Opening this sheet is free.</strong> Only the button below requests a hint.</p><p class="fine">Hints used: ${board().hints}. The result appears on your board and this sheet closes after success.</p>${button('Use 1 hint', 'hint-confirm', '', 'button primary wide')}${button('Keep solving', 'close', '', 'button wide')}`)
  if (action === 'hint-confirm') void hint()
  if (action === 'check' && !state.pending.has(state.active) && !board().outcome && state.options.network === 'online') {
    const current = board()
    if (state.options.check === 'solved') { current.outcome = 'solved'; current.elapsed = Math.floor((Date.now() - current.startedAt) / 1000); current.message = 'Solved · scripted preview. No official result recorded.'; render(); showResult() }
    else { current.message = current.scores.some(v => v === '') ? 'Some scores are still blank. Fill them in, then check again. (Preview.)' : 'These scores need another look. Compare your results with the Final Table. (Scripted preview.)'; render(); say(current.message) }
  }
  if (action === 'analyze') { board().analysis = true; render(); say('Analysis preview opened. Editing a score will clear this snapshot.') }
  if (action === 'more') openModal('more', 'Puzzle options', `${state.pending.has(state.active) ? '<p class="notice" data-pending-message>Getting one hint… Other puzzle actions will be available when it finishes.</p>' : ''}${button('Reveal answer', 'reveal', state.options.network !== 'online' || board().outcome || state.pending.has(state.active) ? 'disabled' : '', 'button wide')}${button('Reset board', 'reset', state.pending.has(state.active) ? 'disabled' : '', 'button wide')}${button('How to play', 'nav', 'data-screen="help"', 'button wide')}`)
  if (action === 'reveal' && !state.pending.has(state.active)) openModal('reveal', 'Reveal the answer?', `<p>This ends the attempt as assisted. It will not count as a normal solve or unlock the next level.</p><p class="fine">The real app receives the answer from the server only after confirmation. This preview shows the terminal state without a solution payload.</p>${button('Reveal answer', 'reveal-confirm', '', 'button danger wide')}${button('Keep solving', 'close', '', 'button wide')}`)
  if (action === 'reveal-confirm' && state.options.network === 'online' && !board().outcome && !state.pending.has(state.active)) { board().outcome = 'revealed'; board().elapsed = Math.floor((Date.now() - board().startedAt) / 1000); board().message = 'Answer revealed · assisted. Preview values are unchanged; no real answer requested or level unlocked.'; closeModal(false); render(); say(board().message) }
  if (action === 'reset') openModal('reset', 'Start this board again?', `<p>Your scores and notes on this board will be cleared. In the real app a new attempt starts; your solve history and unlocked levels stay.</p>${button('Reset board', 'reset-confirm', '', 'button danger wide')}${button('Keep my board', 'close', '', 'button wide')}`)
  if (action === 'reset-confirm') { if (state.pending.has(state.active)) return; state.boards.delete(state.active); state.selected = null; closeModal(false); render(); say('Preview board reset. A fresh timer has started.') }
  if (action === 'result') showResult()
  if (action === 'share') openModal('share', 'Your challenge invitation', `<p class="fine">Copy review only. No native share sheet opens and nothing is sent.</p><label>Invitation text<textarea rows="12" readonly>${escape(invitation())}</textarea></label>${button('Back to result', 'result', '', 'button wide')}`)
  if (action === 'privacy') openModal('privacy', 'Privacy & data', '<p>The app will explain guest and account data, local storage, retention, backup deletion and account removal here.</p><p class="notice">Design placeholder. The privacy policy and public deletion URL require verified product ownership before release.</p>')
  if (action === 'support') openModal('support', 'Get help', '<p>Reopen How to play for game rules.</p><p class="notice">Support contact and app/build diagnostics will be configured before release. This preview sends no diagnostics.</p>' + button('How to play', 'nav', 'data-screen="help"', 'button primary wide'))
  if (action === 'delete') openModal('delete', 'Delete guest data?', '<p>This clears only the scores and notes in this open preview. The native app will require server deletion and local credential cleanup.</p>' + button('Clear preview data', 'delete-confirm', '', 'button danger wide') + button('Keep my data', 'close', '', 'button wide'))
  if (action === 'delete-confirm') { state.boards.clear(); state.selected = null; closeModal(false); navigate('account'); say('Preview data cleared. No real account was changed.') }
})

document.addEventListener('focusin', event => {
  if (event.target.matches('input[data-score]:not([readonly])')) selectScore(Number(event.target.dataset.score))
})
document.addEventListener('input', event => {
  const input = event.target
  if (input.matches('input[data-score]')) {
    const index = Number(input.dataset.score)
    if (!setScore(index, input.value)) { input.value = board().scores[index]; say('Use a whole score from 0 to 19, or leave it blank.') }
    refreshEntry()
  }
  if (input.name === 'note') sheet.querySelector('[data-note-count]').textContent = `${input.value.length} / 180 characters`
})
document.addEventListener('submit', event => {
  event.preventDefault()
  const form = event.target
  if (form.id === 'settings-form') {
    const values = new FormData(form)
    for (const name of Object.keys(state.options)) state.options[name] = values.get(name)
    state.selected = null; closeModal(false); render(); document.querySelector('[data-action="settings"]').focus()
  }
  if (form.id === 'note-form') { board().notes[Number(form.dataset.match)] = String(new FormData(form).get('note')).slice(0, 180); noteDraft = null; closeModal(false); render(); document.querySelector(`[data-action="note"][data-match="${form.dataset.match}"]`)?.focus({ preventScroll: true }); say('Preview note saved.') }
  if (form.id === 'auth-form') { form.reset(); say('Preview only. No account request was sent.'); openModal('auth-preview', 'Preview form complete', '<p>No account was created or signed in. Native authentication and guest history transfer are implemented in a later phase.</p>' + button('Continue as guest', 'nav', 'data-screen="home"', 'button primary wide')) }
})
sheet.addEventListener('cancel', event => { event.preventDefault(); requestCloseModal() })
document.addEventListener('keydown', event => {
  if (event.key === 'Tab' && sheet.open) {
    const controls = [...sheet.querySelectorAll('button:not([disabled]), input, select, textarea, [tabindex="0"]')]
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet.querySelector('h2'))) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  if (event.key === 'Escape' && !sheet.open && state.selected !== null) dismissPad()
  if (state.options.input === 'custom' && !sheet.open && event.target.matches('button[data-score]') && (/^\d$/.test(event.key) || event.key === 'Backspace')) {
    event.preventDefault()
    document.querySelector(`[data-action="digit"][data-digit="${event.key === 'Backspace' ? 'delete' : event.key}"]`)?.click()
  }
})
// This is a UX clock, not the future native/server official timer implementation.
setInterval(() => { const timer = document.querySelector('[data-timer]'); if (timer) timer.textContent = elapsed() }, 1000)
render()
