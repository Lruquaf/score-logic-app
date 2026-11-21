import React, { memo, useRef } from 'react'
import { Keyboard, ScrollView, Text, TextInput, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native'
import type { Feedback, Puzzle, Side, Snapshot } from '../../core/types'
import { source } from '../../core/puzzle'
import { feedbackMarks } from '../../core/game-view'
import { Button, Heading, colors, styles } from '../primitives'

export const FinalTable = memo(function FinalTable({ puzzle, feedback }: { puzzle: Puzzle; feedback?: Feedback | null }) {
  const { fontScale } = useWindowDimensions()
  return <ScrollView horizontal accessibilityLabel="Final Table, swipe for all metrics" contentContainerStyle={{ paddingVertical: 8 }}><View>
    <View style={styles.tableRow}><Text style={[styles.tableCell, styles.teamCell]}>Team</Text>{['P', 'W', 'D', 'L', 'GF', 'GA', 'Pts'].map(label => <Text key={label} style={[styles.tableCell, { minWidth: 43 * fontScale }]}>{label}</Text>)}</View>
    {puzzle.standings.map(row => {
      const team = puzzle.teams.find(item => item.id === row.teamId)!
      const flagged = feedback?.mode === 'CONSTRAINT_VIOLATIONS' && feedback.violations.some(item => item.teamId === team.id)
      return <View key={team.id} accessible accessibilityLabel={`Position ${row.position}. ${team.nameEn}. Played ${row.played}, won ${row.won}, drawn ${row.drawn}, lost ${row.lost}, goals for ${row.goalsFor}, goals against ${row.goalsAgainst}, points ${row.points}.${flagged ? ' Check this team after your last submission.' : ''}`} style={[styles.tableRow, flagged && { backgroundColor: colors.dangerSoft }]}><Text style={[styles.tableCell, styles.teamCell]}>{team.code}</Text>{[row.played, row.won, row.drawn, row.lost, row.goalsFor, row.goalsAgainst, row.points].map((value, index) => <Text key={index} style={[styles.tableCell, { minWidth: 43 * fontScale }]}>{value}</Text>)}</View>
    })}
  </View></ScrollView>
})
export function ScoreInput({ label, value, status, disabled, wrong, inputRef, onChange, onFocus, inputStyle, compact = false }: { label: string; value: number | null; status: ReturnType<typeof source>; disabled: boolean; wrong: boolean; inputRef?: React.Ref<React.ComponentRef<typeof TextInput>>; inputStyle?: StyleProp<TextStyle>; compact?: boolean; onChange(value: string): void; onFocus(): void }) {
  const { fontScale } = useWindowDimensions()
  const editable = !disabled && status === 'entry'
  return <View style={styles.scoreWrap}><TextInput ref={inputRef} accessibilityLabel={`${label}${status === 'entry' ? '' : `, ${status}`}${wrong ? ', adjust this score after Check' : ''}`} accessibilityState={{ disabled: !editable }} accessibilityValue={{ text: value === null ? 'Blank' : String(value) }} accessibilityHint={editable ? 'Whole score from zero to nineteen. Blank is different from zero. Use Next score or Done below the board.' : 'Fixed score, cannot be edited.'} focusable={editable} keyboardType="number-pad" inputMode="numeric" autoComplete="off" autoCorrect={false} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} editable={editable} selectTextOnFocus value={value == null ? '' : String(value)} placeholder="–" placeholderTextColor={colors.muted} onChangeText={text => { if (/^(?:\d{1,2})?$/.test(text) && Number(text) <= 19) onChange(text) }} onFocus={onFocus} style={[styles.score, { width: Math.max(64, 64 * fontScale) }, status !== 'entry' && styles.fixedScore, status === 'hint' && styles.hintedScore, wrong && { borderColor: colors.danger, borderWidth: 2 }, inputStyle]} />{!compact && <Text style={styles.source}>{wrong ? 'Adjust score' : status === 'entry' ? label.includes(' home ') ? 'home' : 'away' : status}</Text>}</View>
}
export function FixtureRow({ puzzle, match, snapshot, feedback, disabled, onScore, onNote, onFocus, register }: { puzzle: Puzzle; match: Puzzle['matches'][number]; snapshot: Snapshot; feedback: Feedback | null; disabled: boolean; onScore(side: Side, text: string): void; onNote(trigger: React.ComponentRef<typeof View> | null): void; onFocus(side: Side): void; register(side: Side, input: React.ComponentRef<typeof TextInput> | null): void }) {
  const noteButton = useRef<React.ComponentRef<typeof View> | null>(null)
  const home = puzzle.teams.find(team => team.id === match.homeTeamId)!, away = puzzle.teams.find(team => team.id === match.awayTeamId)!
  const flagged = feedbackMarks(feedback, match.id, 'home').match
  return <View style={{ gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderColor: flagged ? colors.danger : colors.line }}>
    <Text style={styles.body}>{home.nameEn} — {away.nameEn}</Text>
    {flagged && <Text style={styles.error}>{feedback?.mode === 'EXACT_WRONG_OUTCOMES' ? 'Check the match result.' : 'Check this fixture.'}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>{(['home', 'away'] as Side[]).map(side => <ScoreInput key={side} label={`${side === 'home' ? home.nameEn : away.nameEn} ${side} score against ${side === 'home' ? away.nameEn : home.nameEn}`} value={snapshot.inputs[match.id]?.[side] ?? null} status={source(puzzle, snapshot, match.id, side)} disabled={disabled} wrong={Boolean(feedbackMarks(feedback, match.id, side).cell)} inputRef={input => register(side, input)} onChange={text => onScore(side, text)} onFocus={() => onFocus(side)} />)}<Button elementRef={noteButton} title={`Note · ${home.code} vs ${away.code}`} secondary disabled={disabled} onPress={() => onNote(noteButton.current)} /></View>
    {snapshot.notes[match.id]?.match ? <Text selectable style={styles.secondary}>Note: {snapshot.notes[match.id].match}</Text> : null}
  </View>
}
export function MatchNoteSheet({ value, disabled, onChange, onSave, headingRef }: { value: string; disabled: boolean; onChange(value: string): void; onSave(): void; headingRef?: React.Ref<React.ComponentRef<typeof Text>> }) {
  return <><Heading elementRef={headingRef}>Match note</Heading><Text style={styles.body}>Working notes are separate from your scores. Save your note before leaving.</Text><TextInput accessibilityLabel="Your match note" editable={!disabled} multiline maxLength={180} style={styles.noteInput} value={value} onChangeText={onChange} /><Text style={styles.secondary}>{value.length} / 180 characters</Text><Button title="Save note" disabled={disabled} onPress={onSave} /></>
}
