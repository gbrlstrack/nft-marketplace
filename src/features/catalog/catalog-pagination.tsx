import { Fragment } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CatalogPagination({
  page,
  total,
  pageSize,
  disabled,
  onChange,
}: {
  page: number
  total: number
  pageSize: number
  disabled: boolean
  onChange: (page: number) => void
}) {
  const count = Math.ceil(total / pageSize)
  if (count === 0) return null
  const current = Math.min(page, count)
  const visible = new Set([1, count])
  const start = Math.max(1, Math.min(current - 1, count - 3))
  for (let value = start; value <= Math.min(count, start + 3); value++)
    visible.add(value)
  const pages = [...visible].sort((left, right) => left - right)
  const buttonClass =
    'size-9 min-h-9 rounded-sm border border-primary/30 px-0 py-0 font-mono text-lg font-normal'
  return (
    <nav
      aria-label="Paginação do catálogo"
      className="mt-12 flex flex-wrap items-center justify-end gap-2"
    >
      <p className="sr-only" aria-live="polite">
        Página {page} de {count}
      </p>
      {page > 1 && (
        <Button
          variant="outline"
          aria-label="Página anterior"
          className={buttonClass}
          disabled={disabled}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
      )}
      {pages.map((value, index) => (
        <Fragment key={value}>
          {index > 0 && value > pages[index - 1] + 1 && (
            <span aria-hidden="true" className="px-1 text-muted-foreground">
              …
            </span>
          )}
          <Button
            variant={page === value ? 'default' : 'outline'}
            aria-label={`Página ${value}`}
            aria-current={page === value ? 'page' : undefined}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={buttonClass}
          >
            {value}
          </Button>
        </Fragment>
      ))}
      <Button
        variant="outline"
        aria-label="Próxima página"
        className={buttonClass}
        disabled={disabled || page >= count}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  )
}
