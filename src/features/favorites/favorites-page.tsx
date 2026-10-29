import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/use-session'
import { nftOptions } from '@/features/catalog/queries'
import { NftCard } from '@/features/catalog/nft-card'
import { favoritesOptions } from './queries'

export function FavoritesPage() {
  const { user } = useSession()
  const favorites = useQuery({ ...favoritesOptions(), enabled: Boolean(user) })
  const details = useQueries({
    queries: (user ? favorites.data?.nftIds || [] : []).map(nftOptions),
  })
  if (!user) return null
  return (
    <section>
      <h1 className="mb-8 text-3xl font-bold">Seus favoritos</h1>
      {favorites.isPending ? (
        <div role="status" aria-label="Carregando favoritos">
          <Skeleton className="h-64" />
        </div>
      ) : favorites.isError ? (
        <div role="alert">
          <p>Não foi possível carregar seus favoritos.</p>
          <Button onClick={() => void favorites.refetch()} className="mt-4">
            Tentar novamente
          </Button>
        </div>
      ) : !favorites.data.nftIds.length ? (
        <div className="rounded-lg border border-border p-8">
          <h2 className="text-xl font-bold">Você ainda não tem favoritos</h2>
          <Button asChild className="mt-6">
            <Link to="/">Explorar NFTs</Link>
          </Button>
        </div>
      ) : details.some((query) => query.isPending) ? (
        <div role="status" aria-label="Carregando favoritos">
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {details.some((query) => query.isError) && (
            <div role="alert" className="mb-5">
              <p>Uma obra não pôde ser carregada.</p>
              <Button
                variant="outline"
                onClick={() =>
                  details.forEach((query) => {
                    if (query.isError) void query.refetch()
                  })
                }
              >
                Tentar novamente
              </Button>
            </div>
          )}
          <ul
            aria-label="NFTs disponíveis"
            className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4"
          >
            {details.map((query) =>
              query.data ? (
                <NftCard key={query.data.id} nft={query.data} />
              ) : null,
            )}
          </ul>
        </>
      )}
    </section>
  )
}
