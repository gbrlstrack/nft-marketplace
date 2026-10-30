import { Link } from '@tanstack/react-router'
import { ShoppingCart } from 'lucide-react'
import { useSession } from '@/features/auth/use-session'
import { useCartQuery } from './queries'

export function CartNavigation() {
  const { authPending } = useSession()
  const cart = useCartQuery()
  const count =
    !authPending && cart.data
      ? cart.data.items.reduce((total, item) => total + item.quantity, 0)
      : 0
  return (
    <Link
      to="/cart"
      aria-label="Carrinho"
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-primary"
    >
      <ShoppingCart className="size-4" aria-hidden="true" />
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{count} itens</span>
    </Link>
  )
}
