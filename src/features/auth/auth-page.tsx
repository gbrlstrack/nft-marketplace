import { useState, type FormEvent } from 'react'
import { Link, useRouter, useSearch } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import type { LoginRequest, RegisterRequest } from '@/contracts'
import { Button } from '@/components/ui/button'
import { getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { authenticate } from './session'
import { useSession } from './use-session'
import { safeReturnTo } from './return-to'

export function LoginPage() {
  return <AuthForm mode="login" />
}
export function RegisterPage() {
  return <AuthForm mode="register" />
}

function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter()
  const session = useSession()
  const search = useSearch({ strict: false }) as { returnTo?: string }
  const returnTo = safeReturnTo(search.returnTo)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)
  const register = mode === 'register'
  const mutation = useMutation({
    mutationKey: ['auth', mode],
    gcTime: 0,
    mutationFn: (values: LoginRequest | RegisterRequest) =>
      authenticate(mode, values),
    onSuccess: ({ accepted }) => {
      if (accepted) void router.navigate({ href: returnTo, replace: true })
    },
    onError: (error) => setFields(getFieldErrors(error)),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    const errors: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = 'Informe um e-mail válido.'
    if (!password) errors.password = 'Informe sua senha.'
    if (register) {
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(name))
        errors.name = 'Use de 3 a 24 letras, números ou sublinhado.'
      if (
        password.length < 8 ||
        !/[a-zA-Z]/.test(password) ||
        !/\d/.test(password)
      )
        errors.password = 'Use pelo menos 8 caracteres, com letra e número.'
      if (String(form.get('confirmPassword') || '') !== password)
        errors.confirmPassword = 'As senhas devem ser iguais.'
    }
    setFields(errors)
    mutation.reset()
    if (Object.keys(errors).length) {
      const first = event.currentTarget.elements.namedItem(
        Object.keys(errors)[0],
      )
      if (first instanceof HTMLElement) first.focus()
      return
    }
    mutation.mutate(register ? { name, email, password } : { email, password })
  }

  function input(
    label: string,
    name: string,
    type = 'text',
    autoComplete?: string,
  ) {
    return (
      <div>
        <label htmlFor={`auth-${name}`} className="mb-2 block text-sm">
          {label}
        </label>
        <input
          id={`auth-${name}`}
          name={name}
          type={type}
          autoComplete={autoComplete}
          aria-invalid={Boolean(fields[name])}
          aria-describedby={fields[name] ? `auth-${name}-error` : undefined}
          className="min-h-12 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm"
        />
        <p id={`auth-${name}-error`} className="mt-1 text-sm text-primary">
          {fields[name]}
        </p>
      </div>
    )
  }

  return (
    <section
      className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 sm:p-9"
      aria-labelledby="auth-heading"
    >
      <p className="mb-7 text-center text-2xl font-bold tracking-[0.15em]">
        KURIO
      </p>
      <h1 id="auth-heading" className="text-center text-xl font-bold">
        {register ? 'Criar perfil de colecionador' : 'Entre na sua conta'}
      </h1>
      {session.reason === 'expired' && (
        <p
          role="status"
          className="mt-5 rounded-lg border border-border p-3 text-sm"
        >
          Sua sessão expirou. Entre novamente para continuar.
        </p>
      )}
      <form
        aria-label={register ? 'Criar perfil' : 'Entrar'}
        noValidate
        onSubmit={submit}
        className="mt-8 space-y-5"
      >
        {register && input('Nome de usuário', 'name', 'text', 'username')}
        {input('E-mail', 'email', 'email', 'email')}
        <div className="relative">
          {input(
            'Senha',
            'password',
            showPassword ? 'text' : 'password',
            register ? 'new-password' : 'current-password',
          )}
          <button
            type="button"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={showPassword}
            className="absolute top-7 right-1 flex size-12 items-center justify-center text-muted-foreground"
            onClick={() => setShowPassword((shown) => !shown)}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {register &&
          input(
            'Confirmar senha',
            'confirmPassword',
            showPassword ? 'text' : 'password',
            'new-password',
          )}
        {mutation.isError && (
          <p
            role="alert"
            className="rounded-lg border border-primary/50 p-3 text-sm"
          >
            {getErrorMessage(
              mutation.error,
              'Não foi possível entrar. Verifique a conexão e tente novamente.',
            )}
          </p>
        )}
        <Button className="w-full" type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? 'Aguarde…'
            : register
              ? 'Criar perfil'
              : 'Entrar'}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        {register ? 'Já tem uma conta? ' : 'Ainda não tem uma conta? '}
        <Link
          to={register ? '/login' : '/register'}
          search={{ returnTo }}
          className="text-primary underline"
        >
          {register ? 'Entre' : 'Criar perfil'}
        </Link>
      </p>
      <Link
        to="/"
        className="mt-6 block text-center text-xs text-muted-foreground underline"
      >
        Voltar ao catálogo
      </Link>
    </section>
  )
}
