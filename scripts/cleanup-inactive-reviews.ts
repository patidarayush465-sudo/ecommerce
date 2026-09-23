import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function cleanupInactiveReviews() {
	const mongodbUri = process.env.MONGODB_URI?.trim();
	if (!mongodbUri) throw new Error("MONGODB_URI must be configured");

	// Node's standalone ESM resolver needs explicit TypeScript extensions here.
	// @ts-expect-error The cleanup command resolves the TypeScript extension at runtime.
	const { default: Review } = await import("../src/models/Review.ts");
	await mongoose.connect(mongodbUri);
	const result = await Review.deleteMany({ isActive: false });
	console.log(`Deleted ${result.deletedCount} inactive review(s).`);
}

cleanupInactiveReviews()
	.catch((error: unknown) => {
		console.error(
			"Inactive review cleanup failed:",
			error instanceof Error ? error.message : "Unknown error",
		);
		process.exitCode = 1;
	})
	.finally(async () => {
		await mongoose.disconnect();
	});