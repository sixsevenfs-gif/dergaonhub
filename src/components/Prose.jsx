// Small text helpers for the policy pages.
export const H = ({ children }) => <h2 className="mt-6 text-lg font-bold text-white">{children}</h2>
export const P = ({ children }) => <p className="mt-2 leading-relaxed">{children}</p>
export const UL = ({ items }) => (
  <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
    {items.map((t, i) => <li key={i}>{t}</li>)}
  </ul>
)
