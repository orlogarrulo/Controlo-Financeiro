import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppShell } from "@/components/layout";
import { OperatorGate } from "@/components/operator-gate";
import { HydrateStore } from "@/components/hydrate-store";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Controlo Financeiro · École Consulaire";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#1F5C4A" },
      {
        name: "description",
        content:
          "Centro financeiro da École Consulaire du Congo de Luanda — lançamentos, propinas, cartão BAI e captura por foto.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;1,400&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="pt" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <HydrateStore />
          <OperatorGate>
            <AppShell>
              <Outlet />
            </AppShell>
          </OperatorGate>
          <Toaster position="top-center" richColors />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
