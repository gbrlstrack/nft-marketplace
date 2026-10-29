import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import type { Nft } from '@/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatEth } from '@/lib/eth'
import { nftOptions } from './queries'

export function NftPage() {
  const { nftId } = useParams({ from: '/nfts/$nftId' })
  const query = useQuery(nftOptions(nftId))
  if (query.isPending)
    return (
      <div
        role="status"
        aria-label="Carregando NFT"
        className="grid gap-8 md:grid-cols-2"
      >
        <Skeleton className="aspect-square rounded-2xl" />
        <div>
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="mt-6 h-28" />
        </div>
        <span className="sr-only">Carregando NFT</span>
      </div>
    )
  if (query.isError && !query.data) {
    const missing =
      isAxiosError(query.error) && query.error.response?.status === 404
    return (
      <div className="py-16">
        <h1 className="text-3xl font-bold">
          {missing ? 'NFT não encontrado' : 'Não foi possível carregar o NFT'}
        </h1>
        <p className="mt-4 text-muted-foreground">
          {missing
            ? 'Esta obra não está disponível no catálogo.'
            : 'Verifique a conexão e tente novamente.'}
        </p>
        {!missing && (
          <Button className="mt-6" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        )}
        <Button asChild variant="outline" className="mt-6 ml-2">
          <Link to="/">Voltar ao catálogo</Link>
        </Button>
      </div>
    )
  }
  return (
    <>
      {query.isError && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-border p-4 text-sm"
        >
          Não foi possível atualizar esta obra. Os últimos dados carregados
          continuam visíveis.
          <Button
            variant="ghost"
            className="ml-2"
            onClick={() => void query.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      <NftDetails key={query.data.id} nft={query.data} />
    </>
  )
}

function NftDetails({ nft }: { nft: Nft }) {
  const [imageIndex, setImageIndex] = useState(0)
  const [editionId, setEditionId] = useState(
    nft.editions.find((edition) => edition.available > 0)?.id ||
      nft.editions[0]?.id,
  )
  const [quantity, setQuantity] = useState(1)
  const edition = nft.editions.find((item) => item.id === editionId)
  const image = nft.gallery[imageIndex] || nft.image
  return (
    <>
      <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
        ← Voltar ao catálogo
      </Link>
      <div className="mt-8 grid items-start gap-10 md:grid-cols-2">
        <div>
          <img
            src={image.src}
            alt={image.alt}
            width={640}
            height={640}
            className="aspect-square w-full rounded-2xl bg-card object-cover"
          />
          {nft.gallery.length > 1 && (
            <div aria-label="Galeria da obra" className="mt-4 flex gap-3">
              {nft.gallery.map((asset, index) => (
                <button
                  key={`${asset.src}-${index}`}
                  aria-label={`Ver imagem ${index + 1}`}
                  aria-pressed={imageIndex === index}
                  onClick={() => setImageIndex(index)}
                  className={`size-20 overflow-hidden rounded-lg border-2 ${imageIndex === index ? 'border-primary' : 'border-transparent'}`}
                >
                  <img
                    src={asset.src}
                    alt=""
                    width={80}
                    height={80}
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm text-primary">{nft.collection}</p>
          <h1 className="mt-3 text-3xl leading-tight font-bold lg:text-4xl">
            {nft.name}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Criado por {nft.creator.name}
          </p>
          <p className="mt-8 leading-relaxed text-muted-foreground">
            {nft.description}
          </p>
          <div className="mt-8 rounded-xl border border-border bg-card p-6">
            <label className="block text-sm font-semibold">
              Edição
              <select
                className="mt-2 min-h-11 w-full rounded-md border border-border bg-background px-3"
                value={editionId}
                onChange={(event) => {
                  setEditionId(event.target.value)
                  setQuantity(1)
                }}
              >
                {nft.editions.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={item.available === 0}
                  >
                    {item.label}
                    {item.available === 0 ? ' — Esgotada' : ''}
                  </option>
                ))}
              </select>
            </label>
            {edition && (
              <>
                <p className="mt-6 break-all text-2xl font-bold text-primary">
                  {formatEth(edition.priceEth)} ETH
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {edition.available
                    ? `${edition.available} unidades disponíveis`
                    : 'Edição esgotada'}
                </p>
                <label className="mt-6 block text-sm font-semibold">
                  Quantidade
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, edition.available)}
                    step={1}
                    disabled={!edition.available}
                    value={quantity}
                    onChange={(event) => {
                      const value = event.target.valueAsNumber
                      setQuantity(
                        Number.isSafeInteger(value)
                          ? Math.min(
                              Math.max(1, value),
                              Math.max(1, edition.available),
                            )
                          : 1,
                      )
                    }}
                    className="mt-2 block min-h-11 w-24 rounded-md border border-border bg-background px-3"
                  />
                </label>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
