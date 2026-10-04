# 采购申请表模板执行契约

## Reference

- Published template: `src/assets/purchase-template.docx`; the repository includes the generated template used by the build.
- Published template SHA-256: `810CAAF0CA34E6E133AA2D7194EFC32D6AEE3873CAF82813A604E7110A4551AD`
- Verified nine-item example: 2 pages (historical Word rendering described in `验收记录.md`).
- Sections: 1
- The original six-column purchase form stays local and is not required for a normal build.
- To regenerate from an original form, install Python 3.10+ and `python-docx==1.2.0`, then run `pnpm build:template --source "original-purchase-form.docx"` and `pnpm verify`. Without `--source`, the existing template is reused unchanged.

## Page system

- A4 portrait, 8.27 × 11.69 inches.
- Margins: left/right 1.25 inches, top/bottom 1.00 inch.
- No first-page, odd/even header, image, field, content-control, comment, or tracked-change variants.
- One six-column table; grid widths in DXA: 1151, 1259, 1275, 1418, 1582, 1308.

## Typography and components

- Centered title `经 费 使 用 申 请`, 14 pt, source Normal style/direct formatting.
- Right-aligned fill-date line, 14 pt.
- Thin black grid table; labels and values centered, merged purpose and finished-product cells.
- Main information rows: department/applicant/purchaser; leader/captain/teacher; amount/purchase/arrival; inventory/custodian/invoice; annual/current/remaining budget.
- Main detail columns: item, model, quantity, unit price, freight, total.
- Checkout discounts are written as a per-item note in the item-name cell; the six-column layout remains unchanged. Each total equals quantity × unit price + allocated freight − allocated discount.

## Slot map

- Body title: preserve.
- Fill-date paragraph: move to the end of the document, after the main table and any appendix, and replace date with `{fillDate}`.
- Table rows 0–6: replace value cells with named template tags; preserve labels and column geometry.
- Table rows 7–8: preserve section and detail headers.
- Detail area: replace fixed rows with one repeatable `{#mainItems}` row, capped by application data at eight entries.
- Appendix: add only when `hasAppendix` is non-empty; force its heading onto a new page, show the appendix subtotal in the metadata line, repeat the table header, and render `appendixItems`.

## Fidelity and deliberate deviations

- Preserve A4 geometry, margins, title, labels, six-column structure, borders, alignment, and Chinese form appearance.
- Deliberately remove fixed empty rows that forced the source fill-date paragraph onto page 2.
- Deliberately add a conditional appendix for items beyond eight.
- Generated samples must be opened through Microsoft Word, exported to PDF, rendered to PNG, and inspected on every page.
