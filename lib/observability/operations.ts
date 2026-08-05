import { z } from 'zod'

const panelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  signal: z.string().min(1),
  target: z.string().min(1)
})

const dashboardSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  owner: z.string().min(1),
  panels: z.array(panelSchema).min(1)
})

const alertSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  severity: z.enum(['critical', 'warning']),
  panelId: z.string().min(1),
  condition: z.string().min(1),
  window: z.string().min(1),
  owner: z.string().min(1),
  runbook: z.string().startsWith('docs/operations/')
})

const alertsSchema = z.object({
  version: z.literal(1),
  alerts: z.array(alertSchema).min(1)
})

export function validateObservabilityOperations(
  dashboardInput: unknown,
  alertsInput: unknown
) {
  const dashboard = dashboardSchema.parse(dashboardInput)
  const alerts = alertsSchema.parse(alertsInput)
  const panelIds = new Set<string>()
  const alertIds = new Set<string>()
  const issues: string[] = []

  for (const panel of dashboard.panels) {
    if (panelIds.has(panel.id)) issues.push(`Duplicate dashboard panel id: ${panel.id}`)
    panelIds.add(panel.id)
  }

  for (const alert of alerts.alerts) {
    if (alertIds.has(alert.id)) issues.push(`Duplicate alert id: ${alert.id}`)
    alertIds.add(alert.id)
    if (!panelIds.has(alert.panelId)) {
      issues.push(`Alert ${alert.id} references unknown panel ${alert.panelId}`)
    }
  }

  if (issues.length > 0) throw new Error(issues.join('\n'))
  return { dashboard, alerts }
}
