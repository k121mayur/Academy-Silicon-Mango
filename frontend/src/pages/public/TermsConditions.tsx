import { Link } from "react-router-dom";
import { MetaTags } from "@/components/shared/MetaTags";

export default function TermsConditions() {
  return (
    <>
      <MetaTags
        title="Terms & Conditions"
        description="Terms and conditions for using Silicon Mango Academy courses and platform."
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
            Terms & Conditions
          </h1>
          <p className="text-body-sm text-ink-outline mt-2">
            Last updated: August 2026
          </p>
        </div>

        <div className="bg-surface-lowest rounded-2xl border border-ink-outlineVariant/30 p-6 md:p-10 space-y-8 text-ink-variant leading-relaxed text-body">
          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the platform and services provided by <strong>Silicon Mango Academy</strong>, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">2. Course Access & Intellectual Property</h2>
            <p>
              All course content, video lectures, assignments, source files, and educational materials provided on Silicon Mango Academy are the intellectual property of Silicon Mango Academy. Your enrollment grants you a personal, non-exclusive, non-transferable license to access the material for individual learning. Sharing, republishing, or redistributing course content is strictly prohibited.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">3. Payments & Fees</h2>
            <p>
              All course fees are stated in Indian Rupees (INR) and are payable upfront before gaining cohort access or batch assignment. Payments are processed securely through our authorized payment gateway partner, Razorpay.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">4. Certification</h2>
            <p>
              Certificates of completion are issued to students who fulfill the specific criteria of the enrolled program (e.g., attending required sessions, submitting assignments, or completing quizzes). Silicon Mango Academy reserves the right to withhold certificates in case of plagiarism or violation of academic integrity.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">5. Governing Law</h2>
            <p>
              These Terms and Conditions shall be governed by and construed in accordance with the laws of India. Any disputes arising in connection with these terms shall be subject to the exclusive jurisdiction of the courts in Pune / Maharashtra, India.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">6. Contact Information</h2>
            <p>
              For any queries regarding these Terms & Conditions, please contact:
            </p>
            <div className="bg-surface-containerLow rounded-xl p-5 border border-ink-outlineVariant/20 space-y-2">
              <p><strong>Email:</strong> <a href="mailto:palak@siliconmango.com" className="text-primary hover:underline font-medium">palak@siliconmango.com</a></p>
              <p><strong>Phone:</strong> <a href="tel:+918446359728" className="text-primary hover:underline font-medium">+91 84463 59728</a></p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
