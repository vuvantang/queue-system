// Print ticket using iframe + window.print fallback
// Tauri Rust thermal printer integration will be added separately

export function printTicket(ticketNumber: string, orgName: string, waitingCount: number): void {
  const now = new Date();
  const datetime = now.toLocaleString('vi-VN');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page {
          size: 80mm auto;
          margin: 2mm;
        }
        body {
          font-family: 'Courier New', monospace;
          text-align: center;
          width: 76mm;
          margin: 0 auto;
          padding: 4mm 0;
        }
        .org-name {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 4mm;
          border-bottom: 1px dashed #000;
          padding-bottom: 3mm;
        }
        .label {
          font-size: 14px;
          margin: 3mm 0 1mm;
        }
        .ticket-number {
          font-size: 48px;
          font-weight: bold;
          margin: 2mm 0;
          letter-spacing: 2px;
        }
        .datetime {
          font-size: 12px;
          color: #555;
          margin: 2mm 0;
        }
        .waiting {
          font-size: 12px;
          margin: 2mm 0;
        }
        .hint {
          font-size: 13px;
          margin-top: 3mm;
          padding-top: 3mm;
          border-top: 1px dashed #000;
        }
      </style>
    </head>
    <body>
      <div class="org-name">${orgName}</div>
      <div class="label">SỐ THỨ TỰ</div>
      <div class="ticket-number">${ticketNumber}</div>
      <div class="datetime">${datetime}</div>
      <div class="waiting">Đang chờ: ${waitingCount} người</div>
      <div class="hint">Vui lòng chờ gọi số</div>
    </body>
    </html>
  `;

  // Create hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '80mm';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDoc) {
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    };
  }
}

// Try Tauri thermal print command (if available)
export async function printTicketThermal(ticketNumber: string, orgName: string, waitingCount: number): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const printerName = localStorage.getItem('kiosk_printer_name') || undefined;
    console.info('[Print] Thermal print:', ticketNumber, printerName || 'default');
    await invoke('print_ticket', {
      ticketNumber,
      orgName,
      waitingCount,
      datetime: new Date().toLocaleString('vi-VN'),
      printerName,
    });
    return true;
  } catch {
    // Fallback to browser print
    console.warn('[Print] Thermal failed, using browser fallback');
    printTicket(ticketNumber, orgName, waitingCount);
    return false;
  }
}
