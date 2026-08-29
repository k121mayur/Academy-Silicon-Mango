import { Link } from "react-router-dom";
import { MetaTags } from "@/components/shared/MetaTags";

export default function RefundPolicy() {
  return (
    <>
      <MetaTags
        title="Cancellation & Refund Policy"
        description="Cancellation and refund policy for courses and programs at Silicon Mango Academy."
      />
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-body-sm text-ink-variant hover:text-ink transition-colors mb-4"
          >
            <span className="icon text-[18px]">arrow_back</span>
            Back to Home
          </Link>
          <p className="text-caption text-primary font-semibold tracking-wider uppercase mb-1">
            Legal & Compliance
          </p>
          <h1 className="font-display font-bold text-display-md md:text-display-lg text-ink">
            Cancellation & Refund Policy
          </h1>
          <p className="text-body-sm text-ink-outline mt-2">
            Last updated: August 2026
          </p>
        </div>

        <div className="bg-surface-lowest rounded-2xl border border-ink-outlineVariant/30 p-6 md:p-10 space-y-8 text-ink-variant leading-relaxed text-body">
          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">1. Overview</h2>
            <p>
              At <strong>Silicon Mango Academy</strong> (operated under Silicon Mango), we are committed to providing high-quality, job-ready educational programs. We believe in helping our learners as far as possible and have formulated a clear, transparent cancellation and refund policy in accordance with standard industry and payment gateway (Razorpay) guidelines.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">2. Cancellation Policy</h2>
            <p>
              Cancellations will be considered subject to the following conditions:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Before Batch Commencement:</strong> You may cancel your enrollment anytime before the scheduled start date and time of the batch. Upon cancellation before classes begin, you will receive a <strong>100% full refund</strong> with no questions asked.
              </li>
              <li>
                <strong>Self-Paced / Digital Content:</strong> Cancellation requests for self-paced courses must be made within <strong>24 hours</strong> of purchase, provided that less than 10% of the course materials or video lectures have been accessed or downloaded.
              </li>
              <li>
                <strong>Webinars & Masterclasses:</strong> For paid webinars or single-session workshops, cancellation requests must be submitted at least <strong>24 hours prior</strong> to the scheduled webinar start time.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">3. Refund Processing & Timelines</h2>
            <p>
              Once your cancellation request is received and verified by our support team:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Approved refund requests are initiated within <strong>24–48 hours</strong> of verification.
              </li>
              <li>
                The refund amount will be credited back automatically to the <strong>original payment method</strong> (bank account, credit/debit card, UPI ID, or net banking) used during checkout via our payment gateway partner, <strong>Razorpay</strong>.
              </li>
              <li>
                Depending on your issuing bank or card provider, the refunded amount typically reflects in your account within <strong>5 to 7 working days</strong>.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">4. Non-Refundable Circumstances</h2>
            <p>
              Refunds will not be entertained in the following cases:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Requests raised after the live cohort/batch has officially commenced.
              </li>
              <li>
                Failure to attend live sessions due to personal reasons, scheduling conflicts, or lack of internet connectivity after the batch has started (recordings will remain accessible).
              </li>
              <li>
                Course completion or issuance of the completion certificate.
              </li>
              <li>
                Violation of the platform’s Code of Conduct or Terms of Service leading to account suspension.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">5. Batch Rescheduling / Transfers</h2>
            <p>
              If an unexpected emergency prevents you from attending your enrolled batch, you may request a one-time transfer to an upcoming batch of the same course free of charge, provided you notify our team before the 2nd session of the batch.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">6. How to Request a Refund</h2>
            <p>
              To initiate a cancellation or refund request, please reach out to our support team with your registered email address, enrollment ID, and payment transaction details:
            </p>
            <div className="bg-surface-containerLow rounded-xl p-5 border border-ink-outlineVariant/20 space-y-2">
              <p>
                <strong>Email:</strong>{" "}
                <a
                  href="mailto:palak@siliconmango.com"
                  className="text-primary hover:underline font-medium"
                >
                  palak@siliconmango.com
                </a>
              </p>
              <p>
                <strong>Phone / WhatsApp:</strong>{" "}
                <a
                  href="tel:+918446359728"
                  className="text-primary hover:underline font-medium"
                >
                  +91 84463 59728
                </a>
              </p>
              <p>
                <strong>Support Hours:</strong> Monday to Saturday, 10:00 AM – 7:00 PM IST
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
