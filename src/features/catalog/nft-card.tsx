import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import type { Nft } from '@/contracts'
import { formatEth, parseEth } from '@/lib/eth'
import { FavoriteButton } from '@/features/favorites/favorite-button'

export function NftCard({ nft }: { nft: Nft }) {
  const available = nft.editions.filter((edition) => edition.available > 0)
  const lowest = available.reduce<string | null>(
    (price, edition) =>
      price === null || parseEth(edition.priceEth) < parseEth(price)
        ? edition.priceEth
        : price,
    null,
  )
  return (
    <li className="group relative min-w-0">
      <Link
        to="/nfts/$nftId"
        params={{ nftId: nft.id }}
        className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <div className="overflow-hidden rounded-2xl bg-card p-2 md:p-3">
          <img
            src={nft.image.src}
            alt={nft.image.alt}
            width={512}
            height={512}
            loading="lazy"
            className="aspect-square w-full rounded-xl object-cover transition-transform group-hover:scale-[1.02]"
          />
        </div>
        <p className="mt-3 truncate text-xs text-muted-foreground">
          {nft.collection}
        </p>
        <h3 className="mt-1 flex items-start justify-between gap-1 text-sm leading-snug font-semibold">
          {nft.name}
          <ArrowUpRight
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
        </h3>
        <p
          className="mt-1 break-all text-sm font-bold text-primary"
          data-testid="nft-price"
        >
          {lowest === null ? 'Esgotado' : `${formatEth(lowest)} ETH`}
        </p>
      </Link>
      <FavoriteButton nftId={nft.id} className="absolute top-4 right-4" />
    </li>
  )
}
