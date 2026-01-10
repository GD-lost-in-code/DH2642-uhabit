/**
 * Statistics presenter
 * Manages state, caching, and data fetching for the statistics page
 */

import { writable } from 'svelte/store';
import type { Habit, HabitCompletion } from '$lib/types/habit';
import type {
	Scope,
	PeriodStats,
	HabitTrend,
	HeatCell,
	Snapshot,
	Insights,
	ActivityItem,
	ComputedStatistics
} from '$lib/stats/types';
import {
	computeCompletionRate,
	computeOverallStreak,
	computeHeatmap,
	computeTrends,
	computeInsights,
	getHeatmapRange,
	getPeriodRanges,
	findMostConsistent,
	findNeedsAttention,
	findBestDayOfWeek,
	findBestDate
} from '$lib/stats';
import { createStatsCache, type StatsCache } from '$lib/cache/statsCache';
import { createStatsApi, type StatsApi } from '$lib/api/statsApi';
import { STATS_CACHE } from '$lib/constants';
import { formatRangeLabel, buildActivity, getDateKey } from './statisticsHelpers';

export type StatisticsState = {
	scope: Scope;
	selectedDate: Date;
	isLoading: boolean;
	isSyncing: boolean;
	isOffline: boolean;
	error: string | null;
	lastSync: Date | null;
	// Computed statistics
	periodStats: PeriodStats | null;
	trends: HabitTrend[];
	heatmap: HeatCell[];
	snapshot: Snapshot | null;
	insights: Insights | null;
	activity: ActivityItem[];
};

type StatisticsPresenterDeps = {
	fetcher: typeof fetch;
	browser: boolean;
	initialScope?: Scope;
	initialDate?: Date;
	cacheFactory?: () => StatsCache;
};

