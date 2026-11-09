import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { PublisherDetail } from "./pages/PublisherDetail.tsx";
import { PublishersList } from "./pages/PublishersList.tsx";
import { SoftwareDetail } from "./pages/SoftwareDetail.tsx";
import { SoftwareList } from "./pages/SoftwareList.tsx";
import "./styles.css";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/software" replace /> },
      { path: "software", element: <SoftwareList /> },
      { path: "software/:id", element: <SoftwareDetail /> },
      { path: "publishers", element: <PublishersList /> },
      { path: "publishers/:id", element: <PublisherDetail /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
