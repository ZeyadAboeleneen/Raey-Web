"use client"

/**
 * components/meta-pixel-button-tracker.tsx
 *
 * Site-wide button/link click tracking for Meta Pixel.
 *
 * A single delegated click listener, attached to `document` exactly once for
 * the life of the app (see the mount-once effect below), covers every button
 * and button-styled link on every page — no per-page or per-component
 * instrumentation needed.
 *
 * Every click fires the `ButtonClick` custom event with the EXACT control's
 * name (see `fbTrackInteraction` in lib/meta-pixel.ts) — never a category.
 * A short, fixed set of button texts additionally fire a genuine Meta
 * standard event (Contact, CustomizeProduct, …) alongside it; that mapping
 * lives in lib/meta-pixel.ts, not here.
 *
 * This never touches ViewContent / AddToCart / Purchase / InitiateCheckout —
 * those keep firing exactly as they do today, from their existing call sites.
 */

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { fbTrackInteraction, getPageName } from "@/lib/meta-pixel"

/** Staff-only surfaces — internal tool usage is not a customer signal. */
const EXCLUDED_PREFIXES = ["/admin", "/debug"]

/** Interactive elements this tracker considers "a button or link". */
const SELECTOR =
  'button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"]'

const MAX_NAME_LENGTH = 80

function collapse(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim()
}

/** Resolves the text of the element(s) an `aria-labelledby` points to. */
function resolveAriaLabelledBy(el: Element): string {
  const ids = el.getAttribute("aria-labelledby")
  if (!ids) return ""
  const text = ids
    .split(/\s+/)
    .map((id) => collapse(document.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(" ")
  return collapse(text)
}

/**
 * Names a clicked element, in priority order: aria-label, resolved
 * aria-labelledby, title, then visible text. A contained image's alt text is
 * a last resort, for an icon button whose only content is a labelled image.
 * Never falls back to a CSS class name or element id — those aren't names,
 * they're implementation details, and inventing one would be worse than not
 * tracking the click at all.
 */
function nameFor(el: Element): string {
  const aria = collapse(el.getAttribute("aria-label"))
  if (aria) return aria.slice(0, MAX_NAME_LENGTH)

  const labelledBy = resolveAriaLabelledBy(el)
  if (labelledBy) return labelledBy.slice(0, MAX_NAME_LENGTH)

  const title = collapse(el.getAttribute("title"))
  if (title) return title.slice(0, MAX_NAME_LENGTH)

  const text = collapse((el as HTMLElement).innerText ?? el.textContent)
  if (text) return text.slice(0, MAX_NAME_LENGTH)

  const img = el.querySelector("img[alt]")
  const alt = collapse(img?.getAttribute("alt"))
  if (alt) return alt.slice(0, MAX_NAME_LENGTH)

  return ""
}

function elementTypeFor(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (tag === "a" || el.getAttribute("role") === "link") return "link"
  if (tag === "input") return el.getAttribute("type") || "button"
  return "button"
}

/** href for links, verbatim — internal route or the site's own contact link, never user data. */
function destinationFor(el: Element): string {
  if (el.tagName.toLowerCase() === "a") {
    return el.getAttribute("href") || ""
  }
  return ""
}

function isDisabled(el: Element): boolean {
  if ((el as HTMLButtonElement).disabled) return true
  return el.getAttribute("aria-disabled") === "true"
}

export default function MetaPixelButtonTracker() {
  const pathname = usePathname()

  // The click handler reads the current path from a ref rather than being
  // re-created per navigation — the listener below is attached exactly once
  // for the app's lifetime; route changes just update what it reads.
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const currentPath = pathnameRef.current
      if (!currentPath || EXCLUDED_PREFIXES.some((p) => currentPath.startsWith(p))) return

      const target = event.target as Element | null
      if (!target) return

      const control = target.closest(SELECTOR)
      if (!control) return
      if (control.hasAttribute("data-fb-skip") || isDisabled(control)) return

      const name = nameFor(control)
      if (!name) {
        // An icon-only control with no accessible name at all. Per the
        // brief: never invent a name from a CSS class — report it for a
        // developer to add an aria-label, rather than sending junk to Meta.
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[MetaPixelButtonTracker] interactive element has no accessible name — not tracked. Add an aria-label.",
            control
          )
        }
        return
      }

      fbTrackInteraction({
        buttonName: name,
        pageName: getPageName(currentPath),
        pagePath: currentPath,
        elementType: elementTypeFor(control),
        destination: destinationFor(control),
      })
    }

    // Capture phase: the click is still reported even if a component's own
    // handler later calls stopPropagation — this tracker never calls
    // preventDefault/stopPropagation itself, so it can't interfere with
    // anything else that click triggers.
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
    // Mount once. `pathnameRef` (updated every render above) is how the
    // handler stays current — re-subscribing per navigation would mean a
    // brief window on every route change with either zero or two listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
