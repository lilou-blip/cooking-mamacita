import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Rend la première page d'un PDF (ticket exporté, capture Drive...) en image, pour la faire passer par
 * le même pipeline de lecture IA qu'une photo de ticket classique — pas besoin d'un chemin séparé côté IA.
 * Chargé à la demande (import dynamique côté appelant) pour ne pas alourdir le bundle principal.
 */
export async function renderFirstPdfPageToImage(file: File): Promise<{ base64: string; mediaType: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de préparer le rendu du PDF.");

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}
