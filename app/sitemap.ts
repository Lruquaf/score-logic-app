import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://scorelogic.app'

  return [
    {
      url: `${baseUrl}/`,
      changeFrequency: 'daily',
      priority: 1
    },
    {
      url: `${baseUrl}/daily`,
      changeFrequency: 'daily',
      priority: 0.9
    },
    {
      url: `${baseUrl}/stats`,
      changeFrequency: 'weekly',
      priority: 0.6
    },
    {
      url: `${baseUrl}/login`,
      changeFrequency: 'monthly',
      priority: 0.4
    }
  ]
}
