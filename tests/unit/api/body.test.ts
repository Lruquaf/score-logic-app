import {
  InvalidJsonBodyError,
  readBoundedJson,
  RequestBodyTooLargeError
} from '@/lib/api/body'

describe('bounded JSON request bodies', () => {
  it('parses a body inside the byte budget', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ ok: true })
    })

    await expect(readBoundedJson(request, 100)).resolves.toEqual({ ok: true })
  })

  it('rejects declared and actual oversized bodies', async () => {
    const declared = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-length': '1000' },
      body: '{}'
    })
    const actual = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ value: 'çççç' })
    })

    await expect(readBoundedJson(declared, 10)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError
    )
    await expect(readBoundedJson(actual, 12)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError
    )
  })

  it('returns a distinct invalid JSON error', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: '{invalid'
    })

    await expect(readBoundedJson(request, 100)).rejects.toBeInstanceOf(
      InvalidJsonBodyError
    )
  })
})
