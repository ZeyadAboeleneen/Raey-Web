'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { META_PIXEL_ID } from '@/lib/meta-pixel'

// ---------------------------------------------------------------------------
// Extend the global Window interface so TypeScript knows about `fbq`.
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    fbq: (...args: any[]) => void
    _fbq: (...args: any[]) => void
  }
}

/**
 * <MetaPixel />
 *
 * Drop this component once in the root layout.  It:
 *   1. Loads the Meta Pixel SDK asynchronously (does NOT block rendering).
 *   2. Fires an initial `PageView` event.
 *   3. Re-fires `PageView` on every client-side route change (Next.js SPA nav).
 *   4. Guards against duplicate initialisation via the `_fbq` sentinel.
 */
export function MetaPixel() {
  const pathname = usePathname()

  // Re-fire PageView on every SPA route change
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'PageView')
    }
  }, [pathname])

  return (
    <>
      {/* ── Meta Pixel base code (async, non-blocking) ── */}
      <Script
        id="meta-pixel-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `,
        }}
      />
    </>
  )
}

/**
 * <MetaPixelNoscript />
 *
 * Renders the 1×1 tracking pixel image for users with JavaScript disabled.
 * Place this inside <body> (or inside the root layout's <body>).
 */
export function MetaPixelNoscript() {
  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: 'none' }}
        src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  )
}