export function createStatisticsPresenter({
	fetcher,
	browser,
	initialScope = 'daily',
	initialDate = new Date(),
	cacheFactory = createStatsCache
}: StatisticsPresenterDeps) {
	const api: StatsApi = createStatsApi({ fetcher });
	let cache: StatsCache | null = null;
	let habits: Habit[] = [];
	let completions: HabitCompletion[] = [];

	const initialState: StatisticsState = {
		scope: initialScope,
		selectedDate: initialDate,
		isLoading: true,
		isSyncing: false,
		isOffline: false,
		error: null,
		lastSync: null,
		periodStats: null,
		trends: [],
		heatmap: [],
		snapshot: null,
		insights: null,
		activity: []
	};

	const state = writable<StatisticsState>(initialState);
	const { subscribe, update } = state;

	function getState(): StatisticsState {
		let current: StatisticsState = initialState;
		subscribe((v) => (current = v))();
		return current;
	}

	function computeStatistics(scope: Scope, date: Date): ComputedStatistics | null {
		if (habits.length === 0) {
			update((s) => ({
				...s,
				isLoading: false,
				periodStats: null,
				trends: [],
				heatmap: [],
				snapshot: null,
				insights: null,
				activity: []
			}));
			return null;
		}
		const { current: currentRange, previous: previousRange } = getPeriodRanges(scope, date);
		const heatmapRange = getHeatmapRange(scope, date);
		const currentRate = computeCompletionRate(habits, completions, currentRange);
		const previousRate = computeCompletionRate(habits, completions, previousRange);
		const overallStreak = computeOverallStreak(habits, completions, date);
		const heatmap = computeHeatmap(habits, completions, heatmapRange, scope);
		const trends = computeTrends(habits, completions, scope, date);
		const insights = computeInsights(habits, completions, heatmapRange, date);
		const periodStats: PeriodStats = {
			rangeLabel: formatRangeLabel(scope, date),
			completionRate: currentRate.rate,
			bestDay:
				scope === 'daily'
					? findBestDayOfWeek(habits, completions, heatmapRange)
					: findBestDate(habits, completions, currentRange),
			completions: currentRate.completed,
			streak: overallStreak.currentStreak,
			longestStreak: overallStreak.longestStreak
		};
		const snapshot: Snapshot = {
			currentStreak: overallStreak.currentStreak,
			overallCompletion: currentRate.rate,
			weeklyDelta: currentRate.rate - previousRate.rate,
			mostConsistent: findMostConsistent(trends),
			needsAttention: findNeedsAttention(trends)
		};
		const computed: ComputedStatistics = {
			periodStats,
			trends,
			heatmap,
			snapshot,
			insights,
			activity: buildActivity(trends)
		};
		update((s) => ({ ...s, isLoading: false, ...computed }));
		return computed;
	}

	function applyStats(stats: ComputedStatistics): void {
		update((s) => ({ ...s, isLoading: false, ...stats }));
	}

	function getFetchFromDate(heatmapRange: { from: Date; to: Date }): Date {
		const historyStart = new Date();
		historyStart.setDate(historyStart.getDate() - STATS_CACHE.HISTORY_DAYS);
		return heatmapRange.from < historyStart ? heatmapRange.from : historyStart;
	}

	function saveToServerCache(scope: Scope, date: Date, computed: ComputedStatistics): void {
		const dateKey = getDateKey(scope, date);
		const validUntil = new Date();
		validUntil.setHours(validUntil.getHours() + 1);
		api.setServerCache(scope, dateKey, computed, validUntil).catch(() => {
			// Ignore server cache errors - not critical
		});
	}

	async function sync(): Promise<void> {
		update((s) => ({ ...s, isSyncing: true, error: null }));

		try {
			const currentState = getState();
			const heatmapRange = getHeatmapRange(currentState.scope, currentState.selectedDate);
			const fetchFrom = getFetchFromDate(heatmapRange);
			const metadata = cache ? await cache.getMetadata() : null;

			// Always fetch fresh data from the API - don't rely on potentially stale cache
			try {
				const freshHabits = await api.fetchHabits();
				const currentUserId = freshHabits.length > 0 ? freshHabits[0].userId : null;

				// Determine if we need to clear the cache:
				// 1. Cache has data but no userId (old cache format before fix)
				// 2. Cache userId doesn't match current user
				// 3. Current user has no habits but cache has completions (suspicious)
				const cacheHasData = metadata?.lastHabitsSync != null;
				const cacheHasNoUserId = cacheHasData && !metadata?.userId;
				const userIdMismatch =
					metadata?.userId && currentUserId && metadata.userId !== currentUserId;
				const suspiciousCache = !currentUserId && cacheHasData;

				if (cache && (cacheHasNoUserId || userIdMismatch || suspiciousCache)) {
					console.log('Clearing statistics cache:', {
						cacheHasNoUserId,
						userIdMismatch,
						suspiciousCache,
						cachedUserId: metadata?.userId,
						currentUserId
					});
					await cache.clearAll();
				}

				// Always fetch fresh completions to ensure correct user data
				habits = freshHabits;
				completions = await api.fetchCompletions(fetchFrom);

				// Update cache with fresh data
				if (cache) {
					await cache.setHabits(habits);
					await cache.addCompletions(completions);
					await cache.setMetadata({
						lastHabitsSync: new Date(),
						lastCompletionsSync: new Date(),
						version: 1,
						userId: currentUserId
					});
				}
				update((s) => ({ ...s, isOffline: false }));
			} catch (error) {
				// Network error - only use cache if we can validate ownership
				const cachedUserId = metadata?.userId;
				if (cache && metadata?.lastHabitsSync && cachedUserId) {
					console.warn('Fetch failed, using cached data for user:', cachedUserId, error);
					habits = await cache.getHabits();
					completions = await cache.getCompletions();
					update((s) => ({ ...s, isOffline: true }));
				} else {
					throw error;
				}
			}

			const computed = computeStatistics(currentState.scope, currentState.selectedDate);
			if (computed) {
				saveToServerCache(currentState.scope, currentState.selectedDate, computed);
			}

			update((s) => ({ ...s, isSyncing: false, lastSync: new Date() }));
		} catch (error) {
			console.error('Statistics sync error:', error);
			update((s) => ({
				...s,
				isLoading: false,
				isSyncing: false,
				error: 'Failed to load statistics. Please try again.'
			}));
		}
	}

	async function initialize(): Promise<void> {
		if (!browser) return;

		update((s) => ({ ...s, isLoading: true }));

		// Initialize cache
		cache = cacheFactory();
		await cache.open();

		// Listen for online/offline events
		window.addEventListener('online', () => {
			update((s) => ({ ...s, isOffline: false }));
			sync();
		});
		window.addEventListener('offline', () => {
			update((s) => ({ ...s, isOffline: true }));
		});

		// Check initial online status
		update((s) => ({ ...s, isOffline: !navigator.onLine }));

		// Start sync
		await sync();
	}

	function setScope(scope: Scope): void {
		update((s) => ({ ...s, scope, isLoading: true }));
		const currentState = getState();
		computeStatistics(scope, currentState.selectedDate);
	}

	function setSelectedDate(date: Date): void {
		update((s) => ({ ...s, selectedDate: date, isLoading: true }));
		const currentState = getState();
		computeStatistics(currentState.scope, date);
	}

	async function refresh(): Promise<void> {
		await sync();
	}

	async function clearCache(): Promise<void> {
		if (cache) {
			await cache.clearAll();
		}
		habits = [];
		completions = [];
		await sync();
	}

	return {
		state: { subscribe },
		initialize,
		setScope,
		setSelectedDate,
		refresh,
		clearCache
	};
}

export type StatisticsPresenter = ReturnType<typeof createStatisticsPresenter>;
