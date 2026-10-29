import type {
  ApiError,
  Profile,
  UpdateProfileRequest,
  WalletWriteRequest,
} from '../../contracts'
import type { AccountDatabase } from './database'

export class ApiFault extends Error {
  constructor(
    readonly status: number,
    readonly detail: ApiError,
  ) {
    super(detail.message)
  }
}

export function invalid(fields: Record<string, string>): never {
  throw new ApiFault(422, {
    code: 'validation',
    message: 'Confira os campos informados.',
    fields,
  })
}

export function text(body: Record<string, unknown>, field: string): string {
  return typeof body[field] === 'string' ? body[field].trim() : ''
}

export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json()
    if (typeof body === 'object' && body !== null && !Array.isArray(body))
      return body as Record<string, unknown>
  } catch {
    // The API returns a typed validation response for malformed JSON as well.
  }
  return invalid({ body: 'Envie um objeto JSON válido.' })
}

export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function validPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 128 &&
    /[a-zA-Z]/.test(value) &&
    /\d/.test(value)
  )
}

export function validUsername(value: string): boolean {
  return /^[a-zA-Z0-9_]{3,24}$/.test(value)
}

export function validEns(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.eth$/i.test(value)
}

export function assertUnique(
  database: AccountDatabase,
  email: string,
  username: string,
  currentId?: string,
): void {
  if (
    database.users.some(
      ({ profile }) =>
        profile.id !== currentId &&
        profile.email.toLowerCase() === email.toLowerCase(),
    )
  ) {
    throw new ApiFault(409, {
      code: 'account-conflict',
      field: 'email',
      message: 'Este e-mail já está cadastrado.',
    })
  }
  if (
    database.users.some(
      ({ profile }) =>
        profile.id !== currentId &&
        profile.username.toLowerCase() === username.toLowerCase(),
    )
  )
    invalid({ username: 'Este nome de usuário já está em uso.' })
}

export function profileInput(
  body: Record<string, unknown>,
  database: AccountDatabase,
  current: Profile,
): UpdateProfileRequest {
  const input = {
    name: text(body, 'name'),
    email: text(body, 'email').toLowerCase(),
    username: text(body, 'username'),
    ensName: text(body, 'ensName'),
    walletAlias: text(body, 'walletAlias'),
    bio: text(body, 'bio'),
  }
  const fields: Record<string, string> = {}
  if (input.name.length < 2 || input.name.length > 80)
    fields.name = 'Informe um nome de 2 a 80 caracteres.'
  if (!validEmail(input.email)) fields.email = 'Informe um e-mail válido.'
  if (!validUsername(input.username))
    fields.username = 'Use de 3 a 24 letras, números ou sublinhado.'
  if (!validEns(input.ensName))
    fields.ensName = 'Informe um nome ENS no formato nome.eth.'
  if (input.walletAlias.length < 2 || input.walletAlias.length > 60)
    fields.walletAlias = 'Informe um apelido de 2 a 60 caracteres.'
  if (input.bio.length > 500) fields.bio = 'Use até 500 caracteres.'
  if (Object.keys(fields).length) invalid(fields)
  assertUnique(database, input.email, input.username, current.id)
  return input
}

export function walletInput(body: Record<string, unknown>): WalletWriteRequest {
  const fields: Record<string, string> = {}
  const input = {
    label: text(body, 'label'),
    displayName: text(body, 'displayName'),
    profileName: text(body, 'profileName'),
    provider: text(body, 'provider') as WalletWriteRequest['provider'],
    email: text(body, 'email').toLowerCase(),
    ensName: text(body, 'ensName'),
    referralCode: text(body, 'referralCode'),
    secondaryAddress: text(body, 'secondaryAddress'),
    address: text(body, 'address'),
    network: text(body, 'network') as WalletWriteRequest['network'],
    role: text(body, 'role') as WalletWriteRequest['role'],
  }
  for (const key of [
    'label',
    'displayName',
    'profileName',
    'referralCode',
  ] as const)
    if (input[key].length < 2 || input[key].length > 80)
      fields[key] = 'Use de 2 a 80 caracteres.'
  if (!validEmail(input.email)) fields.email = 'Informe um e-mail válido.'
  if (!validEns(input.ensName))
    fields.ensName = 'Informe um nome ENS no formato nome.eth.'
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.address))
    fields.address = 'Use um endereço 0x seguido de 40 caracteres hexadecimais.'
  if (
    input.secondaryAddress &&
    !/^0x[a-fA-F0-9]{40}$/.test(input.secondaryAddress) &&
    !validEns(input.secondaryAddress)
  )
    fields.secondaryAddress = 'Informe um endereço 0x válido ou nome.eth.'
  if (!['metamask', 'walletconnect', 'coinbase'].includes(input.provider))
    fields.provider = 'Selecione um tipo de carteira.'
  if (!['ethereum', 'sepolia'].includes(input.network))
    fields.network = 'Selecione uma rede disponível.'
  if (!['primary', 'secondary'].includes(input.role))
    fields.role = 'Selecione principal ou secundária.'
  if (Object.keys(fields).length) invalid(fields)
  return input
}

export async function validateAvatar(dataUrl: unknown): Promise<string> {
  if (typeof dataUrl !== 'string' || dataUrl.length > 710_000)
    return invalid({
      dataUrl: 'Envie uma imagem PNG, JPEG ou WebP de até 512 KB.',
    })
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      dataUrl,
    )
  if (!match) return invalid({ dataUrl: 'Use uma imagem PNG, JPEG ou WebP.' })
  let bytes: Uint8Array<ArrayBuffer>
  try {
    const binary = atob(match[2])
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return invalid({ dataUrl: 'O conteúdo da imagem é inválido.' })
  }
  if (bytes.length > 512 * 1024 || bytes.length < 12)
    return invalid({
      dataUrl: 'A imagem deve ter até 512 KB e conteúdo válido.',
    })
  const signature = (offset: number, expected: number[]) =>
    expected.every((value, index) => bytes[offset + index] === value)
  const valid =
    match[1] === 'image/png'
      ? signature(0, [137, 80, 78, 71, 13, 10, 26, 10])
      : match[1] === 'image/jpeg'
        ? signature(0, [255, 216, 255])
        : signature(0, [82, 73, 70, 70]) && signature(8, [87, 69, 66, 80])
  if (!valid)
    return invalid({
      dataUrl: 'O conteúdo não corresponde ao formato informado.',
    })
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: match[1] }),
      )
      const validSize =
        bitmap.width > 0 &&
        bitmap.height > 0 &&
        bitmap.width <= 4096 &&
        bitmap.height <= 4096
      bitmap.close()
      if (!validSize)
        return invalid({ dataUrl: 'Use uma imagem de até 4096 × 4096 pixels.' })
    } catch {
      return invalid({ dataUrl: 'Não foi possível decodificar a imagem.' })
    }
  }
  return dataUrl
}
