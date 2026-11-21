import React, { useCallback, useEffect, useRef } from 'react'
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, styles } from '../primitives'
import { useReducedMotion } from '../useReducedMotion'
type Host = React.ComponentRef<typeof View>
function focusScreenReader(target: React.ComponentRef<typeof Text> | Host | null) {
  if (!target) return
  if (Platform.OS === 'web') {
    const element = target as unknown as { getAttribute?(name: string): string | null; setAttribute?(name: string, value: string): void; focus(): void }
    if (element.getAttribute?.('tabindex') == null) element.setAttribute?.('tabindex', '-1')
    element.focus()
  }
  else AccessibilityInfo.sendAccessibilityEvent(target, 'focus')
}
export function GameSheet({ visible, initialFocus, returnFocus, onClose, children }: { visible: boolean; initialFocus: React.RefObject<React.ComponentRef<typeof Text> | null>; returnFocus: React.RefObject<Host | null>; onClose(): void; children: React.ReactNode }) {
  const reduced = useReducedMotion(), shown = useRef(false), current = useRef(visible)
  current.current = visible
  const restore = useCallback(() => {
    if (!current.current && shown.current) {
      shown.current = false
      if (returnFocus.current) { returnFocus.current.focus(); focusScreenReader(returnFocus.current) }
    }
  }, [returnFocus])
  useEffect(() => {
    if (visible) { shown.current = true; return }
    // RN Modal's onDismiss only runs on iOS. Android uses an unanimated window
    // so focus does not depend on a guessed duration or the OS animation scale.
    if (!shown.current || Platform.OS === 'ios') return
    const timer = setTimeout(restore, 0)
    return () => clearTimeout(timer)
  }, [visible, reduced, restore])
  return <Modal testID="game-sheet-modal" visible={visible} transparent animationType={reduced || Platform.OS === 'android' ? 'none' : 'slide'} onRequestClose={onClose} onShow={() => focusScreenReader(initialFocus.current)} onDismiss={restore}>
    <SafeAreaView style={styles.backdrop}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetContainer}><View testID="game-sheet" style={styles.sheet} accessibilityViewIsModal onAccessibilityEscape={onClose}><View style={styles.sheetHeader}><Button title="Close" secondary onPress={onClose} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>{children}</ScrollView></View></KeyboardAvoidingView></SafeAreaView>
  </Modal>
}
