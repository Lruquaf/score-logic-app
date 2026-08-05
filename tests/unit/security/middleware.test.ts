import { NextRequest } from 'next/server'

import { proxy } from '@/proxy'

describe('request correlation proxy', () => {
  it('replaces caller-controlled request ids with a generated correlation id', () => {
    const response = proxy(
      new NextRequest('http://localhost/daily', {
        headers: { 'x-request-id': 'caller-controlled' }
      })
    )
    const requestId = response.headers.get('x-request-id')

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(requestId).not.toBe('caller-controlled')
    expect(response.headers.get('x-middleware-request-x-request-id')).toBe(requestId)
  })
})
