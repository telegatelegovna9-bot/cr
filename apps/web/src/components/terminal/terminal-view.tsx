'use client';

export function TerminalView({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden relative">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-[100px]" />
      </div>

      {/* Main content area */}
      <main className="flex-1 overflow-hidden relative z-10">{children}</main>
    </div>
  );
}
