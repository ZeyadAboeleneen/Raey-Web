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
export const ATTRIBUTE_INDEX_VERSION = 1

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
  /** 0-1, from the tagger. Low-confidence rows are ranked down, not dropped. */
  confidence: number
  taggedAt: number
  version: number
}
