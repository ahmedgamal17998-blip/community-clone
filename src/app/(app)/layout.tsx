import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { TopNav } from "@/components/layout/TopNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-3 py-6 sm:px-4">{children}</main>
    </div>
  );
}
