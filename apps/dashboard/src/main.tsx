import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { DashboardLayout, PublicLayout } from "./components/Layout.tsx";
import { AuthProvider } from "./lib/auth.tsx";
import { Home } from "./pages/public/Home.tsx";
import { Login, LoginVerify } from "./pages/public/Login.tsx";
import { OnboardingConfirm } from "./pages/public/OnboardingConfirm.tsx";
import { ThirdPartyRequest } from "./pages/public/ThirdPartyRequest.tsx";
import "./styles.css";

// L'area riservata (con @simple-table/react) si carica a parte: chi apre l'onboarding
// pubblico scarica solo le pagine pubbliche.
// Area pubblica (onboarding, terze parti, accesso) e area riservata sotto /dashboard.
// Le pagine di modifica sono solo per gli ADMIN: l'API rifiuta comunque le scritture dei VIEWER.
const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "terze-parti", element: <ThirdPartyRequest /> },
      { path: "onboarding/conferma", element: <OnboardingConfirm /> },
      { path: "accesso", element: <Login /> },
      { path: "accesso/verifica", element: <LoginVerify /> },
    ],
  },
  {
    path: "dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("./pages/Overview.tsx")).Overview }) },
      { path: "software", lazy: async () => ({ Component: (await import("./pages/SoftwareList.tsx")).SoftwareList }) },
      { path: "software/terze-parti", lazy: async () => ({ Component: (await import("./pages/ThirdPartyNew.tsx")).ThirdPartyNew }) },
      { path: "software/:id", lazy: async () => ({ Component: (await import("./pages/SoftwareDetail.tsx")).SoftwareDetail }) },
      { path: "software/:id/modifica", lazy: async () => ({ Component: (await import("./pages/SoftwareEdit.tsx")).SoftwareEdit }) },
      { path: "publishers", lazy: async () => ({ Component: (await import("./pages/PublishersList.tsx")).PublishersList }) },
      { path: "publishers/nuova", lazy: async () => ({ Component: (await import("./pages/PublisherForm.tsx")).PublisherForm }) },
      { path: "publishers/:id", lazy: async () => ({ Component: (await import("./pages/PublisherDetail.tsx")).PublisherDetail }) },
      { path: "publishers/:id/modifica", lazy: async () => ({ Component: (await import("./pages/PublisherForm.tsx")).PublisherForm }) },
      { path: "richieste", lazy: async () => ({ Component: (await import("./pages/Requests.tsx")).Requests }) },
    ],
  },
  // Vecchi percorsi della dashboard, prima dell'area /dashboard
  { path: "software/*", element: <Navigate to="/dashboard/software" replace /> },
  { path: "publishers/*", element: <Navigate to="/dashboard/publishers" replace /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
