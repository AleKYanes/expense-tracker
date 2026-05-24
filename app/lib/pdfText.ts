/**
 * Server-only PDF text extractor.
 *
 * Uses pdf-parse v1.1.1, which wraps pdfjs-dist v2.x and runs the PDF parser
 * fully in-process (Node.js fake-worker — no separate worker file required).
 *
 * This module must never be imported in client components or Edge runtime code.
 * The parent route declares `export const runtime = 'nodejs'` to enforce this.
 */

export async function extractPdfText(bytes: Uint8Array | Buffer): Promise<string> {
  // Dynamic import keeps pdf-parse out of the SSR/edge bundle.
  // next.config.ts lists it in serverExternalPackages so Turbopack resolves
  // it via native Node require rather than trying to bundle it as a chunk.
  const pdfParse = (await import('pdf-parse')).default as (
    data: Buffer,
    options?: { max?: number }
  ) => Promise<{ text: string; numpages: number }>

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  const result = await pdfParse(buf, { max: 0 }) // max:0 = all pages
  return result.text ?? ''
}
