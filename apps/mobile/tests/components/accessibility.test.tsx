import React from 'react'
import { AccessibilityInfo, Dimensions, Platform, Text, View } from 'react-native'
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { Button } from '../../src/ui/primitives'
import { useReducedMotion } from '../../src/ui/useReducedMotion'
import { GameSheet } from '../../src/ui/game/GameSheet'
import { FinalTable, ScoreInput } from '../../src/ui/game/BoardComponents'
import { AppShell } from '../../src/ui/AppShell'
import { SessionClient } from '../../src/core/session'
import { PuzzleController } from '../../src/core/controller'
import { LifecycleCoordinator, MobileRuntime } from '../../src/core/runtime'
import { envelope, identity, json, origin, progress, puzzle, random, store, vault } from '../helpers'

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() })
})

const mockTableRender = jest.fn()
jest.mock('../../src/ui/game/BoardComponents', () => {
  const actual = jest.requireActual('../../src/ui/game/BoardComponents'), React = jest.requireActual('react')
  return { ...actual, FinalTable: (props: unknown) => { mockTableRender(); return React.createElement(actual.FinalTable, props) } }
})
function Preference() { return <Text>{useReducedMotion() ? 'Motion off' : 'Motion on'}</Text> }
test('Reduce Motion starts conservatively and a late query cannot undo a newer preference event', async () => {
  let resolve!: (enabled: boolean) => void, emit!: (enabled: boolean) => void
  const remove = jest.fn()
  const query = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => new Promise(done => { resolve = done }))
  const listener = jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_name, handler) => { emit = handler; return { remove } })
  const view = await render(<Preference />)
  try {
    expect(screen.getByText('Motion off')).toBeVisible()
    await act(() => { emit(true); resolve(false) })
    expect(screen.getByText('Motion off')).toBeVisible()
    await act(() => emit(false))
    expect(screen.getByText('Motion on')).toBeVisible()
  } finally { await view.unmount(); expect(remove).toHaveBeenCalled(); query.mockRestore(); listener.mockRestore() }
})
test('buttons expose hardware focus, a visible focus ring and 48-unit targets; disabled actions cannot activate', async () => {
  const press = jest.fn(), view = await render(<Button title="Action" onPress={press} />)
  const button = screen.getByRole('button', { name: 'Action' })
  expect(button.props.focusable).toBe(true); expect(button.props.tabIndex).toBe(0)
  expect(button).toHaveStyle({ minWidth: 48, minHeight: 48 })
  await fireEvent(button, 'focus'); expect(button).toHaveStyle({ outlineWidth: 3 })
  await view.rerender(<Button title="Action" disabled onPress={press} />)
  expect(screen.getByRole('button', { name: 'Action' }).props.tabIndex).toBe(-1)
  await userEvent.press(screen.getByRole('button', { name: 'Action' })); expect(press).not.toHaveBeenCalled()
})
test('Final Table rows speak position and every metric without relying on column abbreviations', async () => {
  await render(<FinalTable puzzle={puzzle()} />)
  const row = screen.getByLabelText('Position 1. Aster. Played 3, won 1, drawn 1, lost 1, goals for 3, goals against 3, points 4.')
  expect(row.props.accessible).toBe(true)
})
test('score inputs distinguish Blank and zero and retain usable size at 200 percent text', async () => {
  const window = Dimensions.get('window'), device = Dimensions.get('screen')
  await act(() => Dimensions.set({ window: { ...window, fontScale: 2 }, screen: device }))
  try {
    const props = { label: 'Aster home score', status: 'entry' as const, disabled: false, wrong: false, onChange: jest.fn(), onFocus: jest.fn() }
    const view = await render(<ScoreInput {...props} value={null} />)
    expect(screen.getByLabelText(props.label).props.accessibilityValue.text).toBe('Blank')
    expect(screen.getByLabelText(props.label)).toHaveStyle({ width: 128 })
    await view.rerender(<ScoreInput {...props} value={0} />)
    expect(screen.getByLabelText(props.label).props.accessibilityValue.text).toBe('0')
  } finally { await act(() => Dimensions.set({ window, screen: device })) }
})
test('sheet focuses its heading, supports accessibility escape and restores the opener after dismissal', async () => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => undefined)
  const close = jest.fn(), heading = { current: {} as React.ComponentRef<typeof Text> }, opener = { current: { focus: jest.fn() } as unknown as React.ComponentRef<typeof View> }
  const view = await render(<GameSheet visible initialFocus={heading} returnFocus={opener} onClose={close}><Text>Sheet content</Text></GameSheet>)
  try {
    const modal = screen.getByTestId('game-sheet-modal'), dismiss = modal.props.onDismiss
    await fireEvent(modal, 'show')
    expect(focus).toHaveBeenCalledWith(heading.current, 'focus')
    await fireEvent(screen.getByTestId('game-sheet'), 'accessibilityEscape')
    expect(close).toHaveBeenCalledTimes(1)
    await view.rerender(<GameSheet visible={false} initialFocus={heading} returnFocus={opener} onClose={close}><Text>Sheet content</Text></GameSheet>)
    await act(() => dismiss())
    expect(focus).toHaveBeenLastCalledWith(opener.current, 'focus')
    expect(opener.current.focus).toHaveBeenCalled()
  } finally { focus.mockRestore(); await view.unmount() }
})
async function game() {
  const current = puzzle(), canonical = progress(current), database = store(), saved = vault(), rng = random()
  await saved.set('session', identity())
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async url => url.includes('/user/progress') ? json(envelope({ user: { userId: 'guest-one', isAnonymous: true }, progress: null })) : json(envelope({ puzzle: current, progress: canonical })))
  const controller = new PuzzleController(client, database, rng), runtime = new MobileRuntime(client, database, controller)
  await runtime.start()
  const services = { controller, runtime, client, lifecycle: new LifecycleCoordinator(controller), config: { apiOrigin: origin, webOrigin: origin, scheme: 'scorelogic-dev' } }
  const view = await render(<SafeAreaProvider><AppShell services={services} /></SafeAreaProvider>)
  await userEvent.press(screen.getByLabelText('Daily, tab, 2 of 4'))
  await screen.findByRole('button', { name: 'Check scores' })
  return { services, view }
}
test('an open hint hides the board from accessibility and escape closes it without requesting a hint', async () => {
  const h = await game()
  try {
    await userEvent.press(screen.getByRole('button', { name: 'Hint' }))
    expect(screen.queryByRole('button', { name: 'Check scores' })).toBeNull()
    expect(screen.getByText('Get one hint')).toBeVisible()
    await fireEvent(screen.getByTestId('game-sheet'), 'accessibilityEscape')
    expect(screen.getByRole('button', { name: 'Check scores' })).toBeVisible()
    expect(h.services.controller.getSnapshot().draft!.snapshot.hintsUsed).toBe(0)
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('timer ticks update only the clock leaf and do not redraw the board or publish gameplay state', async () => {
  const intervals = jest.spyOn(global, 'setInterval')
  const h = await game(), changes = jest.fn(), unsubscribe = h.services.controller.subscribe(changes)
  try {
    await waitFor(() => expect(h.services.controller.getSnapshot().loading).toBe(false))
    const elapsed = jest.spyOn(h.services.controller, 'elapsed').mockReturnValue(9001)
    mockTableRender.mockClear(); changes.mockClear()
    const tick = intervals.mock.calls.find(call => call[1] === 1000)![0] as () => void
    await act(() => { tick(); tick(); tick() })
    expect(elapsed).toHaveBeenCalled()
    expect(mockTableRender).not.toHaveBeenCalled(); expect(changes).not.toHaveBeenCalled()
    elapsed.mockRestore()
  } finally { intervals.mockRestore(); unsubscribe(); await h.view.unmount(); h.services.controller.dispose() }
})

test('Android sheet returns focus once without a guessed animation delay or stealing focus on later preference changes', async () => {
  const os = Platform.OS
  Reflect.set(Platform, 'OS', 'android')
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => undefined)
  const initialFocus = { current: null }, returnFocus = { current: { focus: jest.fn() } as unknown as React.ComponentRef<typeof View> }
  const view = await render(<GameSheet visible initialFocus={initialFocus} returnFocus={returnFocus} onClose={jest.fn()}><Text>Android sheet</Text></GameSheet>)
  try {
    expect(screen.getByTestId('game-sheet-modal').props.animationType).toBe('none')
    await view.rerender(<GameSheet visible={false} initialFocus={initialFocus} returnFocus={returnFocus} onClose={jest.fn()}><Text>Android sheet</Text></GameSheet>)
    await waitFor(() => expect(returnFocus.current.focus).toHaveBeenCalledTimes(1))
    await view.rerender(<GameSheet visible={false} initialFocus={initialFocus} returnFocus={returnFocus} onClose={jest.fn()}><Text>Android sheet</Text></GameSheet>)
    expect(returnFocus.current.focus).toHaveBeenCalledTimes(1)
  } finally { await view.unmount(); focus.mockRestore(); Reflect.set(Platform, 'OS', os) }
})
