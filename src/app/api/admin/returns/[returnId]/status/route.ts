import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import ReturnRequest, { ReturnStatus } from "@/models/ReturnRequest";
import {
  restoreReturnedStock,
} from "@/services/inventory.service";
import { sendReturnStatusNotifications } from "@/services/return-notification.service";
import { createReturnRefund } from "@/services/return-refund.service";
import { validateReturnStatusTransition } from "@/services/return.service";

const adminReturnStatusSchema = z
  .object({
    status: z.enum([
      ReturnStatus.REQUESTED,
      ReturnStatus.CONFIRMED,
      ReturnStatus.PICKUP,
      ReturnStatus.RECEIVED,
      ReturnStatus.COMPLETED,
      ReturnStatus.REJECTED,
    ]),
    note: z.string().trim().max(500).optional(),
    rejectionReason: z.string().trim().max(500).optional(),
    pickupAgentName: z.string().trim().max(150).optional(),
    pickupAgentPhone: z.string().trim().max(50).optional(),
    pickupReference: z.string().trim().max(150).optional(),
  })
  .strict();

class ReturnStatusTransitionError extends Error {
  status = 409;
}

class ReturnNotFoundError extends Error {
  status = 404;
}

function handleStatusError(error: unknown) {
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof ReturnStatusTransitionError ||
    error instanceof ReturnNotFoundError
  ) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  console.error("Admin return status update failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { success: false, message: "Unable to update return status" },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ returnId: string }> },
) {
  try {
    getAdminUser(request);
    const { returnId } = await params;

    if (!mongoose.Types.ObjectId.isValid(returnId)) {
      return NextResponse.json(
        { success: false, message: "Invalid return ID" },
        { status: 400 },
      );
    }

    const validationResult = adminReturnStatusSchema.safeParse(await request.json());
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid return status data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const {
      status: requestedStatus,
      note,
      rejectionReason,
      pickupAgentName,
      pickupAgentPhone,
      pickupReference,
    } = validationResult.data;

    const pickupFieldsProvided =
      pickupAgentName !== undefined ||
      pickupAgentPhone !== undefined ||
      pickupReference !== undefined;
    if (pickupFieldsProvided && requestedStatus !== ReturnStatus.PICKUP) {
      return NextResponse.json(
        { success: false, message: "Pickup information is only valid for PICKUP status" },
        { status: 400 },
      );
    }
    if (rejectionReason !== undefined && requestedStatus !== ReturnStatus.REJECTED) {
      return NextResponse.json(
        { success: false, message: "Rejection reason is only valid for REJECTED status" },
        { status: 400 },
      );
    }

    await connectToDatabase();
    const session = await mongoose.startSession();
    let updatedReturn;
    try {
      updatedReturn = await session.withTransaction(async () => {
        const currentReturn = await ReturnRequest.findById(returnId)
          .select("_id user status items inventoryRestored")
          .session(session)
          .lean();

        if (!currentReturn) {
          throw new ReturnNotFoundError("Return request not found");
        }

        const transition = validateReturnStatusTransition(
          currentReturn.status as ReturnStatus,
          requestedStatus as ReturnStatus,
        );
        if (!transition.valid) {
          throw new ReturnStatusTransitionError(transition.reason);
        }

        const changedAt = new Date();
        const statusUpdate: Record<string, unknown> = {
          status: requestedStatus,
        };

        if (requestedStatus === ReturnStatus.CONFIRMED) statusUpdate.confirmedAt = changedAt;
        if (requestedStatus === ReturnStatus.PICKUP) {
          statusUpdate.pickupAt = changedAt;
          if (pickupAgentName !== undefined) statusUpdate.pickupAgentName = pickupAgentName;
          if (pickupAgentPhone !== undefined) statusUpdate.pickupAgentPhone = pickupAgentPhone;
          if (pickupReference !== undefined) statusUpdate.pickupReference = pickupReference;
        }
        if (requestedStatus === ReturnStatus.RECEIVED) statusUpdate.receivedAt = changedAt;
        if (requestedStatus === ReturnStatus.COMPLETED) {
          if (currentReturn.status === ReturnStatus.RECEIVED) {
            await createReturnRefund(
              returnId,
              currentReturn.user.toString(),
              session,
            );
          }
          await restoreReturnedStock(currentReturn.items, session);
          statusUpdate.completedAt = changedAt;
          statusUpdate.inventoryRestored = true;
        }
        if (requestedStatus === ReturnStatus.REJECTED) {
          statusUpdate.rejectedAt = changedAt;
          if (rejectionReason !== undefined || note !== undefined) {
            statusUpdate.rejectionReason = rejectionReason ?? note;
          }
        }

        return ReturnRequest.findOneAndUpdate(
          {
            _id: returnId,
            status: currentReturn.status,
            ...(requestedStatus === ReturnStatus.COMPLETED
              ? { inventoryRestored: { $ne: true } }
              : {}),
          },
          {
            $set: statusUpdate,
            $push: {
              statusHistory: {
                status: requestedStatus,
                changedAt,
                ...(note !== undefined ? { note } : {}),
              },
            },
          },
          { returnDocument: "after", session },
        )
          .select("_id status statusHistory confirmedAt pickupAt receivedAt completedAt rejectedAt rejectionReason pickupAgentName pickupAgentPhone pickupReference updatedAt")
          .lean();
      });
    } finally {
      await session.endSession();
    }

    if (!updatedReturn) {
      throw new ReturnStatusTransitionError(
        "Return status changed before this update could be applied",
      );
    }

    await sendReturnStatusNotifications(returnId, requestedStatus as ReturnStatus);

    return NextResponse.json({
      success: true,
      message: "Return status updated successfully",
      return: {
        id: updatedReturn._id.toString(),
        status: updatedReturn.status,
        statusHistory: updatedReturn.statusHistory,
        confirmedAt: updatedReturn.confirmedAt ?? null,
        pickupAt: updatedReturn.pickupAt ?? null,
        receivedAt: updatedReturn.receivedAt ?? null,
        completedAt: updatedReturn.completedAt ?? null,
        rejectedAt: updatedReturn.rejectedAt ?? null,
        rejectionReason: updatedReturn.rejectionReason ?? null,
        pickupAgentName: updatedReturn.pickupAgentName ?? null,
        pickupAgentPhone: updatedReturn.pickupAgentPhone ?? null,
        pickupReference: updatedReturn.pickupReference ?? null,
        updatedAt: updatedReturn.updatedAt,
      },
    });
  } catch (error: unknown) {
    return handleStatusError(error);
  }
}