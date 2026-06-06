<script lang="ts">
	import type { GeometryDocument } from '@glyphsmith/ast';
	import { fitViewportToDocument, renderDocument } from '@glyphsmith/editor';
	import { onMount } from 'svelte';

	let {
		document,
		index
	}: {
		document: GeometryDocument;
		index: number;
	} = $props();

	let canvas: HTMLCanvasElement;
	let resizeObserver: ResizeObserver | undefined;

	onMount(() => {
		resizeObserver = new ResizeObserver(() => drawThumbnail());
		resizeObserver.observe(canvas);
		drawThumbnail();

		return () => {
			resizeObserver?.disconnect();
		};
	});

	$effect(() => {
		document;
		drawThumbnail();
	});

	function drawThumbnail() {
		if (!canvas) {
			return;
		}

		const context = canvas.getContext('2d');
		const rect = canvas.getBoundingClientRect();
		const pixelRatio = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(rect.width * pixelRatio));
		const height = Math.max(1, Math.round(rect.height * pixelRatio));

		if (!context) {
			return;
		}

		if (canvas.width !== width) {
			canvas.width = width;
		}

		if (canvas.height !== height) {
			canvas.height = height;
		}

		const viewport = fitViewportToDocument(document, { width: rect.width, height: rect.height }, 8);

		renderDocument(context, document, viewport, {
			background: '#101113',
			pixelRatio,
			showEditHandles: false
		});
	}
</script>

<span class="page-thumb">
	<canvas class="page-thumb-canvas" bind:this={canvas} aria-hidden="true"></canvas>
	<span class="page-thumb-index">{index}</span>
</span>
