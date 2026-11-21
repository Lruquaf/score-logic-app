import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { campaignResponseSchema, userStatsDataSchema } from '@scorelogic/contracts'
import type { Puzzle, Side, Snapshot } from '../../core/types'
import { formatDuration, source, terminal } from '../../core/puzzle'
import type { Services } from '../services'
import { GameSheet } from '../game/GameSheet'
import { ScoreInput } from '../game/BoardComponents'
import { ledger as t } from './theme'

type Page = 'Home' | 'Daily' | 'Campaign' | 'Stats'
type Catalog = ReturnType<typeof campaignResponseSchema.shape.data.parse>
type RecordStats = ReturnType<typeof userStatsDataSchema.parse>['stats']
type IconName = Page | 'arrow' | 'hint' | 'lock'
const packs = ['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const
const titleCase = (text: string) => text.charAt(0) + text.slice(1).toLowerCase()
const padded = (number: number) => String(number).padStart(2, '0')

function Icon({ name, active = false }: { name: IconName; active?: boolean }) {
  const ink = active ? t.color.forest : t.color.muted
  return <Svg width={name === 'lock' ? 12 : 22} height={name === 'lock' ? 12 : 22} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {name === 'Home' ? <Path d="M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3Z" />
      : name === 'Daily' ? <><Rect x={4} y={5} width={16} height={16} rx={2} /><Path d="M8 3v4m8-4v4M4 10h16m-10 5 2 2 4-4" /></>
      : name === 'Campaign' ? <><Rect x={3} y={3} width={7} height={7} rx={1} /><Rect x={14} y={3} width={7} height={7} rx={1} /><Rect x={3} y={14} width={7} height={7} rx={1} /><Rect x={14} y={14} width={7} height={7} rx={1} /></>
      : name === 'Stats' ? <Path d="M4 20h16M6 16v-5m6 5V4m6 12V8" />
      : name === 'hint' ? <><Path d="M8 15c-5-5 3-13 8-7 3 4-1 6-1 8H9" /><Path d="M10 20h4m-5-3h6" /></>
      : name === 'lock' ? <><Rect x={5} y={10} width={14} height={11} rx={2} /><Path d="M8 10V7a4 4 0 0 1 8 0v3" /></>
      : <Path d="M4 12h15m-5-5 5 5-5 5" />}
  </Svg>
}

/** The paired score, one known and one missing, is also used in the puzzle preview. */
function ScoreMark() {
  return <Svg width={35} height={26} viewBox="0 0 35 26" fill="none" aria-hidden>
    <Rect x={1} y={1} width={14} height={24} rx={5} fill={t.color.forest} />
    <Rect x={20} y={1} width={14} height={24} rx={5} stroke={t.color.forest} strokeWidth={1.5} />
    <Path d="M5 9h6v4l-6 5h6" stroke={t.color.paper} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M24 13h6" stroke={t.color.forest} strokeWidth={1.5} strokeLinecap="round" />
    <Circle cx={17.5} cy={10} r={0.8} fill={t.color.forest} /><Circle cx={17.5} cy={16} r={0.8} fill={t.color.forest} />
  </Svg>
}

function Action({ children, onPress, disabled = false }: { children: React.ReactNode; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.action, pressed && s.pressed, disabled && s.disabled]}><Text style={s.actionText}>{children}</Text></Pressable>
}

function SheetHeader({ title, detail }: { title: string; detail?: string }) {
  return <View style={s.sheetHeader}><Text style={s.kicker}>{title}</Text>{detail && <Text style={s.small}>{detail}</Text>}</View>
}

function StatLine({ label, value, unit, last = false }: { label: string; value: number | string | null | undefined; unit?: string; last?: boolean }) {
  return <View style={[s.dataRow, last && s.lastRow]} accessible accessibilityLabel={`${label}: ${value ?? 'Unavailable'}${unit ? ` ${unit}` : ''}`}>
    <Text style={s.dataLabel}>{label}</Text><View style={s.dataValueGroup}><Text style={[s.readout, String(value ?? '').length > 3 && s.wideReadout]}>{value ?? '–'}</Text><Text style={s.valueUnit}>{unit ?? ''}</Text></View>
  </View>
}

