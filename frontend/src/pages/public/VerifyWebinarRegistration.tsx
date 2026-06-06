import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { verifyWebinarRegistration, type VerifyResult } from "@/services/webinar.service";

export default function VerifyWebinarRegistration() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const [data, setData] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    verifyWebinarRegistration(token)
      .then((res) => {
        setData(res);
        setState(res.verified ? "ok" : "invalid");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  return (
    <div className="min-h-screen bg-surface-container py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2">
            <img src="/Logo1.png" alt="Silicon Mango" className="w-9 h-9 object-contain" />
            <span className="font-display font-extrabold text-title-md text-ink">Silicon Mango</span>
          </Link>
        </div>

        <Card>
          <CardBody className="text-center py-8 space-y-3">
            {state === "loading" && (
              <>
                <Spinner size={28} className="text-primary mx-auto" />
                <p className="text-body-sm text-ink-variant">Confirming your registration…</p>
              </>
            )}

            {state === "ok" && data && (
              <>
                <div className="w-14 h-14 mx-auto rounded-full bg-tertiary/10 text-tertiary grid place-items-center">
                  <span className="icon text-[32px]">{data.waitlisted ? "hourglass_top" : "verified"}</span>
                </div>
                <h1 className="font-display font-bold text-headline text-ink">
                  {data.waitlisted ? "You're on the waitlist!" : "Registration confirmed!"}
                </h1>
                <p className="text-body-sm text-ink-variant">
                  {data.waitlisted
                    ? `You're on the waitlist for "${data.webinar.title}". We'll email you if a seat opens up.`
                    : `Your spot for "${data.webinar.title}" is confirmed. We've emailed you the details and a calendar invite.`}
                </p>
                <Link to={`/webinars/${data.webinar.slug}`}>
                  <Button leftIcon="open_in_new" className="mt-2">
                    View webinar
                  </Button>
                </Link>
              </>
            )}

            {state === "invalid" && (
              <>
                <div className="w-14 h-14 mx-auto rounded-full bg-danger-container text-danger grid place-items-center">
                  <span className="icon text-[32px]">error</span>
                </div>
                <h1 className="font-display font-bold text-headline text-ink">Link invalid or expired</h1>
                <p className="text-body-sm text-ink-variant">
                  This confirmation link is no longer valid. You may have already confirmed, or the link was mistyped.
                </p>
                <Link to="/webinars">
                  <Button variant="outline" leftIcon="arrow_back" className="mt-2">
                    Browse webinars
                  </Button>
                </Link>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
