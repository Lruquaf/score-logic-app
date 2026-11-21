import React from 'react'
import { Text, View } from 'react-native'
import { reportRenderError } from '../diagnostics'
import { Button, Heading, styles } from './primitives'
export class CrashBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { reportRenderError(error) }
  render() { return this.state.failed ? <View style={styles.center}><Heading>ScoreLogic needs to reopen this screen</Heading><Text style={styles.body}>Saved progress stays on this device. Try again to restore it.</Text><Button title="Try again" onPress={() => this.setState({ failed: false })} /></View> : this.props.children }
}
