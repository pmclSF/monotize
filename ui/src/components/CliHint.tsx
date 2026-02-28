interface CliHintProps {
  command: string;
}

export function CliHint({ command }: CliHintProps) {
  return (
    <div className="cli-hint">
      Equivalent CLI: <code>{command}</code>
    </div>
  );
}
