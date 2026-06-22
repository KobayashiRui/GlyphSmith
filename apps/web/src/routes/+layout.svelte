<script lang="ts">
	import '../app.css';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" type="image/svg+xml" href="/icons/App-Icon.svg" /></svelte:head>
{@render children()}