function PuzzlePreview({ puzzle }: { puzzle: Puzzle }) {
  return <View testID="ledger-puzzle-preview">
    {puzzle.matches.slice(0, 2).map((match, index) => {
      const home = puzzle.teams.find(team => team.id === match.homeTeamId)!, away = puzzle.teams.find(team => team.id === match.awayTeamId)!
      // Read-only public givens; the preview has no access to hidden scores.
      const given = puzzle.initialRevealedMatches.find(item => item.id === match.id)
      return <View key={match.id} style={[s.fixture, index === Math.min(puzzle.matches.length, 2) - 1 && s.lastRow]} accessible accessibilityLabel={`${home.nameEn} against ${away.nameEn}. ${given ? `${given.homeScore} to ${given.awayScore}, given` : 'Scores to find'}`}>
        <View style={s.fixtureTeam}><Text style={s.matchNumber}>{padded(index + 1)}</Text><Text style={s.teamName}>{home.nameEn}</Text></View>
        <View style={s.scorePair}><View style={s.scoreCell}><Text style={[s.previewScore, given && s.givenScore, !given && { color: t.color.muted }]}>{given?.homeScore ?? '–'}</Text><Text style={s.scoreSource} /></View><Text style={s.scoreColon}>:</Text><View style={s.scoreCell}><Text style={[s.previewScore, given && s.givenScore, !given && { color: t.color.muted }]}>{given?.awayScore ?? '–'}</Text><Text style={s.scoreSource} /></View>{given && <Text style={s.pairSource}>Given</Text>}</View>
        <View style={[s.fixtureTeam, s.awayFixtureTeam]}><Text style={[s.teamName, s.awayName]}>{away.nameEn}</Text></View>
      </View>
    })}
  </View>
}

export function LedgerTable({ puzzle }: { puzzle: Puzzle }) {
  return <View style={s.table} testID="ledger-table">
    <View style={[s.tableRow, s.tableHeader]}><Text style={[s.th, s.team]}>CLUB</Text>{['P', 'W', 'D', 'L', 'GF', 'GA', 'PTS'].map(key => <Text key={key} style={s.th}>{key}</Text>)}</View>
    {puzzle.standings.map(row => {
      const team = puzzle.teams.find(item => item.id === row.teamId)!
      return <View key={row.teamId} accessible accessibilityLabel={`${team.nameEn}. Played ${row.played}, won ${row.won}, drawn ${row.drawn}, lost ${row.lost}, goals for ${row.goalsFor}, goals against ${row.goalsAgainst}, points ${row.points}`} style={s.tableRow}>
        <View style={[s.team, s.club]}><Text style={s.clubPosition}>{row.position}</Text><Text style={s.clubName}>{team.code}</Text></View>
        {[row.played, row.won, row.drawn, row.lost, row.goalsFor, row.goalsAgainst, row.points].map((number, index) => <Text key={index} style={[s.td, index === 6 && s.points]}>{number}</Text>)}
      </View>
    })}
  </View>
}

