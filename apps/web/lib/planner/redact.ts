/** Removes a secret and anything that looks like an API key from text. */
export function redactSecrets(text: string, secret?: string): string {
  let out = text;
  if (secret && secret.length >= 4) out = out.split(secret).join("[redacted]");
  return out.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]");
}
