import crypto from "crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomString(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function generateExecutionId(): string {
  return `exec_${randomString(8)}`;
}

export function generateWebhookSlug(): string {
  return `wf_${randomString(8)}`;
}
