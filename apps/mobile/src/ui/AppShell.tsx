import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState, BackHandler, Pressable, Text, View } from 'react-native'
import * as Linking from 'expo-linking'
import { useNetworkState } from 'expo-network'
import { NavigationContainer, StackActions, createNavigationContainerRef, useFocusEffect } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { HomeScreen, CampaignScreen, StatsScreen } from './player/PlayerScreens'
import { AccountScreen, AuthScreen, DeleteScreen, InfoScreen } from './player/AccountScreens'
import { failureKind } from '../core/runtime'
import type { NavigationIntent } from '../core/player'
import { useReducedMotion } from './useReducedMotion'
import { IncomingLinks } from '../core/links'
import type { Services } from './services'
import { Button, Heading, styles, colors } from './primitives'
import { GameScreen } from './GameScreen'
import { StatusView, SessionGate } from './StatusView'

export type TabParams = { Home: undefined; Daily: undefined; Campaign: undefined; Stats: undefined }
export type RootParams = { Main: { screen?: keyof TabParams } | undefined; Game: { target: string }; Account: undefined; Help: undefined; Login: undefined; Register: undefined; Delete: undefined; Privacy: undefined; Support: undefined }
const Stack = createNativeStackNavigator<RootParams>()
const Tabs = createBottomTabNavigator<TabParams>()

