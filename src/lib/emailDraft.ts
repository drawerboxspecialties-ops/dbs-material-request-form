import {
  PRODUCT_TYPE_LABELS,
  formatEdgebandSpec,
  formatMaterialSpec,
  type MaterialRequest,
  type RequestItem,
} from "@/lib/types";
import { vendorEmailTo, type Vendor } from "@/lib/vendors";

export type EmailDraft = {
  to: string;
  bcc: string;
  subject: string;
  body: string;
};

function describeItem(item: RequestItem, index: number) {
  const lines = [
    `${index + 1}. ${PRODUCT_TYPE_LABELS[item.productType]} — ${item.productName}`,
    `   Qty: ${item.quantity} ${item.unit}`,
  ];

  if (item.productType === "material") {
    const spec = formatMaterialSpec(item);
    if (spec) lines.push(`   Core / Color: ${spec}`);
    if (item.managerResponse?.sheetSize) {
      lines.push(`   Sheet size: ${item.managerResponse.sheetSize}`);
    }
  }

  if (item.productType === "edgeband") {
    const spec = formatEdgebandSpec(item);
    if (spec) lines.push(`   ${spec}`);
  }

  return lines.join("\n");
}

function uniqueEmails(vendors: Vendor[]) {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const vendor of vendors) {
    for (const email of vendor.emails) {
      const key = email.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      emails.push(email.trim());
    }
  }
  return emails;
}

export function buildVendorEmailDraft(
  request: MaterialRequest,
  options: {
    toVendor?: Vendor | null;
    bccVendors?: Vendor[];
  } = {},
): EmailDraft {
  const toVendor = options.toVendor ?? null;
  const bccVendors = options.bccVendors ?? [];
  const to = toVendor ? vendorEmailTo(toVendor) : "";
  const bcc = uniqueEmails(bccVendors).join("; ");

  // Keep greeting generic when BCCing multiple vendors so no one is named.
  const greeting =
    bccVendors.length > 1
      ? "Hello,"
      : toVendor?.contactName
        ? `Hi ${toVendor.contactName},`
        : bccVendors[0]?.contactName
          ? `Hi ${bccVendors[0].contactName},`
          : "Hello,";

  const subject = "Material Request";

  const itemBlock =
    request.items.length > 0
      ? request.items.map((item, index) => describeItem(item, index)).join("\n")
      : "(No line items)";

  const bodyParts = [
    greeting,
    "",
    "Please quote / confirm availability for the following:",
    "",
    "Items:",
    itemBlock,
  ];

  if (request.notes?.trim()) {
    bodyParts.push("", `Notes: ${request.notes.trim()}`);
  }

  return { to, bcc, subject, body: bodyParts.join("\n") };
}
