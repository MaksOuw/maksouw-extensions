import type { ExtensionInfo } from '@paperback/types'
import { ContentRating, SourceIntents } from '@paperback/types'

export default {
  version: '2.0.1',
  name: 'PoseidonScans',
  icon: 'icon.png',
  description: 'Extension that pulls webtoons from Poseidon-Scans',
  contentRating: ContentRating.MATURE,
  language: 'fr',
  developers: [{ name: 'MaksOuw', github: 'MaksOuw' }],
  badges: [],
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
} satisfies ExtensionInfo
