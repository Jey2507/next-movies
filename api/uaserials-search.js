// Vercel serverless function (deploys automatically from /api — no
// framework needed for that, see CLAUDE.md's architecture changelog).
//
// Why this exists: uaserials.com sends no Access-Control-Allow-Origin
// header, so the browser can't fetch and parse its search-results page
// itself (see DetailModal.jsx's "Watch on UASerials" button) — that fetch
// would be blocked by CORS. Running the same fetch here instead (server to
// server, no CORS involved) lets us pick out the one search result whose
// original (non-Ukrainian) or Ukrainian title is an *exact* match for the
// requested title, and hand back just that item's page URL — so the button
// can jump straight to "Пуститися берега" instead of a 3-result search
// list for "Breaking Bad".
//
// Deliberately conservative: uaserials.com's own search falls back to
// unrelated "popular" results when nothing actually matches (confirmed by
// querying garbage text and still getting 2 results back) — so a fuzzy or
// substring match here would regularly send someone to the wrong title.
// Only a normalized exact match is trusted; anything else returns
// `{ url: null }` and the caller falls back to the plain search page.

function normalize(str) {
  return (str || '')
    .replace(/<[^>]+>/g, ' ') // strip <mark> highlight tags left in by the search
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // punctuation/whitespace -> single space
    .trim()
    .replace(/\s+/g, ' ')
}

// One '<a class="uas-card" ...>...</a>' search-result entry — href, release
// year, the Ukrainian display title, and the original-language title (see
// the sample markup this was written against, saved during development).
const CARD_RE =
  /<a class="uas-card" href="([^"]+)"[^>]*data-uas-type="post"[^>]*>[\s\S]*?<span class="uas-card__year">(\d*)<\/span>[\s\S]*?<span class="uas-card__title">([\s\S]*?)<\/span><span class="uas-card__orig">([\s\S]*?)<\/span>/g

export default async function handler(req, res) {
  const title = (req.query.title || '').toString().trim()
  const year = (req.query.year || '').toString().trim()

  if (!title) {
    res.status(400).json({ error: 'Missing title' })
    return
  }

  const searchUrl = `https://uaserials.com/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`
  const wanted = normalize(title)

  try {
    const response = await fetch(searchUrl, {
      headers: {
        // uaserials.com's search page has been observed to differ for
        // requests with no User-Agent at all — send a normal browser one.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      },
    })
    if (!response.ok) {
      res.status(200).json({ url: null })
      return
    }
    const html = await response.text()

    let exactMatch = null
    let exactMatchSameYear = null
    let m
    CARD_RE.lastIndex = 0
    while ((m = CARD_RE.exec(html))) {
      const [, href, cardYear, ukTitle, origTitle] = m
      const isExact = normalize(ukTitle) === wanted || normalize(origTitle) === wanted
      if (!isExact) continue
      if (!exactMatch) exactMatch = href
      // Prefers the same-year title when the query is ambiguous (e.g. a
      // movie and a same-named remake/spin-off both matching exactly).
      if (year && cardYear === year) exactMatchSameYear = href
    }

    res.status(200).json({ url: exactMatchSameYear || exactMatch || null })
  } catch {
    // Network error reaching uaserials.com, unexpected markup, etc. — the
    // caller always has the plain search URL to fall back to.
    res.status(200).json({ url: null })
  }
}
