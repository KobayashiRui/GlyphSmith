<script lang="ts">
	import {
		createPage,
		createProject,
		type DocumentBackground,
		type GeometryDocument,
		type GeometryNode,
		type GlyphSmithProject,
		type NodeId,
		type NodeStyle,
		type PathNode,
		type Point,
		type Segment
	} from '@glyphsmith/ast';
	import {
		createAppendPathSegmentPatch,
		createBasisSplinePathGeometry,
		createCubicBezierSegment,
		createEllipseInsertPatch,
		createLinePathInsertPatch,
		createPathClosedUpdatePatch,
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
	import PageThumbnail from '$lib/PageThumbnail.svelte';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let canvas: HTMLCanvasElement;
	let context = $state<CanvasRenderingContext2D | undefined>();
	let project = $state<GlyphSmithProject>(initialProjectFromData());
	let selectedNodeIds = $state<NodeId[]>([]);
	let tool = $state<Tool>('select');
	let pathSegmentMode = $state<PathSegmentMode>('line');
	let activePathNodeId = $state<NodeId | undefined>();
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
	let undoStack = $state<GlyphSmithProject[]>([]);
	let redoStack = $state<GlyphSmithProject[]>([]);
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>(initialSaveStatusFromData());
	let hostStatus = $state<'disabled' | 'connecting' | 'connected' | 'error'>('disabled');
	let liveEditStartProject: GlyphSmithProject | undefined;
	let hostSocket: WebSocket | undefined;
	let hostSyncTimer: ReturnType<typeof setTimeout> | undefined;
	let hostReconnectTimer: ReturnType<typeof setTimeout> | undefined;
	let closingHostSocket = false;
	let hasFitInitialViewport = false;

	const uiColors = {
		primary: '#4f8ef7',
		primaryHover: '#6ea4ff',
		primaryPreviewFill: 'rgba(79, 142, 247, 0.08)',
		warning: '#facc15',
		workbench: '#383838'
	} as const;

	const pageBackgroundColorFallbacks = {
		white: '#ffffff',
		gray: '#a0a0a0',
		black: '#000000',
		alphaLight: '#f8fafc',
		alphaDark: '#cfd8df'
	} as const;

	const activePage = $derived(project.pages.find((page) => page.id === project.activePageId) ?? project.pages[0]!);
	const geometryDocument = $derived(activePage.document);
	const svgOutput = $derived(exportToSvg(geometryDocument));
	const selectedNode = $derived(
		selectedNodeIds[0] ? findNode(geometryDocument, selectedNodeIds[0]) : undefined
	);

	function initialProjectFromData(): GlyphSmithProject {
		return (
			data.initialProject ??
			createProject({
				name: 'GlyphSmith Project',
				width: 256,
				height: 256
			})
		);
	}

	function initialSaveStatusFromData(): 'idle' | 'saved' {
		return data.projectFile ? 'saved' : 'idle';
	}

	$effect(() => {
		geometryDocument;
		selectedNodeIds;
		tool;
		activePathNodeId;
		draftStart;
		draftEnd;
		shapePreviewPoint;
		viewport;
		canvasPixelRatio;
		snapTarget;
		draw();
	});

	$effect(() => {
		selectedNodeIds;
		sendSelectionToHost();
	});

	onMount(() => {
		context = canvas.getContext('2d') ?? undefined;
		connectHostWebSocket();

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
				finishPathDrawing();
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
			closeHostWebSocket();
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
		activePathNodeId = undefined;
		dragging = false;
		editingHandle = undefined;
		panning = false;
		snapTarget = undefined;
	}

	function setLineTool(mode: PathSegmentMode) {
		pathSegmentMode = mode;

		if (tool !== 'path') {
			setTool('path');
		}
	}

	function handlePointerDown(event: PointerEvent) {
		const screenPoint = pointerToScreen(event);
		const rawWorldPoint = pointerToWorld(event);
		const worldPoint = tool === 'select' || isShapeTool(tool) ? rawWorldPoint : snapWorldPoint(rawWorldPoint);

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

		if (tool === 'path') {
			handlePathPointerDown(worldPoint);
			return;
		}
	}

	function handlePointerMove(event: PointerEvent) {
		const screenPoint = pointerToScreen(event);
		const rawWorldPoint = pointerToWorld(event);
		const worldPoint = tool === 'path' || (draftStart && tool !== 'select') ? snapWorldPoint(rawWorldPoint) : rawWorldPoint;

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
				updateActiveDocument(applyPatch(geometryDocument, {
					op: 'move',
					target: nodeId,
					dx,
					dy
				}));
			}

			lastDragPoint = worldPoint;
			return;
		}

		if (tool === 'select' && editingHandle) {
			const patch = createEditHandleUpdatePatch(geometryDocument, editingHandle, worldPoint);

			if (patch) {
				updateActiveDocument(applyPatch(geometryDocument, patch));
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

	type BackgroundPreset = 'alpha' | 'black' | 'gray' | 'white';

	function updateDocumentBackground(preset: BackgroundPreset) {
		commitPatch({
			op: 'updateDocument',
			changes: {
				background: backgroundFromPreset(preset)
			}
		});
	}

	function backgroundFromPreset(preset: BackgroundPreset): DocumentBackground {
		if (preset === 'gray') {
			return { type: 'solid', color: themeColor('page-gray', pageBackgroundColorFallbacks.gray) };
		}

		if (preset === 'black') {
			return { type: 'solid', color: themeColor('page-black', pageBackgroundColorFallbacks.black) };
		}

		if (preset === 'alpha') {
			return {
				type: 'checkerboard',
				light: themeColor('page-alpha-light', pageBackgroundColorFallbacks.alphaLight),
				dark: themeColor('page-alpha-dark', pageBackgroundColorFallbacks.alphaDark),
				size: 32
			};
		}

		return { type: 'solid', color: themeColor('page-white', pageBackgroundColorFallbacks.white) };
	}

	function themeColor(name: string, fallback: string) {
		if (typeof window === 'undefined') {
			return fallback;
		}

		return getComputedStyle(document.documentElement).getPropertyValue(`--color-gs-${name}`).trim() || fallback;
	}

	function normalizeColor(color: string) {
		return color.trim().toLowerCase();
	}

	function backgroundPreset(background: DocumentBackground | undefined): BackgroundPreset {
		if (background?.type === 'checkerboard') {
			return 'alpha';
		}

		if (background?.type === 'solid') {
			const color = normalizeColor(background.color);
			const black = normalizeColor(themeColor('page-black', pageBackgroundColorFallbacks.black));
			const gray = normalizeColor(themeColor('page-gray', pageBackgroundColorFallbacks.gray));

			if (color === black || color === '#000000' || color === 'black') {
				return 'black';
			}

			if (
				color === gray ||
				color === '#6b7280' ||
				color === '#808080' ||
				color === '#a0a0a0' ||
				color === 'gray' ||
				color === 'grey'
			) {
				return 'gray';
			}
		}

		return 'white';
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
			activePathNodeId = pathId;
			nextNodeIndex += 1;
			draftStart = draftEnd;
			draftEnd = draftEnd;
		}
	}

	function handlePathPointerDown(point: Point) {
		if (!draftStart) {
			const existingPathStart = getAppendablePathStart(point);

			if (existingPathStart) {
				activePathNodeId = existingPathStart.nodeId;
				selectedNodeIds = [existingPathStart.nodeId];
				draftStart = existingPathStart.point;
				draftEnd = existingPathStart.point;
				return;
			}

			selectedNodeIds = [];
			activePathNodeId = undefined;
			draftStart = point;
			draftEnd = point;
			return;
		}

		draftEnd = point;

		if (activePathNodeId) {
			appendPathSegment(point);
			return;
		}

		confirmPathDraft();
	}

	function appendPathSegment(point: Point) {
		if (!activePathNodeId || !draftStart) {
			return;
		}

		if (isPointOnActivePathStart(point)) {
			closeActivePath();
			return;
		}

		const distance = Math.hypot(point.x - draftStart.x, point.y - draftStart.y);

		if (distance <= 2 / viewport.zoom) {
			return;
		}

		const patch = createAppendPathSegmentPatch(
			geometryDocument,
			activePathNodeId,
			point,
			pathSegmentMode
		);

		if (!patch) {
			finishPathDrawing();
			return;
		}

		commitPatch(patch);
		selectedNodeIds = [activePathNodeId];
		draftStart = point;
		draftEnd = point;
	}

	function closeActivePath() {
		if (!activePathNodeId) {
			return;
		}

		const patch = createPathClosedUpdatePatch(geometryDocument, activePathNodeId, true);

		if (!patch) {
			finishPathDrawing();
			return;
		}

		commitPatch(patch);
		selectedNodeIds = [activePathNodeId];
		finishPathDrawing();
	}

	function getAppendablePathStart(point: Point): { nodeId: NodeId; point: Point } | undefined {
		if (!snapTarget || !pointsEqual(snapTarget.point, point)) {
			return undefined;
		}

		const node = findNode(geometryDocument, snapTarget.nodeId);

		if (!isPathNode(node) || node.closed) {
			return undefined;
		}

		const endPoint = getPathEndPoint(node);

		if (!pointsEqual(point, endPoint)) {
			return undefined;
		}

		return {
			nodeId: node.id,
			point: endPoint
		};
	}

	function isPointOnActivePathStart(point: Point): boolean {
		if (!activePathNodeId || !snapTarget || snapTarget.nodeId !== activePathNodeId) {
			return false;
		}

		const node = findNode(geometryDocument, activePathNodeId);

		return isPathNode(node) && pointsEqual(point, node.start);
	}

	function isPathNode(node: GeometryNode | undefined): node is PathNode {
		return Boolean(node && node.type === 'path');
	}

	function getPathEndPoint(node: PathNode): Point {
		return node.segments.at(-1)?.to ?? node.start;
	}

	function pointsEqual(a: Point, b: Point): boolean {
		return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
	}

	function catmullControl1(previous: Point, start: Point, end: Point): Point {
		return {
			x: start.x + (end.x - previous.x) / 6,
			y: start.y + (end.y - previous.y) / 6
		};
	}

	function catmullControl2(start: Point, end: Point, next: Point): Point {
		return {
			x: end.x - (next.x - start.x) / 6,
			y: end.y - (next.y - start.y) / 6
		};
	}

	function finishPathDrawing() {
		activePathNodeId = undefined;
		editingHandle = undefined;
		dragging = false;
		cancelDraft();
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
			stroke: uiColors.primary,
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
		undoStack = [...undoStack, cloneProject(project)];
		redoStack = [];
		updateActiveDocument(applyPatch(geometryDocument, patch));
	}

	function beginLiveEdit() {
		liveEditStartProject = cloneProject(project);
		redoStack = [];
	}

	function finishLiveEdit() {
		if (!liveEditStartProject) {
			return;
		}

		undoStack = [...undoStack, liveEditStartProject];
		liveEditStartProject = undefined;
	}

	function undo() {
		const previous = undoStack.at(-1);

		if (!previous) {
			return;
		}

		undoStack = undoStack.slice(0, -1);
		redoStack = [...redoStack, cloneProject(project)];
		project = previous;
		cancelDraft();
		selectedNodeIds = [];
		markProjectChanged();
	}

	function redo() {
		const next = redoStack.at(-1);

		if (!next) {
			return;
		}

		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, cloneProject(project)];
		project = next;
		cancelDraft();
		selectedNodeIds = [];
		markProjectChanged();
	}

	function deleteSelection() {
		if (selectedNodeIds.length === 0) {
			return;
		}

		undoStack = [...undoStack, cloneProject(project)];
		redoStack = [];
		let nextDocument = geometryDocument;

		for (const nodeId of selectedNodeIds) {
			nextDocument = applyPatch(nextDocument, {
				op: 'delete',
				target: nodeId
			});
		}

		updateActiveDocument(nextDocument);
		selectedNodeIds = [];
		cancelDraft();
	}

	function setActivePage(pageId: string) {
		if (pageId === project.activePageId) {
			return;
		}

		project = {
			...project,
			activePageId: pageId
		};
		selectedNodeIds = [];
		finishPathDrawing();
		markProjectChanged();
	}

	function addPage() {
		const pageId = nextPageId();
		const page = createPage({
			pageId,
			name: `Page ${project.pages.length + 1}`,
			width: geometryDocument.width,
			height: geometryDocument.height
		});

		undoStack = [...undoStack, cloneProject(project)];
		redoStack = [];
		project = {
			...project,
			activePageId: page.id,
			pages: [...project.pages, page],
			updatedAt: new Date().toISOString()
		};
		selectedNodeIds = [];
		finishPathDrawing();
		markProjectChanged();
	}

	function duplicatePage() {
		const pageId = nextPageId();
		const document = cloneDocument(geometryDocument);

		document.id = `${pageId}-document`;
		document.name = `${activePage.name} Copy`;

		undoStack = [...undoStack, cloneProject(project)];
		redoStack = [];
		project = {
			...project,
			activePageId: pageId,
			pages: [
				...project.pages,
				{
					id: pageId,
					name: document.name,
					document
				}
			],
			updatedAt: new Date().toISOString()
		};
		selectedNodeIds = [];
		finishPathDrawing();
		markProjectChanged();
	}

	function deleteActivePage() {
		if (project.pages.length <= 1) {
			return;
		}

		const activeIndex = project.pages.findIndex((page) => page.id === project.activePageId);
		const pages = project.pages.filter((page) => page.id !== project.activePageId);
		const nextActivePage = pages[Math.max(0, activeIndex - 1)] ?? pages[0];

		if (!nextActivePage) {
			return;
		}

		undoStack = [...undoStack, cloneProject(project)];
		redoStack = [];
		project = {
			...project,
			activePageId: nextActivePage.id,
			pages,
			updatedAt: new Date().toISOString()
		};
		selectedNodeIds = [];
		finishPathDrawing();
		markProjectChanged();
	}

	function nextPageId(): string {
		let index = project.pages.length + 1;

		while (project.pages.some((page) => page.id === `page-${index}`)) {
			index += 1;
		}

		return `page-${index}`;
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

	function colorPickerValue(value: string | undefined, fallback: string): string {
		return /^#[\da-f]{6}$/i.test(value ?? '') ? (value as string) : fallback;
	}

	function downloadSvg() {
		const blob = new Blob([svgOutput], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = url;
		link.download = `${activePage.name || 'glyphsmith'}.svg`;
		link.click();
		URL.revokeObjectURL(url);
	}

	function downloadProject() {
		const snapshot = cloneProject(project);
		const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = url;
		link.download = `${project.name || 'glyphsmith'}.gs.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function saveProjectToDisk() {
		if (sendProjectToHost()) {
			return;
		}

		saveStatus = 'saving';

		try {
			const response = await fetch('/api/project', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(cloneProject(project))
			});

			saveStatus = response.ok ? 'saved' : 'error';
		} catch {
			saveStatus = 'error';
		}
	}

	function connectHostWebSocket() {
		if (!data.hostWebSocketUrl) {
			hostStatus = 'disabled';
			return;
		}

		closingHostSocket = false;
		hostStatus = 'connecting';

		const socket = new WebSocket(data.hostWebSocketUrl);
		hostSocket = socket;

		socket.onopen = () => {
			if (hostSocket !== socket) {
				return;
			}

			hostStatus = 'connected';
			saveStatus = 'saved';
			sendSelectionToHost();
		};

		socket.onmessage = (event) => {
			if (typeof event.data !== 'string') {
				return;
			}

			handleHostMessage(event.data);
		};

		socket.onclose = () => {
			if (hostSocket !== socket) {
				return;
			}

			hostSocket = undefined;
			hostStatus = closingHostSocket ? 'disabled' : 'error';

			if (!closingHostSocket) {
				hostReconnectTimer = setTimeout(connectHostWebSocket, 1000);
			}
		};

		socket.onerror = () => {
			hostStatus = 'error';
		};
	}

	function closeHostWebSocket() {
		closingHostSocket = true;

		if (hostReconnectTimer) {
			clearTimeout(hostReconnectTimer);
			hostReconnectTimer = undefined;
		}

		if (hostSyncTimer) {
			clearTimeout(hostSyncTimer);
			hostSyncTimer = undefined;
		}

		hostSocket?.close();
		hostSocket = undefined;
	}

	function handleHostMessage(rawMessage: string) {
		let message: unknown;

		try {
			message = JSON.parse(rawMessage);
		} catch {
			return;
		}

		if (!isHostMessage(message)) {
			return;
		}

		if (message.type === 'project:ack') {
			saveStatus = 'saved';
			return;
		}

		if (message.type === 'project:snapshot') {
			if (projectsEqual(project, message.project)) {
				saveStatus = 'saved';
				return;
			}

			applyRemoteProject(message.project);
		}
	}

	function isHostMessage(
		message: unknown
	): message is { type: 'project:ack' } | { type: 'project:snapshot'; project: GlyphSmithProject } {
		return Boolean(
			message &&
				typeof message === 'object' &&
				'type' in message &&
				((message.type === 'project:ack') ||
					(message.type === 'project:snapshot' && 'project' in message && isProjectLike(message.project)))
		);
	}

	function isProjectLike(value: unknown): value is GlyphSmithProject {
		return Boolean(
			value &&
				typeof value === 'object' &&
				'schemaVersion' in value &&
				value.schemaVersion === 1 &&
				'pages' in value &&
				Array.isArray(value.pages)
		);
	}

	function applyRemoteProject(nextProject: GlyphSmithProject) {
		project = structuredClone(nextProject) as GlyphSmithProject;
		nextNodeIndex = Math.max(nextNodeIndex, nextNodeIndexFromProject(project));
		undoStack = [];
		redoStack = [];
		selectedNodeIds = [];
		finishPathDrawing();
		saveStatus = 'saved';
	}

	function markProjectChanged() {
		if (!data.hostWebSocketUrl || !hostSocket || hostSocket.readyState !== WebSocket.OPEN) {
			saveStatus = data.projectFile ? 'idle' : saveStatus;
			return;
		}

		saveStatus = 'saving';

		if (hostSyncTimer) {
			clearTimeout(hostSyncTimer);
		}

		hostSyncTimer = setTimeout(() => {
			hostSyncTimer = undefined;
			sendProjectToHost();
		}, 250);
	}

	function sendProjectToHost() {
		if (!hostSocket || hostSocket.readyState !== WebSocket.OPEN) {
			return false;
		}

		saveStatus = 'saving';
		hostSocket.send(
			JSON.stringify({
				type: 'project:update',
				project: cloneProject(project)
			})
		);

		return true;
	}

	function sendSelectionToHost() {
		if (!hostSocket || hostSocket.readyState !== WebSocket.OPEN) {
			return;
		}

		hostSocket.send(
			JSON.stringify({
				type: 'selection:update',
				nodeIds: [...selectedNodeIds]
			})
		);
	}

	function projectsEqual(left: GlyphSmithProject, right: GlyphSmithProject) {
		return JSON.stringify($state.snapshot(left)) === JSON.stringify(right);
	}

	function nextNodeIndexFromProject(sourceProject: GlyphSmithProject) {
		let maxIndex = 0;

		for (const page of sourceProject.pages) {
			walkNode(page.document.root, (node) => {
				const match = /-(\d+)$/.exec(node.id);

				if (match) {
					maxIndex = Math.max(maxIndex, Number(match[1]));
				}
			});
		}

		return maxIndex + 1;
	}

	function walkNode(node: GeometryNode, visit: (node: GeometryNode) => void) {
		visit(node);

		if ('children' in node && Array.isArray(node.children)) {
			for (const child of node.children) {
				walkNode(child, visit);
			}
		}
	}

	function cloneDocument(documentToClone: GeometryDocument): GeometryDocument {
		return structuredClone($state.snapshot(documentToClone)) as GeometryDocument;
	}

	function cloneProject(projectToClone: GlyphSmithProject): GlyphSmithProject {
		return structuredClone($state.snapshot(projectToClone)) as GlyphSmithProject;
	}

	function updateActiveDocument(document: GeometryDocument) {
		project = {
			...project,
			updatedAt: new Date().toISOString(),
			pages: project.pages.map((page) =>
				page.id === project.activePageId
					? {
							...page,
							name: document.name,
							document
						}
					: page
				)
		};
		markProjectChanged();
	}

	function draw() {
		if (!context) {
			return;
		}

		renderDocument(context, geometryDocument, viewport, {
			selectedNodeIds,
			background: uiColors.workbench,
			pixelRatio: canvasPixelRatio,
			showEditHandles: selectedNodeIds.length > 0
		});

		drawShapePreview(context);
		drawCatmullRomCandidate(context);
		drawBasisSplineCandidate(context);
		drawCubicBezierCandidate(context);
		drawDraft(context);
		drawSnapTarget(context);
	}

	function drawCatmullRomCandidate(canvasContext: CanvasRenderingContext2D) {
		if (tool !== 'path' || pathSegmentMode !== 'catmullRom' || !activePathNodeId || !draftStart || !draftEnd) {
			return;
		}

		const node = findNode(geometryDocument, activePathNodeId);

		if (!isPathNode(node) || node.segments.length === 0) {
			return;
		}

		const points = [node.start, ...node.segments.map((segment) => segment.to)];
		const start = points.at(-1);
		const previous = points.at(-2);
		const beforePrevious = points.at(-3) ?? previous;
		const lastSegment = node.segments.at(-1);

		if (!start || !previous || !beforePrevious || !lastSegment || lastSegment.type !== 'cubic') {
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
		canvasContext.strokeStyle = uiColors.primary;
		canvasContext.lineWidth = 2 / viewport.zoom;
		canvasContext.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);

		const adjustedPreviousControl1 = catmullControl1(beforePrevious, previous, start);
		const adjustedPreviousControl2 = catmullControl2(previous, start, draftEnd);
		const nextControl1 = catmullControl1(previous, start, draftEnd);
		const nextControl2 = catmullControl2(start, draftEnd, draftEnd);

		canvasContext.beginPath();
		canvasContext.moveTo(previous.x, previous.y);
		canvasContext.bezierCurveTo(
			adjustedPreviousControl1.x,
			adjustedPreviousControl1.y,
			adjustedPreviousControl2.x,
			adjustedPreviousControl2.y,
			start.x,
			start.y
		);
		canvasContext.bezierCurveTo(
			nextControl1.x,
			nextControl1.y,
			nextControl2.x,
			nextControl2.y,
			draftEnd.x,
			draftEnd.y
		);
		canvasContext.stroke();
		canvasContext.restore();
	}

	function drawBasisSplineCandidate(canvasContext: CanvasRenderingContext2D) {
		if (tool !== 'path' || pathSegmentMode !== 'basis' || !activePathNodeId || !draftEnd) {
			return;
		}

		const node = findNode(geometryDocument, activePathNodeId);

		if (!isPathNode(node) || node.spline?.type !== 'basis') {
			return;
		}

		const candidate = createBasisSplinePathGeometry([...node.spline.points, draftEnd]);

		canvasContext.save();
		canvasContext.setTransform(
			viewport.zoom * canvasPixelRatio,
			0,
			0,
			viewport.zoom * canvasPixelRatio,
			viewport.x * canvasPixelRatio,
			viewport.y * canvasPixelRatio
		);
		canvasContext.strokeStyle = uiColors.primary;
		canvasContext.lineWidth = 2 / viewport.zoom;
		canvasContext.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);
		drawPathGeometry(canvasContext, candidate.start, candidate.segments);
		canvasContext.restore();
	}

	function drawCubicBezierCandidate(canvasContext: CanvasRenderingContext2D) {
		if (tool !== 'path' || pathSegmentMode !== 'cubic' || !activePathNodeId || !draftEnd) {
			return;
		}

		const node = findNode(geometryDocument, activePathNodeId);

		if (!isPathNode(node) || node.segments.length === 0) {
			return;
		}

		const start = getPathEndPoint(node);
		const previous = node.segments.length < 2 ? node.start : node.segments[node.segments.length - 2]?.to ?? node.start;
		const segment = createCubicBezierSegment(previous, start, draftEnd);

		canvasContext.save();
		canvasContext.setTransform(
			viewport.zoom * canvasPixelRatio,
			0,
			0,
			viewport.zoom * canvasPixelRatio,
			viewport.x * canvasPixelRatio,
			viewport.y * canvasPixelRatio
		);
		canvasContext.strokeStyle = uiColors.primary;
		canvasContext.lineWidth = 2 / viewport.zoom;
		canvasContext.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);
		drawPathGeometry(canvasContext, start, [segment]);
		canvasContext.restore();
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
		canvasContext.strokeStyle = uiColors.primaryHover;
		canvasContext.fillStyle = uiColors.primaryPreviewFill;
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

		if (tool === 'path' && pathSegmentMode === 'catmullRom' && activePathNodeId) {
			return;
		}

		if (tool === 'path' && pathSegmentMode === 'basis' && activePathNodeId) {
			return;
		}

		if (tool === 'path' && pathSegmentMode === 'cubic' && activePathNodeId) {
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
		canvasContext.strokeStyle = uiColors.primary;
		canvasContext.lineWidth = 2 / viewport.zoom;
		canvasContext.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);

		if (isShapeTool(tool)) {
			const bounds = shapeBoundsForPlacement(tool, draftStart, draftEnd);

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
		}

		if (tool === 'path') {
			drawPathDraftSegment(canvasContext, draftStart, draftEnd);
		}

		canvasContext.setLineDash([]);
		canvasContext.fillStyle = uiColors.primaryHover;
		drawDraftHandle(canvasContext, draftStart);
		drawDraftHandle(canvasContext, draftEnd);

		canvasContext.restore();
	}

	function drawSnapTarget(canvasContext: CanvasRenderingContext2D) {
		if (!snapTarget) {
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
		canvasContext.strokeStyle = uiColors.warning;
		canvasContext.lineWidth = 2 / viewport.zoom;
		canvasContext.beginPath();
		canvasContext.arc(snapTarget.point.x, snapTarget.point.y, 7 / viewport.zoom, 0, Math.PI * 2);
		canvasContext.stroke();
		canvasContext.restore();
	}

	function drawDraftHandle(canvasContext: CanvasRenderingContext2D, point: Point) {
		canvasContext.beginPath();
		canvasContext.arc(point.x, point.y, 4 / viewport.zoom, 0, Math.PI * 2);
		canvasContext.fill();
	}

	function drawPathDraftSegment(canvasContext: CanvasRenderingContext2D, start: Point, end: Point) {
		if (pathSegmentMode === 'basis') {
			const geometry = createBasisSplinePathGeometry([start, end]);
			drawPathGeometry(canvasContext, geometry.start, geometry.segments);
			return;
		}

		canvasContext.beginPath();
		canvasContext.moveTo(start.x, start.y);

		if (pathSegmentMode === 'quadratic') {
			const control = {
				x: (start.x + end.x) / 2 - (end.y - start.y) * -0.35,
				y: (start.y + end.y) / 2 + (end.x - start.x) * -0.35
			};
			canvasContext.quadraticCurveTo(control.x, control.y, end.x, end.y);
		} else if (pathSegmentMode === 'cubic' || pathSegmentMode === 'catmullRom') {
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

	function drawPathGeometry(canvasContext: CanvasRenderingContext2D, start: Point, segments: Segment[]) {
		canvasContext.beginPath();
		canvasContext.moveTo(start.x, start.y);

		for (const segment of segments) {
			if (segment.type === 'line') {
				canvasContext.lineTo(segment.to.x, segment.to.y);
			} else if (segment.type === 'quadratic') {
				canvasContext.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y);
			} else if (segment.type === 'cubic') {
				canvasContext.bezierCurveTo(
					segment.control1.x,
					segment.control1.y,
					segment.control2.x,
					segment.control2.y,
					segment.to.x,
					segment.to.y
				);
			} else {
				canvasContext.lineTo(segment.to.x, segment.to.y);
			}
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
				<h1>{project.name}</h1>
				<p>{activePage.name}</p>
			</div>
		</div>

		<div class="toolbar" aria-label="Tools">
			<button class:active={tool === 'select'} type="button" onclick={() => setTool('select')}>Select</button>
			<button class:active={tool === 'rect'} type="button" onclick={() => setTool('rect')}>Rect</button>
			<button class:active={tool === 'ellipse'} type="button" onclick={() => setTool('ellipse')}>Ellipse</button>
			<button class:active={tool === 'triangle'} type="button" onclick={() => setTool('triangle')}>Triangle</button>
			<button class:active={tool === 'path' && pathSegmentMode === 'line'} type="button" onclick={() => setLineTool('line')}>Line</button>
			<button class:active={tool === 'path' && pathSegmentMode === 'arc'} type="button" onclick={() => setLineTool('arc')}>Arc</button>
			<button class:active={tool === 'path' && pathSegmentMode === 'cubic'} type="button" onclick={() => setLineTool('cubic')}>Cubic Bezier</button>
			<button class:active={tool === 'path' && pathSegmentMode === 'catmullRom'} type="button" onclick={() => setLineTool('catmullRom')}>Catmull</button>
			<button class:active={tool === 'path' && pathSegmentMode === 'basis'} type="button" onclick={() => setLineTool('basis')}>Basis</button>
		</div>

		<div class="topbar-status">
			<button type="button" onclick={undo} disabled={undoStack.length === 0}>Undo</button>
			<button type="button" onclick={redo} disabled={redoStack.length === 0}>Redo</button>
			<span class:connected={hostStatus === 'connected'} class="host-status">Host: {hostStatus}</span>
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

		<div class="editor-stage">
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

			<footer class="page-strip" aria-label="Pages">
				<div class="page-strip-list">
					{#each project.pages as page, pageIndex}
						<button
							class:active={page.id === project.activePageId}
							type="button"
							onclick={() => setActivePage(page.id)}
						>
							<PageThumbnail document={page.document} index={pageIndex + 1} />
							<span class="page-meta">
								<strong>{page.name}</strong>
								<small>{page.document.width} x {page.document.height}px</small>
							</span>
						</button>
					{/each}
				</div>
				<div class="page-strip-actions">
					<button type="button" onclick={addPage}>New</button>
					<button type="button" onclick={duplicatePage}>Duplicate</button>
					<button type="button" onclick={deleteActivePage} disabled={project.pages.length <= 1}>Delete</button>
				</div>
			</footer>
		</div>

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
				<h2>Page Background</h2>
				<div class="background-options" aria-label="Page background">
					{#each ['white', 'gray', 'black', 'alpha'] as preset}
						<button
							aria-label={`${preset} background`}
							class:active={backgroundPreset(geometryDocument.background) === preset}
							class="background-swatch {preset}"
							type="button"
							onclick={() => updateDocumentBackground(preset as BackgroundPreset)}
						></button>
					{/each}
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
						<div class="paint-field">
							<input
								aria-label="Fill color"
								class="color-field"
								type="color"
								value={colorPickerValue(selectedNode.style?.fill, uiColors.primary)}
								oninput={(event) => updateSelectedStyle('fill', event.currentTarget.value)}
							/>
							<input
								id="fill"
								class="text-field"
								value={selectedNode.style?.fill ?? 'none'}
								onchange={(event) => updateSelectedStyle('fill', event.currentTarget.value)}
							/>
							<button class="inline-button" type="button" onclick={() => updateSelectedStyle('fill', 'none')}>None</button>
						</div>

						<label for="stroke">Stroke</label>
						<div class="paint-field">
							<input
								aria-label="Stroke color"
								class="color-field"
								type="color"
								value={colorPickerValue(selectedNode.style?.stroke, '#111827')}
								oninput={(event) => updateSelectedStyle('stroke', event.currentTarget.value)}
							/>
							<input
								id="stroke"
								class="text-field"
								value={selectedNode.style?.stroke ?? '#111827'}
								onchange={(event) => updateSelectedStyle('stroke', event.currentTarget.value)}
							/>
						</div>

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
				<h2>Export</h2>
				<button class="secondary-button" type="button" onclick={downloadSvg}>Download SVG</button>
				<button class="secondary-button" type="button" onclick={saveProjectToDisk} disabled={saveStatus === 'saving'}>
					{saveStatus === 'saving' ? 'Saving...' : 'Save Project'}
				</button>
				<button class="secondary-button" type="button" onclick={downloadProject}>Download Project</button>
				{#if data.projectFile}
					<div class="project-file-label">{data.projectFile}</div>
				{/if}
				{#if saveStatus === 'error'}
					<div class="project-save-error">Project file is not writable from this session.</div>
				{/if}
				<textarea readonly value={svgOutput}></textarea>
			</div>
		</aside>
	</main>
</div>
