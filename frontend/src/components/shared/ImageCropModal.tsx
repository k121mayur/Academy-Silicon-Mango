import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface Props {
  src: string;
  aspect: number;
  onCancel: () => void;
  onCrop: (file: File, previewUrl: string) => void;
}

async function cropImageToFile(imageSrc: string, pixelCrop: Area): Promise<{ file: File; url: string }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((res, rej) => {
    canvas.toBlob((blob) => {
      if (!blob) { rej(new Error("Canvas toBlob failed")); return; }
      const url = URL.createObjectURL(blob);
      res({ file: new File([blob], "banner.jpg", { type: "image/jpeg" }), url });
    }, "image/jpeg", 0.92);
  });
}

export function ImageCropModal({ src, aspect, onCancel, onCrop }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [loading, setLoading] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setLoading(true);
    try {
      const { file, url } = await cropImageToFile(src, croppedAreaPixels);
      onCrop(file, url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Crop banner image"
      description="Drag to reposition · scroll to zoom"
      size="lg"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
          <Button type="button" loading={loading} onClick={handleConfirm}>Crop & Use</Button>
        </>
      }
    >
      <div className="relative w-full" style={{ height: 360 }}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="icon text-ink-outline text-[18px]">zoom_in</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
      </div>
    </Modal>
  );
}
