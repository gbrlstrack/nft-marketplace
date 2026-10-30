import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  lazyRouteComponent,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { Shell } from '@/app/shell'
import { NotFoundPage } from '@/app/not-found-page'
import { HomePage } from '@/features/catalog/home-page'
import { queryClient } from '@/lib/query-client'
import { validateCatalogSearch } from '@/features/catalog/search'
import { NftPage } from '@/features/catalog/nft-page'
import { ensureSession, refreshSession } from '@/features/auth/session'
import { safeReturnTo } from '@/features/auth/return-to'
import { RouteErrorPage } from '@/app/route-error-page'

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Shell,
  notFoundComponent: NotFoundPage,
  beforeLoad: async () => {
    await ensureSession()
  },
  errorComponent: RouteErrorPage,
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

function authSearch(raw: Record<string, unknown>): { returnTo?: string } {
  return raw.returnTo === undefined
    ? {}
    : { returnTo: safeReturnTo(raw.returnTo) }
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: authSearch,
  component: lazyRouteComponent(
    () => import('@/features/auth/auth-page'),
    'LoginPage',
  ),
})
const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  validateSearch: authSearch,
  component: lazyRouteComponent(
    () => import('@/features/auth/auth-page'),
    'RegisterPage',
  ),
})

async function requireSession({ location }: { location: { href: string } }) {
  const session = await refreshSession()
  if (!session.user)
    throw redirect({
      to: '/login',
      search: { returnTo: safeReturnTo(location.href) },
      replace: true,
    })
}

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import('@/features/account/profile-page'),
    'ProfilePage',
  ),
})
const walletsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wallets',
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import('@/features/account/wallets-page'),
    'WalletsPage',
  ),
})
const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/favorites',
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import('@/features/favorites/favorites-page'),
    'FavoritesPage',
  ),
})

const cartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cart',
  component: lazyRouteComponent(
    () => import('@/features/cart/cart-page'),
    'CartPage',
  ),
})
const checkoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/checkout',
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import('@/features/checkout/checkout-page'),
    'CheckoutPage',
  ),
})
const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders/$orderId',
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import('@/features/orders/order-page'),
    'OrderPage',
  ),
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    catalogRoute,
    nftRoute,
    loginRoute,
    registerRoute,
    profileRoute,
    walletsRoute,
    favoritesRoute,
    cartRoute,
    checkoutRoute,
    orderRoute,
  ]),
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
