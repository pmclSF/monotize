import React from 'react';

interface TreePreviewProps {
  files: string[];
  title?: string;
}

export function TreePreview({ files, title }: TreePreviewProps) {
  // Build a tree structure from flat file paths
  const tree = buildTree(files);

  return (
    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid #ddd', borderRadius: 4, padding: 8 }}>
      {title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>}
      {renderTree(tree, '')}
    </div>
  );
}

interface TreeNode {
  [key: string]: TreeNode | null;
}

function buildTree(files: string[]): TreeNode {
  const tree: TreeNode = {};
  for (const file of files.sort()) {
    const parts = file.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = null; // leaf (file)
      } else {
        if (!current[part] || current[part] === null) {
          current[part] = {};
        }
        current = current[part] as TreeNode;
      }
    }
  }
  return tree;
}

function renderTree(node: TreeNode, prefix: string): React.ReactNode {
  const entries = Object.entries(node);
  return entries.map(([name, child], i) => {
    const isLast = i === entries.length - 1;
    const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
    const childPrefix = prefix + (isLast ? '    ' : '\u2502   ');
    const isDir = child !== null;

    return (
      <React.Fragment key={prefix + name}>
        <div>{prefix}{connector}{isDir ? `${name}/` : name}</div>
        {isDir && renderTree(child, childPrefix)}
      </React.Fragment>
    );
  });
}
