<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { XIcon, AlertTriangleIcon } from '@lucide/svelte';

	let {
		open = false,
		title = 'Edit Field',
		value = $bindable(''),
		maxlength = 50,
		placeholder = '',
		warningText = '',
		onApply,
		onCancel
	}: {
		open: boolean;
		title?: string;
		value?: string;
		maxlength?: number;
		placeholder?: string;
		warningText?: string;
		onApply: () => void;
		onCancel: () => void;
	} = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onCancel();
		} else if (e.key === 'Enter') {
			onApply();
		}
	}
</script>

{#if open}
	<Dialog {open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
		<Portal>
			<Dialog.Backdrop class="fixed inset-0 bg-black/50 z-50 transition-opacity duration-150" />
			<Dialog.Positioner class="fixed inset-0 flex items-center justify-center p-4 z-50">
				<Dialog.Content
					class="card bg-surface-100 dark:bg-surface-900 p-6 w-full max-w-md space-y-4 shadow-xl rounded-xl transition-transform duration-150"
				>
					<header class="flex justify-between items-center">
						<Dialog.Title class="font-bold text-lg">{title}</Dialog.Title>
						<button
							type="button"
							class="p-1 rounded-md hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
							onclick={onCancel}
							aria-label="Close dialog"
						>
							<XIcon class="size-5" />
						</button>
					</header>

					{#if warningText}
						<Dialog.Description
							class="flex items-center gap-2 text-sm text-warning-600 dark:text-warning-400"
						>
							<AlertTriangleIcon class="size-4 shrink-0" />
							{warningText}
						</Dialog.Description>
					{/if}

					<input
						class="input w-full px-3 py-2 rounded-md border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
						bind:value
						{maxlength}
						{placeholder}
						onkeydown={handleKeydown}
					/>

					<footer class="flex justify-end gap-3 pt-2">
						<button
							type="button"
							class="px-4 py-2 text-sm rounded-md border border-surface-300 dark:border-surface-600 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
							onclick={onCancel}
						>
							Cancel
						</button>
						<button
							type="button"
							class="px-4 py-2 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors"
							onclick={onApply}
						>
							Apply
						</button>
					</footer>
				</Dialog.Content>
			</Dialog.Positioner>
		</Portal>
	</Dialog>
{/if}
