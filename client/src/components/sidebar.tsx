import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

interface MenuItem {
  path: string;
  icon: string;
  label: string;
}

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });
  const [hasInteracted, setHasInteracted] = useState(() => {
    return localStorage.getItem("sidebar-toggle-clicked") === "true";
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed.toString());
  }, [collapsed]);

  const handleToggle = () => {
    setCollapsed(!collapsed);
    if (!hasInteracted) {
      setHasInteracted(true);
      localStorage.setItem("sidebar-toggle-clicked", "true");
    }
  };

  // Flat menu structure - simple and accessible
  const menuItems: MenuItem[] = [
    { path: "/", icon: "fa-solid fa-gauge-high", label: "Dashboard" },
    { path: "/operations", icon: "fa-solid fa-gears", label: "Operations" },
    { path: "/operations/logs", icon: "fa-solid fa-scroll", label: "System Logs" },
    { path: "/liens", icon: "fa-solid fa-file-invoice-dollar", label: "Liens" },
    { path: "/runs", icon: "fa-solid fa-clock-rotate-left", label: "Run History" },
    { path: "/counties", icon: "fa-solid fa-map-location-dot", label: "Counties" },
  ];

  return (
    <aside className={cn(
      "bg-white shadow-sm border-r border-slate-200 flex flex-col transition-all duration-300 relative h-screen sticky top-0 flex-shrink-0",
      collapsed ? "w-20" : "w-64"
    )}>
      {/* Toggle Button */}
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            onClick={handleToggle}
            className={cn(
              "absolute -right-3.5 top-8 z-50 w-8 h-8 bg-white border-2 border-slate-200 rounded-full",
              "flex items-center justify-center shadow-md hover:shadow-lg hover:border-blue-400",
              "transition-all group hover:bg-blue-50",
              !hasInteracted && "ring-2 ring-blue-400 ring-offset-2"
            )}
            data-testid="button-sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={cn(
              "fa-solid text-sm text-slate-700 group-hover:text-blue-600 transition-all transform group-hover:scale-110",
              collapsed ? "fa-angle-right" : "fa-angle-left"
            )}></i>
          </button>
        </TooltipTrigger>
        <TooltipContent side={collapsed ? "right" : "left"}>
          <p className="text-sm">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</p>
        </TooltipContent>
      </Tooltip>

      {/* Logo */}
      <div className={cn(
        "border-b border-slate-200 transition-all duration-300",
        collapsed ? "p-4" : "p-6"
      )}>
        <div className={cn(
          "flex items-center",
          collapsed ? "justify-center" : "space-x-3"
        )}>
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-xl font-bold text-slate-800">LienStream</h1>
              <p className="text-xs text-slate-500">Automated Processing</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = location === item.path;

            return (
              <li key={item.path}>
                {collapsed ? (
                  // Collapsed state - icon only with tooltip
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.path}
                        className={cn(
                          "flex items-center justify-center h-10 w-full rounded-lg transition-colors",
                          isActive
                            ? "bg-blue-50"
                            : "hover:bg-slate-50"
                        )}
                        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <i className={cn(
                          item.icon,
                          "text-base",
                          isActive ? "text-blue-600" : "text-slate-500"
                        )}></i>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{item.label}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  // Expanded state - icon + label
                  <Link
                    href={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                    )}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <i className={cn(
                      item.icon,
                      "w-5 text-center",
                      isActive ? "text-blue-600" : "text-slate-400"
                    )}></i>
                    <span>{item.label}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Profile with Expandable Menu */}
      <div className="border-t border-slate-200">
        {/* Expandable Menu (shows above user info when open) */}
        {!collapsed && userMenuOpen && (
          <div className="p-2 bg-slate-50 border-b border-slate-200">
            <div className="space-y-1">
              {/* Settings */}
              <button
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-white hover:text-slate-800 transition-colors"
                onClick={() => {
                  setUserMenuOpen(false);
                  setLocation('/settings');
                }}
              >
                <i className="fa-solid fa-gear w-4 text-slate-400"></i>
                <span>Settings</span>
              </button>
              {/* Logout */}
              <button
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                data-testid="button-logout"
                onClick={() => {
                  setUserMenuOpen(false);
                  logout();
                }}
              >
                <i className="fa-solid fa-right-from-bracket w-4"></i>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {/* User Info Bar (clickable to toggle menu) */}
        <div className={cn(
          "transition-all duration-300",
          collapsed ? "p-3" : "p-4"
        )}>
          {collapsed ? (
            <div className="relative flex flex-col items-center">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-lg hover:ring-2 hover:ring-blue-400 transition-all"
              >
                😊
              </button>
              {/* Popup menu for collapsed sidebar */}
              {userMenuOpen && (
                <div className="absolute bottom-full left-full ml-2 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg p-2 min-w-[140px] z-50">
                  <div className="px-3 py-2 border-b border-slate-100 mb-1">
                    <p className="font-medium text-sm text-slate-800">Admin User</p>
                    <p className="text-xs text-slate-500">Administrator</p>
                  </div>
                  <button
                    className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                    onClick={() => {
                      setUserMenuOpen(false);
                      setLocation('/settings');
                    }}
                  >
                    <i className="fa-solid fa-gear w-4 text-slate-400"></i>
                    <span>Settings</span>
                  </button>
                  <button
                    className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                    data-testid="button-logout-collapsed"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                  >
                    <i className="fa-solid fa-right-from-bracket w-4"></i>
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center space-x-3 p-2 -m-2 rounded-lg hover:bg-slate-50 transition-colors group"
            >
              <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-lg group-hover:ring-2 group-hover:ring-blue-400 transition-all">
                😊
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-slate-800 truncate" data-testid="user-name">
                  Admin User
                </p>
                <p className="text-xs text-slate-500 truncate" data-testid="user-role">
                  Administrator
                </p>
              </div>
              <i className={cn(
                "fa-solid fa-chevron-up text-slate-400 transition-transform",
                userMenuOpen ? "rotate-0" : "rotate-180"
              )}></i>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
