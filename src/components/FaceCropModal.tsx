import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';

interface FaceCropModalProps {
  open: boolean;
  imageSrc: string | null;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

const PREVIEW_W = 224;
const PREVIEW_H = 244;
const OVAL_CX = PREVIEW_W / 2;
const OVAL_CY = 108;
const OVAL_RX = 82;
const OVAL_RY = 94;
const OUT_W = 216;
const OUT_H = Math.round((OUT_W * OVAL_RY) / OVAL_RX); // 248 (exact head-oval aspect)

function exportTransparentFace(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL('image/webp', 0.92);
  if (webp.startsWith('data:image/webp')) {
    return webp;
  }
  return canvas.toDataURL('image/png');
}

export const FaceCropModal: React.FC<FaceCropModalProps> = ({
  open,
  imageSrc,
  errorMessage = null,
  onCancel,
  onConfirm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    origOffsetX: 0,
    origOffsetY: 0,
  });

  const [imgReady, setImgReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoom, setZoom] = useState(1.18);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const getBaseScale = useCallback((img: HTMLImageElement, rot: number) => {
    const swapped = rot % 180 !== 0;
    const rawW = img.naturalWidth || img.width || 512;
    const rawH = img.naturalHeight || img.height || 512;
    const effW = swapped ? rawH : rawW;
    const effH = swapped ? rawW : rawH;
    // Scale so zoom=1 covers the full head-oval cleanly
    return Math.max((OVAL_RX * 2) / effW, (OVAL_RY * 2) / effH);
  }, []);

