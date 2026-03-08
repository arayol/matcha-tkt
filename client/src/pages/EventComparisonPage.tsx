import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Users, Ticket, DollarSign, TrendingUp,
  Table2, BarChart, Clock, Layers,
} from "lucide-react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AppLayout from "@/components/AppLayout";

interface EventComparison {
  eventId: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventType: string;
  totalTickets: number;
  memberTickets: number;
  generalTickets: number;
  vendorCount: number;
  stripeRevenueCents: number;
  csvRevenue: number;
  capacity: number | null;
  occupancyRate: number | null;
  checkedIn: number;
  classBreakdown: Record<string, number>;
  timeBreakdown: Record<string, number>;
  csvOrderCount: number;
}

interface EventComparisonPageProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

type ViewMode = "charts" | "table";

export default function EventComparisonPage({ dark, toggleTheme, onLogout, user }: EventComparisonPageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("charts");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const { data: comparison, isLoading } = useQuery<EventComparison[]>({
    queryKey: ["/api/admin/events/comparison"],
  });

  const events = comparison || [];
  const displayEvents = selectedEvents.length > 0
    ? events.filter(e => selectedEvents.includes(e.eventId))
    : events;

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  const ticketChartData = displayEvents.map(e => ({
    name: e.eventName.length > 20 ? e.eventName.slice(0, 20) + "..." : e.eventName,
    Members: e.memberTickets,
    General: e.generalTickets,
    Total: e.totalTickets,
  }));

  const revenueChartData = displayEvents.map(e => ({
    name: e.eventName.length > 20 ? e.eventName.slice(0, 20) + "..." : e.eventName,
    "Stripe ($)": (e.stripeRevenueCents / 100).toFixed(2),
    "CSV ($)": e.csvRevenue.toFixed(2),
  }));

  const vendorChartData = displayEvents.map(e => ({
    name: e.eventName.length > 20 ? e.eventName.slice(0, 20) + "..." : e.eventName,
    Vendors: e.vendorCount,
    Tickets: e.totalTickets,
  }));

  const occupancyChartData = displayEvents
    .filter(e => e.occupancyRate !== null)
    .map(e => ({
      name: e.eventName.length > 20 ? e.eventName.slice(0, 20) + "..." : e.eventName,
      "Occupancy %": e.occupancyRate,
      "Checked In": e.checkedIn,
    }));

  const totalTicketsAll = displayEvents.reduce((s, e) => s + e.totalTickets, 0);
  const totalRevenueAll = displayEvents.reduce((s, e) => s + e.stripeRevenueCents, 0);
  const totalVendorsAll = displayEvents.reduce((s, e) => s + e.vendorCount, 0);
  const avgOccupancy = displayEvents.filter(e => e.occupancyRate !== null).length > 0
    ? Math.round(displayEvents.filter(e => e.occupancyRate !== null).reduce((s, e) => s + (e.occupancyRate || 0), 0) / displayEvents.filter(e => e.occupancyRate !== null).length)
    : null;

  return (
    <AppLayout dark={dark} toggleTheme={toggleTheme} onLogout={onLogout} user={user} activePath="/admin/events" data-testid="event-comparison-page">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" data-testid="text-page-title">Event Comparison</h1>
            <p className="text-sm text-muted-foreground mt-1">Compare metrics across events</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "charts" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("charts")}
              data-testid="button-view-charts"
            >
              <BarChart className="h-4 w-4 mr-1.5" />
              Charts
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("table")}
              data-testid="button-view-table"
            >
              <Table2 className="h-4 w-4 mr-1.5" />
              Table
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="p-4 md:p-5">
                <Skeleton className="h-5 w-5 mb-3" />
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-24" />
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <Card className="p-4 md:p-5" data-testid="stat-total-tickets">
                <Ticket className="h-5 w-5 mb-2 md:mb-3 text-primary" />
                <p className="text-2xl font-semibold">{totalTicketsAll}</p>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">Total Tickets</p>
              </Card>
              <Card className="p-4 md:p-5" data-testid="stat-total-revenue">
                <DollarSign className="h-5 w-5 mb-2 md:mb-3 text-chart-3" />
                <p className="text-2xl font-semibold">${(totalRevenueAll / 100).toFixed(0)}</p>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">Stripe Revenue</p>
              </Card>
              <Card className="p-4 md:p-5" data-testid="stat-total-vendors">
                <Users className="h-5 w-5 mb-2 md:mb-3 text-chart-2" />
                <p className="text-2xl font-semibold">{totalVendorsAll}</p>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">Vendors</p>
              </Card>
              <Card className="p-4 md:p-5" data-testid="stat-avg-occupancy">
                <TrendingUp className="h-5 w-5 mb-2 md:mb-3 text-chart-4" />
                <p className="text-2xl font-semibold">{avgOccupancy !== null ? `${avgOccupancy}%` : "N/A"}</p>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">Avg Occupancy</p>
              </Card>
            </div>

            {events.length > 1 && (
              <Card className="p-4 md:p-5">
                <p className="text-sm font-medium mb-3">Select events to compare</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedEvents.length === 0 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedEvents([])}
                    data-testid="button-select-all-events"
                  >
                    All Events
                  </Button>
                  {events.map(e => (
                    <Button
                      key={e.eventId}
                      variant={selectedEvents.includes(e.eventId) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleEvent(e.eventId)}
                      data-testid={`button-select-event-${e.eventId}`}
                    >
                      {e.eventName}
                    </Button>
                  ))}
                </div>
              </Card>
            )}

            {viewMode === "charts" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                <Card className="p-4 md:p-6" data-testid="chart-tickets-by-type">
                  <div className="flex items-center gap-2 mb-4">
                    <Ticket className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Tickets by Type</h3>
                  </div>
                  {ticketChartData.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsBarChart data={ticketChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: 12,
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="Members" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="General" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
                  )}
                </Card>

                <Card className="p-4 md:p-6" data-testid="chart-revenue">
                  <div className="flex items-center gap-2 mb-4">
                    <DollarSign className="h-5 w-5 text-chart-3" />
                    <h3 className="font-semibold">Revenue per Event</h3>
                  </div>
                  {revenueChartData.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsBarChart data={revenueChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: 12,
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="Stripe ($)" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="CSV ($)" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
                  )}
                </Card>

                <Card className="p-4 md:p-6" data-testid="chart-vendors">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="h-5 w-5 text-chart-2" />
                    <h3 className="font-semibold">Vendors per Event</h3>
                  </div>
                  {vendorChartData.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsBarChart data={vendorChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: 12,
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="Vendors" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Tickets" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
                  )}
                </Card>

                <Card className="p-4 md:p-6" data-testid="chart-occupancy">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-5 w-5 text-chart-4" />
                    <h3 className="font-semibold">Occupancy & Check-ins</h3>
                  </div>
                  {occupancyChartData.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={occupancyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: 12,
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Line type="monotone" dataKey="Occupancy %" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="Checked In" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No occupancy data available</p>
                  )}
                </Card>

                {displayEvents.some(e => Object.keys(e.classBreakdown).length > 0) && (
                  <Card className="p-4 md:p-6 lg:col-span-2" data-testid="chart-class-breakdown">
                    <div className="flex items-center gap-2 mb-4">
                      <Layers className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">Class Breakdown</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {displayEvents.filter(e => Object.keys(e.classBreakdown).length > 0).map(e => (
                        <div key={e.eventId} className="space-y-2">
                          <p className="text-sm font-medium truncate">{e.eventName}</p>
                          {Object.entries(e.classBreakdown).map(([cls, count]) => (
                            <div key={cls} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-muted-foreground truncate">{cls}</span>
                              <Badge variant="secondary">{count}</Badge>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {displayEvents.some(e => Object.keys(e.timeBreakdown).length > 0) && (
                  <Card className="p-4 md:p-6 lg:col-span-2" data-testid="chart-time-breakdown">
                    <div className="flex items-center gap-2 mb-4">
                      <Clock className="h-5 w-5 text-chart-3" />
                      <h3 className="font-semibold">Time Slot Breakdown</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {displayEvents.filter(e => Object.keys(e.timeBreakdown).length > 0).map(e => (
                        <div key={e.eventId} className="space-y-2">
                          <p className="text-sm font-medium truncate">{e.eventName}</p>
                          {Object.entries(e.timeBreakdown).map(([time, count]) => (
                            <div key={time} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-muted-foreground truncate">{time}</span>
                              <Badge variant="secondary">{count}</Badge>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="overflow-x-auto" data-testid="table-comparison">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground">Event</th>
                      <th className="text-left p-3 md:p-4 font-medium text-muted-foreground">Date</th>
                      <th className="text-right p-3 md:p-4 font-medium text-muted-foreground">Total</th>
                      <th className="text-right p-3 md:p-4 font-medium text-muted-foreground">Members</th>
                      <th className="text-right p-3 md:p-4 font-medium text-muted-foreground">General</th>
                      <th className="text-right p-3 md:p-4 font-medium text-muted-foreground">Vendors</th>
                      <th className="text-right p-3 md:p-4 font-medium text-muted-foreground">Stripe Rev</th>
                      <th className="text-right p-3 md:p-4 font-medium text-muted-foreground">CSV Rev</th>
                      <th className="text-right p-3 md:p-4 font-medium text-muted-foreground">Occupancy</th>
                      <th className="text-right p-3 md:p-4 font-medium text-muted-foreground">Checked In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayEvents.map(e => (
                      <tr key={e.eventId} className="border-b border-border last:border-0" data-testid={`row-event-${e.eventId}`}>
                        <td className="p-3 md:p-4 font-medium">{e.eventName}</td>
                        <td className="p-3 md:p-4 text-muted-foreground">{e.eventDate}</td>
                        <td className="p-3 md:p-4 text-right">{e.totalTickets}</td>
                        <td className="p-3 md:p-4 text-right">{e.memberTickets}</td>
                        <td className="p-3 md:p-4 text-right">{e.generalTickets}</td>
                        <td className="p-3 md:p-4 text-right">{e.vendorCount}</td>
                        <td className="p-3 md:p-4 text-right">${(e.stripeRevenueCents / 100).toFixed(2)}</td>
                        <td className="p-3 md:p-4 text-right">${e.csvRevenue.toFixed(2)}</td>
                        <td className="p-3 md:p-4 text-right">{e.occupancyRate !== null ? `${e.occupancyRate}%` : "N/A"}</td>
                        <td className="p-3 md:p-4 text-right">{e.checkedIn}</td>
                      </tr>
                    ))}
                    {displayEvents.length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">No events to display</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
