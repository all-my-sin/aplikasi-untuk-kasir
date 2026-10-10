// Thermal receipt printing via the browser print dialog.
//
// The receipt is printed from a hidden iframe containing ONLY the receipt
// (never the app page), as fixed-width monospace text sized to the paper:
//   58mm paper → 48mm printable, 32 characters per line
//   80mm paper → 72mm printable, 48 characters per line
// Courier glyphs are 0.6em wide, so font-size = printable / (chars × 0.6) = 2.5mm.
// See README → "Thermal printer setup" for driver / browser settings.

import { type PaperSize, type ReceiptData, buildReceiptLines } from '@pos/shared';

export const PRINTABLE_WIDTH_MM: Record<PaperSize, number> = { '58': 48, '80': 72 };

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function receiptHtml(data: ReceiptData, paperSize: PaperSize, logoUrl?: string | null): string {
  const width = PRINTABLE_WIDTH_MM[paperSize];
  const text = escapeHtml(buildReceiptLines(data, paperSize).join('\n'));
  const logo = logoUrl
    ? `<div class="logo"><img src="${escapeHtml(new URL(logoUrl, window.location.origin).href)}" alt=""></div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.number)}</title>
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${width}mm; padding: 2mm ${paperSize === '58' ? 5 : 4}mm 6mm; box-sizing: content-box; }
  pre { margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 2.5mm; line-height: 1.25;
        white-space: pre; color: #000; font-weight: 600; }
  .logo { text-align: center; margin-bottom: 1.5mm; }
  .logo img { max-width: ${Math.round(width * 0.6)}mm; max-height: 18mm; filter: grayscale(1) contrast(1.4); }
</style></head><body>${logo}<pre>${text}</pre></body></html>`;
}

/** Opens the print dialog for a receipt. Resolves once the dialog has been shown. */
export function printReceipt(data: ReceiptData, paperSize: PaperSize, logoUrl?: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      reject(new Error('Printing is not available in this browser.'));
      return;
    }

    const cleanup = () => setTimeout(() => iframe.remove(), 1000);
    win.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => iframe.isConnected && iframe.remove(), 120_000);

    doc.open();
    doc.write(receiptHtml(data, paperSize, logoUrl));
    doc.close();

    const doPrint = () => {
      try {
        win.focus();
        win.print();
        resolve();
      } catch (err) {
        iframe.remove();
        reject(err as Error);
      }
    };
    // Wait for the logo (if any) to load so it appears on the printout.
    const img = doc.querySelector('img');
    if (img && !img.complete) {
      img.addEventListener('load', doPrint, { once: true });
      img.addEventListener('error', doPrint, { once: true });
    } else setTimeout(doPrint, 50);
  });
}
