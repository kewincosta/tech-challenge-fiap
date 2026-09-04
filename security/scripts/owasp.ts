/**
 * OWASP Top 10 2021 mapping.
 *
 * The rule everywhere here is the same: map only what there is a documented basis for, and return
 * null otherwise so the report prints "Not determined". A category invented to fill a table is
 * worse than an empty cell, because a reader cannot tell the two apart.
 */

export interface OwaspCategory {
  id: string;
  title: string;
}

export const OWASP_TOP_10: readonly OwaspCategory[] = [
  { id: 'A01', title: 'Broken Access Control' },
  { id: 'A02', title: 'Cryptographic Failures' },
  { id: 'A03', title: 'Injection' },
  { id: 'A04', title: 'Insecure Design' },
  { id: 'A05', title: 'Security Misconfiguration' },
  { id: 'A06', title: 'Vulnerable and Outdated Components' },
  { id: 'A07', title: 'Identification and Authentication Failures' },
  { id: 'A08', title: 'Software and Data Integrity Failures' },
  { id: 'A09', title: 'Security Logging and Monitoring Failures' },
  { id: 'A10', title: 'Server-Side Request Forgery' },
] as const;

const CATEGORY_BY_ID = new Map(OWASP_TOP_10.map((category) => [category.id, category]));

/**
 * CWE to OWASP Top 10 2021, taken from the CWE lists OWASP publishes with each category. Only
 * entries whose category is stated by that mapping are here; a CWE absent from this table yields
 * null rather than a nearest guess.
 */
