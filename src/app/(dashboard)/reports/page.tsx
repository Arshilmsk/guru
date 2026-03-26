
"use client";

import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Pie, PieChart, Cell, ResponsiveContainer, Bar, BarChart, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { CreditCard, Users, Map, Clock } from 'lucide-react';

export default function ReportsPage() {
  const { profile } = useAuth();
  const [gpStats, setGpStats] = useState<{name: string, count: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'jobCards'), (snapshot) => {
      const stats: Record<string, number> = {};
      snapshot.forEach(doc => {
        const gp = doc.data().gramPanchayatName || 'Unknown';
        stats[gp] = (stats[gp] || 0) + 1;
      });
      const data = Object.entries(stats).map(([name, count]) => ({ name, count }));
      setGpStats(data.slice(0, 10)); // Show top 10
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const COLORS = ['#3D748F', '#BBDB26', '#34D399', '#60A5FA', '#F472B6'];

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">Subscription overview and Gram Panchayat-wise statistics.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Subscribed Users" value="1,248" sub="+12% from last month" icon={Users} />
          <MetricCard title="Trial Users" value="450" sub="Potential conversions" icon={Clock} />
          <MetricCard title="Avg. Tokens / User" value="14.2" sub="Consumption rate" icon={CreditCard} />
          <MetricCard title="Total GPs Covered" value="124" sub="Geographic reach" icon={Map} />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Card className="border-border/40 shadow-xl">
            <CardHeader className="bg-muted/30">
              <CardTitle>Gram Panchayat Wise Statistics</CardTitle>
              <CardDescription>Number of registered job cards per GP.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gpStats} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 shadow-xl">
            <CardHeader className="bg-muted/30">
              <CardTitle>Subscription Health</CardTitle>
              <CardDescription>Overview of plan status and expiry.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Standard Plan (Active)</span>
                  <span className="text-accent">72 Days Left</span>
                </div>
                <Progress value={72} className="h-3" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border bg-muted/20">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Plan Cost</p>
                  <p className="text-2xl font-bold">₹12,499</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Billed Annually</p>
                </div>
                <div className="p-4 rounded-xl border bg-muted/20">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Next Recharge</p>
                  <p className="text-2xl font-bold text-accent">May 15, 2024</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Automatic Renewal</p>
                </div>
              </div>

              <div className="h-[200px] flex items-center justify-center">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={gpStats.slice(0, 4)} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                        {gpStats.slice(0, 4).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                 </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function MetricCard({ title, value, sub, icon: Icon }: { title: string, value: string, sub: string, icon: any }) {
  return (
    <Card className="border-border/40 shadow-sm">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-muted-foreground font-semibold">{title}</p>
            <h3 className="text-3xl font-bold mt-1">{value}</h3>
          </div>
          <Icon className="h-6 w-6 text-accent" />
        </div>
        <p className="text-xs text-muted-foreground mt-2">{sub}</p>
      </CardContent>
    </Card>
  );
}
