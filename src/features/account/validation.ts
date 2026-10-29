export const validEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
export const validEns = (value: string) =>
  /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.eth$/i.test(value)
export const validAddress = (value: string) => /^0x[a-f0-9]{40}$/i.test(value)
export const validPassword = (value: string) =>
  value.length >= 8 && /[a-z]/i.test(value) && /\d/.test(value)
