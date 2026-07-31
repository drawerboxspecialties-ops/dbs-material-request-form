import { NextResponse } from "next/server";
import { parseRequestItems } from "@/lib/parseItems";
import { createRequest, listRequests } from "@/lib/store";
import { isProductType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ requests: await listRequests() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const customer = String(payload.customer ?? "").trim();
  const poNumber = String(payload.poNumber ?? payload.po ?? "").trim();
  const department = String(payload.department ?? "").trim();
  const requesterName = String(payload.requesterName ?? "").trim();
  const notes = String(payload.notes ?? "").trim();

  let items = parseRequestItems(payload.items);
  if (!items && isProductType(payload.productType)) {
    items = parseRequestItems([
      {
        productType: payload.productType,
        productName: payload.productName ?? payload.materialName,
        quantity: payload.quantity,
        core: payload.core,
        color: payload.color,
        matchToSheet: payload.matchToSheet,
        matchedItemIndex: payload.matchedItemIndex,
      },
    ]);
  }

  if (!items) {
    return NextResponse.json(
      {
        error:
          "Invalid items. Material needs a description. Edgeband needs thickness (and a name or sheet match).",
      },
      { status: 400 },
    );
  }

  if (!customer || !poNumber) {
    return NextResponse.json(
      { error: "customer and poNumber are required" },
      { status: 400 },
    );
  }

  if (!requesterName) {
    return NextResponse.json(
      { error: "requesterName is required" },
      { status: 400 },
    );
  }

  const created = await createRequest({
    customer,
    poNumber,
    items,
    department,
    requesterName,
    notes,
  });

  return NextResponse.json({ request: created }, { status: 201 });
}
