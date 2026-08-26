// Deterministic per-author colors for shared notes, so on a shared list it's
// easy to tell at a glance who left the current note. Used by DetailModal.

// Ordered by binary subdivision of the color wheel — 1st hue, then its
// exact opposite at +180°, then the two hues that bisect those halves (each
// again paired with its own opposite), and so on — so the most common case,
// two people, always lands on true complements (the strongest contrast the
// wheel has), and every extra person keeps splitting the widest remaining
// gap instead of crowding in next to a color already in use.
const HUE_STEPS = [0, 180, 90, 270, 45, 225, 135, 315]
// Colors already used elsewhere in the UI (gold accents, crimson danger) —
// a list's rotation gets nudged away from these so an author's color never
// lands on top of one.
const ACCENT_HUES = [40, 7]
const ACCENT_GAP = 25

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function hashString(s) {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// Every list gets its own rotation of the same wheel — hashed from the
// list's own id, so colors look different from one shared list to the next
// (not every list is the same green-vs-violet pair) while staying identical
// for everyone looking at that list, and stable across reloads. The
// complementary-pairs structure above survives any rotation, since rotating
// the whole wheel doesn't change the angles between hues on it.
export function paletteRotationFor(listKey) {
  let rotation = listKey ? hashString(String(listKey)) % 360 : 0
  for (let tries = 0; tries < 360; tries += 7) {
    const clash = HUE_STEPS.some((step) =>
      ACCENT_HUES.some((accent) => hueDistance((step + rotation) % 360, accent) < ACCENT_GAP)
    )
    if (!clash) return rotation
    rotation = (rotation + 7) % 360
  }
  return rotation
}

// Blues/violets read darker than yellows/greens at the same lightness —
// nudged per-hue so every color on the wheel reads similarly bright against
// the app's dark background, instead of some looking washed out and others
// dim, no matter where a list's rotation lands them.
function lightnessForHue(hue) {
  if (hue > 40 && hue < 100) return 52
  if (hue >= 200 && hue < 280) return 68
  return 60
}

function colorAt(index, rotation) {
  const hue = (HUE_STEPS[index % HUE_STEPS.length] + rotation) % 360
  return `hsl(${hue}, 65%, ${lightnessForHue(hue)}%)`
}

// Picks by position in the list's member roster when available, so every
// *current* member gets a distinct, well-spaced color — falls back to
// hashing the name into the same wheel (still distinct-looking, just not
// guaranteed unique) for a name that isn't a current member, e.g. someone
// who has since left, or no roster is available.
export function authorColor(name, memberNames, rotation) {
  if (!name) return null
  if (Array.isArray(memberNames)) {
    const idx = memberNames.indexOf(name)
    if (idx !== -1) return colorAt(idx, rotation)
  }
  return colorAt(hashString(name), rotation)
}
