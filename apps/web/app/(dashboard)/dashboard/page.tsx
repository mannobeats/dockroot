"use client";

import { Skeleton } from "@heroui/react";
import {
	Activity,
	ArrowRight,
	BarChart3,
	CheckCircle2,
	ChevronRight,
	Database,
	HardDrive,
	PieChart as PieChartIcon,
	Settings,
	Shield,
	TrendingUp,
	Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useSession } from "@/lib/auth-client";

const trafficData = [
	{ name: "Mon", visits: 120, api: 80 },
	{ name: "Tue", visits: 180, api: 120 },
	{ name: "Wed", visits: 150, api: 90 },
	{ name: "Thu", visits: 280, api: 200 },
	{ name: "Fri", visits: 220, api: 160 },
	{ name: "Sat", visits: 90, api: 50 },
	{ name: "Sun", visits: 110, api: 70 },
];

const weeklyData = [
	{ name: "W1", users: 45, sessions: 120 },
	{ name: "W2", users: 52, sessions: 145 },
	{ name: "W3", users: 61, sessions: 170 },
	{ name: "W4", users: 58, sessions: 155 },
];

const resourceData = [
	{ name: "Database", value: 35 },
	{ name: "Storage", value: 25 },
	{ name: "Compute", value: 20 },
	{ name: "Network", value: 20 },
];

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

const stats = [
	{ label: "Services", value: "0", sub: "Add your first service", icon: HardDrive },
	{ label: "Uptime", value: "—", sub: "No data yet", icon: Activity },
	{ label: "Storage", value: "—", sub: "Not configured", icon: Database },
	{ label: "Users", value: "1", sub: "1 active now", icon: Users },
];

const recentActivity = [
	{ label: "Account created", category: "Auth", status: "Success", time: "Just now" },
];

const quickActions = [
	{
		href: "/dashboard/settings",
		icon: Settings,
		title: "Settings",
		description: "Configure your application",
	},
	{
		href: "/dashboard",
		icon: Database,
		title: "Database",
		description: "Manage your PostgreSQL database",
	},
	{
		href: "/dashboard",
		icon: Shield,
		title: "Security",
		description: "Auth & access control",
	},
];

