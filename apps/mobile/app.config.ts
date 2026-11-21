import type { ExpoConfig } from 'expo/config'

import { buildSettings } from './build-config.cjs'

const { release, preview, identifier, linkHost, scheme, buildNumber, crash } = buildSettings(process.env)

const plugins: NonNullable<ExpoConfig['plugins']> = [['expo-secure-store', { configureAndroidBackup: true, faceIDPermission: false }], ['expo-sqlite', { enableFTS: false }], 'expo-dev-client', 'expo-font']
if (crash) plugins.push(['@sentry/react-native/expo', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT, useNativeInit: false }])

const config: ExpoConfig = {
  name: release ? 'ScoreLogic' : preview ? 'ScoreLogic Test' : 'ScoreLogic Dev',
  slug: 'scorelogic-mobile',
  version: '0.1.0',
  scheme,
  orientation: 'default',
  userInterfaceStyle: 'light',
  platforms: process.env.MOBILE_DESIGN_STUDIO === 'true' ? ['ios', 'android', 'web'] : ['ios', 'android'],
  web: { bundler: 'metro', name: 'ScoreLogic Design Studio' },
  ios: {
    bundleIdentifier: identifier,
    supportsTablet: true,
    ...(buildNumber ? { buildNumber } : {}),
    ...(linkHost ? { associatedDomains: [`applinks:${linkHost}`] } : {}),
    infoPlist: { ITSAppUsesNonExemptEncryption: false }
  },
  android: {
    package: identifier,
    allowBackup: false,
    ...(buildNumber ? { versionCode: Number(buildNumber) } : {}),
    blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT', ...(release || preview ? ['android.permission.SYSTEM_ALERT_WINDOW'] : [])],
    softwareKeyboardLayoutMode: 'resize',
    ...(linkHost ? { intentFilters: [{ action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'], data: [{ scheme: 'https', host: linkHost, pathPrefix: '/puzzles/' }] }] } : {})
  },
  plugins,
  extra: { scheme, ...(process.env.EXPO_PROJECT_ID ? { eas: { projectId: process.env.EXPO_PROJECT_ID } } : {}) }
}
export default config
