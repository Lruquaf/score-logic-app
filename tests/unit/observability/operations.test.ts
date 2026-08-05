import dashboard from '@/ops/observability/dashboard.json'
import alerts from '@/ops/observability/alerts.json'
import { validateObservabilityOperations } from '@/lib/observability/operations'

describe('observability operations contract', () => {
  it('keeps alert references unique and connected to dashboard panels', () => {
    const result = validateObservabilityOperations(dashboard, alerts)
    expect(result.dashboard.panels).toHaveLength(8)
    expect(result.alerts.alerts).toHaveLength(7)
  })

  it('rejects alerts that reference missing panels', () => {
    expect(() =>
      validateObservabilityOperations(dashboard, {
        version: 1,
        alerts: [
          {
            ...alerts.alerts[0],
            panelId: 'missing-panel'
          }
        ]
      })
    ).toThrow(/unknown panel/)
  })
})
