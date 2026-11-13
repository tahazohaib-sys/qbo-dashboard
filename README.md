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

The dashboard is protected by an approval-first login flow:

- A new user opens `/login`, enters only their email, and clicks Request Access.
- An approval email is sent to `taha.zohaib@rtcleague.com` with Approve and Reject buttons.
- Until Taha approves the email, the user cannot log in.
- After approval, the user opens `/login`, enters the approved email and a password.
- On the first approved login, that password is saved for the user.
- A six-digit login code is sent to the approved email.
- The dashboard session is created only after the user enters the correct login code.
- Rejected, pending, and unapproved emails are blocked from dashboard access.

Required production environment variables:

```bash
AUTH_SECRET="replace-with-a-long-random-secret"
NEXT_PUBLIC_APP_URL="https://your-dashboard-domain.com"
DATABASE_URL="postgresql://..."
AUTH_APPROVER_EMAIL="taha.zohaib@rtcleague.com"
```

Configure one email sender before production use. If no sender is configured, approval links and login codes are returned/logged for testing.

Option 1: SMTP with Gmail, no custom domain required:

```bash
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="your-gmail-address@gmail.com"
SMTP_PASS="your-google-app-password"
AUTH_EMAIL_FROM="QBO Dashboard <your-gmail-address@gmail.com>"
```

For Gmail, enable 2-Step Verification on the Google account, create an app password, and use that app password as `SMTP_PASS`. Do not use your normal Gmail password.

Option 2: Resend, best when you have a verified sending domain:

```bash
RESEND_API_KEY="your-resend-api-key"
AUTH_EMAIL_FROM="QBO Dashboard <your-verified-sender@your-domain.com>"
```

### Free domain / URL option

You do not need to buy a custom domain to deploy this dashboard. The simplest free option is Vercel:

1. Import this GitHub repo into Vercel.
2. Deploy the `Test-Module` branch, or merge it into your production branch and deploy that branch.
3. Vercel gives a free URL like `https://your-project-name.vercel.app`.
4. Set `NEXT_PUBLIC_APP_URL` to that exact Vercel URL so approval links open the correct deployed dashboard.

A free Vercel subdomain is enough for the dashboard URL. If you do not want to buy a domain yet, use the Gmail SMTP settings above for verification and approval emails.

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

## Project Costing

Page: `/dashboard/project-costing` (tab "Project Costing" on the dashboard).

- **Data entry users** see Month, Employee name, Project name and Percentage. The admin sets the **Access level** of each approved user on **Manage Access**:
  - *All modules*: all dashboard modules, no Project Costing.
  - *All modules + Project Costing entry*: all dashboard modules and Project Costing data entry.
  - *Project Costing entry only*: only the Project Costing data entry screen. Every other page redirects to it, and every other API returns 403. The user never gets salaries or reports.
- **The admin** sees the data entry table and the report: project revenue (USD converted to PKR at the current market rate), salary allocation per employee, total direct cost, contribution and contribution margin %.

Data sources:

- **Employees** come from the Google Sheet named `RTC League Salary Sheet <Mon> <YYYY>` (for example `RTC League Salary Sheet Oct 2026`), tab `Employees`, columns `Employee Name`, `Designation`, `Department`, `Gross Salary`. Only employees with Department = `Technical` are used. The app finds the sheet of the selected month by its name in Google Drive.
- **History:** each time a month's salary sheet is read, a copy is saved in the table `project_cost_salary_snapshots`. When the sheet is changed or deleted later, the saved copy is used. The History tab shows all months that have allocations, at one USD → PKR rate.
- **Projects** are the `Team` values of the Revenue Analytics sheet for the selected month.
- **Allocations** are kept in the table `project_cost_allocations` (made automatically).

Setup:

1. Share each monthly salary sheet (or the folder that holds them) with the service account in `GSHEETS_SA_CLIENT_EMAIL` as Viewer. A link-shared file is not enough: Drive search finds only files shared with the service account.
2. Enable the **Google Drive API** in the Google Cloud project of the service account.
3. Optional environment variables:

```bash
SALARY_SHEET_NAME_PREFIX="RTC League Salary Sheet"   # name before "<Mon> <YYYY>"
SALARY_SHEET_TAB_NAME="Employees"                     # tab with the employee list
SALARY_SHEET_FOLDER_ID="..."                          # search only in this Drive folder
SALARY_SHEET_DEPARTMENT="Technical"                   # department allocated to projects
```

## Access emails

The user gets an email when the admin approves, rejects or removes access (on **Manage Access** or with the links in the request email), and when the admin changes the access level. The approval email lists the modules of the user's access level and has a **Log in to QBO Dashboard** button. On Manage Access, select the access level before you click Approve.

To give access without a request, use **Add user** on Manage Access: enter the email and select the access level. The user is approved at once and gets the approval email. The user then logs in, chooses a password and enters the six-digit code, as after an approved request.

Inbox placement (Primary, not Spam) depends mostly on the sender setup, not on the email text:

- **Gmail SMTP** (`SMTP_HOST=smtp.gmail.com`): set `AUTH_EMAIL_FROM` to the same Gmail address as `SMTP_USER`. Google then signs the email (DKIM) and it passes SPF and DMARC.
- **Own domain** (for example `rtcleague.com`, with Google Workspace or Resend): publish SPF, DKIM and DMARC records for the domain, and send from an address of that domain.
- Ask each new user to mark the first email as "Not spam", or to add the sender to their contacts. Gmail then keeps later emails in Primary.

The emails are sent as one-to-one system emails: plain text and HTML versions, `Reply-To` the admin, `Auto-Submitted: auto-generated`, no images, no tracking, and one link.
