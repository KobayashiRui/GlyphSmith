<script lang="ts">
	import type { GeometryNode, NodeId } from '@glyphsmith/ast';
	import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers';
	import { createSortable } from '@dnd-kit/svelte/sortable';

	type Props = {
		node: GeometryNode;
		index: number;
		selected: boolean;
		onSelect: (nodeId: NodeId) => void;
	};

	let { node, index, selected, onSelect }: Props = $props();

	const sortable = createSortable({
		get id() {
			return node.id;
		},
		get index() {
			return index;
		},
		group: 'root-layers',
		type: 'layer',
		modifiers: [RestrictToVerticalAxis]
	});
</script>

<button
	class:dragging={sortable.isDragging}
	class:drop-target={sortable.isDropTarget && !sortable.isDragSource}
	class:selected
	type="button"
	onclick={() => onSelect(node.id)}
	{@attach sortable.attach}
>
	<span>{node.name ?? node.type}</span>
	<code>{node.id}</code>
</button>