function MatchRow({ puzzle, match, snapshot, index, disabled, focused, onFocus, onScore }: {
  puzzle: Puzzle; match: Puzzle['matches'][number]; snapshot: Snapshot | undefined; index: number; disabled: boolean; focused: string | null;
  onFocus(key: string): void; onScore(side: Side, value: string): void
}) {
  const home = puzzle.teams.find(team => team.id === match.homeTeamId)!, away = puzzle.teams.find(team => team.id === match.awayTeamId)!
  const bothGiven = Boolean(snapshot && source(puzzle, snapshot, match.id, 'home') === 'given' && source(puzzle, snapshot, match.id, 'away') === 'given')
  return <View style={s.fixture}>
    <View style={s.fixtureTeam}><Text style={s.matchNumber}>{padded(index + 1)}</Text><Text style={s.teamName}>{home.nameEn}</Text></View>
    <View style={s.scorePair}>{(['home', 'away'] as Side[]).map((side, cell) => {
      const status = snapshot ? source(puzzle, snapshot, match.id, side) : 'entry'
      return <React.Fragment key={side}>{cell === 1 && <Text style={s.scoreColon}>:</Text>}<View style={s.scoreCell}>
        <ScoreInput label={`${side === 'home' ? home.nameEn : away.nameEn} ${side} study score`} value={snapshot?.inputs[match.id]?.[side] ?? null} status={status} disabled={disabled} wrong={false} compact inputStyle={[s.score, status === 'given' && s.givenScore, status === 'hint' && s.hintScore, focused === `${match.id}:${side}` && s.focusedScore]} onChange={value => onScore(side, value)} onFocus={() => onFocus(`${match.id}:${side}`)} />
        <Text style={s.scoreSource}>{!bothGiven && status === 'given' ? 'Given' : status === 'hint' ? 'Hint' : ''}</Text>
      </View></React.Fragment>
    })}{bothGiven && <Text style={s.pairSource}>Given</Text>}</View>
    <View style={[s.fixtureTeam, s.awayFixtureTeam]}><Text style={[s.teamName, s.awayName]}>{away.nameEn}</Text></View>
  </View>
}

