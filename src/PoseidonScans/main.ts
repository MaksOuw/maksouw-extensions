import type {
  Chapter,
  ChapterDetails,
  ChapterProviding,
  CloudflareBypassRequestProviding,
  DiscoverSection,
  DiscoverSectionItem,
  DiscoverSectionProviding,
  MangaProviding,
  Metadata,
  PagedResults,
  Request,
  SearchQuery,
  SearchResultItem,
  SearchResultsProviding,
  SortingOption,
  SourceManga,
} from '@paperback/types'
import type { Element } from 'domhandler'
import {
  CloudflareError,
  ContentRating,
  DiscoverSectionType,
  PaperbackInterceptor,
  type Response,
  URL
} from '@paperback/types'
import * as cheerio from 'cheerio'
import { decode as decodeHTMLEntity } from 'html-entities'

const DOMAIN = 'https://poseidon-scans.net'

class PoseidonScansInterceptor extends PaperbackInterceptor {
  async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...(request.headers ?? {}),
      'user-agent': await Application.getDefaultUserAgent(),
      referer: `${DOMAIN}/`,
    }
    return request
  }

  async interceptResponse(
    _request: Request,
    response: Response,
    data: ArrayBuffer,
): Promise<ArrayBuffer> {
    return data
  }
}

class PoseidonScansExtension
  implements
    MangaProviding,
    ChapterProviding,
    SearchResultsProviding,
    DiscoverSectionProviding,
    CloudflareBypassRequestProviding
{
  private interceptor = new PoseidonScansInterceptor('PoseidonScansInterceptor')

  async initialise(): Promise<void> {
    this.interceptor.registerInterceptor()
  }

  private async fetchHtml(url: string): Promise<cheerio.CheerioAPI> {
    const request: Request = { url, method: 'GET' }
    const [response, data] = await Application.scheduleRequest(request)

    if (response.status === 403 || response.status === 503) {
      throw new CloudflareError({
        url: `${DOMAIN}/`,
        method: 'GET',
      })
    }

    const html = Application.arrayBufferToUTF8String(data)
    return cheerio.load(html)
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await this.fetchHtml(`${DOMAIN}/serie/${mangaId}/`)

    return {
      mangaId,
      mangaInfo: {
        thumbnailUrl: this.getImageSrc($('img.object-cover')).replace('.webp', '.png') ?? '',
        synopsis: decodeHTMLEntity($('p.text-gray-300').text().trim()),
        primaryTitle: decodeHTMLEntity($('h1.text-4xl').text().trim()),
        secondaryTitles: [],
        contentRating: ContentRating.EVERYONE,
        status: $('body > main > div > main > div.bg-black > div > div.container > div > div > div > div > div > div:nth-child(1) > span.px-3.py-1.rounded-full.text-xs').text().trim(),
        artist: $('body > main > div > main > div.bg-black > div > div.container > div > div > div > div > div > div:nth-child(4) > span.text-white').text().trim(),
        author: $('body > main > div > main > div.bg-black > div > div.container > div > div > div > div > div > div:nth-child(3) > span.text-white').text().trim(),
      },
    }
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const $ = await this.fetchHtml(`${DOMAIN}/serie/${sourceManga.mangaId}/`)

    const pushRegex = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\[\s\S])*)"\]\)/g
    let rscText = ''
    let pushMatch
    while ((pushMatch = pushRegex.exec($.html())) !== null) {
        try {
            // JSON.parse('"..."') désechappe la string JS correctement
            rscText += JSON.parse('"' + pushMatch[1] + '"')
        } catch(e) {
            // ignorer les blocs non parsables
        }
    }

    // Chercher "chapters": dans le RSC déseschappé
    const chaptersKey = '"chapters":'
    const startIdx = rscText.indexOf(chaptersKey)
    if (startIdx === -1) {
        throw new Error(`Couldn't find chapters for mangaId: ${sourceManga.mangaId}!`)
    }

    const arrayStart = startIdx + chaptersKey.length
    const endIdx = rscText.indexOf(',"_count":', arrayStart)
    if (endIdx === -1) {
        throw new Error(`Couldn't find end of chapters for mangaId: ${sourceManga.mangaId}!`)
    }

    let chapterData: any[]
    try {
        chapterData = JSON.parse(rscText.substring(arrayStart, endIdx))
    } catch (e) {
        throw new Error(`Failed to parse chapters JSON: ${e}`)
    }

    let sortingIndex = chapterData.length

    return chapterData.map((el): Chapter => {
      sortingIndex--
      const chapterNumber = el.number
      const chapterId = String(chapterNumber)

      let title = `Chapitre ${chapterNumber}`
      if (el.title) {
          title = el.title
      }

      if (el.isPremium && el.premiumUntil) {
          const freeAt = new Date(el.premiumUntil.replace('$D', ''))
          title += ` - Gratuit le ${freeAt.toLocaleDateString('fr-FR')} à ${freeAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      }

      const date = el.createdAt
          ? new Date(el.createdAt.replace('$D', ''))
          : new Date()

      return {
        chapterId,
        sourceManga,
        langCode: 'fr',
        chapNum: chapterNumber,
        volume: 0,
        title: title,
        creationDate: date,
        sortingIndex: sortingIndex,
      }
    })
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const $ = await this.fetchHtml(
      `${DOMAIN}/serie/${chapter.sourceManga.mangaId}/chapter/${chapter.chapterId}`
    )

    const pages: string[] = []
    let pagesWithId: any[] = []

    for (const img of $('div.chapter-image-container').parent().toArray()) {
      pagesWithId.push({ id: $(img).attr('data-order'), img: this.getImageSrc($('img', img)) })
    }

    pagesWithId.sort((a, b) => {
      return parseInt(a.id) - parseInt(b.id)
    })

    for (const page of pagesWithId) {
      pages.push(page.img)
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    }
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined
  ): Promise<PagedResults<SearchResultItem>> {
    const url = new URL(`${DOMAIN}/series`)
    url.setQueryItem('search', query.title ?? '')
    url.setQueryItem('sortBy', 'recent')
    url.setQueryItem('viewMode', 'list')

    const $ = await this.fetchHtml(url.toString())

    const items: SearchResultItem[] = $('a.block.group')
      .map((_, el): SearchResultItem => {
        const manga = $(el)
        const title = decodeHTMLEntity(manga.find('h2').text().trim())
          .replace(/\s+/g, ' ')
          .replace(/\n/g, ' ')
        const mangaId = title
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
        const imageUrl = this.getImageSrc(manga.find('img')) ?? ''

        console.log('mangaId : ', mangaId)
        console.log('title : ', title)
        console.log('imageUrl : ', imageUrl)

        return {
          mangaId,
          title,
          imageUrl,
        }
      })
      .get()

    return {
      items,
      metadata: undefined,
    }
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return []
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: 'highlighted_projects',
        title: 'Projets mis en avant',
        type: DiscoverSectionType.featured,
      },
      {
        id: 'popular_today',
        title: 'Populaire aujourd\'hui',
        type: DiscoverSectionType.prominentCarousel
      },
      {
        id: 'latest_updates',
        title: 'Dernières sorties',
        type: DiscoverSectionType.prominentCarousel
      },
    ]
  }

  async getDiscoverSectionItems(
    section: DiscoverSection
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const $ = await this.fetchHtml(`${DOMAIN}/`)

    let selector: string | undefined = undefined
    let selector2: string | undefined = undefined
    let type: DiscoverSectionItem['type'] = 'simpleCarouselItem'

    if (section.id === 'highlighted_projects') {
      selector = 'div:nth-child(2) > div > div.rounded-lg'
      selector2 = 'body > main > div > main > div > section:nth-child(3)'
      type = 'featuredCarouselItem'
    } else if (section.id === 'popular_today') {
      selector = 'a.block'
      selector2 = 'body > main > div > main > div > section:nth-child(4)'
      type = 'prominentCarouselItem'
    } else if (section.id === 'latest_updates') {
      selector = 'div.w-full > div.relative'
      selector2 = 'body > main > div > main > div > section:nth-child(5) > div > div:nth-child(2)'
      type = 'prominentCarouselItem'
    }

    const items: DiscoverSectionItem[] = $(selector, $(selector2))
      .map((_, el): DiscoverSectionItem => {
        let slug: string = this.idCleaner($('a', el).attr('href') ?? '')
        if (slug === '') {
            slug = this.idCleaner($(el).attr('href') ?? '')
        }
        const mangaId: string = slug
        const imageUrl = this.getImageSrc($('img', el))
        const title = $('h3', el).text().trim()

        return { type, mangaId, imageUrl, title }
      })
      .get()

    return { items }
  }

  async cloudflareBypassCompleted(): Promise<void> {
    // Called once the user has completed the Cloudflare challenge in-app.
    // Nothing to persist here for this example.
  }

  getImageSrc(imageObj: cheerio.Cheerio<Element> | undefined): string {
    let image: string | null | undefined
    if ((typeof imageObj?.attr('src')) != 'undefined') {
      image = imageObj?.attr('src')
    }
    else if ((typeof imageObj?.attr('data-cfsrc')) != 'undefined') {
      image = imageObj?.attr('data-cfsrc')
    }
    else {
      image = ''
    }

    if (image?.includes('/_next/')) {
      image = this.extractBaseImageUrl(image)
    }

    return encodeURI(decodeURI(decodeHTMLEntity(image?.trim())))
  }

  extractBaseImageUrl(optimizedUrl: string): string | null {
    try {
      const match = optimizedUrl.match(/url=([^&]*)/);
        if (!match || !match[1]) {
          console.log("Missing 'url' param.");
          return null;
        }

        const encodedPath = match[1];
        let decodedPath = decodeURIComponent(encodedPath);
        decodedPath = decodedPath.replace(/\.(webp|gif)$/i, '');

        if (! decodedPath.includes(`${DOMAIN}`)) {
          decodedPath = `${DOMAIN}` + decodedPath
        }

        return decodedPath;
    } catch (e) {
      console.log("Erreur lors de l'analyse de l'URL:", e);
      return null;
    }
  }

  protected idCleaner(str: string): string {
    let cleanId: string = str
    cleanId = cleanId.replace(/\/$/, '')
    cleanId = cleanId.split('/').pop() ?? ''

    return cleanId
  }
}

export const PoseidonScans = new PoseidonScansExtension()
