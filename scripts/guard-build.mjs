import {
  findLocalWebPid,
  readManagedNextPid
} from './local-dev-common.mjs'

const managedPid = readManagedNextPid()
const listeningPid = findLocalWebPid()
const devPid = managedPid ?? listeningPid

if (devPid) {
  console.warn(
    [
      `Next.js dev server is running with PID ${devPid}.`,
      'Continuing because local dev now uses .next-dev and production builds use .next.',
      'If you see stale development output after changing next.config.ts, restart only the web server.'
    ].join('\n')
  )
}
