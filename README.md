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

The dashboard is protected by an email/password login flow with approval and a six-digit login code:

- A new user requests access with email and password at `/login`.
- The user verifies their email with a six-digit code sent to that email address.
- An approval email is sent to `taha.zohaib@rtcleague.com` with Approve and Reject buttons.
- Only approved users can start login.
- During login, the approved user enters email and password, then receives a new six-digit code by email.
- The dashboard session is created only after the approved user enters the correct login code.
- Rejected, pending, and unapproved emails are blocked from dashboard access.

Required production environment variables:

```bash
AUTH_SECRET="replace-with-a-long-random-secret"
NEXT_PUBLIC_APP_URL="https://your-dashboard-domain.com"
DATABASE_URL="postgresql://..."
RESEND_API_KEY="your-resend-api-key"
AUTH_EMAIL_FROM="QBO Dashboard <your-verified-sender@your-domain.com>"
AUTH_APPROVER_EMAIL="taha.zohaib@rtcleague.com"
```

If `RESEND_API_KEY` is not configured, verification codes and approval links are returned/logged for testing instead of sending real emails. Configure email delivery before production use so real users receive verification and approval emails securely.

### Free domain / URL option

You do not need to buy a custom domain to deploy this dashboard. The simplest free option is Vercel:

1. Import this GitHub repo into Vercel.
2. Deploy the `Test-Module` branch, or merge it into your production branch and deploy that branch.
3. Vercel gives a free URL like `https://your-project-name.vercel.app`.
4. Set `NEXT_PUBLIC_APP_URL` to that exact Vercel URL so approval links open the correct deployed dashboard.

A free Vercel subdomain is enough for the dashboard URL. For sending email from a branded address, most providers require a verified sending domain. If you do not want to buy a domain yet, use a trusted sender option such as a Gmail account with SMTP/app password, or keep Resend only for testing until you have a verified sender domain.

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
