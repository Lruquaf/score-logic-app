const path = require('node:path')
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

const config = getSentryExpoConfig(__dirname, { annotateReactComponents: false, includeWebReplay: false, includeWebFeedback: false })
// The web app intentionally keeps a different React version. Only the public
// contract source is shared; never resolve native React from the web root.
config.watchFolders = [path.resolve(__dirname, '../../packages')]
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]
module.exports = config
