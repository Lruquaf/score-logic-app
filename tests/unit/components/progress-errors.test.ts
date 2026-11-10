import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatsExperience } from '@/components/stats/StatsExperience'
import { CampaignProgress } from '@/components/game/CampaignProgress'

vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }) }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ isPending: false, isError: true, data: undefined, refetch: vi.fn() })
}))

it('does not present a failed stats request as a zero-progress account', () => {
  const html = renderToStaticMarkup(createElement(StatsExperience))
  expect(html).toContain('We could not load your progress.')
  expect(html).not.toContain('You have solved 0 puzzles')
  expect(html).toContain('Try again')
})

it('does not present a failed campaign request as an empty or completed catalog', () => {
  const html = renderToStaticMarkup(createElement(CampaignProgress))
  expect(html).toContain('We could not load your campaign progress.')
  expect(html).not.toContain('All cleared')
})
