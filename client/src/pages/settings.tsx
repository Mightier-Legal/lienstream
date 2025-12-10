import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Key, ChevronRight, Settings as SettingsIcon, Webhook } from "lucide-react";

interface SettingsCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  badge?: string;
}

const settingsCards: SettingsCard[] = [
  {
    title: "Schedule",
    description: "Configure automation timing, frequency, and timezone settings",
    icon: <Clock className="h-6 w-6" />,
    href: "/settings/schedule",
  },
  {
    title: "API Keys & Secrets",
    description: "Manage Airtable credentials, API tokens, and integration secrets",
    icon: <Key className="h-6 w-6" />,
    href: "/settings/secrets",
  },
  {
    title: "Integrations",
    description: "Connect to Slack, webhooks, and other external services",
    icon: <Webhook className="h-6 w-6" />,
    href: "/settings/integrations",
    badge: "Coming Soon",
  },
];

export default function Settings() {
  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <SettingsIcon className="h-6 w-6 text-slate-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
              <p className="text-sm text-slate-500">
                Manage your application configuration and preferences
              </p>
            </div>
          </div>
        </div>

        {/* Settings Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {settingsCards.map((card) => (
            <Link key={card.href} href={card.badge ? "#" : card.href}>
              <Card
                className={`group transition-all duration-200 h-full ${
                  card.badge
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:shadow-md hover:border-slate-300 cursor-pointer"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className={`p-2.5 rounded-lg ${
                      card.badge ? "bg-slate-100" : "bg-blue-50 group-hover:bg-blue-100"
                    } transition-colors`}>
                      <div className={card.badge ? "text-slate-400" : "text-blue-600"}>
                        {card.icon}
                      </div>
                    </div>
                    {card.badge ? (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-medium">
                        {card.badge}
                      </span>
                    ) : (
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                    )}
                  </div>
                  <CardTitle className={`text-lg mt-3 ${card.badge ? "text-slate-500" : "text-slate-800"}`}>
                    {card.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <CardDescription className="text-sm leading-relaxed">
                    {card.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick Info Section */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-amber-100 rounded">
                <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-sm">
                <p className="font-medium text-slate-700">Environment Variables</p>
                <p className="text-slate-500 mt-0.5">
                  Settings stored here override environment variables. Secret values are masked for security but can be revealed when editing.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
