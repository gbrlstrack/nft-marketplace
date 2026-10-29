import { useRef, useState, type FormEvent } from 'react'
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { UserRound } from 'lucide-react'
import type {
  ChangePasswordRequest,
  Profile,
  ProfileResponse,
  UpdateAvatarRequest,
  UpdateProfileRequest,
} from '@/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/use-session'
import {
  isCurrentSession,
  privateQueryKey,
  updateSessionUser,
} from '@/features/auth/session'
import { getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { http } from '@/lib/http'
import { AccountLayout } from './account-layout'
import { FormFeedback, InputField, TextareaField } from './form-fields'
import { validEmail, validEns, validPassword } from './validation'
import { requireCurrentAccountSession, useProfileQuery } from './queries'

export function ProfilePage() {
  const { user, scope } = useSession()
  const query = useProfileQuery()
  if (!user) return null
  return (
    <AccountLayout title="Perfil do colecionador">
      {query.isPending ? (
        <div
          role="status"
          aria-label="Carregando perfil"
          className="grid gap-5 sm:grid-cols-2"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
          <span className="sr-only">Carregando perfil</span>
        </div>
      ) : query.data ? (
        <>
          <p className="mb-5 text-xs text-muted-foreground">
            Campos com * são obrigatórios.
          </p>
          {query.isError && (
            <p role="alert" className="mb-5 text-sm">
              Não foi possível atualizar o perfil.{' '}
              <button
                className="underline"
                onClick={() => void query.refetch()}
              >
                Tentar novamente
              </button>
            </p>
          )}
          <ProfileEditor
            key={`${scope}:${user.id}`}
            profile={query.data}
            scope={scope}
            userId={user.id}
          />
        </>
      ) : (
        <div role="alert">
          <p>
            {getErrorMessage(
              query.error,
              'Não foi possível carregar o perfil.',
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

function profileValues(profile: Profile): UpdateProfileRequest {
  return {
    name: profile.name,
    username: profile.username,
    email: profile.email,
    ensName: profile.ensName,
    walletAlias: profile.walletAlias,
    bio: profile.bio,
  }
}

function publishProfile(
  queryClient: QueryClient,
  queryKey: ReturnType<typeof privateQueryKey>,
  updated: Profile,
) {
  const previous = queryClient.getQueryData<Profile>(queryKey)
  const current =
    previous && previous.version > updated.version ? previous : updated
  queryClient.setQueryData(queryKey, current)
  updateSessionUser(current)
  return current
}

function ProfileEditor({
  profile,
  scope,
  userId,
}: {
  profile: Profile
  scope: number
  userId: string
}) {
  const queryClient = useQueryClient()
  const queryKey = privateQueryKey('profile')
  const [values, setValues] = useState(() => profileValues(profile))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mutation = useMutation({
    meta: { private: true },
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    mutationFn: async (request: UpdateProfileRequest) => {
      requireCurrentAccountSession(scope, userId)
      return (await http.patch<ProfileResponse>('/profile', request)).data
    },
    onSuccess: (updated) => {
      if (!isCurrentSession(scope, userId)) return
      const current = publishProfile(queryClient, queryKey, updated)
      setValues(profileValues(current))
      setErrors({})
      setError('')
      setNotice('Perfil atualizado.')
    },
    onError: (failure) => {
      if (!isCurrentSession(scope, userId)) return
      setErrors(getFieldErrors(failure))
      setError(
        getErrorMessage(
          failure,
          'Não foi possível salvar o perfil. Tente novamente.',
        ),
      )
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    const next: UpdateProfileRequest = {
      name: values.name.trim(),
      username: values.username.trim(),
      email: values.email.trim(),
      ensName: values.ensName.trim(),
      walletAlias: values.walletAlias.trim(),
      bio: values.bio.trim(),
    }
    const nextErrors: Record<string, string> = {}
    if (next.name.length < 2 || next.name.length > 80)
      nextErrors.name = 'Informe um nome entre 2 e 80 caracteres.'
    if (!/^[a-z0-9_]{3,24}$/i.test(next.username))
      nextErrors.username = 'Use de 3 a 24 letras, números ou sublinhado.'
    if (!validEmail(next.email)) nextErrors.email = 'Informe um e-mail válido.'
    if (!validEns(next.ensName))
      nextErrors.ensName = 'Informe um nome ENS válido terminado em .eth.'
    if (next.walletAlias.length < 2 || next.walletAlias.length > 60)
      nextErrors.walletAlias = 'Informe um apelido entre 2 e 60 caracteres.'
    if (next.bio.length > 500)
      nextErrors.bio = 'A biografia pode ter até 500 caracteres.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setError('Confira os campos indicados.')
      return
    }
    mutation.mutate(next)
  }
  function update(field: keyof UpdateProfileRequest, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
  }
  return (
    <div className="space-y-10">
      <form
        aria-label="Dados do perfil"
        noValidate
        onSubmit={submit}
        className="space-y-5"
      >
        <fieldset
          disabled={mutation.isPending}
          className="grid min-w-0 gap-6 sm:grid-cols-2"
        >
          <InputField
            label="Nome de exibição"
            name="name"
            autoComplete="name"
            required
            maxLength={80}
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            error={errors.name}
          />
          <InputField
            label="Nome de usuário"
            name="username"
            autoComplete="username"
            required
            maxLength={24}
            value={values.username}
            onChange={(event) => update('username', event.target.value)}
            error={errors.username}
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
          <InputField
            label="Apelido da carteira"
            name="walletAlias"
            required
            maxLength={60}
            value={values.walletAlias}
            onChange={(event) => update('walletAlias', event.target.value)}
            error={errors.walletAlias}
          />
          <TextareaField
            label="Biografia"
            name="bio"
            maxLength={500}
            value={values.bio}
            onChange={(event) => update('bio', event.target.value)}
            error={errors.bio}
          />
        </fieldset>
        <FormFeedback error={error} notice={notice} />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando perfil…' : 'Salvar perfil'}
        </Button>
      </form>
      <AvatarForm profile={profile} scope={scope} userId={userId} />
      <PasswordForm scope={scope} userId={userId} />
    </div>
  )
}

function AvatarForm({
  profile,
  scope,
  userId,
}: {
  profile: Profile
  scope: number
  userId: string
}) {
  const queryClient = useQueryClient()
  const queryKey = privateQueryKey('profile')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectionVersion = useRef(0)
  const [selected, setSelected] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mutation = useMutation({
    meta: { private: true },
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    mutationFn: async (request: UpdateAvatarRequest | null) => {
      requireCurrentAccountSession(scope, userId)
      return request === null
        ? (await http.delete<ProfileResponse>('/profile/avatar')).data
        : (await http.put<ProfileResponse>('/profile/avatar', request)).data
    },
    onSuccess: (updated, request) => {
      if (!isCurrentSession(scope, userId)) return
      publishProfile(queryClient, queryKey, updated)
      setSelected('')
      setError('')
      setNotice(request ? 'Avatar atualizado.' : 'Avatar removido.')
      if (inputRef.current) inputRef.current.value = ''
    },
    onError: (failure) => {
      if (isCurrentSession(scope, userId))
        setError(
          getErrorMessage(failure, 'Não foi possível atualizar o avatar.'),
        )
    },
  })
  async function select(file?: File) {
    const version = ++selectionVersion.current
    setSelected('')
    setReading(false)
    setError('')
    setNotice('')
    if (!file) return
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 512 * 1024
    ) {
      setError('Selecione uma imagem PNG, JPEG ou WebP de até 512 KB.')
      return
    }
    setReading(true)
    try {
      const bitmap = await createImageBitmap(file)
      const allowed = bitmap.width <= 4096 && bitmap.height <= 4096
      bitmap.close()
      if (!allowed)
        throw new Error('A imagem pode ter no máximo 4096 × 4096 pixels.')
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Não foi possível ler a imagem.'))
        reader.onerror = () =>
          reject(new Error('Não foi possível ler a imagem.'))
        reader.readAsDataURL(file)
      })
      if (
        version === selectionVersion.current &&
        isCurrentSession(scope, userId)
      )
        setSelected(dataUrl)
    } catch (failure) {
      if (
        version === selectionVersion.current &&
        isCurrentSession(scope, userId)
      )
        setError(
          failure instanceof Error
            ? failure.message
            : 'Selecione uma imagem válida.',
        )
    } finally {
      if (
        version === selectionVersion.current &&
        isCurrentSession(scope, userId)
      )
        setReading(false)
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    if (!selected) {
      setError('Selecione um avatar antes de salvar.')
      return
    }
    mutation.mutate({ dataUrl: selected, alt: `Avatar de ${profile.name}` })
  }
  return (
    <form
      aria-label="Atualizar avatar"
      onSubmit={submit}
      className="space-y-5 border-t border-border pt-8"
    >
      <h2 className="text-lg font-semibold">Avatar</h2>
      <div className="flex flex-wrap items-center gap-4">
        {selected ? (
          <img
            src={selected}
            alt="Prévia do avatar"
            width={72}
            height={72}
            className="size-18 rounded-full object-cover"
          />
        ) : profile.avatar ? (
          <img
            src={profile.avatar.src}
            alt={`Avatar de ${profile.name}`}
            width={72}
            height={72}
            className="size-18 rounded-full object-cover"
          />
        ) : (
          <div
            role="img"
            aria-label="Sem avatar"
            className="flex size-18 items-center justify-center rounded-full bg-card"
          >
            <UserRound className="size-7 text-primary" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <InputField
            label="Avatar"
            name="avatar"
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={mutation.isPending}
            onChange={(event) => void select(event.target.files?.[0])}
            error={error || undefined}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            PNG, JPEG ou WebP. Até 512 KB e 4096 × 4096 pixels.
          </p>
        </div>
      </div>
      <FormFeedback error={error} notice={notice} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={mutation.isPending || reading}>
          {mutation.isPending ? 'Salvando avatar…' : 'Salvar avatar'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!profile.avatar || mutation.isPending}
          onClick={() => {
            selectionVersion.current += 1
            setReading(false)
            setSelected('')
            setNotice('')
            setError('')
            mutation.mutate(null)
          }}
        >
          Remover avatar
        </Button>
      </div>
    </form>
  )
}

function PasswordForm({ scope, userId }: { scope: number; userId: string }) {
  const [values, setValues] = useState({
    currentPassword: '',
    newPassword: '',
    confirmation: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mutation = useMutation({
    meta: { private: true },
    mutationFn: (request: ChangePasswordRequest) => {
      requireCurrentAccountSession(scope, userId)
      return http.put('/profile/password', request)
    },
    onSuccess: () => {
      if (!isCurrentSession(scope, userId)) return
      setValues({ currentPassword: '', newPassword: '', confirmation: '' })
      setNotice('Senha alterada.')
      setError('')
      setErrors({})
    },
    onError: (failure) => {
      if (!isCurrentSession(scope, userId)) return
      setErrors(getFieldErrors(failure))
      setError(getErrorMessage(failure, 'Não foi possível alterar a senha.'))
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    const nextErrors: Record<string, string> = {}
    if (!values.currentPassword)
      nextErrors.currentPassword = 'Informe sua senha atual.'
    if (!validPassword(values.newPassword))
      nextErrors.newPassword =
        'Use pelo menos 8 caracteres, incluindo letra e número.'
    if (values.newPassword !== values.confirmation)
      nextErrors.confirmation = 'A confirmação deve ser igual à nova senha.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setError('Confira os campos indicados.')
      return
    }
    mutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    })
  }
  return (
    <form
      aria-label="Alterar senha"
      noValidate
      onSubmit={submit}
      className="max-w-xl space-y-5 border-t border-border pt-8"
    >
      <h2 className="text-lg font-semibold">Alterar senha</h2>
      <InputField
        label="Senha atual"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        value={values.currentPassword}
        onChange={(event) =>
          setValues((previous) => ({
            ...previous,
            currentPassword: event.target.value,
          }))
        }
        error={errors.currentPassword}
      />
      <InputField
        label="Nova senha"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        maxLength={128}
        value={values.newPassword}
        onChange={(event) =>
          setValues((previous) => ({
            ...previous,
            newPassword: event.target.value,
          }))
        }
        error={errors.newPassword}
      />
      <InputField
        label="Confirmar nova senha"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        maxLength={128}
        value={values.confirmation}
        onChange={(event) =>
          setValues((previous) => ({
            ...previous,
            confirmation: event.target.value,
          }))
        }
        error={errors.confirmation}
      />
      <FormFeedback error={error} notice={notice} />
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Alterando senha…' : 'Alterar senha'}
      </Button>
    </form>
  )
}
