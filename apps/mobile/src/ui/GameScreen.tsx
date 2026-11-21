import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AccessibilityInfo, ActivityIndicator, Alert, findNodeHandle, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Share, Text, TextInput, View, useWindowDimensions } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { analyzeModeFor } from '@scorelogic/contracts'
import { GameSheet } from './game/GameSheet'
import { ElapsedClock } from './game/ElapsedClock'
import { CampaignNavigation } from './player/CampaignNavigation'
import { boardKey, checkedFeedback, twoPanelLayout } from '../core/game-view'
import { FinalTable, FixtureRow, MatchNoteSheet } from './game/BoardComponents'
import { FeedbackPanel, AnalysisPanel, AttemptSummary } from './game/FeedbackPanel'
import { formatDuration, puzzleLabel, shareInvitation, source, terminal } from '../core/puzzle'
import type { Side } from '../core/types'
import type { Services } from './services'
import { Button, Heading, styles, colors } from './primitives'

type Sheet = 'hint' | 'note' | 'more' | 'reveal' | 'replay' | 'table' | 'analysis' | null

export function GameScreen({ services, onGame }: { services: Services; page: 'game'; onGame(target: string): void }) {
  const { controller, config, lifecycle } = services
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [note, setNote] = useState('')
  const [noteMatch, setNoteMatch] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [invitation, setInvitation] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const copyBusy = useRef(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const shareBusy = useRef(false)
  const shareAnchor = useRef<React.ComponentRef<typeof View> | null>(null)
  const sheetHeading = useRef<React.ComponentRef<typeof Text> | null>(null)
  const returnFocus = useRef<React.ComponentRef<typeof View> | null>(null)
  const hintButton = useRef<React.ComponentRef<typeof View> | null>(null)
  const moreButton = useRef<React.ComponentRef<typeof View> | null>(null)
  const checkButton = useRef<React.ComponentRef<typeof View> | null>(null)
  const analysisButton = useRef<React.ComponentRef<typeof View> | null>(null)
  const ticket = useRef(0)
  const waitingSheet = useRef<{ type: string; puzzle: string | undefined; ticket: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const inputRefs = useRef<Record<string, React.ComponentRef<typeof TextInput> | null>>({})
  const { width, height, fontScale } = useWindowDimensions()
  const puzzle = state.data?.data.puzzle
  const snapshot = state.draft?.snapshot
  const finished = terminal(state.data?.data.progress ?? null)
  const blocked = state.loading || state.pending || state.offline || Boolean(state.conflict) || !state.draft?.attemptId
  const editBlocked = finished || Boolean(state.conflict) || state.loading || state.pending
  const twoPanels = twoPanelLayout(width, height, fontScale)
  const feedback = puzzle && state.draft ? checkedFeedback(puzzle, state.draft, state.checked) : null
  const analyzeMode = puzzle ? analyzeModeFor(puzzle) : null

  function open(value: Sheet, trigger?: React.ComponentRef<typeof View> | null) { if (trigger) returnFocus.current = trigger; ticket.current++; setSheet(value) }
  function close() {
    if (sheet === 'note' && noteMatch && note !== (snapshot?.notes[noteMatch]?.match ?? '')) {
      Alert.alert('Discard this note?', 'Your unsaved changes will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard changes', style: 'destructive', onPress: () => { ticket.current++; setSheet(null) } }])
    } else { ticket.current++; setSheet(null) }
  }
  useEffect(() => { ticket.current++; setSheet(null); setNoteMatch(null); setSelected(null); setInvitation(null); setShareError(null); setCopyStatus(null) }, [puzzle?.id, state.draft?.attemptId])
  useEffect(() => { const listener = Keyboard.addListener('keyboardDidHide', () => setSelected(null)); return () => listener.remove() }, [])
  useEffect(() => {
    if (state.pending && ((sheet === 'hint' && state.pendingType === 'hint') || (sheet === 'reveal' && state.pendingType === 'reveal') || (sheet === 'replay' && state.pendingType === 'attempt'))) {
      waitingSheet.current = { type: sheet, puzzle: puzzle?.id, ticket: ticket.current }
    } else if (!state.pending && waitingSheet.current) {
      const waiting = waitingSheet.current
      waitingSheet.current = null
      if (!state.error && waiting.type === sheet && waiting.puzzle === puzzle?.id && waiting.ticket === ticket.current) { ticket.current++; setSheet(null) }
    }
  }, [state.pending, state.pendingType, state.error, sheet, puzzle?.id])

  useEffect(() => { if (state.notice) AccessibilityInfo.announceForAccessibility(state.notice) }, [state.notice])

  async function action(kind: 'hint' | 'reveal' | 'replay') {
    const ownTicket = ticket.current
    const ownPuzzle = puzzle?.id
    const pendingType = controller.getSnapshot().pendingType
    try {
      if (state.pending) await controller.retryPending()
      else if (kind === 'hint') await controller.hint()
      else if (kind === 'reveal') await controller.reveal()
      else await controller.replay()
      if ((!pendingType || pendingType === kind || kind === 'replay' && pendingType === 'attempt') && ticket.current === ownTicket && controller.getSnapshot().data?.data.puzzle.id === ownPuzzle) { ticket.current++; setSheet(null) }
    } catch { /* Controller retains the immutable command and retry state. */ }
  }
  async function share() {
    if (shareBusy.current || !puzzle || !snapshot || !state.data?.data.progress || state.data.data.progress.currentAttempt?.status !== 'SOLVED') return
    const message = shareInvitation(puzzle, state.data.data.progress, snapshot, config.webOrigin)
    const ownPuzzle = puzzle.id, ownAttempt = state.draft?.attemptId
    shareBusy.current = true; setSharing(true); setInvitation(message); setShareError(null)
    try { await Share.share({ message, title: 'ScoreLogic challenge' }, { subject: 'Can you beat my ScoreLogic time?', dialogTitle: 'Challenge a friend', ...(Platform.OS === 'ios' ? { anchor: findNodeHandle(shareAnchor.current) ?? undefined } : {}) }) }
    catch { if (controller.getSnapshot().data?.data.puzzle.id === ownPuzzle && controller.getSnapshot().draft?.attemptId === ownAttempt) setShareError('Could not open sharing. Select and copy the invitation below, or try again.') }
    finally { shareBusy.current = false; setSharing(false) }
  }

  async function copyInvitation() {
    if (copyBusy.current || !puzzle || !snapshot || state.data?.data.progress?.currentAttempt?.status !== 'SOLVED') return
    const ownPuzzle = puzzle.id, ownAttempt = state.draft?.attemptId
    copyBusy.current = true; setCopyStatus(null)
    try {
      const message = shareInvitation(puzzle, state.data.data.progress, snapshot, config.webOrigin)
      const copied = await Clipboard.setStringAsync(message)
      if (!copied) throw new Error('Clipboard write was not confirmed.')
      if (controller.getSnapshot().data?.data.puzzle.id === ownPuzzle && controller.getSnapshot().draft?.attemptId === ownAttempt) { setInvitation(message); setCopyStatus('Invitation copied. Paste it to challenge a friend.') }
    } catch { if (controller.getSnapshot().data?.data.puzzle.id === ownPuzzle && controller.getSnapshot().draft?.attemptId === ownAttempt) setCopyStatus('Could not copy. Use Share result or select the invitation text.') }
    finally { copyBusy.current = false }
  }

  function sheetContent() {
    if (sheet === 'table' && puzzle) return <><Heading elementRef={sheetHeading}>Final Table</Heading><FinalTable puzzle={puzzle} feedback={feedback} /><Text style={styles.body}>Your fixed reference. Entering scores does not change it.</Text></>
    if (sheet === 'note') return <MatchNoteSheet headingRef={sheetHeading} value={note} disabled={editBlocked} onChange={setNote} onSave={() => { if (noteMatch) controller.setNote(noteMatch, note); ticket.current++; setSheet(null) }} />
    if (sheet === 'analysis' && puzzle) return <><Heading elementRef={sheetHeading}>Analyze board</Heading><Button title={state.analyzing ? 'Analyzing…' : 'Analyze current entries'} disabled={blocked || finished || state.analyzing} onPress={() => { void controller.analyze().catch(() => undefined) }} />{state.analysisError && <Text accessibilityRole="alert" style={styles.error}>{state.analysisError}</Text>}{state.analysis && <AnalysisPanel puzzle={puzzle} data={state.analysis.data} stale={state.analysis.key !== boardKey(puzzle, snapshot!.inputs)} />}</>
    if (sheet === 'hint') return <><Heading elementRef={sheetHeading}>Get one hint</Heading><Text style={styles.body}>Reveal one empty score or correct one conflicting score. Given scores and earlier hints stay unchanged.</Text><Text style={styles.body}>Opening this sheet is free. Use the button below to request one hint.</Text><Text style={styles.secondary}>Used: {snapshot?.hintsUsed ?? 0}</Text>{state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}<Button title={state.busy ? 'Confirming your hint…' : state.pending ? state.pendingType === 'hint' ? 'Retry the same hint' : 'Confirm saved progress first' : 'Use 1 hint'} disabled={state.loading || Boolean(state.busy) || state.offline && !state.pending} onPress={() => { void action('hint') }} /></>
    if (sheet === 'reveal') return <><Heading elementRef={sheetHeading}>Reveal the answer?</Heading><Text style={styles.body}>This ends the attempt as assisted. It will not count as a normal solve or unlock the next level.</Text><Button title="Reveal answer" disabled={blocked} onPress={() => { void action('reveal') }} /></>
    if (sheet === 'replay') return <><Heading elementRef={sheetHeading}>Start a new attempt?</Heading><Text style={styles.body}>Your solve history, first and best result, and unlocked levels stay. Scores and notes start fresh.</Text><Button title="Start new attempt" disabled={blocked} onPress={() => { void action('replay') }} /></>
    return <><Heading elementRef={sheetHeading}>Puzzle options</Heading><Button title="Final Table" secondary onPress={() => open('table')} /><Button title="Reveal answer" secondary disabled={blocked || finished} onPress={() => open('reveal')} /><Button title="Start new attempt" secondary disabled={blocked} onPress={() => open('replay')} /></>
  }

  const introPanel = puzzle && snapshot ? <View style={{ gap: 16 }}><Text style={styles.eyebrow}>{puzzleLabel(puzzle)}</Text><Heading>{puzzle.mode === 'daily' ? 'Daily puzzle' : 'Reconstruct the scores'}</Heading>
            <View style={styles.meta}><ElapsedClock controller={controller} lifecycle={lifecycle} /><Text style={styles.secondary}>{snapshot.hintsUsed} hints used</Text></View>
            <Text style={styles.secondary}>{!state.localSaved ? 'Saving on this device…' : state.pending ? 'Confirming an operation…' : state.offline ? 'Offline · draft saved on this device' : state.draft?.dirty ? 'Saved on this device · waiting to sync' : 'Progress saved'}</Text>
            {state.pending && <Text accessibilityRole="alert" style={styles.notice}>An operation is unconfirmed. Retry confirmation checks the same action; it does not request another hint.</Text>}
            {state.error && <View><Text accessibilityRole="alert" style={styles.error}>{state.error}</Text><Button title={state.pending ? 'Retry confirmation' : 'Reconnect'} secondary disabled={Boolean(state.busy)} onPress={() => { void (state.pending ? controller.retryPending() : controller.load()).catch(() => undefined) }} /></View>}
            {state.conflict && <View style={styles.feature}><Heading>Your board changed on another device.</Heading><Text style={styles.body}>Choose a draft. Given scores, received hints and finished results always stay protected.</Text><Button title="Keep my editable scores and notes" onPress={() => { void controller.resolveConflict('local') }} /><Button title="Use saved server board" secondary onPress={() => { void controller.resolveConflict('server') }} /></View>}
            {state.notice && state.notice !== feedback?.message && <Text style={styles.notice}>{state.notice}</Text>}
            <AttemptSummary progress={state.data?.data.progress ?? null} />
            <FeedbackPanel feedback={feedback} />
            <Text style={styles.secondary}>{puzzle.initialRevealedMatches.length} given fixtures · given and hinted scores stay fixed.</Text></View> : null
  const referencePanel = puzzle ? <View testID="game-reference-table" style={{ gap: 8, backgroundColor: colors.paper, paddingVertical: 8 }}><Heading>Final Table</Heading><FinalTable puzzle={puzzle} feedback={feedback} /></View> : null
  const fixturesPanel = puzzle && snapshot ? <View style={{ gap: 16 }}><Heading>Fixtures</Heading><Text style={styles.secondary}>Nothing is checked as you type.</Text>{puzzle.matches.map(match => <FixtureRow key={match.id} puzzle={puzzle} match={match} snapshot={snapshot} feedback={feedback} disabled={editBlocked} onScore={(side, text) => controller.setScore(match.id, side, text)} onNote={trigger => { setNoteMatch(match.id); setNote(snapshot.notes[match.id]?.match ?? ''); open('note', trigger) }} onFocus={side => setSelected(`${match.id}:${side}`)} register={(side, input) => { inputRefs.current[`${match.id}:${side}`] = input }} />)}</View> : null
  const resultPanel = puzzle && snapshot ? <>{finished && state.data?.data.progress?.currentAttempt?.status === 'SOLVED' && <View style={styles.feature}><Heading>Solved in {formatDuration(state.data.data.progress.currentAttempt.elapsedTimeSec)}</Heading><View ref={shareAnchor} collapsable={false}><Button title={sharing ? 'Opening sharing…' : 'Share result'} disabled={sharing} onPress={() => { void share() }} /></View><Button title="Copy invitation" secondary onPress={() => { void copyInvitation() }} />{copyStatus && <Text accessibilityRole="alert" style={styles.secondary}>{copyStatus}</Text>}{shareError && <Text accessibilityRole="alert" style={styles.error}>{shareError}</Text>}{invitation && <Text selectable accessibilityLabel="Your puzzle invitation" style={styles.body}>{invitation}</Text>}<Button title="Play again" secondary onPress={() => open('replay')} /><Button title="Back to campaign" secondary onPress={() => onGame('campaign')} /></View>}
            {puzzle.mode === 'campaign' && <CampaignNavigation services={services} puzzle={puzzle} status={state.data?.data.progress?.currentAttempt?.status} onGame={onGame} />}</> : null
  const board = twoPanels ? <View style={[styles.content, styles.twoPanels, { flex: 1 }]}>
    <View style={{ flex: 1, minWidth: 0 }}>{referencePanel}</View>
    <ScrollView testID="game-scroll-wide" style={{ flex: 1, alignSelf: 'stretch' }} contentContainerStyle={{ gap: 16, paddingBottom: 24 }} automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">{introPanel}{fixturesPanel}{resultPanel}</ScrollView>
  </View> : <ScrollView testID="game-scroll" stickyHeaderIndices={[1]} automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{introPanel}{referencePanel}{fixturesPanel}{resultPanel}</ScrollView>

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
    <View style={styles.flex} accessibilityElementsHidden={sheet !== null} importantForAccessibility={sheet !== null ? 'no-hide-descendants' : 'auto'}>
          {state.loading ? <View style={styles.center}><ActivityIndicator accessibilityLabel="Loading your puzzle" color={colors.field} /></View> : !puzzle || !snapshot ? <View style={styles.center}><Heading>Could not load your puzzle.</Heading><Text style={styles.body}>{state.error ?? 'Connect to load a puzzle.'}</Text><Button title="Try again" onPress={() => { void controller.load() }} /></View> : board}
          {selected && puzzle && snapshot && <View style={styles.actions}><Button title="Next score" secondary disabled={editBlocked} onPress={() => {
            const cells = puzzle.matches.flatMap(match => (['home', 'away'] as Side[]).filter(side => source(puzzle, snapshot, match.id, side) === 'entry').map(side => `${match.id}:${side}`))
            const next = cells[(cells.indexOf(selected) + 1) % cells.length]
            if (next) inputRefs.current[next]?.focus()
          }} /><Button title="Done" secondary onPress={() => { Keyboard.dismiss(); setSelected(null) }} /></View>}
          {puzzle && snapshot && !state.loading && <View style={styles.actions}><Button elementRef={hintButton} title="Hint" secondary disabled={blocked || finished} onPress={() => open('hint', hintButton.current)} /><Button elementRef={checkButton} title={finished ? 'Puzzle options' : 'Check scores'} disabled={!finished && blocked} onPress={() => { if (finished) open('more', checkButton.current); else void controller.submit().catch(() => undefined) }} /><Button elementRef={moreButton} title="More" secondary onPress={() => open('more', moreButton.current)} />{analyzeMode && !finished && <Button elementRef={analysisButton} title="Analyze board" secondary disabled={blocked || state.analyzing} onPress={() => { open('analysis', analysisButton.current); void controller.analyze().catch(() => undefined) }} />}</View>}
    </View>
    <GameSheet visible={sheet !== null} initialFocus={sheetHeading} returnFocus={returnFocus} onClose={close}>{sheetContent()}{sheet !== 'hint' && state.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text>}{sheet !== 'hint' && state.pending && <><Text style={styles.notice}>Your original operation is unconfirmed. Retry confirmation checks the same action.</Text><Button title="Retry confirmation" disabled={Boolean(state.busy)} onPress={() => { void controller.retryPending().catch(() => undefined) }} /></>}</GameSheet>
  </KeyboardAvoidingView>
}

