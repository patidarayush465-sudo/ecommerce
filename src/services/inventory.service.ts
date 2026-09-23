import mongoose from "mongoose";

import Order from "@/models/Order";
import Product from "@/models/Product";

export class InventoryError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

async function withOptionalSession<T>(
  session: mongoose.ClientSession | undefined,
  callback: (transactionSession: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  if (session) {
    return callback(session);
  }

  const transactionSession = await mongoose.startSession();

  try {
    return await transactionSession.withTransaction(async () => {
      return callback(transactionSession);
    });
  } finally {
    await transactionSession.endSession();
  }
}

export async function deductOrderStock(
  orderId: string,
  session?: mongoose.ClientSession,
) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new InventoryError("Invalid order ID");
  }

  await withOptionalSession(session, async (transactionSession) => {
    const order = await Order.findOneAndUpdate(
      { _id: orderId, stockDeducted: false },
      { $set: { stockDeducted: true } },
      { returnDocument: "after", session: transactionSession },
    );

    if (!order) {
      const existingOrder = await Order.findById(orderId).session(transactionSession);

      if (!existingOrder) {
        throw new InventoryError("Order not found");
      }

      return;
    }

    for (const item of order.items) {
      const product = await Product.findOneAndUpdate(
        {
          _id: item.product,
          stock: { $gte: item.quantity },
        },
        { $inc: { stock: -item.quantity } },
        { returnDocument: "after", session: transactionSession },
      );

      if (!product) {
        throw new InventoryError(
          `Insufficient stock for ${item.productName}`,
        );
      }
    }
  });
}

export async function restoreOrderStock(
  orderId: string,
  session?: mongoose.ClientSession,
) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new InventoryError("Invalid order ID");
  }

  await withOptionalSession(session, async (transactionSession) => {
    const order = await Order.findById(orderId).session(transactionSession);

    if (!order) {
      throw new InventoryError("Order not found");
    }

    if (!order.stockDeducted) {
      return;
    }

    for (const item of order.items) {
      const result = await Product.updateOne(
        { _id: item.product },
        { $inc: { stock: item.quantity } },
        { session: transactionSession },
      );

      if (result.matchedCount !== 1) {
        throw new InventoryError(`Product ${item.product.toString()} not found`);
      }
    }

    order.stockDeducted = false;
    await order.save({ session: transactionSession });
  });
}