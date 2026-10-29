import { Link, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function RouteErrorPage() {
  const router = useRouter()
  return (
    <main className="mx-auto max-w-xl px-5 py-24">
      <h1 className="text-2xl font-bold">
        Não foi possível carregar esta página
      </h1>
      <p className="mt-4 text-muted-foreground">
        Verifique a conexão e tente novamente.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Button onClick={() => void router.invalidate()}>
          Tentar novamente
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Voltar ao catálogo</Link>
        </Button>
      </div>
    </main>
  )
}
