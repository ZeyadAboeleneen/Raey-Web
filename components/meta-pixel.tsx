'use client'

import Script from 'next/script'
import { META_PIXEL_ID } from '@/lib/meta-pixel'

/**
 * MetaPixel Component
 * 
 * Loads the Meta (Facebook) Pixel base code on the client side.
 * - Uses next/script with `afterInteractive` strategy for non-blocking async loading
 * - Initializes the pixel and fires PageView exactly once via the inline script
 * - Includes a deduplication guard to prevent double-init (React Strict Mode)
 * - Includes noscript fallback as raw HTML to avoid Next.js preloading the image
 * - The pixel persists across client-side route changes (no duplication)
 * - Safe for SSR: only runs on the client
 * 
 * Place this component once in the root layout.
 */
export function MetaPixel() {
  return (
    <>
      {/* Meta Pixel Base Code — loaded async, non-blocking */}
      <Script
        id="meta-pixel-base"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            if (!window.__META_PIXEL_LOADED) {
              window.__META_PIXEL_LOADED = true;
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
            }
          `,
        }}
      />
      {/* noscript fallback — raw HTML to prevent Next.js from preloading the image */}
      <noscript
        dangerouslySetInnerHTML={{
          __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1" alt="" />`,
        }}
      />
    </>
  )
}
