"use client";
import React, { useEffect, useMemo, useRef, useState,useCallback } from "react";
import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import UserDropdown from "@/components/header/UserDropdown";
import { getDatasourceRegistry } from "@/lib/datasources/registry";
import type { SymbolDescriptor } from "@/lib/datasources/types";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  ChevronDownIcon,
  DollarLineIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PlugInIcon,
  PieChartIcon,
  TableIcon,
} from "../icons/index";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    path: "/",
  },
  {
    icon: <PieChartIcon />,
    name: "Trading Chart",
    path: "/chart",
  },
  {
    icon: <ListIcon />,
    name: "Monitor",
    path: "/monitor",
  },
  {
    icon: <DollarLineIcon />,
    name: "Paper Trading",
    path: "/paper-trading",
  },
  {
    icon: <TableIcon />,
    name: "Supabase DB",
    path: "/supabase-db",
  },
  {
    icon: <PlugInIcon />,
    name: "Settings",
    path: "/settings",
  },
  {
    icon: <PlugInIcon />,
    name: "Profile",
    path: "/profile",
  },
];

const othersItems: NavItem[] = [];
const MAX_SYMBOL_RESULTS = 36;

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const pathname = usePathname();
  const [monitorSearch, setMonitorSearch] = useState("");
  const [searchSymbols, setSearchSymbols] = useState<SymbolDescriptor[]>([]);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMonitorPage = pathname === "/monitor";
  const showExpandedContent = isExpanded || isHovered || isMobileOpen;
  const normalizedSearch = monitorSearch.trim().toUpperCase();

  const handleSidebarToggle = () => {
    if (window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSymbols() {
      setIsLoadingSymbols(true);
      try {
        const registry = getDatasourceRegistry();
        await registry.initialize();
        if (mounted) {
          setSearchSymbols(registry.getSymbols());
        }
      } catch {
        if (mounted) {
          setSearchSymbols([]);
        }
      } finally {
        if (mounted) {
          setIsLoadingSymbols(false);
        }
      }
    }

    void loadSymbols();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredSearchSymbols = useMemo(() => {
    if (!normalizedSearch) return [];

    return searchSymbols
      .filter((symbol) =>
        [
          symbol.symbol,
          symbol.base,
          symbol.quote,
          symbol.displayName,
          symbol.exchange,
          symbol.datasourceId,
          symbol.marketType,
        ]
          .join(" ")
          .toUpperCase()
          .includes(normalizedSearch),
      )
      .slice(0, MAX_SYMBOL_RESULTS);
  }, [normalizedSearch, searchSymbols]);

  const renderMenuItems = (
    navItems: NavItem[],
    menuType: "main" | "others"
  ) => (
    <ul className="flex flex-col gap-2">
      {navItems.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group  ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={` ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className={`menu-item-text`}>{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200  ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className={`menu-item-text`}>{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      href={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // const isActive = (path: string) => path === pathname;
   const isActive = useCallback((path: string) => path === pathname, [pathname]);

  useEffect(() => {
    // Check if the current path matches any submenu item
    let submenuMatched = false;
    ["main", "others"].forEach((menuType) => {
      const items = menuType === "main" ? navItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({
                type: menuType as "main" | "others",
                index,
              });
              submenuMatched = true;
            }
          });
        }
      });
    });

    // If no submenu item matches, close the open submenu
    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [pathname,isActive]);

  useEffect(() => {
    // Set the height of the submenu items when the submenu is opened
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  return (
    <aside
      className={`fixed top-0 flex flex-col px-3 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[240px]"
            : isHovered
            ? "w-[240px]"
            : "w-[64px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={handleSidebarToggle}
        aria-label="Toggle Sidebar"
        className="absolute -right-4 top-1/2 z-50 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-md transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.05]"
      >
        <svg
          className={`h-4 w-4 transition-transform ${isExpanded || isMobileOpen ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8 5L13 10L8 15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div
        className={`py-4 flex  ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <>
              <Image
                className="dark:hidden"
                src="/images/logo/logo.svg"
                alt="Logo"
                width={128}
                height={34}
              />
              <Image
                className="hidden dark:block"
                src="/images/logo/logo-dark.svg"
                alt="Logo"
                width={128}
                height={34}
              />
            </>
          ) : (
            <Image
              src="/images/logo/logo-icon.svg"
              alt="Logo"
              width={28}
              height={28}
            />
          )}
        </Link>
      </div>

      <div className={`mb-3 ${showExpandedContent ? "block" : "hidden"}`}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <svg
              className="fill-gray-500 dark:fill-gray-400"
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
                fill=""
              />
            </svg>
          </span>
          <input
            ref={searchInputRef}
            type="text"
            value={monitorSearch}
            onChange={(event) => {
              setMonitorSearch(event.target.value);
              if (isMonitorPage) {
                window.dispatchEvent(
                  new CustomEvent("mint-monitor-search", {
                    detail: event.target.value,
                  }),
                );
              }
            }}
            placeholder={isMonitorPage ? "Search symbol..." : "Search..."}
            className="h-9 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-9 pr-11 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
            Ctrl K
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto duration-300 ease-linear custom-scrollbar">
        <nav className="mb-4">
          <div className="flex flex-col gap-3">
            <div>
              <h2
                className={`mb-2 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(navItems, "main")}
              {showExpandedContent && (
                <SidebarSymbolResults
                  query={monitorSearch}
                  symbols={filteredSearchSymbols}
                  isLoading={isLoadingSymbols}
                  totalSymbols={searchSymbols.length}
                />
              )}
            </div>
          </div>
        </nav>
      </div>

      <div className={`border-t border-gray-100 py-3 dark:border-gray-800 ${showExpandedContent ? "block" : "flex justify-center"}`}>
        {showExpandedContent ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <UserDropdown />
              <div className="flex items-center gap-2">
                <ThemeToggleButton />
                <NotificationDropdown />
              </div>
            </div>
          </div>
        ) : (
          <ThemeToggleButton />
        )}
      </div>
    </aside>
  );
};

function SidebarSymbolResults({
  query,
  symbols,
  isLoading,
  totalSymbols,
}: {
  query: string;
  symbols: SymbolDescriptor[];
  isLoading: boolean;
  totalSymbols: number;
}) {
  const hasQuery = query.trim().length > 0;

  if (!hasQuery && !isLoading) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase text-gray-400">Symbols</span>
        <span className="text-[11px] text-gray-400">
          {isLoading ? "Loading" : totalSymbols.toLocaleString()}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-1.5 px-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-9 rounded-lg bg-gray-100 dark:bg-white/[0.05]"
            />
          ))}
        </div>
      ) : symbols.length > 0 ? (
        <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1 custom-scrollbar">
          {symbols.map((symbol) => (
            <Link
              key={symbol.id}
              href={`/chart?source=${encodeURIComponent(symbol.datasourceId)}&symbol=${encodeURIComponent(symbol.symbol)}`}
              className="group flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.05]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-700 group-hover:text-brand-500 dark:text-gray-200 dark:group-hover:text-brand-300">
                  {symbol.symbol}
                </span>
                <span className="block truncate text-[11px] text-gray-400">
                  {symbol.exchange} / {symbol.marketType}
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/[0.07] dark:text-gray-300">
                {symbol.datasourceId.replace("_", " ")}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
          No symbols found
        </div>
      )}
    </div>
  );
}

export default AppSidebar;
