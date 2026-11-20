// Document templates: {{merge.fields}} filled from the employee and contract, then written as DOCX or PDF.
// Pay is deliberately not a merge field, so a generated letter can never leak salary.
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import { dateOnly, fullName } from './rules';

export const MERGE_FIELDS: Record<string, string> = {
  'employee.full_name': 'Full name', 'employee.first_name': 'First name', 'employee.last_name': 'Last name', 'employee.no': 'Employee ID', 'employee.job_title': 'Job title',
  'employee.department': 'Department', 'employee.hire_date': 'Date of employment', 'employee.work_email': 'Work email', 'employee.manager': 'Reporting manager', 'employee.exit_date': 'Exit date',
  'employee.final_working_day': 'Final working day', 'contract.reference': 'Contract reference', 'contract.type': 'Contract type', 'contract.start_date': 'Contract start date',
  'contract.expiry_date': 'Contract expiry date', 'contract.notice_period': 'Notice period', 'company.name': 'Company name', 'today': "Today's date",
  'case.reference': 'Case reference', 'case.hearing_date': 'Hearing date and time', 'case.response_due': 'Response due date', 'case.outcome': 'Case outcome', 'case.summary': 'Case summary',
};

export interface MergeSource {
  employee: { firstName: string; middleName?: string | null; lastName: string; employeeNo: string; jobTitle: string; workEmail?: string | null; hireDate: Date; exitDate?: Date | null; finalWorkingDay?: Date | null; department?: { name: string } | null; manager?: { firstName: string; lastName: string } | null };
  contract?: { reference: string; contractType: string; commencementDate: Date; expiryDate: Date | null; noticeValue: number | null; noticeUnit: string | null } | null;
  case?: { reference: string; hearingAt: Date | null; responseDue: Date | null; outcome: string | null; summary: string } | null;
  companyName: string;
  today: string;
}

const lagosDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d);
const longDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const mergeValues = (s: MergeSource): Record<string, string> => {
  const e = s.employee; const c = s.contract;
  const d = (v: Date | null | undefined) => (v ? longDate(dateOnly(v)) : '');
  return {
    'employee.full_name': fullName(e), 'employee.first_name': e.firstName, 'employee.last_name': e.lastName, 'employee.no': e.employeeNo, 'employee.job_title': e.jobTitle,
    'employee.department': e.department?.name ?? '', 'employee.hire_date': d(e.hireDate), 'employee.work_email': e.workEmail ?? '', 'employee.manager': e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : '',
    'employee.exit_date': d(e.exitDate), 'employee.final_working_day': d(e.finalWorkingDay), 'contract.reference': c?.reference ?? '', 'contract.type': c ? c.contractType.replace(/_/g, ' ').toLowerCase() : '',
    'contract.start_date': d(c?.commencementDate), 'contract.expiry_date': c?.expiryDate ? d(c.expiryDate) : 'no fixed end date',
    'contract.notice_period': c?.noticeValue ? `${c.noticeValue} ${(c.noticeUnit ?? 'days').toLowerCase()}` : '', 'company.name': s.companyName, today: longDate(s.today),
    'case.reference': s.case?.reference ?? '', 'case.hearing_date': s.case?.hearingAt ? `${longDate(lagosDay(s.case.hearingAt))} at ${s.case.hearingAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })}` : '', 'case.response_due': s.case?.responseDue ? d(s.case.responseDue) : '', 'case.outcome': s.case?.outcome ? s.case.outcome.replace(/_/g, ' ').toLowerCase() : '', 'case.summary': s.case?.summary ?? '',
  };
};

/** Fields used in a template body. */
export const fieldsIn = (body: string): string[] => [...new Set([...body.matchAll(/\{\{\s*([a-z_.]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()))];

/** Unknown field names, so a typo is caught when the template is saved and not discovered in a signed letter. */
export const unknownFields = (body: string): string[] => fieldsIn(body).filter((f) => !(f in MERGE_FIELDS));

/** Fill the template. Fields that have no value for this person are reported instead of silently left blank. */
export const renderTemplate = (body: string, values: Record<string, string>): { text: string; empty: string[] } => {
  const empty: string[] = [];
  const text = body.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (_m, f: string) => {
    const v = values[f.toLowerCase()];
    if (v === undefined || v === '') { empty.push(f.toLowerCase()); return ''; }
    return v;
  });
  return { text, empty: [...new Set(empty)] };
};

type Block = { kind: 'h1' | 'h2' | 'p'; text: string };

/** "# Heading", "## Subheading", blank-line separated paragraphs. */
const blocks = (text: string): Block[] =>
  text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean).map((chunk): Block => {
    if (chunk.startsWith('## ')) return { kind: 'h2', text: chunk.slice(3) };
    if (chunk.startsWith('# ')) return { kind: 'h1', text: chunk.slice(2) };
    return { kind: 'p', text: chunk };
  });

export const toDocx = async (text: string): Promise<Buffer> => {
  const children = blocks(text).map((b) => {
    if (b.kind === 'h1') return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: b.text, bold: true })], spacing: { after: 240 } });
    if (b.kind === 'h2') return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: b.text, bold: true })], spacing: { before: 200, after: 120 } });
    const lines = b.text.split('\n');
    return new Paragraph({ spacing: { after: 160 }, children: lines.flatMap((l, i) => [new TextRun({ text: l, break: i ? 1 : 0 })]) });
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
};

