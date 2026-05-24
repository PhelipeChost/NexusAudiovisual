// src/components/VideoPlayer.jsx — embed player for Google Drive, YouTube, Vimeo links
import theme from '../styles/theme'

function extractVideoEmbed(url) {
  if (!url) return null
  const trimmed = url.trim()

  // YouTube
  const ytMatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return { type: 'youtube', id: ytMatch[1], src: `https://www.youtube.com/embed/${ytMatch[1]}?rel=0` }

  // Vimeo
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeoMatch) return { type: 'vimeo', id: vimeoMatch[1], src: `https://player.vimeo.com/video/${vimeoMatch[1]}` }

  // Google Drive (file link or share link)
  const driveMatch = trimmed.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/)
  if (driveMatch) return { type: 'drive', id: driveMatch[1], src: `https://drive.google.com/file/d/${driveMatch[1]}/preview` }

  return null
}

export default function VideoPlayer({ url, height = 360 }) {
  const embed = extractVideoEmbed(url)
  if (!embed) return null

  return (
    <div style={{
      width: '100%',
      borderRadius: 10,
      overflow: 'hidden',
      border: `1px solid ${theme.colors.border}`,
      background: '#000',
    }}>
      <iframe
        src={embed.src}
        width="100%"
        height={height}
        style={{ border: 'none', display: 'block' }}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

export { extractVideoEmbed }
