import fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

async function extractText(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text;
}

extractText("./pro.pdf")
  .then((txt) => console.log("Extracted text:", txt.substring(0, 300)))
  .catch((err) => console.error("Error parsing PDF:", err));
