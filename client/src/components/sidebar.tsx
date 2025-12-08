import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });
  const [hasInteracted, setHasInteracted] = useState(() => {
    return localStorage.getItem("sidebar-toggle-clicked") === "true";
  });

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

  const menuItems = [
    { path: "/", icon: "fas fa-tachometer-alt", label: "Dashboard" },
    { path: "/runs", icon: "fas fa-history", label: "Run History" },
    { path: "/counties", icon: "fas fa-map", label: "Counties" },
  ];

  return (
    <aside className={cn(
      "bg-white shadow-sm border-r border-slate-200 flex flex-col transition-all duration-300 relative",
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
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.path}>
              {collapsed ? (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link 
                      href={item.path}
                      className={cn(
                        "flex items-center justify-center px-3 py-2 rounded-lg font-medium transition-colors",
                        location === item.path 
                          ? "bg-blue-50 text-blue-700" 
                          : "text-slate-600 hover:bg-slate-50"
                      )}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <i className={`${item.icon} w-5`}></i>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link 
                  href={item.path}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-colors",
                    location === item.path 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <i className={`${item.icon} w-5`}></i>
                  <span>{item.label}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
      
      {/* User Profile */}
      <div className={cn(
        "border-t border-slate-200 transition-all duration-300",
        collapsed ? "p-3" : "p-4"
      )}>
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center space-y-2">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-lg">
                  😊
                </div>
                <button 
                  className="text-slate-400 hover:text-slate-600 text-sm" 
                  data-testid="button-logout"
                  onClick={logout}
                  title="Sign Out"
                >
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div>
                <p className="font-medium">Admin User</p>
                <p className="text-xs text-slate-500">Administrator</p>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-lg">
              😊
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate" data-testid="user-name">
                Admin User
              </p>
              <p className="text-xs text-slate-500 truncate" data-testid="user-role">
                Administrator
              </p>
            </div>
            <button 
              className="text-slate-400 hover:text-slate-600" 
              data-testid="button-logout"
              onClick={logout}
              title="Sign Out"
            >
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
