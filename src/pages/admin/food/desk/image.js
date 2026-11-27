// Shrinks a phone photo before it is saved (same idea as the Jholzo website): resized to fit maxSize
// pixels, then JPEG at the best quality that stays under maxKB. Any camera photo size is fine.
export async function shrinkPhoto(file, maxSize = 1400, maxKB = 350) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo.')
  const url = URL.createObjectURL(file)
  try {
    const img = await open(file, url)
    let size = maxSize
    for (;;) {
      const canvas = draw(img, size)
      for (const quality of [0.82, 0.74, 0.66, 0.58, 0.5]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
        if (!blob) throw new Error('This photo could not be read. Please try another one.')
        if (blob.size / 1024 <= maxKB || (quality === 0.5 && size <= 480)) return blob
      }
      size = Math.round(size * 0.8)
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Some phones cannot open a very big photo as an <img>; createImageBitmap often still can.
async function open(file, url) {
  try {
    return await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('This photo could not be opened. Please try another one.'))
      el.src = url
    })
  } catch (err) {
    if (typeof createImageBitmap !== 'function') throw err
    return await createImageBitmap(file).catch(() => {
      throw err
    })
  }
}

function draw(img, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Could not read the photo.'))
    r.readAsDataURL(blob)
  })
