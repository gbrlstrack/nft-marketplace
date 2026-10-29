import { isAxiosError } from 'axios'
import type { ApiError, ApiErrorResponse } from '@/contracts'

export function getApiError(error: unknown): ApiError | undefined {
  if (!isAxiosError<ApiErrorResponse>(error)) return undefined
  const apiError = error.response?.data?.error
  return apiError &&
    typeof apiError.code === 'string' &&
    typeof apiError.message === 'string'
    ? apiError
    : undefined
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return getApiError(error)?.message || fallback
}

export function getFieldErrors(error: unknown): Record<string, string> {
  const apiError = getApiError(error)
  if (apiError?.code === 'validation') return apiError.fields
  if (apiError?.code === 'account-conflict')
    return { [apiError.field]: apiError.message }
  return {}
}
