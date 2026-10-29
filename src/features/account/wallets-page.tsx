import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  Collector,
  Wallet,
  WalletConnection,
  WalletConnectionResponse,
  WalletListResponse,
  WalletMutationResponse,
  WalletNetwork,
  WalletRole,
  WalletWriteRequest,
} from '@/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/use-session'
import { isCurrentSession, privateQueryKey } from '@/features/auth/session'
import { getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { http } from '@/lib/http'
import { AccountLayout } from './account-layout'
import { FormFeedback, InputField, SelectField } from './form-fields'
import { validAddress, validEmail, validEns } from './validation'
import { requireCurrentAccountSession, useWalletsQuery } from './queries'

export function WalletsPage() {
  const { user, scope } = useSession()
  const query = useWalletsQuery()
  if (!user) return null
  return (
    <AccountLayout title="Carteiras">
      <p className="mb-7 text-sm leading-relaxed text-muted-foreground">
        Gerencie suas carteiras principal e secundária. A conexão é uma
        simulação e não abre extensões. Campos com * são obrigatórios.
      </p>
      {query.isPending ? (
        <div
          role="status"
          aria-label="Carregando carteiras"
          className="grid gap-5 sm:grid-cols-2"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
          <span className="sr-only">Carregando carteiras</span>
        </div>
      ) : query.data ? (
        <div className="space-y-12">
          {query.isError && (
            <p role="alert" className="text-sm">
              Não foi possível atualizar as carteiras.{' '}
              <button
                className="underline"
                onClick={() => void query.refetch()}
              >
                Tentar novamente
              </button>
            </p>
          )}
          {(['primary', 'secondary'] as const).map((role) => (
            <WalletForm
              key={`${scope}:${role}`}
              wallet={query.data.items.find((wallet) => wallet.role === role)}
              role={role}
              user={user}
              scope={scope}
            />
          ))}
        </div>
      ) : (
        <div role="alert">
          <p>
            {getErrorMessage(
              query.error,
              'Não foi possível carregar as carteiras.',
            )}
          </p>
          <Button className="mt-5" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
    </AccountLayout>
  )
}

function walletValues(
  wallet: Wallet | undefined,
  role: WalletRole,
  user: Collector,
): WalletWriteRequest {
  return wallet
    ? {
        label: wallet.label,
        displayName: wallet.displayName,
        profileName: wallet.profileName,
        provider: wallet.provider,
        email: wallet.email,
        ensName: wallet.ensName,
        referralCode: wallet.referralCode,
        secondaryAddress: wallet.secondaryAddress,
        address: wallet.address,
        network: wallet.network,
        role,
      }
    : {
        label: '',
        displayName: user.name,
        profileName: user.name,
        provider: 'metamask',
        email: user.email,
        ensName: '',
        referralCode: '',
        secondaryAddress: '',
        address: '',
        network: 'ethereum',
        role,
      }
}

function WalletForm({
  wallet,
  role,
  user,
  scope,
}: {
  wallet?: Wallet
  role: WalletRole
  user: Collector
  scope: number
}) {
  const title =
    role === 'primary' ? 'Carteira principal' : 'Carteira secundária'
  const queryClient = useQueryClient()
  const queryKey = privateQueryKey('wallets')
  const [values, setValues] = useState(() => walletValues(wallet, role, user))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [connection, setConnection] = useState<WalletConnection | null>(null)
  const connectionRef = useRef<WalletConnection | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const active = connectionRef.current
      connectionRef.current = null
      if (active && isCurrentSession(scope, user.id))
        void http
          .delete(`/wallet-connections/${encodeURIComponent(active.id)}`)
          .catch(() => undefined)
    }
  }, [scope, user.id])
  useEffect(() => {
    if (!connection) return
    const expiration = new Date(connection.expiresAt).getTime() - Date.now()
    const timer = window.setTimeout(
      () => {
        if (!isCurrentSession(scope, user.id)) return
        connectionRef.current = null
        setConnection(null)
        setNotice('Conexão expirada. Conecte a carteira novamente.')
      },
      Math.max(0, Math.min(expiration, 2_147_483_647)),
    )
    return () => window.clearTimeout(timer)
  }, [connection, scope, user.id])
  const mutation = useMutation({
    meta: { private: true },
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    mutationFn: async (request: WalletWriteRequest) => {
      requireCurrentAccountSession(scope, user.id)
      return wallet
        ? (
            await http.put<WalletMutationResponse>(
              `/wallets/${encodeURIComponent(wallet.id)}`,
              request,
            )
          ).data
        : (await http.post<WalletMutationResponse>('/wallets', request)).data
    },
    onSuccess: (updated) => {
      if (!mounted.current || !isCurrentSession(scope, user.id)) return
      queryClient.setQueryData<WalletListResponse>(queryKey, (previous) => ({
        items: [
          ...(previous?.items || []).filter((item) => item.id !== updated.id),
          previous?.items.find(
            (item) => item.id === updated.id && item.version > updated.version,
          ) || updated,
        ],
      }))
      const current =
        queryClient
          .getQueryData<WalletListResponse>(queryKey)
          ?.items.find((item) => item.id === updated.id) || updated
      setValues(walletValues(current, role, user))
      connectionRef.current = null
      setConnection(null)
      setErrors({})
      setError('')
      setNotice('Carteira salva.')
    },
    onError: (failure) => {
      if (!mounted.current || !isCurrentSession(scope, user.id)) return
      setErrors(getFieldErrors(failure))
      setError(getErrorMessage(failure, 'Não foi possível salvar a carteira.'))
    },
  })
  const connect = useMutation({
    meta: { private: true },
    mutationFn: async () => {
      requireCurrentAccountSession(scope, user.id)
      return (
        await http.post<WalletConnectionResponse>(
          `/wallets/${encodeURIComponent(wallet!.id)}/connections`,
          { network: values.network },
        )
      ).data
    },
    onSuccess: (updated) => {
      if (!isCurrentSession(scope, user.id)) return
      if (!mounted.current) {
        void http
          .delete(`/wallet-connections/${encodeURIComponent(updated.id)}`)
          .catch(() => undefined)
        return
      }
      connectionRef.current = updated
      setConnection(updated)
      setNotice('Carteira conectada.')
      setError('')
    },
    onError: (failure) => {
      if (mounted.current && isCurrentSession(scope, user.id))
        setError(
          getErrorMessage(failure, 'Não foi possível conectar a carteira.'),
        )
    },
  })
  const disconnect = useMutation({
    meta: { private: true },
    mutationFn: () => {
      requireCurrentAccountSession(scope, user.id)
      return http.delete(
        `/wallet-connections/${encodeURIComponent(connectionRef.current!.id)}`,
      )
    },
    onSuccess: () => {
      if (!mounted.current || !isCurrentSession(scope, user.id)) return
      connectionRef.current = null
      setConnection(null)
      setNotice('Carteira desconectada.')
      setError('')
    },
    onError: (failure) => {
      if (mounted.current && isCurrentSession(scope, user.id))
        setError(
          getErrorMessage(failure, 'Não foi possível desconectar a carteira.'),
        )
    },
  })
  function update<K extends keyof WalletWriteRequest>(
    field: K,
    value: WalletWriteRequest[K],
  ) {
    setValues((previous) => ({ ...previous, [field]: value }))
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    const request = {
      ...values,
      label: values.label.trim(),
      displayName: values.displayName.trim(),
      profileName: values.profileName.trim(),
      email: values.email.trim(),
      ensName: values.ensName.trim(),
      referralCode: values.referralCode.trim(),
      secondaryAddress: values.secondaryAddress.trim(),
      address: values.address.trim(),
    }
    const nextErrors: Record<string, string> = {}
    for (const field of [
      'label',
      'displayName',
      'profileName',
      'referralCode',
    ] as const)
      if (request[field].length < 2 || request[field].length > 80)
        nextErrors[field] = 'Use entre 2 e 80 caracteres.'
    if (!validEmail(request.email))
      nextErrors.email = 'Informe um e-mail válido.'
    if (!validEns(request.ensName))
      nextErrors.ensName = 'Informe um nome ENS válido terminado em .eth.'
    if (!validAddress(request.address))
      nextErrors.address =
        'Informe um endereço 0x com 40 caracteres hexadecimais.'
    if (
      request.secondaryAddress &&
      !validAddress(request.secondaryAddress) &&
      !validEns(request.secondaryAddress)
    )
      nextErrors.secondaryAddress = 'Informe um endereço 0x ou nome ENS válido.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setError('Confira os campos indicados.')
      return
    }
    mutation.mutate(request)
  }
  const busy = mutation.isPending || connect.isPending || disconnect.isPending
  return (
    <section className="border-t border-border pt-7 first:border-0 first:pt-0">
      <h2 className="mb-6 text-lg font-semibold">{title}</h2>
      <form
        aria-label={title}
        noValidate
        onSubmit={submit}
        className="space-y-5"
      >
        <fieldset disabled={busy} className="grid min-w-0 gap-6 sm:grid-cols-2">
          <InputField
            label="Nome de exibição"
            name="displayName"
            required
            maxLength={80}
            value={values.displayName}
            onChange={(event) => update('displayName', event.target.value)}
            error={errors.displayName}
          />
          <InputField
            label="Apelido da carteira"
            name="label"
            required
            maxLength={80}
            value={values.label}
            onChange={(event) => update('label', event.target.value)}
            error={errors.label}
          />
          <SelectField
            label="Rede"
            name="network"
            required
            value={values.network}
            onChange={(event) =>
              update('network', event.target.value as WalletNetwork)
            }
            error={errors.network}
          >
            <option value="ethereum">Ethereum</option>
            <option value="sepolia">Sepolia</option>
          </SelectField>
          <InputField
            label="Nome do perfil"
            name="profileName"
            required
            maxLength={80}
            value={values.profileName}
            onChange={(event) => update('profileName', event.target.value)}
            error={errors.profileName}
          />
          <InputField
            label="Endereço da carteira"
            name="address"
            required
            maxLength={42}
            placeholder="0x…"
            value={values.address}
            onChange={(event) => update('address', event.target.value)}
            error={errors.address}
          />
          <InputField
            label="Endereço secundário"
            name="secondaryAddress"
            maxLength={80}
            placeholder="ENS ou carteira secundária (opcional)"
            value={values.secondaryAddress}
            onChange={(event) => update('secondaryAddress', event.target.value)}
            error={errors.secondaryAddress}
          />
          <SelectField
            label="Tipo de carteira"
            name="provider"
            required
            value={values.provider}
            onChange={(event) =>
              update(
                'provider',
                event.target.value as WalletWriteRequest['provider'],
              )
            }
            error={errors.provider}
          >
            <option value="metamask">MetaMask</option>
            <option value="walletconnect">WalletConnect</option>
            <option value="coinbase">Coinbase</option>
          </SelectField>
          <InputField
            label="Código de indicação"
            name="referralCode"
            required
            maxLength={80}
            value={values.referralCode}
            onChange={(event) => update('referralCode', event.target.value)}
            error={errors.referralCode}
          />
          <InputField
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={values.email}
            onChange={(event) => update('email', event.target.value)}
            error={errors.email}
          />
          <InputField
            label="Nome ENS"
            name="ensName"
            required
            maxLength={67}
            placeholder="seu-nome.eth"
            value={values.ensName}
            onChange={(event) => update('ensName', event.target.value)}
            error={errors.ensName}
          />
        </fieldset>
        <FormFeedback error={error} notice={notice} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {mutation.isPending ? 'Salvando carteira…' : 'Salvar carteira'}
          </Button>
          {wallet &&
            (connection ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setNotice('')
                  setError('')
                  disconnect.mutate()
                }}
              >
                Desconectar carteira
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setNotice('')
                  setError('')
                  connect.mutate()
                }}
              >
                {connect.isPending
                  ? 'Conectando carteira…'
                  : 'Conectar carteira'}
              </Button>
            ))}
        </div>
        {connection && (
          <p className="text-sm text-primary">
            Conectada à rede{' '}
            {connection.network === 'ethereum' ? 'Ethereum' : 'Sepolia'}.
          </p>
        )}
      </form>
    </section>
  )
}
