import React from 'react';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

export const GameCardSkeleton: React.FC = () => {
    return (
        <Card className="h-full border-l-4 border-l-zinc-800">
            {/* Header: Status & Time */}
            <div className="flex justify-between items-center mb-4">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-12" />
            </div>

            {/* Teams & Scores */}
            <div className="space-y-3">
                {/* Away Team */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <Skeleton className="h-5 w-24" />
                    </div>
                    <Skeleton className="h-6 w-8" />
                </div>

                {/* Home Team */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <Skeleton className="h-5 w-24" />
                    </div>
                    <Skeleton className="h-6 w-8" />
                </div>
            </div>
        </Card>
    );
};
