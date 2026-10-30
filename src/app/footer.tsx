import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

const benefits = [
  {
    mark: 'W',
    title: 'Segurança da carteira',
    description:
      'Proteja sua carteira e colecione arte digital verificada com confiança.',
  },
  {
    mark: 'C',
    title: 'Criadores em destaque',
    description:
      'Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.',
  },
  {
    mark: 'D',
    title: 'Alertas de lançamentos',
    description:
      'Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.',
  },
]

function UnavailableLink({ children }: { children: ReactNode }) {
  return (
    <span
      role="link"
      aria-disabled="true"
      title="Indisponível no momento"
      className="inline-block py-1"
    >
      {children}
    </span>
  )
}

function SocialMark({ name }: { name: string }) {
  if (name === 'Facebook' || name === 'LinkedIn')
    return (
      <span
        aria-hidden="true"
        className="font-[Arial,sans-serif] text-xl leading-none font-bold"
      >
        {name === 'Facebook' ? 'f' : 'in'}
      </span>
    )
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      {name === 'Instagram' ? (
        <g fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle
            cx="17.5"
            cy="6.5"
            r="0.8"
            fill="currentColor"
            stroke="none"
          />
        </g>
      ) : name === 'Twitter' ? (
        <path
          fill="currentColor"
          d="M22 5.9a8.2 8.2 0 0 1-2.4.7 4.2 4.2 0 0 0 1.8-2.3 8.2 8.2 0 0 1-2.6 1 4.1 4.1 0 0 0-7 3.7 11.6 11.6 0 0 1-8.4-4.3 4.1 4.1 0 0 0 1.3 5.5 4.1 4.1 0 0 1-1.8-.5 4.1 4.1 0 0 0 3.3 4.1 4.1 4.1 0 0 1-1.9.1 4.1 4.1 0 0 0 3.8 2.8A8.3 8.3 0 0 1 2 18.4a11.6 11.6 0 0 0 17.8-9.8v-.5A8.3 8.3 0 0 0 22 5.9Z"
        />
      ) : (
        <>
          <rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" />
          <path d="m10 9 6 3-6 3Z" fill="var(--color-card)" />
        </>
      )}
    </svg>
  )
}

