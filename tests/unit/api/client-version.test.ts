import { NextRequest } from 'next/server'
import { afterEach } from 'vitest'

import { compareSemver, parseClientHeader, upgradeRequired } from '@/lib/api/client-version'
import { proxy } from '@/proxy'

describe('parseClientHeader', () => {
  it('parses a well-formed header', () => {
    expect(parseClientHeader('android/0.2.0/1.3.0')).toEqual({ platform: 'android', appVersion: '0.2.0', contractsVersion: '1.3.0' })
  })
  it('returns null when absent', () => {
    expect(parseClientHeader(null)).toBeNull()
  })
  it('flags malformed values', () => {
    expect(parseClientHeader('android/0.2')).toBe('invalid')
    expect(parseClientHeader('desktop/1.0.0/1.3.0')).toBe('invalid')
  })
})

describe('compareSemver', () => {
  it('compares numerically', () => {
    expect(compareSemver('0.10.0', '0.9.9')).toBe(1)
    expect(compareSemver('0.9.9', '0.10.0')).toBe(-1)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })
})

describe('upgradeRequired', () => {
  it('applies the minimum version rules', () => {
    expect(upgradeRequired('android/0.1.0/1.2.0', undefined)).toBeNull()
    expect(upgradeRequired('android/0.1.0/1.2.0', '')).toBeNull()
    expect(upgradeRequired('android/0.1.0/1.2.0', '0.2.0')).toBe('0.2.0')
    expect(upgradeRequired('android/0.2.0/1.3.0', '0.2.0')).toBeNull()
    expect(upgradeRequired(null, '0.2.0')).toBeNull()
    expect(upgradeRequired('garbage', '0.2.0')).toBe('0.2.0')
  })
})

describe('proxy', () => {
  const original = process.env.NATIVE_MIN_APP_VERSION
  afterEach(() => {
    if (original === undefined) delete process.env.NATIVE_MIN_APP_VERSION
    else process.env.NATIVE_MIN_APP_VERSION = original
  })
  const old = { 'x-scorelogic-client': 'android/0.1.0/1.2.0' }

  it('returns 426 envelope for an old client on /api/v1', async () => {
    process.env.NATIVE_MIN_APP_VERSION = '0.2.0'
    const response = proxy(new NextRequest('http://localhost/api/v1/puzzles/daily', { headers: old }))
    expect(response.status).toBe(426)
    expect(response.headers.get('x-scorelogic-api-version')).toBe('1')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = await response.json()
    expect(body.error.code).toBe('UPGRADE_REQUIRED')
    expect(body.error.details.minAppVersion).toBe('0.2.0')
    expect(body.meta.apiVersion).toBe('1')
  })

  it('allows header-less account deletion from the website', () => {
    process.env.NATIVE_MIN_APP_VERSION = '0.2.0'
    const response = proxy(new NextRequest('http://localhost/api/v1/account/delete', { method: 'POST' }))
    expect(response.status).not.toBe(426)
  })

  it('ignores non-v1 paths', () => {
    process.env.NATIVE_MIN_APP_VERSION = '0.2.0'
    const response = proxy(new NextRequest('http://localhost/api/puzzles/daily', { headers: old }))
    expect(response.status).not.toBe(426)
  })
})
