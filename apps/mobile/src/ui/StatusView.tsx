import React, { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native'
import type { FailureKind, MobileRuntime, RuntimeState } from '../core/runtime'
import { Button, Heading, styles, colors } from './primitives'

const titles: Record<FailureKind, string> = { offline: 'You are offline', session: 'Restore your session', maintenance: 'The service is temporarily unavailable', storage: 'Your saved data needs attention', request: 'Could not continue' }
export function StatusView({ issue, message, retry, pending = false }: { issue: FailureKind | null; message?: string | null; retry(): void; pending?: boolean }) {
  return <View style={styles.center}>{pending ? <><Heading>Opening ScoreLogic</Heading><ActivityIndicator color={colors.field} accessibilityLabel="Restoring your session and saved data" /></> : <><Heading>{titles[issue ?? 'request']}</Heading><Text accessibilityRole="alert" style={styles.body}>{message ?? 'Reconnect and try again. Your saved data is preserved.'}</Text><Button title="Try again" onPress={retry} /></>}</View>
}
export function SessionGate({ runtime, state }: { runtime: MobileRuntime; state: RuntimeState }) {
  const [email, setEmail] = useState(state.identity?.email ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(work: () => Promise<unknown>) { setBusy(true); setError(null); try { await work() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Please try again.') } finally { setBusy(false); setPassword('') } }
  return <ScrollView contentContainerStyle={styles.content}><Heading>Restore your session</Heading><Text style={styles.body}>Your saved scores, notes and unconfirmed operations stay on this device. They will never be sent as another player.</Text><Text style={styles.secondary}>{state.message}</Text>{error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Button title="Retry session recovery" disabled={busy} onPress={() => { void run(() => runtime.retrySession()) }} />
    {state.identity?.isAnonymous === false && <><TextInput accessibilityLabel="Account email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} style={styles.noteInput} /><TextInput accessibilityLabel="Account password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} style={styles.noteInput} /><Button title="Sign in again" disabled={busy || !email || !password} onPress={() => { void run(() => runtime.authenticate('login', email, password)) }} /></>}
    <Button title="Start a new guest" secondary disabled={busy} onPress={() => Alert.alert('Start a new guest?', 'This creates a separate player. Your previous local drafts remain stored for their original owner. Guest progress cannot be recovered without its credential.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Start new guest', onPress: () => { void run(() => runtime.startNewGuest()) } }])} />
  </ScrollView>
}
