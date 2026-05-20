// Redimensiona e comprime imagem para upload como base64
// maxSize: dimensao maxima (largura ou altura) em pixels
// quality: qualidade JPEG 0-1
export default function resizeImage(file, maxSize = 256, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Formato de imagem invalido'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        // Redimensiona mantendo proporcao
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width)
            width = maxSize
          } else {
            width = Math.round((width * maxSize) / height)
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // Usa JPEG para fotos (menor), PNG se tinha transparencia
        const isPng = file.type === 'image/png' || file.type === 'image/svg+xml'
        const mimeType = isPng ? 'image/png' : 'image/jpeg'
        const dataUrl = canvas.toDataURL(mimeType, quality)

        resolve(dataUrl)
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
