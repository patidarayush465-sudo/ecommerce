export const FREE_DELIVERY_THRESHOLD = 499;
export const DELIVERY_CHARGE = 49;

type ProductPricingFields = {
  mrp?: number | null;
  discountPercent?: number | null;
  sellingPrice?: number | null;
  price?: number | null;
};

export type ProductPricing = {
  mrp: number;
  discountPercent: number;
  sellingPrice: number;
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateSellingPrice(mrp: number, discountPercent: number) {
  return roundCurrency(mrp - (mrp * discountPercent) / 100);
}

export function validateProductPricing(
  mrp: number,
  discountPercent: number,
  sellingPrice: number,
) {
  if (!Number.isFinite(mrp) || mrp <= 0) {
    throw new Error("MRP must be greater than zero");
  }

  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error("Discount must be between 0 and 100 percent");
  }

  const expectedSellingPrice = calculateSellingPrice(mrp, discountPercent);

  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    throw new Error("Selling price must be valid");
  }

  if (sellingPrice !== expectedSellingPrice) {
    throw new Error("Selling price must match MRP and discount");
  }

  if (sellingPrice <= 0 && discountPercent !== 100) {
    throw new Error("Selling price must be greater than zero");
  }

  if (sellingPrice > mrp) {
    throw new Error("Selling price cannot exceed MRP");
  }

  return expectedSellingPrice;
}

export function getProductPricing(product: ProductPricingFields): ProductPricing {
  const legacyPrice = Number(product.price);
  const mrp = Number.isFinite(Number(product.mrp)) && Number(product.mrp) > 0
    ? Number(product.mrp)
    : legacyPrice;
  const discountPercent = Number.isFinite(Number(product.discountPercent))
    ? Number(product.discountPercent)
    : 0;
  const calculatedSellingPrice = calculateSellingPrice(mrp, discountPercent);
  const sellingPrice = Number.isFinite(Number(product.sellingPrice))
    ? Number(product.sellingPrice)
    : calculatedSellingPrice;

  if (!Number.isFinite(mrp) || mrp <= 0) {
    throw new Error("Product has invalid pricing");
  }

  validateProductPricing(mrp, discountPercent, sellingPrice);

  return { mrp, discountPercent, sellingPrice };
}

export function calculateDeliveryCharge(subtotal: number) {
  return subtotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_CHARGE : 0;
}

export function calculateOrderTotals(subtotal: number) {
  const deliveryCharge = calculateDeliveryCharge(subtotal);
  return {
    subtotal,
    deliveryCharge,
    totalAmount: subtotal + deliveryCharge,
  };
}
