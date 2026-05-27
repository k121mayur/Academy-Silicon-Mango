import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { QRCodeSVG } from "qrcode.react";

export type FieldKey = "name" | "course" | "date" | "qr";

export interface TextFieldConfig {
  x: number;
  y: number;
  font_size: number;
  font_color?: string;
  align?: "left" | "center" | "right";
}

export interface QrFieldConfig {
  x: number;
  y: number;
  size: number;
}

export interface CertificateFieldConfig {
  name: TextFieldConfig;
  course: TextFieldConfig;
  date: TextFieldConfig;
  qr: QrFieldConfig;
}

interface Props {
  templateUrl: string;
  templateType: "pdf" | "image";
  fieldConfig: CertificateFieldConfig;
  studentName: string;
  courseTitle: string;
  dateStr: string;
  qrUrl: string;
  onChange: (next: CertificateFieldConfig) => void;
}

const MAX_DISPLAY_WIDTH = 900;

export function CertificatePreview({
  templateUrl,
  templateType,
  fieldConfig,
  studentName,
  courseTitle,
  dateStr,
  qrUrl,
  onChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [displayWidth, setDisplayWidth] = useState<number>(MAX_DISPLAY_WIDTH);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Render PDF first page to a data URL once when the template URL changes.
  useEffect(() => {
    if (templateType !== "pdf") {
      setPdfDataUrl(null);
      setPdfError(null);
      return;
    }
    let cancelled = false;
    setPdfDataUrl(null);
    setPdfError(null);

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = (
          await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
        ).default;
        (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl;

        const fullUrl = absoluteUrl(templateUrl);
        const doc = await pdfjs.getDocument(fullUrl).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas-2d-unavailable");
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        setNatural({ w: viewport.width, h: viewport.height });
        setPdfDataUrl(canvas.toDataURL("image/png"));
      } catch (err) {
        if (cancelled) return;
        console.error("PDF render failed", err);
        setPdfError(err instanceof Error ? err.message : "Failed to render PDF");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateUrl, templateType]);

  useLayoutEffect(() => {
    const update = () => {
      const w = containerRef.current?.clientWidth ?? MAX_DISPLAY_WIDTH;
      setDisplayWidth(Math.min(w, MAX_DISPLAY_WIDTH));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const scale = useMemo(() => {
    if (!natural) return 1;
    return displayWidth / natural.w;
  }, [natural, displayWidth]);

  const displayHeight = useMemo(() => {
    if (!natural) return 0;
    return natural.h * scale;
  }, [natural, scale]);

  // Pointer drag handlers — convert display deltas back to template-natural coords.
  const dragState = useRef<{
    field: FieldKey;
    startNatX: number;
    startNatY: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  const onPointerDown = (field: FieldKey) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!natural) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const f = fieldConfig[field];
    dragState.current = {
      field,
      startNatX: f.x,
      startNatY: f.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (!s || !natural) return;
    const dx = (e.clientX - s.startClientX) / scale;
    const dy = (e.clientY - s.startClientY) / scale;
    const nextX = clamp(Math.round(s.startNatX + dx), 0, natural.w);
    const nextY = clamp(Math.round(s.startNatY + dy), 0, natural.h);
    const current = fieldConfig[s.field];
    const updated = { ...current, x: nextX, y: nextY };
    onChange({ ...fieldConfig, [s.field]: updated });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState.current) {
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    dragState.current = null;
  };

  const renderTextOverlay = (field: "name" | "course" | "date", value: string) => {
    const cfg = fieldConfig[field];
    if (!natural) return null;
    const fontPx = cfg.font_size * scale;
    const align = cfg.align ?? "center";
    const translateX = align === "center" ? "-50%" : align === "right" ? "-100%" : "0";
    return (
      <div
        key={field}
        onPointerDown={onPointerDown(field)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute select-none whitespace-nowrap cursor-move"
        style={{
          left: cfg.x * scale,
          top: cfg.y * scale,
          transform: `translate(${translateX}, -50%)`,
          fontSize: `${fontPx}px`,
          color: cfg.font_color ?? "#000000",
          fontWeight: 600,
          lineHeight: 1,
          touchAction: "none",
          textShadow: "0 0 2px rgba(255,255,255,0.5)",
        }}
        title={`Drag ${field} (x=${cfg.x}, y=${cfg.y})`}
      >
        <span className="ring-1 ring-primary/30 hover:ring-primary px-1 rounded-sm">
          {value || `[${field}]`}
        </span>
      </div>
    );
  };

  const renderQrOverlay = () => {
    const cfg = fieldConfig.qr;
    if (!natural) return null;
    const size = cfg.size * scale;
    return (
      <div
        onPointerDown={onPointerDown("qr")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute cursor-move ring-1 ring-primary/30 hover:ring-primary"
        style={{
          left: cfg.x * scale,
          top: cfg.y * scale,
          width: size,
          height: size,
          transform: "translate(-50%, -50%)",
          touchAction: "none",
          background: "white",
          padding: 2,
        }}
        title={`Drag QR (x=${cfg.x}, y=${cfg.y})`}
      >
        <QRCodeSVG value={qrUrl} size={size - 4} marginSize={0} />
      </div>
    );
  };

  const imgSrc = templateType === "image" ? absoluteUrl(templateUrl) : pdfDataUrl;

  return (
    <div ref={containerRef} className="w-full">
      {!natural && templateType === "pdf" && !pdfError && (
        <div className="aspect-[4/3] grid place-items-center bg-surface-containerLow rounded-xl">
          <p className="text-body-sm text-ink-outline">Rendering PDF preview…</p>
        </div>
      )}
      {pdfError && (
        <div className="aspect-[4/3] grid place-items-center bg-danger-container/30 rounded-xl">
          <p className="text-body-sm text-danger">PDF preview failed: {pdfError}</p>
        </div>
      )}
      {imgSrc && (
        <div
          className="relative inline-block rounded-xl overflow-hidden shadow-sm bg-white"
          style={{ width: displayWidth, height: displayHeight || undefined }}
        >
          <img
            src={imgSrc}
            alt="certificate template"
            className="block"
            style={{ width: displayWidth, height: "auto" }}
            onLoad={(e) => {
              const el = e.currentTarget;
              if (templateType === "image") {
                setNatural({ w: el.naturalWidth, h: el.naturalHeight });
              }
            }}
            draggable={false}
          />
          {natural && (
            <>
              {renderTextOverlay("name", studentName)}
              {renderTextOverlay("course", courseTitle)}
              {renderTextOverlay("date", dateStr)}
              {renderQrOverlay()}
            </>
          )}
        </div>
      )}
      {natural && (
        <p className="mt-2 text-label text-ink-outline">
          Natural size: {natural.w} × {natural.h}px · Preview scale: {(scale * 100).toFixed(0)}%
          · Drag the labels to reposition them.
        </p>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function absoluteUrl(url: string): string {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8085";
  return apiBase.replace(/\/api\/v1$/, "") + url;
}
