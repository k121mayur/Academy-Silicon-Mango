import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import { absoluteApiUrl } from "@/lib/api";

export type FieldKey = "name" | "course" | "date" | "qr";

export interface TextFieldConfig {
  x: number;
  y: number;
  font_size: number;
  font_color?: string;
  align?: "left" | "center" | "right";
  enabled?: boolean;
}

export interface QrFieldConfig {
  x: number;
  y: number;
  size: number;
  enabled?: boolean;
}

export interface CertificateFieldConfig {
  name: TextFieldConfig;
  course: TextFieldConfig;
  date: TextFieldConfig;
  qr: QrFieldConfig;
}

export function getProportionalConfig(w: number, h: number): CertificateFieldConfig {
  const leftX = Math.round(w * 0.09325);
  return {
    date: {
      x: leftX,
      y: Math.round(h * 0.289),
      font_size: Math.max(12, Math.round(h * 0.019)),
      font_color: "#000000",
      align: "left",
      enabled: true,
    },
    name: {
      x: leftX,
      y: Math.round(h * 0.4643),
      font_size: Math.max(18, Math.round(h * 0.035)),
      font_color: "#000000",
      align: "left",
      enabled: true,
    },
    course: {
      x: leftX,
      y: Math.round(h * 0.565),
      font_size: Math.max(14, Math.round(h * 0.0245)),
      font_color: "#000000",
      align: "left",
      enabled: true,
    },
    qr: {
      x: Math.round(w * 0.85),
      y: Math.round(h * 0.88),
      size: Math.max(60, Math.round(h * 0.09)),
      enabled: false,
    },
  };
}

interface Props {
  templateUrl: string;
  templateType: "pdf" | "image";
  fieldConfig: CertificateFieldConfig;
  studentName: string;
  courseTitle: string;
  dateStr: string;
  qrUrl: string;
  onChange?: (next: CertificateFieldConfig) => void;
  onNaturalDimensions?: (size: { w: number; h: number }) => void;
  /** When true, the preview is display-only: no dragging, no edit affordances. */
  readOnly?: boolean;
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
  onNaturalDimensions,
  readOnly = false,
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

        const fullUrl = absoluteApiUrl(templateUrl);
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
        const dims = { w: viewport.width, h: viewport.height };
        setNatural(dims);
        onNaturalDimensions?.(dims);
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

  const [activeGuideX, setActiveGuideX] = useState<number | null>(null);

  // Pointer drag handlers — convert display deltas back to template-natural coords.
  const dragState = useRef<{
    field: FieldKey;
    startNatX: number;
    startNatY: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  const onPointerDown = (field: FieldKey) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!natural || readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const f = fieldConfig[field];
    setActiveGuideX(f.x);
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
    setActiveGuideX(nextX);
    const current = fieldConfig[s.field];
    const updated = { ...current, x: nextX, y: nextY };
    onChange?.({ ...fieldConfig, [s.field]: updated });
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
    setActiveGuideX(null);
  };

  const renderTextOverlay = (field: "name" | "course" | "date", value: string) => {
    const cfg = fieldConfig[field];
    if (!natural || cfg.enabled === false) return null;
    const fontPx = cfg.font_size * scale;
    const align = cfg.align ?? "left";
    const translateX = align === "center" ? "-50%" : align === "right" ? "-100%" : "0";
    return (
      <div
        key={field}
        onPointerDown={onPointerDown(field)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={() => !dragState.current && setActiveGuideX(cfg.x)}
        onMouseLeave={() => !dragState.current && setActiveGuideX(null)}
        className={`absolute select-none whitespace-nowrap ${readOnly ? "" : "cursor-move"}`}
        style={{
          left: cfg.x * scale,
          top: cfg.y * scale,
          transform: `translate(${translateX}, -50%)`,
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: `${fontPx}px`,
          color: cfg.font_color ?? "#000000",
          textAlign: "left",
          lineHeight: 1,
          touchAction: "none",
          textShadow: "0 0 2px rgba(255,255,255,0.5)",
        }}
        title={readOnly ? undefined : `Drag ${field} (x=${cfg.x}, y=${cfg.y}, align=${align})`}
      >
        <span className={readOnly ? "" : "outline outline-1 outline-primary/40 hover:outline-primary hover:bg-primary/5 rounded-xs"}>
          {value || (readOnly ? "" : `[${field}]`)}
        </span>
      </div>
    );
  };

  const renderQrOverlay = () => {
    const cfg = fieldConfig.qr;
    if (!natural || cfg.enabled === false) return null;
    const size = cfg.size * scale;
    return (
      <div
        onPointerDown={onPointerDown("qr")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={() => !dragState.current && setActiveGuideX(cfg.x)}
        onMouseLeave={() => !dragState.current && setActiveGuideX(null)}
        className={`absolute ${readOnly ? "" : "cursor-move ring-1 ring-primary/30 hover:ring-primary"}`}
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
        title={readOnly ? undefined : `Drag QR (x=${cfg.x}, y=${cfg.y})`}
      >
        <QRCodeSVG value={qrUrl} size={size - 4} marginSize={0} />
      </div>
    );
  };

  const imgSrc = templateType === "image" ? absoluteApiUrl(templateUrl) : pdfDataUrl;

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
                const dims = { w: el.naturalWidth, h: el.naturalHeight };
                setNatural(dims);
                onNaturalDimensions?.(dims);
              }
            }}
            draggable={false}
          />
          {natural && (
            <>
              {activeGuideX !== null && !readOnly && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none z-20 border-l border-dashed border-primary"
                  style={{ left: activeGuideX * scale }}
                >
                  <span className="inline-block bg-primary text-white text-[10px] font-mono px-1 py-0.5 rounded-br shadow-sm">
                    X={activeGuideX}px
                  </span>
                </div>
              )}
              {renderTextOverlay("name", studentName)}
              {renderTextOverlay("course", courseTitle)}
              {renderTextOverlay("date", dateStr)}
              {renderQrOverlay()}
            </>
          )}
        </div>
      )}
      {natural && !readOnly && (
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

