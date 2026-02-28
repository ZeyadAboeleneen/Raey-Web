/**
 * Image upload helper — Supabase Storage removed.
 * Admin pages send images as base64 data URLs from the browser.
 * We store them directly in the `images` JSON column of the products table.
 * The `_folder` parameter is kept for API compatibility but unused.
 */
export const uploadImage = async (
  image: string,
  _folder: string
): Promise<string> => {
  // Return the base64 data URL as-is; it will be stored in the DB JSON column.
  return image
}
