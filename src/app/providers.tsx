import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { HeroUIProvider } from "@heroui/react";
import { useLocale } from "@/i18n/compat/client";
import { ResumeStorageBoundary } from "@/components/shared/ResumeStorageBoundary";

export function Providers({
  children,
  forcedTheme,
}: {
  children: React.ReactNode;
  forcedTheme?: "light";
}) {
  const locale = useLocale();

  return (
    <HeroUIProvider locale={locale}>
      <ThemeProvider
        forcedTheme={forcedTheme}
      >
        <ResumeStorageBoundary>{children}</ResumeStorageBoundary>
      </ThemeProvider>
    </HeroUIProvider>
  );
}
