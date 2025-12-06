<script lang="ts">
	import Calendar from '../components/Calendar.svelte';
</script>

<svelte:head>
	<title>Linear Calendar</title>
</svelte:head>

<main>
	<Calendar />
</main>

<style>
	main {
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}
</style>
