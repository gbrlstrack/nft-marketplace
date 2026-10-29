import { useId, type ComponentProps, type ReactNode } from 'react'

export const fieldClassName =
  'mt-2 min-h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60'

type InputFieldProps = ComponentProps<'input'> & {
  label: string
  error?: string
}
export function InputField({
  label,
  error,
  id,
  required,
  className,
  ...props
}: InputFieldProps) {
  const generatedId = useId()
  const fieldId = id || generatedId
  return (
    <div className="min-w-0">
      <label htmlFor={fieldId} className="block text-sm">
        {label}
        {required && (
          <span className="ml-1 text-primary" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        {...props}
        id={fieldId}
        required={required}
        className={`${fieldClassName} ${className || ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : undefined}
      />
      {error && (
        <p id={`${fieldId}-error`} className="mt-2 text-xs text-primary">
          {error}
        </p>
      )}
    </div>
  )
}

export function SelectField({
  label,
  error,
  id,
  children,
  required,
  ...props
}: ComponentProps<'select'> & {
  label: string
  error?: string
  children: ReactNode
}) {
  const generatedId = useId()
  const fieldId = id || generatedId
  return (
    <div className="min-w-0">
      <label htmlFor={fieldId} className="block text-sm">
        {label}
        {required && (
          <span className="ml-1 text-primary" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <select
        {...props}
        id={fieldId}
        required={required}
        className={fieldClassName}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : undefined}
      >
        {children}
      </select>
      {error && (
        <p id={`${fieldId}-error`} className="mt-2 text-xs text-primary">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextareaField({
  label,
  error,
  id,
  ...props
}: ComponentProps<'textarea'> & { label: string; error?: string }) {
  const generatedId = useId()
  const fieldId = id || generatedId
  return (
    <div className="min-w-0">
      <label htmlFor={fieldId} className="block text-sm">
        {label}
      </label>
      <textarea
        {...props}
        id={fieldId}
        className={`${fieldClassName} min-h-24 resize-y`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : undefined}
      />
      {error && (
        <p id={`${fieldId}-error`} className="mt-2 text-xs text-primary">
          {error}
        </p>
      )}
    </div>
  )
}

export function FormFeedback({
  error,
  notice,
}: {
  error?: string
  notice?: string
}) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-primary/50 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
    </>
  )
}
