import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import "./BarcodeScanner.css";

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | undefined;
    let done = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (result && !done) {
          done = true;
          controls?.stop();
          onDetected(result.getText());
        }
      })
      .then((c) => {
        controls = c;
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? "Impossible d'accéder à la caméra : " + err.message
            : "Impossible d'accéder à la caméra.",
        );
      });

    return () => {
      done = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="barcode-scanner">
      <div className="barcode-scanner__panel">
        <button type="button" className="barcode-scanner__close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
        <video ref={videoRef} className="barcode-scanner__video" muted playsInline />
        <p className="barcode-scanner__hint">Vise le code-barres du produit</p>
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}
