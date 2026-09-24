const REPLACEMENT = "REDACTED";

// GitHub tokens are long. Replacing a short needle (e.g. "s") would scramble
// error text: "itsme" → "it me", "https" → "http :".
const MIN_SECRET_LENGTH = 8;

export function redactSecrets(text: string, token: string) {
  const secrets = [
    token,
    encodeURIComponent(token),
    Buffer.from(`x-access-token:${token}`, "utf8").toString("base64"),
    `x-access-token:${token}`,
  ];

  let result = text;
  for (const secret of secrets) {
    if (secret.length < MIN_SECRET_LENGTH) {
      continue;
    }
    result = result.replaceAll(secret, REPLACEMENT);
  }
  return result;
}
