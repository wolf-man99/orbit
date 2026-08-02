import { NextResponse } from 'next/server'
import { minor } from '@/domain/money'
import { recordPaymentSchema } from '@/application/schemas'
import { failure, requestId, success } from '@/application/http'
import { recordPayment } from '@/application/services/record-payment'
import { hasDatabase, paymentPorts, requestContext } from '@/composition'

/**
 * Record a receipt. (Phase 6 §8.1, Q41)
 *
 * A versioned route handler with a plain JSON body, deliberately NOT a Server
 * Action: a Server Action is an opaque POST keyed to a build-specific action
 * id, so the offline service worker cannot construct one and a mutation queued
 * before a deploy would reference an id that no longer exists after it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const id = requestId()
  const headers = { 'X-Request-Id': id, 'Cache-Control': 'no-store' }

  const context = await requestContext()
  if (!context) {
    return NextResponse.json(
      failure({ kind: 'FORBIDDEN', reason: 'unauthenticated' }, id).body,
      { status: 401, headers },
    )
  }

  // Reads fall back to the seeded source when no database is configured, but a
  // WRITE cannot: there is nowhere for it to land. Say so plainly rather than
  // letting the port throw into a bare 500 — a payment the user believes was
  // recorded and was not is the worst outcome this product can produce, so an
  // unrecordable payment must be unmistakable.
  if (!hasDatabase()) {
    return NextResponse.json(
      failure(
        {
          kind: 'INVARIANT',
          constraint: 'database_required',
          message:
            'This deployment has no database configured, so payments cannot be recorded. ' +
            'Nothing was saved.',
        },
        id,
      ).body,
      { status: 503, headers },
    )
  }

  const parsed = recordPaymentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json(
      failure(
        {
          kind: 'VALIDATION',
          field: issue?.path.join('.') ?? 'body',
          message: issue?.message ?? 'Invalid request.',
        },
        id,
      ).body,
      { status: 422, headers },
    )
  }

  // Branding happens HERE, at the trust boundary. The schema parses untrusted
  // input into a plain bigint; `minor()` is the explicit acknowledgement that
  // the value has been validated and may now be treated as money.
  const { data } = parsed
  let result
  try {
    result = await recordPayment(
    {
      loanId: data.loanId,
      occurredOn: data.occurredOn,
      ...(data.interestMinor === undefined ? {} : { interestMinor: minor(data.interestMinor) }),
      ...(data.principalMinor === undefined ? {} : { principalMinor: minor(data.principalMinor) }),
      ...(data.allocations === undefined
        ? {}
        : {
            allocations: data.allocations.map((allocation) => ({
              periodId: allocation.periodId,
              amount: minor(allocation.amountMinor),
            })),
          }),
      idempotencyKey: data.idempotencyKey,
      groupId: crypto.randomUUID(),
      ...(data.note === undefined ? {} : { note: data.note }),
    },
    paymentPorts(context),
    )
  } catch (error) {
    // Constraint violations from Phase 3 surface here. They reach the user as
    // a sentence rather than a SQLSTATE. (Phase 6 §4.1)
    const message = error instanceof Error ? error.message : 'The payment could not be recorded.'
    return NextResponse.json(
      failure({ kind: 'INVARIANT', constraint: 'ledger', message }, id).body,
      { status: 422, headers },
    )
  }

  if (!result.ok) {
    const mapped = failure(result.error, id)
    return NextResponse.json(mapped.body, { status: mapped.status, headers })
  }

  // A replayed idempotency key is SUCCESS, not an error: a timeout after a
  // successful write is indistinguishable from a failure at the client, so
  // retry is inevitable and must be uneventful. (Phase 4 §9.3)
  const replayed = result.value.kind === 'REPLAYED'
  return NextResponse.json(success(result.value, new Date().toISOString(), id), {
    status: replayed ? 200 : 201,
    headers,
  })
}
