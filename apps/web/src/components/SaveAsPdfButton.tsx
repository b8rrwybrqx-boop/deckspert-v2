/**
 * Opens the browser's print dialog, whose default destination is "Save as PDF".
 *
 * Deliberately not a PDF library. The browser's own engine keeps text
 * selectable and searchable, embeds fonts, and handles pagination — a
 * canvas-based library would rasterize the report into an image that is none of
 * those things. The work that makes the output good lives in the @media print
 * block in styles.css; this button only makes it discoverable, since nobody
 * thinks to press Cmd+P inside a web app.
 *
 * The button hides itself in print via .secondary-link.
 */
export function SaveAsPdfButton({ label = "Save as PDF" }: { label?: string }) {
  return (
    <div className="save-pdf-row">
      <button className="secondary-link" type="button" onClick={() => window.print()}>
        {label}
      </button>
    </div>
  );
}
