import { useState } from 'react'
import { thumb } from '../lib/img.js'

// A product photo, small and fast (src/lib/img.js). If the image service fails, the original photo is shown.
export default function FastImg({ src, width = 400, ...rest }) {
  const [failed, setFailed] = useState(false)
  const fast = failed ? src : thumb(src, width)
  return <img src={fast} decoding="async" onError={() => fast !== src && setFailed(true)} {...rest} />
}
