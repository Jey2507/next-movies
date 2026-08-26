// Attributes a shared note's text to whoever actually typed each part, so
// DetailModal can render each contributor's words in their own color
// instead of recoloring the *whole* note to whoever saved last.
//
// `items.notes` stays the single source of truth (plain text, unchanged);
// `notes_segments` is a derived, auxiliary array of { author, text } runs
// that concatenate back to that same text. If it's ever missing (older
// rows saved before this existed) callers fall back to one segment
// attributed to notes_updated_by_name — see DetailModal.jsx.
//
// This is a longest-common-prefix/suffix diff against the previously
// committed segments, not a full text diff — good enough for how a shared
// note actually gets edited (mostly appending, or fixing one spot), and
// cheap enough to re-run on every keystroke for a live preview while
// someone is still typing.
//
// Shared by diffNoteSegments and rebaseText below — both need "how much of
// the start/end stayed the same" between two versions of the text.
function commonPrefixSuffix(oldText, newText) {
  const maxPrefix = Math.min(oldText.length, newText.length)
  let prefixLen = 0
  while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) prefixLen++

  const maxSuffix = maxPrefix - prefixLen
  let suffixLen = 0
  while (
    suffixLen < maxSuffix &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  return { prefixLen, suffixLen }
}

export function diffNoteSegments(oldSegments, newText, author) {
  const segments = Array.isArray(oldSegments) ? oldSegments : []
  const oldText = segments.map((s) => s.text).join('')

  if (newText === oldText) return segments

  const { prefixLen, suffixLen } = commonPrefixSuffix(oldText, newText)
  const middleText = newText.slice(prefixLen, newText.length - suffixLen)
  const suffixStart = oldText.length - suffixLen

  const result = []
  function push(segAuthor, text) {
    if (!text) return
    const last = result[result.length - 1]
    if (last && last.author === segAuthor) last.text += text
    else result.push({ author: segAuthor, text })
  }

  // Unchanged prefix: replay old segments up to prefixLen, keeping their
  // original authors (splitting the one segment the boundary falls inside).
  let pos = 0
  for (const seg of segments) {
    if (pos >= prefixLen) break
    const segEnd = pos + seg.text.length
    push(seg.author, seg.text.slice(0, Math.max(0, prefixLen - pos)))
    pos = segEnd
  }

  push(author, middleText)

  // Unchanged suffix: same idea from the tail end of the old segments.
  pos = 0
  for (const seg of segments) {
    const segStart = pos
    const segEnd = pos + seg.text.length
    if (segEnd > suffixStart) push(seg.author, seg.text.slice(Math.max(0, suffixStart - segStart)))
    pos = segEnd
  }

  return result
}

// Segments for an item as currently committed (i.e. not counting whatever
// unsaved edit is sitting in a draft textarea) — item.notes_segments when
// present, else one segment covering the whole note attributed to whoever
// the item says last saved it (covers rows saved before notes_segments
// existed).
export function committedNoteSegments(item) {
  if (Array.isArray(item?.notes_segments) && item.notes_segments.length > 0) return item.notes_segments
  if (item?.notes) return [{ author: item.notes_updated_by_name || null, text: item.notes }]
  return []
}

// Handles two people editing the same shared note at once: if a save from
// someone else lands while this client still has an unflushed local edit
// sitting in its textarea, the naive thing (App.jsx's updateNotes just
// overwriting `notes` with whatever this client has) would silently erase
// whatever the other person just wrote. Instead, re-apply *only the part
// this client actually changed* on top of the other person's newer text —
// found by diffing this client's own base (the note as it was right before
// this local edit started) against its current draft, then splicing that
// same prefix/middle/suffix split onto the freshly-arrived text.
//
// Like the rest of this file, this is a heuristic (assumes the two edits
// land in different spots), not a true three-way merge — but it means a
// concurrent edit gets folded in instead of clobbered, which is what
// matters for a shared note between a couple of people.
export function rebaseText(localBaseText, localDraftText, remoteText) {
  if (localDraftText === localBaseText) return remoteText
  if (remoteText === localBaseText) return localDraftText

  const { prefixLen, suffixLen } = commonPrefixSuffix(localBaseText, localDraftText)
  const middleText = localDraftText.slice(prefixLen, localDraftText.length - suffixLen)

  // The remote text may be shorter than localBaseText right around these
  // boundaries (e.g. the other person deleted something there) — clamp so
  // the slices below can't run past each other or off the end of the string.
  const clampedPrefixLen = Math.min(prefixLen, remoteText.length)
  const clampedSuffixLen = Math.min(suffixLen, remoteText.length - clampedPrefixLen)

  return (
    remoteText.slice(0, clampedPrefixLen) +
    middleText +
    (clampedSuffixLen > 0 ? remoteText.slice(remoteText.length - clampedSuffixLen) : '')
  )
}