const CWE_TO_OWASP: Record<string, string> = {
  // A01 Broken Access Control
  'CWE-22': 'A01',
  'CWE-23': 'A01',
  'CWE-35': 'A01',
  'CWE-59': 'A01',
  'CWE-200': 'A01',
  'CWE-201': 'A01',
  'CWE-219': 'A01',
  'CWE-264': 'A01',
  'CWE-275': 'A01',
  'CWE-276': 'A01',
  'CWE-284': 'A01',
  'CWE-285': 'A01',
  'CWE-352': 'A01',
  'CWE-359': 'A01',
  'CWE-377': 'A01',
  'CWE-402': 'A01',
  'CWE-425': 'A01',
  'CWE-441': 'A01',
  'CWE-497': 'A01',
  'CWE-538': 'A01',
  'CWE-540': 'A01',
  'CWE-548': 'A01',
  'CWE-552': 'A01',
  'CWE-566': 'A01',
  'CWE-601': 'A01',
  'CWE-639': 'A01',
  'CWE-651': 'A01',
  'CWE-668': 'A01',
  'CWE-706': 'A01',
  'CWE-862': 'A01',
  'CWE-863': 'A01',
  'CWE-913': 'A01',
  'CWE-922': 'A01',
  'CWE-1275': 'A01',
  // A02 Cryptographic Failures
  'CWE-261': 'A02',
  'CWE-296': 'A02',
  'CWE-310': 'A02',
  'CWE-319': 'A02',
  'CWE-321': 'A02',
  'CWE-322': 'A02',
  'CWE-323': 'A02',
  'CWE-324': 'A02',
  'CWE-325': 'A02',
  'CWE-326': 'A02',
  'CWE-327': 'A02',
  'CWE-328': 'A02',
  'CWE-329': 'A02',
  'CWE-330': 'A02',
  'CWE-331': 'A02',
  'CWE-335': 'A02',
  'CWE-336': 'A02',
  'CWE-337': 'A02',
  'CWE-338': 'A02',
  'CWE-340': 'A02',
  'CWE-347': 'A02',
  'CWE-523': 'A02',
  'CWE-720': 'A02',
  'CWE-757': 'A02',
  'CWE-759': 'A02',
  'CWE-760': 'A02',
  'CWE-780': 'A02',
  'CWE-818': 'A02',
  'CWE-916': 'A02',
  // A03 Injection
  'CWE-20': 'A03',
  'CWE-74': 'A03',
  'CWE-75': 'A03',
  'CWE-77': 'A03',
  'CWE-78': 'A03',
  'CWE-79': 'A03',
  'CWE-80': 'A03',
  'CWE-83': 'A03',
  'CWE-87': 'A03',
  'CWE-88': 'A03',
  'CWE-89': 'A03',
  'CWE-90': 'A03',
  'CWE-91': 'A03',
  'CWE-93': 'A03',
  'CWE-94': 'A03',
  'CWE-95': 'A03',
  'CWE-96': 'A03',
  'CWE-97': 'A03',
  'CWE-98': 'A03',
  'CWE-99': 'A03',
  'CWE-113': 'A03',
  'CWE-116': 'A03',
  'CWE-138': 'A03',
  'CWE-184': 'A03',
  'CWE-470': 'A03',
  'CWE-471': 'A03',
  'CWE-564': 'A03',
  'CWE-610': 'A03',
  'CWE-643': 'A03',
  'CWE-644': 'A03',
  'CWE-652': 'A03',
  'CWE-917': 'A03',
  // A04 Insecure Design
  'CWE-73': 'A04',
  'CWE-183': 'A04',
  'CWE-209': 'A04',
  'CWE-235': 'A04',
  'CWE-256': 'A04',
  'CWE-257': 'A04',
  'CWE-266': 'A04',
  'CWE-269': 'A04',
  'CWE-280': 'A04',
  'CWE-311': 'A04',
  'CWE-312': 'A04',
  'CWE-313': 'A04',
  'CWE-316': 'A04',
  'CWE-419': 'A04',
  'CWE-430': 'A04',
  'CWE-434': 'A04',
  'CWE-444': 'A04',
  'CWE-451': 'A04',
  'CWE-472': 'A04',
  'CWE-501': 'A04',
  'CWE-522': 'A04',
  'CWE-525': 'A04',
  'CWE-539': 'A04',
  'CWE-579': 'A04',
  'CWE-598': 'A04',
  'CWE-602': 'A04',
  'CWE-642': 'A04',
  'CWE-646': 'A04',
  'CWE-650': 'A04',
  'CWE-653': 'A04',
  'CWE-656': 'A04',
  'CWE-657': 'A04',
  'CWE-799': 'A04',
  'CWE-807': 'A04',
  'CWE-840': 'A04',
  'CWE-841': 'A04',
  'CWE-927': 'A04',
  'CWE-1021': 'A04',
  'CWE-1173': 'A04',
  // A05 Security Misconfiguration
  'CWE-2': 'A05',
  'CWE-11': 'A05',
  'CWE-13': 'A05',
  'CWE-15': 'A05',
  'CWE-16': 'A05',
  'CWE-260': 'A05',
  'CWE-315': 'A05',
  'CWE-520': 'A05',
  'CWE-526': 'A05',
  'CWE-537': 'A05',
  'CWE-541': 'A05',
  'CWE-547': 'A05',
  'CWE-611': 'A05',
  'CWE-614': 'A05',
  'CWE-756': 'A05',
  'CWE-776': 'A05',
  'CWE-942': 'A05',
  'CWE-1004': 'A05',
  'CWE-1032': 'A05',
  'CWE-1174': 'A05',
  // A06 Vulnerable and Outdated Components
  'CWE-937': 'A06',
  'CWE-1035': 'A06',
  'CWE-1104': 'A06',
  // A07 Identification and Authentication Failures
  'CWE-255': 'A07',
  'CWE-259': 'A07',
  'CWE-287': 'A07',
  'CWE-288': 'A07',
  'CWE-290': 'A07',
  'CWE-294': 'A07',
  'CWE-295': 'A07',
  'CWE-297': 'A07',
  'CWE-300': 'A07',
  'CWE-302': 'A07',
  'CWE-304': 'A07',
  'CWE-306': 'A07',
  'CWE-307': 'A07',
  'CWE-346': 'A07',
  'CWE-384': 'A07',
  'CWE-521': 'A07',
  'CWE-613': 'A07',
  'CWE-620': 'A07',
  'CWE-640': 'A07',
  'CWE-798': 'A07',
  'CWE-940': 'A07',
  'CWE-1216': 'A07',
  // A08 Software and Data Integrity Failures
  'CWE-345': 'A08',
  'CWE-353': 'A08',
  'CWE-426': 'A08',
  'CWE-494': 'A08',
  'CWE-502': 'A08',
  'CWE-565': 'A08',
  'CWE-784': 'A08',
  'CWE-829': 'A08',
  'CWE-830': 'A08',
  'CWE-915': 'A08',
  // A09 Security Logging and Monitoring Failures
  'CWE-117': 'A09',
  'CWE-223': 'A09',
  'CWE-532': 'A09',
  'CWE-778': 'A09',
  // A10 SSRF
  'CWE-918': 'A10',
};

/** The first CWE that has a documented category wins. Null when none of them do. */
export function owaspFromCwes(cwes: readonly string[]): string | null {
  for (const cwe of cwes) {
    const category = CWE_TO_OWASP[cwe];
    if (category) {
      return category;
    }
  }
  return null;
}

/**
 * Reads an OWASP identifier out of the free-form strings Semgrep puts in `metadata.owasp`, which
 * range from `A03:2021 - Injection` to `A3:2017 - Injection`. Only the 2021 list is accepted: the
 * 2017 numbering is a different taxonomy, and silently treating `A3:2017` as `A03:2021` would
 * misfile it.
 */
export function owaspFromMetadata(values: readonly string[]): string | null {
  for (const value of values) {
    const match = /A(\d{1,2})\s*:\s*2021/i.exec(value);
    if (!match) {
      continue;
    }
    const id = `A${match[1].padStart(2, '0')}`;
    if (CATEGORY_BY_ID.has(id)) {
      return id;
    }
  }
  return null;
}

export function owaspTitle(id: string | null): string {
  if (!id) {
    return 'Not determined';
  }
  const category = CATEGORY_BY_ID.get(id);
  return category ? `${category.id} - ${category.title}` : 'Not determined';
}