export const toPdf = (text: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 64 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (const b of blocks(text)) {
      if (b.kind === 'h1') doc.font('Helvetica-Bold').fontSize(18).text(b.text, { paragraphGap: 12 });
      else if (b.kind === 'h2') doc.font('Helvetica-Bold').fontSize(13).text(b.text, { paragraphGap: 6 });
      else doc.font('Helvetica').fontSize(11).text(b.text, { paragraphGap: 8, lineGap: 2 });
    }
    doc.end();
  });

export const DEFAULT_TEMPLATES: { slug: string; name: string; kind: 'CONTRACT' | 'LETTER' | 'EXIT'; body: string }[] = [
  { slug: 'disciplinary-query', name: 'Disciplinary query', kind: 'LETTER', body: "# Query\n\n{{today}}\n\nDear {{employee.first_name}},\n\nReference: {{case.reference}}\n\nIt has been brought to our attention that {{case.summary}}\n\nYou are required to respond in writing to Human Resources by {{case.response_due}}. You have the right to explain your side before any decision is made.\n\nHuman Resources\n{{company.name}}" },
  { slug: 'hearing-invitation', name: 'Disciplinary hearing invitation', kind: 'LETTER', body: "# Invitation to a Hearing\n\n{{today}}\n\nDear {{employee.first_name}},\n\nReference: {{case.reference}}\n\nYou are invited to attend a hearing on {{case.hearing_date}} about the matter raised with you. You may bring a colleague or representative to support you.\n\nHuman Resources\n{{company.name}}" },
  { slug: 'case-outcome', name: 'Case outcome letter', kind: 'LETTER', body: "# Outcome\n\n{{today}}\n\nDear {{employee.first_name}},\n\nReference: {{case.reference}}\n\nFollowing the process, the outcome is: {{case.outcome}}.\n\nIf you disagree, you may appeal in writing to Human Resources within seven days of this letter.\n\nHuman Resources\n{{company.name}}" },
  { slug: 'certificate-of-service', name: 'Certificate of service', kind: 'EXIT', body: '# Certificate of Service\n\n{{today}}\n\nTO WHOM IT MAY CONCERN\n\nThis is to certify that {{employee.full_name}} ({{employee.no}}) was employed by {{company.name}} as {{employee.job_title}} in the {{employee.department}} department from {{employee.hire_date}} to {{employee.final_working_day}}.\n\nDuring this period the employee carried out their duties diligently.\n\nHuman Resources\n{{company.name}}' },
  { slug: 'reference-letter', name: 'Reference letter', kind: 'EXIT', body: '# Reference\n\n{{today}}\n\nTO WHOM IT MAY CONCERN\n\n{{employee.full_name}} worked with {{company.name}} as {{employee.job_title}} ({{employee.department}}) from {{employee.hire_date}} to {{employee.final_working_day}}.\n\nWe confirm these dates of employment. Any further assessment should be requested from the Human Resources department.\n\nHuman Resources\n{{company.name}}' },
  { slug: 'non-renewal-notice', name: 'Notice of non-renewal', kind: 'LETTER', body: '# Notice of Non-Renewal\n\n{{today}}\n\nDear {{employee.first_name}},\n\nYour {{contract.type}} contract ({{contract.reference}}) with {{company.name}} ends on {{contract.expiry_date}}. We have decided not to renew it, and your final working day will be {{employee.final_working_day}}.\n\nHuman Resources will contact you about handover, return of company property and clearance. Please speak to HR if you have any questions.\n\nHuman Resources\n{{company.name}}' },
  { slug: 'employment-confirmation', name: 'Confirmation of employment', kind: 'LETTER', body: '# Confirmation of Employment\n\n{{today}}\n\nTO WHOM IT MAY CONCERN\n\nThis confirms that {{employee.full_name}} ({{employee.no}}) is employed by {{company.name}} as {{employee.job_title}} in the {{employee.department}} department, since {{employee.hire_date}}.\n\nHuman Resources\n{{company.name}}' },
  { slug: 'fixed-term-contract', name: 'Fixed-term employment contract (starter)', kind: 'CONTRACT', body: '# Contract of Employment\n\nContract reference: {{contract.reference}}\n\nBetween {{company.name}} (the Company) and {{employee.full_name}} (the Employee).\n\n## 1. Position\n\nThe Employee is engaged as {{employee.job_title}} in the {{employee.department}} department, reporting to {{employee.manager}}.\n\n## 2. Term\n\nThis {{contract.type}} contract starts on {{contract.start_date}} and ends on {{contract.expiry_date}}, unless ended earlier in line with its terms.\n\n## 3. Notice\n\nEither party may end this contract by giving {{contract.notice_period}} notice.\n\n## 4. Remuneration\n\nRemuneration is set out in the Employee\'s separate remuneration letter.\n\nThis starter text must be reviewed by legal counsel before it is approved for use.' },
];
