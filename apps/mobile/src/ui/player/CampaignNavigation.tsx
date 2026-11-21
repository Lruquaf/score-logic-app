import React, { useEffect } from 'react'
import { Text, View } from 'react-native'
import { campaignResponseSchema } from '@scorelogic/contracts'
import { campaignNeighbors } from '../../core/player'
import type { Puzzle } from '../../core/types'
import type { Services } from '../services'
import { Button, styles } from '../primitives'
import { ResourceNotice } from './ResourceNotice'
import { usePlayerResource } from './usePlayerResource'
export function CampaignNavigation({ services, puzzle, status, onGame }: { services: Services; puzzle: Puzzle; status?: string; onGame(target: string): void }) {
  const catalog = usePlayerResource(services, '/puzzles/campaign', campaignResponseSchema.shape.data)
  const { refresh } = catalog
  useEffect(() => { if (status === 'SOLVED' || status === 'REVEALED') refresh() }, [status, refresh])
  const { previous, next } = campaignNeighbors(catalog.data?.puzzles ?? [], puzzle.id)
  return <View style={{ gap: 8 }}><ResourceNotice {...catalog} retry={catalog.refresh} /><View style={styles.actions}><Button title="Previous level" secondary disabled={!previous?.isUnlocked} onPress={() => { if (previous?.isUnlocked) onGame(previous.id) }} /><Button title="Next level" secondary disabled={!next?.isUnlocked} onPress={() => { if (next?.isUnlocked) onGame(next.id) }} /><Button title="All campaign levels" secondary onPress={() => onGame('campaign')} /></View>{next && <Text style={styles.secondary}>{next.campaignPack.toLowerCase()} · Level {next.campaignLevel}{next.isUnlocked ? ' is open.' : ' unlocks after the previous normal solve.'}</Text>}</View>
}
