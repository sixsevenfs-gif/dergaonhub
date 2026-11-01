// Product photos through the host's image service: resized to the size shown, sent as WebP and cached
// near the customer (Supabase sends them full size with "no-cache").
// Netlify: allowed in netlify.toml [images]. Cloudflare: Images → Transformations switched on for
// jholzo.com, with the Supabase address allowed as a source. If the service is off, FastImg falls back
// to the original photo. On this computer (localhost) there is no such service, so the original is used.
/* global __IMAGE_HOST__ */
const LOCAL = typeof window !== 'undefined' && /^(localhost|127\.|\[::1\])/.test(window.location.hostname)

export function thumb(url, width = 400) {
  if (!url || LOCAL || /^(data:|blob:)/.test(url) || url.includes('/demo/')) return url
  if (__IMAGE_HOST__ === 'cloudflare') return `/cdn-cgi/image/width=${width},format=auto,quality=75/${url}`
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${width}&fm=webp&q=75`
}
