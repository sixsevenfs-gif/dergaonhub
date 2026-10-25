import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribe } from './store.js'

// Loads data with a store function and reloads it whenever the data changes.
// `key` lists the values the loader depends on (like a shop id or search text).
export function useData(loader, key = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const keyStr = JSON.stringify(key)

  const run = useCallback(() => {
    Promise.resolve()
      .then(() => loaderRef.current())
      .then(
        (data) => setState({ data, error: null, loading: false }),
        (error) => setState({ data: undefined, error, loading: false }),
      )
  }, [])

  useEffect(() => {
    run()
    return subscribe(run)
  }, [run, keyStr])

  return { ...state, reload: run }
}