export default function DashboardPage() {
	const { data: session, isPending } = useSession();
	const router = useRouter();

	if (isPending)
		return (
			<div className="p-4">
				<Skeleton className="h-96 w-full rounded-xl" />
			</div>
		);
	if (!session) {
		router.push("/sign-in");
		return null;
	}

	return (
		<div className="flex flex-col gap-4 sm:gap-6">
			{/* Header */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-lg sm:text-xl font-semibold tracking-tight">Dashboard</h1>
					<p className="mt-0.5 text-[13px] text-muted">Welcome back, {session.user.name}</p>
				</div>
				<div className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 w-fit">
					<CheckCircle2 className="h-3.5 w-3.5 text-success" />
					<span className="text-[12px] font-medium text-success">All systems operational</span>
				</div>
			</div>

			{/* Stats Grid */}
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{stats.map((stat) => (
					<div
						key={stat.label}
						className="rounded-xl border border-default/20 bg-surface p-3 sm:p-5"
					>
						<div className="flex items-center justify-between">
							<span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
								{stat.label}
							</span>
							<stat.icon className="h-4 w-4 text-muted" />
						</div>
						<p className="mt-2 text-2xl font-bold tracking-tight">{stat.value}</p>
						<p className="mt-0.5 text-[12px] text-muted">{stat.sub}</p>
					</div>
				))}
			</div>

			{/* Activity + Quick Actions */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{/* Recent Activity */}
				<div className="rounded-xl border border-default/20 bg-surface">
					<div className="flex items-center justify-between border-b border-default/10 px-5 py-3.5">
						<h2 className="text-[14px] font-semibold">Recent Activity</h2>
						<span className="text-[12px] text-muted">Last 24 hours</span>
					</div>
					<div className="divide-y divide-default/10">
						{recentActivity.map((item) => (
							<div key={item.label} className="flex items-center gap-3.5 px-5 py-3.5">
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
									<CheckCircle2 className="h-4 w-4 text-success" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-[13px] font-medium">{item.label}</p>
									<p className="text-[12px] text-muted">{item.category}</p>
								</div>
								<div className="text-right shrink-0">
									<span className="inline-flex items-center rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
										{item.status}
									</span>
									<p className="mt-0.5 text-[11px] text-muted">{item.time}</p>
								</div>
							</div>
						))}
						{recentActivity.length <= 1 && (
							<div className="px-5 py-8 text-center">
								<p className="text-[13px] text-muted">
									Activity will appear here as you use the application.
								</p>
							</div>
						)}
					</div>
				</div>

				{/* Quick Actions */}
				<div className="rounded-xl border border-default/20 bg-surface">
					<div className="border-b border-default/10 px-5 py-3.5">
						<h2 className="text-[14px] font-semibold">Quick Actions</h2>
					</div>
					<div className="divide-y divide-default/10">
						{quickActions.map((action) => (
							<Link
								key={action.title}
								href={action.href}
								className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-default/5"
							>
								<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/8">
									<action.icon className="h-4 w-4 text-accent" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-[13px] font-medium">{action.title}</p>
									<p className="text-[12px] text-muted">{action.description}</p>
								</div>
								<ChevronRight className="h-4 w-4 shrink-0 text-muted" />
							</Link>
						))}
					</div>
				</div>
			</div>

			{/* Charts Showcase */}
			<div>
				<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 mb-3">
					<div className="flex items-center gap-2">
						<TrendingUp className="h-4 w-4 text-muted" />
						<h2 className="text-[14px] font-semibold">Analytics</h2>
					</div>
					<span className="text-[11px] text-muted sm:ml-auto">
						Sample data — powered by Recharts
					</span>
				</div>
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
					{/* Area Chart */}
					<div className="lg:col-span-2 rounded-xl border border-default/20 bg-surface p-3 sm:p-5">
						<div className="flex items-center justify-between mb-4">
							<div>
								<h3 className="text-[13px] font-semibold">Traffic Overview</h3>
								<p className="text-[11px] text-muted mt-0.5">Page visits & API calls this week</p>
							</div>
							<TrendingUp className="h-4 w-4 text-accent" />
						</div>
						<div className="h-[180px] sm:h-[220px] w-full">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={trafficData}>
									<defs>
										<linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
											<stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
										</linearGradient>
										<linearGradient id="apiGrad" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
											<stop offset="100%" stopColor="#10b981" stopOpacity={0} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
									<XAxis
										dataKey="name"
										tick={{ fontSize: 11, fill: "var(--muted)" }}
										axisLine={false}
										tickLine={false}
									/>
									<YAxis
										tick={{ fontSize: 11, fill: "var(--muted)" }}
										axisLine={false}
										tickLine={false}
										width={35}
									/>
									<Tooltip
										contentStyle={{
											backgroundColor: "var(--surface)",
											border: "1px solid var(--border)",
											borderRadius: "8px",
											fontSize: "12px",
											boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
										}}
										labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
									/>
									<Area
										type="monotone"
										dataKey="visits"
										stroke="#3b82f6"
										fill="url(#visitGrad)"
										strokeWidth={2}
									/>
									<Area
										type="monotone"
										dataKey="api"
										stroke="#10b981"
										fill="url(#apiGrad)"
										strokeWidth={2}
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
						<div className="flex items-center gap-4 mt-3 pt-3 border-t border-default/10">
							<div className="flex items-center gap-1.5">
								<div className="h-2 w-2 rounded-full bg-[#3b82f6]" />
								<span className="text-[11px] text-muted">Visits</span>
							</div>
							<div className="flex items-center gap-1.5">
								<div className="h-2 w-2 rounded-full bg-[#10b981]" />
								<span className="text-[11px] text-muted">API Calls</span>
							</div>
						</div>
					</div>

					{/* Donut Chart */}
					<div className="rounded-xl border border-default/20 bg-surface p-3 sm:p-5">
						<div className="flex items-center justify-between mb-4">
							<div>
								<h3 className="text-[13px] font-semibold">Resources</h3>
								<p className="text-[11px] text-muted mt-0.5">Usage distribution</p>
							</div>
							<PieChartIcon className="h-4 w-4 text-accent" />
						</div>
						<div className="h-[180px] w-full">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={resourceData}
										cx="50%"
										cy="50%"
										innerRadius={50}
										outerRadius={75}
										paddingAngle={3}
										dataKey="value"
										stroke="none"
									>
										{resourceData.map((_, index) => (
											<Cell
												key={resourceData[index].name}
												fill={CHART_COLORS[index % CHART_COLORS.length]}
											/>
										))}
									</Pie>
									<Tooltip
										contentStyle={{
											backgroundColor: "var(--surface)",
											border: "1px solid var(--border)",
											borderRadius: "8px",
											fontSize: "12px",
											boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
										}}
										formatter={(value) => [`${value}%`, "Usage"]}
									/>
								</PieChart>
							</ResponsiveContainer>
						</div>
						<div className="space-y-1.5 mt-2">
							{resourceData.map((item, index) => (
								<div key={item.name} className="flex items-center justify-between">
									<div className="flex items-center gap-1.5">
										<div
											className="h-2 w-2 rounded-full"
											style={{ backgroundColor: CHART_COLORS[index] }}
										/>
										<span className="text-[11px] text-muted">{item.name}</span>
									</div>
									<span className="text-[11px] font-medium">{item.value}%</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			{/* Bar Chart - Full Width */}
			<div className="rounded-xl border border-default/20 bg-surface p-3 sm:p-5">
				<div className="flex items-center justify-between mb-4">
					<div>
						<h3 className="text-[13px] font-semibold">Weekly Overview</h3>
						<p className="text-[11px] text-muted mt-0.5">Users & sessions per week</p>
					</div>
					<BarChart3 className="h-4 w-4 text-accent" />
				</div>
				<div className="h-[180px] sm:h-[200px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={weeklyData} barGap={4}>
							<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
							<XAxis
								dataKey="name"
								tick={{ fontSize: 11, fill: "var(--muted)" }}
								axisLine={false}
								tickLine={false}
							/>
							<YAxis
								tick={{ fontSize: 11, fill: "var(--muted)" }}
								axisLine={false}
								tickLine={false}
								width={35}
							/>
							<Tooltip
								contentStyle={{
									backgroundColor: "var(--surface)",
									border: "1px solid var(--border)",
									borderRadius: "8px",
									fontSize: "12px",
									boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
								}}
								labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
							/>
							<Bar dataKey="users" fill="#3b82f6" radius={[4, 4, 0, 0]} />
							<Bar dataKey="sessions" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
						</BarChart>
					</ResponsiveContainer>
				</div>
				<div className="flex items-center gap-4 mt-3 pt-3 border-t border-default/10">
					<div className="flex items-center gap-1.5">
						<div className="h-2 w-2 rounded-full bg-[#3b82f6]" />
						<span className="text-[11px] text-muted">Users</span>
					</div>
					<div className="flex items-center gap-1.5">
						<div className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
						<span className="text-[11px] text-muted">Sessions</span>
					</div>
				</div>
			</div>

			{/* Getting Started */}
			<div className="rounded-xl border border-accent-soft-hover bg-accent/5 p-4 sm:p-6">
				<h2 className="text-[15px] font-semibold">Getting Started</h2>
				<p className="mt-1 text-[13px] text-muted">
					This is your template dashboard. Replace this content with your application&apos;s real
					data and components. Check the{" "}
					<code className="rounded bg-default/20 px-1.5 py-0.5 text-[12px] font-mono">rules/</code>{" "}
					directory for architecture and UI guidelines.
				</p>
				<div className="mt-4 flex gap-3">
					<Link
						href="/dashboard/settings"
						className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent/90"
					>
						Settings <ArrowRight className="h-3.5 w-3.5" />
					</Link>
				</div>
			</div>
		</div>
	);
}
