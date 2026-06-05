<script lang="ts">
	import {
		createDocument,
		type GeometryDocument,
		type GeometryNode,
		type NodeId,
		type NodeStyle,
		type Point
	} from '@glyphsmith/ast';
	import {
		createEllipseInsertPatch,
		createLinePathInsertPatch,
		createRectInsertPatch,
		createTriangleInsertPatch,
		createEditHandleUpdatePatch,
		fitViewportToDocument,
		hitTest,
		hitTestEditHandle,
		panViewport,
		renderDocument,
		screenToWorld,
		snapPointToExistingVertex,
		trianglePointsFromBounds,
		zoomViewportAtPoint,
		type EditHandle,
		type PathSegmentMode,
		type SnapPoint,
		type Tool,
		type Viewport
	} from '@glyphsmith/editor';
	import { applyPatch, findNode } from '@glyphsmith/kernel';
	import { exportToSvg } from '@glyphsmith/svg';
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement;
	let context = $state<CanvasRenderingContext2D | undefined>();
	let geometryDocument = $state<GeometryDocument>(createDocument({
		name: 'GlyphSmith Document',
		width: 256,
		height: 256
	}));
	let selectedNodeIds = $state<NodeId[]>([]);
	let tool = $state<Tool>('select');
	let pathSegmentMode = $state<PathSegmentMode>('line');
	let viewport = $state<Viewport>({ x: 80, y: 56, zoom: 1 });
	let draftStart = $state<Point | undefined>();
	let draftEnd = $state<Point | undefined>();
	let shapePreviewPoint = $state<Point | undefined>();
	let dragging = $state(false);
	let editingHandle = $state<EditHandle | undefined>();
	let panning = $state(false);
	let spacePressed = $state(false);
	let lastDragPoint = $state<Point | undefined>();
	let lastPanPoint = $state<Point | undefined>();
	let nextNodeIndex = $state(1);
	let canvasPixelRatio = $state(1);
	let snapTarget = $state<SnapPoint | undefined>();
	let undoStack = $state<GeometryDocument[]>([]);
	let redoStack = $state<GeometryDocument[]>([]);
	let liveEditStartDocument: GeometryDocument | undefined;
	let hasFitInitialViewport = false;

	const svgOutput = $derived(exportToSvg(geometryDocument));
	const selectedNode = $derived(
		selectedNodeIds[0] ? findNode(geometryDocument, selectedNodeIds[0]) : undefined
	);

	$effect(() => {
		geometryDocument;
		selectedNodeIds;
		tool;
		draftStart;
		draftEnd;
		shapePreviewPoint;
		viewport;
		canvasPixelRatio;
		snapTarget;
		draw();
	});

	onMount(() => {
		context = canvas.getContext('2d') ?? undefined;

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			canvasPixelRatio = window.devicePixelRatio || 1;
			canvas.width = Math.max(1, Math.round(rect.width * canvasPixelRatio));
			canvas.height = Math.max(1, Math.round(rect.height * canvasPixelRatio));

			if (!hasFitInitialViewport) {
				fitCanvasToDocument();
				hasFitInitialViewport = true;
				return;
			}

			draw();
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (isTextInput(event.target)) {
				return;
			}

			if (event.code === 'Space') {
				event.preventDefault();
				spacePressed = true;
			}

			if (event.key === 'Escape') {
				event.preventDefault();
				editingHandle = undefined;
				dragging = false;
				cancelDraft();
			}

			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
				event.preventDefault();

				if (event.shiftKey) {
					redo();
				} else {
					undo();
				}
			}

			if (event.key === 'Delete' || event.key === 'Backspace') {
				event.preventDefault();
				deleteSelection();
			}
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.code === 'Space') {
				spacePressed = false;
				panning = false;
				lastPanPoint = undefined;
			}
		};

		resize();
		window.addEventListener('resize', resize);
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);

		return () => {
			window.removeEventListener('resize', resize);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});

	function setTool(nextTool: Tool) {
		tool = nextTool;
		draftStart = undefined;
		draftEnd = undefined;
		shapePreviewPoint = undefined;
		dragging = false;
		editingHandle = undefined;
		panning = false;
		snapTarget = undefined;
	}

	function setLineTool(mode: PathSegmentMode) {
		pathSegmentMode = mode;
		setTool('path');
	}

	function handlePointerDown(event: PointerEvent) {
		const screenPoint = pointerToScreen(event);
		const rawWorldPoint = pointerToWorld(event);
		const worldPoint = tool === 'select' ? rawWorldPoint : snapWorldPoint(rawWorldPoint);

		canvas.setPointerCapture(event.pointerId);

		if (event.button === 1 || event.button === 2 || spacePressed) {
			event.preventDefault();
			panning = true;
			lastPanPoint = screenPoint;
			return;
		}

		if (event.button !== 0) {
			return;
		}

		if (tool === 'select') {
			const hitHandle = hitTestEditHandle(
				geometryDocument,
				selectedNodeIds,
				worldPoint,
				8 / viewport.zoom
			);

			if (hitHandle) {
				editingHandle = hitHandle;
				selectedNodeIds = [hitHandle.nodeId];
				beginLiveEdit();
				return;
			}

			const hitNodeId = hitTest(geometryDocument, worldPoint, {
				tolerance: 8 / viewport.zoom
			});

			selectedNodeIds = hitNodeId ? [hitNodeId] : [];
			dragging = Boolean(hitNodeId);
			lastDragPoint = worldPoint;

			if (hitNodeId) {
				beginLiveEdit();
			}

			return;
		}

		if (isShapeTool(tool)) {
			insertShapeAtPoint(tool, worldPoint);
			return;
		}

		if (draftStart) {
			draftEnd = worldPoint;
			confirmPathDraft();
			return;
		}

		selectedNodeIds = [];
		draftStart = worldPoint;
		draftEnd = worldPoint;
	}

	function handlePointerMove(event: PointerEvent) {
		const screenPoint = pointerToScreen(event);
		const rawWorldPoint = pointerToWorld(event);
		const worldPoint = draftStart && tool !== 'select' ? snapWorldPoint(rawWorldPoint) : rawWorldPoint;

		if (panning && lastPanPoint) {
			shapePreviewPoint = undefined;
			viewport = panViewport(viewport, {
				x: screenPoint.x - lastPanPoint.x,
				y: screenPoint.y - lastPanPoint.y
			});
			lastPanPoint = screenPoint;
			return;
		}

		if (isShapeTool(tool)) {
			shapePreviewPoint = clampPointToDocument(rawWorldPoint);
		} else {
			shapePreviewPoint = undefined;
		}

		if (tool === 'select' && dragging && lastDragPoint) {
			const dx = worldPoint.x - lastDragPoint.x;
			const dy = worldPoint.y - lastDragPoint.y;

			for (const nodeId of selectedNodeIds) {
				geometryDocument = applyPatch(geometryDocument, {
					op: 'move',
					target: nodeId,
					dx,
					dy
				});
			}

			lastDragPoint = worldPoint;
			return;
		}

		if (tool === 'select' && editingHandle) {
			const patch = createEditHandleUpdatePatch(geometryDocument, editingHandle, worldPoint);

			if (patch) {
				geometryDocument = applyPatch(geometryDocument, patch);
			}

			return;
		}

		if (draftStart) {
			draftEnd = worldPoint;
		}
	}

	function handlePointerUp(event: PointerEvent) {
		canvas.releasePointerCapture(event.pointerId);

		if (panning) {
			panning = false;
			lastPanPoint = undefined;
			return;
		}

		if (tool === 'select') {
			dragging = false;
			editingHandle = undefined;
			lastDragPoint = undefined;
			finishLiveEdit();
			return;
		}

	}

	function handlePointerLeave() {
		shapePreviewPoint = undefined;
		snapTarget = undefined;
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();

		const screenPoint = pointerToScreen(event);
		const zoomMultiplier = Math.exp(-event.deltaY * 0.0008);
		viewport = zoomViewportAtPoint(viewport, screenPoint, viewport.zoom * zoomMultiplier);
	}

	function updateDocumentDimension(field: 'width' | 'height', event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const value = Number(input.value);

		if (!Number.isFinite(value)) {
			return;
		}

		commitPatch({
			op: 'updateDocument',
			changes: {
				[field]: value
			}
		});
	}

	function updateZoomPercent(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const value = Number(input.value);

		if (!Number.isFinite(value)) {
			return;
		}

		viewport = zoomViewportAtPoint(viewport, canvasCenterPoint(), value / 100);
	}

	function fitCanvasToDocument() {
		const rect = canvas.getBoundingClientRect();

		viewport = fitViewportToDocument(geometryDocument, {
			width: rect.width,
			height: rect.height
		});
	}

	function canvasCenterPoint(): Point {
		const rect = canvas.getBoundingClientRect();

		return {
			x: rect.width / 2,
			y: rect.height / 2
		};
	}

	function confirmPathDraft() {
		if (!draftStart || !draftEnd || tool !== 'path') {
			return;
		}

		const distance = Math.hypot(draftEnd.x - draftStart.x, draftEnd.y - draftStart.y);

		if (distance > 2 / viewport.zoom) {
			const pathId = `path-${nextNodeIndex}`;
			const patch = createLinePathInsertPatch({
				id: pathId,
				start: draftStart,
				end: draftEnd,
				segmentMode: pathSegmentMode
			});

			commitPatch(patch);
			selectedNodeIds = [pathId];
			nextNodeIndex += 1;
			cancelDraft();
		}
	}

	function cancelDraft() {
		draftStart = undefined;
		draftEnd = undefined;
		shapePreviewPoint = undefined;
		snapTarget = undefined;
	}

	function snapWorldPoint(point: Point): Point {
		const snap = snapPointToExistingVertex(geometryDocument, point, 8 / viewport.zoom);
		snapTarget = snap;

		return snap?.point ?? point;
	}

	function pointerToScreen(event: PointerEvent | WheelEvent): Point {
		const rect = canvas.getBoundingClientRect();

		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		};
	}

	function pointerToWorld(event: PointerEvent): Point {
		return screenToWorld(pointerToScreen(event), viewport);
	}

	function isTextInput(target: EventTarget | null): boolean {
		return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
	}

	function isShapeTool(value: Tool): value is 'rect' | 'ellipse' | 'triangle' {
		return value === 'rect' || value === 'ellipse' || value === 'triangle';
	}

	function insertShapeAtPoint(shapeTool: 'rect' | 'ellipse' | 'triangle', point: Point) {
		const id = `${shapeTool}-${nextNodeIndex}`;
		const placementPoint = clampPointToDocument(point);
		const { start, end } = shapeBoundsForPlacement(shapeTool, placementPoint, placementPoint);
		const patch = createShapeInsertPatch(shapeTool, id, start, end);

		commitPatch(patch);
		selectedNodeIds = [id];
		nextNodeIndex += 1;
		cancelDraft();
		shapePreviewPoint = placementPoint;
	}

	function clampPointToDocument(point: Point): Point {
		return {
			x: Math.min(Math.max(point.x, 0), geometryDocument.width),
			y: Math.min(Math.max(point.y, 0), geometryDocument.height)
		};
	}

	function shapeBoundsForPlacement(shapeTool: 'rect' | 'ellipse' | 'triangle', start: Point, end: Point) {
		const distance = Math.hypot(end.x - start.x, end.y - start.y);

		if (distance > 2 / viewport.zoom) {
			return { start, end };
		}

		const defaultSize =
			shapeTool === 'rect'
				? { width: 96, height: 64 }
				: shapeTool === 'ellipse'
					? { width: 80, height: 80 }
					: { width: 88, height: 76 };

		return {
			start: {
				x: start.x - defaultSize.width / 2,
				y: start.y - defaultSize.height / 2
			},
			end: {
				x: start.x + defaultSize.width / 2,
				y: start.y + defaultSize.height / 2
			}
		};
	}

	function createShapeInsertPatch(
		shapeTool: 'rect' | 'ellipse' | 'triangle',
		id: NodeId,
		start: Point,
		end: Point
	) {
		const style: NodeStyle = {
			fill: 'none',
			stroke: '#3b82f6',
			strokeWidth: 2
		};

		if (shapeTool === 'rect') {
			return createRectInsertPatch({ id, start, end, style });
		}

		if (shapeTool === 'ellipse') {
			return createEllipseInsertPatch({ id, start, end, style });
		}

		return createTriangleInsertPatch({ id, start, end, style });
	}


	function commitPatch(patch: Parameters<typeof applyPatch>[1]) {
		undoStack = [...undoStack, cloneDocument(geometryDocument)];
		redoStack = [];
		geometryDocument = applyPatch(geometryDocument, patch);
	}

	function beginLiveEdit() {
		liveEditStartDocument = cloneDocument(geometryDocument);
		redoStack = [];
	}

	function finishLiveEdit() {
		if (!liveEditStartDocument) {
			return;
		}

		undoStack = [...undoStack, liveEditStartDocument];
		liveEditStartDocument = undefined;
	}

	function undo() {
		const previous = undoStack.at(-1);

		if (!previous) {
			return;
		}

		undoStack = undoStack.slice(0, -1);
		redoStack = [...redoStack, cloneDocument(geometryDocument)];
		geometryDocument = previous;
		cancelDraft();
		selectedNodeIds = [];
	}

	function redo() {
		const next = redoStack.at(-1);

		if (!next) {
			return;
		}

		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, cloneDocument(geometryDocument)];
		geometryDocument = next;
		cancelDraft();
		selectedNodeIds = [];
	}

	function deleteSelection() {
		if (selectedNodeIds.length === 0) {
			return;
		}

		undoStack = [...undoStack, cloneDocument(geometryDocument)];
		redoStack = [];

		for (const nodeId of selectedNodeIds) {
			geometryDocument = applyPatch(geometryDocument, {
				op: 'delete',
				target: nodeId
			});
		}

		selectedNodeIds = [];
		cancelDraft();
	}

	function updateSelectedStyle(field: keyof NodeStyle, rawValue: string) {
		if (!selectedNode) {
			return;
		}

		const value =
			field === 'strokeWidth' || field === 'opacity'
				? Number(rawValue)
				: rawValue.trim() || undefined;

		if (typeof value === 'number' && !Number.isFinite(value)) {
			return;
		}

		commitPatch({
			op: 'update',
			target: selectedNode.id,
			changes: {
				style: {
					...selectedNode.style,
					[field]: value
				}
			} as Partial<GeometryNode>
		});
	}

	function downloadSvg() {
		const blob = new Blob([svgOutput], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = url;
		link.download = `${geometryDocument.name || 'glyphsmith'}.svg`;
		link.click();
		URL.revokeObjectURL(url);
	}

	function cloneDocument(documentToClone: GeometryDocument): GeometryDocument {
		return structuredClone($state.snapshot(documentToClone)) as GeometryDocument;
	}

	function draw() {
		if (!context) {
			return;
		}

		renderDocument(context, geometryDocument, viewport, {
			selectedNodeIds,
			background: '#101113',
			pixelRatio: canvasPixelRatio,
			showEditHandles: selectedNodeIds.length > 0
		});

		drawShapePreview(context);
		drawDraft(context);
	}

	function drawShapePreview(canvasContext: CanvasRenderingContext2D) {
		if (!shapePreviewPoint || !isShapeTool(tool) || draftStart) {
			return;
		}

		const bounds = shapeBoundsForPlacement(tool, shapePreviewPoint, shapePreviewPoint);

		canvasContext.save();
		canvasContext.setTransform(
			viewport.zoom * canvasPixelRatio,
			0,
			0,
			viewport.zoom * canvasPixelRatio,
			viewport.x * canvasPixelRatio,
			viewport.y * canvasPixelRatio
		);
		canvasContext.globalAlpha = 0.38;
		canvasContext.strokeStyle = '#60a5fa';
		canvasContext.fillStyle = 'rgba(96, 165, 250, 0.08)';
		canvasContext.lineWidth = 2 / viewport.zoom;
		canvasContext.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);

		drawShapeCandidate(canvasContext, tool, bounds.start, bounds.end);

		canvasContext.restore();
	}

	function drawShapeCandidate(
		canvasContext: CanvasRenderingContext2D,
		shapeTool: 'rect' | 'ellipse' | 'triangle',
		start: Point,
		end: Point
	) {
		const x = Math.min(start.x, end.x);
		const y = Math.min(start.y, end.y);
		const width = Math.abs(end.x - start.x);
		const height = Math.abs(end.y - start.y);

		if (shapeTool === 'ellipse') {
			canvasContext.beginPath();
			canvasContext.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
			canvasContext.fill();
			canvasContext.stroke();
			return;
		}

		if (shapeTool === 'triangle') {
			const points = trianglePointsFromBounds(start, end);
			const [first, ...rest] = points;

			if (!first) {
				return;
			}

			canvasContext.beginPath();
			canvasContext.moveTo(first.x, first.y);

			for (const point of rest) {
				canvasContext.lineTo(point.x, point.y);
			}

			canvasContext.closePath();
			canvasContext.fill();
			canvasContext.stroke();
			return;
		}

		canvasContext.beginPath();
		canvasContext.rect(x, y, width, height);
		canvasContext.fill();
		canvasContext.stroke();
	}

	function drawDraft(canvasContext: CanvasRenderingContext2D) {
		if (!draftStart || !draftEnd) {
			return;
		}

		canvasContext.save();
		canvasContext.setTransform(
			viewport.zoom * canvasPixelRatio,
			0,
			0,
			viewport.zoom * canvasPixelRatio,
			viewport.x * canvasPixelRatio,
			viewport.y * canvasPixelRatio
		);
		canvasContext.strokeStyle = '#2563eb';
		canvasContext.lineWidth = 2 / viewport.zoom;
		canvasContext.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);

		if (isShapeTool(tool)) {
			const bounds = shapeBoundsForPlacement(tool, draftStart, draftEnd);
			const x = Math.min(draftStart.x, draftEnd.x);
			const y = Math.min(draftStart.y, draftEnd.y);
			const width = Math.abs(draftEnd.x - draftStart.x);
			const height = Math.abs(draftEnd.y - draftStart.y);

			if (tool === 'ellipse') {
				canvasContext.beginPath();
				const ellipseX = Math.min(bounds.start.x, bounds.end.x);
				const ellipseY = Math.min(bounds.start.y, bounds.end.y);
				const ellipseWidth = Math.abs(bounds.end.x - bounds.start.x);
				const ellipseHeight = Math.abs(bounds.end.y - bounds.start.y);

				canvasContext.ellipse(
					ellipseX + ellipseWidth / 2,
					ellipseY + ellipseHeight / 2,
					ellipseWidth / 2,
					ellipseHeight / 2,
					0,
					0,
					Math.PI * 2
				);
				canvasContext.stroke();
			} else if (tool === 'rect') {
				const rectX = Math.min(bounds.start.x, bounds.end.x);
				const rectY = Math.min(bounds.start.y, bounds.end.y);
				const rectWidth = Math.abs(bounds.end.x - bounds.start.x);
				const rectHeight = Math.abs(bounds.end.y - bounds.start.y);

				canvasContext.strokeRect(rectX, rectY, rectWidth, rectHeight);
			} else {
				const points = trianglePointsFromBounds(bounds.start, bounds.end);
				const [first, ...rest] = points;

				if (first) {
					canvasContext.beginPath();
					canvasContext.moveTo(first.x, first.y);

					for (const point of rest) {
						canvasContext.lineTo(point.x, point.y);
					}

					canvasContext.closePath();
					canvasContext.stroke();
				}
			}

			if (width > 0 || height > 0) {
				canvasContext.strokeRect(x, y, width, height);
			}
		}

		if (tool === 'path') {
			drawPathDraftSegment(canvasContext, draftStart, draftEnd);
		}

		canvasContext.setLineDash([]);
		canvasContext.fillStyle = '#60a5fa';
		drawDraftHandle(canvasContext, draftStart);
		drawDraftHandle(canvasContext, draftEnd);

		if (snapTarget) {
			canvasContext.strokeStyle = '#facc15';
			canvasContext.lineWidth = 2 / viewport.zoom;
			canvasContext.beginPath();
			canvasContext.arc(snapTarget.point.x, snapTarget.point.y, 7 / viewport.zoom, 0, Math.PI * 2);
			canvasContext.stroke();
		}
		canvasContext.restore();
	}

	function drawDraftHandle(canvasContext: CanvasRenderingContext2D, point: Point) {
		canvasContext.beginPath();
		canvasContext.arc(point.x, point.y, 4 / viewport.zoom, 0, Math.PI * 2);
		canvasContext.fill();
	}

	function drawPathDraftSegment(canvasContext: CanvasRenderingContext2D, start: Point, end: Point) {
		canvasContext.beginPath();
		canvasContext.moveTo(start.x, start.y);

		if (pathSegmentMode === 'quadratic') {
			const control = {
				x: (start.x + end.x) / 2 - (end.y - start.y) * -0.35,
				y: (start.y + end.y) / 2 + (end.x - start.x) * -0.35
			};
			canvasContext.quadraticCurveTo(control.x, control.y, end.x, end.y);
		} else if (pathSegmentMode === 'cubic') {
			canvasContext.bezierCurveTo(
				start.x + (end.x - start.x) / 3,
				start.y + (end.y - start.y) / 3,
				start.x + ((end.x - start.x) * 2) / 3,
				start.y + ((end.y - start.y) * 2) / 3,
				end.x,
				end.y
			);
		} else {
			canvasContext.lineTo(end.x, end.y);
		}

		canvasContext.stroke();
	}
