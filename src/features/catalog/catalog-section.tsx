import type { FormEvent } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { catalogOptions } from './queries'
import { NftCard } from './nft-card'
import { validateCatalogSearch } from './search'
import { PriceRangeFilter } from './price-range-filter'
import { CatalogTabs } from './catalog-tabs'
import { CatalogPagination } from './catalog-pagination'

const control =
  'mt-2 min-h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm'

const categories = [
  { value: 'art', label: 'Arte digital' },
  { value: 'photography', label: 'Fotografia' },
  { value: 'music', label: 'Música' },
] as const
const networks = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'solana', label: 'Solana' },
] as const

export function CatalogSection() {
  const search = useSearch({ from: '/' })
  const navigate = useNavigate({ from: '/' })
  const catalog = useQuery(catalogOptions(search))
  const page = search.page || 1

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(form)
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    if (
      submitter instanceof HTMLButtonElement &&
      submitter.name === 'applyPrice'
    ) {
      values.minPrice = values.priceMinDraft
      values.maxPrice = values.priceMaxDraft
    }
    void navigate({
      search: validateCatalogSearch(values),
      resetScroll: false,
    })
  }

  function clearFilters() {
    void navigate({ search: {}, resetScroll: false })
  }

  return (
    <section id="catalogo" className="scroll-mt-6">
      <h2 className="sr-only">Catálogo de NFTs</h2>
      <div
        key={`toolbar:${JSON.stringify(search)}`}
        role="group"
        aria-label="Busca e ordenação do catálogo"
        className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
      >
        <label className="block min-w-0 text-sm font-semibold">
          Buscar NFTs
          <div className="relative">
            <input
              form="catalog-filters"
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
        <label className="block min-w-0 text-sm font-semibold">
          Coleção
          <input
            form="catalog-filters"
            name="collection"
            defaultValue={search.collection || ''}
            placeholder="Todas as coleções"
            maxLength={100}
            className={control}
          />
        </label>
        <Button type="submit" form="catalog-filters" className="self-end">
          Aplicar filtros
        </Button>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[19.375rem_minmax(0,1fr)]">
        <form
          id="catalog-filters"
          key={JSON.stringify(search)}
          aria-label="Filtros do catálogo"
          onSubmit={applyFilters}
          className="min-w-0 bg-card p-5 font-mono"
        >
          <input type="hidden" name="feed" value={search.feed || ''} />
          <fieldset aria-label="Categoria">
            <legend className="text-lg font-bold">Coleções</legend>
            <div className="mt-2">
              {categories.map((category) => (
                <label key={category.value} className="block cursor-pointer">
                  <input
                    type="radio"
                    name="category"
                    value={category.value}
                    defaultChecked={search.category === category.value}
                    onChange={(event) =>
                      event.currentTarget.form?.requestSubmit()
                    }
                    className="peer sr-only"
                  />
                  <span className="flex min-h-10 items-center justify-between gap-4 rounded-sm px-3 text-sm text-[#cdb189] hover:text-primary peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                    <span>{category.label}</span>
                    <span className="font-semibold tabular-nums">
                      ({catalog.data?.categoryCounts?.[category.value] ?? '—'})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <PriceRangeFilter search={search} />
          <fieldset aria-label="Rede" className="mt-9">
            <legend className="text-lg font-bold">Rede</legend>
            <div className="mt-2">
              {networks.map((network) => (
                <label key={network.value} className="block cursor-pointer">
                  <input
                    type="radio"
                    name="network"
                    value={network.value}
                    defaultChecked={search.network === network.value}
                    onChange={(event) =>
                      event.currentTarget.form?.requestSubmit()
                    }
                    className="peer sr-only"
                  />
                  <span className="flex min-h-10 items-center justify-between gap-4 rounded-sm px-3 text-sm text-[#cdb189] hover:text-primary peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                    <span>{network.label}</span>
                    <span className="font-semibold tabular-nums">
                      ({catalog.data?.networkCounts?.[network.value] ?? '—'})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            type="button"
            variant="ghost"
            onClick={clearFilters}
            className="mt-5 block px-3 text-sm text-[#cdb189]"
          >
            Limpar filtros
          </Button>
        </form>
        <div className="min-w-0">
          <div className="mb-6 flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-3">
            <CatalogTabs
              feed={search.feed}
              onChange={(feed) =>
                void navigate({
                  search: { ...search, feed, page: undefined },
                  resetScroll: false,
                })
              }
            />
            <label className="ml-auto flex min-w-0 items-center gap-1 font-mono text-sm font-bold">
              <span className="shrink-0">Ordenar por:</span>
              <span className="relative min-w-0">
                <select
                  key={`sort:${JSON.stringify(search)}`}
                  aria-label="Ordenar por"
                  form="catalog-filters"
                  name="sort"
                  defaultValue={
                    search.sort ||
                    (search.feed === 'trending' ? 'popular' : 'featured')
                  }
                  className="min-h-9 w-full min-w-0 appearance-none rounded-sm bg-transparent py-1 pr-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_option]:bg-card"
                >
                  <option value="featured">Listados recentemente</option>
                  <option value="popular">Mais populares</option>
                  <option value="price-asc">Menor preço</option>
                  <option value="price-desc">Maior preço</option>
                  <option value="name">Nome</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute top-3 right-0 size-3"
                />
              </span>
            </label>
          </div>
          <div
            id="catalog-results"
            role="tabpanel"
            aria-labelledby={`catalog-tab-${search.feed || 'all'}`}
            tabIndex={0}
            className="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            aria-busy={catalog.isFetching}
          >
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
                <CatalogPagination
                  page={page}
                  total={catalog.data.total}
                  pageSize={catalog.data.pageSize}
                  disabled={catalog.isFetching}
                  onChange={(nextPage) =>
                    void navigate({
                      search: { ...search, page: nextPage },
                      resetScroll: false,
                    })
                  }
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
