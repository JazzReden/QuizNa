import jsQR from "jsqr";
import { readMarks } from "./paper-scan";
import { cropEssays } from "./paper-essay-crops";
self.onmessage = (event) => {
  const { data, width, height, page, essayCrops, detectedQr } = event.data;
  try {
    // The second pass uses the detection from this same captured frame.
    const qr =
      detectedQr ||
      jsQR(data, width, height, { inversionAttempts: "dontInvert" });
    if (!qr) {
      self.postMessage({
        error:
          "QR code not found. Include the whole sheet, with the QR code clearly visible.",
      });
      return;
    }
    const marks = page
      ? readMarks(data, width, height, qr.location, page)
      : null;
    let crops: ReturnType<typeof cropEssays> = [],
      cropError: string | undefined;
    if (page && essayCrops) {
      try {
        crops = cropEssays(data, width, height, qr.location, page);
      } catch (error) {
        cropError =
          error instanceof Error ? error.message : "Unable to crop essays.";
      }
    }
    self.postMessage({
      code: qr.data,
      location: qr.location,
      marks,
      crops,
      cropError,
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Unable to read the sheet.",
    });
  }
};
