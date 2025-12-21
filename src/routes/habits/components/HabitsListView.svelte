<script lang="ts">
	import { untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import HabitCard from '$lib/components/HabitCard.svelte';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import type { HabitsState } from '$lib/presenters/habitsPresenter';
	import type { GoalWithHabitStatus, GoalWithProgress } from '$lib/types/goal';
	import type { Habit } from '$lib/types/habit';

	let {
		state: habitsState,
		openHabitModal,
		openGoalModal
	}: {
		state: HabitsState;
		openHabitModal: (habit?: Habit | null) => void;
		openGoalModal: (goal?: GoalWithProgress | GoalWithHabitStatus | null) => void;
	} = $props();

	const hasHabits = $derived(habitsState.habits.length > 0);
	const hasGoals = $derived(habitsState.goals.length > 0);

	// Track previous tab for animation direction
	let previousTab: 0 | 1 = $state(untrack(() => habitsState.activeTab));
	let slideDirection = $state(1); // 1 = forward (right to left), -1 = back (left to right)

	$effect(() => {
		if (habitsState.activeTab !== previousTab) {
			slideDirection = habitsState.activeTab > previousTab ? 1 : -1;
			previousTab = habitsState.activeTab;
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

{#if habitsState.habitsLoading}
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-7">
		{#each Array(4) as _}
			<div class="h-24 rounded-xl bg-surface-200 dark:bg-surface-700 animate-pulse"></div>
		{/each}
	</div>
{:else if habitsState.habitsError}
	<p class="text-center text-sm text-error-600">{habitsState.habitsError}</p>
{:else}
	{#key habitsState.activeTab}
		<div
			in:fly={{
				x: slideDirection * transitionDistance,
				duration: transitionDuration,
				easing: cubicOut
			}}
		>
			{#if habitsState.activeTab === 0}
				{#if !hasHabits}
					<p class="text-center text-surface-500 py-8">
						No habits yet.
						<button
							class="text-primary-600 hover:text-primary-500 underline underline-offset-2"
							onclick={() => openHabitModal()}
							type="button"
						>
							Create a habit
						</button>.
					</p>
				{:else}
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-7">
						{#each habitsState.habits as habit (habit.id)}
							<HabitCard {habit} onedit={openHabitModal} />
						{/each}
					</div>
				{/if}
			{:else if !hasGoals}
				<p class="text-center text-surface-500 py-8">
					No goals yet. Create a goal to organize your habits!
				</p>
			{:else}
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-7 items-start">
					{#each habitsState.goals as goal (goal.id)}
						<GoalCard {goal} onedit={openGoalModal} />
					{/each}
				</div>
			{/if}
		</div>
	{/key}
{/if}
