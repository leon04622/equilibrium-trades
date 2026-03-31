export type CrmCsvExportRow = {
  wallet: string;
  email?: string | null;
  joinDate?: string | null;
  subTier: string;
  status?: string;
  manualProOverride?: boolean;
  builderStatus?: string;
};

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CRM_CSV_HEADERS = [
  "wallet",
  "email",
  "joinDate",
  "subTier",
  "status",
  "manualProOverride",
  "builderStatus",
] as const;

export function crmUsersToCsv(rows: CrmCsvExportRow[]): string {
  const lines = [CRM_CSV_HEADERS.join(",")];
  for (const row of rows) {
    const cells = CRM_CSV_HEADERS.map((h) => {
      const raw =
        h === "manualProOverride"
          ? row.manualProOverride === true
            ? "true"
            : row.manualProOverride === false
              ? "false"
              : ""
          : String(row[h] ?? "");
      return escapeCsvCell(raw);
    });
    lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}
