/**
 * lib/ai/try-on-prompt.ts
 *
 * The transformation instruction sent alongside the two reference images.
 *
 * Design intent — the failure mode we are engineering against is the model
 * generating *a* bride in *a* similar gown. Two identities must survive the
 * transformation intact: the shopper's face/body, and the exact RAEY garment,
 * which is a real commercial product a customer will later see in person.
 *
 * Kept in its own module so prompt iteration never touches transport code.
 */

export const TRYON_PROMPT_VERSION = "v1.0"

export interface TryOnPromptContext {
  /** Official product name, e.g. "R1249". Grounds the model on a specific gown. */
  dressName?: string | null
  /** Collection label, e.g. "wedding". */
  collection?: string | null
}

export function buildTryOnPrompt(ctx: TryOnPromptContext = {}): string {
  const garment =
    ctx.collection && ctx.collection.toLowerCase().includes("wedding")
      ? "wedding dress"
      : "gown"

  const named = ctx.dressName ? ` (reference: "${ctx.dressName}")` : ""

  return `IMAGE 1 is the PERSON. IMAGE 2 is the RAEY ${garment}${named}.

Use IMAGE 1 as the primary identity and body reference, and IMAGE 2 as the exact clothing reference. Create a photorealistic fashion visualization of the SAME PERSON from IMAGE 1 wearing the SAME RAEY ${garment} from IMAGE 2.

PRESERVE FROM IMAGE 1 (the person):
- facial identity and face shape
- skin tone
- hairstyle and hair color
- body proportions and height appearance
- pose, wherever the garment allows it
- hands and legs
- overall physical appearance

REPRODUCE FROM IMAGE 2 (the garment) — replace ONLY the clothing:
- silhouette
- neckline
- sleeves
- bodice
- waist placement
- skirt structure
- fabric and texture
- embroidery, lace and beading
- train
- color
- proportions and construction details

DO NOT:
- redesign the ${garment}
- invent additional embellishments
- simplify the ${garment}
- substitute a similar-looking design
- create a different person or alter facial features beyond what is needed to integrate the image naturally
- add extra people
- add jewelry, veil, accessories, makeup, tattoos or other styling that is not already present in IMAGE 1

The result must read as a professionally photographed bridal fashion portrait of this exact person actually wearing this exact RAEY gown. Maintain realistic fabric behaviour, natural folds, correct garment-to-body alignment, realistic shadows and lighting, and physically plausible proportions. Keep the composition as close as possible to IMAGE 1.

Output a single photorealistic, premium image suitable for a luxury bridal fashion website.`
}
