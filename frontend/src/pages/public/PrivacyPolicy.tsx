import { Link } from "react-router-dom";
import { MetaTags } from "@/components/shared/MetaTags";

export default function PrivacyPolicy() {
  return (
    <>
      <MetaTags
        title="Privacy Policy"
        description="Privacy policy and data protection practices of Silicon Mango Academy."
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
            Privacy Policy
          </h1>
          <p className="text-body-sm text-ink-outline mt-2">
            Last updated: August 2026
          </p>
        </div>

        <div className="bg-surface-lowest rounded-2xl border border-ink-outlineVariant/30 p-6 md:p-10 space-y-8 text-ink-variant leading-relaxed text-body">
          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">1. Information We Collect</h2>
            <p>
              When you register on Silicon Mango Academy, enroll in a course, or interact with our services, we collect information including your name, email address, WhatsApp/mobile number, billing information, and city.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">2. How We Use Your Information</h2>
            <p>
              We use your information to:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Facilitate course enrollment, live cohort access, and digital certificate issuance.</li>
              <li>Provide customer support, batch schedule updates, and assignment notifications.</li>
              <li>Process payments securely via authorized payment gateways (Razorpay).</li>
              <li>Send newsletters and course updates (which you may opt out of at any time).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">3. Payment Security</h2>
            <p>
              All payment transactions are processed through secure, PCI-DSS compliant third-party payment gateways (Razorpay). Silicon Mango Academy does not store your credit card, debit card, or net banking credentials on our servers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">4. Data Sharing & Third Parties</h2>
            <p>
              We do not sell, rent, or trade your personal data to third parties. We may share data only with trusted service providers necessary for delivering our services (e.g., authentication, email delivery, payment processing) under strict confidentiality agreements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-lg font-bold text-ink">5. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or how your data is handled, please contact us at:
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
