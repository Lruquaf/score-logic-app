import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
/** Start without motion until the OS preference is known; a late query cannot undo a newer event. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    let alive = true, revision = 0
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { revision++; setReduced(value) })
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive && revision === 0) setReduced(value) }).catch(() => undefined)
    return () => { alive = false; sub.remove() }
  }, [])
  return reduced
}
