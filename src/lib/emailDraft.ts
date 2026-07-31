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

export function buildVendorEmailDraft(
  request: MaterialRequest,
  vendor: Vendor | null,
): EmailDraft {
  const to = vendor ? vendorEmailTo(vendor) : "";
  const greeting = vendor?.contactName
    ? `Hi ${vendor.contactName},`
    : "Hello,";

  const subject = `Material Request — ${request.customer || "Customer"} / PO ${request.poNumber || "—"}`;

  const itemBlock =
    request.items.length > 0
      ? request.items.map((item, index) => describeItem(item, index)).join("\n")
      : "(No line items)";

  const body = [
    greeting,
    "",
    "Please quote / confirm availability for the following request from Drawer Box Specialties:",
    "",
    `Customer: ${request.customer || "—"}`,
    `PO: ${request.poNumber || "—"}`,
    `Requester: ${request.requesterName || "—"} (${request.department || "—"})`,
    "",
    "Items:",
    itemBlock,
    "",
    request.notes?.trim()
      ? `Notes: ${request.notes.trim()}`
      : "Notes: (none)",
    "",
    "Please reply with availability, lead time, pricing, and vendor confirmation.",
    "",
    "Thank you,",
    request.requesterName?.trim() || "Drawer Box Specialties",
    "Drawer Box Specialties",
  ].join("\n");

  return { to, subject, body };
}
