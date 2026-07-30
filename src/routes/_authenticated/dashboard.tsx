import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, CircleAlert, LayoutDashboard, Sparkles, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { LoadingBlock, LoadingCards } from "@/components/LoadingBlock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { getDashboardStats } from "@/lib/dashboard.functions";
import { WEBSITE_STATUS_LABELS } from "@/lib/domain";
import type { WebsiteStatus } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

/**
 * Colors are the app's own established status tokens (the same ones
 * StatusBadge uses), not a new categorical palette — a qualifying status
 * reads as the same green here as it does everywhere else in the app. Both
 * qualifying statuses (no_website_found, facebook_only) share the qualified
 * color on purpose: the distinction that matters to a user is qualified vs.
 * not, not which of the two qualifying reasons applied.
 */
const WEBSITE_STATUS_COLOR: Record<WebsiteStatus, string> = {
  no_website_found: "var(--status-qualified)",
  facebook_only: "var(--status-qualified)",
  website_found: "var(--status-has-site)",
  needs_manual_review: "var(--status-review)",
  unable_to_verify: "var(--status-unknown)",
};

const trendConfig = {
  count: { label: "Leads found", color: "var(--chart-1)" },
} satisfies ChartConfig;

const categoryConfig = {
  count: { label: "Leads", color: "var(--chart-2)" },
} satisfies ChartConfig;

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => getDashboardStats(),
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Qualified leads at a glance, plus what's been found recently."
      />

      {isLoading || !data ? (
        <>
          <LoadingCards count={4} />
          <div className="mt-4">
            <LoadingBlock rows={6} label="Loading dashboard" />
          </div>
        </>
      ) : data.totalActive === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No leads yet"
          description="Run a search from Find Leads, or load demo data from Saved Leads, to see charts here."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Bookmark} label="Active leads" value={data.totalActive} />
            <StatCard
              icon={Sparkles}
              label="Qualified"
              value={data.qualified}
              hint={`${Math.round((data.qualified / data.totalActive) * 100)}% of active`}
            />
            <StatCard icon={CircleAlert} label="Needs manual review" value={data.needsReview} />
            <StatCard icon={TrendingUp} label="Found this week" value={data.newThisWeek} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Leads found, last 14 days</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
                <AreaChart data={data.trend} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value: string) =>
                      new Date(value + "T00:00:00").toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                  <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value: string) =>
                          new Date(value + "T00:00:00").toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        }
                      />
                    }
                  />
                  <Area
                    dataKey="count"
                    type="monotone"
                    fill="var(--color-count)"
                    fillOpacity={0.2}
                    stroke="var(--color-count)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Leads by website status</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
                  <BarChart
                    data={(Object.entries(data.byWebsiteStatus) as [WebsiteStatus, number][]).map(
                      ([status, count]) => ({
                        status,
                        label: WEBSITE_STATUS_LABELS[status],
                        count,
                        fill: WEBSITE_STATUS_COLOR[status],
                      }),
                    )}
                    layout="vertical"
                    margin={{ left: 8, right: 8 }}
                  >
                    <CartesianGrid horizontal={false} strokeOpacity={0.5} />
                    <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis
                      dataKey="label"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      width={130}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={4}>
                      {(Object.entries(data.byWebsiteStatus) as [WebsiteStatus, number][]).map(
                        ([status]) => (
                          <Cell key={status} fill={WEBSITE_STATUS_COLOR[status]} />
                        ),
                      )}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top categories</CardTitle>
              </CardHeader>
              <CardContent>
                {data.byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No categories recorded yet.</p>
                ) : (
                  <ChartContainer config={categoryConfig} className="aspect-auto h-64 w-full">
                    <BarChart
                      data={data.byCategory}
                      layout="vertical"
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid horizontal={false} strokeOpacity={0.5} />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        dataKey="category"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={130}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Bookmark;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}
