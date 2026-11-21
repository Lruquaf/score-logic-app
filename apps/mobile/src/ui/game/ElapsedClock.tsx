import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { Text } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { formatDuration } from '../../core/puzzle'
import type { LifecycleCoordinator } from '../../core/runtime'
import type { PuzzleController } from '../../core/controller'
import { styles } from '../primitives'
/** Timer ticks stay inside this leaf; the board/input tree does not rerender each second. */
export function ElapsedClock({ controller, lifecycle }: { controller: PuzzleController; lifecycle: LifecycleCoordinator }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const focused = useIsFocused(), [, tick] = useState(0)
  const active = state.data?.data.progress?.currentAttempt?.status === 'ACTIVE'
  useEffect(() => {
    if (!focused || !active) return
    const timer = setInterval(() => { if (lifecycle.isTicking()) tick(value => value + 1) }, 1000)
    return () => clearInterval(timer)
  }, [focused, active, lifecycle])
  const time = formatDuration(controller.elapsed())
  return <Text accessibilityLabel={`Elapsed time ${time}`} accessibilityLiveRegion="none" style={styles.time}>{time}</Text>
}
