/** Derive a simulated ENS alias without changing the collector's username. */
export function registrationEns(username: string, userId: string): string {
  const normalized = username
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/^-+|-+$/g, '')
  const stableId =
    userId
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 12)
      .toLowerCase() || 'demo'
  return `${normalized || `collector-${stableId}`}.eth`
}
