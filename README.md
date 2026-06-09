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

## Dashboard Login Approval

The dashboard is protected by an email/password login flow:

- A user requests access with email and password at `/login`.
- The user verifies their email.
- An approval email is sent to `taha.zohaib@rtcleague.com` with Approve and Reject buttons.
- Approved users can log in. Rejected users are blocked.

Required production environment variables:

```bash
AUTH_SECRET="replace-with-a-long-random-secret"
NEXT_PUBLIC_APP_URL="https://your-dashboard-domain.com"
RESEND_API_KEY="your-resend-api-key"
AUTH_EMAIL_FROM="QBO Dashboard <your-verified-sender@your-domain.com>"
AUTH_APPROVER_EMAIL="taha.zohaib@rtcleague.com"
```

If `RESEND_API_KEY` is not configured, verification and approval links are returned/logged for testing instead of sending real emails. Configure Resend before production use so real users receive verification and approval emails securely.

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
