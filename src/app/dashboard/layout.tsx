import IdleLogout from "@/components/IdleLogout";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <IdleLogout />
      {children}
    </>
  );
}
