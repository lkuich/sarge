export const sha256Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const tokenMatchesHash = async (token: string | undefined, expectedHash: string | null | undefined) => {
  if (!token || !expectedHash) return false;

  return (await sha256Hex(token)) === expectedHash;
};
