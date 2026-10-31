// Product photos through Netlify's image service: resized to the size shown, sent as WebP and cached
// near the customer (Supabase sends them full size with "no-cache"). Allowed in netlify.toml [images].
// On this computer (localhost) there is no such service, so the original photo is used.
const LOCAL = typeof window !== 'undefined' && /^(localhost|127\.|\[::1\])/.test(window.location.hostname)

export function thumb(url, width = 400) {
  if (!url || LOCAL || /^(data:|blob:)/.test(url) || url.includes('/demo/')) return url
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${width}&fm=webp&q=75`
}
