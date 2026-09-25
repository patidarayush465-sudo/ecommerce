import mongoose from "mongoose";

import { OrderStatus } from "@/models/Order";
import ReturnRequest, {
  ReturnReason,
  ReturnStatus,
} from "@/models/ReturnRequest";
import type { RequestedReturnItem } from "@/validations/return.validation";

type ReturnOrderItem = {
  product: { toString(): string };
  productName: string;
  productImage?: string;
  price: number;
  quantity: number;
};

type ReturnOrder = {
  _id: { toString(): string };
  user: { toString(): string };
  orderStatus: OrderStatus;
  items: ReturnOrderItem[];
};

export type ReturnEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string };

export type ReturnItemValidationResult =
  | { valid: true; items: RequestedReturnItem[] }
  | { valid: false; errors: string[] };

export type ReturnItemSnapshot = {
  product: { toString(): string };
  productName: string;
  productImage?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export class ReturnQuantityError extends Error {
  status = 409;

  constructor() {
    super("Requested return quantity exceeds the remaining returnable quantity.");
    this.name = "ReturnQuantityError";
  }
}

const allowedTransitions: Record<ReturnStatus, ReturnStatus[]> = {
  [ReturnStatus.REQUESTED]: [ReturnStatus.CONFIRMED, ReturnStatus.REJECTED],
  [ReturnStatus.CONFIRMED]: [ReturnStatus.PICKUP, ReturnStatus.REJECTED],
  [ReturnStatus.PICKUP]: [ReturnStatus.RECEIVED],
  [ReturnStatus.RECEIVED]: [ReturnStatus.COMPLETED],
  [ReturnStatus.COMPLETED]: [],
  [ReturnStatus.REJECTED]: [],
};

export function getReturnRequestById(returnId: string, userId?: string) {
  if (!mongoose.Types.ObjectId.isValid(returnId)) return null;
  if (userId && !mongoose.Types.ObjectId.isValid(userId)) return null;

  return ReturnRequest.findOne({
    _id: returnId,
    ...(userId ? { user: userId } : {}),
  });
}

export function validateReturnEligibility(
  order: ReturnOrder | null,
  userId: string,
): ReturnEligibilityResult {
  if (!order) {
    return { eligible: false, reason: "Order not found" };
  }

  if (order.user.toString() !== userId) {
    return { eligible: false, reason: "Order does not belong to the customer" };
  }

  if (order.orderStatus !== OrderStatus.DELIVERED) {
    return { eligible: false, reason: "Only delivered orders are eligible for return" };
  }

  return { eligible: true };
}

export function validateReturnItems(
  order: ReturnOrder,
  requestedItems: RequestedReturnItem[],
  returnedQuantityByProduct = new Map<string, number>(),
): ReturnItemValidationResult {
  const requestedQuantityByProduct = new Map<string, number>();
  const errors: string[] = [];

  for (const requestedItem of requestedItems) {
    const currentQuantity = requestedQuantityByProduct.get(requestedItem.productId) ?? 0;
    requestedQuantityByProduct.set(
      requestedItem.productId,
      currentQuantity + requestedItem.quantity,
    );
  }

  for (const [productId, requestedQuantity] of requestedQuantityByProduct) {
    const orderItem = order.items.find((item) => item.product.toString() === productId);

    if (!orderItem) {
      errors.push(`Product ${productId} is not part of this order`);
      continue;
    }

    const availableQuantity =
      orderItem.quantity - (returnedQuantityByProduct.get(productId) ?? 0);
    if (requestedQuantity > availableQuantity) {
      errors.push(`Requested quantity for product ${productId} exceeds the available quantity`);
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    items: [...requestedQuantityByProduct.entries()].map(([productId, quantity]) => ({
      productId,
      quantity,
    })),
  };
}

export function buildReturnItemSnapshots(
  order: ReturnOrder,
  requestedItems: RequestedReturnItem[],
): ReturnItemSnapshot[] {
  return requestedItems.map((requestedItem) => {
    const orderItem = order.items.find(
      (item) => item.product.toString() === requestedItem.productId,
    );

    if (!orderItem) {
      throw new Error(`Product ${requestedItem.productId} is not part of this order`);
    }

    return {
      product: orderItem.product,
      productName: orderItem.productName,
      ...(orderItem.productImage ? { productImage: orderItem.productImage } : {}),
      quantity: requestedItem.quantity,
      unitPrice: orderItem.price,
      subtotal: orderItem.price * requestedItem.quantity,
    };
  });
}

export type ReturnStatusTransitionResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateReturnStatusTransition(
  currentStatus: ReturnStatus,
  nextStatus: ReturnStatus,
): ReturnStatusTransitionResult {
  if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
    return {
      valid: false,
      reason: `Return cannot transition from ${currentStatus} to ${nextStatus}`,
    };
  }

  return { valid: true };
}

export async function createReturnRequest({
  order,
  userId,
  items,
  reason,
  reasonDetails,
  session,
}: {
  order: ReturnOrder | null;
  userId: string;
  items: RequestedReturnItem[];
  reason: ReturnReason;
  reasonDetails?: string;
  session?: mongoose.ClientSession;
}) {
  const eligibility = validateReturnEligibility(order, userId);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason);
  }
  if (!order) {
    throw new Error("Order not found");
  }

  const existingReturns = await ReturnRequest.find({
    order: order._id,
    user: userId,
    status: {
      $in: [
        ReturnStatus.REQUESTED,
        ReturnStatus.CONFIRMED,
        ReturnStatus.PICKUP,
        ReturnStatus.RECEIVED,
        ReturnStatus.COMPLETED,
      ],
    },
  })
    .select("items")
    .session(session ?? null)
    .lean();
  const returnedQuantityByProduct = new Map<string, number>();
  for (const existingReturn of existingReturns) {
    for (const item of existingReturn.items) {
      const productId = item.product.toString();
      returnedQuantityByProduct.set(
        productId,
        (returnedQuantityByProduct.get(productId) ?? 0) + item.quantity,
      );
    }
  }

  const itemValidation = validateReturnItems(
    order,
    items,
    returnedQuantityByProduct,
  );
  if (!itemValidation.valid) {
    throw new ReturnQuantityError();
  }

  const snapshots = buildReturnItemSnapshots(order, itemValidation.items);
  const requestedAt = new Date();

  const returnData = {
    user: order.user,
    order: order._id,
    items: snapshots,
    reason,
    reasonDetails,
    status: ReturnStatus.REQUESTED,
    requestedAt,
    statusHistory: [
      {
        status: ReturnStatus.REQUESTED,
        changedAt: requestedAt,
      },
    ],
  };
  if (session) {
    const [createdReturn] = await ReturnRequest.create([returnData], { session });
    return createdReturn;
  }
  return ReturnRequest.create(returnData);
}

