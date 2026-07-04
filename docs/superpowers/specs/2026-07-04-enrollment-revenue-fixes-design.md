# Enrollment / revenue integrity fixes — design

Date: 2026-07-04

## Problem

Three issues in the admin enrollment & revenue flow:

1. Unenrolling a student does not reduce dashboard revenue — the `Payment` row is left untouched, so the fee they paid keeps counting toward `total_revenue`, `this_month_revenue`, `mom_change_percent`, and the revenue chart even after they're removed.
2. A student can be enrolled twice into the same course (via two different batches) — no check exists at the course level, only at the batch level.
3. Admin manual-enroll has no way to record whether the student has actually paid — one code path hardcodes the payment as `paid` for the full price, the other creates no payment record at all.

## Findings from the existing code

- `Enrollment` (`app/models/batch.py`) has a unique constraint on `(batch_id, student_id)` only — no course-level constraint.
- `Payment.enrollment_id` is a nullable FK with `ondelete="SET NULL"`. Single-student unenroll (`admin/batches.py: remove_enrollment`) hard-deletes the `Enrollment` row; Postgres already nulls the linked `Payment.enrollment_id` for free.
- All four dashboard revenue queries (`admin/dashboard.py: stats`, `revenue_chart`) sum `Payment.amount` filtered only by `status == paid` and `is_test == False` — never checking whether the linked enrollment still exists. This is the root cause of bug #1.
- Full-batch delete (`admin/batches.py: delete_batch`) is unaffected — it cascades and deletes `Payment` rows outright, so it's already correct.
- Batch-level duplicate enrollment is already blocked in all three creation paths (`admin_enroll_student`, `enroll_student`, `assert_enrollable` for self-enroll all call a batch-scoped existing-enrollment check). The real gap is course-level: nothing stops enrolling into a second batch of the same course.
- `PaymentStatus` already has `pending`, unused by either admin-enroll path. `admin/enrollments.py: admin_enroll_student` always creates `Payment(status=paid)`; `admin/batches.py: enroll_student` creates no `Payment` at all.
- `admin/payments.py` has a payment list endpoint (`GET /admin/payments`, backs `frontend/src/pages/admin/Payments.tsx`) but no mutate endpoint.

## Decisions (confirmed with the user)

- Unenroll is bookkeeping-only: no refund tracking, no Razorpay refund call. The `Payment` row is kept as history; only the dashboard *totals* change.
- Re-enrollment into a batch a student previously dropped from must remain possible.
- A "Mark as Paid" admin action is required so a `pending` fee can later convert to `paid`.
- The amount owed for a `fee_paid=false` enrollment is always the course's standard price — no custom/discounted amount input.

## Design

### 1. Revenue exclusion on unenroll

No change to `remove_enrollment` — the existing hard-delete + `ON DELETE SET NULL` already produces the right signal (`Payment.enrollment_id` becomes `NULL`). Add an inner join to `Enrollment` in all 4 revenue queries in `admin/dashboard.py` (`stats`: `total_revenue`, `this_month_revenue` and `last_month_rev` used for `mom_change_percent`; `revenue_chart`): `.join(Enrollment, Enrollment.id == Payment.enrollment_id)`. Once an enrollment is deleted, the join drops its payment from every one of these consistently.

`active_students` already filters `Enrollment.status == active` and is unaffected. `recent-transactions` remains a raw payment log (joins `Payment` directly to `User`/`Batch`, not through `Enrollment`) and intentionally keeps showing historical transactions — it is not a revenue aggregate.

Frontend: update the unenroll confirmation copy in `Enrollments.tsx` to state the fee will no longer count toward revenue.

No migration required.

### 2. Course-level duplicate enrollment guard

New helper in `payment_service.py`: `get_existing_active_course_enrollment(db, course_id, student_id)` — joins `Enrollment → Batch`, filters `Batch.course_id == course_id`, `Enrollment.student_id == student_id`, `Enrollment.status == active`.

Called from all three enrollment-creation paths, alongside the existing batch-level check:
- `assert_enrollable` (student self-enroll, `payment_service.py`)
- `admin_enroll_student` (`admin/enrollments.py`)
- `enroll_student` (`admin/batches.py`)

Raises a 409 error (code `ALREADY_ENROLLED_COURSE`) naming the batch the student is already active in. Since it only ever matches `active` enrollments, re-enrolling into a batch a student previously dropped from is unaffected.

Accepted consequence: moving a student from one batch to another batch of the same course now requires an explicit unenroll + enroll (two actions) rather than silently succeeding — this is the direct meaning of eliminating double enrollment.

Pure application-level check (SELECT before INSERT) — consistent with the existing soft capacity-check pattern in this codebase. No migration required.

### 3. Fee paid/unpaid at admin enroll + Mark as Paid

Both admin-enroll endpoints take a `fee_paid: bool = True` field (default preserves current behavior):
- `POST /admin/enrollments` — replace the raw `dict` payload with a proper `AdminEnrollIn(student_id, batch_id, fee_paid=True)` schema.
- `POST /admin/batches/{id}/enroll` — switch from creating a bare `Enrollment` to `create_enrollment_with_payment(...)`, matching path 1 (including the existing `is_test` computation for unpublished courses). This closes the existing gap where this path creates no payment record at all.

`fee_paid=True` → `Payment.status=paid` (today's behavior). `fee_paid=False` → `Payment.status=pending`, amount = `payable_amount(course)` (course's standard price, no custom amount).

New endpoint `PATCH /admin/payments/{payment_id}/mark-paid` in `admin/payments.py`: validates `status == pending` (400 otherwise), flips to `paid`. Surfaced as a button in the existing `Payments.tsx` admin page, which already lists student/batch/amount/status with a pending filter and badge.

Frontend: add a "Fees paid" checkbox (default checked) to both enroll modals (`Enrollments.tsx`'s `EnrollModal`, `BatchDetail.tsx`'s per-batch enroll modal).

No migration required — `PaymentStatus.pending` already exists.

## Non-goals

- No actual refund processing/tracking (Razorpay refund API, `refunded` payment status).
- No custom/discounted fee amount at enroll time.
- No changes to `recent-transactions` (payment log) or `batch_delete_impact` (full-batch-delete preview) — both already correct for their purpose.
- No schema migrations.
