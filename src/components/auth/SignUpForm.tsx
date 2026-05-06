"use client";

import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import { signUpWithBrowserSession } from "@/lib/auth/browser-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function SignUpForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(true);
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    phone: "",
    address: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function updateField(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!accepted) {
      setError("Please accept the account terms before creating a user.");
      return;
    }

    setIsLoading(true);
    void (async () => {
      try {
        await signUpWithBrowserSession(form);
        router.replace("/profile");
        router.refresh();
      } catch (signupError) {
        setError(signupError instanceof Error ? signupError.message : "Could not create account.");
        setIsLoading(false);
      }
    })();
  }

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto no-scrollbar lg:w-1/2">
      <div className="mx-auto mb-5 w-full max-w-md sm:pt-10">
        <Link
          href="/login"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          Back to login
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
              Sign Up
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Create a local app user stored in Supabase database.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-5">
              <div>
                <Label>
                  Name<span className="text-error-500">*</span>
                </Label>
                <Input
                  type="text"
                  placeholder="Your name"
                  defaultValue={form.displayName}
                  onChange={(event) => updateField("displayName", event.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label>
                  Username<span className="text-error-500">*</span>
                </Label>
                <Input
                  type="text"
                  placeholder="username"
                  defaultValue={form.username}
                  onChange={(event) => updateField("username", event.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label>
                  Email<span className="text-error-500">*</span>
                </Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  defaultValue={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <Label>Phone</Label>
                  <Input
                    type="text"
                    placeholder="+84..."
                    defaultValue={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input
                    type="text"
                    placeholder="Address"
                    defaultValue={form.address}
                    onChange={(event) => updateField("address", event.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div>
                <Label>
                  Password<span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    placeholder="Enter your password"
                    type={showPassword ? "text" : "password"}
                    defaultValue={form.password}
                    onChange={(event) => updateField("password", event.target.value)}
                    disabled={isLoading}
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                    )}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox className="h-5 w-5" checked={accepted} onChange={setAccepted} />
                <p className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  I understand this app stores user credentials in the Supabase database.
                </p>
              </div>
              {error ? (
                <p className="rounded-lg border border-error-500/20 bg-error-500/10 px-4 py-3 text-sm text-error-500">
                  {error}
                </p>
              ) : null}
              <button
                disabled={isLoading}
                className="flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Creating..." : "Sign Up"}
              </button>
            </div>
          </form>

          <div className="mt-5">
            <p className="text-center text-sm font-normal text-gray-700 dark:text-gray-400 sm:text-start">
              Already have an account?{" "}
              <Link href="/signin" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
