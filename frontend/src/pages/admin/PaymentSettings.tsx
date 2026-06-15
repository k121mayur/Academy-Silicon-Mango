import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { extractErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  getPaymentSettings,
  updatePaymentSettings,
  testPaymentConnection,
  type PaymentSettings as PaymentSettingsData,
} from "@/services/admin.service";

export default function PaymentSettings() {
  const [data, setData] = useState<PaymentSettingsData | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; mode: string; order_id?: string; error?: string } | null
  >(null);

  const load = async () => {
    try {
      setData(await getPaymentSettings());
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const apply = async (mode: "test" | "live") => {
    setBusy(true);
    try {
      const next = await updatePaymentSettings({ mode });
      setData(next);
      setConfirmLive(false);
      toast.success(
        mode === "live"
          ? "Switched to LIVE — students are now charged real money."
          : "Switched to Test mode — payments are simulated."
      );
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Switching to live is a money-moving action → confirm first.
  const request = (mode: "test" | "live") => {
    if (!data || data.mode === mode || busy) return;
    if (mode === "live") setConfirmLive(true);
    else apply("test");
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testPaymentConnection());
    } catch (e) {
      setTestResult({ ok: false, mode: data?.mode ?? "test", error: extractErrorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  const mode = data?.mode ?? "test";
  const liveActive = mode === "live";
  const activeConfigured = liveActive ? !!data?.live_configured : !!data?.test_configured;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Payment Settings</h1>
        <p className="text-body-sm text-ink-variant">
          Choose whether students pay through Razorpay <strong>Test</strong> mode (practice payments, no real
          money) or <strong>Live</strong> mode (real money to your bank). Keys are kept on the server — never
          entered or shown on this page.
        </p>
      </div>

      {/* Overall status */}
      <Card>
        <CardBody className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={cn("icon text-[28px]", activeConfigured ? "text-tertiary" : "text-ink-outline")}>
              {activeConfigured ? "verified_user" : "gpp_maybe"}
            </span>
            <div>
              <p className="text-title-md font-semibold text-ink">
                Online payments are {activeConfigured ? "active" : "not working"}
              </p>
              <p className="text-body-sm text-ink-variant">
                Currently in <strong className="uppercase">{mode}</strong> mode
                {data?.active_key_id_masked ? (
                  <>
                    {" · "}
                    <span className="font-mono">{data.active_key_id_masked}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <Badge tone={liveActive ? "warning" : "neutral"} size="md">
            {liveActive ? "LIVE" : "TEST"}
          </Badge>
        </CardBody>
      </Card>

      {/* Mode switch */}
      <Card>
        <CardHeader>
          <p className="text-title-md font-semibold">Active mode</p>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ModeCard
              active={mode === "test"}
              configured={!!data?.test_configured}
              disabled={busy}
              onClick={() => request("test")}
              title="Test"
              subtitle="Practice payments — no real money"
            />
            <ModeCard
              active={mode === "live"}
              configured={!!data?.live_configured}
              disabled={busy}
              onClick={() => request("live")}
              title="Live"
              subtitle="Real money, settled to your bank"
            />
          </div>

          {confirmLive && (
            <div className="bg-[#fff1c2] text-[#6b4c00] rounded-lg p-3 text-body-sm space-y-3">
              <div className="flex items-start gap-2">
                <span className="icon text-[18px]">warning</span>
                <span>
                  <strong>Switch to LIVE?</strong> Students will be charged <strong>real money</strong> at the
                  course price, and Razorpay will settle it to your linked bank account. Make sure you've tested the
                  full flow first.
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirmLive(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => apply("live")} loading={busy}>
                  Yes, go live
                </Button>
              </div>
            </div>
          )}

          {/* Connection diagnostic — proves the active mode's keys actually work */}
          <div className="pt-3 border-t border-ink-outlineVariant/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-body-sm font-medium text-ink">Verify keys work</p>
                <p className="text-label text-ink-outline">
                  Creates a ₹1 test order with the <strong className="uppercase">{mode}</strong> keys — no charge is made.
                </p>
              </div>
              <Button size="sm" variant="outline" leftIcon="bolt" onClick={runTest} loading={testing}>
                Test connection
              </Button>
            </div>
            {testResult && (
              <div
                className={cn(
                  "mt-3 rounded-lg p-3 text-body-sm flex items-start gap-2",
                  testResult.ok ? "bg-[#b3ecf5]/40 text-tertiary" : "bg-danger-container/60 text-danger"
                )}
              >
                <span className="icon text-[18px]">{testResult.ok ? "check_circle" : "error"}</span>
                <span>
                  {testResult.ok
                    ? `${testResult.mode.toUpperCase()} keys work — Razorpay accepted a test order (${testResult.order_id}).`
                    : `${testResult.mode.toUpperCase()} keys failed — ${testResult.error}`}
                </span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Plain-language explainer */}
      <Card>
        <CardHeader>
          <p className="text-title-md font-semibold">Test vs Live — what's the difference?</p>
        </CardHeader>
        <CardBody className="space-y-3 text-body-sm text-ink-variant">
          <p>
            <strong className="text-ink">Test mode</strong> uses Razorpay's sandbox. The checkout, QR and UPI all
            look real, but no money moves — you use Razorpay's test cards/UPI to simulate a success or failure. Use
            this to confirm the whole journey (pay → enrol → receipt email) before launch.
          </p>
          <p>
            <strong className="text-ink">Live mode</strong> uses your real Razorpay account. Students pay the actual
            course price with their own cards/UPI/QR, and Razorpay settles the money to your bank account (typically
            T+2 working days, per your Razorpay settlement schedule).
          </p>
          <p className="flex items-start gap-2 text-ink-outline">
            <span className="icon text-[16px]">key</span>
            <span>
              Keys for each mode are set once in the server's <span className="font-mono">.env</span> file (
              <span className="font-mono">RAZORPAY_TEST_*</span> / <span className="font-mono">RAZORPAY_LIVE_*</span>)
              and never shown here. A mode you haven't added keys for stays disabled.
            </span>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function ModeCard({
  active,
  configured,
  disabled,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  configured: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  const clickable = configured && !active && !disabled;
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-pressed={active}
      className={cn(
        "text-left rounded-xl border p-4 transition",
        active
          ? "border-primary bg-primary-container/20 ring-1 ring-primary"
          : configured
          ? "border-ink-outlineVariant hover:border-primary/50 hover:bg-surface-containerLow cursor-pointer"
          : "border-ink-outlineVariant/50 opacity-60 cursor-not-allowed"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">{title}</p>
        {active ? (
          <Badge tone="success" icon="check">
            Active
          </Badge>
        ) : configured ? (
          <span className="text-label text-ink-outline">Switch →</span>
        ) : (
          <Badge tone="neutral" icon="block">
            No keys
          </Badge>
        )}
      </div>
      <p className="text-body-sm text-ink-variant mt-0.5">{subtitle}</p>
      <p className="text-label mt-2 flex items-center gap-1">
        <span className={cn("icon text-[14px]", configured ? "text-tertiary" : "text-ink-outline")}>
          {configured ? "check_circle" : "radio_button_unchecked"}
        </span>
        <span className={configured ? "text-tertiary" : "text-ink-outline"}>
          {configured ? "Keys configured" : "Keys missing in .env"}
        </span>
      </p>
    </button>
  );
}
