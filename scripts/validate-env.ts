import { loadEnvConfig } from '@next/env'

import { associationConfig } from '../lib/mobile/associations'
import { validateServerEnvironment } from '../lib/env/server'

loadEnvConfig(process.cwd())
validateServerEnvironment(process.env, 'production')
associationConfig(process.env)

console.log('Production environment validation passed.')
