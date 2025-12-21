<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import TopProgressMultiRing from './components/TopProgressMultiRing.svelte';
	import TaskSingle from './components/TaskSingle.svelte';
	import TaskProgressive from './components/TaskProgressive.svelte';
	import TaskProgressiveDetail from './components/TaskProgressiveDetail.svelte';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import ToggleBar from '$lib/components/ToggleBar.svelte';
	import { enhance } from '$app/forms';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { HabitWithStatus } from '$lib/types/habit';
	import type { GoalWithHabitStatus } from '$lib/types/goal';
	import { createOverviewPresenter } from '$lib/presenters/overviewPresenter';

	let {
		data
	}: {
		data: {
			habits: HabitWithStatus[];
			goals: GoalWithHabitStatus[];
			initialTab: 'habits' | 'goals';
			initialModal: { habitId: string; progress: number } | null;
			totalHabits: number;
		};
	} = $props();

	const presenter = createOverviewPresenter({
		initial: untrack(() => ({
			habits: data.habits,
			goals: data.goals,
			initialTab: data.initialTab,
			initialModal: data.initialModal
		})),
		fetcher: fetch,
		browser
	});
	const overviewState = presenter.state;

	// Keep SSR data in sync if server returns new values
	$effect(() => presenter.syncFromServer(data));

	// Derived: split habits by measurement type for display
	const booleanHabits = $derived(
		$overviewState.habits.filter((h) => h.habit.measurement === 'boolean')
	);
	const numericHabits = $derived(
		$overviewState.habits.filter((h) => h.habit.measurement === 'numeric')
	);
	const hasAnyHabits = $derived(data.totalHabits > 0);

	// Track previous tab for animation direction
	let previousTab: 'habits' | 'goals' = $state(untrack(() => data.initialTab));
	let slideDirection = $state(1); // 1 = forward (right to left), -1 = back (left to right)

	$effect(() => {
		if ($overviewState.activeTab !== previousTab) {
			slideDirection = $overviewState.activeTab === 'goals' ? 1 : -1;
			previousTab = $overviewState.activeTab;
		}
	});

	// Check if user prefers reduced motion
	const prefersReducedMotion =
		typeof window !== 'undefined' &&
		(window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			document.documentElement.dataset.reduceMotion === 'true');

	const transitionDuration = prefersReducedMotion ? 0 : 200;
	const transitionDistance = 50;
</script>

<!-- Error Toast -->
{#if $overviewState.error}
	<div
		class="fixed top-4 left-1/2 -translate-x-1/2 bg-error-600 text-white px-4 py-2 rounded-lg shadow-lg z-50"
	>
		{$overviewState.error}
	</div>
{/if}

<div class="p-4 sm:p-8">
	<!-- Top Progress -->
	<TopProgressMultiRing
		single={booleanHabits}
		progressive={numericHabits}
		showInnerRings={$overviewState.activeTab === 'habits'}
	/>

	<!-- Toggle -->
	<div class="max-w-3xl mx-auto mt-4 mb-6 flex justify-center">
		<ToggleBar
			activeTab={$overviewState.activeTab === 'habits' ? 0 : 1}
			onChange={presenter.setActiveTab}
		/>
	</div>

	<!-- Content area -->
	<div class="max-w-3xl mx-auto">
		{#key $overviewState.activeTab}
			<div
				in:fly={{
					x: slideDirection * transitionDistance,
					duration: transitionDuration,
					easing: cubicOut
				}}
			>
				{#if $overviewState.activeTab === 'habits'}
					<!-- Habits Tab: All habits due today -->
					<div class="space-y-3">
						{#if $overviewState.habits.length === 0}
							{#if hasAnyHabits}
								<div class="text-surface-500 text-center py-6">
									No habits due today. Enjoy your day!
								</div>
							{:else}
								<div class="text-surface-500 text-center py-6">
									No habits yet.
									<button
										type="button"
										class="text-primary-600 hover:text-primary-500 underline underline-offset-2"
										onclick={() => goto('/habits?openHabitModal=1')}
									>
										Start a habit
									</button>
									.
								</div>
							{/if}
						{:else}
							<!-- Boolean habits (checkboxes) -->
							{#each booleanHabits as s (s.habit.id)}
								<form
									method="POST"
									action="?/toggleSingle"
									use:enhance={() => {
										const previousState = presenter.toggleSingleOptimistic(s.habit.id);
										return async ({ result }) => {
											if (result.type === 'failure' || result.type === 'error') {
												presenter.revertHabits(previousState);
												presenter.showError('Failed to update habit. Please try again.');
											}
										};
									}}
								>
									<input type="hidden" name="id" value={s.habit.id} />
									<input type="hidden" name="done" value={!s.isCompleted} />
									<TaskSingle {s} />
								</form>
							{/each}

							<!-- Numeric habits (progress) -->
							{#each numericHabits as p (p.habit.id)}
								<TaskProgressive
									{p}
									onOpen={() => presenter.openProgressive(p)}
									onToggleComplete={() => presenter.toggleProgressiveComplete(p)}
								/>
							{/each}
						{/if}
					</div>
				{:else}
					<!-- Goals Tab -->
					<div class="space-y-4">
						{#if $overviewState.goals.length === 0}
							<div class="text-surface-500 text-center py-6">
								No active goals. Create a goal to organize your habits!
							</div>
						{:else}
							{#each $overviewState.goals as goal (goal.id)}
								<GoalCard {goal} />
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		{/key}
	</div>

	<!-- Progressive Detail Modal -->
	{#if $overviewState.showDetail && $overviewState.selectedProgressive}
		<TaskProgressiveDetail
			selectedProgressive={$overviewState.selectedProgressive}
			initialProgress={$overviewState.modalProgress}
			onSave={presenter.saveProgressive}
			onClose={presenter.closeDetail}
			onProgressChange={presenter.onModalProgressChange}
		/>
	{/if}
</div>
