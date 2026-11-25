import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribe } from './store.js'

// Loads data with a store function and reloads it whenever the data changes.
// `key` lists the values the loader depends on (like a shop id or search text).
export function useData(loader, key = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const keyStr = JSON.stringify(key)
  const keyRef = useRef(keyStr)
  keyRef.current = keyStr

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

  // A quiet reload for pages that refresh themselves: the new data shows when it comes; a failed try keeps
  // what is on screen (a dropped connection must not blank the page or a half-typed note), and an answer
  // for an old filter (switched while it loaded) is dropped.
  const refresh = useCallback(() => {
    const askedFor = keyRef.current
    Promise.resolve()
      .then(() => loaderRef.current())
      .then(
        (data) => {
          if (keyRef.current === askedFor) setState({ data, error: null, loading: false })
        },
        () => {},
      )
  }, [])

  return { ...state, reload: run, refresh }
}
