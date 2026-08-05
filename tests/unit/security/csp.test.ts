import {
  buildContentSecurityPolicy,
  createCspNonce
} from '@/lib/security/csp'

describe('content security policy', () => {
  it('builds a nonce-based production script policy without unsafe script sources', () => {
    const policy = buildContentSecurityPolicy('nonce-value', false)

    expect(policy).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'")
    expect(policy).toContain("script-src-attr 'none'")
    expect(policy).not.toContain("'unsafe-eval'")
    expect(policy.match(/unsafe-inline/g)).toHaveLength(1)
  })

  it('allows the development evaluator while keeping a per-request nonce', () => {
    const first = createCspNonce()
    const second = createCspNonce()
    const policy = buildContentSecurityPolicy(first, true)

    expect(first).toHaveLength(32)
    expect(second).not.toBe(first)
    expect(policy).toContain(`'nonce-${first}'`)
    expect(policy).toContain("'unsafe-eval'")
  })
})
