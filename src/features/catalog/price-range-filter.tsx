import { useState } from 'react'
import type { CatalogSearch } from '@/contracts'
import { ethFromWei, formatEth, parseEth } from '@/lib/eth'
import { Button } from '@/components/ui/button'
import './price-range-filter.css'

const centWei = 10n ** 16n
const sliderMaximum = 1600

function sliderValue(price: string) {
  const cents = parseEth(price) / centWei
  return Number(cents > BigInt(sliderMaximum) ? BigInt(sliderMaximum) : cents)
}

function label(price: string) {
  const [whole, fraction = ''] = formatEth(price).split('.')
  return `${whole},${fraction.padEnd(2, '0')}`
}

export function PriceRangeFilter({ search }: { search: CatalogSearch }) {
  const [minimum, setMinimum] = useState(
    search.minPrice ||
      (search.maxPrice && parseEth(search.maxPrice) < parseEth('0.02')
        ? search.maxPrice
        : '0.02'),
  )
  const [maximum, setMaximum] = useState(
    search.maxPrice ||
      (search.minPrice && parseEth(search.minPrice) > parseEth('12.3')
        ? search.minPrice
        : '12.3'),
  )
  const [dirty, setDirty] = useState(false)
  const low = sliderValue(minimum)
  const high = sliderValue(maximum)
  function changeMinimum(cents: number) {
    const next = ethFromWei(BigInt(cents) * centWei)
    setMinimum(parseEth(next) > parseEth(maximum) ? maximum : next)
    setDirty(true)
  }
  function changeMaximum(cents: number) {
    const next = ethFromWei(BigInt(cents) * centWei)
    setMaximum(parseEth(next) < parseEth(minimum) ? minimum : next)
    setDirty(true)
  }
  return (
    <fieldset aria-label="Faixa de preço" className="mt-9 min-w-0">
      <legend className="text-lg font-bold">Faixa de preço</legend>
      <div className="px-3">
        <div className="catalog-price-range mt-1">
          <div aria-hidden="true" className="catalog-price-range-track" />
          <div
            aria-hidden="true"
            className="catalog-price-range-fill"
            style={{
              left: `${(low / sliderMaximum) * 100}%`,
              right: `${100 - (high / sliderMaximum) * 100}%`,
            }}
          />
          <input
            type="range"
            min={0}
            max={sliderMaximum}
            step={1}
            value={low}
            aria-label="Preço mínimo em ETH"
            aria-valuetext={`${label(minimum)} ETH`}
            onChange={(event) =>
              changeMinimum(event.currentTarget.valueAsNumber)
            }
          />
          <input
            type="range"
            min={0}
            max={sliderMaximum}
            step={1}
            value={high}
            aria-label="Preço máximo em ETH"
            aria-valuetext={`${label(maximum)} ETH`}
            onChange={(event) =>
              changeMaximum(event.currentTarget.valueAsNumber)
            }
          />
        </div>
        <p className="mt-2 break-words text-sm" aria-live="polite">
          Preço: {label(minimum)} - {label(maximum)} ETH
        </p>
        <input type="hidden" name="priceMinDraft" value={minimum} />
        <input type="hidden" name="priceMaxDraft" value={maximum} />
        <input
          type="hidden"
          name="minPrice"
          value={dirty ? minimum : search.minPrice || ''}
        />
        <input
          type="hidden"
          name="maxPrice"
          value={dirty ? maximum : search.maxPrice || ''}
        />
        <Button
          type="submit"
          name="applyPrice"
          value="true"
          aria-label="Aplicar faixa de preço"
          className="mt-2 min-h-9 rounded px-3 py-1.5 text-base"
        >
          Aplicar
        </Button>
      </div>
    </fieldset>
  )
}
