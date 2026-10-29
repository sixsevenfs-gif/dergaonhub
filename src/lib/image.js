// Shrinks a photo from the phone camera before saving it, so storage stays small and pages load fast
// on slow networks. Any size can be picked (a 15 MB camera photo is fine): it is resized to fit
// maxSize pixels, then saved as JPEG at the best quality that still fits under maxKB.
export async function compressImage(file, maxSize = 600, maxKB = 60) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo (image file).')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('This photo could not be opened. Please try another one.'))
      el.src = url
    })
    let size = maxSize
    for (;;) {
      const canvas = draw(img, size)
      // Step the quality down until the photo fits; below 0.45 it gets blotchy, so shrink instead.
      for (const quality of [0.8, 0.72, 0.64, 0.56, 0.5, 0.45]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (dataUrlKB(dataUrl) <= maxKB || (quality === 0.45 && size <= 320)) return dataUrl
      }
      size = Math.round(size * 0.8)
    }
  } finally {
    URL.revokeObjectURL(url)
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

// Size in KB of the file a data: URL holds (base64 is 4 characters per 3 bytes).
const dataUrlKB = (dataUrl) => ((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4 / 1024
