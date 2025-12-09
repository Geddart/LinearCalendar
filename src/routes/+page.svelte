<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import Calendar from "../components/Calendar.svelte";
	import {
		authStore,
		saveAuthState,
		loadAuthState,
	} from "$lib/stores/authStore";

	onMount(() => {
		// Load any saved auth state from localStorage
		loadAuthState();

		// Check for OAuth callback params using browser API
		const params = new URLSearchParams(window.location.search);
		const authSuccess = params.get("auth_success");
		const email = params.get("email");
		const expiresAt = params.get("expires_at");
		const authError = params.get("auth_error");

		if (authSuccess === "true" && email && expiresAt) {
			console.log("OAuth success! Connecting:", email);

			// Update auth store with successful connection
			authStore.connect(email, "", parseInt(expiresAt));

			// Save to localStorage
			authStore.subscribe((state) => {
				saveAuthState(state);
			})();

			// Clear URL params after a short delay to ensure state is updated
			setTimeout(() => {
				window.history.replaceState({}, "", "/");
			}, 100);
		} else if (authError) {
			console.error("OAuth error:", authError);
			window.history.replaceState({}, "", "/");
		}
	});
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
