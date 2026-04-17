import { TopNav } from "@/components/layout/TopNav";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-3 py-10 sm:px-4">{children}</main>
    </div>
  );
}
