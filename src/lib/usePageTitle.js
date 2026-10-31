import { useEffect } from 'react'

const HOME_TITLE = 'Jholzo – Online Grocery Delivery in Dergaon'

// Browser tab title and canonical address for one page (Google shows these); back to the home ones on leaving.
export function usePageTitle(title, path) {
  useEffect(() => {
    document.title = title ? `${title} | Jholzo` : HOME_TITLE
    const canonical = document.querySelector('link[rel="canonical"]')
    canonical?.setAttribute('href', `https://jholzo.com${path ?? '/'}`)
    return () => {
      document.title = HOME_TITLE
      canonical?.setAttribute('href', 'https://jholzo.com/')
    }
  }, [title, path])
}
