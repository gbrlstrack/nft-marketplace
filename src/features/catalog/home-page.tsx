import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CatalogSection } from './catalog-section'

export function HomePage() {
  return (
    <>
      <section className="grid items-center gap-10 pb-16 md:grid-cols-[1.1fr_1fr] md:pb-24">
        <div>
          <p className="mb-4 text-sm font-semibold tracking-wider">
            Bem-vindo à Kurio
          </p>
          <h1 className="max-w-xl text-3xl leading-snug font-bold uppercase md:text-5xl">
            Seja dono do futuro da arte digital
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Descubra NFTs selecionados de criadores emergentes e consagrados.
            Colecione arte digital, apoie artistas e tenha uma parte da cultura
            da internet.
          </p>
          <Button asChild className="mt-7">
            <a href="#catalogo">
              Explorar <ArrowRight aria-hidden="true" />
            </a>
          </Button>
        </div>
        <div
          className="hero-art aspect-square max-h-96 rounded-3xl border border-primary/25"
          role="img"
          aria-label="Composição geométrica abstrata em tons de cobre"
        />
      </section>
      <CatalogSection />
    </>
  )
}
