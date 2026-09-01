export const workspaceTabIconPaths = {
  database: "M735-567q105-47 105-113T735-793q-105-47-255-47t-255 47q-105 47-105 113t105 113q105 47 255 47t255-47ZM582.5-428.5Q644-437 701-456t98-49.5q41-30.5 41-74.5v100q0 44-41 74.5T701-356q-57 19-118.5 27.5T480-320q-41 0-102.5-8.5T259-356q-57-19-98-49.5T120-480v-100q0 44 41 74.5t98 49.5q57 19 118.5 27.5T480-420q41 0 102.5-8.5Zm0 200Q644-237 701-256t98-49.5q41-30.5 41-74.5v100q0 44-41 74.5T701-156q-57 19-118.5 27.5T480-120q-41 0-102.5-8.5T259-156q-57-19-98-49.5T120-280v-100q0 44 41 74.5t98 49.5q57 19 118.5 27.5T480-220q41 0 102.5-8.5Z",
  attachFile: "M720-330q0 104-73 177T470-80q-104 0-177-73t-73-177v-370q0-75 52.5-127.5T400-880q75 0 127.5 52.5T580-700v350q0 46-32 78t-78 32q-46 0-78-32t-32-78v-330q0-17 11.5-28.5T400-720q17 0 28.5 11.5T440-680v330q0 13 8.5 21.5T470-320q13 0 21.5-8.5T500-350v-350q-1-42-29.5-71T400-800q-42 0-71 29t-29 71v370q-1 71 49 120.5T470-160q70 0 119-49.5T640-330v-350q0-17 11.5-28.5T680-720q17 0 28.5 11.5T720-680v350Z",
} as const;

interface WorkspaceTabIconProps {
  kind: keyof typeof workspaceTabIconPaths;
  className?: string;
}

export function WorkspaceTabIcon({ kind, className }: WorkspaceTabIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 -960 960 960" fill="currentColor">
      <path d={workspaceTabIconPaths[kind]} />
    </svg>
  );
}
