const mysql = require("mysql2/promise")
const path = require("path")
const fs = require("fs")
const { v2: cloudinary } = require("cloudinary")

function readEnvFileValue(filePath, key) {
  if (!fs.existsSync(filePath)) return undefined
  const envContent = fs.readFileSync(filePath, "utf8")
  const match = envContent.match(new RegExp(`^${key}=["']?([^"'\n]+)["']?`, "m"))
  return match ? match[1] : undefined
}

function getRequiredEnv(key) {
  return (
    process.env[key] ||
    readEnvFileValue(path.join(__dirname, "..", ".env.local"), key) ||
    readEnvFileValue(path.join(__dirname, "..", ".env"), key)
  )
}

function parseMysqlUrl(dbUrl) {
  // Expected: mysql://user:pass@host:port/dbname
  const urlPattern = /mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/
  const parts = dbUrl.match(urlPattern)
  if (!parts) {
    throw new Error("Could not parse DATABASE_URL. Expected mysql://user:pass@host:port/dbname")
  }

  const [, user, password, host, port, database] = parts
  return { host, port: Number(port), user, password, database }
}

function isProbablyCloudinaryUrl(url) {
  return typeof url === "string" && url.includes("res.cloudinary.com")
}

function isDataUrl(str) {
  return typeof str === "string" && str.startsWith("data:")
}

function dataUrlToBuffer(dataUrl) {
  // data:[<mime>][;base64],<data>
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1) throw new Error("Invalid data URL")
  const meta = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  const isBase64 = meta.toLowerCase().includes(";base64")
  return Buffer.from(payload, isBase64 ? "base64" : "utf8")
}

function looksLikeBase64(str) {
  // Very loose check; avoids treating http(s) as base64.
  if (typeof str !== "string") return false
  if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("/")) return false
  return /^[A-Za-z0-9+/=\r\n]+$/.test(str) && str.length > 200
}

async function uploadToCloudinary({ buffer, publicId }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
        public_id: publicId,
        overwrite: false,
        resource_type: "image",
      },
      (err, result) => {
        if (err) return reject(err)
        resolve(result)
      }
    )

    stream.end(buffer)
  })
}

