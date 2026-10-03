/** Paise to a rupee string, for example 49900 becomes "₹499". Money is stored as integer paise. */
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
