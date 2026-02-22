export interface TreeNode {
  id: string;
  title: string;
  children: TreeNode[];
}

function renderNode(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  lines: string[]
): void {
  const branch = isRoot ? "" : isLast ? "└─ " : "├─ ";
  lines.push(`${prefix}${branch}${node.id}  ${node.title}`);

  const childPrefix = isRoot ? prefix : `${prefix}${isLast ? "   " : "│  "}`;
  node.children.forEach((child, index) => {
    renderNode(
      child,
      childPrefix,
      index === node.children.length - 1,
      false,
      lines
    );
  });
}

export function renderTree(nodes: TreeNode[]): string {
  const lines: string[] = [];
  nodes.forEach((node, index) => {
    renderNode(node, "", index === nodes.length - 1, true, lines);
  });
  return lines.join("\n");
}
