'use client';

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden">
      {children}
    </div>
  );
}
