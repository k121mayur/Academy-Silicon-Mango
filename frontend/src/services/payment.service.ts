import api from "@/lib/api";

export interface CreateOrderResponse {
  free: boolean;
  mock?: boolean;
  // direct-enroll path (free / dev mock):
  enrollment_id?: string;
  status?: string;
  receipt_url?: string | null;
  // razorpay path:
  order_id?: string;
  amount?: number; // PAISE — pass straight to Razorpay, never converted on the client
  amount_display?: number; // rupees, for UI text
  currency?: string;
  key_id?: string;
  batch_id?: string;
  prefill?: { name: string; email: string; contact: string };
  dev_mock_available?: boolean;
  razorpay_unavailable?: boolean;
}

export interface VerifyResponse {
  enrollment_id: string;
  batch_id: string;
  status: string;
  payment_id: string | null;
  receipt_url: string | null;
}

export async function createOrder(batchId: string, mock = false) {
  const res = await api.post("/student/payment/create-order", { batch_id: batchId, mock });
  return res.data.data as CreateOrderResponse;
}

export async function verifySignature(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  batch_id: string;
}) {
  const res = await api.post("/student/payment/verify-signature", payload);
  return res.data.data as VerifyResponse;
}
