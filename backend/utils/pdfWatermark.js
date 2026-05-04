const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')
const https = require('https')
const http = require('http')

// In-memory cache to reduce repeated download + watermark work.
const SOURCE_CACHE_TTL_MS = 5 * 60 * 1000
const WATERMARK_CACHE_TTL_MS = 10 * 60 * 1000
const sourcePdfCache = new Map()
const watermarkedPdfCache = new Map()

const FIXED_LICENSE_TEXT = 'Licensed to: Maleesha udantha | 0714390924'
const CENTER_WATERMARK_TEXT = 'SCIENCE WITH MAEEESHA | SCIENCE WITH MAEEESHA | SCIENCE WITH MAEEESHA | SCIENCE WITH MAEEESHA |'
const WATERMARK_CACHE_VERSION = 'v18'

const normalizeGrade = (gradeValue) => {
  if (gradeValue == null) return ''
  const raw = String(gradeValue).trim()
  if (!raw) return ''

  const match = raw.match(/^grade\s*[:\-]?\s*(.+)$/i)
  if (match && match[1]) {
    return match[1].trim()
  }

  return raw
}

const getCachedEntry = (cache, key) => {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value
}

const setCachedEntry = (cache, key, value, ttlMs) => {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/**
 * Download a file from URL and return as buffer.
 * Cloudinary raw URLs frequently redirect (302), so we follow redirects.
 */
const downloadFile = (url, redirectCount = 0) => {
  const maxRedirects = 5

  return new Promise((resolve, reject) => {
    if (redirectCount > maxRedirects) {
      reject(new Error('Too many redirects while downloading file'))
      return
    }

    const protocol = url.startsWith('https') ? https : http
    const req = protocol.get(
      url,
      {
        headers: {
          'User-Agent': 'tuition-sir-backend/1.0',
          Accept: '*/*',
        },
      },
      (response) => {
        const status = response.statusCode || 0

        // Follow redirects
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume()
          const nextUrl = new URL(response.headers.location, url).toString()
          downloadFile(nextUrl, redirectCount + 1).then(resolve).catch(reject)
          return
        }

        if (status !== 200) {
          response.resume()
          reject(new Error(`Failed to download file (HTTP ${status})`))
          return
        }

        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve(Buffer.concat(chunks)))
      }
    )

    req.setTimeout(20000, () => {
      req.destroy(new Error('Download timed out'))
    })

    req.on('error', reject)
  })
}

/**
 * Add a single top student message + grade to PDF.
 * @param {Buffer|string} pdfSource - PDF buffer or URL
 * @param {{ name?: string, grade?: string|number }} studentInfo - Student details
 * @returns {Promise<Buffer>} Watermarked PDF as buffer
 */
async function addWatermarkToPdf(pdfSource, studentInfo = {}) {
  try {
    const studentName = String(studentInfo.name || 'Student').trim()
    const studentGrade = normalizeGrade(studentInfo.grade)
    const topMessage = `${studentName} can acess this document`
    const gradeMessage = studentGrade ? `Grade: ${studentGrade}` : ''

    const watermarkKey = `${WATERMARK_CACHE_VERSION}|${typeof pdfSource === 'string' ? pdfSource : 'buffer'}|${topMessage}|${gradeMessage}`
    const cachedWatermarked = getCachedEntry(watermarkedPdfCache, watermarkKey)
    if (cachedWatermarked) {
      return Buffer.from(cachedWatermarked)
    }

    // Download PDF if source is URL
    let pdfBuffer
    if (typeof pdfSource === 'string' && pdfSource.startsWith('http')) {
      const cachedSource = getCachedEntry(sourcePdfCache, pdfSource)
      if (cachedSource) {
        pdfBuffer = Buffer.from(cachedSource)
      } else {
        pdfBuffer = await downloadFile(pdfSource)
        setCachedEntry(sourcePdfCache, pdfSource, Buffer.from(pdfBuffer), SOURCE_CACHE_TTL_MS)
      }
    } else {
      pdfBuffer = pdfSource
    }

    // Load PDF and draw only the logged-in student watermark text.
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    const pages = pdfDoc.getPages()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const topFontSize = 11
    const centerFontSize = 16
    const footerFontSize = 12

    pages.forEach((page) => {
      const { width, height } = page.getSize()
      const topMessageWidth = font.widthOfTextAtSize(topMessage, topFontSize)
      const centerTextWidth = font.widthOfTextAtSize(CENTER_WATERMARK_TEXT, centerFontSize)
      const footerMessageWidth = font.widthOfTextAtSize(FIXED_LICENSE_TEXT, footerFontSize)

      if (gradeMessage) {
        const gradeWidth = font.widthOfTextAtSize(gradeMessage, topFontSize)
        page.drawText(gradeMessage, {
          x: (width - gradeWidth) / 2,
          y: height - 18,
          size: topFontSize,
          font,
          color: rgb(0.3, 0.3, 0.3),
          opacity: 0.85,
        })
      }

      page.drawText(topMessage, {
        x: (width - topMessageWidth) / 2,
        y: height - 34,
        size: topFontSize,
        font,
        color: rgb(0.3, 0.3, 0.3),
        opacity: 0.85,
      })

      for (let y = height - 70; y > 60; y -= 44) {
        const rowIndex = Math.floor((height - 70 - y) / 44)
        const xShift = rowIndex % 2 === 0 ? 0 : 28
        page.drawText(CENTER_WATERMARK_TEXT, {
          x: (width - centerTextWidth) / 2 - xShift,
          y,
          size: centerFontSize,
          font,
          color: rgb(0.35, 0.35, 0.35),
          opacity: 0.1,
        })
      }

      page.drawText(FIXED_LICENSE_TEXT, {
        x: (width - footerMessageWidth) / 2,
        y: 12,
        size: footerFontSize,
        font,
        color: rgb(0.35, 0.35, 0.35),
        opacity: 0.85,
      })
    })

    const watermarkedPdfBytes = await pdfDoc.save()
    const output = Buffer.from(watermarkedPdfBytes)
    setCachedEntry(watermarkedPdfCache, watermarkKey, Buffer.from(output), WATERMARK_CACHE_TTL_MS)
    return output
  } catch (error) {
    console.error('Watermark error:', error)
    // Preserve original message so route can decide 400 vs 500
    throw error
  }
}

module.exports = { addWatermarkToPdf }
