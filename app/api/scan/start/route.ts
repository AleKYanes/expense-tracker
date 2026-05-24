export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { uploadToS3 } from '@/app/lib/awsS3'
import { startExpenseAnalysisFromS3 } from '@/app/lib/textractAsync'

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  if (!process.env.AWS_S3_BUCKET) {
    return Response.json(
      {
        error: 'Async scanning requires an S3 bucket. Add AWS_S3_BUCKET to .env.local.',
        code: 'MissingS3Bucket',
      },
      { status: 500 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Could not parse the request.', code: 'BadRequest' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'No file provided.', code: 'MissingFile' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: 'Unsupported file type.', code: 'UnsupportedType' }, { status: 400 })
  }
  if (file.size === 0) {
    return Response.json({ error: 'File is empty.', code: 'EmptyFile' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 10 MB).`, code: 'FileTooLarge' },
      { status: 400 }
    )
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return Response.json({ error: 'Could not read the file.', code: 'ReadError' }, { status: 400 })
  }

  try {
    const { bucket, key } = await uploadToS3({ bytes, contentType: file.type, fileName: file.name })
    console.log('[scan/start] uploaded to S3:', key)

    const jobId = await startExpenseAnalysisFromS3({ bucket, key })
    console.log('[scan/start] Textract async job started:', jobId)

    return Response.json({ jobId, bucket, key })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[scan/start] failed:', message)
    return Response.json(
      { error: `Could not start async scan: ${message}`, code: 'AsyncStartFailed' },
      { status: 500 }
    )
  }
}
