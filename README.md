This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Local Public Tunnel with ngrok

Use ngrok only for local development and testing. It is not a production deployment, and the temporary public URL may change when a new tunnel is started.

1. Start Next.js:

	```bash
	npm run dev
	```

2. In a separate terminal, start ngrok:

	```bash
	ngrok http 3000
	```

3. Copy the generated HTTPS URL and open it on a mobile device for local testing. Keep both Next.js and ngrok running; stopping ngrok makes the public URL unavailable.

4. For local authentication links and external callbacks, set `NEXT_PUBLIC_APP_URL` in the uncommitted `.env.local` to the current generated HTTPS URL. Never commit `.env.local` or your ngrok auth token.

5. For Razorpay webhook testing, configure this URL in the Razorpay Dashboard:

	```text
	https://<NGROK_DOMAIN>/api/customer/payment/razorpay/webhook
	```

	Replace `<NGROK_DOMAIN>` with the HTTPS domain shown by ngrok. The URL must be updated when the temporary ngrok URL changes.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