/** A native composition study with local public services; the complete production UI remains available in Studio's Current app view. */
export function LedgerStudy({ services, puzzle, initialPage, state }: { services: Services; puzzle: Puzzle; initialPage: Page; state: string }) {
  const [page, setPage] = useState<Page>(initialPage), [pack, setPack] = useState<string>('BEGINNER'), [sheet, setSheet] = useState(false)
  const [boardTarget, setBoardTarget] = useState('daily'), [focused, setFocused] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null), [record, setRecord] = useState<RecordStats>(null), [resourceError, setResourceError] = useState<string | null>(null)
  const { width, height, fontScale } = useWindowDimensions()
  const twoPanels = width >= 740 && fontScale <= 1.2, shortScreen = height <= 500
  const game = useSyncExternalStore(services.controller.subscribe, services.controller.getSnapshot)
  const title = useRef<React.ComponentRef<typeof Text> | null>(null), opener = useRef<React.ComponentRef<typeof View> | null>(null)
  useEffect(() => {
    let active = true
    void Promise.all([
      services.client.call('/puzzles/campaign', {}, campaignResponseSchema.shape.data),
      services.client.call('/user/stats', {}, userStatsDataSchema)
    ]).then(([campaign, stats]) => { if (active) { setCatalog(campaign.data); setRecord(stats.data.stats) } }).catch(() => { if (active) setResourceError('Could not load your record.') })
    return () => { active = false }
  }, [services])
  useEffect(() => {
    setFocused(null); setSheet(false)
    if (page === 'Daily') void services.controller.load(boardTarget).catch(() => undefined)
  }, [services, page, boardTarget])
  const current = game.data?.data.puzzle ?? puzzle, snapshot = game.draft?.snapshot, finished = terminal(game.data?.data.progress ?? null)
  const levels = catalog?.puzzles.filter(level => level.campaignPack === pack) ?? []
  const completedIds = new Set(catalog?.progress.filter(progress => progress.status === 'COMPLETED').map(progress => progress.puzzleId))
  const solvedCount = levels.filter(level => completedIds.has(level.id)).length
  const next = levels.find(level => level.isUnlocked && !completedIds.has(level.id))
  const beginner = catalog?.puzzles.filter(level => level.campaignPack === 'BEGINNER') ?? []
  const beginnerSolved = beginner.filter(level => completedIds.has(level.id)).length
  const beginnerNext = beginner.find(level => level.isUnlocked && !completedIds.has(level.id))
  const date = new Date(`${puzzle.dailyDate ?? '2026-11-20'}T12:00:00Z`)
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
  const dailyDraft = game.data?.data.puzzle.mode === 'daily' && snapshot && !finished
  const goDaily = () => { setBoardTarget('daily'); setPage('Daily') }
  const goLevel = (id: string) => { setBoardTarget(id); setPage('Daily') }
  const campaignGame = page === 'Daily' && boardTarget !== 'daily'
  const activeTab = campaignGame ? 'Campaign' : page
  const gameTitle = current.mode === 'campaign' ? `Level ${padded(current.campaignLevel ?? 1)}` : 'Daily puzzle'
  const gameSubtitle = current.mode === 'campaign' ? `${titleCase(current.campaignPack ?? pack)} · ${titleCase(current.effectiveDifficulty)}` : `${day} · ${titleCase(current.effectiveDifficulty)}`

  const gameIntro = <View style={s.gameIntro}><View><Text accessibilityRole="header" style={s.gameTitle}>{gameTitle}</Text><Text style={s.small}>{gameSubtitle}</Text></View><Text accessibilityLabel="Example elapsed time 1 minute 36 seconds" style={s.timer}>01:36</Text></View>
  const referencePanel = <View testID="ledger-reference" style={s.stickyReference}><View style={s.referenceLabel}><Text style={s.kicker}>Final table</Text><Text style={s.small}>{current.teams.length} clubs</Text></View><LedgerTable puzzle={current} /></View>
  const fixturesPanel = <View><View style={s.sectionHeading}><Text style={s.kicker}>Fixtures</Text><Text style={s.small}>Hints: {snapshot?.hintsUsed ?? 0}</Text></View>
      <View style={s.matchSheet}>{current.matches.map((match, index) => <MatchRow key={match.id} puzzle={current} match={match} snapshot={snapshot} index={index} focused={focused} onFocus={setFocused} disabled={!snapshot || finished || game.pending || game.loading} onScore={(side, value) => services.controller.setScore(match.id, side, value)} />)}</View>
      {game.checked && <Text accessibilityRole="alert" style={s.support}>{game.checked.feedback.message}</Text>}
      {finished && <View style={s.result}><Text style={s.kicker}>Solved</Text><Text style={s.sectionTitle}>Puzzle complete</Text><Text style={s.support}>01:36 · Hints: {snapshot?.hintsUsed ?? 0}</Text></View>}
      {state !== 'ready' && <Text style={s.support}>Review state: {state}. Full recovery states are available under Current app.</Text>}
    </View>
  const dailyContent = twoPanels ? <View style={s.twoPanels}>
    <View style={s.referencePane}>{referencePanel}</View>
    <ScrollView testID="ledger-game-scroll-wide" style={s.grow} contentContainerStyle={s.wideContent} keyboardShouldPersistTaps="handled">{gameIntro}{fixturesPanel}</ScrollView>
  </View> : <ScrollView testID="ledger-game-scroll" stickyHeaderIndices={[1]} contentContainerStyle={s.gameContent} keyboardShouldPersistTaps="handled">{gameIntro}{referencePanel}{fixturesPanel}</ScrollView>

  return <View style={s.app}>
    <View style={s.masthead}><View style={s.brand}><ScoreMark /><Text style={s.wordmark}>scorelogic</Text></View>{page !== 'Daily' && <Text style={s.guest}>Guest</Text>}</View>
    {page === 'Daily' ? dailyContent : <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {page === 'Home' ? <>
        <View style={s.pageIntro}><Text accessibilityRole="header" style={s.gameTitle}>Daily puzzle</Text><Text style={s.small}>{day} · {titleCase(puzzle.effectiveDifficulty)}</Text></View>
        <View style={s.matchSheet}><SheetHeader title="Match preview" detail={`${puzzle.teams.length} teams · ${puzzle.matches.length} matches`} /><PuzzlePreview puzzle={puzzle} /></View>
        <View style={s.startAction}><Action onPress={goDaily}>{dailyDraft ? 'Continue daily' : 'Play daily'}</Action></View>
        <View style={[s.matchSheet, s.homeSection]}><SheetHeader title="Campaign" detail="5 packs" />
          <Pressable accessibilityRole="button" accessibilityLabel="Explore campaign study" onPress={() => setPage('Campaign')} style={({ pressed }) => [s.navigationRow, pressed && s.pressed]}>
            <View style={s.grow}><Text style={s.dataLabel}>Beginner</Text><Text style={s.support}>{beginnerSolved} / 30 solved</Text></View><View style={s.nextCell}><Text style={s.readout}>{padded(beginnerNext?.campaignLevel ?? beginnerSolved)}</Text><Text style={s.small}>{beginnerNext ? 'Next' : 'Solved'}</Text></View><Icon name="arrow" active />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="View statistics" onPress={() => setPage('Stats')} style={({ pressed }) => [s.recordLink, pressed && s.pressed]}><View style={s.grow}><Text style={s.dataLabel}>Your record</Text><Text style={s.support}>{record?.totalSolved ?? '–'} solved · {record?.currentStreak ?? '–'}-day streak</Text></View><Icon name="arrow" active /></Pressable>
      </> : page === 'Campaign' ? <>
        <View style={s.pageIntro}><Text accessibilityRole="header" style={s.gameTitle}>Campaign</Text><Text style={s.small}>5 packs · 150 puzzles</Text></View>
        <View style={s.packTabs}>{packs.map(name => <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: pack === name }} aria-pressed={pack === name} onPress={() => setPack(name)} style={[s.pack, pack === name && s.activePack]}><Text style={[s.packText, pack === name && s.activePackText]}>{titleCase(name)}</Text></Pressable>)}</View>
        <View style={s.matchSheet}>
          <SheetHeader title={titleCase(pack)} detail={`${solvedCount} / ${levels.length || 30} solved`} />
          {next && <Pressable accessibilityRole="button" accessibilityLabel={`Play ${titleCase(pack)} level ${next.campaignLevel}`} onPress={() => goLevel(next.id)} style={({ pressed }) => [s.navigationRow, s.nextLevelRow, pressed && s.pressed]}><View style={s.grow}><Text style={s.dataLabel}>Next level</Text></View><Text style={s.readout}>{padded(next.campaignLevel)}</Text><View style={s.inlinePlay}><Text style={s.inlinePlayText}>Play</Text><Icon name="arrow" active /></View></Pressable>}
          {Array.from({ length: Math.ceil(levels.length / 5) }, (_, row) => <View key={row} style={[s.levelRow, row === Math.ceil(levels.length / 5) - 1 && s.lastRow]}>{levels.slice(row * 5, row * 5 + 5).map(level => {
            const completed = completedIds.has(level.id), selected = next?.id === level.id, locked = !level.isUnlocked
            return <Pressable key={level.id} accessibilityRole="button" accessibilityLabel={`Study level ${level.campaignLevel}, ${completed ? 'completed' : locked ? 'locked' : 'open'}`} accessibilityState={{ disabled: locked }} disabled={locked} onPress={() => goLevel(level.id)} style={s.levelSlot}><View style={[s.level, selected && s.currentLevel]}><Text style={[s.levelNumber, completed && s.completedNumber, selected && s.currentLevelNumber]}>{padded(level.campaignLevel)}</Text>{locked ? <Icon name="lock" /> : <Text style={s.levelMark}>{completed ? '✓' : '→'}</Text>}</View></Pressable>
          })}</View>)}
        </View>
      </> : <>
        <View style={s.pageIntro}><Text accessibilityRole="header" style={s.gameTitle}>Statistics</Text><Text style={s.small}>{record?.totalAttempts ?? '–'} attempts</Text></View>
        <View style={s.matchSheet}><SheetHeader title="Record" /><StatLine label="Puzzles solved" value={record?.totalSolved} /><StatLine label="Current streak" value={record?.currentStreak} unit="days" last /></View>
        <View style={[s.matchSheet, s.homeSection]}><SheetHeader title="Results" detail="Puzzles" /><StatLine label="Without hints" value={record?.perfectSolves} /><StatLine label="With hints" value={record?.assistedSolves} /><StatLine label="Answers revealed" value={record?.answerReveals} last /></View>
        <View style={[s.matchSheet, s.homeSection]}><SheetHeader title="Time" detail="Min : sec" /><StatLine label="Best" value={record?.bestDurationSec == null ? null : formatDuration(record.bestDurationSec)} /><StatLine label="Average" value={record?.avgTimeSec == null ? null : formatDuration(record.avgTimeSec)} last /></View>
      </>}
      {resourceError && <Text accessibilityRole="alert" style={s.support}>{resourceError}</Text>}
    </ScrollView>}
    {page === 'Daily' && <View style={[s.gameActions, shortScreen && s.compactActions]}><Pressable ref={opener} accessibilityRole="button" accessibilityState={{ disabled: game.pending || finished }} disabled={game.pending || finished} onPress={() => setSheet(true)} style={s.hintButton}><Icon name="hint" active /><Text style={s.hintLabel}>Hint</Text></Pressable><View style={s.grow}><Action disabled={!snapshot || game.pending || finished} onPress={() => { void services.controller.submit().catch(() => undefined) }}>Check scores</Action></View></View>}
    <View style={[s.tabs, shortScreen && s.compactTabs]}>{(['Home', 'Daily', 'Campaign', 'Stats'] as Page[]).map(label => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: activeTab === label }} aria-selected={activeTab === label} accessibilityLabel={`${label} study tab`} onPress={() => { if (label === 'Daily') goDaily(); else setPage(label) }} style={[s.tab, shortScreen && s.compactTab]}><View style={[s.tabIcon, shortScreen && s.compactTabIcon, activeTab === label && s.selectedTabIcon]}><Icon name={label} active={activeTab === label} /></View><Text style={[s.tabLabel, activeTab === label && s.activeTabLabel]}>{label}</Text></Pressable>)}</View>
    <GameSheet visible={sheet} initialFocus={title} returnFocus={opener} onClose={() => setSheet(false)}><Text ref={title} accessibilityRole="header" style={s.sectionTitle}>Use a hint?</Text><Text style={s.support}>Reveals or corrects one score.</Text><Text style={s.small}>Used: {snapshot?.hintsUsed ?? 0}</Text><Action disabled={game.pending} onPress={() => { void services.controller.hint().then(() => setSheet(false)).catch(() => undefined) }}>Use 1 hint</Action>{game.error && <Text style={s.support}>{game.error}</Text>}</GameSheet>
  </View>
}

