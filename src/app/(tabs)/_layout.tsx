import React from 'react';
import { Tabs } from 'expo-router';
import { ElPlayTabBar } from '../../components/layout';

export default function TabsLayout() {
    return (
        <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <ElPlayTabBar {...props} />}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="posiciones" />
            <Tabs.Screen name="fantasy" />
            <Tabs.Screen name="mas" />
        </Tabs>
    );
}
