'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { META_PIXEL_ID, getPageName } from '@/lib/meta-pixel'

// ---------------------------------------------------------------------------
// Extend the global Window interface so TypeScript knows about `fbq`.
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    fbq: (...args: any[]) => void
    _fbq: (...args: any[]) => void
  }
}

// Module-scope, not component state: the last pathname a PageView was fired
// for. Guards the one case a per-render effect can't guard on its own — React
// re-invoking this same effect for the SAME pathname value (React 18 Strict
// Mode's dev-only mount→cleanup→mount, or a stray extra mount) — without
// suppressing a real navigation, which always changes the pathname.
let lastPageViewPath: string | null = null

/**
 * Fires PageView for `pathname`, retrying briefly if the pixel library hasn't
 * finished booting yet. Deliberately NOT tied to a React effect's cleanup: the
 * `lastPageViewPath` guard below is set before this is ever called, so a
 * Strict-Mode-style duplicate effect invocation simply never calls this a
 * second time for the same path — it doesn't need to race-cancel this one.
 * Tying retries to per-effect cleanup previously meant a Strict Mode
 * mount→cleanup→mount could cancel an in-flight retry and silently lose the
 * very first PageView.
 */
function firePageView(pathname: string, attempt = 0) {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', 'PageView', { page_name: getPageName(pathname), page_path: pathname })
  } else if (attempt < 30) {
    setTimeout(() => firePageView(pathname, attempt + 1), 100)
  }
}

/**
 * <MetaPixel />
 *
 * Drop this component once in the root layout. It:
 *   1. Loads the Meta Pixel SDK asynchronously (does NOT block rendering).
 *   2. Fires `PageView` — with `page_name`/`page_path` — once per page,
 *      covering both the initial load and every client-side route change.
 *   3. Guards against duplicate initialisation via the `_fbq` sentinel.
 *
 * There is exactly one place PageView is fired (this effect) — the inline
 * script below only boots the pixel library and never calls `track` itself,
 * so the two mechanisms that used to both fire an initial PageView can't
 * double up.
 */
export function MetaPixel() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || lastPageViewPath === pathname) return
    lastPageViewPath = pathname
    firePageView(pathname)
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
