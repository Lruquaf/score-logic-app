/** Build-only switches, no payload or user data in telemetry configuration. */
export function diagnosticsConfig(enabled: string | undefined, dsn: string | undefined) {
  if (enabled !== undefined && enabled !== '' && !['true', 'false'].includes(enabled)) throw new Error('Crash reporting must be explicitly true or false.')
  if (enabled !== 'true') return { enabled: false as const }
  const url = new URL(dsn ?? '')
  if (url.protocol !== 'https:' || !url.username || url.password || !/^\/\d+$/.test(url.pathname) || url.search || url.hash) throw new Error('Enabled crash reporting requires a valid public HTTPS Sentry DSN.')
  return { enabled: true as const, dsn }
}
type Data = Record<string, unknown>
const record = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
const safeName = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_$.[\]<>:/@+ -]{1,160}$/.test(value) && !/@|Bearer|password|secret|token/i.test(value) ? value : undefined
/** Keep symbolication coordinates; drop local source, variables, URLs, payloads and free text. */
function frames(value: unknown) {
  return (Array.isArray(value) ? value : []).slice(-100).map(raw => {
    const frame = record(raw), result: Data = {}
    for (const key of ['lineno', 'colno']) if (typeof frame[key] === 'number' && Number.isFinite(frame[key])) result[key] = frame[key]
    if (typeof frame.in_app === 'boolean') result.in_app = frame.in_app
    if (safeName(frame.function)) result.function = frame.function
    if (typeof frame.filename === 'string') {
      const filename = frame.filename.split(/[?#]/)[0].split('/').pop()
      if (filename && /^[\w.-]{1,120}$/.test(filename)) result.filename = `app:///${filename}`
    }
    for (const key of ['instruction_addr', 'image_addr', 'addr_mode']) if (typeof frame[key] === 'string' && /^(?:0x[0-9a-f]+|rel:\d+|abs)$/i.test(frame[key])) result[key] = frame[key]
    return result
  })
}
export function privateCrashEvent<T>(event: T): T | null {
  const raw = record(event)
  // Performance, replay, logs, attachments and arbitrary custom events have no place in this channel.
  if (raw.type && raw.type !== 'error') return null
  const result: Data = { user: { ip_address: '0.0.0.0' }, message: 'ScoreLogic mobile error', breadcrumbs: [] }
  for (const key of ['event_id', 'timestamp', 'platform', 'release', 'dist', 'environment', 'level']) {
    const value = raw[key]
    if (typeof value === 'number' || typeof value === 'string' && /^[a-zA-Z0-9_.@+:-]{1,160}$/.test(value)) result[key] = value
  }
  const values = record(raw.exception).values
  if (Array.isArray(values)) result.exception = { values: values.slice(0, 5).map(rawValue => {
    const value = record(rawValue), mechanism = record(value.mechanism)
    return { type: safeName(value.type) ?? 'Error', value: '[private error detail removed]', stacktrace: { frames: frames(record(value.stacktrace).frames) }, mechanism: { type: safeName(mechanism.type) ?? 'generic', ...(typeof mechanism.handled === 'boolean' ? { handled: mechanism.handled } : {}) } }
  }) }
  // Debug IDs match uploaded Metro maps; never copy the full original debug metadata object.
  const images = record(raw.debug_meta).images
  if (Array.isArray(images)) result.debug_meta = { images: images.slice(0, 20).flatMap(image => {
    const value = record(image)
    return typeof value.debug_id === 'string' && /^[0-9a-f-]{32,36}$/i.test(value.debug_id) && typeof value.code_file === 'string' && /^[\w.-]{1,120}$/.test(value.code_file.split(/[?#]/)[0].split('/').pop() ?? '') ? [{ type: 'sourcemap', debug_id: value.debug_id, code_file: `app:///${value.code_file.split(/[?#]/)[0].split('/').pop()}` }] : []
  }) }
  return result as T
}
