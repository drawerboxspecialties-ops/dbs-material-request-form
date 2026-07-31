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

  return { to, subject, body: bodyParts.join("\n") };
}
