import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { ArrowUpRight, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useSession } from '@/features/auth/use-session'
import { logoutSession } from '@/features/auth/session'
import { SessionLifecycle } from '@/features/auth/session-lifecycle'
import { isPrivatePath } from '@/features/auth/return-to'
import { FavoriteNotice } from '@/features/favorites/favorite-button'
import { getErrorMessage } from '@/lib/api-error'
import { CartNavigation } from '@/features/cart/cart-navigation'
import { RealtimeLifecycle } from '@/features/realtime/lifecycle'
import { useRealtime } from '@/features/realtime/state'
import { Footer } from '@/app/footer'

export function Shell() {
  const session = useSession()
  const realtime = useRealtime()
  const path = useLocation({ select: (location) => location.pathname })
  const logout = useMutation({ mutationFn: logoutSession })
  return (
    <>
      <SessionLifecycle />
      <RealtimeLifecycle />
      <a
        className="fixed top-3 left-3 z-[100] -translate-y-24 rounded-md bg-primary px-5 py-3 font-bold text-primary-foreground focus:translate-y-0"
        href="#conteudo"
      >
        Pular para o conteúdo
      </a>
      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between border-b border-border px-5 md:px-8">
        <Link
          to="/"
          className="text-sm font-extrabold tracking-[0.2em]"
          aria-label="Kurio, início"
        >
          KURIO
        </Link>
        <nav
          aria-label="Navegação principal"
          className="hidden items-center gap-10 md:flex"
        >
          <Link to="/" className="text-sm font-semibold text-primary">
            Início
          </Link>
          <a href="/#catalogo" className="text-sm hover:text-primary">
            Mercado
          </a>
          <Link to="/favorites" className="text-sm hover:text-primary">
            Favoritos
          </Link>
        </nav>
        <CartNavigation />
        <div className="hidden items-center gap-4 md:flex">
          {session.user ? (
            <>
              <Link to="/profile" className="text-sm text-primary">
                Meu perfil
              </Link>
              <Button
                variant="outline"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Sair
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link to="/login">
                Entrar <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" aria-label="Abrir menu">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle className="pr-12 text-xl font-bold">
                Navegação
              </SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                Descubra o universo da arte digital.
              </SheetDescription>
              <nav
                aria-label="Navegação mobile"
                className="flex flex-col gap-4"
              >
                <SheetClose asChild>
                  <Link
                    to="/"
                    className="rounded-md p-3 text-primary focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Explorar
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/favorites" className="rounded-md p-3 text-primary">
                    Favoritos
                  </Link>
                </SheetClose>
                {session.user ? (
                  <>
                    <SheetClose asChild>
                      <Link
                        to="/profile"
                        className="rounded-md p-3 text-primary"
                      >
                        Meu perfil
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        to="/wallets"
                        className="rounded-md p-3 text-primary"
                      >
                        Carteiras
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button
                        variant="outline"
                        onClick={() => logout.mutate()}
                        disabled={logout.isPending}
                      >
                        Sair
                      </Button>
                    </SheetClose>
                  </>
                ) : (
                  <SheetClose asChild>
                    <Link to="/login" className="rounded-md p-3 text-primary">
                      Entrar
                    </Link>
                  </SheetClose>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main
        id="conteudo"
        tabIndex={-1}
        className="mx-auto min-h-[75vh] max-w-7xl px-5 py-10 focus:outline-none md:px-8 md:py-14"
      >
        {logout.isError && (
          <p role="alert" className="mb-5 text-sm">
            {getErrorMessage(
              logout.error,
              'Não foi possível sair. Tente novamente.',
            )}
          </p>
        )}
        <FavoriteNotice />
        <p
          role="status"
          aria-label="Atualizações em tempo real"
          className="mb-5 text-xs text-muted-foreground"
        >
          {realtime.status === 'connected'
            ? 'Atualizações em tempo real conectadas.'
            : realtime.status === 'offline'
              ? 'Conexão interrompida. Tentando reconectar…'
              : 'Conectando atualizações em tempo real…'}
        </p>
        {isPrivatePath(path) && (!session.user || session.authPending) ? (
          <p role="status">
            {session.authPending
              ? 'Atualizando sessão…'
              : 'Entre novamente para continuar.'}
          </p>
        ) : (
          <Outlet />
        )}
      </main>
      <Footer />
    </>
  )
}
