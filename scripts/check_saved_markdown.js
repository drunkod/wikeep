import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("scripts/query_db.log", "utf8"));
if (data.data) {
  const glossary = data.data.find(p => p.id.includes("8-glossary"));
  if (glossary) {
    console.log("Glossary Markdown contains 'mermaid':", glossary.markdown.includes("```mermaid"));
    console.log("Glossary Markdown contains 'Diagram omitted':", glossary.markdown.includes("Diagram omitted"));
    // Print the markdown lines around 'Diagram omitted' or 'mermaid' if present
    const lines = glossary.markdown.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("mermaid") || lines[i].includes("Diagram omitted") || lines[i].includes("Diagram")) {
        console.log(`Line ${i+1}: ${lines[i]}`);
        console.log(`Context:\n${lines.slice(Math.max(0, i-2), i+3).join("\n")}\n`);
      }
    }
  } else {
    console.log("Glossary page not found in log");
  }
}
