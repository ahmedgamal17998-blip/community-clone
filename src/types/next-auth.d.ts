import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      handle: string;
      locale: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
