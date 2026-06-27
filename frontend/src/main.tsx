import React from "react";
import { createRoot } from "react-dom/client";

// Mantine styles. Add the others (dropzone/charts/dates) when a page uses them:
//   import "@mantine/dropzone/styles.css";
//   import "@mantine/charts/styles.css";
//   import "@mantine/dates/styles.css";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./app/index.css";

import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { theme } from "./theme";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
