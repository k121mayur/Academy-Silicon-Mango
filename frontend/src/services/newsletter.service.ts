import api from "@/lib/api";

export interface NewsletterRequestResult {
  message: string;
  already_subscribed: boolean;
  expires_in: number;
}

export interface NewsletterVerifyResult {
  message: string;
  subscribed: boolean;
}

/** Step 1: ask the backend to email a confirmation OTP to this address. */
export async function requestNewsletterOtp(email: string): Promise<NewsletterRequestResult> {
  const res = await api.post("/public/newsletter/request", { email });
  return res.data.data as NewsletterRequestResult;
}

/** Step 2: confirm the subscription with the OTP from the email. */
export async function verifyNewsletter(email: string, otp: string): Promise<NewsletterVerifyResult> {
  const res = await api.post("/public/newsletter/verify", { email, otp });
  return res.data.data as NewsletterVerifyResult;
}
