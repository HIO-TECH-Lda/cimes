"use client";

import { createContext, useContext, useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Separadores simples (sem Radix — ADR-0001 não inclui @radix-ui/react-tabs).
 * API parecida com a do shadcn: Tabs / TabsList / TabsTrigger / TabsContent.
 */

type TabsContextValue = { value: string; setValue: (v: string) => void; baseId: string };

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  value,
  onValueChange,
  defaultValue,
  className,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  defaultValue?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = value ?? internal;
  const setValue = (v: string) => {
    setInternal(v);
    onValueChange?.(v);
  };
  const id = useId();
  return (
    <TabsContext.Provider value={{ value: current, setValue, baseId: id }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components têm de estar dentro de <Tabs>");
  return ctx;
}

export function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="tablist" className={cn("bg-muted text-muted-foreground inline-flex items-center rounded-lg p-1", className)} {...props} />;
}

export function TabsTrigger({ value, className, ...props }: React.ComponentProps<"button"> & { value: string }) {
  const ctx = useTabs();
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "inline-flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition",
        active ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ value, className, ...props }: React.ComponentProps<"div"> & { value: string }) {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return <div role="tabpanel" className={cn("mt-4", className)} {...props} />;
}