/**
 * Server-only S3 helpers for temporary invoice uploads.
 * Objects are uploaded before async Textract analysis and deleted afterwards.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

function buildS3Client(): S3Client {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)')
  }
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } })
}

function makeSafeKey(fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 80)
  const rand = Math.random().toString(36).slice(2, 8)
  return `uploads/${Date.now()}-${rand}-${safe}`
}

export async function uploadToS3({
  bytes,
  contentType,
  fileName,
}: {
  bytes: Uint8Array
  contentType: string
  fileName: string
}): Promise<{ bucket: string; key: string }> {
  const bucket = process.env.AWS_S3_BUCKET
  if (!bucket) throw new Error('AWS_S3_BUCKET is not configured in .env.local')

  const client = buildS3Client()
  const key = makeSafeKey(fileName)

  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType })
  )
  console.log('[S3] uploaded:', key, `(${(bytes.length / 1024).toFixed(0)} KB)`)
  return { bucket, key }
}

export async function deleteFromS3(bucket: string, key: string): Promise<void> {
  try {
    const client = buildS3Client()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    console.log('[S3] deleted:', key)
  } catch (err) {
    // Non-fatal — log and move on. The object will expire via S3 lifecycle rules.
    console.warn('[S3] delete failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}
