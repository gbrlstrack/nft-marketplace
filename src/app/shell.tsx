import { Link, Outlet } from '@tanstack/react-router'
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

export function Shell() {
  return (
    <>
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
        </nav>
        <span className="hidden text-xs text-muted-foreground md:block">
          Arte. Cultura. Coleção.{' '}
          <ArrowUpRight className="ml-2 inline size-4" aria-hidden="true" />
        </span>
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
        <Outlet />
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-8 text-xs text-muted-foreground md:px-8">
        <span className="font-bold tracking-[0.15em] text-foreground">
          KURIO
        </span>
        <p>Propriedade digital para todos. Ambiente de demonstração.</p>
      </footer>
    </>
  )
}