async function main() {
  const dbUrl = getRequiredEnv("DATABASE_URL")
  if (!dbUrl) {
    console.error("❌ DATABASE_URL not found in environment, .env.local, or .env")
    process.exit(1)
  }

  const cloudName = getRequiredEnv("CLOUDINARY_CLOUD_NAME")
  const apiKey = getRequiredEnv("CLOUDINARY_API_KEY")
  const apiSecret = getRequiredEnv("CLOUDINARY_API_SECRET")

  if (!cloudName || !apiKey || !apiSecret) {
    console.error("❌ Missing Cloudinary env vars. Required:")
    console.error("- CLOUDINARY_CLOUD_NAME")
    console.error("- CLOUDINARY_API_KEY")
    console.error("- CLOUDINARY_API_SECRET")
    process.exit(1)
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret })

  const mysqlConfig = parseMysqlUrl(dbUrl)

  const DRY_RUN = process.argv.includes("--dry-run")
  const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="))
  const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : undefined

  const connection = await mysql.createConnection({
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    database: mysqlConfig.database,
    multipleStatements: false,
  })

  try {
    console.log("✅ Connected to MySQL")
    console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`)

    // We migrate base64/data URLs in the JSON 'images' column.
    // Also, if you added 'image_url', we'll set it to the first migrated image.
    let sql = `SELECT product_id, images, image_url FROM products`
    if (LIMIT && Number.isFinite(LIMIT) && LIMIT > 0) {
      sql += ` LIMIT ${Math.floor(LIMIT)}`
    }

    const [rows] = await connection.execute(sql)

    let scanned = 0
    let skipped = 0
    let migrated = 0
    let failed = 0

    for (const row of rows) {
      scanned++
      const productId = row.product_id

      if (row.image_url && typeof row.image_url === "string" && row.image_url.trim() !== "") {
        skipped++
        continue
      }

      let images = row.images
      try {
        if (typeof images === "string") {
          // Could be JSON string depending on driver/table definition.
          images = JSON.parse(images)
        }
      } catch {
        // If it isn't valid JSON, treat as empty.
        images = []
      }

      if (!Array.isArray(images) || images.length === 0) {
        skipped++
        continue
      }

      // Only migrate entries that are base64/data-url and not already cloudinary/http.
      const newImages = [...images]
      let changed = false
      let firstSecureUrl = null

      for (let i = 0; i < images.length; i++) {
        const img = images[i]

        if (typeof img !== "string" || img.trim() === "") continue
        if (img.startsWith("http://") || img.startsWith("https://") || img.startsWith("/")) {
          if (!firstSecureUrl && img.startsWith("https://")) firstSecureUrl = img
          continue
        }
        if (isProbablyCloudinaryUrl(img)) {
          if (!firstSecureUrl) firstSecureUrl = img
          continue
        }

        let buffer
        try {
          if (isDataUrl(img)) buffer = dataUrlToBuffer(img)
          else if (looksLikeBase64(img)) buffer = Buffer.from(img, "base64")
          else continue
        } catch (e) {
          console.error(`❌ [${productId}] Could not decode image[${i}]`, e?.message || e)
          continue
        }

        // Prevent duplicate uploads by using deterministic public id.
        // overwrite=false means if it already exists, cloudinary throws; we catch and fallback to default upload.
        const publicId = `${productId}-${i}`

        try {
          if (DRY_RUN) {
            console.log(`DRY RUN: would upload ${productId} image[${i}] (${Math.round(buffer.length / 1024)}KB)`) 
            continue
          }

          const result = await uploadToCloudinary({ buffer, publicId })
          const secureUrl = result && result.secure_url
          if (!secureUrl) throw new Error("Cloudinary upload returned no secure_url")

          newImages[i] = secureUrl
          if (!firstSecureUrl) firstSecureUrl = secureUrl
          changed = true

          console.log(`✅ [${productId}] migrated image[${i}] -> ${secureUrl}`)
        } catch (err) {
          // If overwrite=false caused a conflict or any error occurred, try uploading with a unique id to continue.
          try {
            if (DRY_RUN) continue
            const retryResult = await new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                {
                  folder: "products",
                  public_id: `${productId}-${i}-${Date.now()}`,
                  overwrite: false,
                  resource_type: "image",
                },
                (e, r) => (e ? reject(e) : resolve(r))
              )
              stream.end(buffer)
            })

            const secureUrl = retryResult && retryResult.secure_url
            if (!secureUrl) throw new Error("Cloudinary upload retry returned no secure_url")

            newImages[i] = secureUrl
            if (!firstSecureUrl) firstSecureUrl = secureUrl
            changed = true

            console.log(`✅ [${productId}] migrated image[${i}] (retry) -> ${secureUrl}`)
          } catch (retryErr) {
            failed++
            console.error(`❌ [${productId}] upload failed for image[${i}]`, retryErr?.message || retryErr)
          }
        }
      }

      if (!changed) {
        skipped++
        continue
      }

      migrated++

      if (!DRY_RUN) {
        // Update images JSON + first image_url for faster list views.
        await connection.execute(
          "UPDATE products SET images = ?, image_url = ? WHERE product_id = ? AND (image_url IS NULL OR image_url = '')",
          [JSON.stringify(newImages), firstSecureUrl, productId]
        )
      }
    }

    console.log("\n=== Migration summary ===")
    console.log(`Scanned:   ${scanned}`)
    console.log(`Skipped:   ${skipped}`)
    console.log(`Migrated:  ${migrated}`)
    console.log(`Failed:    ${failed}`)

    if (DRY_RUN) {
      console.log("\nDRY RUN complete. No DB writes were made.")
    }
  } finally {
    await connection.end()
  }
}

main().catch((err) => {
  console.error("❌ Migration script crashed:", err)
  process.exit(1)
})
