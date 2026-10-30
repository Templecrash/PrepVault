const RETAIL_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

async function softwareDecoder() {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  return {
    kind: 'software',
    async decode(source) {
      try {
        const result = reader.decode(source);
        // Native format hints distinguish short UPC-E from EAN-8. ZXing's enum
        // is not part of the browser package API; the validated digits suffice.
        return [{ rawValue: result.getText() }];
      } catch (error) {
        if (['NotFoundException', 'ChecksumException', 'FormatException'].includes(error?.name) || ['NotFoundException', 'ChecksumException', 'FormatException'].includes(error?.constructor?.name)) return [];
        throw error;
      }
    },
  };
}

export async function createBarcodeDecoder() {
  const Detector = globalThis.BarcodeDetector;
  if (Detector) {
    try {
      const formats = typeof Detector.getSupportedFormats === 'function' ? await Detector.getSupportedFormats() : RETAIL_FORMATS;
      if (RETAIL_FORMATS.every(format => formats.includes(format))) {
        const native = new Detector({ formats: RETAIL_FORMATS });
        let fallback;
        return {
          kind: 'native',
          async decode(source) {
            try { return await native.detect(source); }
            catch { fallback ||= await softwareDecoder(); return fallback.decode(source); }
          },
        };
      }
    } catch { /* Native API may exist without retail format support. */ }
  }
  return softwareDecoder();
}

export async function decodeBarcodeImage(image) {
  const decoder = await createBarcodeDecoder();
  const results = await decoder.decode(image);
  if (results.length || decoder.kind === 'software') return results;
  return (await softwareDecoder()).decode(image);
}
