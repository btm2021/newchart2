import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | Mint",
  description: "Login to Mint dashboard",
};

export default function Login() {
  return <SignInForm />;
}
