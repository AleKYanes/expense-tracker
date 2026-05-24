/**
 * Server-only helpers for AWS Textract asynchronous expense analysis.
 * Use for multi-page PDFs that synchronous AnalyzeExpense cannot process.
 */
import {
  TextractClient,
  StartExpenseAnalysisCommand,
  GetExpenseAnalysisCommand,
  type ExpenseDocument,
} from '@aws-sdk/client-textract'

function buildClient(): TextractClient {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured')
  }
  return new TextractClient({ region, credentials: { accessKeyId, secretAccessKey } })
}

/** Upload object to S3 first, then call StartExpenseAnalysis. Returns the job ID. */
export async function startExpenseAnalysisFromS3({
  bucket,
  key,
}: {
  bucket: string
  key: string
}): Promise<string> {
  const client = buildClient()
  const response = await client.send(
    new StartExpenseAnalysisCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
    })
  )
  if (!response.JobId) throw new Error('Textract did not return a job ID')
  return response.JobId
}

export type AsyncAnalysisResult =
  | { status: 'IN_PROGRESS' }
  | { status: 'FAILED'; reason: string }
  | { status: 'SUCCEEDED'; documents: ExpenseDocument[] }

/**
 * Poll GetExpenseAnalysis once.
 * Handles pagination internally when SUCCEEDED — collects all ExpenseDocuments.
 */
export async function getExpenseAnalysisResult(jobId: string): Promise<AsyncAnalysisResult> {
  const client = buildClient()
  const documents: ExpenseDocument[] = []
  let nextToken: string | undefined

  do {
    const response = await client.send(
      new GetExpenseAnalysisCommand({ JobId: jobId, ...(nextToken ? { NextToken: nextToken } : {}) })
    )

    if (response.JobStatus === 'IN_PROGRESS') {
      return { status: 'IN_PROGRESS' }
    }
    if (response.JobStatus === 'FAILED') {
      return { status: 'FAILED', reason: response.StatusMessage ?? 'Textract job failed.' }
    }

    // SUCCEEDED (or PARTIAL_SUCCESS) — collect all documents across pages
    documents.push(...(response.ExpenseDocuments ?? []))
    nextToken = response.NextToken
  } while (nextToken)

  return { status: 'SUCCEEDED', documents }
}
