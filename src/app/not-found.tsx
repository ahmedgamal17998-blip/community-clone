import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">404</h1>
      <p className="mt-2 text-muted-foreground">This page doesn't exist.</p>
      <Button asChild className="mt-6">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
