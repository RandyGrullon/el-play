import React from 'react';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

export const GameDetailSkeleton: React.FC = () => {
    return (
        <div className="space-y-6">
            {/* Back Button Skeleton */}
            <Skeleton className="w-20 h-4" />

            <Card className="min-h-[80vh] relative overflow-hidden">
                {/* Scoreboard Skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center mb-8">
                    {/* Away Team */}
                    <div className="flex flex-col items-center gap-2">
                        <Skeleton className="w-20 h-20 rounded-full" />
                        <Skeleton className="h-8 w-32" />
                        <Skeleton className="h-4 w-16" />
                    </div>

                    {/* Score Info */}
                    <div className="flex flex-col items-center gap-2">
                        <Skeleton className="h-6 w-24 rounded-full" />
                        <div className="flex items-center gap-8">
                            <Skeleton className="h-16 w-12" />
                            <div className="flex flex-col items-center gap-2">
                                <Skeleton className="h-4 w-12" />
                                <Skeleton className="h-4 w-12" />
                            </div>
                            <Skeleton className="h-16 w-12" />
                        </div>
                    </div>

                    {/* Home Team */}
                    <div className="flex flex-col items-center gap-2">
                        <Skeleton className="w-20 h-20 rounded-full" />
                        <Skeleton className="h-8 w-32" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                </div>

                {/* Tabs Skeleton */}
                <div className="flex justify-center mb-6">
                    <Skeleton className="h-10 w-64 rounded-full" />
                </div>

                {/* Content Skeleton */}
                <div className="space-y-8">
                    <Skeleton className="h-24 w-full rounded-xl" />

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-8">
                        <Skeleton className="h-40 rounded-xl" />
                        <div className="flex flex-col items-center gap-4">
                            <Skeleton className="w-48 h-64" /> {/* Strike Zone */}
                            <Skeleton className="w-48 h-48 rotate-45" /> {/* Diamond */}
                        </div>
                        <Skeleton className="h-64 rounded-xl" />
                    </div>
                </div>
            </Card>
        </div>
    );
};
