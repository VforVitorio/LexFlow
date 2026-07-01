/**
 * The little eyebrow above a section title: a pulsing dot + an uppercase label.
 *
 * Extracted from the 12 sections that repeated this exact block verbatim
 * (#742). `center` applies `.section-eyebrow-center` (was an inline
 * `justify-content: center` on CTA + Downloads).
 */
export function SectionEyebrow({ label, center = false }: { label: string; center?: boolean }) {
  return (
    <div className={`section-eyebrow${center ? ' section-eyebrow-center' : ''}`}>
      <span className="dot" />
      <span className="label-caps">{label}</span>
    </div>
  );
}
