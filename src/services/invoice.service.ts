import path from "node:path";
import PDFDocument from "pdfkit";

import { PaymentMethod } from "@/models/Order";

export type CustomerInvoiceOrder = {
  orderNumber: string;
  invoiceNumber: string;
  items: Array<{
    productName: string;
    mrp?: number;
    discountPercent?: number;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  shippingAddress: {
    fullName: string;
    mobile: string;
    addressLine: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  subtotal: number;
  deliveryCharge?: number;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: PaymentMethod;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  refundStatus?: string;
  createdAt: Date;
};

export type CustomerInvoice = {
  name: string;
  email: string;
  mobile?: string;
};

const PAGE_MARGIN = 36;
const PAGE_WIDTH = 523;
const PAGE_BOTTOM = 806;
const BORDER = "#d4d4d8";
const DARK = "#18181b";
const MUTED = "#52525b";
const HEADER_FILL = "#f4f4f5";
const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const INVOICE_REGULAR_FONT = "InvoiceRegular";
const INVOICE_BOLD_FONT = "InvoiceBold";

const INVOICE_FONT_PATH = path.join(
  process.cwd(),
  "src",
  "assets",
  "fonts",
  "Invoice-Regular.ttf",
);
const INVOICE_BOLD_FONT_PATH = path.join(
  process.cwd(),
  "src",
  "assets",
  "fonts",
  "Invoice-Bold.ttf",
);

function formatCurrency(value: number) {
  return `₹${CURRENCY_FORMATTER.format(value)}`;
}

function hasPricingSnapshot(item: CustomerInvoiceOrder["items"][number]) {
  return Number.isFinite(item.mrp) && Number.isFinite(item.discountPercent);
}

function itemDiscount(item: CustomerInvoiceOrder["items"][number]) {
  if (!hasPricingSnapshot(item)) return null;
  return Math.max(0, (item.mrp as number) - item.price) * item.quantity;
}

function formatDiscount(item: CustomerInvoiceOrder["items"][number]) {
  const discount = itemDiscount(item);
  if (discount === null) return "Not available";
  return `${item.discountPercent}% (${formatCurrency(discount / item.quantity)})`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function numberToWords(value: number): string {
  const ones = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function underThousand(number: number): string {
    if (number < 20) return ones[number];
    if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ""}`;
    return `${ones[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${underThousand(number % 100)}` : ""}`;
  }

  if (value === 0) return "Zero";
  let remaining = Math.floor(value);
  const parts: string[] = [];
  const crore = Math.floor(remaining / 10000000);
  if (crore) {
    parts.push(`${underThousand(crore)} Crore`);
    remaining %= 10000000;
  }
  const lakh = Math.floor(remaining / 100000);
  if (lakh) {
    parts.push(`${underThousand(lakh)} Lakh`);
    remaining %= 100000;
  }
  const thousand = Math.floor(remaining / 1000);
  if (thousand) {
    parts.push(`${underThousand(thousand)} Thousand`);
    remaining %= 1000;
  }
  if (remaining) parts.push(underThousand(remaining));
  return parts.join(" ");
}

function amountInWords(value: number) {
  const rounded = Math.round(value * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);
  return `Rupees ${numberToWords(rupees)}${paise ? ` and ${numberToWords(paise)} Paise` : ""} Only`;
}

function addressLines(address: CustomerInvoiceOrder["shippingAddress"]) {
  return [
    address.fullName,
    address.addressLine,
    `${address.city}, ${address.state} ${address.pincode}`,
    address.country,
    `Mobile: ${address.mobile}`,
  ];
}

function drawSectionTitle(document: PDFKit.PDFDocument, title: string, x: number, y: number, width: number) {
  document.rect(x, y, width, 22).fill(HEADER_FILL).strokeColor(BORDER).stroke();
  document.fillColor(DARK).font(INVOICE_BOLD_FONT).fontSize(9).text(title.toUpperCase(), x + 8, y + 7);
}

function drawTableHeader(document: PDFKit.PDFDocument, y: number) {
  const columns = [
    ["S.No.", 28], ["Description", 170], ["MRP", 70], ["Discount", 85],
    ["Unit Price", 70], ["Qty", 32], ["Net Amount", 68],
  ] as const;
  let x = PAGE_MARGIN;
  document.rect(PAGE_MARGIN, y, PAGE_WIDTH, 30).fill(HEADER_FILL).strokeColor(BORDER).stroke();
  document.fillColor(DARK).font(INVOICE_BOLD_FONT).fontSize(7.5);
  for (const [label, width] of columns) {
    document.text(label, x + 4, y + 10, { width: width - 8, align: label === "Description" ? "left" : "center" });
    x += width;
    document.moveTo(x, y).lineTo(x, y + 30).strokeColor(BORDER).stroke();
  }
}

function drawTableRow(document: PDFKit.PDFDocument, y: number, index: number, item: CustomerInvoiceOrder["items"][number], height: number) {
  const columns = [28, 170, 70, 85, 70, 32, 68];
  const values = [
    String(index), item.productName, hasPricingSnapshot(item) ? formatCurrency(item.mrp as number) : "Not available",
    formatDiscount(item), formatCurrency(item.price), String(item.quantity), formatCurrency(item.subtotal),
  ];
  document.rect(PAGE_MARGIN, y, PAGE_WIDTH, height).strokeColor(BORDER).stroke();
  document.fillColor(DARK).font(INVOICE_REGULAR_FONT).fontSize(7.5);
  let x = PAGE_MARGIN;
  values.forEach((value, columnIndex) => {
    const width = columns[columnIndex];
    document.text(value, x + 4, y + 9, {
      width: width - 8,
      height: height - 12,
      align: columnIndex === 1 ? "left" : "right",
    });
    x += width;
    document.moveTo(x, y).lineTo(x, y + height).strokeColor(BORDER).stroke();
  });
}

function drawLabelValue(document: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  document.fillColor(MUTED).font(INVOICE_BOLD_FONT).fontSize(7.5).text(label, x, y, { width });
  document.fillColor(DARK).font(INVOICE_REGULAR_FONT).fontSize(9).text(value, x, y + 11, { width });
}

function drawSummary(document: PDFKit.PDFDocument, order: CustomerInvoiceOrder, y: number) {
  const summaryX = 320;
  const summaryWidth = 239;
  const hasCompletePricing = order.items.every(hasPricingSnapshot);
  const mrpTotal = hasCompletePricing
    ? order.items.reduce((total, item) => total + (item.mrp as number) * item.quantity, 0)
    : null;
  const productDiscount = hasCompletePricing
    ? order.items.reduce((total, item) => total + (itemDiscount(item) as number), 0)
    : null;
  document.rect(summaryX, y, summaryWidth, 104).strokeColor(BORDER).stroke();
  const rows = [
    ["MRP Total", mrpTotal === null ? "Not available" : formatCurrency(mrpTotal)],
    ["Product Discount", productDiscount === null ? "Not available" : formatCurrency(productDiscount)],
    ["Subtotal / Net Product Amount", formatCurrency(order.subtotal)],
    ["Delivery / Shipping Charge", formatCurrency(order.deliveryCharge ?? 0)],
  ];
  document.font(INVOICE_REGULAR_FONT).fontSize(9).fillColor(MUTED);
  rows.forEach(([label, value], index) => {
    document.text(label, summaryX + 10, y + 10 + index * 17, { width: 155 });
    document.fillColor(DARK).text(value, summaryX + 165, y + 10 + index * 17, { width: 64, align: "right" });
  });
  document.moveTo(summaryX, y + 78).lineTo(summaryX + summaryWidth, y + 78).strokeColor(BORDER).stroke();
  document.font(INVOICE_BOLD_FONT).fontSize(11).fillColor(DARK).text("Grand Total", summaryX + 10, y + 91);
  document.text(formatCurrency(order.totalAmount), summaryX + 150, y + 91, { width: 78, align: "right" });
}

export function generateCustomerInvoicePdf(order: CustomerInvoiceOrder, customer: CustomerInvoice) {
  const document = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  document.registerFont(INVOICE_REGULAR_FONT, INVOICE_FONT_PATH);
  document.registerFont(INVOICE_BOLD_FONT, INVOICE_BOLD_FONT_PATH);
  const chunks: Buffer[] = [];
  const pdf = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.fillColor(DARK).font(INVOICE_BOLD_FONT).fontSize(20).text("TAX INVOICE", PAGE_MARGIN, 40, { width: PAGE_WIDTH, align: "center" });
  document.font(INVOICE_REGULAR_FONT).fontSize(9).fillColor(MUTED).text("ORDER INVOICE", PAGE_MARGIN, 64, { width: PAGE_WIDTH, align: "center" });
  document.moveTo(PAGE_MARGIN, 84).lineTo(PAGE_MARGIN + PAGE_WIDTH, 84).strokeColor(DARK).stroke();

  document.fillColor(DARK).font(INVOICE_BOLD_FONT).fontSize(13).text("E-commerce Application", PAGE_MARGIN, 101);
  document.font(INVOICE_REGULAR_FONT).fontSize(8.5).fillColor(MUTED).text("Sold By / Seller", PAGE_MARGIN, 120);
  document.fillColor(DARK).text("E-commerce Application", PAGE_MARGIN, 133);
  document.font(INVOICE_REGULAR_FONT).fontSize(8).fillColor(MUTED).text("Seller registration and tax details are not configured.", PAGE_MARGIN, 147, { width: 250 });

  const sellerBoxX = 300;
  drawSectionTitle(document, "Billing Address", sellerBoxX, 101, 259);
  document.font(INVOICE_BOLD_FONT).fontSize(9).fillColor(DARK).text(customer.name, sellerBoxX + 8, 132);
  document.font(INVOICE_REGULAR_FONT).fontSize(8.5).text(customer.email, sellerBoxX + 8, 145);
  document.text(customer.mobile ?? "Mobile: Not available", sellerBoxX + 8, 158);
  document.font(INVOICE_REGULAR_FONT).fontSize(8.5).text(addressLines(order.shippingAddress).slice(1).join("\n"), sellerBoxX + 8, 176, { width: 240, lineGap: 1 });
  document.rect(sellerBoxX, 101, 259, 130).strokeColor(BORDER).stroke();

  drawSectionTitle(document, "Shipping Address", PAGE_MARGIN, 215, PAGE_WIDTH);
  document.font(INVOICE_BOLD_FONT).fontSize(9).fillColor(DARK).text(order.shippingAddress.fullName, PAGE_MARGIN + 8, 247);
  document.font(INVOICE_REGULAR_FONT).fontSize(8.5).text(addressLines(order.shippingAddress).slice(1).join("\n"), PAGE_MARGIN + 8, 261, { width: PAGE_WIDTH - 16, lineGap: 1 });
  document.rect(PAGE_MARGIN, 215, PAGE_WIDTH, 113).strokeColor(BORDER).stroke();

  document.rect(PAGE_MARGIN, 348, PAGE_WIDTH, 54).strokeColor(BORDER).stroke();
  drawLabelValue(document, "Order Number", order.orderNumber, 46, 361, 145);
  drawLabelValue(document, "Invoice Number", order.invoiceNumber, 200, 361, 145);
  drawLabelValue(document, "Order Date", formatDate(order.createdAt), 354, 361, 90);
  drawLabelValue(document, "Invoice Date", formatDate(new Date()), 453, 361, 95);
  document.moveTo(190, 348).lineTo(190, 402).strokeColor(BORDER).stroke();
  document.moveTo(344, 348).lineTo(344, 402).strokeColor(BORDER).stroke();
  document.moveTo(443, 348).lineTo(443, 402).strokeColor(BORDER).stroke();

  let tableY = 420;
  drawTableHeader(document, tableY);
  tableY += 30;
  document.font(INVOICE_REGULAR_FONT).fontSize(7.5);
  order.items.forEach((item, index) => {
    const descriptionHeight = document.heightOfString(item.productName, { width: 162 });
    const rowHeight = Math.max(30, descriptionHeight + 16);
    if (tableY + rowHeight > PAGE_BOTTOM) {
      document.addPage();
      tableY = PAGE_MARGIN;
      document.fillColor(DARK).font(INVOICE_BOLD_FONT).fontSize(11).text("Tax Invoice - Continued", PAGE_MARGIN, tableY);
      tableY += 24;
      drawTableHeader(document, tableY);
      tableY += 30;
    }
    drawTableRow(document, tableY, index + 1, item, rowHeight);
    tableY += rowHeight;
  });

  if (tableY + 210 > PAGE_BOTTOM) {
    document.addPage();
    tableY = PAGE_MARGIN;
  } else {
    tableY += 14;
  }
  drawSummary(document, order, tableY);
  document.font(INVOICE_BOLD_FONT).fontSize(9).fillColor(DARK).text("Amount in Words:", PAGE_MARGIN, tableY + 122);
  document.font(INVOICE_REGULAR_FONT).fontSize(9).text(amountInWords(order.totalAmount), PAGE_MARGIN + 88, tableY + 122, { width: 215 });

  const paymentY = tableY + 154;
  drawSectionTitle(document, "Payment Information", PAGE_MARGIN, paymentY, PAGE_WIDTH);
  document.font(INVOICE_REGULAR_FONT).fontSize(8.5).fillColor(DARK).text(`Payment Method: ${order.paymentMethod}`, PAGE_MARGIN + 8, paymentY + 32);
  document.text(`Payment Status: ${order.paymentStatus}`, PAGE_MARGIN + 180, paymentY + 32);
  document.text(`Order Status: ${order.orderStatus}`, PAGE_MARGIN + 360, paymentY + 32);
  if (order.paymentMethod === PaymentMethod.ONLINE) {
    document.text(`Razorpay Payment ID: ${order.razorpayPaymentId ?? "Not available"}`, PAGE_MARGIN + 8, paymentY + 49, { width: 250 });
    document.text(`Razorpay Order ID: ${order.razorpayOrderId ?? "Not available"}`, PAGE_MARGIN + 270, paymentY + 49, { width: 245 });
  }
  if (order.paymentStatus === "REFUNDED") {
    document.text("Refund Amount: ".concat(formatCurrency(order.totalAmount)), PAGE_MARGIN + 8, paymentY + 66);
    document.text(`Refund Status: ${order.refundStatus ?? "Processed"}`, PAGE_MARGIN + 180, paymentY + 66);
    if (order.razorpayRefundId) document.text(`Refund ID: ${order.razorpayRefundId}`, PAGE_MARGIN + 360, paymentY + 66, { width: 160 });
  }
  document.font(INVOICE_REGULAR_FONT).fontSize(8).fillColor(MUTED).text("Thank you for your purchase.", PAGE_MARGIN, 770, { width: PAGE_WIDTH, align: "center" });
  document.font(INVOICE_BOLD_FONT).fontSize(8).fillColor(DARK).text("For E-commerce Application", PAGE_MARGIN, 786, { width: PAGE_WIDTH, align: "center" });
  document.end();
  return pdf;
}