export function Footer() {
  const [newsletterNotice, setNewsletterNotice] = useState('')
  function submitNewsletter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNewsletterNotice('As inscrições estão indisponíveis no momento.')
  }
  return (
    <footer className="bg-card font-mono text-sm text-foreground [--footer-accent:#d18a47] [--footer-muted:#cdb189]">
      <div className="mx-auto grid max-w-7xl gap-y-8 px-5 pt-8 pb-4 sm:grid-cols-2 sm:px-8 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.28fr)]">
        {benefits.map((benefit, index) => (
          <section
            key={benefit.mark}
            className={`min-w-0 px-4 lg:border-r lg:border-[var(--footer-accent)] ${index === 0 ? 'sm:border-r sm:border-[var(--footer-accent)]' : ''}`}
          >
            <div
              aria-hidden="true"
              className="flex size-[74px] items-center justify-center rounded-full bg-[var(--footer-accent)] text-2xl font-bold text-primary-foreground"
            >
              {benefit.mark}
            </div>
            <h2 className="mt-2 text-lg leading-6 font-bold">
              {benefit.title}
            </h2>
            <p className="mt-2 max-w-[12rem] leading-[22px] text-[var(--footer-muted)]">
              {benefit.description}
            </p>
          </section>
        ))}
        <section className="min-w-0 px-4 lg:pr-0">
          <h2
            id="footer-newsletter-title"
            className="max-w-xs text-lg leading-4 font-bold"
          >
            Antecipe-se ao próximo lançamento
          </h2>
          <form
            aria-labelledby="footer-newsletter-title"
            onSubmit={submitNewsletter}
            className="mt-4"
          >
            <label htmlFor="footer-email" className="sr-only">
              E-mail para receber lançamentos
            </label>
            <div className="flex min-w-0 rounded-md bg-[#39230e] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <input
                id="footer-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="digite seu e-mail..."
                aria-describedby="footer-newsletter-description footer-newsletter-notice"
                className="min-h-10 w-full min-w-0 flex-1 bg-transparent px-3 py-2 text-sm placeholder:text-[#b4935f] focus-visible:outline-none"
              />
              <button
                type="submit"
                aria-disabled="true"
                title="Inscrições indisponíveis no momento"
                className="min-h-10 shrink-0 rounded-r-md bg-[var(--footer-accent)] px-4 text-lg font-bold text-primary-foreground hover:brightness-110"
              >
                Enviar
              </button>
            </div>
            <p
              id="footer-newsletter-description"
              className="mt-3 max-w-[18rem] text-[13px] leading-[22px] text-[var(--footer-muted)]"
            >
              Receba lançamentos selecionados, histórias de criadores e
              novidades do mercado.
            </p>
            <p
              id="footer-newsletter-notice"
              role="status"
              className="mt-2 text-xs leading-5 text-[var(--footer-muted)] empty:hidden"
            >
              {newsletterNotice}
            </p>
          </form>
        </section>
      </div>

      <div className="bg-[#39230e]">
        <div className="mx-auto grid max-w-7xl gap-y-5 py-6 leading-5 sm:grid-cols-2 lg:grid-cols-4">
          <p className="self-center px-5 font-bold tracking-wider sm:px-8">
            KURIO
          </p>
          <p className="px-5 sm:px-8">
            Feito para colecionadores, criadores e cultura
          </p>
          <p className="self-center break-all px-5 sm:px-8">
            contato@email.com
          </p>
          <p className="self-center px-5 sm:px-8">+55 11 4002 8922</p>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-y-8 py-7 sm:grid-cols-2 lg:grid-cols-4">
        <nav aria-label="Perfil no rodapé" className="px-5 sm:px-8">
          <h2 className="mb-1 text-lg leading-6 font-bold">Meu perfil</h2>
          <ul className="leading-[22px]">
            <li>
              <Link
                to="/profile"
                aria-label="Meu perfil no rodapé"
                className="inline-block py-1 hover:text-[var(--footer-accent)]"
              >
                Meu perfil
              </Link>
            </li>
            <li>
              <UnavailableLink>Minha coleção</UnavailableLink>
            </li>
            <li>
              <UnavailableLink>Atividade</UnavailableLink>
            </li>
            <li>
              <UnavailableLink>Estúdio do criador</UnavailableLink>
            </li>
            <li>
              <Link
                to="/favorites"
                className="inline-block py-1 hover:text-[var(--footer-accent)]"
              >
                Lista de interesse
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Ajuda no rodapé" className="px-5 sm:px-8">
          <h2 className="mb-1 text-lg leading-6 font-bold">Central de ajuda</h2>
          <ul className="leading-[22px]">
            <li>
              <UnavailableLink>Central de ajuda</UnavailableLink>
            </li>
            <li>
              <UnavailableLink>Como comprar NFTs</UnavailableLink>
            </li>
            <li>
              <Link
                to="/wallets"
                className="inline-block py-1 hover:text-[var(--footer-accent)]"
              >
                Carteira e segurança
              </Link>
            </li>
            <li>
              <UnavailableLink>Política do mercado</UnavailableLink>
            </li>
            <li>
              <UnavailableLink>Denunciar item</UnavailableLink>
            </li>
          </ul>
        </nav>
        <nav aria-label="Coleções no rodapé" className="px-5 sm:px-8">
          <h2 className="mb-1 text-lg leading-6 font-bold">Coleções</h2>
          <ul className="leading-[22px]">
            <li>
              <Link
                to="/"
                search={{ category: 'art' }}
                hash="catalogo"
                className="inline-block py-1 hover:text-[var(--footer-accent)]"
              >
                Arte digital
              </Link>
            </li>
            <li>
              <Link
                to="/"
                search={{ category: 'photography' }}
                hash="catalogo"
                className="inline-block py-1 hover:text-[var(--footer-accent)]"
              >
                Fotografia
              </Link>
            </li>
            <li>
              <Link
                to="/"
                search={{ category: 'music' }}
                hash="catalogo"
                className="inline-block py-1 hover:text-[var(--footer-accent)]"
              >
                Música
              </Link>
            </li>
            <li>
              <UnavailableLink>Arte 3D</UnavailableLink>
            </li>
            <li>
              <UnavailableLink>Utilidade</UnavailableLink>
            </li>
          </ul>
        </nav>
        <div className="min-w-0 px-5 sm:px-8 lg:pr-5">
          <section aria-labelledby="footer-social-title">
            <h2
              id="footer-social-title"
              className="text-lg leading-6 font-bold"
            >
              Redes sociais
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube'].map(
                (name) => (
                  <span
                    key={name}
                    role="link"
                    aria-label={`${name} — indisponível no momento`}
                    aria-disabled="true"
                    title={`${name} — indisponível no momento`}
                    className="flex size-8 items-center justify-center rounded border border-[var(--footer-accent)] text-[var(--footer-accent)]"
                  >
                    <SocialMark name={name} />
                  </span>
                ),
              )}
            </div>
          </section>
          <section aria-labelledby="footer-wallets-title" className="mt-6">
            <h2
              id="footer-wallets-title"
              className="text-lg leading-6 font-bold"
            >
              Carteiras compatíveis
            </h2>
            <p
              aria-label="Carteiras compatíveis na simulação: MetaMask, WalletConnect e Coinbase"
              className="mt-2 inline-block max-w-full rounded-md border border-border bg-[#39230e] px-2 py-1 text-[9px] leading-4 font-bold text-[var(--footer-accent)]"
            >
              METAMASK{' '}
              <span aria-hidden="true" className="px-1">
                ·
              </span>{' '}
              WALLETCONNECT{' '}
              <span aria-hidden="true" className="px-1">
                ·
              </span>{' '}
              COINBASE
            </p>
          </section>
        </div>
      </div>

      <div className="bg-black px-5 py-[9px] text-center text-sm font-bold">
        © 2026 Kurio. Propriedade digital para todos.
      </div>
    </footer>
  )
}
