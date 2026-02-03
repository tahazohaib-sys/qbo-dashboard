export default function ConnectPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0b1220] text-white">
      <div className="text-center space-y-6">
        <h1 className="text-2xl font-bold">
          Connect to QuickBooks
        </h1>

        <p className="text-slate-400">
          Securely connect your company to fetch real-time financial data
        </p>

        <a
          href="/api/qbo/start"
          className="inline-block px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
        >
          Connect QuickBooks Online
        </a>
      </div>
    </main>
  );
}