</script>

<svelte:head>
	<title>GlyphSmith</title>
</svelte:head>

<div class="app-shell">
	<header class="topbar">
		<div class="topbar-brand">
			<div class="brand-mark">G</div>
			<div>
				<h1>GlyphSmith</h1>
				<p>{geometryDocument.name}</p>
			</div>
		</div>

		<div class="toolbar" aria-label="Tools">
			<button class:active={tool === 'select'} type="button" onclick={() => setTool('select')}>Select</button>
			<button class:active={tool === 'rect'} type="button" onclick={() => setTool('rect')}>Rect</button>
			<button class:active={tool === 'ellipse'} type="button" onclick={() => setTool('ellipse')}>Ellipse</button>
			<button class:active={tool === 'triangle'} type="button" onclick={() => setTool('triangle')}>Triangle</button>
			<button class:active={tool === 'path' && pathSegmentMode === 'line'} type="button" onclick={() => setLineTool('line')}>Line</button>
			<button class:active={tool === 'path' && pathSegmentMode === 'quadratic'} type="button" onclick={() => setLineTool('quadratic')}>Quadratic</button>
			<button class:active={tool === 'path' && pathSegmentMode === 'cubic'} type="button" onclick={() => setLineTool('cubic')}>Bezier</button>
			<button class:active={tool === 'path' && pathSegmentMode === 'arc'} type="button" onclick={() => setLineTool('arc')}>Arc</button>
		</div>

		<div class="topbar-status">
			<button type="button" onclick={undo} disabled={undoStack.length === 0}>Undo</button>
			<button type="button" onclick={redo} disabled={redoStack.length === 0}>Redo</button>
			<span>{tool}</span>
			<span>{geometryDocument.root.children.length} nodes</span>
			<span>{Math.round(viewport.zoom * 100)}%</span>
			<span>{geometryDocument.width} x {geometryDocument.height}px</span>
		</div>
	</header>

	<main class="workspace">
		<aside class="sidebar">
			<div class="panel">
				<h2>Layers</h2>
				<div class="layer-list">
					{#if geometryDocument.root.children.length === 0}
						<div class="empty-row">No nodes</div>
					{/if}

					{#each geometryDocument.root.children as node}
						<button
							class:selected={selectedNodeIds.includes(node.id)}
							type="button"
							onclick={() => (selectedNodeIds = [node.id])}
						>
							<span>{node.name ?? node.type}</span>
							<code>{node.id}</code>
						</button>
					{/each}
				</div>
			</div>
		</aside>

		<section class="canvas-shell">
			<canvas
				class:panning
				class:space-pan={spacePressed}
				bind:this={canvas}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointerleave={handlePointerLeave}
				onwheel={handleWheel}
				oncontextmenu={(event) => event.preventDefault()}
			></canvas>
		</section>

		<aside class="inspector">
			<div class="panel">
				<h2>Size Settings</h2>
				<div class="field-grid">
					<label for="document-width">Width</label>
					<div class="number-field">
						<input
							id="document-width"
							min="1"
							step="1"
							type="number"
							value={geometryDocument.width}
							onchange={(event) => updateDocumentDimension('width', event)}
						/>
						<span>px</span>
					</div>

					<label for="document-height">Height</label>
					<div class="number-field">
						<input
							id="document-height"
							min="1"
							step="1"
							type="number"
							value={geometryDocument.height}
							onchange={(event) => updateDocumentDimension('height', event)}
						/>
						<span>px</span>
					</div>
				</div>
			</div>

			<div class="panel">
				<h2>Zoom Settings</h2>
				<div class="field-grid compact">
					<label for="zoom-percent">Scale</label>
					<div class="number-field">
						<input
							id="zoom-percent"
							min="10"
							max="800"
							step="1"
							type="number"
							value={Math.round(viewport.zoom * 100)}
							onchange={updateZoomPercent}
						/>
						<span>%</span>
					</div>
				</div>
				<button class="secondary-button" type="button" onclick={fitCanvasToDocument}>Fit</button>
			</div>

			<div class="panel">
				<h2>Appearance</h2>
				{#if selectedNode}
					<div class="field-grid">
						<label for="fill">Fill</label>
						<input
							id="fill"
							class="text-field"
							value={selectedNode.style?.fill ?? 'none'}
							onchange={(event) => updateSelectedStyle('fill', event.currentTarget.value)}
						/>

						<label for="stroke">Stroke</label>
						<input
							id="stroke"
							class="text-field"
							value={selectedNode.style?.stroke ?? '#111827'}
							onchange={(event) => updateSelectedStyle('stroke', event.currentTarget.value)}
						/>

						<label for="stroke-width">Stroke W</label>
						<input
							id="stroke-width"
							class="text-field"
							min="0"
							step="0.5"
							type="number"
							value={selectedNode.style?.strokeWidth ?? 2}
							onchange={(event) => updateSelectedStyle('strokeWidth', event.currentTarget.value)}
						/>

						<label for="opacity">Opacity</label>
						<input
							id="opacity"
							class="text-field"
							min="0"
							max="1"
							step="0.05"
							type="number"
							value={selectedNode.style?.opacity ?? 1}
							onchange={(event) => updateSelectedStyle('opacity', event.currentTarget.value)}
						/>
					</div>
					<button class="secondary-button danger" type="button" onclick={deleteSelection}>Delete Selection</button>
				{:else}
					<div class="empty-row">No selection</div>
				{/if}
			</div>

			<div class="panel export-panel">
				<h2>SVG Export</h2>
				<button class="secondary-button" type="button" onclick={downloadSvg}>Download SVG</button>
				<textarea readonly value={svgOutput}></textarea>
			</div>
		</aside>
	</main>
</div>
