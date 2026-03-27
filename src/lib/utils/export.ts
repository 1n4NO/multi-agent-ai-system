import jsPDF from "jspdf";

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export function exportToPDF(title: string, content: string) {
  const doc = new jsPDF();

  const cleanText = content
  .replace(/#/g, "")
  .replace(/\*\*/g, "")
  .replace(/\n\n/g, "\n");

  const pageWidth = 180;
  const pageHeight = 280;

  const marginX = 10;
  let cursorY = 10;

  // Add title
  doc.setFontSize(16);
  doc.text(title, marginX, cursorY);

  cursorY += 10;

  doc.setFontSize(12);

  const lines = doc.splitTextToSize(cleanText, pageWidth);

  lines.forEach((line: string) => {
    // If content exceeds page height → add new page
    if (cursorY > pageHeight) {
      doc.addPage();
      cursorY = 10;
    }

    doc.text(line, marginX, cursorY);
    cursorY += 7;
  });

  doc.save(`${title}.pdf`);
}