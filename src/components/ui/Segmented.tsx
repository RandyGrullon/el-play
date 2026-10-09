import React from 'react';

interface SegmentedProps<T extends string> {
    value: T;
    options: { value: T; label: React.ReactNode; badge?: React.ReactNode }[];
    onChange: (value: T) => void;
    label: string;
    size?: 'sm' | 'md';
    className?: string;
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md', className = '' }: SegmentedProps<T>) {
    return (
        <div role="tablist" aria-label={label} className={`inline-flex max-w-full overflow-x-auto rounded-full bg-raised p-1 scrollbar-none ${className}`}>
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(option.value)}
                        className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors ${
                            size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'
                        } ${active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'}`}
                    >
                        {option.label}
                        {option.badge}
                    </button>
                );
            })}
        </div>
    );
}
