import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

interface DashboardStats {
  todaysLiens: number;
  airtableSynced: number;
  totalProcessed: number;
  pendingSync: number;
}

export function StatusCards() {
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [dateInput, setDateInput] = useState(today);
  
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats', selectedDate],
    queryFn: async () => {
      const url = selectedDate === today 
        ? '/api/dashboard/stats'
        : `/api/dashboard/stats?date=${selectedDate}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  const isToday = selectedDate === today;
  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-pulse">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-16"></div>
              </div>
              <div className="w-12 h-12 bg-slate-200 rounded-full"></div>
            </div>
            <div className="flex items-center mt-4">
              <div className="h-4 bg-slate-200 rounded w-12 mr-2"></div>
              <div className="h-4 bg-slate-200 rounded w-20"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-6">
          <div className="text-red-600">Failed to load dashboard statistics</div>
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Records Found",
      value: stats.todaysLiens,
      icon: "fas fa-file-medical",
      color: "emerald",
      change: stats.todaysLiens > 0 ? "Active" : "No activity",
      changeLabel: isToday ? "today" : `on ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    },
    {
      label: "Synced to Airtable",
      value: stats.airtableSynced,
      icon: "fas fa-sync",
      color: "blue",
      change: stats.airtableSynced > 0 ? "Synced" : "Pending",
      changeLabel: isToday ? "today" : `on ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    },
    {
      label: "Total Processed",
      value: stats.totalProcessed || stats.todaysLiens,
      icon: "fas fa-database",
      color: "amber",
      change: "Processed",
      changeLabel: isToday ? "today" : `on ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    },
    {
      label: "PDFs Downloaded",
      value: stats.todaysLiens,
      icon: "fas fa-download",
      color: "purple",
      change: "Complete",
      changeLabel: isToday ? "today" : `on ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((card, index) => {
        const bgGradients = {
          emerald: "from-emerald-500 to-emerald-600",
          blue: "from-blue-500 to-blue-600", 
          amber: "from-amber-500 to-amber-600",
          purple: "from-purple-500 to-purple-600"
        };
        
        const iconBg = {
          emerald: "bg-emerald-50",
          blue: "bg-blue-50",
          amber: "bg-amber-50",
          purple: "bg-purple-50"
        };
        
        const iconColors = {
          emerald: "text-emerald-600",
          blue: "text-blue-600",
          amber: "text-amber-600",
          purple: "text-purple-600"
        };

        const statusColors = {
          emerald: "text-emerald-700 bg-emerald-50",
          blue: "text-blue-700 bg-blue-50",
          amber: "text-amber-700 bg-amber-50",
          purple: "text-purple-700 bg-purple-50"
        };
        
        return (
          <div key={index} className="relative bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow border border-slate-100 p-6 overflow-hidden group" data-testid={`card-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>
            {/* Gradient accent bar */}
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${bgGradients[card.color as keyof typeof bgGradients]}`}></div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-slate-600 text-sm font-semibold tracking-wide uppercase" data-testid={`text-${card.label.toLowerCase().replace(/\s+/g, '-')}-label`}>
                  {card.label}
                </p>
                <p className="text-3xl font-bold text-slate-900" data-testid={`text-${card.label.toLowerCase().replace(/\s+/g, '-')}-value`}>
                  {card.value.toLocaleString()}
                </p>
              </div>
              <div className={`w-14 h-14 ${iconBg[card.color as keyof typeof iconBg]} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <i className={`${card.icon} text-lg ${iconColors[card.color as keyof typeof iconColors]}`}></i>
              </div>
            </div>
            <div className="mt-4">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[card.color as keyof typeof statusColors]}`} data-testid={`text-${card.label.toLowerCase().replace(/\s+/g, '-')}-change`}>
                {card.change} {card.changeLabel}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
