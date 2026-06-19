import type { TeamDTO } from '@/lib/contracts/puzzle'

export type TeamPoolKey = 'world-cup' | 'champions-league' | 'fictional'

function team(pool: TeamPoolKey, code: string, nameEn: string, continent?: string): TeamDTO {
  return {
    id: `ckscore${pool.replace('-', '')}${code.toLowerCase()}team000001`,
    code,
    nameEn,
    continent
  }
}

export const TEAM_POOLS: Record<TeamPoolKey, TeamDTO[]> = {
  'world-cup': [
    team('world-cup', 'ARG', 'Argentina', 'SOUTH_AMERICA'),
    team('world-cup', 'BRA', 'Brazil', 'SOUTH_AMERICA'),
    team('world-cup', 'FRA', 'France', 'EUROPE'),
    team('world-cup', 'GER', 'Germany', 'EUROPE'),
    team('world-cup', 'ESP', 'Spain', 'EUROPE'),
    team('world-cup', 'ENG', 'England', 'EUROPE'),
    team('world-cup', 'ITA', 'Italy', 'EUROPE'),
    team('world-cup', 'NED', 'Netherlands', 'EUROPE'),
    team('world-cup', 'POR', 'Portugal', 'EUROPE'),
    team('world-cup', 'BEL', 'Belgium', 'EUROPE'),
    team('world-cup', 'CRO', 'Croatia', 'EUROPE'),
    team('world-cup', 'DEN', 'Denmark', 'EUROPE'),
    team('world-cup', 'SUI', 'Switzerland', 'EUROPE'),
    team('world-cup', 'SWE', 'Sweden', 'EUROPE'),
    team('world-cup', 'URU', 'Uruguay', 'SOUTH_AMERICA'),
    team('world-cup', 'COL', 'Colombia', 'SOUTH_AMERICA'),
    team('world-cup', 'CHI', 'Chile', 'SOUTH_AMERICA'),
    team('world-cup', 'USA', 'United States', 'NORTH_AMERICA'),
    team('world-cup', 'MEX', 'Mexico', 'NORTH_AMERICA'),
    team('world-cup', 'CAN', 'Canada', 'NORTH_AMERICA'),
    team('world-cup', 'JPN', 'Japan', 'ASIA'),
    team('world-cup', 'KOR', 'South Korea', 'ASIA'),
    team('world-cup', 'IRN', 'Iran', 'ASIA'),
    team('world-cup', 'AUS', 'Australia', 'OCEANIA'),
    team('world-cup', 'MAR', 'Morocco', 'AFRICA'),
    team('world-cup', 'SEN', 'Senegal', 'AFRICA'),
    team('world-cup', 'GHA', 'Ghana', 'AFRICA'),
    team('world-cup', 'NGA', 'Nigeria', 'AFRICA'),
    team('world-cup', 'CMR', 'Cameroon', 'AFRICA'),
    team('world-cup', 'EGY', 'Egypt', 'AFRICA'),
    team('world-cup', 'TUN', 'Tunisia', 'AFRICA'),
    team('world-cup', 'CRC', 'Costa Rica', 'NORTH_AMERICA')
  ],
  'champions-league': [
    team('champions-league', 'RMA', 'Real Madrid', 'EUROPE'),
    team('champions-league', 'FCB', 'Barcelona', 'EUROPE'),
    team('champions-league', 'ATM', 'Atletico Madrid', 'EUROPE'),
    team('champions-league', 'MCI', 'Manchester City', 'EUROPE'),
    team('champions-league', 'MUN', 'Manchester United', 'EUROPE'),
    team('champions-league', 'LIV', 'Liverpool', 'EUROPE'),
    team('champions-league', 'ARS', 'Arsenal', 'EUROPE'),
    team('champions-league', 'CHE', 'Chelsea', 'EUROPE'),
    team('champions-league', 'TOT', 'Tottenham', 'EUROPE'),
    team('champions-league', 'PSG', 'Paris Saint-Germain', 'EUROPE'),
    team('champions-league', 'BAY', 'Bayern Munich', 'EUROPE'),
    team('champions-league', 'BVB', 'Borussia Dortmund', 'EUROPE'),
    team('champions-league', 'RBL', 'RB Leipzig', 'EUROPE'),
    team('champions-league', 'JUV', 'Juventus', 'EUROPE'),
    team('champions-league', 'INT', 'Inter Milan', 'EUROPE'),
    team('champions-league', 'MIL', 'AC Milan', 'EUROPE'),
    team('champions-league', 'NAP', 'Napoli', 'EUROPE'),
    team('champions-league', 'ROM', 'Roma', 'EUROPE'),
    team('champions-league', 'BEN', 'Benfica', 'EUROPE'),
    team('champions-league', 'POR', 'Porto', 'EUROPE'),
    team('champions-league', 'SCP', 'Sporting CP', 'EUROPE'),
    team('champions-league', 'AJA', 'Ajax', 'EUROPE'),
    team('champions-league', 'PSV', 'PSV Eindhoven', 'EUROPE'),
    team('champions-league', 'FEY', 'Feyenoord', 'EUROPE'),
    team('champions-league', 'CEL', 'Celtic', 'EUROPE'),
    team('champions-league', 'RAN', 'Rangers', 'EUROPE'),
    team('champions-league', 'GAL', 'Galatasaray', 'EUROPE'),
    team('champions-league', 'FEN', 'Fenerbahce', 'EUROPE'),
    team('champions-league', 'BES', 'Besiktas', 'EUROPE'),
    team('champions-league', 'SHA', 'Shakhtar Donetsk', 'EUROPE'),
    team('champions-league', 'DYN', 'Dynamo Kyiv', 'EUROPE'),
    team('champions-league', 'OLM', 'Marseille', 'EUROPE')
  ],
  fictional: [
    team('fictional', 'LIO', 'Northbridge Lions'),
    team('fictional', 'EAG', 'Harbor Eagles'),
    team('fictional', 'THU', 'Valley Thunders'),
    team('fictional', 'MET', 'Orion Meteors'),
    team('fictional', 'FAL', 'Silver Falcons'),
    team('fictional', 'WOL', 'Iron Wolves'),
    team('fictional', 'TIT', 'Atlas Titans'),
    team('fictional', 'COM', 'Red Comets'),
    team('fictional', 'PHX', 'Aster Phoenix'),
    team('fictional', 'VUL', 'Vulcan City'),
    team('fictional', 'RAV', 'Ravenport'),
    team('fictional', 'STG', 'Stormgate'),
    team('fictional', 'BLA', 'Blackstone Athletic'),
    team('fictional', 'GLA', 'Glacier United'),
    team('fictional', 'SOL', 'Solstice FC'),
    team('fictional', 'NOV', 'Nova Rangers'),
    team('fictional', 'AST', 'Astral Town'),
    team('fictional', 'FRO', 'Frostvale'),
    team('fictional', 'CRN', 'Crownwell'),
    team('fictional', 'PYR', 'Pyramid City'),
    team('fictional', 'MON', 'Monarchs FC'),
    team('fictional', 'ROO', 'Rookfield'),
    team('fictional', 'FOR', 'Forge Athletic'),
    team('fictional', 'BRI', 'Brighton Vale'),
    team('fictional', 'DUS', 'Duskport'),
    team('fictional', 'MER', 'Meridian SC'),
    team('fictional', 'OAK', 'Oakmere'),
    team('fictional', 'ZEP', 'Zephyr United'),
    team('fictional', 'ARC', 'Arcadia FC'),
    team('fictional', 'BOL', 'Bolts FC'),
    team('fictional', 'KIN', 'Kingsward'),
    team('fictional', 'SUN', 'Suncrest')
  ]
}

export function createSeededRandom(seed: string) {
  let value = 2166136261

  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }

  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

export function selectTeamsFromPool(
  poolKey: TeamPoolKey,
  count = 4,
  random: () => number = Math.random
) {
  const pool = TEAM_POOLS[poolKey]
  const remaining = [...pool]
  const selected: TeamDTO[] = []

  if (count > pool.length) {
    throw new Error(`Team pool ${poolKey} has only ${pool.length} teams.`)
  }

  while (selected.length < count) {
    const index = Math.floor(random() * remaining.length)
    const [picked] = remaining.splice(index, 1)
    selected.push(picked)
  }

  return selected
}
