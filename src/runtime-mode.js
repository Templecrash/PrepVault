// The portable build adds this marker. It changes client presentation only;
// server-side authentication never trusts this value.
export function isLocalEdition() {
  return typeof document !== 'undefined' && document.querySelector('meta[name="prepvault-mode"]')?.content === 'local';
}

export const LIVE_APP_URL = 'https://prepvault-xi.vercel.app/';
