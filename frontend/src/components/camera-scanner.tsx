import { Camera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Camera-based barcode scanning (phones, tablets, laptops with webcams).
 * The ZXing decoder is loaded lazily so it does not slow down the POS screen.
 * Requires HTTPS (or localhost) for camera access.
 */
export function CameraScanner({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const detectedRef = useRef(onDetected);
  detectedRef.current = onDetected;

  useEffect(() => {
    if (!open) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    setError(null);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not available. Use HTTPS or localhost, and a browser with camera support.');
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (result && !cancelled) {
              cancelled = true;
              controls.stop();
              detectedRef.current(result.getText());
              onOpenChange(false);
            }
          },
        );
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in your browser settings.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : 'Unable to start the camera.',
        );
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5" /> Scan with camera
          </DialogTitle>
          <DialogDescription>Point the camera at the product barcode.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? (
            <p className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
          ) : (
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_8px_red]" />
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
