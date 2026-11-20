import { useState } from "react";
import {
  Activity,
  BarChart3,
  Boxes,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../auth/ThemeContext";

export default function AppShell({ children, title, subtitle, action }) {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const links = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/pos", label: "Point of Sale", icon: ShoppingCart },
    { to: "/inventory", label: "Inventory", icon: Boxes },
    { to: "/purchases", label: "Purchases", icon: Truck },
    { to: "/customers", label: "Customers", icon: UsersRound },
    { to: "/reports", label: "Reports", icon: BarChart3 },
    ...(user && ["superadmin", "head"].includes(user.role)
      ? [{ to: "/team", label: "Team", icon: Users }]
      : []),
  ];

  function navigationLink({ to, label, icon: Icon }, compact = false) {
    return (
      <NavLink
        key={to}
        to={to}
        end={to === "/"}
        onClick={compact ? () => setMobileMenuOpen(false) : undefined}
        tabIndex={compact && !mobileMenuOpen ? -1 : undefined}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            isActive ? "bg-emerald-50 text-brand" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
          } ${compact ? "w-full" : ""}`
        }
      >
        <Icon size={18} />
        {label}
      </NavLink>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-slate-200/80 bg-white px-5 py-7 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white">
            <Activity size={21} />
          </div>
          <div>
            <p className="font-bold tracking-tight">Gas Inventory</p>
            <p className="text-xs text-muted">Management system</p>
          </div>
        </div>
        <p className="mb-3 mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Workspace
        </p>
        <nav className="space-y-1">
          {links.map((link) => navigationLink(link))}
        </nav>
        <div className="mt-auto rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-700">Signed in as</p>
          <p className="mt-1 truncate text-sm font-bold">{user?.first_name || user?.username}</p>
          <p className="mt-0.5 text-xs capitalize text-muted">{user?.role}</p>
          <button onClick={logout} className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-red-600">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <div className="relative z-20">
          <header className="flex min-h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-5 sm:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
              <p className="hidden text-xs text-muted sm:block">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              {action}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink lg:hidden"
                aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation"
              >
                {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                <span className="text-xs font-medium">{mobileMenuOpen ? "Close" : "Menu"}</span>
              </button>
              <button
                type="button"
                onClick={toggleDarkMode}
                className="flex items-center gap-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink"
                aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                aria-pressed={isDarkMode}
                title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                <span className="hidden text-xs font-medium sm:inline">Theme</span>
              </button>
              <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-brand sm:flex">
                {(user?.first_name || user?.username || "U").slice(0, 1).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold">{user?.first_name || user?.username}</p>
                <p className="text-[11px] capitalize text-muted">{user?.role}</p>
              </div>
              <button onClick={logout} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </div>
          </header>
          <div
            className={`absolute inset-x-0 top-full overflow-hidden transition-[max-height,opacity,transform] duration-200 ease-out ${
              mobileMenuOpen
                ? "max-h-[70vh] translate-y-0 opacity-100"
                : "pointer-events-none max-h-0 -translate-y-2 opacity-0"
            }`}
            aria-hidden={!mobileMenuOpen}
          >
            <nav
              id="mobile-navigation"
              aria-label="Main navigation"
              className="grid grid-cols-2 gap-1 border-b border-slate-200/80 bg-white p-3 shadow-lg sm:grid-cols-3 md:grid-cols-4 lg:hidden"
            >
              {links.map((link) => navigationLink(link, true))}
            </nav>
          </div>
        </div>
        <main className="mx-auto max-w-[1440px] p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
