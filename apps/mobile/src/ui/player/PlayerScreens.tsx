import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { campaignResponseSchema, puzzleDataSchema, userProgressResponseSchema, userStatsDataSchema } from '@scorelogic/contracts'
import { duration, packOrder } from '../../core/player'
import { terminal } from '../../core/puzzle'
import type { Services } from '../services'
import { Button, Heading, styles, colors } from '../primitives'
import { usePlayerResource } from './usePlayerResource'
import { ResourceNotice } from './ResourceNotice'

export function HomeScreen({ services, onGame, onHelp, onAccount }: { services: Services; onGame(target: string): void; onHelp(): void; onAccount(): void }) {
  const daily = usePlayerResource(services, '/puzzles/daily', puzzleDataSchema)
  const recent = usePlayerResource(services, '/user/progress?limit=6', userProgressResponseSchema.shape.data)
  const owner = useSyncExternalStore(services.runtime.subscribe, services.runtime.getSnapshot).identity
  const [resume, setResume] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    if (owner) void services.runtime.store.drafts(owner.id).then(async drafts => {
      for (const draft of drafts.sort((a, b) => b.snapshot.updatedAt.localeCompare(a.snapshot.updatedAt))) {
        const cached = await services.runtime.store.getPuzzle(owner.id, draft.puzzleId)
        if (draft.dirty || cached && !terminal(cached.data.progress)) { if (live) setResume(draft.puzzleId); return }
      }
      if (live) setResume(recent.data?.progress?.entries.find(entry => entry.status === 'IN_PROGRESS' && !entry.answerRevealed)?.puzzleId ?? null)
    }).catch(error => services.runtime.report(error))
    return () => { live = false }
  }, [services, owner, daily.data, recent.data])
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>A little football. A lot of logic.</Text><Heading>Your next clever move.</Heading><Text style={styles.body}>Read the standings. Reconstruct six hidden match scores.</Text><View style={styles.feature}><Heading>A fresh daily challenge.</Heading><Text style={styles.body}>Four teams. Six matches. No account needed.</Text><ResourceNotice {...daily} retry={daily.refresh} />{daily.data && <><Text style={styles.body}>Daily · {daily.data.puzzle.dailyDate} · {daily.data.puzzle.effectiveDifficulty.toLowerCase()}</Text><Text style={styles.secondary}>{daily.data.puzzle.teams.map(team => team.nameEn).join(' · ')}</Text>{daily.data.progress && <Text style={styles.secondary}>{terminal(daily.data.progress) ? 'Your result is saved. Reopen it to review or replay.' : 'Your attempt is ready to continue.'}</Text>}</>}<Button title="Play today" onPress={() => onGame('daily')} /></View>{resume && <Button title="Continue saved puzzle" onPress={() => onGame(resume)} />}<Button title="Explore campaign" secondary onPress={() => onGame('campaign')} /><Button title="How to play" secondary onPress={onHelp} /><Button title={owner?.isAnonymous ? 'Save progress with an account' : 'Your account'} secondary onPress={onAccount} /><Text style={styles.secondary}>Given scores stay fixed. A blank is different from zero. Use Check when you are ready; nothing is checked while you type.</Text></ScrollView>
}
export function CampaignScreen({ services, onGame }: { services: Services; onGame(target: string): void }) {
  const catalog = usePlayerResource(services, '/puzzles/campaign', campaignResponseSchema.shape.data)
  const [pack, setPack] = useState<string>('BEGINNER'), [locked, setLocked] = useState<string | null>(null)
  const puzzles = catalog.data?.puzzles.filter(item => item.campaignPack === pack) ?? []
  const progress = new Map(catalog.data?.progress.map(item => [item.puzzleId, item]))
  return <ScrollView contentContainerStyle={styles.content}><Heading>Campaign</Heading><Text style={styles.body}>Every pack starts at level 1. Solve levels in order within a pack.</Text><ResourceNotice {...catalog} retry={catalog.refresh} />{catalog.data && !catalog.data.puzzles.length && <Text style={styles.body}>No campaign levels are available yet. Please try again later.</Text>}{packOrder.map(name => {
    const items = catalog.data?.puzzles.filter(item => item.campaignPack === name) ?? []
    const completed = items.filter(item => progress.get(item.id)?.status === 'COMPLETED').length
    return <Pressable key={name} accessibilityRole="button" focusable tabIndex={0} accessibilityLabel={`${name.toLowerCase()} pack`} accessibilityState={{ selected: pack === name }} onPress={() => { setPack(name); setLocked(null) }} style={[styles.feature, { borderColor: colors.controlBorder }, pack === name && { borderColor: colors.field, borderWidth: 2 }]}><Text style={styles.body}>{name.toLowerCase()}</Text>{catalog.data && <Text style={styles.secondary}>{completed} solved · {items.length} levels available</Text>}</Pressable>
  })}{catalog.data && <><Heading>{pack.toLowerCase()} · Levels</Heading>{locked && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{locked}</Text>}<View style={styles.levels}>{puzzles.map(item => {
    const saved = progress.get(item.id)
    const mark = saved?.status === 'COMPLETED' ? 'Solved' : saved?.answerRevealed ? 'Answer revealed' : saved ? 'In progress' : item.isUnlocked ? 'Open' : 'Locked'
    return <Pressable key={item.id} accessibilityRole="button" focusable tabIndex={0} accessibilityLabel={`Level ${item.campaignLevel}, ${item.isUnlocked ? 'open' : 'locked'}`} accessibilityHint={mark} onPress={() => { if (item.isUnlocked) onGame(item.id); else setLocked(`Solve level ${item.campaignLevel - 1} in this pack to unlock level ${item.campaignLevel}. Revealing an answer does not unlock the next level.`) }} style={[styles.level, !item.isUnlocked && { backgroundColor: colors.warm }]}><Text style={styles.body}>{item.campaignLevel}</Text><Text style={styles.secondary}>{mark}</Text></Pressable>
  })}</View>{!puzzles.length && <Text style={styles.body}>These levels are temporarily unavailable.</Text>}</>}</ScrollView>
}
export function StatsScreen({ services, onGame }: { services: Services; onGame(target: string): void }) {
  const stats = usePlayerResource(services, '/user/stats', userStatsDataSchema)
  const history = usePlayerResource(services, '/user/progress?limit=6', userProgressResponseSchema.shape.data)
  const value = stats.data?.stats
  const labels: Record<keyof NonNullable<typeof value>, string> = { totalSolved: 'Puzzles solved', successfulAttempts: 'Successful attempts', totalAttempts: 'Total attempts', firstTrySolves: 'First-try solves', assistedSolves: 'Assisted solves', answerReveals: 'Answers revealed', perfectSolves: 'Perfect solves', totalTimeSec: 'Total solve time', bestDurationSec: 'Best solve time', solvedEasy: 'Easy solved', solvedMedium: 'Medium solved', solvedHard: 'Hard solved', currentStreak: 'Current streak', bestStreak: 'Best streak', avgTimeSec: 'Average solve time' }
  const durations = new Set(['totalTimeSec', 'bestDurationSec', 'avgTimeSec'])
  return <ScrollView contentContainerStyle={styles.content}><Heading>Your stats</Heading><ResourceNotice {...stats} retry={stats.refresh} />{value ? <View style={styles.levels}>{(Object.keys(labels) as Array<keyof typeof value>).map(key => <View key={key} style={[styles.feature, { minWidth: 140, flexGrow: 1 }]}><Text style={styles.secondary}>{labels[key]}</Text><Text style={styles.body}>{durations.has(key) ? duration(value[key]) : value[key]}</Text></View>)}</View> : !stats.loading && !stats.error && <Text style={styles.body}>No statistics are available for this player yet.</Text>}<Button title="Refresh stats" secondary onPress={() => { stats.refresh(); history.refresh() }} /><Heading>Recent puzzles</Heading><Text style={styles.secondary}>Your latest six saved puzzle records, including attempts and official results.</Text><ResourceNotice {...history} retry={history.refresh} />{history.data?.progress?.entries.slice(0, 6).map(entry => <View key={entry.puzzleId} style={styles.feature}><Text style={styles.body}>{entry.puzzle.mode === 'daily' ? `Daily · ${entry.puzzle.dailyDate}` : `${entry.puzzle.campaignPack?.toLowerCase()} · Level ${entry.puzzle.campaignLevel}`}</Text><Text style={styles.secondary}>{entry.status.toLowerCase().replaceAll('_', ' ')} · {entry.attempts} attempts · {entry.hintsUsed} hints</Text><Text style={styles.secondary}>Official saved time: {duration(entry.timeTakenSec)}{entry.answerRevealed ? ' · answer revealed on latest activity' : ''}</Text><Text style={styles.secondary}>Last saved: {new Date(entry.updatedAt).toLocaleString('en-GB')}</Text><Button title="Open puzzle" accessibilityLabel={`Open ${entry.puzzle.mode === 'daily' ? `daily ${entry.puzzle.dailyDate}` : `${entry.puzzle.campaignPack?.toLowerCase()} level ${entry.puzzle.campaignLevel}`} puzzle`} secondary onPress={() => onGame(entry.puzzleId)} /></View>)}{history.data && !history.data.progress?.entries.length && <Text style={styles.body}>No puzzles yet. Play a daily or a campaign level to begin.</Text>}</ScrollView>
}
