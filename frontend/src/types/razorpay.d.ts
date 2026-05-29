export {};

declare global {
  interface RazorpayHandlerResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  interface RazorpayOptions {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    order_id: string;
    prefill?: { name?: string; email?: string; contact?: string };
    notes?: Record<string, string>;
    theme?: { color?: string };
    handler?: (response: RazorpayHandlerResponse) => void;
    modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
  }

  interface RazorpayInstance {
    open: () => void;
    on: (event: string, cb: (response: any) => void) => void;
  }

  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}
