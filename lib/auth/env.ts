function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }

  return null
}

export function getAuthSecret() {
  return readEnv('AUTH_SECRET', 'NEXTAUTH_SECRET') ?? 'scorelogic-dev-secret'
}

export function getGoogleAuthEnv() {
  return {
    clientId: readEnv('AUTH_GOOGLE_ID', 'GOOGLE_CLIENT_ID'),
    clientSecret: readEnv('AUTH_GOOGLE_SECRET', 'GOOGLE_CLIENT_SECRET')
  }
}

export function getResendAuthEnv() {
  return {
    apiKey: readEnv('AUTH_RESEND_KEY', 'RESEND_API_KEY'),
    from: readEnv('AUTH_RESEND_FROM', 'RESEND_FROM_EMAIL') ?? 'ScoreLogic <noreply@scorelogic.app>'
  }
}
