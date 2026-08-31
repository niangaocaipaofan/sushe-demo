interface AgentTabIconProps {
  label: string;
}

export function AgentTabIcon({ label }: AgentTabIconProps) {
  return <span aria-hidden="true" className="agent-tab-icon">{label}</span>;
}
