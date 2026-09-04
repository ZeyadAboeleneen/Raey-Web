/**
 * lib/ai/stylist/attribute-types.ts
 *
 * Shape of one catalogued gown in the attribute index.
 * Split from the tagger and the index so both can import it without a cycle.
 */

import type {
  Color,
  Embellishment,
  Neckline,
  Silhouette,
  Sleeve,
  Style,
  Train,
  Volume,
} from "./vocabulary"

/** Bump when the vocabulary or tagging prompt changes; stale rows re-tag. */
export const ATTRIBUTE_INDEX_VERSION = 2

export interface DressAttributes {
  productId: string
  /** Image these attributes were read from — re-tag when the photo changes. */
  imageUrl: string
  silhouette: Silhouette[]
  neckline: Neckline[]
  sleeves: Sleeve[]
  embellishment: Embellishment[]
  style: Style[]
  color: Color[]
  volume: Volume | null
  train: Train | null
  /**
   * A plain-language description of the gown, read from its photograph at
   * tagging time. The structured fields above are what the matcher filters and
   * ranks on; this is what lets the stylist answer the long tail of questions
   * no fixed vocabulary anticipates — "is there a slit?", "would this work with
   * a hijab?", "are those feathers or fringe?" — without going back to the
   * image at request time.
   */
  description: string
  /** 0-1, from the tagger. Low-confidence rows are ranked down, not dropped. */
  confidence: number
  taggedAt: number
  version: number
}
