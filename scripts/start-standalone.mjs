process.env.HOSTNAME ??= '0.0.0.0'
process.env.PORT ??= '3007'

await import('../.next/standalone/server.js')
