import type { FormEvent } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { catalogOptions } from './queries'
import { NftCard } from './nft-card'
import { validateCatalogSearch } from './search'

const control =
  'mt-2 min-h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm'

export function CatalogSection() {
  const search = useSearch({ from: '/' })
  const navigate = useNavigate({ from: '/' })
  const catalog = useQuery(catalogOptions(search))
  const page = search.page || 1

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void navigate({
      search: validateCatalogSearch(Object.fromEntries(form)),
      resetScroll: false,
    })
  }

  function clearFilters() {
    void navigate({ search: {}, resetScroll: false })
  }

  return (
    <section id="catalogo" className="scroll-mt-6">
      <div className="mb-8 border-b border-border pb-4">
        <p className="text-xs tracking-wider text-primary uppercase">
          O próximo item da sua coleção
        </p>
        <h2 className="mt-2 text-2xl font-bold">Todos os NFTs</h2>
      </div>
      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <form
          key={JSON.stringify(search)}
          aria-label="Filtros do catálogo"
          onSubmit={applyFilters}
          className="grid h-fit gap-5 rounded-lg bg-card p-5 sm:grid-cols-2 lg:grid-cols-1"
        >
          <label className="block text-sm font-semibold">
            Buscar NFTs
            <div className="relative">
              <input
                name="q"
                type="search"
                defaultValue={search.q || ''}
                placeholder="Nome ou criador"
                maxLength={200}
                className={`${control} pr-9`}
              />
              <Search
                className="pointer-events-none absolute top-5 right-3 size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </label>
          <label className="block text-sm font-semibold">
            Categoria
            <select
              name="category"
              defaultValue={search.category || ''}
              className={control}
            >
              <option value="">Todas</option>
              <option value="art">Arte digital</option>
              <option value="photography">Fotografia</option>
              <option value="music">Música</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Coleção
            <input
              name="collection"
              defaultValue={search.collection || ''}
              placeholder="Todas as coleções"
              maxLength={100}
              className={control}
            />
          </label>
          <label className="block text-sm font-semibold">
            Ordenar por
            <select
              name="sort"
              defaultValue={search.sort || 'featured'}
              className={control}
            >
              <option value="featured">Destaques</option>
              <option value="price-asc">Menor preço</option>
              <option value="price-desc">Maior preço</option>
              <option value="name">Nome</option>
            </select>
          </label>
          <Button type="submit">Aplicar filtros</Button>
          <Button type="button" variant="ghost" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </form>
        <div className="min-w-0" aria-busy={catalog.isFetching}>
          {catalog.isPending ? (
            <div role="status" aria-label="Carregando NFTs">
              <span className="sr-only">Carregando NFTs</span>
              <div className="grid grid-cols-2 gap-5 md:grid-cols-3">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index}>
                    <Skeleton className="aspect-square rounded-2xl" />
                    <Skeleton className="mt-4 h-4 w-4/5" />
                    <Skeleton className="mt-2 h-4 w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          ) : catalog.isError && !catalog.data ? (
            <div role="alert" className="rounded-xl border border-border p-8">
              <h2 className="text-lg font-bold">
                Não foi possível carregar os NFTs
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Verifique sua conexão e tente novamente.
              </p>
              <Button className="mt-6" onClick={() => void catalog.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : catalog.data ? (
            <>
              <div
                className="mb-5 flex min-h-5 flex-wrap justify-between gap-2 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <p>{catalog.data.total} NFTs encontrados</p>
                {catalog.isFetching && <p>Atualizando catálogo…</p>}
              </div>
              {catalog.isError && (
                <p role="alert" className="mb-4 text-sm">
                  Não foi possível atualizar os resultados.{' '}
                  <button
                    className="underline"
                    onClick={() => void catalog.refetch()}
                  >
                    Tentar novamente
                  </button>
                </p>
              )}
              {catalog.data.items.length ? (
                <ul
                  aria-label="NFTs disponíveis"
                  className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 md:gap-x-6"
                >
                  {catalog.data.items.map((nft) => (
                    <NftCard key={nft.id} nft={nft} />
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-border p-8">
                  <h2 className="text-lg font-bold">Nenhum NFT encontrado</h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Tente outra busca ou ajuste os filtros.
                  </p>
                  <Button
                    className="mt-6"
                    variant="outline"
                    onClick={clearFilters}
                  >
                    Limpar filtros
                  </Button>
                </div>
              )}
              <nav
                aria-label="Paginação do catálogo"
                className="mt-10 flex flex-wrap items-center justify-center gap-3"
              >
                <Button
                  variant="outline"
                  aria-label="Página anterior"
                  disabled={page <= 1 || catalog.isFetching}
                  onClick={() =>
                    void navigate({
                      search: { ...search, page: page - 1 },
                      resetScroll: false,
                    })
                  }
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <p className="text-xs">
                  Página {catalog.data.page} de{' '}
                  {Math.max(
                    1,
                    Math.ceil(catalog.data.total / catalog.data.pageSize),
                  )}
                </p>
                <Button
                  variant="outline"
                  aria-label="Próxima página"
                  disabled={
                    page * catalog.data.pageSize >= catalog.data.total ||
                    catalog.isFetching
                  }
                  onClick={() =>
                    void navigate({
                      search: { ...search, page: page + 1 },
                      resetScroll: false,
                    })
                  }
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </nav>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}
