import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-24 text-center">
      <p className="mb-4 text-sm text-primary">404</p>
      <h1 className="text-3xl font-bold">Página não encontrada</h1>
      <p className="mt-4 text-muted-foreground">
        O endereço que você procura não está disponível.
      </p>
      <Button asChild className="mt-8">
        <Link to="/">Voltar ao catálogo</Link>
      </Button>
    </div>
  )
}
