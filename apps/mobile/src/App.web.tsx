import React, { useEffect, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { AppShell } from './ui/AppShell'
import { LedgerStudy } from './ui/ledger/LedgerStudy'
import { ledger } from './ui/ledger/theme'
import { createStudioServices, examplePuzzle, type StudioScreen, type StudioState } from './design/fixtures'
import type { Services } from './ui/services'
import './design/studio.css'

const screens: StudioScreen[] = ['Home', 'Daily', 'Campaign', 'Stats']
const states: StudioState[] = ['ready', 'solved', 'loading', 'empty', 'error', 'offline']
const devices = [{ label: 'Kompakt Android', width: 360, height: 780 }, { label: 'Standart telefon', width: 390, height: 844 }, { label: 'Büyük telefon', width: 430, height: 932 }, { label: 'Tablet', width: 768, height: 1024 }, { label: 'Yatay telefon', width: 844, height: 390 }]
const params = new URLSearchParams(window.location.search)
const screenParam = screens.includes(params.get('screen') as StudioScreen) ? params.get('screen') as StudioScreen : 'Home'
const stateParam = states.includes(params.get('state') as StudioState) ? params.get('state') as StudioState : 'ready'

function Canvas() {
  const [services, setServices] = useState<Services | null>(null), [error, setError] = useState<string | null>(null)
  const [fontsLoaded, fontError] = useFonts({ Figtree: require('../assets/fonts/Figtree-Regular.otf'), FigtreeMedium: require('../assets/fonts/Figtree-Medium.otf'), FigtreeSemiBold: require('../assets/fonts/Figtree-SemiBold.otf') })
  useEffect(() => {
    let active = true, current: Services | undefined
    void createStudioServices(stateParam, screenParam).then(value => { current = value; if (active) setServices(value); else value.controller.dispose() }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false; current?.controller.dispose() }
  }, [])
  if (error || fontError) return <div role="alert">Studio could not load: {error ?? fontError?.message}</div>
  if (!services || !fontsLoaded) return <div className="canvas-loading" role="status">Preparing the design canvas…</div>
  const study = params.get('mode') !== 'current'
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }}><SafeAreaView style={{ flex: 1, backgroundColor: study ? ledger.color.paper : '#F5F4EE' }}>
    <View style={{ flex: 1 }}>{study ? <LedgerStudy services={services} puzzle={examplePuzzle()} initialPage={screenParam as 'Home' | 'Daily' | 'Campaign' | 'Stats'} state={stateParam} /> : <AppShell services={services} />}</View>
  </SafeAreaView></SafeAreaProvider>
}
function Studio() {
  const [screen, setScreen] = useState<StudioScreen>(screenParam), [state, setState] = useState<StudioState>(stateParam), [device, setDevice] = useState(1), [mode, setMode] = useState<'ledger' | 'current'>(params.get('mode') === 'current' ? 'current' : 'ledger'), [compare, setCompare] = useState(params.get('compare') === '1'), [revision, setRevision] = useState(0)
  const size = devices[device]
  const src = (variant: string) => `/?canvas=1&mode=${variant}&screen=${screen}&state=${variant === 'ledger' ? 'ready' : state}&reset=${revision}`
  useEffect(() => { const p = new URLSearchParams({ mode, screen, state, compare: compare ? '1' : '0' }); history.replaceState(null, '', `/?${p}`) }, [mode, screen, state, compare])
  return <div className="studio"><header className="studio-header"><a className="studio-brand" href="/">scorelogic<span>DESIGN STUDIO</span></a><span className="studio-live"><i /> Local · Fast Refresh</span></header>
    <div className="studio-layout"><aside className="studio-sidebar"><div className="studio-label">ÇALIŞMA ALANI / 01</div><h1>Ekran önizlemesi</h1><p className="studio-description">Gerçek React Native bileşenleri. Yerel örnek veriler. Yayındaki hesaba veya veritabanına bağlantı yok.</p>
      <fieldset><legend>Görünüm</legend><div className="studio-segment">{([['ledger', 'Yeşil skor defteri'], ['current', 'Mevcut uygulama']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div></fieldset>
      <label className="studio-field">Ekran<select aria-label="Ekran" value={screen} onChange={event => setScreen(event.target.value as StudioScreen)}>{screens.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="studio-field">Ekran boyutu<select aria-label="Ekran boyutu" value={device} onChange={event => setDevice(Number(event.target.value))}>{devices.map((d, i) => <option key={d.label} value={i}>{d.label} · {d.width} × {d.height}</option>)}</select></label>
      <label className="studio-field">Mevcut uygulamanın durumu<select aria-label="Örnek durum" disabled={mode === 'ledger' && !compare} value={state} onChange={event => setState(event.target.value as StudioState)}>{states.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="studio-check"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} /> Yan yana karşılaştır</label><button type="button" className="studio-reset" onClick={() => setRevision(v => v + 1)}>Örneği sıfırla ↻</button>
      <div className="studio-note"><strong>Seçilen yön</strong><p>Modern skor defteri. Bulmaca ekranı ortak referans. Home, Campaign ve Stats aynı başlık, satır, skor hücresi ve açık yeşil yüzey düzenini kullanır.</p><div className="studio-swatches"><i style={{ background: '#174B36' }} /><i style={{ background: '#307449' }} /><i style={{ background: '#D1EB9B' }} /><i style={{ background: ledger.color.soft }} /></div></div>
      <p className="studio-footnote">Yeni yön ilk kompozisyon çalışmasıdır; tüm üretim akışları henüz taşınmadı. Gerçek akışları “Mevcut uygulama”da gezebilirsin. Native klavye, VoiceOver/TalkBack ve gerçek OS metin ölçeği cihazda ayrıca test edilir.</p>
    </aside><main className="studio-stage"><div className="studio-stage-heading"><span>{screen} / {size.width} × {size.height}</span><span>Örnek sahne · Railway bağlantısı yok</span></div><div className="studio-artboards">{(compare ? ['current', 'ledger'] : [mode]).map(variant => <section className="studio-artboard" key={variant}><div className="studio-artboard-label"><span>{variant === 'ledger' ? '01 / YEŞİL SKOR DEFTERİ' : '00 / MEVCUT BİLEŞENLER'}</span><span>{variant === 'ledger' ? 'Yön çalışması' : state}</span></div><iframe title={variant === 'ledger' ? 'Yeni tasarım önizlemesi' : 'Mevcut uygulama önizlemesi'} src={src(variant)} style={{ width: size.width, height: size.height }} /></section>)}</div><p className="studio-stage-caption">Genişliği değiştirdiğinde iframe’in gerçek viewport’u değişir. Kod değişiklikleri Fast Refresh ile bu ekranlara gelir.</p></main></div>
  </div>
}
export default function WebApp() { return params.get('canvas') === '1' ? <Canvas /> : <Studio /> }