function Board({ services, target, onGame }: { services: Services; target: string; onGame(target: string): void }) {
  useFocusEffect(useCallback(() => services.lifecycle.focus(target), [services.lifecycle, target]))
  const state = useSyncExternalStore(services.controller.subscribe, services.controller.getSnapshot)
  const samePuzzle = services.controller.target === target && (target === 'daily' ? state.data?.data.puzzle.mode === 'daily' : state.data?.data.puzzle.id === target)
  if (!samePuzzle || !state.draft) return <StatusView issue={state.failure ? failureKind(state.failure) : null} message={state.error} pending={services.controller.target !== target || state.loading || !state.error} retry={() => { void services.controller.load(target) }} />
  return <GameScreen services={services} page="game" onGame={onGame} />
}
export function AppShell({ services }: { services: Services }) {
  const reducedMotion = useReducedMotion()
  const state = useSyncExternalStore(services.runtime.subscribe, services.runtime.getSnapshot)
  const game = useSyncExternalStore(services.controller.subscribe, services.controller.getSnapshot)
  const [navigation] = useState(() => createNavigationContainerRef<RootParams>())
  const [incomingLinks] = useState(() => new IncomingLinks(services.config.webOrigin, services.config.scheme))
  const lastIntent = useRef<NavigationIntent>({ tab: 'Home' })
  const network = useNetworkState()
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => services.runtime.getSnapshot().transition); return () => sub.remove() }, [services])
  useEffect(() => {
    const online = network.isConnected !== false && network.isInternetReachable !== false
    services.runtime.setOnline(online)
    void services.lifecycle.connectivity(online)
  }, [services, network.isConnected, network.isInternetReachable])
  useEffect(() => {
    const memory = AppState.addEventListener('memoryWarning', () => { void services.controller.onMemoryWarning().catch(error => services.runtime.report(error)) })
    const listener = AppState.addEventListener('change', next => { void services.lifecycle.activity(next === 'active').catch(error => services.runtime.report(error)) })
    const poll = setInterval(() => { void services.lifecycle.refresh() }, 60_000)
    return () => { listener.remove(); memory.remove(); clearInterval(poll); services.lifecycle.focus(null) }
  }, [services])
  useEffect(() => { if (game.failure) services.runtime.report(game.failure); else if (game.data && !game.offline && !game.error) services.runtime.clearTransient() }, [services, game.failure, game.data, game.offline, game.error])
  const dispatchLink = useCallback(() => {
    const current = services.runtime.getSnapshot()
    const target = incomingLinks.take(current.phase === 'ready' && !current.transition && navigation.isReady())
    if (target) navigation.navigate('Game', { target })
  }, [services, incomingLinks, navigation])
  useEffect(() => {
    const initialTicket = incomingLinks.initialTicket()
    const listener = Linking.addEventListener('url', ({ url }) => { if (incomingLinks.receive(url)) dispatchLink() })
    let active = true
    void Linking.getInitialURL().then(url => { if (active && incomingLinks.receiveInitial(url, initialTicket)) dispatchLink() }).catch(() => undefined)
    return () => { active = false; listener.remove() }
  }, [incomingLinks, dispatchLink])
  useEffect(() => { dispatchLink() }, [state.phase, state.transition, state.ownerEpoch, dispatchLink])
  const openGame = useCallback((target: string) => {
    if (target === 'campaign') navigation.navigate('Main', { screen: 'Campaign' })
    else if (target === 'daily') navigation.navigate('Main', { screen: 'Daily' })
    else navigation.navigate('Game', { target })
  }, [navigation])
  function resumeIntent() {
    const intent = services.runtime.consumeResume()
    const target = incomingLinks.take(services.runtime.getSnapshot().phase === 'ready' && !services.runtime.getSnapshot().transition)
    if (target) { navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'Game', params: { target } }] }); return }
    if (intent && 'target' in intent) navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'Game', params: { target: intent.target } }] })
    else if (intent && 'tab' in intent) navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: intent.tab } }] })
  }
  function continueGuest() {
    const intent = lastIntent.current
    if ('target' in intent) navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'Game', params: { target: intent.target } }] })
    else navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: intent.tab } }] })
  }
  if (state.phase === 'hydrating') return <StatusView issue={null} pending retry={() => { void services.runtime.start() }} />
  if (state.phase === 'deleted') return <View style={styles.center}><Heading>Your data has been deleted</Heading><Text style={styles.body}>This player’s active service data and local saved data have been removed. Starting again creates a separate guest.</Text>{state.message && <Text accessibilityRole="alert" style={styles.error}>{state.message}</Text>}<Button title="Start a new guest" disabled={state.transition} onPress={() => { void services.runtime.startNewGuest().catch(reason => services.runtime.report(reason)) }} /></View>
  if (state.phase === 'blocked') return state.issue === 'session' ? <SessionGate runtime={services.runtime} state={state} /> : <StatusView issue={state.issue} message={state.message} retry={() => { void services.runtime.start() }} />
  function MainTabs() {
    return <Tabs.Navigator backBehavior="history" screenOptions={{ animation: 'none', headerShown: false, tabBarActiveTintColor: colors.field, tabBarInactiveTintColor: colors.muted, tabBarHideOnKeyboard: true, tabBarLabelStyle: { fontSize: 13 }, tabBarItemStyle: { minHeight: 48 }, tabBarStyle: { backgroundColor: colors.surface }, tabBarIcon: () => null, tabBarIconStyle: { display: 'none' } }}>
      <Tabs.Screen name="Home" options={{ tabBarButtonTestID: 'tab-home' }}>{() => <HomeScreen services={services} onGame={openGame} onHelp={() => navigation.navigate('Help')} onAccount={() => navigation.navigate('Account')} />}</Tabs.Screen>
      <Tabs.Screen name="Daily" options={{ tabBarButtonTestID: 'tab-daily' }}>{() => <Board services={services} target="daily" onGame={openGame} />}</Tabs.Screen>
      <Tabs.Screen name="Campaign" options={{ tabBarButtonTestID: 'tab-campaign' }}>{() => <CampaignScreen services={services} onGame={openGame} />}</Tabs.Screen>
      <Tabs.Screen name="Stats" options={{ tabBarButtonTestID: 'tab-stats' }}>{() => <StatsScreen services={services} onGame={openGame} />}</Tabs.Screen>
    </Tabs.Navigator>
  }
  return <View style={styles.flex}>
    {!state.online && <Text accessibilityRole="alert" style={styles.notice}>Offline · saved boards remain available. Official actions need a connection.</Text>}
    {state.issue === 'maintenance' && <Text accessibilityRole="alert" style={styles.notice}>The service is temporarily unavailable. Your local draft is safe.</Text>}
    <View style={styles.flex} pointerEvents={state.transition ? 'none' : 'auto'}><NavigationContainer key={state.ownerEpoch} ref={navigation} onReady={resumeIntent} onStateChange={() => {
      const route = navigation.getCurrentRoute()
      if (route?.name === 'Game' && route.params && 'target' in route.params && typeof route.params.target === 'string') lastIntent.current = { target: route.params.target }
      else if (route && ['Home', 'Daily', 'Campaign', 'Stats'].includes(route.name)) lastIntent.current = { tab: route.name as keyof TabParams }
      services.runtime.rememberIntent(lastIntent.current)
    }}>
      <Stack.Navigator screenOptions={{ animation: reducedMotion ? 'none' : 'default', gestureEnabled: !state.transition, headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" focusable tabIndex={0} disabled={state.transition} onPress={() => navigation.goBack()} style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }}><Text style={styles.body}>Back</Text></Pressable> : null, headerTintColor: colors.field, headerStyle: { backgroundColor: colors.surface }, contentStyle: { backgroundColor: colors.paper }, headerRight: () => <View style={{ flexDirection: 'row', gap: 8 }}><Pressable accessibilityRole="button" accessibilityLabel="Open account" focusable tabIndex={0} style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }} onPress={() => navigation.navigate('Account')}><Text style={styles.secondary}>Account</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Open help" focusable tabIndex={0} style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }} onPress={() => navigation.navigate('Help')}><Text style={styles.secondary}>Help</Text></Pressable></View> }}>
        <Stack.Screen name="Main" options={{ title: 'ScoreLogic' }}>{MainTabs}</Stack.Screen>
        <Stack.Screen name="Game" options={{ title: 'Puzzle' }}>{({ route }: NativeStackScreenProps<RootParams, 'Game'>) => <Board services={services} target={route.params.target} onGame={openGame} />}</Stack.Screen>
        <Stack.Screen name="Account" options={{ title: 'Account' }}>{() => <AccountScreen services={services} onLogin={() => navigation.navigate('Login')} onRegister={() => navigation.navigate('Register')} onDelete={() => navigation.navigate('Delete')} onInfo={kind => navigation.navigate(kind === 'help' ? 'Help' : kind === 'privacy' ? 'Privacy' : 'Support')} />}</Stack.Screen>
        <Stack.Screen name="Login" options={{ title: 'Sign in' }}>{() => <AuthScreen services={services} kind="login" onSwitch={() => navigation.dispatch(StackActions.replace('Register'))} onGuest={continueGuest} onPrivacy={() => navigation.navigate('Privacy')} />}</Stack.Screen>
        <Stack.Screen name="Register" options={{ title: 'Create account' }}>{() => <AuthScreen services={services} kind="register" onSwitch={() => navigation.dispatch(StackActions.replace('Login'))} onGuest={continueGuest} onPrivacy={() => navigation.navigate('Privacy')} />}</Stack.Screen>
        <Stack.Screen name="Delete" options={{ title: 'Delete data' }}>{() => <DeleteScreen services={services} />}</Stack.Screen>
        <Stack.Screen name="Help" options={{ title: 'How to play' }}>{() => <InfoScreen kind="help" />}</Stack.Screen>
        <Stack.Screen name="Privacy" options={{ title: 'Privacy and data' }}>{() => <InfoScreen kind="privacy" />}</Stack.Screen>
        <Stack.Screen name="Support" options={{ title: 'Help and support' }}>{() => <InfoScreen kind="support" services={services} />}</Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer></View>
    {state.transition && <Text accessibilityRole="alert" style={styles.notice}>Confirming your account action…</Text>}
  </View>
}
