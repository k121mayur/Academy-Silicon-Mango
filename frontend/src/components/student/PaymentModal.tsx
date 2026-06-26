import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useRazorpay } from "@/hooks/useRazorpay";
import { absoluteApiUrl, extractErrorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { qk } from "@/lib/queryKeys";
import { ROUTES } from "@/router/routes";
import { createOrder, verifySignature } from "@/services/payment.service";
import type { PublicBatch } from "@/services/public.service";

type Phase = "ready" | "creating" | "checkout_open" | "verifying" | "success" | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  batch: PublicBatch;
  payable: number; // rupees
}

const BRAND = "#7c5800";

export function PaymentModal({ open, onClose, courseId, courseTitle, batch, payable }: Props) {
  const navigate = useNavigate();
  const { load } = useRazorpay();

  const [phase, setPhase] = useState<Phase>("ready");
  const [message, setMessage] = useState<string>("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [mockOnly, setMockOnly] = useState(false);
  const [devMockAvailable, setDevMockAvailable] = useState(false);

  const busy = phase === "creating" || phase === "checkout_open" || phase === "verifying";

  const invalidateAfterEnroll = () => {
    queryClient.invalidateQueries({ queryKey: qk.student.batches() });
    queryClient.invalidateQueries({ queryKey: qk.student.certificates() });
    queryClient.invalidateQueries({ queryKey: qk.public.courseBatches(courseId) });
  };

  const succeed = (url: string | null) => {
    setReceiptUrl(url);
    setPhase("success");
    invalidateAfterEnroll();
  };

  const fail = (msg: string) => {
    setMessage(msg);
    setPhase("error");
  };

  const openCheckout = (order: {
    order_id: string;
    amount: number;
    currency: string;
    key_id: string;
    prefill?: { name?: string; email?: string; contact?: string };
  }) => {
    if (!window.Razorpay) {
      fail("Secure checkout is unavailable. Please try again.");
      return;
    }
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: "Silicon Mango Academy",
      description: courseTitle,
      order_id: order.order_id,
      prefill: order.prefill,
      theme: { color: BRAND },
      handler: async (resp) => {
        setPhase("verifying");
        try {
          const result = await verifySignature({
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
            batch_id: batch.id,
          });
          succeed(result.receipt_url);
        } catch (e) {
          fail(
            extractErrorMessage(
              e,
              "Payment received but we couldn't confirm enrollment. If you were charged, contact support."
            )
          );
        }
      },
      modal: {
        escape: true,
        ondismiss: () => {
          // Only treat as cancel if we're not already verifying/succeeded.
          setPhase((p) => (p === "checkout_open" ? "ready" : p));
          toast("Payment cancelled — you can try again.");
        },
      },
    });
    rzp.on("payment.failed", (resp: any) => {
      fail(resp?.error?.description || "The payment failed. Please try again.");
    });
    setPhase("checkout_open");
    rzp.open();
  };

  const startRealPayment = async () => {
    setPhase("creating");
    try {
      const order = await createOrder(batch.id, false);
      // Free course → backend enrolled directly.
      if (order.free) {
        succeed(order.receipt_url ?? null);
        return;
      }
      // Dev: Razorpay not configured but mock is allowed.
      if (order.razorpay_unavailable) {
        setMockOnly(true);
        setDevMockAvailable(true);
        setPhase("ready");
        return;
      }
      if (order.dev_mock_available) setDevMockAvailable(true);
      // Load the checkout script lazily, then open.
      try {
        await load();
      } catch (e) {
        fail(extractErrorMessage(e, "Couldn't load secure checkout. Check your connection."));
        return;
      }
      openCheckout({
        order_id: order.order_id!,
        amount: order.amount!,
        currency: order.currency!,
        key_id: order.key_id!,
        prefill: order.prefill,
      });
    } catch (e) {
      fail(extractErrorMessage(e));
    }
  };

  const startMockPayment = async () => {
    setPhase("creating");
    try {
      const order = await createOrder(batch.id, true);
      succeed(order.receipt_url ?? null);
    } catch (e) {
      fail(extractErrorMessage(e));
    }
  };

  const goToMyCourses = () => {
    onClose();
    navigate(ROUTES.student.myCourses);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      closable={!busy && phase !== "success"}
      title={phase === "success" ? undefined : "Complete your enrollment"}
      size="md"
    >
      {phase === "success" ? (
        <div className="text-center py-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-success-container grid place-items-center animate-slide-up">
            <span className="icon text-[36px] text-success">check_circle</span>
          </div>
          <h3 className="font-display font-bold text-title-lg text-ink mt-4">Payment successful 🎉</h3>
          <p className="text-body-sm text-ink-variant mt-1">
            Receipt generated and course access is available in My Courses.
          </p>
          {receiptUrl && (
            <a
              href={absoluteApiUrl(receiptUrl)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 px-4 h-10 rounded-md bg-surface-containerLow hover:bg-surface-container border border-ink-outlineVariant text-body-sm font-medium text-ink"
            >
              <span className="icon text-[18px]">receipt_long</span>
              View your receipt ↗
            </a>
          )}
          <Button fullWidth className="mt-4" rightIcon="arrow_forward" onClick={goToMyCourses}>
            Go to My Courses
          </Button>
        </div>
      ) : phase === "verifying" || phase === "checkout_open" || phase === "creating" ? (
        <div className="text-center py-8">
          <Spinner size={32} className="text-primary" />
          <p className="text-body-sm text-ink-variant mt-3">
            {phase === "verifying"
              ? "Confirming your payment…"
              : phase === "checkout_open"
              ? "Complete the payment in the popup…"
              : "Preparing secure checkout…"}
          </p>
          <p className="text-label text-ink-outline mt-1">Please don't close this window.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Order summary */}
          <div className="bg-surface-containerLow rounded-xl p-4 border border-ink-outlineVariant/30">
            <p className="text-label text-ink-outline uppercase tracking-wide">You're enrolling in</p>
            <p className="font-semibold text-ink mt-0.5">{courseTitle}</p>
            <p className="text-body-sm text-ink-variant">{batch.name}</p>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink-outlineVariant/30">
              <span className="text-body-sm text-ink-variant">Total payable</span>
              <span className="font-display font-bold text-title-lg text-primary">
                {payable === 0 ? "Free" : formatCurrency(payable)}
              </span>
            </div>
          </div>

          {phase === "error" && (
            <div className="bg-danger-container/60 text-danger rounded-lg p-3 text-body-sm flex items-start gap-2">
              <span className="icon text-[18px]">error</span>
              <span>{message}</span>
            </div>
          )}

          {mockOnly && (
            <p className="text-label text-ink-outline">
              Razorpay isn't configured. In development you can simulate a successful payment.
            </p>
          )}

          <div className="space-y-2">
            {!mockOnly && (
              <Button fullWidth size="lg" leftIcon="lock" onClick={startRealPayment}>
                {payable === 0 ? "Enroll for free" : `Pay ${formatCurrency(payable)} securely`}
              </Button>
            )}
            {devMockAvailable && (
              <Button
                fullWidth
                variant={mockOnly ? "primary" : "outline"}
                size={mockOnly ? "lg" : "md"}
                leftIcon="bolt"
                onClick={startMockPayment}
              >
                Simulate payment (dev)
              </Button>
            )}
            <Button fullWidth variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>

          <p className="text-label text-ink-outline text-center flex items-center justify-center gap-1">
            <span className="icon text-[14px]">verified_user</span>
            Payments are processed securely by Razorpay.
          </p>
        </div>
      )}
    </Modal>
  );
}
