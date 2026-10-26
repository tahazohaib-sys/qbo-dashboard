import IdleLogout from "@/components/IdleLogout";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <IdleLogout />
      {children}
    </>
  );
}
