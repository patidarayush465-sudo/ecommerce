/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const isLocalhostUrl = (value) => /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?(\/)?$/.test(value);
const BASE_URL = process.env.COD_TEST_BASE_URL || 'http://localhost:3000';
const CASE_PREFIX = 'COD_TEST';

if (process.env.NODE_ENV !== 'development') {
  throw new Error('COD refund development test script can only run with NODE_ENV=development.');
}

if (!isLocalhostUrl(BASE_URL)) {
  throw new Error(`COD refund development test script refused to run against non-localhost URL: ${BASE_URL}`);
}

if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
  throw new Error('Missing JWT_SECRET or MONGODB_URI in the local development environment.');
}

function makeToken({ userId, email, role }) {
  return jwt.sign({ userId, email, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const customerId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const timeStamp = Date.now();
  const customerEmail = `cod-test-customer-${timeStamp}@example.com`;
  const orderNumber = `${CASE_PREFIX}-${timeStamp}`;

  await db.collection('users').insertOne({
    _id: customerId,
    name: 'COD Test Customer',
    email: customerEmail,
    password: 'isolated-test-password',
    role: 'CUSTOMER',
    isEmailVerified: true,
    mobile: '9000000000',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const customerToken = makeToken({
    userId: customerId.toString(),
    email: customerEmail,
    role: 'CUSTOMER',
  });
  const adminToken = makeToken({
    userId: adminId.toString(),
    email: 'cod-test-admin@example.com',
    role: 'ADMIN',
  });

  const categoryId = new mongoose.Types.ObjectId();
  const subcategoryId = new mongoose.Types.ObjectId();

  await db.collection('products').insertOne({
    _id: productId,
    name: 'COD Return Test Product',
    description: 'Dedicated product for isolated COD refund validation',
    price: 299,
    mrp: 399,
    discountPercent: 0,
    sellingPrice: 299,
    stock: 20,
    images: [{ url: 'https://example.com/test-product.jpg', publicId: 'cod-return-test-product' }],
    category: categoryId,
    subcategory: subcategoryId,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const orderDoc = {
    _id: orderId,
    user: customerId,
    orderNumber,
    invoiceNumber: `${orderNumber}-INV`,
    invoiceUrl: null,
    invoicePublicId: null,
    items: [
      {
        product: productId,
        productName: 'COD Return Test Product',
        productImage: 'https://example.com/test-product.jpg',
        mrp: 399,
        discountPercent: 0,
        price: 299,
        quantity: 1,
        subtotal: 299,
      },
    ],
    shippingAddress: {
      fullName: 'COD Test Customer',
      mobile: '9000000000',
      addressLine: '123 Test Street',
      city: 'Test City',
      state: 'Test State',
      pincode: '110001',
      country: 'India',
    },
    subtotal: 299,
    deliveryCharge: 0,
    totalItems: 1,
    totalAmount: 299,
    orderStatus: 'DELIVERED',
    paymentStatus: 'PENDING',
    paymentMethod: 'COD',
    stockDeducted: true,
    refundStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('orders').insertOne(orderDoc);

  const customerCreateRes = await fetchJson(`${BASE_URL}/api/customer/returns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      orderId: orderId.toString(),
      items: [{ productId: productId.toString(), quantity: 1 }],
      reason: 'DAMAGED',
      reasonDetails: 'Isolated COD refund test case',
      refundDestination: {
        refundMethod: 'BANK_ACCOUNT',
        bankAccount: {
          accountHolderName: 'COD Test User',
          accountNumber: '1234567890123456',
          ifsc: 'HDFC0000001',
        },
      },
    }),
  });

  assert(customerCreateRes.ok, `Return creation failed: ${JSON.stringify(customerCreateRes.data)}`);
  const returnId = customerCreateRes.data.return.id;

  const statusSteps = ['CONFIRMED', 'PICKUP', 'RECEIVED', 'COMPLETED'];
  for (const status of statusSteps) {
    const payload = { status };
    if (status === 'PICKUP') {
      payload.pickupAgentName = 'Test Pickup Agent';
      payload.pickupAgentPhone = '9000000001';
      payload.pickupReference = 'COD-TEST-PICKUP';
    }
    const adminRes = await fetchJson(`${BASE_URL}/api/admin/returns/${returnId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });
    assert(adminRes.ok, `Return status ${status} failed: ${JSON.stringify(adminRes.data)}`);
  }

  const refund = await db.collection('returnrefunds').findOne({ returnRequest: new mongoose.Types.ObjectId(returnId) });
  assert(refund, 'No refund was created after completion');

  const detailRes = await fetchJson(`${BASE_URL}/api/admin/return-refunds/${refund._id.toString()}`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  assert(detailRes.ok, `Admin refund detail failed: ${JSON.stringify(detailRes.data)}`);

  const detail = detailRes.data.refund;
  const detailDestination = detail.destination ?? {};
  assert(detailDestination.accountNumber !== '1234567890123456', 'Account number was exposed in admin details');
  assert((detailDestination.accountNumber ?? '').includes('*'), 'Masked account number missing');
  assert((detailDestination.upiId ?? null) === null || (detailDestination.upiId ?? '').includes('*'), 'UPI ID masking did not occur');

  const failRes = await fetchJson(`${BASE_URL}/api/admin/return-refunds/${refund._id.toString()}/fail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ failureReason: 'Bank verification failed for isolated test' }),
  });
  assert(failRes.ok, `Fail route failed: ${JSON.stringify(failRes.data)}`);

  const processRes = await fetchJson(`${BASE_URL}/api/admin/return-refunds/${refund._id.toString()}/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  assert(processRes.ok, `Process route failed: ${JSON.stringify(processRes.data)}`);
  const repeatedProcessRes = await fetchJson(`${BASE_URL}/api/admin/return-refunds/${refund._id.toString()}/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  assert(repeatedProcessRes.ok, `Repeat process route failed: ${JSON.stringify(repeatedProcessRes.data)}`);
  assert(repeatedProcessRes.data.message.includes('already manually confirmed') || repeatedProcessRes.data.message.includes('already'), 'Idempotency message not returned');

  const listRes = await fetchJson(`${BASE_URL}/api/admin/return-refunds?limit=20`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  assert(listRes.ok, `Admin list failed: ${JSON.stringify(listRes.data)}`);
  const found = listRes.data.refunds.find((entry) => entry.id === refund._id.toString());
  assert(found, 'Refund not found in admin list');
  assert((found.destination?.accountNumber ?? '').includes('*'), 'List API exposed raw bank data');

  const blockedFailureRes = await fetchJson(`${BASE_URL}/api/admin/return-refunds/${refund._id.toString()}/fail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ failureReason: 'This should be rejected after processing' }),
  });
  assert(blockedFailureRes.status === 409, `Expected 409 on processed-fail guard, got ${blockedFailureRes.status}`);

  const finalRefund = await db.collection('returnrefunds').findOne({ _id: refund._id });
  console.log(JSON.stringify({
    orderNumber,
    customerId: customerId.toString(),
    orderId: orderId.toString(),
    returnId,
    refundId: refund._id.toString(),
    finalPaymentStatus: finalRefund.paymentStatus,
    retryCount: finalRefund.retryCount,
    processedAt: finalRefund.processedAt,
    customerReturnStatus: 'COMPLETED',
    adminMasking: {
      accountNumber: detail.destination.accountNumber,
      upiId: detail.destination.upiId,
    },
  }, null, 2));

  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
