import { getServerEnvironment } from '@/lib/env/server'

export function getAuthSecret() {
  return getServerEnvironment().authSecret
}
