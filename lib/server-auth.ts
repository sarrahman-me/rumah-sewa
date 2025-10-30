export async function requireValidSession(): Promise<{ accessToken: null }> {
  // For internal use only — do nothing on the server.
  return { accessToken: null };
}

export async function getAccessTokenOrNull(): Promise<string | null> {
  return null;
}
