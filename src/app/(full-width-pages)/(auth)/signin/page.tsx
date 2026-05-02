import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | Mint",
  description: "This is Next.js Signin Page Mint",
};

export default function SignIn() {
  return <SignInForm />;
}
