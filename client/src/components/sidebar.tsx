import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

interface MenuItem {
  path: string;
  icon: string;
  label: string;
  children?: MenuItem[];
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
  const [expandedMenus, setExpandedMenus] = useState<string[]>(() => {
    const saved = localStorage.getItem("sidebar-expanded-menus");
    return saved ? JSON.parse(saved) : ["Operations"]; // Operations expanded by default
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed.toString());
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem("sidebar-expanded-menus", JSON.stringify(expandedMenus));
  }, [expandedMenus]);

  const handleToggle = () => {
    setCollapsed(!collapsed);
    if (!hasInteracted) {
      setHasInteracted(true);
      localStorage.setItem("sidebar-toggle-clicked", "true");
    }
  };

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev =>
      prev.includes(label)
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  const menuItems: MenuItem[] = [
    { path: "/", icon: "fas fa-tachometer-alt", label: "Dashboard" },
    {
      path: "/operations",
      icon: "fas fa-cogs",
      label: "Operations",
      children: [
        { path: "/operations/logs", icon: "fas fa-clipboard-list", label: "System Logs" },
      ]
    },
    { path: "/liens", icon: "fas fa-file-invoice-dollar", label: "Liens" },
    { path: "/runs", icon: "fas fa-history", label: "Run History" },
    { path: "/counties", icon: "fas fa-map-marked-alt", label: "Counties" },
  ];

  const isMenuActive = (item: MenuItem): boolean => {
    if (location === item.path) return true;
    if (item.children) {
      return item.children.some(child => location === child.path);
    }
    return false;
  };

  return (
    <aside className={cn(
      "bg-white shadow-sm border-r border-slate-200 flex flex-col transition-all duration-300 relative h-screen sticky top-0 flex-shrink-0",
      collapsed ? "w-20" : "w-64"
    )}>
      {/* Toggle Button - Subtle Circular with Arrow */}
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
              "fas text-sm text-slate-700 group-hover:text-blue-600 transition-all transform group-hover:scale-110",
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
          {menuItems.map((item) => (
            <li key={item.path}>
              {collapsed ? (
                // Collapsed state - show icon with tooltip
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.path}
                      className={cn(
                        "flex items-center justify-center px-3 py-2.5 rounded-lg font-medium transition-colors",
                        isMenuActive(item)
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-slate-50"
                      )}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <i className={`${item.icon} text-lg`}></i>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              ) : item.children ? (
                // Expanded state with children - accordion
                <div>
                  <button
                    onClick={() => toggleMenu(item.label)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-colors",
                      isMenuActive(item)
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-50"
                    )}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="flex items-center space-x-3">
                      <i className={`${item.icon} w-5 text-center`}></i>
                      <span>{item.label}</span>
                    </div>
                    <i className={cn(
                      "fas fa-chevron-down text-xs transition-transform duration-200",
                      expandedMenus.includes(item.label) ? "rotate-180" : ""
                    )}></i>
                  </button>
                  {/* Children items */}
                  <div className={cn(
                    "overflow-hidden transition-all duration-200",
                    expandedMenus.includes(item.label) ? "max-h-40 mt-1" : "max-h-0"
                  )}>
                    <ul className="ml-4 pl-3 border-l-2 border-slate-200 space-y-1">
                      {item.children.map((child) => (
                        <li key={child.path}>
                          <Link
                            href={child.path}
                            className={cn(
                              "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                              location === child.path
                                ? "bg-blue-50 text-blue-700"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            )}
                            data-testid={`nav-${child.label.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <i className={`${child.icon} w-4 text-center text-sm`}></i>
                            <span>{child.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                // Expanded state without children - simple link
                <Link
                  href={item.path}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2.5 rounded-lg font-medium transition-colors",
                    location === item.path
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <i className={`${item.icon} w-5 text-center`}></i>
                  <span>{item.label}</span>
                </Link>
              )}
            </li>
          ))}
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
                <i className="fas fa-cog w-4"></i>
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
                <i className="fas fa-sign-out-alt w-4"></i>
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
                    <i className="fas fa-cog w-4"></i>
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
                    <i className="fas fa-sign-out-alt w-4"></i>
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
                "fas fa-chevron-up text-slate-400 transition-transform",
                userMenuOpen ? "rotate-0" : "rotate-180"
              )}></i>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