const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: t.color.paper }, lastRow: { borderBottomWidth: 0 }, grow: { flex: 1 }, pressed: { opacity: 0.82 }, disabled: { opacity: 0.45 },
  masthead: { paddingHorizontal: 20, minHeight: 44, borderBottomWidth: 1, borderColor: t.color.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 }, wordmark: { fontFamily: t.font.display, fontSize: 21, letterSpacing: -0.9, color: t.color.ink }, guest: { fontFamily: t.font.body, fontSize: 12, color: t.color.muted },
  content: { paddingHorizontal: 20, paddingBottom: 24, width: '100%', maxWidth: 600, alignSelf: 'center' }, pageIntro: { minHeight: 68, justifyContent: 'center' },
  kicker: { fontFamily: t.font.medium, fontSize: 11, letterSpacing: 0.8, color: t.color.forest }, small: { fontFamily: t.font.body, fontSize: 12, lineHeight: 17, color: t.color.muted },
  sectionTitle: { fontFamily: t.font.display, fontSize: 23, lineHeight: 30, color: t.color.ink }, support: { fontFamily: t.font.body, fontSize: 14, lineHeight: 20, color: t.color.muted, marginTop: 4 },
  sheetHeader: { minHeight: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, backgroundColor: t.color.mint, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: t.color.line },
  previewScore: { width: 52, height: 48, lineHeight: 48, borderRadius: t.radius.score, backgroundColor: t.color.paper, textAlign: 'center', color: t.color.ink, fontFamily: t.font.medium, fontSize: 23, fontVariant: ['tabular-nums'] },
  startAction: { marginTop: 12 }, homeSection: { marginTop: 18 }, navigationRow: { minHeight: 84, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 16 },
  nextCell: { alignItems: 'center', gap: 3 }, readout: { minWidth: 52, paddingHorizontal: 8, height: 44, lineHeight: 44, borderRadius: t.radius.score, backgroundColor: t.color.soft, textAlign: 'center', fontFamily: t.font.medium, fontSize: 23, fontVariant: ['tabular-nums'], color: t.color.ink }, wideReadout: { minWidth: 80 },
  recordLink: { minHeight: 76, marginTop: 12, paddingHorizontal: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: t.color.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dataRow: { minHeight: 62, borderBottomWidth: 1, borderColor: t.color.line, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, dataLabel: { flexShrink: 1, fontFamily: t.font.medium, fontSize: 14, lineHeight: 20, color: t.color.ink }, dataValueGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 }, valueUnit: { minWidth: 27, fontFamily: t.font.body, fontSize: 12, color: t.color.muted },
  twoPanels: { flex: 1, flexDirection: 'row', gap: 18, paddingHorizontal: 20, paddingVertical: 8 }, referencePane: { width: '43%', minWidth: 300 }, wideContent: { paddingBottom: 24 },
  gameContent: { paddingHorizontal: 20, paddingBottom: 24 }, gameIntro: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, gameTitle: { fontFamily: t.font.display, fontSize: 22, lineHeight: 28, color: t.color.ink }, timer: { fontFamily: t.font.medium, fontSize: 19, fontVariant: ['tabular-nums'], color: t.color.forest },
  stickyReference: { backgroundColor: t.color.mint, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: t.color.line, borderRadius: 16 }, referenceLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  table: { width: '100%' }, tableRow: { flexDirection: 'row', minHeight: 30, alignItems: 'center', borderBottomWidth: 1, borderColor: t.color.line }, tableHeader: { minHeight: 24, backgroundColor: t.color.selected, borderRadius: 6 }, th: { flex: 1, minWidth: 0, fontFamily: t.font.medium, fontSize: 10, color: t.color.muted, textAlign: 'center' }, team: { flex: 2.2, minWidth: 66, textAlign: 'left' }, club: { flexDirection: 'row', alignItems: 'center', gap: 7 }, clubPosition: { fontFamily: t.font.body, fontSize: 10, color: t.color.muted, width: 8 }, clubName: { fontFamily: t.font.medium, fontSize: 12, color: t.color.ink }, td: { flex: 1, minWidth: 0, fontFamily: t.font.body, fontSize: 14, fontVariant: ['tabular-nums'], color: t.color.ink, textAlign: 'center' }, points: { fontFamily: t.font.display, color: t.color.forest },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }, matchSheet: { borderWidth: 1, borderColor: t.color.line, borderRadius: t.radius.panel, backgroundColor: t.color.surface, overflow: 'hidden' }, fixture: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 84, paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderColor: t.color.line }, fixtureTeam: { flex: 1, minWidth: 0 }, matchNumber: { fontFamily: t.font.medium, fontSize: 10, lineHeight: 12, color: t.color.muted, marginBottom: 3 }, teamName: { fontFamily: t.font.medium, fontSize: 14, lineHeight: 19, color: t.color.ink }, awayName: { textAlign: 'right' }, awayFixtureTeam: { paddingTop: 15 }, scorePair: { flexDirection: 'row', gap: 4, alignItems: 'flex-start' }, scoreCell: { alignItems: 'center' }, score: { width: 52, minHeight: 48, height: 48, borderRadius: t.radius.score, borderWidth: 1, borderColor: t.color.controlBorder, backgroundColor: t.color.surface, textAlign: 'center', color: t.color.ink, fontFamily: t.font.medium, fontSize: 23, fontVariant: ['tabular-nums'], padding: 4 }, givenScore: { backgroundColor: t.color.soft, borderColor: t.color.soft }, hintScore: { borderColor: t.color.field, backgroundColor: t.color.selected }, focusedScore: { borderColor: t.color.field, borderWidth: 2 }, scoreSource: { minHeight: 15, lineHeight: 15, fontFamily: t.font.medium, fontSize: 10, color: t.color.muted }, pairSource: { position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', lineHeight: 15, fontFamily: t.font.medium, fontSize: 10, color: t.color.muted }, scoreColon: { lineHeight: 48, fontFamily: t.font.medium, fontSize: 18, color: t.color.muted },
  gameActions: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: t.color.surface, paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderColor: t.color.line }, hintButton: { minWidth: 60, minHeight: 48, backgroundColor: t.color.soft, borderRadius: t.radius.control, alignItems: 'center', justifyContent: 'center', gap: 3 }, hintLabel: { fontFamily: t.font.medium, fontSize: 11, color: t.color.forest }, action: { minHeight: 48, borderRadius: t.radius.control, backgroundColor: t.color.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 }, actionText: { color: t.color.surface, fontFamily: t.font.medium, fontSize: 16 }, result: { padding: 18, borderRadius: t.radius.panel, backgroundColor: t.color.soft, marginTop: 16, gap: 5 },
  compactActions: { paddingVertical: 5 }, compactTabs: { minHeight: 46 }, compactTab: { minHeight: 40, marginVertical: 3, gap: 2 }, compactTabIcon: { height: 24 },
  tabs: { minHeight: 72, paddingHorizontal: 8, borderTopWidth: 1, borderColor: t.color.line, backgroundColor: t.color.surface, flexDirection: 'row' }, tab: { flex: 1, minHeight: 64, marginVertical: 4, justifyContent: 'center', alignItems: 'center', gap: 3 }, tabIcon: { width: 52, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, selectedTabIcon: { backgroundColor: t.color.selected }, tabLabel: { fontFamily: t.font.medium, fontSize: 11, color: t.color.muted }, activeTabLabel: { color: t.color.forest },
  packTabs: { flexDirection: 'row', marginBottom: 16, borderWidth: 1, borderColor: t.color.line, borderRadius: 12, backgroundColor: t.color.mint, overflow: 'hidden' }, pack: { flex: 1, minWidth: 0, alignItems: 'center', minHeight: 48, paddingHorizontal: 3, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, activePack: { backgroundColor: t.color.selected, borderBottomColor: t.color.forest }, packText: { fontFamily: t.font.body, fontSize: 13, color: t.color.muted }, activePackText: { fontFamily: t.font.medium, color: t.color.forest },
  nextLevelRow: { minHeight: 72, borderBottomWidth: 1, borderColor: t.color.line }, inlinePlay: { flexDirection: 'row', alignItems: 'center', gap: 8 }, inlinePlayText: { fontFamily: t.font.medium, fontSize: 14, color: t.color.forest },
  levelRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: t.color.line, paddingHorizontal: 5, paddingVertical: 4 }, levelSlot: { flex: 1, minWidth: 0, minHeight: 56, alignItems: 'center', justifyContent: 'center' }, level: { minWidth: 48, minHeight: 52, borderRadius: t.radius.score, alignItems: 'center', justifyContent: 'center', gap: 4 }, currentLevel: { backgroundColor: t.color.soft, borderWidth: 1, borderColor: t.color.field }, levelNumber: { fontFamily: t.font.medium, fontSize: 19, color: t.color.muted, fontVariant: ['tabular-nums'] }, completedNumber: { color: t.color.ink }, currentLevelNumber: { color: t.color.forest }, levelMark: { fontFamily: t.font.medium, fontSize: 11, color: t.color.forest, lineHeight: 13 }
})
