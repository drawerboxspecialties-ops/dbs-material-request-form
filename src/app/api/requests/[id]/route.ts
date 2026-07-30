import { NextResponse } from "next/server";
import { isValidManagerPassword } from "@/lib/managerAuth";
import { parseRequestItems } from "@/lib/parseItems";
import { updateRequest } from "@/lib/store";
import {
  STATUSES,
  isAvailability,
  type UpdateMaterialRequestInput,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

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
  const input: UpdateMaterialRequestInput = {};
  const managerPassword = payload.managerPassword;

  if (payload.customer !== undefined) {
    const customer = String(payload.customer).trim();
    if (!customer) {
      return NextResponse.json({ error: "customer cannot be empty" }, { status: 400 });
    }
    input.customer = customer;
  }

  if (payload.poNumber !== undefined || payload.po !== undefined) {
    const poNumber = String(payload.poNumber ?? payload.po ?? "").trim();
    if (!poNumber) {
      return NextResponse.json({ error: "poNumber cannot be empty" }, { status: 400 });
    }
    input.poNumber = poNumber;
  }

  if (payload.department !== undefined) {
    const department = String(payload.department).trim();
    if (!department) {
      return NextResponse.json(
        { error: "department cannot be empty" },
        { status: 400 },
      );
    }
    input.department = department;
  }

  if (payload.requesterName !== undefined) {
    const requesterName = String(payload.requesterName).trim();
    if (!requesterName) {
      return NextResponse.json(
        { error: "requesterName cannot be empty" },
        { status: 400 },
      );
    }
    input.requesterName = requesterName;
  }

  if (payload.status !== undefined) {
    if (
      typeof payload.status !== "string" ||
      !(STATUSES as readonly string[]).includes(payload.status)
    ) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    input.status = payload.status as UpdateMaterialRequestInput["status"];
  }

  if (payload.notes !== undefined) {
    input.notes = String(payload.notes);
  }

  if (payload.items !== undefined) {
    const items = parseRequestItems(payload.items);
    if (!items) {
      return NextResponse.json(
        {
          error:
            "Invalid items. Material needs core + color. Edgeband needs matchToSheet.",
        },
        { status: 400 },
      );
    }
    input.items = items;
  }

  const itemId = String(payload.itemId ?? "").trim();
  const managerResponseRaw = payload.managerResponse;
  const isManagerAction =
    input.status !== undefined ||
    managerResponseRaw !== undefined ||
    Boolean(itemId);

  if (isManagerAction && !isValidManagerPassword(managerPassword)) {
    return NextResponse.json(
      {
        error:
          "Manager password required. Only managers can reply or update status.",
      },
      { status: 401 },
    );
  }

  if (managerResponseRaw !== undefined || itemId) {
    if (!itemId) {
      return NextResponse.json(
        { error: "itemId is required when saving a manager reply" },
        { status: 400 },
      );
    }

    if (!managerResponseRaw || typeof managerResponseRaw !== "object") {
      return NextResponse.json(
        { error: "Invalid managerResponse" },
        { status: 400 },
      );
    }

    const response = managerResponseRaw as Record<string, unknown>;
    const availability = response.availability;
    const leadTime = String(response.leadTime ?? "").trim();
    const price = String(response.price ?? "").trim();
    const vendor = String(response.vendor ?? "").trim();
    const respondedBy = String(response.respondedBy ?? "").trim();

    if (!isAvailability(availability)) {
      return NextResponse.json(
        { error: "Invalid availability" },
        { status: 400 },
      );
    }

    if (!leadTime || !price || !vendor || !respondedBy) {
      return NextResponse.json(
        {
          error:
            "managerResponse requires availability, leadTime, price, vendor, and respondedBy",
        },
        { status: 400 },
      );
    }

    input.itemReply = {
      itemId,
      managerResponse: {
        availability,
        leadTime,
        price,
        vendor,
        respondedBy,
      },
    };
  }

  if (
    input.customer === undefined &&
    input.poNumber === undefined &&
    input.department === undefined &&
    input.requesterName === undefined &&
    input.status === undefined &&
    input.notes === undefined &&
    input.items === undefined &&
    input.itemReply === undefined
  ) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = updateRequest(id, input);
  if (!updated) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  return NextResponse.json({ request: updated });
}
