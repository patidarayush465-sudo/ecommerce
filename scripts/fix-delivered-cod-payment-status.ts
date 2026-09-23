import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function fixDeliveredCodPaymentStatus(): Promise<void> {
  // Node's standalone ESM resolver needs explicit TypeScript extensions here.
  // @ts-expect-error The migration command resolves the TypeScript extension at runtime.
  const { connectToDatabase } = await import("../src/lib/mongodb.ts");
  // @ts-expect-error The migration command resolves the TypeScript extension at runtime.
  const { default: Order, OrderStatus, PaymentMethod, PaymentStatus } = await import("../src/models/Order.ts");

  await connectToDatabase();

  const filter = {
    orderStatus: OrderStatus.DELIVERED,
    paymentMethod: PaymentMethod.COD,
    paymentStatus: PaymentStatus.PENDING,
  };

  const matchingCount = await Order.countDocuments(filter);
  console.log(`Legacy COD orders requiring payment-status fix: ${matchingCount}`);

  if (matchingCount === 0) {
    console.log("No legacy delivered COD orders require fixing.");
    return;
  }

  const affectedOrders = await Order.find(filter).select("_id orderNumber").lean();
  console.log("Orders to update:", affectedOrders.map((order) => order.orderNumber).join(", "));

  const result = await Order.updateMany(filter, {
    $set: { paymentStatus: PaymentStatus.PAID },
  });

  console.log(`matchedCount: ${result.matchedCount}`);
  console.log(`modifiedCount: ${result.modifiedCount}`);
}

fixDeliveredCodPaymentStatus()
  .catch((error: unknown) => {
    console.error(
      "Delivered COD payment-status migration failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
