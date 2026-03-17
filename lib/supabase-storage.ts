/**
 * Image upload helper — Supabase Storage removed.
 * Admin pages send images as base64 data URLs from the browser.
 * We upload them to Cloudinary and store the resulting URLs.
 * The `_folder` parameter is kept for API compatibility but unused.
 */
export const uploadImage = async (
  image: string,
  _folder: string
): Promise<string> => {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("token") || localStorage.getItem("authToken") || ""
      : ""

  const res = await fetch("/api/admin/upload-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ dataUrl: image }),
  })

  if (!res.ok) {
    let message = `Image upload failed (${res.status})`
    try {
      const data = await res.json()
      message = data?.error || message
    } catch {}
    throw new Error(message)
  }

  const data = await res.json()
  if (!data?.url) throw new Error("Image upload failed")
  return data.url
}
