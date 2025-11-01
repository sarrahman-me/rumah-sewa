/**
 * Placeholder server guard that mirrors legacy behavior; formatting only, no behavior changes.
 */
export async function requireValidSession(): Promise<{ accessToken: null }> {
  // For internal use only — do nothing on the server.
  return { accessToken: null };
}

/**
 * Retrieves the access token for server environments when available.
 */
export async function getAccessTokenOrNull(): Promise<string | null> {
  return null;
}
