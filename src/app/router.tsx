import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { Shell } from '@/app/shell'
import { NotFoundPage } from '@/app/not-found-page'
import { HomePage } from '@/features/catalog/home-page'
import { queryClient } from '@/lib/query-client'
import { validateCatalogSearch } from '@/features/catalog/search'
import { NftPage } from '@/features/catalog/nft-page'

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Shell,
  notFoundComponent: NotFoundPage,
})

export const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: validateCatalogSearch,
  component: HomePage,
})

const nftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nfts/$nftId',
  component: NftPage,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([catalogRoute, nftRoute]),
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
