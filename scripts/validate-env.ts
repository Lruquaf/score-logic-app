import { loadEnvConfig } from '@next/env'

import { validateServerEnvironment } from '../lib/env/server'

loadEnvConfig(process.cwd())
validateServerEnvironment(process.env, 'production')

console.log('Production environment validation passed.')
