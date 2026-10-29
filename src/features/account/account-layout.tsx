import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Heart, UserRound, Wallet } from 'lucide-react'

export function AccountLayout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="rounded-lg bg-card p-4">
        <h2 className="mb-3 text-lg font-bold">Meu perfil</h2>
        <nav
          aria-label="Área do colecionador"
          className="flex flex-wrap gap-2 lg:flex-col"
        >
          <Link
            to="/profile"
            activeProps={{
              'aria-current': 'page',
              className: 'bg-primary/10 text-primary',
            }}
            className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Dados do perfil
          </Link>
          <Link
            to="/wallets"
            activeProps={{
              'aria-current': 'page',
              className: 'bg-primary/10 text-primary',
            }}
            className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            <Wallet className="size-4" aria-hidden="true" />
            Carteiras
          </Link>
          <Link
            to="/favorites"
            activeProps={{
              'aria-current': 'page',
              className: 'bg-primary/10 text-primary',
            }}
            className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            <Heart className="size-4" aria-hidden="true" />
            Favoritos
          </Link>
        </nav>
      </aside>
      <div className="min-w-0">
        <h1 className="mb-7 text-xl font-bold">{title}</h1>
        {children}
      </div>
    </div>
  )
}
