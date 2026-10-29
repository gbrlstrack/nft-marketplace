import type { Nft, NftCategory } from '../contracts'

const names = [
  'Chromatic Drift',
  'Quiet Geometry',
  'Echoes of Tomorrow',
  'Solar Bloom',
  'Blue Hour',
  'Analog Dreams',
  'Infinite Garden',
  'Still in Motion',
  'Electric Reverie',
  'Coral Architecture',
  'A Place Between',
  'Midnight Frequency',
  'Soft Collision',
  'Light Studies',
  'Warm Transmission',
  'Orbital Memory',
  'The Last Afternoon',
  'Velvet Noise',
  'Parallel Worlds',
  'After the Rain',
  'Silent Rhythm',
  'Tidal Forms',
  'Notes on Color',
  'Future Nostalgia',
] as const

const prices = [
  '0.125000000000000001',
  '0.24',
  '1.05',
  '0.32',
  '0.08',
  '0.75',
  '2.4',
  '0.16',
  '0.48',
  '1.2',
  '0.64',
  '0.92',
  '0.18',
  '0.56',
  '1.8',
  '0.28',
  '0.36',
  '0.84',
  '1.6',
  '0.12',
  '2.8',
  '0.44',
  '0.68',
  '0.96',
] as const

const categories: NftCategory[] = ['art', 'photography', 'music']
const collections = ['Chromatic', 'Still Life', 'Sound Waves'] as const
const creators = [
  { id: 'maya-silva', name: 'Maya Silva' },
  { id: 'theo-costa', name: 'Theo Costa' },
  { id: 'lia-rocha', name: 'Lia Rocha' },
  { id: 'noah-lima', name: 'Noah Lima' },
] as const
const artworks = [
  'chroma-orbit',
  'linear-tide',
  'coral-grid',
  'spectrum-stairs',
  'midnight-loop',
  'paper-sun',
] as const

/** Deterministic mock-only data. Geometric images are provisional, not Figma assets. */
export const nftFixtures: Nft[] = names.map((name, index) => {
  const id = `nft-${String(index + 1).padStart(3, '0')}`
  const soldOut = index === 6 || index === 20

  return {
    id,
    name,
    description:
      `${name} explora encontros entre cor, forma e ritmo. ` +
      'Obra e dados de demonstração; nenhuma transação blockchain é realizada.',
    collection: collections[Math.floor(index / 3) % collections.length],
    category: categories[index % categories.length],
    creator: { ...creators[index % creators.length] },
    image: {
      src: `/artworks/${artworks[index % artworks.length]}.svg`,
      alt: `Composição geométrica de demonstração para ${name}`,
    },
    gallery: [
      {
        src: `/artworks/${artworks[index % artworks.length]}.svg`,
        alt: `Composição geométrica de demonstração para ${name}`,
      },
      {
        src: `/artworks/${artworks[(index + 1) % artworks.length]}.svg`,
        alt: `Estudo geométrico complementar de demonstração para ${name}`,
      },
    ],
    editions: [
      {
        id: `${id}-standard`,
        label: 'Edição aberta',
        priceEth: prices[index],
        available: soldOut ? 0 : 4 + (index % 9),
      },
      ...(index % 4 === 0
        ? [
            {
              id: `${id}-collector`,
              label: 'Edição de colecionador',
              priceEth: prices[(index + 8) % prices.length],
              available: soldOut ? 0 : 2,
            },
          ]
        : []),
    ],
    version: 1,
  }
})
