/** Only same-origin paths. Decode the path, keeping query values intact. */
export function safeReturnTo(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length > 2_000 ||
    !input.startsWith('/') ||
    input.startsWith('//')
  )
    return '/'
  const unsafe = (value: string) =>
    value.includes('\\') ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  if (unsafe(input)) return '/'
  try {
    const url = new URL(input, 'https://kurio.invalid')
    if (url.origin !== 'https://kurio.invalid') return '/'
    let path = url.pathname
    for (let index = 0; index < 3; index += 1) {
      path = decodeURIComponent(path)
      if (unsafe(path) || path.startsWith('//')) return '/'
      if (!/%[0-9a-f]{2}/i.test(path)) break
    }
    if (/^\/(?:login|register)(?:\/|$)/.test(path)) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

export function isPrivatePath(path: string) {
  return /^\/(?:profile|wallets|favorites|checkout|orders)(?:\/|$)/.test(path)
}
