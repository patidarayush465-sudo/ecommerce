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
import { addToCartSchema } from "@/validations/cart.validation";

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

type CartItem = {
  product: CartProduct;
  quantity: number;
  price: number;
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

function serializeCart(cart: { items: CartItem[] }) {
  const subtotal = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
  const deliveryCharge = calculateDeliveryCharge(subtotal);
  return {
    items: cart.items.map((item) => ({
      product: {
        _id: item.product._id.toString(),
        name: item.product.name,
        price: item.price,
        images: item.product.images,
      },
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity,
    })),
    subtotal,
    deliveryCharge,
    totalAmount: subtotal + deliveryCharge,
  };
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

function handleCartError(error: unknown, logMessage: string) {
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

export async function POST(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const body: unknown = await request.json();
    const validationResult = addToCartSchema.safeParse(body);

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

    const { productId, quantity } = validationResult.data;
    const { connectToDatabase } = await import("@/lib/mongodb");

    await connectToDatabase();

    const product = await Product.findById(productId).select(
      "_id name mrp discountPercent sellingPrice price images isActive stock",
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

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({
        user: userId,
        items: [{ product: product._id, quantity, price: getProductPricing(product).sellingPrice }],
      });
    } else {
      const existingItem = cart.items.find(
        (item: { product: { toString(): string }; quantity: number }) =>
          item.product.toString() === productId,
      );

      if (existingItem) {
        const finalQuantity = existingItem.quantity + quantity;

        if (finalQuantity > product.stock) {
          return NextResponse.json(
            {
              success: false,
              message: "Requested quantity exceeds available stock",
            },
            { status: 400 },
          );
        }

        existingItem.quantity = finalQuantity;
        existingItem.price = getProductPricing(product).sellingPrice;
      } else {
        cart.items.push({
          product: product._id,
          quantity,
          price: getProductPricing(product).sellingPrice,
        });
      }
    }

    await cart.save();
    await cart.populate({
      path: "items.product",
      select: "_id name mrp discountPercent sellingPrice price images",
    });

    return NextResponse.json({
      success: true,
      message: "Product added to cart successfully",
      cart: serializeCart(cart),
    });
  } catch (error: unknown) {
    return handleCartError(error, "Add to cart failed");
  }
}

export async function GET(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const { connectToDatabase } = await import("@/lib/mongodb");

    await connectToDatabase();

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      select: "_id name description mrp discountPercent sellingPrice price stock images isActive",
    });

    return NextResponse.json({
      success: true,
      message: "Cart fetched successfully",
      cart: serializeFetchedCart(cart ?? { items: [] }),
    });
  } catch (error: unknown) {
    return handleCartError(error, "Cart fetch failed");
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const { connectToDatabase } = await import("@/lib/mongodb");

    await connectToDatabase();

    const cart = await Cart.findOne({ user: userId });

    if (cart) {
      cart.items = [];
      await cart.save();
    }

    return NextResponse.json({
      success: true,
      message: "Cart cleared successfully",
      cart: serializeFetchedCart(cart ?? { items: [] }),
    });
  } catch (error: unknown) {
    return handleCartError(error, "Cart clear failed");
  }
}