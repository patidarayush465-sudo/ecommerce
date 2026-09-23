import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import Cart from "@/models/Cart";
import Product from "@/models/Product";
import { calculateDeliveryCharge, getProductPricing } from "@/services/pricing.service";
import { UserRole } from "@/models/User";
import { updateCartItemSchema } from "@/validations/cart.validation";

type CartProduct = {
  _id: { toString(): string };
  name: string;
  description: string;
  price?: number;
  mrp?: number;
  discountPercent?: number;
  sellingPrice?: number;
  stock: number;
  images: Array<{ url: string; publicId: string }>;
  isActive: boolean;
};

type FetchedCartItem = {
  product: CartProduct | null;
  quantity: number;
  price: number;
};

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);

  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }

  return authUser.userId;
}

function serializeFetchedCart(cart: { items: FetchedCartItem[] }) {
  const items = cart.items.map((item) => ({
    ...(() => {
      const price = item.product ? getProductPricing(item.product).sellingPrice : item.price;
      return { price, subtotal: price * item.quantity };
    })(),
    product: item.product
      ? {
          _id: item.product._id.toString(),
          name: item.product.name,
          description: item.product.description,
          ...getProductPricing(item.product),
          stock: item.product.stock,
          images: item.product.images,
          isActive: item.product.isActive,
        }
      : null,
    unavailable: item.product === null,
    quantity: item.quantity,
  }));

  const subtotal = items.reduce((total, item) => total + item.subtotal, 0);
  const deliveryCharge = calculateDeliveryCharge(subtotal);

  return {
    items,
    totalItems: items.reduce((total, item) => total + item.quantity, 0),
    subtotal,
    deliveryCharge,
    totalAmount: subtotal + deliveryCharge,
  };
}

function handleCartError(
  error: unknown,
  logMessage = "Cart item quantity update failed",
) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
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

  console.error(logMessage, error);

  return NextResponse.json(
    { success: false, message: "Internal server error" },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const { productId } = await params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID" },
        { status: 400 },
      );
    }

    const body: unknown = await request.json();
    const validationResult = updateCartItemSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid cart data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const { quantity } = validationResult.data;
    const { connectToDatabase } = await import("@/lib/mongodb");

    await connectToDatabase();

    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return NextResponse.json(
        { success: false, message: "Cart not found" },
        { status: 404 },
      );
    }

    const cartItem = cart.items.find(
      (item: { product: { toString(): string }; quantity: number }) =>
        item.product.toString() === productId,
    );

    if (!cartItem) {
      return NextResponse.json(
        { success: false, message: "Product is not in the cart" },
        { status: 404 },
      );
    }

    const product = await Product.findById(productId).select(
      "_id name description mrp discountPercent sellingPrice price stock images isActive",
    );

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 },
      );
    }

    if (!product.isActive) {
      return NextResponse.json(
        { success: false, message: "Product is inactive" },
        { status: 400 },
      );
    }

    if (quantity > product.stock) {
      return NextResponse.json(
        { success: false, message: "Requested quantity exceeds available stock" },
        { status: 400 },
      );
    }

    cartItem.quantity = quantity;
    cartItem.price = getProductPricing(product).sellingPrice;

    await cart.save();
    await cart.populate({
      path: "items.product",
      select: "_id name description mrp discountPercent sellingPrice price stock images isActive",
    });

    return NextResponse.json({
      success: true,
      message: "Cart item quantity updated successfully",
      cart: serializeFetchedCart(cart),
    });
  } catch (error: unknown) {
    return handleCartError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const { productId } = await params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID" },
        { status: 400 },
      );
    }

    const { connectToDatabase } = await import("@/lib/mongodb");

    await connectToDatabase();

    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return NextResponse.json(
        { success: false, message: "Cart not found" },
        { status: 404 },
      );
    }

    const cartItemIndex = cart.items.findIndex(
      (item: { product: { toString(): string } }) =>
        item.product.toString() === productId,
    );

    if (cartItemIndex === -1) {
      return NextResponse.json(
        { success: false, message: "Product is not in the cart" },
        { status: 404 },
      );
    }

    cart.items.splice(cartItemIndex, 1);

    await cart.save();
    await cart.populate({
      path: "items.product",
      select: "_id name description mrp discountPercent sellingPrice price stock images isActive",
    });

    return NextResponse.json({
      success: true,
      message: "Product removed from cart successfully",
      cart: serializeFetchedCart(cart),
    });
  } catch (error: unknown) {
    return handleCartError(error, "Cart item removal failed");
  }
}