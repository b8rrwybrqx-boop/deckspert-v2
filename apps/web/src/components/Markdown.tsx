// Lightweight markdown renderer for evaluator reports (headings, lists, tables,
// bold/italic). Reuses the `eval-*` styles already defined in styles.css.
// Mirrors the renderer in pages/platform-evaluator so the session-material
// presentation report renders identically.

type InlineNode = string | { bold: string } | { em: string };

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) nodes.push({ bold: match[1] });
    else if (match[2] !== undefined) nodes.push({ em: match[2] });
    last = match.index + match[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function InlineContent({ text }: { text: string }) {
  const nodes = parseInline(text);
  return (
    <>
      {nodes.map((node, i) => {
        if (typeof node === "string") return <span key={i}>{node}</span>;
        if ("bold" in node) return <strong key={i}>{node.bold}</strong>;
        if ("em" in node) return <em key={i}>{node.em}</em>;
        return null;
      })}
    </>
  );
}

type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "p"; text: string }
  | { type: "blank" };

function parseMarkdown(md: string): Block[] {
  const rawLines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];

    if (line.startsWith("# ")) { blocks.push({ type: "h1", text: line.slice(2).trim() }); i++; continue; }
    if (line.startsWith("## ")) { blocks.push({ type: "h2", text: line.slice(3).trim() }); i++; continue; }
    if (line.startsWith("### ")) { blocks.push({ type: "h3", text: line.slice(4).trim() }); i++; continue; }

    if (line.includes("|") && i + 1 < rawLines.length && /^\s*\|?\s*[-:]+/.test(rawLines[i + 1])) {
      const headers = line.split("|").map((h) => h.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < rawLines.length && rawLines[i].includes("|")) {
        rows.push(rawLines[i].split("|").map((c) => c.trim()).filter(Boolean));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [line.slice(2).trim()];
      i++;
      while (i < rawLines.length && (rawLines[i].startsWith("- ") || rawLines[i].startsWith("* "))) {
        items.push(rawLines[i].slice(2).trim());
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    if (line.trim() === "") { blocks.push({ type: "blank" }); i++; continue; }

    blocks.push({ type: "p", text: line.trim() });
    i++;
  }

  return blocks;
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const blocks = parseMarkdown(markdown);
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const block of blocks) {
    switch (block.type) {
      case "h1":
        elements.push(<h2 key={key++} className="eval-h1"><InlineContent text={block.text} /></h2>);
        break;
      case "h2":
        elements.push(<h3 key={key++} className="eval-h2"><InlineContent text={block.text} /></h3>);
        break;
      case "h3":
        elements.push(<h4 key={key++} className="eval-h3"><InlineContent text={block.text} /></h4>);
        break;
      case "list":
        elements.push(
          <ul key={key++} className="eval-list">
            {block.items.map((item, i) => <li key={i}><InlineContent text={item} /></li>)}
          </ul>
        );
        break;
      case "table":
        elements.push(
          <div key={key++} className="eval-table-wrap">
            <table className="eval-table">
              <thead>
                <tr>{block.headers.map((h, i) => <th key={i}><InlineContent text={h} /></th>)}</tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci}><InlineContent text={cell} /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        break;
      case "p":
        elements.push(<p key={key++} className="eval-p"><InlineContent text={block.text} /></p>);
        break;
      case "blank":
        break;
    }
  }

  return <div className="eval-markdown">{elements}</div>;
}
