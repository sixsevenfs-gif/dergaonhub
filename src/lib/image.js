// Shrinks a photo from the phone camera before saving it, so pages stay light on slow networks.
// In demo mode photos are stored in the browser, so they are kept small (about 30 to 80 KB).
export async function compressImage(file, maxSize = 600, quality = 0.75) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo (image file).')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('This photo could not be opened. Please try another one.'))
      el.src = url
    })
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}
