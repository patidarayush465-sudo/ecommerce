import mongoose from "mongoose";

import Order, { PaymentMethod, PaymentStatus } from "@/models/Order";
import ReturnRefund, {
  RefundPaymentMethod,
  RefundStatus,
} from "@/models/ReturnRefund";
import ReturnRequest, { ReturnStatus } from "@/models/ReturnRequest";
import {
  createRefundSchema,
  type CreateRefundInput,
} from "@/validations/refund.validation";

export class ReturnRefundServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ReturnRefundServiceError";
  }
}

type ReturnRefundSource = {
  _id: { toString(): string };
  user: { toString(): string };
  order: { toString(): string };
  status: ReturnStatus;
  items: Array<{
    product: { toString(): string };
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
};

type ReturnRefundCalculation = {
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  refundAmount: number;
  currency: "INR";
};

function assertValidReturnRequestId(returnRequestId: string) {
  if (!mongoose.Types.ObjectId.isValid(returnRequestId)) {
    throw new ReturnRefundServiceError("Invalid return request ID", 400);
  }
}

function getId(value: { toString(): string } | string) {
  return typeof value === "string" ? value : value.toString();
}

export function getReturnRefundByReturnRequestId(returnRequestId: string) {
  if (!mongoose.Types.ObjectId.isValid(returnRequestId)) return null;
  return ReturnRefund.findOne({ returnRequest: returnRequestId });
}

export function calculateReturnRefundAmount(
  returnRequest: ReturnRefundSource,
): ReturnRefundCalculation {
  if (!Array.isArray(returnRequest.items) || returnRequest.items.length === 0) {
    throw new ReturnRefundServiceError("Return request has no refundable items", 422);
  }

  const productIds = new Set<string>();
  let refundAmount = 0;
  const items = returnRequest.items.map((item) => {
    const productId = getId(item.product);
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new ReturnRefundServiceError("Return request contains an invalid product", 422);
    }
    if (productIds.has(productId)) {
      throw new ReturnRefundServiceError(
        "Return request contains duplicate products",
        422,
      );
    }
    productIds.add(productId);

    if (!item.productName.trim()) {
      throw new ReturnRefundServiceError(
        "Return request contains an invalid product name",
        422,
      );
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new ReturnRefundServiceError(
        "Return request contains an invalid quantity",
        422,
      );
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      throw new ReturnRefundServiceError(
        "Return request contains an invalid historical price",
        422,
      );
    }

    const amount = item.unitPrice * item.quantity;
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ReturnRefundServiceError(
        "Return request contains an invalid refund amount",
        422,
      );
    }
    refundAmount += amount;

    return {
      productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount,
    };
  });

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw new ReturnRefundServiceError(
      "Refund amount must be greater than zero",
      422,
    );
  }

  return { items, refundAmount, currency: "INR" };
}

function isDuplicateKeyError(error: unknown) {
  return (
    error instanceof mongoose.mongo.MongoServerError && error.code === 11000
  );
}

async function createRefundRecord(
  returnRequestId: string,
  userId: string,
  session?: mongoose.ClientSession,
) {
  async function createWithinSession(transactionSession: mongoose.ClientSession) {
      const existingRefund = await ReturnRefund.findOne({
        returnRequest: returnRequestId,
      })
        .session(transactionSession)
        .lean();
      if (existingRefund) return existingRefund;

      const returnRequest = (await ReturnRequest.findOne({
        _id: returnRequestId,
        user: userId,
      })
        .select("_id user order status items")
        .session(transactionSession)
        .lean()) as ReturnRefundSource | null;

      if (!returnRequest) {
        throw new ReturnRefundServiceError("Return request not found", 404);
      }
      if (returnRequest.status === ReturnStatus.REJECTED) {
        throw new ReturnRefundServiceError(
          "Rejected returns cannot create refunds",
          409,
        );
      }

      const order = await Order.findOne({
        _id: returnRequest.order,
        user: userId,
      })
        .select("_id user paymentMethod paymentStatus")
        .session(transactionSession)
        .lean();

      if (!order) {
        throw new ReturnRefundServiceError("Order not found", 404);
      }
      if (getId(order.user) !== getId(returnRequest.user)) {
        throw new ReturnRefundServiceError("Return ownership mismatch", 403);
      }
      if (getId(returnRequest.order) !== getId(order._id)) {
        throw new ReturnRefundServiceError("Return order mismatch", 422);
      }

      let paymentMethod: RefundPaymentMethod;
      if (order.paymentMethod === PaymentMethod.ONLINE) {
        if (order.paymentStatus !== PaymentStatus.PAID) {
          throw new ReturnRefundServiceError(
            "Online order payment has not been completed",
            409,
          );
        }
        paymentMethod = RefundPaymentMethod.ONLINE;
      } else if (order.paymentMethod === PaymentMethod.COD) {
        paymentMethod = RefundPaymentMethod.COD;
      } else {
        throw new ReturnRefundServiceError("Unsupported payment method", 422);
      }

      const calculation = calculateReturnRefundAmount(returnRequest);
      const validationItems = calculation.items.map(
        (item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
        }),
      );
      const input: CreateRefundInput = {
        returnRequestId,
        orderId: getId(order._id),
        userId,
        items: validationItems,
        refundAmount: calculation.refundAmount,
        currency: calculation.currency,
        paymentMethod,
      };
      const validationResult = createRefundSchema.safeParse(input);
      if (!validationResult.success) {
        throw new ReturnRefundServiceError(
          "Calculated refund data is invalid",
          422,
        );
      }

      const [createdRefund] = await ReturnRefund.create(
        [
          {
            user: userId,
            order: order._id,
            returnRequest: returnRequest._id,
            items: calculation.items.map((item) => ({
              product: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
            })),
            refundAmount: calculation.refundAmount,
            currency: calculation.currency,
            paymentMethod,
            paymentStatus: RefundStatus.PENDING,
            processingKey: `return-refund:${returnRequestId}`,
          },
        ],
        { session: transactionSession },
      );
      return createdRefund.toObject();
  }

  if (session) return createWithinSession(session);

  const ownedSession = await mongoose.startSession();
  try {
    return await ownedSession.withTransaction(() =>
      createWithinSession(ownedSession),
    );
  } finally {
    await ownedSession.endSession();
  }
}

export async function createReturnRefund(
  returnRequestId: string,
  userId: string,
  session?: mongoose.ClientSession,
) {
  assertValidReturnRequestId(returnRequestId);
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ReturnRefundServiceError("Invalid user ID", 400);
  }

  try {
    return await createRefundRecord(returnRequestId, userId, session);
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      const existingRefund = await getReturnRefundByReturnRequestId(returnRequestId);
      if (existingRefund) return existingRefund;
      throw new ReturnRefundServiceError(
        "A refund record already exists for this return request",
        409,
      );
    }
    if (error instanceof ReturnRefundServiceError) throw error;
    throw new ReturnRefundServiceError("Unable to create refund record", 500);
  }
}
