import React from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { Button, colors, styles } from '../primitives'
export function ResourceNotice({ loading, cached, error, retry }: { loading: boolean; cached: boolean; error: unknown; retry(): void }) {
  return <View style={{ gap: 8 }}>{loading && <ActivityIndicator color={colors.field} accessibilityLabel="Refreshing saved data" />}{cached && <Text style={styles.secondary}>Offline · showing the last saved data for this player.</Text>}{error != null && <><Text accessibilityRole="alert" style={styles.error}>{error instanceof Error ? error.message : 'Could not load this data.'}</Text><Button title="Try again" secondary onPress={retry} /></>}</View>
}
