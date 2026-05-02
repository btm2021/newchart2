import SignUpForm from "@/components/auth/SignUpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | Mint",
  description: "This is Next.js SignUp Page Mint",
  // other metadata
};

export default function SignUp() {
  return <SignUpForm />;
}
