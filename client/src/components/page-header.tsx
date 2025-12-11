import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type StatColor = 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'slate';

export interface StatIndicator {
  key: string;
  label: string;
  value: number;
  color: StatColor;
  tooltip?: string;
  onClick?: () => void;
  active?: boolean;
}

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface DatePickerConfig {
  type: 'single' | 'range';
  value: string | DateRangeValue;
  onChange: (value: string | DateRangeValue) => void;
  showTodayButton?: boolean;
  max?: string;
}

export type ButtonVariant = 'default' | 'outline' | 'destructive' | 'gradient-blue' | 'gradient-red';

export interface ActionButton {
  label: string;
  icon?: string;
  onClick: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
}

export interface PageHeaderProps {
  title: string;
  stats?: StatIndicator[];
  datePicker?: DatePickerConfig;
  actions?: ActionButton[];
  children?: React.ReactNode;
}

const colorClasses: Record<StatColor, { dot: string; active: string; hover: string }> = {
  blue: {
    dot: 'bg-blue-500',
    active: 'bg-blue-100 ring-1 ring-blue-400',
    hover: 'hover:bg-slate-100',
  },
  green: {
    dot: 'bg-green-500',
    active: 'bg-green-100 ring-1 ring-green-400',
    hover: 'hover:bg-slate-100',
  },
  yellow: {
    dot: 'bg-yellow-500',
    active: 'bg-yellow-100 ring-1 ring-yellow-400',
    hover: 'hover:bg-slate-100',
  },
  orange: {
    dot: 'bg-orange-500',
    active: 'bg-orange-100 ring-1 ring-orange-400',
    hover: 'hover:bg-slate-100',
  },
  red: {
    dot: 'bg-red-500',
    active: 'bg-red-100 ring-1 ring-red-400',
    hover: 'hover:bg-slate-100',
  },
  purple: {
    dot: 'bg-purple-500',
    active: 'bg-purple-100 ring-1 ring-purple-400',
    hover: 'hover:bg-slate-100',
  },
  slate: {
    dot: 'bg-slate-500',
    active: 'bg-slate-200 ring-1 ring-slate-400',
    hover: 'hover:bg-slate-100',
  },
};

function StatIndicatorButton({ stat }: { stat: StatIndicator }) {
  const colors = colorClasses[stat.color];
  const isClickable = !!stat.onClick;

  const button = (
    <button
      onClick={stat.onClick}
      disabled={!isClickable}
      className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
        stat.active ? colors.active : isClickable ? colors.hover : ''
      } ${!isClickable ? 'cursor-default' : ''}`}
    >
      <span className={`w-2 h-2 rounded-full ${colors.dot}`}></span>
      <span className="text-slate-600 text-sm">{stat.value.toLocaleString()}</span>
    </button>
  );

  if (stat.tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="text-sm">
            <div className="font-medium">{stat.label}</div>
            <div className="text-slate-500">{stat.tooltip}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

function DatePickerSection({ config }: { config: DatePickerConfig }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  if (config.type === 'single') {
    const value = config.value as string;
    return (
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={value}
          onChange={(e) => config.onChange(e.target.value)}
          max={config.max || today}
          className="w-40 h-8 text-sm"
        />
        {config.showTodayButton && value !== today && (
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-600 h-8 px-2"
            onClick={() => config.onChange(today)}
          >
            Today
          </Button>
        )}
      </div>
    );
  }

  // Date range picker
  const rangeValue = config.value as DateRangeValue;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">From:</label>
        <Input
          type="date"
          value={rangeValue.from}
          onChange={(e) => config.onChange({ ...rangeValue, from: e.target.value })}
          max={rangeValue.to}
          className="w-40 h-8 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">To:</label>
        <Input
          type="date"
          value={rangeValue.to}
          onChange={(e) => config.onChange({ ...rangeValue, to: e.target.value })}
          min={rangeValue.from}
          className="w-40 h-8 text-sm"
        />
      </div>
    </div>
  );
}

function ActionButtonComponent({ action }: { action: ActionButton }) {
  // Handle gradient variants - use size="sm" to match other buttons (h-8)
  if (action.variant === 'gradient-blue') {
    return (
      <Button
        size="sm"
        onClick={action.onClick}
        disabled={action.disabled}
        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all hover:shadow-lg hover:shadow-blue-500/25"
      >
        {action.icon && <i className={`${action.icon} text-xs`}></i>}
        <span>{action.label}</span>
      </Button>
    );
  }

  if (action.variant === 'gradient-red') {
    return (
      <Button
        size="sm"
        onClick={action.onClick}
        disabled={action.disabled}
        className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium flex items-center gap-1.5 shadow-md shadow-red-500/20 transition-all hover:shadow-lg hover:shadow-red-500/25"
      >
        {action.icon && <i className={`${action.icon} text-xs`}></i>}
        <span>{action.label}</span>
      </Button>
    );
  }

  // Standard shadcn variants
  const variant = action.variant === 'destructive' ? 'destructive' :
                  action.variant === 'outline' ? 'outline' : 'default';

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.icon && <i className={`${action.icon} mr-1`}></i>}
      {action.label}
    </Button>
  );
}

// Shared header height constant - sidebar imports this to stay in sync
export const HEADER_HEIGHT = "h-16"; // 64px

export function PageHeader({
  title,
  stats,
  datePicker,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <header className={`bg-white border-b border-slate-200 px-6 ${HEADER_HEIGHT} flex items-center`}>
      <div className="flex items-center justify-between w-full">
        {/* Left side: Title, Date Picker, Stats */}
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>

          {datePicker && <DatePickerSection config={datePicker} />}

          {stats && stats.length > 0 && (
            <div className="flex items-center gap-3">
              {stats.map((stat) => (
                <StatIndicatorButton key={stat.key} stat={stat} />
              ))}
            </div>
          )}
        </div>

        {/* Right side: Children (custom content) + Actions */}
        <div className="flex items-center gap-2">
          {children}

          {actions && actions.map((action, index) => (
            <ActionButtonComponent key={index} action={action} />
          ))}
        </div>
      </div>
    </header>
  );
}
