"use client";
import { clearBrowserSession, readBrowserSession } from "@/lib/auth/browser-auth";
import { BellIcon, ChevronDownIcon, PlugInIcon, TableIcon, UserCircleIcon } from "@/icons";
import { useTheme } from "@/context/ThemeContext";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

export default function UserDropdown({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<ReturnType<typeof readBrowserSession>>(null);
  const username = session?.username || "bao";
  const email = session?.email || username;
  const initials = username.slice(0, 2).toUpperCase();
  const notificationCount = 8;

  useEffect(() => {
    setSession(readBrowserSession());
  }, []);

  function toggleDropdown(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  function handleSignOut() {
    clearBrowserSession();
    closeDropdown();
    router.replace("/login");
    router.refresh();
  }

  if (compact) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={toggleDropdown}
          aria-label="Open user menu"
          aria-expanded={isOpen}
          className="dropdown-toggle relative flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-xs font-semibold uppercase text-white shadow-theme-xs"
        >
          {initials}
          {notificationCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-error-500 px-1 text-[10px] font-semibold leading-none text-white dark:border-gray-900">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>

        {renderMenu()}
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div
        data-testid="sidebar-user-card"
        className="grid w-full grid-cols-[40px_minmax(0,1fr)_32px] items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-xs font-semibold uppercase text-white">
          {initials}
          <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white bg-success-500 dark:border-gray-900" />
          {notificationCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-error-500 px-1 text-[10px] font-semibold leading-none text-white dark:border-gray-900">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-5 text-gray-800 dark:text-white/90">
            {username}
          </span>
          <span className="block truncate text-[11px] leading-4 text-gray-500 dark:text-gray-400">
            {email}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleDropdown}
          aria-label="Open user menu"
          aria-expanded={isOpen}
          className="dropdown-toggle flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-white"
        >
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {renderMenu()}
    </div>
  );

  function renderMenu() {
    return (
      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="bottom-full right-0 mb-2 mt-0 flex w-full min-w-[216px] flex-col rounded-lg border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div className="border-b border-gray-100 px-2 pb-2 dark:border-gray-800">
          <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {username}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
            {email}
          </span>
        </div>

        <ul className="flex flex-col gap-1 py-2">
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="button"
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <BellIcon className="h-5 w-5 fill-gray-500 dark:fill-gray-400" />
              <span className="flex-1 text-left">Notifications</span>
              <span className="rounded-full bg-error-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {notificationCount}
              </span>
            </DropdownItem>
          </li>
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/supabase-db"
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <TableIcon className="h-5 w-5 fill-gray-500 dark:fill-gray-400" />
              Supabase DB
            </DropdownItem>
          </li>
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/settings"
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <PlugInIcon className="h-5 w-5 fill-gray-500 dark:fill-gray-400" />
              Settings
            </DropdownItem>
          </li>
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/profile"
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <UserCircleIcon className="h-5 w-5 fill-gray-500 dark:fill-gray-400" />
              Profile
            </DropdownItem>
          </li>
          <li>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <span className="flex h-5 w-5 items-center justify-center text-gray-500 dark:text-gray-400">
                <svg
                  className="h-5 w-5 fill-current"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  {theme === "dark" ? (
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10 2.292a.75.75 0 0 1 .75.75v1.25a.75.75 0 0 1-1.5 0v-1.25a.75.75 0 0 1 .75-.75Zm0 4.5a3.208 3.208 0 1 0 0 6.416 3.208 3.208 0 0 0 0-6.416ZM5.292 10a4.708 4.708 0 1 1 9.416 0 4.708 4.708 0 0 1-9.416 0Zm10.689-4.92a.75.75 0 0 1 0 1.06l-.884.884a.75.75 0 0 1-1.06-1.06l.883-.884a.75.75 0 0 1 1.061 0ZM18.458 10a.75.75 0 0 1-.75.75h-1.25a.75.75 0 0 1 0-1.5h1.25a.75.75 0 0 1 .75.75Zm-4.42 3.036a.75.75 0 0 1 1.06 0l.884.884a.75.75 0 1 1-1.06 1.061l-.884-.884a.75.75 0 0 1 0-1.061ZM10 14.958a.75.75 0 0 1 .75.75v1.25a.75.75 0 0 1-1.5 0v-1.25a.75.75 0 0 1 .75-.75Zm-4.037-1.922a.75.75 0 0 1 0 1.061l-.884.884a.75.75 0 1 1-1.06-1.061l.883-.884a.75.75 0 0 1 1.061 0ZM4.292 10a.75.75 0 0 1-.75.75h-1.25a.75.75 0 0 1 0-1.5h1.25a.75.75 0 0 1 .75.75Zm.61-4.92a.75.75 0 0 1 1.061 0l.884.884a.75.75 0 1 1-1.06 1.06l-.884-.883a.75.75 0 0 1 0-1.061Z"
                    />
                  ) : (
                    <path d="M17.455 11.97c-1.057.983-2.472 1.533-4.04 1.533a5.918 5.918 0 0 1-5.918-5.918c0-1.568.6-2.983 1.583-4.04-3.01.794-5.238 3.531-5.238 6.789A6.958 6.958 0 0 0 10.8 17.292c3.258 0 5.995-2.229 6.655-5.322Z" />
                  )}
                </svg>
              </span>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </li>
        </ul>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-2 rounded-lg border-t border-gray-100 px-2.5 py-2 text-sm font-medium text-error-500 hover:bg-error-50 dark:border-gray-800 dark:hover:bg-error-500/10"
        >
          <svg
            className="h-5 w-5 fill-current"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.1007 19.247C14.6865 19.247 14.3507 18.9112 14.3507 18.497L14.3507 14.245H12.8507V18.497C12.8507 19.7396 13.8581 20.747 15.1007 20.747H18.5007C19.7434 20.747 20.7507 19.7396 20.7507 18.497L20.7507 5.49609C20.7507 4.25345 19.7433 3.24609 18.5007 3.24609H15.1007C13.8581 3.24609 12.8507 4.25345 12.8507 5.49609V9.74501L14.3507 9.74501V5.49609C14.3507 5.08188 14.6865 4.74609 15.1007 4.74609L18.5007 4.74609C18.9149 4.74609 19.2507 5.08188 19.2507 5.49609L19.2507 18.497C19.2507 18.9112 18.9149 19.247 18.5007 19.247H15.1007ZM3.25073 11.9984C3.25073 12.2144 3.34204 12.4091 3.48817 12.546L8.09483 17.1556C8.38763 17.4485 8.86251 17.4487 9.15549 17.1559C9.44848 16.8631 9.44863 16.3882 9.15583 16.0952L5.81116 12.7484L16.0007 12.7484C16.4149 12.7484 16.7507 12.4127 16.7507 11.9984C16.7507 11.5842 16.4149 11.2484 16.0007 11.2484L5.81528 11.2484L9.15585 7.90554C9.44864 7.61255 9.44847 7.13767 9.15547 6.84488C8.86248 6.55209 8.3876 6.55226 8.09481 6.84525L3.52309 11.4202C3.35673 11.5577 3.25073 11.7657 3.25073 11.9984Z"
              fill=""
            />
          </svg>
          Sign out
        </button>
      </Dropdown>
    );
  }
}
