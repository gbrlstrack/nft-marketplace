import type { KeyboardEvent } from 'react'
import type { CatalogFeed } from '@/contracts'

const tabs = [
  { value: undefined, label: 'Todos os NFTs', id: 'all' },
  { value: 'new', label: 'Novos lançamentos', id: 'new' },
  { value: 'trending', label: 'Em alta', id: 'trending' },
] as const

export function CatalogTabs({
  feed,
  onChange,
}: {
  feed?: CatalogFeed
  onChange: (feed?: CatalogFeed) => void
}) {
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft')
      next = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    const buttons =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      )
    buttons?.[next]?.focus()
    onChange(tabs[next].value)
  }
  return (
    <div
      role="tablist"
      aria-label="Explorar NFTs"
      className="flex min-w-0 flex-wrap items-center gap-x-5 font-mono text-sm font-bold"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`catalog-tab-${tab.id}`}
          aria-selected={feed === tab.value}
          aria-controls="catalog-results"
          tabIndex={feed === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => move(event, index)}
          className={`min-h-9 border-b-2 py-1 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ${feed === tab.value ? 'border-primary text-primary' : 'border-transparent text-foreground hover:text-primary'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
