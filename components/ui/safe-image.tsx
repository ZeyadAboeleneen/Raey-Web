import Image from "next/image"
import { useState } from "react"

interface SafeImageProps {
  src: string
  alt: string
  fill?: boolean
  width?: number
  height?: number
  className?: string
  priority?: boolean
  sizes?: string
  onError?: () => void
  onLoad?: () => void
  unoptimized?: boolean
}

export default function SafeImage({
  src,
  alt,
  fill = false,
  width,
  height,
  className = "",
  priority = false,
  sizes,
  onError,
  onLoad,
  unoptimized = false,
  ...props
}: SafeImageProps) {
  const [imageSrc, setImageSrc] = useState(src)
  const [hasError, setHasError] = useState(false)

  const handleError = () => {
    if (!hasError) {
      setHasError(true)
      setImageSrc("/placeholder.svg")
      onError?.()
    }
  }

  const handleLoad = () => {
    onLoad?.()
  }

  // Determine if we should use unoptimized
  const shouldUnoptimize = unoptimized || 
    imageSrc.startsWith('data:') || 
    imageSrc.startsWith('blob:') ||
    imageSrc.includes('base64')

  const imageProps = {
    src: imageSrc,
    alt,
    className,
    priority,
    sizes,
    onError: handleError,
    onLoad: handleLoad,
    unoptimized: shouldUnoptimize,
    ...props
  }

  if (fill) {
    return <Image {...imageProps} fill />
  }

  return (
    <Image
      {...imageProps}
      width={width || 400}
      height={height || 300}
    />
  )
}