  const clampOffset = useCallback(
    (rawX: number, rawY: number, nextZoom: number, nextRot: number) => {
      const img = imgRef.current;
      if (!img) return { x: 0, y: 0 };
      const swapped = nextRot % 180 !== 0;
      const rawW = img.naturalWidth || img.width || 512;
      const rawH = img.naturalHeight || img.height || 512;
      const effW = swapped ? rawH : rawW;
      const effH = swapped ? rawW : rawH;
      const drawScale = getBaseScale(img, nextRot) * nextZoom;
      const maxX = Math.max(0, (effW * drawScale - OVAL_RX * 2) / 2);
      const maxY = Math.max(0, (effH * drawScale - OVAL_RY * 2) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, rawX)),
        y: Math.max(-maxY, Math.min(maxY, rawY)),
      };
    },
    [getBaseScale]
  );

  useEffect(() => {
    if (!open || !imageSrc) {
      imgRef.current = null;
      setImgReady(false);
      setLoadFailed(false);
      return;
    }
    setImgReady(false);
    setLoadFailed(false);
    setZoom(1.18);
    setRotation(0);
    setOffset({ x: 0, y: 0 });

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      setImgReady(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      imgRef.current = null;
      setLoadFailed(true);
    };
    img.src = imageSrc;

    return () => {
      cancelled = true;
    };
  }, [open, imageSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = PREVIEW_W * dpr;
    canvas.height = PREVIEW_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);

    // Subtle game spotlight background
    const bgGrad = ctx.createRadialGradient(OVAL_CX, OVAL_CY, 18, OVAL_CX, OVAL_CY, 130);
    bgGrad.addColorStop(0, 'rgba(59, 130, 246, 0.28)');
    bgGrad.addColorStop(1, 'rgba(10, 10, 16, 0.96)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

    const img = imgRef.current;
    if (imgReady && img) {
      const rawW = img.naturalWidth || img.width || 512;
      const rawH = img.naturalHeight || img.height || 512;
      const drawScale = getBaseScale(img, rotation) * zoom;

      // Full image slightly dimmed outside the head oval
      ctx.save();
      ctx.translate(OVAL_CX + offset.x, OVAL_CY + offset.y);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(drawScale, drawScale);
      ctx.drawImage(img, -rawW / 2, -rawH / 2, rawW, rawH);
      ctx.restore();

      // Dim mask everywhere outside the head oval
      ctx.save();
      ctx.fillStyle = 'rgba(7, 7, 12, 0.72)';
      ctx.beginPath();
      ctx.rect(0, 0, PREVIEW_W, PREVIEW_H);
      ctx.ellipse(OVAL_CX, OVAL_CY, OVAL_RX, OVAL_RY, 0, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.restore();
    }

    // Mini character neck + shoulders silhouette below the head so alignment feels natural
    ctx.save();
    ctx.fillStyle = '#E5B89B';
    ctx.fillRect(OVAL_CX - 13, OVAL_CY + OVAL_RY - 10, 26, 28);
    ctx.fillStyle = '#3B82F6';
    ctx.beginPath();
    ctx.ellipse(OVAL_CX, PREVIEW_H + 8, 58, 32, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Redraw clipped bright face on top of the neck so chin overlaps naturally
    if (imgReady && img) {
      const rawW = img.naturalWidth || img.width || 512;
      const rawH = img.naturalHeight || img.height || 512;
      const drawScale = getBaseScale(img, rotation) * zoom;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(OVAL_CX, OVAL_CY, OVAL_RX, OVAL_RY, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(OVAL_CX + offset.x, OVAL_CY + offset.y);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(drawScale, drawScale);
      ctx.drawImage(img, -rawW / 2, -rawH / 2, rawW, rawH);
      ctx.restore();
    }

    // Subtle hairline guide only (no thick black border)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(OVAL_CX, OVAL_CY, OVAL_RX, OVAL_RY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }, [open, imgReady, zoom, rotation, offset, getBaseScale]);

  if (!open) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imgReady) return;
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: offset.x,
      origOffsetY: offset.y,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setOffset(clampOffset(d.origOffsetX + dx, d.origOffsetY + dy, zoom, rotation));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current.active = false;
      dragRef.current.pointerId = null;
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore pointer release errors
    }
  };

  const updateZoom = (nextZoomRaw: number) => {
    const nextZoom = Math.max(1, Math.min(4.5, Number(nextZoomRaw.toFixed(2))));
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom, rotation));
  };

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    setOffset((prev) => clampOffset(prev.x, prev.y, zoom, nextRot));
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = OUT_W;
    out.height = OUT_H;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    const rawW = img.naturalWidth || img.width || 512;
    const rawH = img.naturalHeight || img.height || 512;
    const ratio = OUT_W / (OVAL_RX * 2);
    const drawScale = getBaseScale(img, rotation) * zoom * ratio;

    // Transparent canvas — never fill black/dark behind face!
    ctx.clearRect(0, 0, OUT_W, OUT_H);
    ctx.save();
    ctx.translate(OUT_W / 2 + offset.x * ratio, OUT_H / 2 + offset.y * ratio);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(drawScale, drawScale);
    ctx.drawImage(img, -rawW / 2, -rawH / 2, rawW, rawH);
    ctx.restore();

    // Soft feathered head-oval mask so edges blend seamlessly without any black border
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.translate(OUT_W / 2, OUT_H / 2);
    ctx.scale(1, OUT_H / OUT_W);
    const mask = ctx.createRadialGradient(0, 0, (OUT_W / 2) * 0.87, 0, 0, OUT_W / 2);
    mask.addColorStop(0, 'rgba(0, 0, 0, 1)');
    mask.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = mask;
    ctx.beginPath();
    ctx.arc(0, 0, OUT_W / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    onConfirm(exportTransparentFace(out));
  };

  const activeError = errorMessage || (loadFailed ? 'Unsupported image' : null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Crop Face"
    >
      <div className="w-full max-w-[360px] rounded-2xl bg-[#121218] border border-white/16 p-4 shadow-2xl text-white flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold leading-tight">Crop Face</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel photo crop"
            className="w-10 h-10 rounded-xl bg-white/8 hover:bg-white/15 border border-white/12 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Character Head Preview Stage */}
        <div className="flex flex-col items-center justify-center py-0.5">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-[224px] h-[244px] rounded-2xl overflow-hidden border border-white/15 shadow-inner touch-none cursor-grab active:cursor-grabbing bg-[#0A0A10]"
          >
            <canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />
            {!imgReady && !activeError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-bold text-zinc-200">
                Loading...
              </div>
            )}
          </div>
          {activeError && (
            <p className="mt-2 text-center text-xs font-semibold text-red-400 px-2">
              {activeError}
            </p>
          )}
        </div>

        {/* Zoom & Rotate Controls */}
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-2.5 py-2">
          <button
            type="button"
            onClick={() => updateZoom(zoom - 0.25)}
            disabled={!imgReady}
            aria-label="Zoom out"
            className="w-9 h-9 rounded-lg bg-white/8 hover:bg-white/15 disabled:opacity-40 flex items-center justify-center text-zinc-200 shrink-0"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <input
            type="range"
            min={1}
            max={4.5}
            step={0.05}
            value={zoom}
            disabled={!imgReady}
            onChange={(e) => updateZoom(Number(e.target.value))}
            aria-label="Face zoom"
            className="w-full accent-[#EF4444] cursor-pointer disabled:opacity-40"
          />
          <button
            type="button"
            onClick={() => updateZoom(zoom + 0.25)}
            disabled={!imgReady}
            aria-label="Zoom in"
            className="w-9 h-9 rounded-lg bg-white/8 hover:bg-white/15 disabled:opacity-40 flex items-center justify-center text-zinc-200 shrink-0"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRotate}
            disabled={!imgReady}
            aria-label="Rotate photo 90 degrees"
            title="Rotate"
            className="w-9 h-9 rounded-lg bg-white/8 hover:bg-white/15 disabled:opacity-40 flex items-center justify-center text-zinc-200 shrink-0"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] py-2.5 px-4 rounded-xl bg-white/8 hover:bg-white/15 border border-white/14 text-zinc-200 font-bold text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!imgReady || Boolean(activeError)}
            className="min-h-[44px] py-2.5 px-4 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 text-white font-extrabold text-sm inline-flex items-center justify-center gap-1.5 shadow-lg transition-colors"
          >
            <Check className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
